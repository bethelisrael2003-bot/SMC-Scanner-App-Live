import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { spawn } from "child_process";
import mongoose from "mongoose";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Global State
let cachedScanResults: any[] = [];
let lastScanTimeFull = "";
let isScanningBackground = false;
let lastAutoScannerStatus = { lastScanTime: "", isScanning: false, message: "Initialized", pairsChecked: [] };

// MongoDB Connection
async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.error("[CRITICAL] MONGODB_URI missing!");
    return false;
  }
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("[SUCCESS] MongoDB connected.");
    return true;
  } catch (err) {
    console.error("[ERROR] MongoDB connection fail:", err);
    return false;
  }
}

// Schemas
const tradeSchema = new mongoose.Schema({
  pair: String, direction: String, entry: Number, sl: Number, tp1: Number, tp2: Number, tp3: Number, rr: Number,
  timestamp: { type: Date, default: Date.now }, status: { type: String, default: "Open" }, grade: String, id: String
});
const signalSchema = new mongoose.Schema({
  pair: String,
  direction: String,
  grade: String,
  timestamp: { type: Date, default: Date.now },
  entryPrice: Number,
  sl: Number,
  tp1: Number,
  tp2: Number,
  tp3: Number,
  bonuses: Number,
  session: String,
  id: String
});
const scanCacheSchema = new mongoose.Schema({
  pair: String, result: Object, timestamp: { type: Date, default: Date.now }
});

const Trade = mongoose.model("Trade", tradeSchema);
const Signal = mongoose.model("Signal", signalSchema);
const ScanCache = mongoose.model("ScanCache", scanCacheSchema);

// Capital.com Constants
const EPICS: Record<string, string> = {
  "EUR/USD": "EURUSD", "GBP/USD": "GBPUSD", "USD/JPY": "USDJPY", "USD/CHF": "USDCHF",
  "USD/CAD": "USDCAD", "AUD/USD": "AUDUSD", "NZD/USD": "NZDUSD", "GBP/JPY": "GBPJPY",
  "EUR/JPY": "EURJPY", "XAU/USD": "GOLD", "XAG/USD": "SILVER",
};
const CAPITAL_REST_URL = "https://api-capital.backend-capital.com/api/v1";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getCapitalHeaders() {
  try {
    const res = await fetch(`${CAPITAL_REST_URL}/session`, {
      method: "POST",
      headers: { "X-CAP-API-KEY": process.env.CAPITAL_API_KEY || "e0o59JYjc0VLlQay", "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: process.env.CAPITAL_EMAIL || "betfintech@gmail.com", password: process.env.CAPITAL_PASSWORD || "Bios@2003" }),
    });
    if (!res.ok) return null;
    return { "X-CAP-API-KEY": process.env.CAPITAL_API_KEY || "e0o59JYjc0VLlQay", "CST": res.headers.get("CST") || "", "X-SECURITY-TOKEN": res.headers.get("X-SECURITY-TOKEN") || "", "Accept": "application/json" };
  } catch (e) { return null; }
}

async function analyzePair(pair: string): Promise<any> {
  const result: any = { 
    pair, checks: ["Waiting for scan..."], passed: false, decision: "WAIT", price: 0, 
    grade: "-", bonuses: 0, bonus_list: [], live: { spread_pips: 0 }, 
    range_high: 0, range_low: 0, zone: "EQ",
    plan: { entry: 0, sl: 0, tp1: 0, tp2: 0, tp3: 0, rr: 0 } 
  };
  try {
    const headers = await getCapitalHeaders(); if (!headers) return result;
    const url = `${CAPITAL_REST_URL}/prices/${EPICS[pair]}?resolution=HOUR&max=2`;
    const res = await fetch(url, { headers });
    if (!res.ok) return result;
    const data = await res.json();
    if (!data?.prices?.length) return result;
    const p = data.prices[data.prices.length - 1];
    result.price = p.closePrice.bid;
    result.live.spread_pips = Number(((p.closePrice.ask - p.closePrice.bid) * (pair.includes("JPY") || pair.includes("XAU") ? 100 : 10000)).toFixed(1));
    result.checks = ["Price updated", `Spread: ${result.live.spread_pips} pips`];
    // In a real scan, the trend logic would be here. For fallback:
    result.passed = false; 
    result.decision = "WAIT";
  } catch (e) {}
  return result;
}

async function recordSignalIfNeeded(res: any) {
  if (!res?.passed) return;
  try {
    if (mongoose.connection.readyState !== 1) return;
    const existing = await Signal.findOne({ pair: res.pair, direction: res.decision, timestamp: { $gt: new Date(Date.now() - 3600000) } });
    if (existing) return;
    await Signal.create({ 
      pair: res.pair, direction: res.decision, grade: res.grade, 
      entryPrice: res.plan?.entry || 0, sl: res.plan?.sl || 0, 
      tp1: res.plan?.tp1 || 0, tp2: res.plan?.tp2 || 0, tp3: res.plan?.tp3 || 0,
      bonuses: res.bonuses || 0, session: "ACTIVE", id: `sig_${Date.now()}` 
    });
  } catch (err) { console.error("[ERROR] Signal log failed:", err); }
}

async function runBackgroundCycle() {
  if (isScanningBackground) return;
  isScanningBackground = true; lastAutoScannerStatus.isScanning = true;
  const pairs = Object.keys(EPICS);
  const currentResults: any[] = [];
  try {
    for (const pair of pairs) {
      const res = await analyzePair(pair);
      currentResults.push(res);
      if (mongoose.connection.readyState === 1) {
        await ScanCache.findOneAndUpdate({ pair }, { result: res, timestamp: new Date() }, { upsert: true });
      }
      if (res.passed) await recordSignalIfNeeded(res);
      await delay(1000);
    }
    cachedScanResults = currentResults;
    lastScanTimeFull = new Date().toISOString();
    lastAutoScannerStatus.lastScanTime = lastScanTimeFull;
    lastAutoScannerStatus.message = "Scan Success";
    lastAutoScannerStatus.pairsChecked = pairs as any;
  } catch (err) {
    lastAutoScannerStatus.message = "Scan Error";
  } finally { isScanningBackground = false; lastAutoScannerStatus.isScanning = false; }
}

setInterval(runBackgroundCycle, 180000);
setTimeout(runBackgroundCycle, 5000);

// API Routes
app.get("/api/signals", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.json([]);
    const signals = await Signal.find().sort({ timestamp: -1 }).limit(50).lean();
    res.json(signals || []);
  } catch (err) { res.json([]); }
});

app.get("/api/scanner/status", (req, res) => res.json(lastAutoScannerStatus));

app.get("/api/performance/stats", async (req, res) => {
  try {
    const stats = { winRate: 0, totalTrades: 0, totalClosed: 0, totalWins: 0, totalLosses: 0, sequence: [], trades: [] };
    if (mongoose.connection.readyState === 1) {
      const trades = await Signal.find().sort({ timestamp: -1 }).lean(); // Use Signal for dummy display if Trades empty
      stats.trades = (trades || []) as any;
      stats.totalTrades = trades.length;
    }
    res.json(stats);
  } catch (err) { res.json({ winRate: 0, totalTrades: 0, trades: [] }); }
});

app.post("/api/performance/enter", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) await Trade.create({ ...req.body, status: "Open" });
    res.json({ success: true });
  } catch (err) { res.json({ success: false }); }
});

// Admin Cleanup Endpoint
app.post("/api/admin/cleanup", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.status(500).json({ error: "DB not connected" });
    await Signal.deleteMany({});
    await Trade.deleteMany({});
    await ScanCache.deleteMany({});
    res.json({ success: true, message: "All signals, trades, and cache cleared." });
  } catch (err) { res.status(500).json({ error: (err as any).message }); }
});

app.get("/api/scan", async (req, res) => {
  try {
    let results = cachedScanResults;
    if (results.length === 0 && mongoose.connection.readyState === 1) {
      const dbResults = await ScanCache.find().lean();
      results = dbResults.map(d => d.result);
    }
    if (results.length === 0) {
      results = Object.keys(EPICS).map(pair => ({ 
        pair, checks: ["Waiting for first scan..."], passed: false, decision: "WAIT", price: 0, 
        grade: "-", bonuses: 0, bonus_list: [], live: { spread_pips: 0 }, 
        range_high: 0, range_low: 0, zone: "EQ", plan: null 
      }));
    }
    res.json({ 
      timestamp: lastScanTimeFull || new Date().toISOString(), 
      session: { session: "ACTIVE", canTrade: true, currentGmt: new Date().toISOString() }, 
      results: results || [], 
      passed_count: (results || []).filter(r => r && r.passed).length,
      conflicts: []
    });
  } catch (err) {
    res.json({ timestamp: new Date().toISOString(), session: { session: "ERROR", canTrade: false }, results: [], passed_count: 0, conflicts: [] });
  }
});

app.get("/api/news", (req, res) => res.json([]));

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(process.cwd(), "dist")));
  app.get("*", (req, res) => res.sendFile(path.join(process.cwd(), "dist", "index.html")));
}

async function startServer() {
  await connectToDatabase();
  app.listen(PORT, "0.0.0.0", () => console.log(`Server live on ${PORT}`));
}
startServer();
