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

// Global Cache for Scan Results (Fallback if DB is slow)
let cachedScanResults: any[] = [];
let lastScanTimeFull = "";

// MongoDB Connection Helper
async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.error("[CRITICAL] MONGODB_URI is not defined!");
    return false;
  }
  try {
    console.log("[INFO] Attempting to connect to MongoDB Atlas...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("[SUCCESS] MongoDB connected successfully.");
    return true;
  } catch (err) {
    console.error("[ERROR] MongoDB connection failed:", err);
    return false;
  }
}

// MongoDB Schemas
const tradeSchema = new mongoose.Schema({
  pair: String, direction: String, entry: Number, sl: Number, tp1: Number, tp2: Number, tp3: Number, rr: Number,
  timestamp: { type: Date, default: Date.now }, status: { type: String, default: "Open" }, grade: String, id: String
});

const signalSchema = new mongoose.Schema({
  pair: String, direction: String, grade: String, timestamp: { type: Date, default: Date.now },
  entryPrice: Number, sl: Number, tp1: Number, id: String
});

// Scan Result Cache Schema to prevent timeouts on /api/scan
const scanCacheSchema = new mongoose.Schema({
  pair: String, result: Object, timestamp: { type: Date, default: Date.now }
});

const Trade = mongoose.model("Trade", tradeSchema);
const Signal = mongoose.model("Signal", signalSchema);
const ScanCache = mongoose.model("ScanCache", scanCacheSchema);

// Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenAI(GEMINI_API_KEY);

// Capital.com Config
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY || "e0o59JYjc0VLlQay";
const CAPITAL_EMAIL = process.env.CAPITAL_EMAIL || "betfintech@gmail.com";
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD || "Bios@2003";
const CAPITAL_REST_URL = "https://api-capital.backend-capital.com/api/v1";

const EPICS: Record<string, string> = {
  "EUR/USD": "EURUSD", "GBP/USD": "GBPUSD", "USD/JPY": "USDJPY", "USD/CHF": "USDCHF",
  "USD/CAD": "USDCAD", "AUD/USD": "AUDUSD", "NZD/USD": "NZDUSD", "GBP/JPY": "GBPJPY",
  "EUR/JPY": "EURJPY", "XAU/USD": "GOLD", "XAG/USD": "SILVER",
};

const RESOLUTIONS: Record<string, string> = {
  "1min": "MINUTE", "15min": "MINUTE_15", "1h": "HOUR", "4h": "HOUR_4", "1day": "DAY", "1week": "WEEK",
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: any, maxRetries = 3, initialDelay = 500): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && attempt < maxRetries) {
        attempt++;
        const backoff = initialDelay * Math.pow(2, attempt);
        await delay(backoff);
        continue;
      }
      return res;
    } catch (error) {
      if (attempt < maxRetries) {
        attempt++;
        await delay(initialDelay * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
}

async function getCapitalHeaders() {
  try {
    const res = await fetchWithRetry(`${CAPITAL_REST_URL}/session`, {
      method: "POST",
      headers: { "X-CAP-API-KEY": CAPITAL_API_KEY, "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: CAPITAL_EMAIL, password: CAPITAL_PASSWORD }),
    });
    const cst = res.headers.get("CST") || "";
    const xsec = res.headers.get("X-SECURITY-TOKEN") || "";
    return { "X-CAP-API-KEY": CAPITAL_API_KEY, "CST": cst, "X-SECURITY-TOKEN": xsec, "Accept": "application/json" };
  } catch (e) { return null; }
}

async function getLivePrice(pair: string, headers: any) {
  const epic = EPICS[pair]; if (!epic || !headers) return null;
  try {
    const res = await fetchWithRetry(`${CAPITAL_REST_URL}/prices/${epic}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.prices?.length) return null;
    const p = data.prices[data.prices.length - 1];
    const bid = p.closePrice.bid; const ask = p.closePrice.ask;
    return { bid, ask, mid: Number(((bid + ask) / 2).toFixed(5)), spread_pips: Number(((ask - bid) * (pair.includes("JPY") || pair.includes("XAU") ? 100 : 10000)).toFixed(1)) };
  } catch (e) { return null; }
}

async function getCandles(pair: string, timeframe: string, headers: any) {
  const epic = EPICS[pair]; const res_map = RESOLUTIONS[timeframe]; if (!epic || !res_map || !headers) return null;
  try {
    const url = `${CAPITAL_REST_URL}/prices/${epic}?resolution=${res_map}&max=120`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.prices?.map((p: any) => ({ t: p.snapshotTime, o: p.openPrice.bid, h: p.highPrice.bid, l: p.lowPrice.bid, c: p.closePrice.bid })) || null;
  } catch (e) { return null; }
}

function classifyTrend(candles: any[]) {
  if (candles.length < 10) return "UNCLEAR";
  const c = candles.slice(-10);
  const up = c.filter((curr, i) => i > 0 && curr.c > c[i - 1].c).length;
  if (up >= 7) return "BULLISH";
  if (up <= 3) return "BEARISH";
  return "RANGE";
}

function checkSessionStatus() {
  const now = new Date(); const hour = now.getUTCHours();
  const canTrade = (hour >= 7 && hour < 10) || (hour >= 12 && hour < 16);
  return { session: canTrade ? "ACTIVE" : "OFF_HOURS", canTrade, currentGmt: now.toISOString() };
}

async function analyzePair(pair: string): Promise<any> {
  const result: any = { pair, checks: ["Analyzing..."], passed: false, decision: "WAIT", price: 0, grade: "C", bonuses: 0, plan: { entry: 0, sl: 0, tp1: 0, rr: 0 } };
  try {
    const headers = await getCapitalHeaders(); if (!headers) throw new Error("Auth Fail");
    const h1 = await getCandles(pair, "1h", headers); await delay(300);
    const live = await getLivePrice(pair, headers);
    if (!h1 || !live) throw new Error("Data Fail");
    const trend = classifyTrend(h1);
    result.price = live.mid;
    result.passed = trend !== "RANGE";
    result.decision = trend === "BULLISH" ? "BUY" : trend === "BEARISH" ? "SELL" : "WAIT";
    result.plan = { entry: live.mid, sl: trend === "BULLISH" ? live.mid * 0.995 : live.mid * 1.005, tp1: trend === "BULLISH" ? live.mid * 1.01 : live.mid * 0.99, rr: 2 };
    result.checks = [`Trend: ${trend}`, `Spread: ${live.spread_pips} pips`];
  } catch (e: any) { result.checks = [`Error: ${e.message}`]; }
  return result;
}

// Background Task
let lastAutoScannerStatus = { lastScanTime: "", isScanning: false, message: "Initialized" };

async function runBackgroundCycle() {
  if (isScanningBackground) return;
  isScanningBackground = true; lastAutoScannerStatus.isScanning = true;
  console.log("[INFO] Starting background scan...");
  try {
    const pairs = Object.keys(EPICS);
    const results = [];
    for (const pair of pairs) {
      const res = await analyzePair(pair);
      results.push(res);
      // Save each result to MongoDB Cache
      if (mongoose.connection.readyState === 1) {
        await ScanCache.findOneAndUpdate({ pair }, { result: res, timestamp: new Date() }, { upsert: true });
      }
      if (res.passed) {
        const existing = await Signal.findOne({ pair: res.pair, direction: res.decision, timestamp: { $gt: new Date(Date.now() - 3600000) } });
        if (!existing) await Signal.create({ pair: res.pair, direction: res.decision, grade: res.grade, entryPrice: res.plan.entry, sl: res.plan.sl, tp1: res.plan.tp1, id: `sig_${Date.now()}` });
      }
      await delay(1000);
    }
    cachedScanResults = results;
    lastScanTimeFull = new Date().toISOString();
    lastAutoScannerStatus.lastScanTime = lastScanTimeFull;
    lastAutoScannerStatus.message = "Scan completed successfully";
  } catch (err) {
    console.error("[ERROR] Background scan failed:", err);
    lastAutoScannerStatus.message = "Scan failed";
  } finally {
    isScanningBackground = false; lastAutoScannerStatus.isScanning = false;
  }
}

let isScanningBackground = false;
setInterval(runBackgroundCycle, 180000); // 3 minutes
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
    if (mongoose.connection.readyState !== 1) return res.json({ winRate: 0, totalTrades: 0, trades: [] });
    const trades = await Trade.find().sort({ timestamp: -1 }).lean();
    res.json({ winRate: 0, totalTrades: trades.length, trades: trades || [] });
  } catch (err) { res.json({ winRate: 0, totalTrades: 0, trades: [] }); }
});

app.post("/api/performance/enter", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) await Trade.create({ ...req.body, status: "Open" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/scan", async (req, res) => {
  try {
    // Return cached results immediately to avoid Render timeout
    let results = cachedScanResults;
    if (results.length === 0 && mongoose.connection.readyState === 1) {
      const dbResults = await ScanCache.find().lean();
      results = dbResults.map(d => d.result);
    }
    // If still empty, return dummy data for each pair so frontend doesn't turn white
    if (results.length === 0) {
      results = Object.keys(EPICS).map(pair => ({ pair, checks: ["Waiting for first scan..."], passed: false, decision: "WAIT", price: 0, grade: "-", bonuses: 0, plan: null }));
    }
    res.json({ timestamp: lastScanTimeFull || new Date().toISOString(), session: checkSessionStatus(), results, passed_count: results.filter(r => r.passed).length });
  } catch (err) {
    res.status(500).json({ error: "Internal Error" });
  }
});

app.get("/api/news", (req, res) => res.json([]));

// Production Build
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(process.cwd(), "dist")));
  app.get("*", (req, res) => res.sendFile(path.join(process.cwd(), "dist", "index.html")));
}

async function startServer() {
  await connectToDatabase();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SUCCESS] SMC Scanner Server running on port ${PORT}`);
  });
}
startServer();
