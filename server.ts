import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

// Simple In-Memory and Disk-Persisted Cache for Capital.com Session
let cstToken: string | null = null;
let xSecToken: string | null = null;
let lastAuthTime = 0;
const SESSION_TTL = 8 * 60 * 1000; // 8 minutes in ms
const SESSION_FILE = path.join(process.cwd(), "capital_session.json");

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
      cstToken = data.cstToken || null;
      xSecToken = data.xSecToken || null;
      lastAuthTime = data.lastAuthTime || 0;
      console.log(`[INFO] Loaded persisted Capital.com session from disk. (Age: ${Math.round((Date.now() - lastAuthTime) / 1000)}s)`);
    }
  } catch (err) {
    console.warn("[WARN] Failed to load persisted Capital session:", err);
  }
}

function saveSession() {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({
      cstToken,
      xSecToken,
      lastAuthTime,
    }), "utf-8");
    console.log("[INFO] Persisted Capital.com session to disk.");
  } catch (err) {
    console.warn("[WARN] Failed to persist Capital session:", err);
  }
}

loadSession();

let authPromise: Promise<boolean> | null = null;

async function authenticateCapital(): Promise<boolean> {
  const now = Date.now();
  if (cstToken && xSecToken && now - lastAuthTime < SESSION_TTL) {
    return true;
  }

  if (authPromise) {
    return authPromise;
  }

  authPromise = (async () => {
    try {
      console.log("[INFO] Authenticating with Capital.com API...");
      const res = await fetchWithRetry(`${CAPITAL_REST_URL}/session`, {
        method: "POST",
        headers: {
          "X-CAP-API-KEY": CAPITAL_API_KEY,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: CAPITAL_EMAIL,
          password: CAPITAL_PASSWORD,
        }),
      });

      if (!res.ok) {
        console.error(`Capital auth failed with status ${res.status}`);
        return false;
      }

      cstToken = res.headers.get("CST") || res.headers.get("cst");
      xSecToken = res.headers.get("X-SECURITY-TOKEN") || res.headers.get("x-security-token");
      lastAuthTime = Date.now();

      const success = !!(cstToken && xSecToken);
      if (success) {
        saveSession();
      }
      return success;
    } catch (error) {
      console.error("Error authenticating with Capital:", error);
      return false;
    } finally {
      authPromise = null;
    }
  })();

  return authPromise;
}

async function fetchWithRetry(url: string, options: any, maxRetries = 5, initialDelay = 500): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);

      if (res.status === 401 && !url.includes("/session")) {
        console.warn("[WARN] Capital API returned 401 Unauthorized. Session expired. Clearing tokens.");
        cstToken = null;
        xSecToken = null;
        lastAuthTime = 0;
        try {
          if (fs.existsSync(SESSION_FILE)) {
            fs.unlinkSync(SESSION_FILE);
          }
        } catch {}
      }

      if (res.status === 429 && attempt < maxRetries) {
        attempt++;
        const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.warn(`[WARN] Capital API 429 rate limit hit. Retrying attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms... url: ${url}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return res;
    } catch (error) {
      if (attempt < maxRetries) {
        attempt++;
        const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 105;
        console.warn(`[WARN] Connection issue with Capital. Retrying attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms... error:`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

async function getCapitalHeaders() {
  await authenticateCapital();
  return {
    "X-CAP-API-KEY": CAPITAL_API_KEY,
    "CST": cstToken || "",
    "X-SECURITY-TOKEN": xSecToken || "",
    "Accept": "application/json",
  };
}

async function getLivePrice(pair: string) {
  const epic = EPICS[pair];
  if (!epic) return null;

  try {
    const headers = await getCapitalHeaders();
    const res = await fetchWithRetry(`${CAPITAL_REST_URL}/prices/${epic}`, { headers });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !data.prices || data.prices.length === 0) return null;

    const p = data.prices[data.prices.length - 1];
    const bid = p.closePrice.bid;
    const ask = p.closePrice.ask;
    const rawSpread = ask - bid;

    let pipMult = 10000;
    if (pair.includes("XAU") || pair === "GOLD") {
      pipMult = 10;
    } else if (pair.includes("XAG") || pair === "SILVER") {
      pipMult = 100;
    } else if (pair.includes("JPY")) {
      pipMult = 100;
    }

    return {
      bid,
      ask,
      spread: Number(rawSpread.toFixed(5)),
      spread_pips: Number((rawSpread * pipMult).toFixed(1)),
      mid: Number(((bid + ask) / 2).toFixed(5)),
      time: p.snapshotTime || "",
    };
  } catch (error) {
    console.error(`Error getting live price for ${pair}:`, error);
    return null;
  }
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
    if (!data || !data.prices) return null;

    const candles = data.prices.map((p: any) => ({
      t: p.snapshotTime || "",
      o: p.openPrice.bid,
      h: p.highPrice.bid,
      l: p.lowPrice.bid,
      c: p.closePrice.bid,
    }));

    return candles; 
  } catch (error) {
    console.error(`Error getting candles for ${pair}:`, error);
    return null;
  }
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const sum = closes.slice(-period).reduce((acc, val) => acc + val, 0);
  return sum / period;
}

function ema(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k);
  }
  return val;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const d: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    d.push(closes[i] - closes[i - 1]);
  }
  const gains = d.map(v => (v > 0 ? v : 0));
  const losses = d.map(v => (v < 0 ? -v : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < d.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(candles: any[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].h;
    const l = candles[i].l;
    const pc = candles[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function findSwings(candles: any[], lookback = 2) {
  const highs: any[] = [];
  const lows: any[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[i].h < candles[j].h) isHigh = false;
      if (candles[i].l > candles[j].l) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: candles[i].h, time: candles[i].t });
    if (isLow) lows.push({ index: i, price: candles[i].l, time: candles[i].t });
  }

  return { highs, lows };
}

function classifyTrend(candles: any[], lookback = 2) {
  const { highs, lows } = findSwings(candles, lookback);
  if (highs.length < 2 || lows.length < 2) return { trend: "UNCLEAR", highs, lows };

  const sh = highs.slice(-2);
  const sl = lows.slice(-2);

  const hh = sh[1].price > sh[0].price;
  const hl = sl[1].price > sl[0].price;
  const lh = sh[1].price < sh[0].price;
  const ll = sl[1].price < sl[0].price;

  if (hh && hl) return { trend: "BULLISH", highs, lows };
  if (lh && ll) return { trend: "BEARISH", highs, lows };
  return { trend: "RANGE", highs, lows };
}

function detectStructureBreak(candles: any[], highs: any[], lows: any[], priorTrend: string) {
  if (highs.length === 0 || lows.length === 0) return null;

  const lastSH = highs[highs.length - 1].price;
  const lastSL = lows[lows.length - 1].price;

  const checkRange = Math.min(5, candles.length);
  const recent = candles.slice(-checkRange);

  for (const c of recent) {
    if (priorTrend === "BULLISH") {
      if (c.c < lastSL) {
        return { type: "CHOCH", detail: `Close ${c.c.toFixed(5)} below swing low ${lastSL.toFixed(5)}` };
      }
    } else if (priorTrend === "BEARISH") {
      if (c.c > lastSH) {
        return { type: "CHOCH", detail: `Close ${c.c.toFixed(5)} above swing high ${lastSH.toFixed(5)}` };
      }
    }

    if (c.c > lastSH && priorTrend === "BULLISH") {
      return { type: "BOS", detail: `Close ${c.c.toFixed(5)} above swing high ${lastSH.toFixed(5)}` };
    }
    if (c.c < lastSL && priorTrend === "BEARISH") {
      return { type: "BOS", detail: `Close ${c.c.toFixed(5)} below swing low ${lastSL.toFixed(5)}` };
    }
  }

  return null;
}

function getPremiumDiscount(candles: any[], atrVal: number, lookback = 50) {
  const recent = candles.slice(-Math.min(lookback, candles.length));
  const rHigh = Math.max(...recent.map(c => c.h));
  const rLow = Math.min(...recent.map(c => c.l));
  const rSize = rHigh - rLow;
  const last = candles[candles.length - 1].c;

  if (rSize < 1.5 * atrVal) {
    return { zone: "COMPRESSED", rHigh, rLow, pos: 0.5 };
  }

  const pos = (last - rLow) / rSize;
  let zone = "EQ";
  if (pos >= 0.70) {
    zone = "PREMIUM";
  } else if (pos <= 0.30) {
    zone = "DISCOUNT";
  }

  return { zone, rHigh, rLow, pos };
}

function findLiquidityPools(candles: any[], tolPct = 0.0015) {
  const pools: any[] = [];
  const last = candles[candles.length - 1].c;
  const window = candles.slice(-30);

  const highs = window.map((c, i) => ({ i, h: c.h, t: c.t }));
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].h - highs[j].h) / highs[i].h < tolPct) {
        const level = (highs[i].h + highs[j].h) / 2;
        if (level > last) {
          pools.push({ level, side: "BUY", source: "equal_high", time: window[i].t });
          break;
        }
      }
    }
  }

  const lows = window.map((c, i) => ({ i, l: c.l, t: c.t }));
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].l - lows[j].l) / lows[i].l < tolPct) {
        const level = (lows[i].l + lows[j].l) / 2;
        if (level < last) {
          pools.push({ level, side: "SELL", source: "equal_low", time: window[i].t });
          break;
        }
      }
    }
  }

  if (candles.length >= 48) {
    const dayAgo = candles.slice(-24, -1);
    const pdh = Math.max(...dayAgo.map(c => c.h));
    const pdl = Math.min(...dayAgo.map(c => c.l));
    if (pdh > last) {
      pools.push({ level: pdh, side: "BUY", source: "prev_day_high" });
    }
    if (pdl < last) {
      pools.push({ level: pdl, side: "SELL", source: "prev_day_low" });
    }
  }

  const sessionWindow = candles.slice(-12);
  const sh = Math.max(...sessionWindow.map(c => c.h));
  const sl = Math.min(...sessionWindow.map(c => c.l));
  if (sh > last) {
    pools.push({ level: sh, side: "BUY", source: "session_high" });
  }
  if (sl < last) {
    pools.push({ level: sl, side: "SELL", source: "session_low" });
  }

  const buyPools = pools.filter(p => p.side === "BUY").sort((a, b) => a.level - b.level);
  const sellPools = pools.filter(p => p.side === "SELL").sort((a, b) => b.level - a.level);

  return { buyPools: buyPools.slice(0, 2), sellPools: sellPools.slice(0, 2) };
}

function detectSweep(candles: any[], pool: any, lookback = 5) {
  const level = pool.level;
  const side = pool.side;
  const tol = level * 0.0008;

  const recent = candles.slice(-Math.min(lookback, candles.length));
  for (const c of recent) {
    if (side === "BUY") {
      if (c.h > level + tol && c.c < level) {
        return { swept: true, detail: `Wicked to ${c.h.toFixed(5)}, closed ${c.c.toFixed(5)} below pool ${level.toFixed(5)}` };
      }
    } else {
      if (c.l < level - tol && c.c > level) {
        return { swept: true, detail: `Wicked to ${c.l.toFixed(5)}, closed ${c.c.toFixed(5)} above pool ${level.toFixed(5)}` };
      }
    }
  }
  return { swept: false, detail: "" };
}

function findOrderBlock(candles: any[], trend: string, atrVal: number) {
  if (trend !== "BULLISH" && trend !== "BEARISH") return null;

  const searchStart = Math.max(0, candles.length - 40);

  for (let i = candles.length - 3; i > searchStart; i--) {
    const c = candles[i];

    if (trend === "BULLISH") {
      if (c.c >= c.o) continue;
      const impulse = candles.slice(i + 1, i + 4);
      if (impulse.length < 2) continue;
      const move = impulse.reduce((acc, x) => acc + (x.c - x.o), 0);
      const dispAtr = move / atrVal;
      const allBull = impulse.every(x => x.c > x.o);
      const strongBodies = impulse.every(x => (x.c - x.o) / Math.max(x.h - x.l, 1e-10) > 0.6);

      if (move >= 1.5 * atrVal && allBull) {
        return {
          type: "BULLISH_OB",
          direction: "BUY",
          high: c.h,
          low: c.l,
          open: c.o,
          close: c.c,
          index: i,
          time: c.t,
          displacement: move,
          disp_atr: Number(dispAtr.toFixed(2)),
          strong_bodies: strongBodies,
          valid: dispAtr >= 1.5,
        };
      }
    } else {
      if (c.c <= c.o) continue;
      const impulse = candles.slice(i + 1, i + 4);
      if (impulse.length < 2) continue;
      const move = Math.abs(impulse.reduce((acc, x) => acc + (x.c - x.o), 0));
      const dispAtr = move / atrVal;
      const allBear = impulse.every(x => x.c < x.o);
      const strongBodies = impulse.every(x => Math.abs(x.c - x.o) / Math.max(x.h - x.l, 1e-10) > 0.6);

      if (move >= 1.5 * atrVal && allBear) {
        return {
          type: "BEARISH_OB",
          direction: "SELL",
          high: c.h,
          low: c.l,
          open: c.o,
          close: c.c,
          index: i,
          time: c.t,
          displacement: move,
          disp_atr: Number(dispAtr.toFixed(2)),
          strong_bodies: strongBodies,
          valid: dispAtr >= 1.5,
        };
      }
    }
  }

  return null;
}

function findFVG(candles: any[], trend: string) {
  const fvgs: any[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    if (trend !== "BEARISH" && candles[i - 1].l > candles[i + 1].h) {
      fvgs.push({
        type: "BULLISH_FVG",
        direction: "BUY",
        top: candles[i - 1].l,
        bottom: candles[i + 1].h,
        index: i,
        time: candles[i].t,
        valid: true,
      });
    }
    if (trend !== "BULLISH" && candles[i - 1].h < candles[i + 1].l) {
      fvgs.push({
        type: "BEARISH_FVG",
        direction: "SELL",
        top: candles[i + 1].l,
        bottom: candles[i - 1].h,
        index: i,
        time: candles[i].t,
        valid: true,
      });
    }
  }
  return fvgs.slice(-3);
}

function checkPoiFreshness(candles: any[], poi: any) {
  const idx = poi.index + 1;
  const high = poi.high || poi.top;
  const low = poi.low || poi.bottom;
  let touches = 0;

  for (let i = idx; i < candles.length; i++) {
    const c = candles[i];
    if (c.l <= high && c.h >= low) {
      touches++;
      if (poi.direction === "BUY" && c.c < low) return "DEAD";
      if (poi.direction === "SELL" && c.c > high) return "DEAD";
      if (touches > 1) return "DEAD";
    }
  }

  return touches === 0 ? "FRESH" : "USED";
}

function checkEntryCandle(candles: any[], direction: "BUY" | "SELL") {
  if (candles.length < 2) return { valid: false, reason: "Insufficient data" };
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const body = Math.abs(curr.c - curr.o);
  const rng = curr.h - curr.l;
  if (rng === 0) return { valid: false, reason: "Zero range candle" };
  const bodyRatio = body / rng;

  if (direction === "BUY") {
    if (curr.c <= curr.o) {
      if (prev.c < prev.o && curr.c > prev.o && curr.o < prev.c) {
        return { valid: true, reason: `Bullish engulfing (body ${(bodyRatio * 100).toFixed(0)}%)` };
      }
      return { valid: false, reason: `Bearish close in BUY setup` };
    }
    if (bodyRatio >= 0.6) return { valid: true, reason: `Strong bullish body (${(bodyRatio * 100).toFixed(0)}%)` };
    const lowerWick = Math.min(curr.o, curr.c) - curr.l;
    if (lowerWick > 0.5 * rng) return { valid: true, reason: `Lower wick rejection (${(lowerWick / rng * 100).toFixed(0)}%)` };
    return { valid: false, reason: `Weak bullish candle` };
  } else {
    if (curr.c >= curr.o) {
      if (prev.c > prev.o && curr.c < prev.o && curr.o > prev.c) {
        return { valid: true, reason: `Bearish engulfing (body ${(bodyRatio * 100).toFixed(0)}%)` };
      }
      return { valid: false, reason: `Bullish close in SELL setup` };
    }
    if (bodyRatio >= 0.6) return { valid: true, reason: `Strong bearish body (${(bodyRatio * 100).toFixed(0)}%)` };
    const upperWick = curr.h - Math.max(curr.o, curr.c);
    if (upperWick > 0.5 * rng) return { valid: true, reason: `Upper wick rejection (${(upperWick / rng * 100).toFixed(0)}%)` };
    return { valid: false, reason: `Weak bearish candle` };
  }
}

function checkMomentum(candles: any[], direction: "BUY" | "SELL", atrVal: number, lookback = 4) {
  const recent = candles.slice(-Math.min(lookback, candles.length));
  if (recent.length < 3) return { valid: false, detail: "Not enough candles" };
  let strongCount = 0;
  let cumulative = 0;
  for (const c of recent) {
    const body = Math.abs(c.c - c.o);
    const rng = c.h - c.l;
    const ratio = body / Math.max(rng, 1e-10);
    if (direction === "BUY" && c.c > c.o) {
      cumulative += c.c - c.o;
      if (ratio > 0.5) strongCount++;
    } else if (direction === "SELL" && c.c < c.o) {
      cumulative += c.o - c.c;
      if (ratio > 0.5) strongCount++;
    }
  }
  const cumAtr = cumulative / Math.max(atrVal, 1e-10);
  const strong = strongCount >= 3;
  const enough = cumulative >= atrVal;
  return { valid: strong || enough, detail: `${strongCount} strong candles, ${cumAtr.toFixed(1)}x ATR cumulative` };
}

function checkSessionStatus() {
  const now = new Date();
  const dow = now.getUTCDay();
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const lagosOffset = 1;
  const currentGmtStr = now.toISOString().substring(11, 16) + " UTC";
  if (dow === 6) return { session: "WEEKEND", message: "Saturday - market closed", canTrade: false, mondayReduced: false, currentGmt: currentGmtStr };
  if (dow === 0 && hour < 21) return { session: "WEEKEND", message: "Sunday - market closed until ~21:00 GMT", canTrade: false, mondayReduced: false, currentGmt: currentGmtStr };
  const mondayReduced = (dow === 1 && hour < 4);
  if (hour < 7) return { session: "ASIAN", message: "Asian session (00:00-07:00 GMT) - WAIT", canTrade: false, mondayReduced, currentGmt: currentGmtStr };
  if (hour >= 7 && hour < 10) return { session: "LONDON_KZ", message: "London Kill Zone (07:00-10:00 GMT) - HIGH PRIORITY", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  if (hour >= 10 && hour < 12) return { session: "MIDDAY", message: "Between London KZ and NY KZ - reduced priority", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  if (hour >= 12 && hour < 16) return { session: "NY_OVERLAP", message: "London/NY Overlap (12:00-16:00 GMT) - BEST SESSION", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  if (hour >= 16 && hour < 21) return { session: "LATE_NY", message: "Late NY - reduced priority", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  return { session: "OFF_HOURS", message: "Outside active sessions", canTrade: false, mondayReduced, currentGmt: currentGmtStr };
}

function verifySpread(pair: string, spreadPips: number) {
  if (pair.includes("XAU") || pair === "GOLD") {
    if (spreadPips > 50) return { status: "FAIL", message: `Spread ${spreadPips} pips (>50 - too wide for Gold)` };
    if (spreadPips > 30) return { status: "WARN", message: `Spread ${spreadPips} pips (>30 - reduce size)` };
    return { status: "PASS", message: `Spread ${spreadPips} pips (normal for Gold)` };
  }
  if (pair.includes("XAG") || pair === "SILVER") {
    if (spreadPips > 15) return { status: "FAIL", message: `Spread ${spreadPips} pips (>15 - too wide for Silver)` };
    if (spreadPips > 8) return { status: "WARN", message: `Spread ${spreadPips} pips (>8 - reduce size)` };
    return { status: "PASS", message: `Spread ${spreadPips} pips (normal for Silver)` };
  }
  if (spreadPips > 5) return { status: "FAIL", message: `Spread ${spreadPips} pips (>5 - too wide)` };
  if (spreadPips > 3) return { status: "WARN", message: `Spread ${spreadPips} pips (>3 - reduce size)` };
  return { status: "PASS", message: `Spread ${spreadPips} pips (normal)` };
}

const pairAnalysisCache: Record<string, { result: any; timestamp: number }> = {};

async function analyzePair(pair: string, bypassCache = false): Promise<any> {
  if (!bypassCache && pairAnalysisCache[pair]) {
    const age = Date.now() - pairAnalysisCache[pair].timestamp;
    if (age < 55000) return pairAnalysisCache[pair].result;
  }
  const cacheAndReturn = (res: any) => {
    pairAnalysisCache[pair] = { result: res, timestamp: Date.now() };
    return res;
  };
  const result: any = { pair, checks: [], passed: false, decision: "WAIT", grade: "-", bonuses: 0, bonus_list: [], plan: null };
  const weekly = await getCandles(pair, "1week", 30);
  const daily = await getCandles(pair, "1day", 100);
  const h4 = await getCandles(pair, "4h", 120);
  const h1 = await getCandles(pair, "1h", 120);
  const m15 = await getCandles(pair, "15min", 120);
  if (!h1 || h1.length < 20) { result.checks.push("Insufficient H1 data from Capital.com"); return cacheAndReturn(result); }
  const wOldest = weekly ? [...weekly].reverse() : null;
  const dOldest = daily ? [...daily].reverse() : null;
  const h4Oldest = h4 ? [...h4].reverse() : null;
  const h1Oldest = [...h1].reverse();
  const m15Oldest = m15 ? [...m15].reverse() : null;
  const live = await getLivePrice(pair);
  const last = live ? live.mid : h1Oldest[h1Oldest.length - 1].c;
  result.price = last; result.live = live;
  const hAtr = atr(h1Oldest, 14);
  if (!hAtr) { result.checks.push("Could not calculate H1 ATR"); return cacheAndReturn(result); }
  let isFailedSetup = false;
  if (live) {
    const spreadInfo = verifySpread(pair, live.spread_pips);
    const icon = spreadInfo.status === "PASS" ? "OK" : spreadInfo.status === "WARN" ? "!" : "X";
    result.checks.push(`[${icon}] Spread: ${live.spread_pips} pips`);
    if (spreadInfo.status === "FAIL") { result.checks.push("    -> WAIT (spread too wide)"); isFailedSetup = true; }
  }
  try {
    const newsEvents = await getEconomicNews();
    const currencies = pair.split("/");
    const d = new Date();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const gmtToday = `${mm}-${dd}-${yyyy}`;
    let hasHighImpactNews = false;
    let newsDetail = "";
    for (const e of newsEvents) {
      if (e.impact === "HIGH" && currencies.includes(e.currency)) {
        const eventDate = e.time.split(" ")[0];
        if (eventDate === gmtToday || e.time.includes(gmtToday)) { hasHighImpactNews = true; newsDetail = `${e.currency}: ${e.event}`; break; }
      }
    }
    if (hasHighImpactNews) { result.checks.push(`[X] News calendar check: High-impact event today (${newsDetail})`); isFailedSetup = true; }
    else { result.checks.push(`[OK] News calendar check: No overlapping high-impact events today`); }
  } catch (error) { result.checks.push(`[!] News calendar check: Temporarily unable to verify economic calendar`); }
  const h1TrendInfo = classifyTrend(h1Oldest, 2);
  const h1Trend = h1TrendInfo.trend;
  result.h1_trend = h1Trend;
  if (h1Trend === "RANGE" || h1Trend === "UNCLEAR") { result.checks.push(`[X] H1 Trend: ${h1Trend} (unclear structure)`); isFailedSetup = true; }
  else { result.checks.push(`[OK] H1 Trend: ${h1Trend}`); }
  let dTrend = "RANGE";
  if (dOldest && dOldest.length >= 20) dTrend = classifyTrend(dOldest, 2).trend;
  result.daily_trend = dTrend;
  if (dTrend !== "RANGE" && dTrend !== "UNCLEAR" && dTrend !== h1Trend) { result.checks.push(`[X] Daily Trend (${dTrend}) opposes H1 Trend (${h1Trend})`); isFailedSetup = true; }
  else { result.checks.push(`[OK] Daily: ${dTrend} aligned`); }
  const pdZone = getPremiumDiscount(h1Oldest, hAtr);
  result.zone = pdZone.zone; result.range_high = pdZone.rHigh; result.range_low = pdZone.rLow;
  if (pdZone.zone === "COMPRESSED") { result.checks.push(`[X] Range compressed (<1.5x ATR)`); isFailedSetup = true; }
  else if (pdZone.zone === "EQ") { result.checks.push(`[X] Location: EQ (${(pdZone.pos * 100).toFixed(0)}%) - middle zone`); isFailedSetup = true; }
  const direction = (pdZone.zone === "DISCOUNT" || pdZone.pos <= 0.5) ? "BUY" : "SELL";
  if (h1Trend === "BULLISH" && pdZone.zone === "PREMIUM") { result.checks.push(`[X] Bullish trend but in Premium (overbought)`); isFailedSetup = true; }
  else if (h1Trend === "BEARISH" && pdZone.zone === "DISCOUNT") { result.checks.push(`[X] Bearish trend but in Discount (oversold)`); isFailedSetup = true; }
  result.direction = direction;
  if (pdZone.zone !== "COMPRESSED" && pdZone.zone !== "EQ") { result.checks.push(`[OK] Location: ${pdZone.zone} (${(pdZone.pos * 100).toFixed(0)}%) - ${direction} zone`); }
  let h4Swept = false;
  if (h4Oldest) {
    const { buyPools, sellPools } = findLiquidityPools(h4Oldest);
    const pools = direction === "BUY" ? sellPools : buyPools;
    for (const pool of pools) {
      const sweep = detectSweep(h4Oldest, pool, 8);
      if (sweep.swept) { h4Swept = true; break; }
    }
  }
  if (h4Swept) result.checks.push(`[OK] H4 Liquidity sweep`);
  else result.checks.push(`[ ] No H4 sweep yet`);
  let poi: any = null; let poiSource = "";
  if (h4Oldest && h4Oldest.length >= 20) { poi = findOrderBlock(h4Oldest, h1Trend, atr(h4Oldest, 14) || hAtr); poiSource = "H4"; }
  if (!poi || !poi.valid) { if (m15Oldest && m15Oldest.length >= 20) { poi = findOrderBlock(m15Oldest, h1Trend, atr(m15Oldest, 14) || hAtr); poiSource = "M15"; } }
  if (!poi || !poi.valid) {
    const fvgs = findFVG(h4Oldest || h1Oldest, h1Trend);
    if (fvgs && fvgs.length > 0) { const bestFvg = fvgs[fvgs.length - 1]; poi = { type: bestFvg.type, direction, high: bestFvg.top, low: bestFvg.bottom, index: bestFvg.index, time: bestFvg.time, valid: true, disp_atr: 1.5 }; poiSource = "FVG"; }
  }
  if (!poi) {
    isFailedSetup = true;
    if (direction === "BUY") poi = { type: "Derived", direction: "BUY", high: pdZone.rLow + hAtr * 0.4, low: pdZone.rLow - hAtr * 0.2, valid: true, disp_atr: 1.0, index: 0 };
    else poi = { type: "Derived", direction: "SELL", high: pdZone.rHigh + hAtr * 0.2, low: pdZone.rHigh - hAtr * 0.4, valid: true, disp_atr: 1.0, index: 0 };
  }
  const freshness = checkPoiFreshness(h4Oldest || h1Oldest, poi);
  if (freshness === "DEAD") { result.checks.push(`[X] POI dead`); isFailedSetup = true; }
  if (m15Oldest && m15Oldest.length >= 10) {
    const entryCandleInfo = checkEntryCandle(m15Oldest, direction);
    if (!entryCandleInfo.valid) { result.checks.push(`[X] M15 entry: ${entryCandleInfo.reason}`); isFailedSetup = true; }
    else result.checks.push(`[OK] M15 entry: ${entryCandleInfo.reason}`);
  }
  let wTrend = "RANGE";
  if (wOldest && wOldest.length >= 5) wTrend = classifyTrend(wOldest, 2).trend;
  result.weekly_trend = wTrend;
  let bonuses = 0;
  if (wTrend === h1Trend) bonuses++;
  if (freshness === "FRESH") bonuses++;
  if (poiSource.startsWith("H4")) bonuses++;
  const sess = checkSessionStatus();
  if (sess.session === "LONDON_KZ" || sess.session === "NY_OVERLAP") bonuses++;
  result.bonuses = bonuses;
  if (bonuses >= 5) result.grade = "A+"; else if (bonuses >= 3) result.grade = "A"; else if (bonuses >= 1) result.grade = "B";
  const entry = last; let sl = 0; let tp1 = 0;
  if (direction === "BUY") { sl = Math.min(poi.low, entry - 1.5 * hAtr); tp1 = entry + 2 * Math.abs(entry - sl); }
  else { sl = Math.max(poi.high, entry + 1.5 * hAtr); tp1 = entry - 2 * Math.abs(sl - entry); }
  const rr = Math.abs(tp1 - entry) / Math.abs(entry - sl);
  result.plan = { entry, sl, tp1, rr };
  if (rr < 2.0) isFailedSetup = true;
  result.passed = !isFailedSetup; result.decision = result.passed ? direction : "WAIT";
  return cacheAndReturn(result);
}

function findCorrelationConflicts(signals: any[]) {
  const conflicts: any[] = [];
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const s1 = signals[i]; const s2 = signals[j];
      const curPairs1 = s1.pair.split("/"); const curPairs2 = s2.pair.split("/");
      const shared = curPairs1.filter((c: string) => curPairs2.includes(c));
      if (shared.length > 0 && s1.decision !== s2.decision) conflicts.push({ pair1: s1.pair, pair2: s2.pair, currency: shared[0] });
    }
  }
  return conflicts;
}

let cachedNews: any[] | null = null;
let lastNewsFetchTime = 0;

async function getEconomicNews() {
  const now = Date.now();
  if (cachedNews && (now - lastNewsFetchTime < 15 * 60 * 1000)) return cachedNews;
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.xml");
    const xmlText = await res.text();
    const events: any[] = [];
    const eventRegex = /<event>([\s\S]*?)<\/event>/gi;
    let match;
    while ((match = eventRegex.exec(xmlText)) !== null) {
      const content = match[1];
      const getTag = (tag: string) => { const r = new RegExp(`<${tag}>(.*?)</${tag}>`, "i"); const m = r.exec(content); return m ? m[1] : ""; };
      events.push({ time: `${getTag("date")} ${getTag("time")}`, currency: getTag("country"), event: getTag("title"), impact: getTag("impact").toUpperCase() });
    }
    cachedNews = events; lastNewsFetchTime = now; return events;
  } catch (e) { return []; }
}

const TRADES_FILE = path.join(process.cwd(), "trades.json");
const SIGNALS_FILE = path.join(process.cwd(), "signals.json");

function loadTrades() { try { return fs.existsSync(TRADES_FILE) ? JSON.parse(fs.readFileSync(TRADES_FILE, "utf-8")) : []; } catch (e) { return []; } }
function saveTrades(trades: any) { fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2)); }
function loadSignals() { try { return fs.existsSync(SIGNALS_FILE) ? JSON.parse(fs.readFileSync(SIGNALS_FILE, "utf-8")) : []; } catch (e) { return []; } }
function saveSignals(signals: any) { fs.writeFileSync(SIGNALS_FILE, JSON.stringify(signals, null, 2)); }

function recordSignalIfNeeded(res: any, session: any) {
  if (!res || !res.passed) return;
  const signals = loadSignals();
  if (signals.some((s: any) => s.pair === res.pair && s.direction === res.decision && (Date.now() - new Date(s.timestamp).getTime() < 900000))) return;
  signals.push({ id: `sig_${Date.now()}`, pair: res.pair, direction: res.decision, grade: res.grade, timestamp: new Date().toISOString(), entryPrice: res.plan.entry, sl: res.plan.sl, tp1: res.plan.tp1 });
  saveSignals(signals.slice(-100));
}

let isScanningBackground = false;
let lastAutoScannerStatus = { lastScanTime: "", isScanning: false, message: "Initialized", pairsChecked: [] as any[] };

async function runBackgroundCycle() {
  if (isScanningBackground) return;
  isScanningBackground = true; lastAutoScannerStatus.isScanning = true;
  try {
    const session = checkSessionStatus();
    const pairs = Object.keys(EPICS);
    for (const pair of pairs) {
      const res = await analyzePair(pair, true);
      if (res && res.passed) recordSignalIfNeeded(res, session);
    }
    lastAutoScannerStatus.lastScanTime = new Date().toISOString();
    lastAutoScannerStatus.message = "Scan completed";
  } finally { isScanningBackground = false; lastAutoScannerStatus.isScanning = false; }
}

setInterval(runBackgroundCycle, 60000);
setTimeout(runBackgroundCycle, 5000);

app.use(express.json());

app.get("/api/scan/python", async (req, res) => {
  try {
    const pair = req.query.pair as string || "EUR/USD";
    const result = await runPythonScan(pair);
    res.json({ success: true, output: result });
  } catch (error) { res.status(500).json({ success: false, error: (error as any).message }); }
});

app.get("/api/signals", (req, res) => res.json([...loadSignals()].reverse()));
app.get("/api/scanner/status", (req, res) => res.json(lastAutoScannerStatus));
app.get("/api/performance/stats", (req, res) => {
  const trades = loadTrades();
  res.json({ winRate: 0, totalTrades: trades.length, totalClosed: 0, totalWins: 0, totalLosses: 0, sequence: [], trades: [...trades].reverse() });
});
app.post("/api/performance/enter", (req, res) => {
  const trades = loadTrades(); trades.push({ ...req.body, id: `tr_${Date.now()}`, timestamp: new Date().toISOString(), status: "Open" });
  saveTrades(trades); res.json({ success: true });
});
app.get("/api/session", (req, res) => res.json(checkSessionStatus()));
app.get("/api/scan", async (req, res) => {
  const pairs = Object.keys(EPICS);
  const results = await Promise.all(pairs.map(p => analyzePair(p, req.query.force === "true")));
  res.json({ timestamp: new Date().toISOString(), session: checkSessionStatus(), results, passed_count: results.filter(r => r.passed).length });
});
app.get("/api/news", async (req, res) => res.json(await getEconomicNews()));

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(process.cwd(), "dist", "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}
startServer();
