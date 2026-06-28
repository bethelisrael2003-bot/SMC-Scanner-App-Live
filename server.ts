import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { spawn } from "child_process";
import mongoose from "mongoose";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// MongoDB Connection Helper
async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.error("[CRITICAL] MONGODB_URI is not defined in environment variables!");
    console.warn("[WARN] Persistence will not work. Database operations will fail.");
    return false;
  }

  try {
    console.log("[INFO] Attempting to connect to MongoDB Atlas...");
    // Removing deprecated options as they are default in Mongoose 6+
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    console.log("[SUCCESS] MongoDB connected successfully.");
    return true;
  } catch (err) {
    console.error("[ERROR] MongoDB connection failed:", err);
    return false;
  }
}

// MongoDB Schemas & Models
const tradeSchema = new mongoose.Schema({
  pair: String,
  direction: String,
  entry: Number,
  sl: Number,
  tp1: Number,
  tp2: Number,
  tp3: Number,
  rr: Number,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: "Open" },
  grade: String,
  id: String
});

const signalSchema = new mongoose.Schema({
  pair: String,
  direction: String,
  grade: String,
  timestamp: { type: Date, default: Date.now },
  entryPrice: Number,
  sl: Number,
  tp1: Number,
  id: String
});

const Trade = mongoose.model("Trade", tradeSchema);
const Signal = mongoose.model("Signal", signalSchema);

// Gemini API Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenAI(GEMINI_API_KEY);

// Capital.com Configuration
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY || "e0o59JYjc0VLlQay";
const CAPITAL_EMAIL = process.env.CAPITAL_EMAIL || "betfintech@gmail.com";
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD || "Bios@2003";
const CAPITAL_REST_URL = "https://api-capital.backend-capital.com/api/v1";

const EPICS: Record<string, string> = {
  "EUR/USD": "EURUSD",
  "GBP/USD": "GBPUSD",
  "USD/JPY": "USDJPY",
  "USD/CHF": "USDCHF",
  "USD/CAD": "USDCAD",
  "AUD/USD": "AUDUSD",
  "NZD/USD": "NZDUSD",
  "GBP/JPY": "GBPJPY",
  "EUR/JPY": "EURJPY",
  "XAU/USD": "GOLD",
  "XAG/USD": "SILVER",
};

const RESOLUTIONS: Record<string, string> = {
  "1min": "MINUTE",
  "15min": "MINUTE_15",
  "1h": "HOUR",
  "4h": "HOUR_4",
  "1day": "DAY",
  "1week": "WEEK",
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to call Python SMC Engine
async function runPythonScan(pair: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python3", ["smc_scanner_capital.py", pair]);
    let data = "";
    pythonProcess.stdout.on("data", (chunk) => {
      data += chunk.toString();
    });
    pythonProcess.stderr.on("data", (chunk) => {
      console.error(`Python Error: ${chunk}`);
    });
    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}`));
      } else {
        resolve(data);
      }
    });
  });
}

// Session Cache
let cstToken: string | null = null;
let xSecToken: string | null = null;
let lastAuthTime = 0;
const SESSION_TTL = 8 * 60 * 1000;
const SESSION_FILE = path.join(process.cwd(), "capital_session.json");

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      cstToken = data.cstToken || null;
      xSecToken = data.xSecToken || null;
      lastAuthTime = data.lastAuthTime || 0;
    }
  } catch (err) {}
}

function saveSession() {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ cstToken, xSecToken, lastAuthTime }), "utf-8");
  } catch (err) {}
}

loadSession();

let authPromise: Promise<boolean> | null = null;

async function authenticateCapital(): Promise<boolean> {
  const now = Date.now();
  if (cstToken && xSecToken && now - lastAuthTime < SESSION_TTL) return true;
  if (authPromise) return authPromise;

  authPromise = (async () => {
    try {
      const res = await fetchWithRetry(`${CAPITAL_REST_URL}/session`, {
        method: "POST",
        headers: { "X-CAP-API-KEY": CAPITAL_API_KEY, "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: CAPITAL_EMAIL, password: CAPITAL_PASSWORD }),
      });
      if (!res.ok) return false;
      cstToken = res.headers.get("CST") || res.headers.get("cst");
      xSecToken = res.headers.get("X-SECURITY-TOKEN") || res.headers.get("x-security-token");
      lastAuthTime = Date.now();
      if (cstToken && xSecToken) saveSession();
      return !!(cstToken && xSecToken);
    } catch (error) { return false; }
    finally { authPromise = null; }
  })();
  return authPromise;
}

async function fetchWithRetry(url: string, options: any, maxRetries = 5, initialDelay = 500): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);
      if (res.status === 401 && !url.includes("/session")) {
        cstToken = null; xSecToken = null; lastAuthTime = 0;
      }
      if (res.status === 429 && attempt < maxRetries) {
        attempt++;
        const backoff = initialDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.warn(`[WARN] Capital API 429 rate limit hit. Retrying attempt ${attempt}/${maxRetries} after ${Math.round(backoff)}ms... url: ${url}`);
        await delay(backoff);
        continue;
      }
      return res;
    } catch (error) {
      if (attempt < maxRetries) {
        attempt++;
        const backoff = initialDelay * Math.pow(2, attempt) + Math.random() * 105;
        console.warn(`[WARN] Connection issue with Capital. Retrying attempt ${attempt}/${maxRetries} after ${Math.round(backoff)}ms... error:`, error);
        await delay(backoff);
        continue;
      }
      throw error;
    }
  }
}

async function getCapitalHeaders() {
  await authenticateCapital();
  return { "X-CAP-API-KEY": CAPITAL_API_KEY, "CST": cstToken || "", "X-SECURITY-TOKEN": xSecToken || "", "Accept": "application/json" };
}

async function getLivePrice(pair: string) {
  const epic = EPICS[pair];
  if (!epic) return null;
  try {
    const headers = await getCapitalHeaders();
    const res = await fetchWithRetry(`${CAPITAL_REST_URL}/prices/${epic}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.prices?.length) return null;
    const p = data.prices[data.prices.length - 1];
    const bid = p.closePrice.bid;
    const ask = p.closePrice.ask;
    const rawSpread = ask - bid;
    let pipMult = 10000;
    if (pair.includes("XAU") || pair === "GOLD") pipMult = 10;
    else if (pair.includes("XAG") || pair === "SILVER") pipMult = 100;
    else if (pair.includes("JPY")) pipMult = 100;
    return { bid, ask, spread: Number(rawSpread.toFixed(5)), spread_pips: Number((rawSpread * pipMult).toFixed(1)), mid: Number(((bid + ask) / 2).toFixed(5)), time: p.snapshotTime || "" };
  } catch (error) { return null; }
}

async function getCandles(pair: string, timeframe = "1h", count = 120) {
  const epic = EPICS[pair];
  const resolution = RESOLUTIONS[timeframe];
  if (!epic || !resolution) return null;
  try {
    const headers = await getCapitalHeaders();
    const url = `${CAPITAL_REST_URL}/prices/${epic}?resolution=${resolution}&max=${count}`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.prices) return null;
    return data.prices.map((p: any) => ({ t: p.snapshotTime || "", o: p.openPrice.bid, h: p.highPrice.bid, l: p.lowPrice.bid, c: p.closePrice.bid }));
  } catch (error) { return null; }
}

function classifyTrend(candles: any[], lookback = 2) {
  const highs: any[] = []; const lows: any[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true; let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[i].h < candles[j].h) isHigh = false;
      if (candles[i].l > candles[j].l) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: candles[i].h, time: candles[i].t });
    if (isLow) lows.push({ index: i, price: candles[i].l, time: candles[i].t });
  }
  if (highs.length < 2 || lows.length < 2) return { trend: "UNCLEAR", highs, lows };
  const sh = highs.slice(-2); const sl = lows.slice(-2);
  if (sh[1].price > sh[0].price && sl[1].price > sl[0].price) return { trend: "BULLISH", highs, lows };
  if (sh[1].price < sh[0].price && sl[1].price < sl[0].price) return { trend: "BEARISH", highs, lows };
  return { trend: "RANGE", highs, lows };
}

function checkSessionStatus() {
  const now = new Date(); const hour = now.getUTCHours();
  if (hour >= 7 && hour < 10) return { session: "LONDON_KZ", canTrade: true, currentGmt: now.toISOString() };
  if (hour >= 12 && hour < 16) return { session: "NY_OVERLAP", canTrade: true, currentGmt: now.toISOString() };
  return { session: "OFF_HOURS", canTrade: false, currentGmt: now.toISOString() };
}

async function analyzePair(pair: string, bypassCache = false): Promise<any> {
  const result: any = { pair, checks: [], passed: false, decision: "WAIT", grade: "-", bonuses: 0, plan: null };
  try {
    const weekly = await getCandles(pair, "1week", 30); await delay(500);
    const daily = await getCandles(pair, "1day", 100); await delay(500);
    const h1 = await getCandles(pair, "1h", 120); await delay(500);
    const m15 = await getCandles(pair, "15min", 120); await delay(500);
    if (!h1 || h1.length < 20) return result;
    const h1Trend = classifyTrend([...h1].reverse(), 2).trend;
    const live = await getLivePrice(pair); await delay(500);
    const last = live ? live.mid : h1[h1.length - 1].c;
    result.price = last; result.passed = h1Trend !== "RANGE" && h1Trend !== "UNCLEAR"; result.decision = h1Trend === "BULLISH" ? "BUY" : "SELL";
    result.plan = { entry: last, sl: last * 0.99, tp1: last * 1.02, rr: 2 };
  } catch (e) { console.error(`[ERROR] Error analyzing ${pair}:`, e); }
  return result;
}

async function recordSignalIfNeeded(res: any) {
  if (!res?.passed) return;
  try {
    const existing = await Signal.findOne({ pair: res.pair, direction: res.decision, timestamp: { $gt: new Date(Date.now() - 900000) } });
    if (existing) return;
    await Signal.create({ pair: res.pair, direction: res.decision, grade: res.grade, entryPrice: res.plan.entry, sl: res.plan.sl, tp1: res.plan.tp1, id: `sig_${Date.now()}` });
  } catch (err) {
    console.error("[ERROR] Failed to record signal in MongoDB:", err);
  }
}

let isScanningBackground = false;
let lastAutoScannerStatus = { lastScanTime: "", isScanning: false, message: "Initialized" };

async function runBackgroundCycle() {
  if (isScanningBackground) return;
  isScanningBackground = true; lastAutoScannerStatus.isScanning = true;
  try {
    const session = checkSessionStatus();
    const pairs = Object.keys(EPICS);
    for (const pair of pairs) {
      const res = await analyzePair(pair, true);
      if (res.passed) await recordSignalIfNeeded(res);
      await delay(1000);
    }
    lastAutoScannerStatus.lastScanTime = new Date().toISOString(); lastAutoScannerStatus.message = "Scan completed";
  } catch (err) {
    console.error("[ERROR] Background cycle failed:", err);
  } finally { isScanningBackground = false; lastAutoScannerStatus.isScanning = false; }
}

app.use(express.json());

app.get("/api/signals", async (req, res) => {
  try {
    const signals = await Signal.find().sort({ timestamp: -1 }).limit(50);
    res.json(signals);
  } catch (err) {
    res.status(500).json({ error: "DB Error" });
  }
});

app.get("/api/scanner/status", (req, res) => res.json(lastAutoScannerStatus));

app.get("/api/performance/stats", async (req, res) => {
  try {
    const trades = await Trade.find().sort({ timestamp: -1 });
    res.json({ winRate: 0, totalTrades: trades.length, trades });
  } catch (err) {
    res.status(500).json({ error: "DB Error" });
  }
});

app.post("/api/performance/enter", async (req, res) => {
  try {
    await Trade.create({ ...req.body, status: "Open" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "DB Error" });
  }
});

app.get("/api/scan", async (req, res) => {
  const pairs = Object.keys(EPICS); const results = [];
  const session = checkSessionStatus();
  for (const pair of pairs) { results.push(await analyzePair(pair, req.query.force === "true")); await delay(1000); }
  res.json({ timestamp: new Date().toISOString(), session, results });
});

async function startServer() {
  // 1. Connect to Database FIRST
  const isConnected = await connectToDatabase();
  
  if (!isConnected) {
    console.warn("[CRITICAL] Starting server WITHOUT active MongoDB connection. Database features will fail.");
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(process.cwd(), "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SUCCESS] SMC Scanner Server running on port ${PORT}`);
    console.log(`[STATUS] MongoDB Status: ${mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED"}`);
    
    // Start background tasks ONLY if connected or if you want to risk it
    setInterval(runBackgroundCycle, 120000);
    setTimeout(runBackgroundCycle, 5000);
  });
}

startServer();
