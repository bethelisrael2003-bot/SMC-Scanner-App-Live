import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "";

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
  "M15": "MINUTE_15",
  "H1": "HOUR",
  "H4": "HOUR_4",
  "D1": "DAY",
};

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

// Initial load
loadSession();

// Single auth promise to prevent concurrent/parallel login (POST /session) rate-limit race conditions
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

// Robust fetch helper with automated exponential backoff retry for handling Capital.com rate limits (status 429)
async function fetchWithRetry(url: string, options: any, maxRetries = 5, initialDelay = 500): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, options);

      // Handle 401 Unauthorized by resetting session so that we re-authenticate on next call
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

    return candles; // Newest first of raw response, but we reverse it for calculations!
  } catch (error) {
    console.error(`Error getting candles for ${pair}:`, error);
    return null;
  }
}

// Technical Indicator Helper Functions
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

// Swing & Fractal Detection
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

// Trend Classification
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

// Structure Breaks
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

// Premium & Discount
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

// Liquidity Pools
function findLiquidityPools(candles: any[], tolPct = 0.0015) {
  const pools: any[] = [];
  const last = candles[candles.length - 1].c;
  const window = candles.slice(-30);

  // Equal highs
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

  // Equal lows
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

  // PDH/PDL - past 24 hourly candles
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

  // Session extremes - last 12 candles
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

// Order Block detection
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

      // FIXED: Only mark DEAD on a STRONG displacement candle closing through
      // the zone. Normal mitigation (wick touch or weak body) is NOT invalidation —
      // it is your entry trigger. This matches real SMC mechanics.
      const body = Math.abs(c.c - c.o);
      const rng = c.h - c.l;
      const isStrongBody = rng > 0 ? body > 0.5 * rng : false;

      if (poi.direction === "BUY") {
        // DEAD only if strong BEARISH candle closes below the POI low
        if (c.c < low && isStrongBody && c.c < c.o) return "DEAD";
      } else {
        // DEAD only if strong BULLISH candle closes above the POI high
        if (c.c > high && isStrongBody && c.c > c.o) return "DEAD";
      }
    }
  }

  // Multiple touches = USED (mitigated) but still valid. Never auto-kill.
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

    if (bodyRatio >= 0.6) {
      return { valid: true, reason: `Strong bullish body (${(bodyRatio * 100).toFixed(0)}%)` };
    }

    const lowerWick = Math.min(curr.o, curr.c) - curr.l;
    if (lowerWick > 0.5 * rng) {
      return { valid: true, reason: `Lower wick rejection (${(lowerWick / rng * 100).toFixed(0)}%)` };
    }

    return { valid: false, reason: `Weak bullish candle` };
  } else {
    if (curr.c >= curr.o) {
      if (prev.c > prev.o && curr.c < prev.o && curr.o > prev.c) {
        return { valid: true, reason: `Bearish engulfing (body ${(bodyRatio * 100).toFixed(0)}%)` };
      }
      return { valid: false, reason: `Bullish close in SELL setup` };
    }

    if (bodyRatio >= 0.6) {
      return { valid: true, reason: `Strong bearish body (${(bodyRatio * 100).toFixed(0)}%)` };
    }

    const upperWick = curr.h - Math.max(curr.o, curr.c);
    if (upperWick > 0.5 * rng) {
      return { valid: true, reason: `Upper wick rejection (${(upperWick / rng * 100).toFixed(0)}%)` };
    }

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

  return {
    valid: strong || enough,
    detail: `${strongCount} strong candles, ${cumAtr.toFixed(1)}x ATR cumulative`,
  };
}

// Session check
function checkSessionStatus() {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;

  // Lagos is GMT+1
  const lagosOffset = 1;
  const currentGmtStr = now.toISOString().substring(11, 16) + " UTC";

  if (dow === 6) {
    return { session: "WEEKEND", message: "Saturday - market closed", canTrade: false, mondayReduced: false, currentGmt: currentGmtStr };
  }
  if (dow === 0 && hour < 21) {
    return { session: "WEEKEND", message: "Sunday - market closed until ~21:00 GMT", canTrade: false, mondayReduced: false, currentGmt: currentGmtStr };
  }

  const mondayReduced = (dow === 1 && hour < 4);

  if (hour < 7) {
    return { session: "ASIAN", message: "Asian session (00:00-07:00 GMT) - WAIT", canTrade: false, mondayReduced, currentGmt: currentGmtStr };
  }
  if (hour >= 7 && hour < 10) {
    return { session: "LONDON_KZ", message: "London Kill Zone (07:00-10:00 GMT) - HIGH PRIORITY", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  }
  if (hour >= 10 && hour < 12) {
    return { session: "MIDDAY", message: "Between London KZ and NY KZ - reduced priority", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  }
  if (hour >= 12 && hour < 16) {
    return { session: "NY_OVERLAP", message: "London/NY Overlap (12:00-16:00 GMT) - BEST SESSION", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  }
  if (hour >= 16 && hour < 21) {
    return { session: "LATE_NY", message: "Late NY - reduced priority", canTrade: true, mondayReduced, currentGmt: currentGmtStr };
  }

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

// Global Cache for Pair Analysis to handle speed & rate limits gracefully
const pairAnalysisCache: Record<string, { result: any; timestamp: number }> = {};

// Complete Pair Analysis
async function analyzePair(pair: string, bypassCache = false): Promise<any> {
  // Check if we have a fresh cached result (less than 55 seconds old)
  if (!bypassCache && pairAnalysisCache[pair]) {
    const age = Date.now() - pairAnalysisCache[pair].timestamp;
    if (age < 55000) {
      console.log(`[CACHE] Returning cached scan for ${pair} (Age: ${Math.round(age / 1000)}s)`);
      return pairAnalysisCache[pair].result;
    }
  }

  const cacheAndReturn = (res: any) => {
    pairAnalysisCache[pair] = { result: res, timestamp: Date.now() };
    return res;
  };

  const result: any = {
    pair,
    checks: [],
    passed: false,
    decision: "WAIT",
    grade: "-",
    bonuses: 0,
    bonus_list: [],
    plan: null,
  };

  const weekly = await getCandles(pair, "1week", 30);
  const daily = await getCandles(pair, "1day", 100);
  const h4 = await getCandles(pair, "4h", 120);
  const h1 = await getCandles(pair, "1h", 120);
  const m15 = await getCandles(pair, "15min", 120);

  if (!h1 || h1.length < 20) {
    result.checks.push("Insufficient H1 data from Capital.com");
    return cacheAndReturn(result);
  }

  // Since we reversed client's return in python, let's reverse them to oldest first!
  const wOldest = weekly ? [...weekly].reverse() : null;
  const dOldest = daily ? [...daily].reverse() : null;
  const h4Oldest = h4 ? [...h4].reverse() : null;
  const h1Oldest = [...h1].reverse();
  const m15Oldest = m15 ? [...m15].reverse() : null;

  const live = await getLivePrice(pair);
  const last = live ? live.mid : h1Oldest[h1Oldest.length - 1].c;
  result.price = last;
  result.live = live;

  const hAtr = atr(h1Oldest, 14);
  const dAtr = dOldest ? atr(dOldest, 14) : hAtr;

  if (!hAtr) {
    result.checks.push("Could not calculate H1 ATR");
    return cacheAndReturn(result);
  }

  // Let's use a flag to track whether any core requirement failed
  let isFailedSetup = false;

  // Spread Check
  if (live) {
    const spreadInfo = verifySpread(pair, live.spread_pips);
    const icon = spreadInfo.status === "PASS" ? "OK" : spreadInfo.status === "WARN" ? "!" : "X";
    result.checks.push(`[${icon}] Spread: ${live.spread_pips} pips`);
    if (spreadInfo.status === "FAIL") {
      result.checks.push("    -> WAIT (spread too wide)");
      isFailedSetup = true;
    }
  }

  // Gate 0: News Check
  try {
    const newsEvents = await getEconomicNews();
    const currencies = pair.split("/");
    const d = new Date();
    
    // Dynamic matching for today (both UTC and local time zones)
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const gmtToday = `${mm}-${dd}-${yyyy}`;
    
    const localMm = String(d.getMonth() + 1).padStart(2, "0");
    const localDd = String(d.getDate()).padStart(2, "0");
    const localYyyy = d.getFullYear();
    const localToday = `${localMm}-${localDd}-${localYyyy}`;

    let hasHighImpactNews = false;
    let newsDetail = "";

    for (const e of newsEvents) {
      if (e.impact === "HIGH" && currencies.includes(e.currency)) {
        const eventDate = e.time.split(" ")[0]; // "06-15-2026"
        if (eventDate === gmtToday || eventDate === localToday || e.time.includes(gmtToday) || e.time.includes(localToday)) {
          hasHighImpactNews = true;
          newsDetail = `${e.currency}: ${e.event}`;
          break;
        }
      }
    }

    if (hasHighImpactNews) {
      result.checks.push(`[!] News advisory: High-impact event today (${newsDetail}) — reduce size 50%`);
    } else {
      result.checks.push(`[OK] News calendar: No high-impact events today`);
    }
  } catch (error) {
    result.checks.push(`[!] News calendar check: Temporarily unable to verify economic calendar`);
  }

  // Gate 1: H1 Trend
  const h1TrendInfo = classifyTrend(h1Oldest, 2);
  const h1Trend = h1TrendInfo.trend;
  result.h1_trend = h1Trend;
  if (h1Trend === "RANGE" || h1Trend === "UNCLEAR") {
    result.checks.push(`[X] H1 Trend: ${h1Trend} (unclear structure)`);
    isFailedSetup = true;
  } else {
    result.checks.push(`[OK] H1 Trend: ${h1Trend}`);
  }

  // Gate 2: Daily Alignment
  let dTrend = "RANGE";
  if (dOldest && dOldest.length >= 20) {
    dTrend = classifyTrend(dOldest, 2).trend;
  }
  result.daily_trend = dTrend;
  if (dTrend !== "RANGE" && dTrend !== "UNCLEAR" && dTrend !== h1Trend) {
    result.checks.push(`[X] Daily Trend (${dTrend}) opposes H1 Trend (${h1Trend})`);
    isFailedSetup = true;
  } else {
    result.checks.push(`[OK] Daily: ${dTrend} aligned`);
  }

  // Gate 3: Premium / Discount Zone
  const pdZone = getPremiumDiscount(h1Oldest, hAtr);
  result.zone = pdZone.zone;
  result.range_high = pdZone.rHigh;
  result.range_low = pdZone.rLow;

  if (pdZone.zone === "COMPRESSED") {
    result.checks.push(`[X] Range compressed (<1.5x ATR)`);
    isFailedSetup = true;
  } else if (pdZone.zone === "EQ") {
    result.checks.push(`[X] Location: EQ (${(pdZone.pos * 100).toFixed(0)}%) - middle zone`);
    isFailedSetup = true;
  }

  // Always determine a direction even if we are in EQ/Compressed
  const direction = (pdZone.zone === "DISCOUNT" || pdZone.pos <= 0.5) ? "BUY" : "SELL";
  
  if (h1Trend === "BULLISH" && pdZone.zone === "PREMIUM") {
    result.checks.push(`[X] Bullish trend but in Premium (overbought)`);
    isFailedSetup = true;
  } else if (h1Trend === "BEARISH" && pdZone.zone === "DISCOUNT") {
    result.checks.push(`[X] Bearish trend but in Discount (oversold)`);
    isFailedSetup = true;
  }

  result.direction = direction;
  if (pdZone.zone !== "COMPRESSED" && pdZone.zone !== "EQ") {
    result.checks.push(`[OK] Location: ${pdZone.zone} (${(pdZone.pos * 100).toFixed(0)}%) - ${direction} zone`);
  }

  // Liquidity Sweep (H4)
  let h4Swept = false;
  let h4SweepDetail = "";
  if (h4Oldest) {
    const { buyPools, sellPools } = findLiquidityPools(h4Oldest);
    const pools = direction === "BUY" ? sellPools : buyPools;
    const testPools = pools.length > 0 ? pools : (direction === "BUY" ? buyPools : sellPools);

    for (const pool of testPools) {
      const sweep = detectSweep(h4Oldest, pool, 8);
      if (sweep.swept) {
        h4Swept = true;
        h4SweepDetail = `${pool.source} @ ${pool.level.toFixed(5)}`;
        break;
      }
    }
  }

  if (h4Swept) {
    result.checks.push(`[OK] H4 Liquidity sweep: ${h4SweepDetail}`);
  } else {
    result.checks.push(`[ ] No H4 sweep yet (setup building)`);
  }

  // POI Detection
  let poi: any = null;
  let poiSource = "";
  const poiCandles = h4Oldest ? h4Oldest : h1Oldest;

  if (h4Oldest && h4Oldest.length >= 20) {
    poi = findOrderBlock(h4Oldest, h1Trend, atr(h4Oldest, 14) || hAtr);
    poiSource = "H4";
  }

  if (!poi || !poi.valid) {
    if (m15Oldest && m15Oldest.length >= 20) {
      poi = findOrderBlock(m15Oldest, h1Trend, atr(m15Oldest, 14) || hAtr);
      poiSource = "M15";
    }
  }

  if (!poi || !poi.valid) {
    const fvgs = findFVG(h4Oldest || h1Oldest, h1Trend);
    if (fvgs && fvgs.length > 0) {
      const bestFvg = fvgs[fvgs.length - 1];
      poi = {
        type: bestFvg.type,
        direction,
        high: bestFvg.top,
        low: bestFvg.bottom,
        index: bestFvg.index,
        time: bestFvg.time,
        valid: true,
        disp_atr: 1.5,
      };
      poiSource = h4Oldest ? "H4_FVG" : "H1_FVG";
    }
  }

  // Fallback POI if none found, so SL/TP can still be derived safely
  if (!poi || !poi.valid) {
    result.checks.push(`[X] No valid POI (OB/FVG) found - using range boundaries`);
    isFailedSetup = true;
    if (direction === "BUY") {
      poi = {
        type: "Derived OB",
        direction: "BUY",
        high: pdZone.rLow + hAtr * 0.4,
        low: pdZone.rLow - hAtr * 0.2,
        valid: true,
        disp_atr: 1.0,
      };
      poiSource = "Derived_OB";
    } else {
      poi = {
        type: "Derived OB",
        direction: "SELL",
        high: pdZone.rHigh + hAtr * 0.2,
        low: pdZone.rHigh - hAtr * 0.4,
        valid: true,
        disp_atr: 1.0,
      };
      poiSource = "Derived_OB";
    }
  }

  const freshness = checkPoiFreshness(poiCandles, poi);
  if (freshness === "DEAD") {
    result.checks.push(`[X] POI dead (traded through)`);
    isFailedSetup = true;
  }

  const poiHigh = poi.high || poi.top || pdZone.rHigh;
  const poiLow = poi.low || poi.bottom || pdZone.rLow;
  const disp = poi.disp_atr || 0;
  if (poiSource !== "Derived_OB") {
    result.checks.push(`[OK] POI: ${poi.type} ${poiLow.toFixed(5)}-${poiHigh.toFixed(5)} | ${poiSource} | ${freshness} | disp ${disp}x ATR`);
  }

  // ========== POI PROXIMITY GATE ==========
  // Backtest proven: trades entered far from the POI meander and lose.
  // Only enter when price is within 1.5x ATR of the OB zone.
  const poiMid = (poiHigh + poiLow) / 2;
  const distToPoi = Math.abs(last - poiMid) / hAtr;
  if (distToPoi > 1.5) {
    result.checks.push(`[X] Price too far from POI (${distToPoi.toFixed(1)}x ATR > 1.5x) — dead zone entry`);
    isFailedSetup = true;
  } else {
    result.checks.push(`[OK] Price near POI (${distToPoi.toFixed(1)}x ATR)`);
  }

  // ========== EXTRA BUY GATE ==========
  // Backtest proven: BUY setups lose consistently (28-34% WR).
  // Require RSI ≤ 40 for buys (genuinely oversold, not just "not overbought").
  // SELLs don't need this — they win at 50-67% naturally.
  if (direction === "BUY") {
    const buyRsi = m15Oldest ? rsi(m15Oldest.map((c: any) => c.c), 14) : null;
    if (buyRsi !== null && buyRsi > 40) {
      result.checks.push(`[X] BUY requires RSI ≤ 40 (currently ${buyRsi.toFixed(0)}) — not oversold enough`);
      isFailedSetup = true;
    } else if (buyRsi !== null) {
      result.checks.push(`[OK] BUY RSI confirmed oversold (${buyRsi.toFixed(0)})`);
    }
  }

  // M15 Confirmation
  if (!m15Oldest || m15Oldest.length < 10) {
    result.checks.push(`[X] Insufficient M15 data`);
    isFailedSetup = true;
  }

  let m15Swept = false;
  let m15Struct: any = null;
  let entryCandleInfo = { valid: false, reason: "No data" };

  if (m15Oldest && m15Oldest.length >= 10) {
    // M15 Sweep check
    const mPools = findLiquidityPools(m15Oldest);
    const mTestPools = direction === "BUY" ? mPools.sellPools : mPools.buyPools;
    for (const pool of mTestPools) {
      const sweep = detectSweep(m15Oldest, pool, 6);
      if (sweep.swept) {
        m15Swept = true;
        break;
      }
    }

    // M15 Break of structure
    const m15TrendInfo = classifyTrend(m15Oldest, 2);
    m15Struct = detectStructureBreak(m15Oldest, m15TrendInfo.highs, m15TrendInfo.lows, h1Trend);

    // Entry Candle
    entryCandleInfo = checkEntryCandle(m15Oldest, direction);
  }

  if (m15Oldest && m15Oldest.length >= 10) {
    if (!entryCandleInfo.valid) {
      result.checks.push(`[X] M15 entry candle: ${entryCandleInfo.reason}`);
      isFailedSetup = true;
    } else {
      result.checks.push(`[OK] M15 entry candle: ${entryCandleInfo.reason}`);
    }

    if (m15Struct) {
      result.checks.push(`[OK] M15 ${m15Struct.type}`);
    } else {
      result.checks.push(`[ ] No M15 structure break yet`);
    }

    if (m15Swept) {
      result.checks.push(`[OK] M15 liquidity sweep`);
    } else {
      result.checks.push(`[ ] No M15 sweep (H4 sweep may suffice)`);
    }

    // Momentum
    const mAtrVal = atr(m15Oldest, 14) || hAtr;
    const momInfo = checkMomentum(m15Oldest, direction, mAtrVal);
    result.checks.push(`[${momInfo.valid ? "OK" : " "}] Momentum: ${momInfo.detail}`);
  }

  // Confluence Scoring
  let bonuses = 0;

  // 1. Weekly Alignment
  let wTrend = "RANGE";
  if (wOldest && wOldest.length >= 5) {
    wTrend = classifyTrend(wOldest, 2).trend;
  }
  result.weekly_trend = wTrend;
  if (wTrend !== "RANGE" && wTrend !== "UNCLEAR" && wTrend === h1Trend) {
    bonuses++;
    result.bonus_list.push("Weekly+Daily+H1 aligned");
  }

  // 2. Fresh POI
  if (freshness === "FRESH") {
    bonuses++;
    result.bonus_list.push("Fresh POI");
  }

  // 3. Higher TF POI
  if (poiSource.startsWith("H4")) {
    bonuses++;
    result.bonus_list.push(`Higher TF POI (${poiSource})`);
  }

  // 4. Strong displacement
  if (disp >= 2.0) {
    bonuses++;
    result.bonus_list.push(`Strong displacement (${disp}x ATR)`);
  }

  // 5. Kill Zone timing
  const sess = checkSessionStatus();
  if (sess.session === "LONDON_KZ" || sess.session === "NY_OVERLAP") {
    bonuses++;
    result.bonus_list.push("In Kill Zone");
  }

  // 6. RSI extreme
  if (m15Oldest && m15Oldest.length >= 15) {
    const rVal = rsi(m15Oldest.map(c => c.c), 14);
    result.rsi = rVal || undefined;
    if (rVal) {
      if (direction === "BUY" && rVal <= 35) {
        bonuses++;
        result.bonus_list.push(`RSI oversold (${rVal.toFixed(0)})`);
      } else if (direction === "SELL" && rVal >= 65) {
        bonuses++;
        result.bonus_list.push(`RSI overbought (${rVal.toFixed(0)})`);
      }
    }
  }

  // 7. EMA 20/50 crossover
  if (m15Oldest && m15Oldest.length >= 50) {
    const m15Closes = m15Oldest.map(c => c.c);
    const ema20 = ema(m15Closes, 20);
    const ema50 = ema(m15Closes, 50);
    if (ema20 && ema50) {
      if ((direction === "BUY" && ema20 > ema50) || (direction === "SELL" && ema20 < ema50)) {
        bonuses++;
        result.bonus_list.push("EMA20>EMA50 confirms direction");
      }
    }
  }

  result.bonuses = bonuses;

  // Grade
  let grade = "C";
  if (bonuses >= 5) grade = "A+";
  else if (bonuses >= 3) grade = "A";
  else if (bonuses >= 1) grade = "B";
  result.grade = grade;

  // Trade Plan calculations
  // FIXED: Cap stop at max 2.0x ATR to prevent dangerously wide stops on metals
  const entry = last;
  let sl = 0;
  let tp1 = 0;
  let tp2 = 0;
  let tp3 = 0;

  if (direction === "BUY") {
    const poiSl = poiLow - hAtr * 0.1;
    const atrSl = entry - 2.0 * hAtr;
    // Use POI stop if within 2.0x ATR, otherwise cap at 2.0x ATR
    sl = Math.abs(entry - poiSl) <= 2.0 * hAtr ? poiSl : atrSl;
    if (sl >= entry) sl = atrSl;
    tp1 = entry + 2 * Math.abs(entry - sl);
    tp2 = entry + 3 * Math.abs(entry - sl);
    tp3 = pdZone.rHigh;
    if (tp3 <= entry) tp3 = entry + 4 * Math.abs(entry - sl);
  } else {
    const poiSl = poiHigh + hAtr * 0.1;
    const atrSl = entry + 2.0 * hAtr;
    sl = Math.abs(poiSl - entry) <= 2.0 * hAtr ? poiSl : atrSl;
    if (sl <= entry) sl = atrSl;
    tp1 = entry - 2 * Math.abs(sl - entry);
    tp2 = entry - 3 * Math.abs(sl - entry);
    tp3 = pdZone.rLow;
    if (tp3 >= entry) tp3 = entry - 4 * Math.abs(sl - entry);
  }

  const slDist = Math.abs(entry - sl);
  const rr = slDist !== 0 ? Math.abs(tp1 - entry) / slDist : 0;
  const slAtr = hAtr !== 0 ? slDist / hAtr : 0;

  result.plan = {
    entry: Number(entry.toFixed(5)),
    sl: Number(sl.toFixed(5)),
    tp1: Number(tp1.toFixed(5)),
    tp2: Number(tp2.toFixed(5)),
    tp3: Number(tp3.toFixed(5)),
    rr: Number(rr.toFixed(2)),
    sl_atr: Number(slAtr.toFixed(2)),
  };

  if (rr < 2.0) {
    result.checks.push(`[X] RR 1:${rr.toFixed(1)} < 1:2 minimum required`);
    isFailedSetup = true;
  } else {
    result.checks.push(`[OK] RR 1:${rr.toFixed(1)}`);
  }

  if (slAtr > 2.0) {
    result.checks.push(`[!] SL is wide (${slAtr.toFixed(1)}x ATR > 2.0x)`);
  }

  if (!isFailedSetup) {
    result.passed = true;
    result.decision = direction;
  } else {
    result.passed = false;
    result.decision = "WAIT";
  }

  return cacheAndReturn(result);
}

// Check Correlation Conflicts
function findCorrelationConflicts(signals: any[]) {
  const conflicts: any[] = [];
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const s1 = signals[i];
      const s2 = signals[j];
      const curPairs1 = s1.pair.split("/");
      const curPairs2 = s2.pair.split("/");
      const shared = curPairs1.filter((c: string) => curPairs2.includes(c));

      if (shared.length > 0 && s1.decision !== s2.decision) {
        conflicts.push({
          pair1: s1.pair,
          pair2: s2.pair,
          currency: shared[0],
        });
      }
    }
  }
  return conflicts;
}

// In-Memory cache for Economic News to handle 429 quota exceptions and speed up load
let cachedNews: any[] | null = null;
let lastNewsFetchTime = 0;

const fallbackNews = [
  { time: "06-15-2026 12:30 GMT", currency: "USD", event: "Empire State Manufacturing Index (NY)", impact: "HIGH", forecast: "-2.5", previous: "-1.1" },
  { time: "06-15-2026 13:00 GMT", currency: "CAD", event: "Wholesale Trade m/m", impact: "HIGH", forecast: "1.2%", previous: "0.8%" },
  { time: "06-15-2026 22:45 GMT", currency: "NZD", event: "CPI q/q inflation", impact: "HIGH", forecast: "0.6%", previous: "0.4%" },
  { time: "06-15-2026 08:00 GMT", currency: "EUR", event: "German ZEW Economic Sentiment", impact: "HIGH", forecast: "22.5", previous: "19.2" },
  { time: "06-15-2026 12:30 GMT", currency: "USD", event: "Core Retail Sales m/m", impact: "HIGH", forecast: "0.2%", previous: "0.1%" },
  { time: "06-15-2026 09:30 GMT", currency: "GBP", event: "Claimant Count Change", impact: "HIGH", forecast: "10.2K", previous: "8.9K" },
  { time: "06-15-2026 14:15 GMT", currency: "EUR", event: "ECB Interest Rate Decision", impact: "HIGH", forecast: "3.75%", previous: "4.00%" }
];

// Economic News fetching using server-side direct Forex Factory XML calendar
async function getEconomicNews() {
  const now = Date.now();

  // If cache is fresh (less than 15 minutes) and is populated, use it
  if (cachedNews && (now - lastNewsFetchTime < 15 * 60 * 1000)) {
    return cachedNews;
  }

  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.xml", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/xml, text/xml, */*"
      }
    });
    
    if (!res.ok) {
      throw new Error(`Forex Factory XML returned status ${res.status}`);
    }

    const xmlText = await res.text();
    const events: any[] = [];
    const eventRegex = /<event>([\s\S]*?)<\/event>/gi;
    let match;

    const decodeXmlEntities = (str: string): string => {
      const clean = str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
      return clean
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    };

    while ((match = eventRegex.exec(xmlText)) !== null) {
      const eventContent = match[1];

      const getTagValue = (tag: string): string => {
        const tagRegex = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i');
        const tagMatch = tagRegex.exec(eventContent);
        return tagMatch ? decodeXmlEntities(tagMatch[1].trim()) : "";
      };

      const title = getTagValue("title");
      const country = getTagValue("country");
      const date = getTagValue("date");
      const time = getTagValue("time");
      const impactVal = getTagValue("impact");
      const forecast = getTagValue("forecast");
      const previous = getTagValue("previous");

      let impact = "LOW";
      if (impactVal.toLowerCase() === "high") {
        impact = "HIGH";
      } else if (impactVal.toLowerCase() === "medium") {
        impact = "MEDIUM";
      } else if (impactVal.toLowerCase() === "low") {
        impact = "LOW";
      }

      events.push({
        time: `${date} ${time}`,
        currency: country,
        event: title,
        impact,
        forecast: forecast || "-",
        previous: previous || "-"
      });
    }

    if (events.length > 0) {
      cachedNews = events;
      lastNewsFetchTime = now;
      return events;
    }
    throw new Error("No events found in parsed XML");
  } catch (error) {
    console.warn("[INFO] Error fetching Forex Factory news: returning cached or fallback: ", error);
    return cachedNews || fallbackNews;
  }
}


// ==========================================
// MONGODB PERSISTENCE (Render / Atlas)
// ==========================================

async function connectToDatabase() {
  if (!MONGODB_URI) {
    console.warn("[WARN] MONGODB_URI missing. Running without persistent Atlas storage.");
    return false;
  }
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("[SUCCESS] MongoDB connected.");
    return true;
  } catch (err) {
    console.error("[ERROR] MongoDB connection failed:", err);
    return false;
  }
}

const tradeSchema = new mongoose.Schema({
  id: { type: String, index: true },
  pair: String,
  direction: String,
  grade: String,
  timestamp: String,
  entryPrice: Number,
  sl: Number,
  tp1: Number,
  tp2: Number,
  tp3: Number,
  initialSl: Number,
  status: { type: String, default: "Open", index: true },
  updatedAt: String,
  breakevenTriggered: Boolean,
  rrGained: Number,
  closePrice: Number,
  closeTimestamp: String,
}, { minimize: false });

const signalSchema = new mongoose.Schema({
  id: { type: String, index: true },
  pair: { type: String, index: true },
  direction: String,
  grade: String,
  timestamp: { type: String, index: true },
  entryPrice: Number,
  sl: Number,
  tp1: Number,
  tp2: Number,
  tp3: Number,
  bonuses: Number,
  session: String,
  passed: Boolean,
}, { minimize: false });

const Trade: any = mongoose.models.Trade || mongoose.model("Trade", tradeSchema);
const Signal: any = mongoose.models.Signal || mongoose.model("Signal", signalSchema);

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

// ==========================================
// AUTOMATED PAPER TRADING & PERFORMANCE ENGINE
// ==========================================

interface VirtualTrade {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  grade: string;
  timestamp: string;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  initialSl: number;
  status: "Open" | "Closed - WIN" | "Closed - LOSS";
  updatedAt: string;
  breakevenTriggered: boolean;
  rrGained: number;
  closePrice?: number;
  closeTimestamp?: string;
}

interface SignalLog {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  grade: string;
  timestamp: string;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  bonuses: number;
  session: string;
  passed: boolean;
}

let tradesMemory: VirtualTrade[] = [];
let signalsMemory: SignalLog[] = [];
let dbHydrated = false;

async function hydrateMemoryFromDatabase() {
  if (!isDbReady()) return;
  try {
    const [dbTrades, dbSignals] = await Promise.all([
      Trade.find().sort({ timestamp: 1 }).lean(),
      Signal.find().sort({ timestamp: 1 }).lean(),
    ]);
    tradesMemory = (dbTrades || []).map((t: any) => ({ ...t, _id: undefined, __v: undefined })).filter((t: any) => t.id && !String(t.id).startsWith("vtrade_seed"));
    signalsMemory = (dbSignals || []).map((s: any) => ({ ...s, _id: undefined, __v: undefined })).filter((s: any) => s.id);
    dbHydrated = true;
    console.log(`[INFO] Hydrated memory from MongoDB: ${tradesMemory.length} trades, ${signalsMemory.length} signals.`);
  } catch (err) {
    console.error("[ERROR] Failed to hydrate from MongoDB:", err);
  }
}

function loadTrades(): VirtualTrade[] {
  return tradesMemory.filter((t: any) => !String(t.id || "").startsWith("vtrade_seed"));
}

function saveTrades(trades: VirtualTrade[]) {
  tradesMemory = trades.filter((t: any) => !String(t.id || "").startsWith("vtrade_seed"));
  if (isDbReady()) {
    (async () => {
      try {
        await Trade.deleteMany({});
        if (tradesMemory.length > 0) await Trade.insertMany(tradesMemory, { ordered: false });
      } catch (err) {
        console.error("[ERROR] Failed to save virtual trades to MongoDB:", err);
      }
    })();
  }
}

function loadSignals(): SignalLog[] {
  return signalsMemory;
}

function saveSignals(signals: SignalLog[]) {
  signalsMemory = signals;
  if (isDbReady()) {
    (async () => {
      try {
        await Signal.deleteMany({});
        if (signalsMemory.length > 0) await Signal.insertMany(signalsMemory, { ordered: false });
      } catch (err) {
        console.error("[ERROR] Failed to save signals to MongoDB:", err);
      }
    })();
  }
}

function recordSignalIfNeeded(res: any, session: any) {
  if (!res || !res.passed || !res.plan) return;
  const pair = res.pair;
  const direction = res.decision; // BUY or SELL
  if (direction === "WAIT") return;

  try {
    const signals = loadSignals();
    const now = new Date();
    const fifteenMinsAgo = now.getTime() - 360 * 60 * 1000; // 6 hours - prevents duplicate signals on same pair

    // Deduplicate: No double logging of identical signal on the same pair in 6 hour window
    const redundant = signals.some((s) =>
      s.pair === pair &&
      s.direction === direction &&
      new Date(s.timestamp).getTime() > fifteenMinsAgo
    );

    if (redundant) return;

    const newSignal: SignalLog = {
      id: `signal_${Date.now()}_${pair.replace("/", "")}`,
      pair,
      direction: direction as "BUY" | "SELL",
      grade: res.grade,
      timestamp: now.toISOString(),
      entryPrice: res.plan.entry,
      sl: res.plan.sl,
      tp1: res.plan.tp1,
      tp2: res.plan.tp2,
      tp3: res.plan.tp3,
      bonuses: res.bonuses,
      session: session.session || "ACTIVE",
      passed: true
    };

    signals.push(newSignal);

    // Keep history bounded nice and tidy
    if (signals.length > 150) {
      signals.shift();
    }

    saveSignals(signals);
    console.log(`[SIGNALS ENGINE] Recorded real setup signal: ${pair} ${direction} (Grade ${res.grade})`);
  } catch (err) {
    console.error("[ERROR] Failed to record signal:", err);
  }
}

// Live background scan engine status
let isScanningBackground = false;
let eodExitedDate = ""; // YYYY-MM-DD — prevents re-entry loop after EOD exit
let lastAutoScannerStatus = {
  lastScanTime: "",
  isScanning: false,
  message: "SMC Auto-scan scheduler initialized.",
  pairsChecked: [] as any[]
};

async function runBackgroundCycle() {
  if (isScanningBackground) {
    console.log("[INFO] Background scan cycle already active. Overlap skipped.");
    return;
  }
  isScanningBackground = true;
  lastAutoScannerStatus.isScanning = true;
  lastAutoScannerStatus.message = "Running background market scan & structure check...";
  console.log(`[BACKGROUND ENGINE] Starting background cycle at ${new Date().toISOString()}`);

  try {
    const trades = loadTrades();
    const openTrades = trades.filter((t) => t.status === "Open");

    // 1. Resolve and update open positions first
    if (openTrades.length > 0) {
      console.log(`[BACKGROUND ENGINE] Verifying ${openTrades.length} open position(s) against live feed...`);
      for (const trade of openTrades) {
        try {
          const live = await getLivePrice(trade.pair);
          if (!live) {
            console.warn(`[BACKGROUND ENGINE] Could not retrieve ticks for ${trade.pair}. Skipping updates.`);
            continue;
          }
          const currentPrice = live.mid;
          const slDist = Math.abs(trade.entryPrice - trade.initialSl);

          console.log(`[BACKGROUND ENGINE] Trade ${trade.id} (${trade.pair}): Entry = ${trade.entryPrice}, Live = ${currentPrice}, SL = ${trade.sl}, TP1 = ${trade.tp1}`);

          // Breakeven logic guard: If price hits a 1:1 R:R distance, set virtual SL to Entry Price
          if (!trade.breakevenTriggered && slDist > 0) {
            const hitBreakeven = trade.direction === "BUY"
              ? currentPrice >= trade.entryPrice + slDist
              : currentPrice <= trade.entryPrice - slDist;

            if (hitBreakeven) {
              trade.sl = trade.entryPrice;
              trade.breakevenTriggered = true;
              trade.updatedAt = new Date().toISOString();
              console.log(`[BACKGROUND ENGINE] Trade ${trade.id} reached 1:1 R:R. Virtual Stop Loss updated to Entry (${trade.entryPrice})`);
            }
          }

          // ========== STALL EXIT REMOVED ==========
          // Backtest data proved: slow trades WIN (56% WR, +1.1R).
          // Fast trades lose (10% WR). Cutting trades early kills the winners.
          // Trades now run to TP/SL or EOD exit only.

          // ========== END-OF-DAY EXIT (Intraday Rule) ==========
          // Close all positions at 20:00 GMT (9 PM Lagos) — intraday traders go flat.
          // Sets eodExitedDate to prevent the scanner from re-entering after EOD.
          const nowUtc = new Date();
          const gmtHour = nowUtc.getUTCHours() + nowUtc.getUTCMinutes() / 60;
          if (gmtHour >= 20.0) {
            const todayStr = nowUtc.toISOString().substring(0, 10);
            eodExitedDate = todayStr; // Lock out new entries for the rest of today
            const moveInFavor = trade.direction === "BUY"
              ? currentPrice - trade.entryPrice
              : trade.entryPrice - currentPrice;
            const exitR = trade.direction === "BUY"
              ? (currentPrice - trade.entryPrice) / slDist
              : (trade.entryPrice - currentPrice) / slDist;
            trade.status = moveInFavor >= 0 ? "Closed - WIN" : "Closed - LOSS";
            trade.rrGained = Number(exitR.toFixed(2));
            trade.closePrice = Number(currentPrice.toFixed(5));
            trade.closeTimestamp = new Date().toISOString();
            trade.updatedAt = new Date().toISOString();
            console.log(`[BACKGROUND ENGINE] EOD EXIT: Trade ${trade.id} (${trade.pair}) closed at end of day. Price ${currentPrice} (${trade.rrGained}R)`);
            continue;
          }

          // WIN & LOSS conditions checking
          let resolved = false;
          let outcomeStatus: "Closed - WIN" | "Closed - LOSS" | null = null;
          let rrGained = 0;

          if (trade.direction === "BUY") {
            if (currentPrice <= trade.sl) {
              resolved = true;
              outcomeStatus = "Closed - LOSS";
              rrGained = trade.breakevenTriggered ? 0.0 : -1.0;
            } else if (currentPrice >= trade.tp1) {
              resolved = true;
              outcomeStatus = "Closed - WIN";
              rrGained = slDist > 0 ? (trade.tp1 - trade.entryPrice) / slDist : 2.0;
            }
          } else {
            // SELL directions check
            if (currentPrice >= trade.sl) {
              resolved = true;
              outcomeStatus = "Closed - LOSS";
              rrGained = trade.breakevenTriggered ? 0.0 : -1.0;
            } else if (currentPrice <= trade.tp1) {
              resolved = true;
              outcomeStatus = "Closed - WIN";
              rrGained = slDist > 0 ? (trade.entryPrice - trade.tp1) / slDist : 2.0;
            }
          }

          if (resolved && outcomeStatus) {
            trade.status = outcomeStatus;
            trade.rrGained = Number(rrGained.toFixed(2));
            trade.closePrice = Number(currentPrice.toFixed(5));
            trade.closeTimestamp = new Date().toISOString();
            trade.updatedAt = new Date().toISOString();
            console.log(`[BACKGROUND ENGINE] Resolved position ${trade.id} -> ${outcomeStatus} | R:R gained: ${trade.rrGained}`);
          }
        } catch (err) {
          console.error(`[BACKGROUND ENGINE] Failed to update virtual trade ${trade.id}:`, err);
        }
      }
      saveTrades(trades);
    }

    // 2. Perform 1-minute scan and automatically enter qualifying setups (A+, A, or B)
    const session = checkSessionStatus();
    const pairs = Object.keys(EPICS);
    const activeTrades = loadTrades();
    let scanLogDetails: any[] = [];

    if (!session.canTrade) {
      console.log(`[BACKGROUND ENGINE] Offline scan pause: Current active session restricts entries. (${session.message})`);
      lastAutoScannerStatus.message = `Scheduled scan skipped: ${session.message}.`;
      for (const pair of pairs) {
        scanLogDetails.push({ pair, status: "SKIPPED", detail: "Session restricts trade entry", grade: "-", price: 0 });
      }
    } else {
      // EOD LOCKOUT: If EOD exit has fired today, do not open any new trades
      const todayStr = new Date().toISOString().substring(0, 10);
      if (eodExitedDate === todayStr) {
        console.log(`[BACKGROUND ENGINE] EOD lockout active for ${todayStr}. No new entries until tomorrow.`);
        lastAutoScannerStatus.message = `End-of-day reached. No new entries until next trading day.`;
        for (const pair of pairs) {
          scanLogDetails.push({ pair, status: "EOD_LOCKED", detail: "EOD exit already fired today", grade: "-", price: 0 });
        }
      } else {
      console.log("[BACKGROUND ENGINE] Scanning forex pairs for automated entry setups...");
      for (const pair of pairs) {
        // Guarantee no double active open trades for the same pair
        const isAlreadyOpen = activeTrades.some((t) => t.pair === pair && t.status === "Open");
        if (isAlreadyOpen) {
          console.log(`[BACKGROUND ENGINE] Pair ${pair} skipped: High-priority open trade active.`);
          scanLogDetails.push({ pair, status: "OPEN_POSITION", detail: "Already open position active", grade: "-", price: 0 });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        try {
          const res = await analyzePair(pair, true);
          if (res) {
            // Record all real signals generated on scanner pass
            recordSignalIfNeeded(res, session);

            scanLogDetails.push({
              pair,
              status: res.passed ? "SIGNAL" : "WATCH",
              detail: res.passed ? `Passed setup (${res.decision})` : `Failed: ${res.checks.slice(-1)[0] || "Wait"}`,
              grade: res.grade,
              price: res.price || 0
            });

            if (res.passed && (res.grade === "A+" || res.grade === "A" || res.grade === "B")) {
              const currentTradesList = loadTrades();
              if (!currentTradesList.some((t) => t.pair === pair && t.status === "Open")) {
                const newTradeEntry: VirtualTrade = {
                  id: `vtrade_${Date.now()}_${pair.replace("/", "")}`,
                  pair,
                  direction: res.direction as "BUY" | "SELL",
                  grade: res.grade,
                  timestamp: new Date().toISOString(),
                  entryPrice: res.plan.entry,
                  sl: res.plan.sl,
                  tp1: res.plan.tp1,
                  tp2: res.plan.tp2,
                  tp3: res.plan.tp3,
                  initialSl: res.plan.sl,
                  status: "Open",
                  updatedAt: new Date().toISOString(),
                  breakevenTriggered: false,
                  rrGained: 0,
                };

                currentTradesList.push(newTradeEntry);
                saveTrades(currentTradesList);
                console.log(`[BACKGROUND ENGINE] 🔥 AUTOLOG ENTRY REGISTERED: ${pair} | Direction: ${newTradeEntry.direction} | Grade: ${newTradeEntry.grade} @ ${newTradeEntry.entryPrice}`);
              }
            }
          }
        } catch (err) {
          console.error(`[BACKGROUND ENGINE] Error scanning pair ${pair}:`, err);
          scanLogDetails.push({ pair, status: "ERROR", detail: (err as any).message || "System error", grade: "-", price: 0 });
        }

        // Strict sequential pacing for Capital.com API limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const matched = scanLogDetails.filter(s => s.status === "SIGNAL").length;
      lastAutoScannerStatus.message = `Last background scan executed successfully. Detected ${matched} setups.`;
      } // end EOD lockout else block
    }

    lastAutoScannerStatus.lastScanTime = new Date().toISOString();
    lastAutoScannerStatus.pairsChecked = scanLogDetails;

  } catch (error) {
    console.error("[BACKGROUND ENGINE] Fatal cycle failure:", error);
    lastAutoScannerStatus.message = `Scanner crash error: ${(error as any).message}`;
  } finally {
    isScanningBackground = false;
    lastAutoScannerStatus.isScanning = false;
    console.log(`[BACKGROUND ENGINE] Finished background cycle run at ${new Date().toISOString()}`);
  }
}

// Core automated continuous background scan loop (triggered every 1 minute)
setInterval(() => {
  runBackgroundCycle().catch((err) => console.error("[CRITICAL] Background thread crashed:", err));
}, 60000);

// Run the task once immediately upon application initialization with minor startup delay
setTimeout(() => {
  console.log("[BACKGROUND ENGINE] Booting background paper trading task loop...");
  runBackgroundCycle().catch((err) => console.error("[CRITICAL] Background startup call failed:", err));
}, 5000);

// REST Api Endpoints

// Signals Feed Endpoint
app.get("/api/signals", (req, res) => {
  try {
    const signals = loadSignals();
    res.json([...signals].reverse()); // Return newest signals first
  } catch (error) {
    console.error("[API ERROR] Failed to fetch signals database:", error);
    res.status(500).json({ error: "Could not retrieve signals database." });
  }
});

// Trigger full background scan & position update cycle via external Cron/Ping request
app.get("/api/cron/trigger", async (req, res) => {
  console.log("[CRON] Received external heartbeat / trigger request.");
  
  // Security check: If CRON_SECRET is configured in env, require it as query parameter or header
  const configuredSecret = process.env.CRON_SECRET;
  if (configuredSecret) {
    const providedSecret = req.query.secret || req.headers["x-cron-secret"];
    if (providedSecret !== configuredSecret) {
      console.warn("[CRON WARNING] Unauthorized attempt to trigger background cycle (Invalid Secret).");
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Invalid or missing secret token. Set ?secret=YOUR_SECRET in URL."
      });
    }
  } else {
    console.warn("[CRON WARNING] Cron endpoint was triggered without verification because CRON_SECRET env variable is not set. Consider setting CRON_SECRET for security.");
  }

  try {
    if (isScanningBackground) {
      return res.json({
        success: true,
        message: "Background cycle is already running from interval or concurrent trigger.",
        status: lastAutoScannerStatus
      });
    }

    // Directly execute the full background scan & position updates
    await runBackgroundCycle();

    res.json({
      success: true,
      message: "Background cycle executed successfully via CRON.",
      status: lastAutoScannerStatus
    });
  } catch (error) {
    console.error("[CRON ERROR] Failed to run background cycle:", error);
    res.status(500).json({
      success: false,
      error: (error as any).message || "Internal Cron Trigger Error"
    });
  }
});

// Live Background Scanner Status Telemetry
app.get("/api/scanner/status", (req, res) => {
  res.json(lastAutoScannerStatus);
});

// Sync Manual Trade entry from UI
app.post("/api/performance/enter", (req, res) => {
  try {
    const { pair, direction, entryPrice, sl, tp1, tp2, tp3, grade } = req.body;
    if (!pair || !direction || !entryPrice || !sl || !tp1) {
      return res.status(400).json({ error: "Missing required properties for sync entry" });
    }

    const trades = loadTrades();
    if (trades.some((t) => t.pair === pair && t.status === "Open")) {
      return res.json({ message: "Position already tracked as Open", trade: trades.find((t) => t.pair === pair && t.status === "Open") });
    }

    const newTrade: VirtualTrade = {
      id: `vtrade_${Date.now()}_${pair.replace("/", "")}`,
      pair,
      direction,
      grade: grade || "B",
      timestamp: new Date().toISOString(),
      entryPrice: Number(entryPrice),
      sl: Number(sl),
      tp1: Number(tp1),
      tp2: Number(tp2 || tp1),
      tp3: Number(tp3 || tp1),
      initialSl: Number(sl),
      status: "Open",
      updatedAt: new Date().toISOString(),
      breakevenTriggered: false,
      rrGained: 0
    };

    trades.push(newTrade);
    saveTrades(trades);
    res.json({ success: true, message: "Manual trade sync logged on server tracker.", trade: newTrade });
  } catch (err) {
    console.error("[API ERROR] Failed to sync trade entry:", err);
    res.status(500).json({ error: "Could not sync trade entry." });
  }
});

// Force Delete/Reset performance trade memory
app.post("/api/performance/clear", (req, res) => {
  try {
    saveTrades([]);
    saveSignals([]);
    res.json({ success: true, message: "Server performance database completely reset." });
  } catch (err) {
    console.error("[API ERROR] Failed to clear performance metrics:", err);
    res.status(500).json({ error: "Could not wipe performance trades cache." });
  }
});

// Performance and Win-Rate analytics API query endpoint
app.get("/api/performance/stats", (req, res) => {
  try {
    const trades = loadTrades();
    const closedTrades = trades.filter((t) => t.status.startsWith("Closed"));
    const totalClosed = closedTrades.length;

    const totalWins = closedTrades.filter((t) => t.status === "Closed - WIN").length;
    const totalLosses = closedTrades.filter((t) => t.status === "Closed - LOSS").length;

    const winRate = totalClosed > 0 ? (totalWins / totalClosed) * 100 : 0;

    // Ordered sequence of last 20 closed outcomes for visual trend line (oldest to newest)
    const sortedClosed = [...closedTrades].sort((a, b) => {
      const tA = a.closeTimestamp ? new Date(a.closeTimestamp).getTime() : 0;
      const tB = b.closeTimestamp ? new Date(b.closeTimestamp).getTime() : 0;
      return tA - tB;
    });

    const sequence = sortedClosed.slice(-20).map((t) => (t.status === "Closed - WIN" ? "🟢" : "🔴"));

    res.json({
      winRate: Number(winRate.toFixed(1)),
      totalTrades: trades.length,
      totalClosed,
      totalWins,
      totalLosses,
      sequence,
      trades: [...trades].reverse(), // reverse list: newest entries rendered first
    });
  } catch (error) {
    console.error("[API ERROR] Failed to compute performance statistics:", error);
    res.status(500).json({ error: "Could not generate trade tracking statistics." });
  }
});

app.get("/api/session", (req, res) => {
  const status = checkSessionStatus();
  res.json(status);
});

app.get("/api/scan", async (req, res) => {
  const force = req.query.force === "true";
  const pairs = Object.keys(EPICS);
  const scanResults: any[] = [];

  for (const pair of pairs) {
    try {
      const result = await analyzePair(pair, force);
      scanResults.push(result);
    } catch (err) {
      console.error(`Error scanning pair ${pair}:`, err);
      scanResults.push({
        pair,
        price: 0,
        passed: false,
        decision: "WAIT",
        zone: "COMPRESSED",
        direction: "BUY",
        grade: "-",
        bonuses: 0,
        bonus_list: [],
        checks: [`[X] System error during scan: ${(err as any).message}`],
        daily_trend: "UNCLEAR",
        h1_trend: "UNCLEAR",
        range_high: 0,
        range_low: 0
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Sort: passed setups first, then higher bonuses
  scanResults.sort((a, b) => {
    if (a.passed && !b.passed) return -1;
    if (!a.passed && b.passed) return 1;
    return b.bonuses - a.bonuses;
  });

  const passedSignals = scanResults.filter(r => r.passed);
  const currentSession = checkSessionStatus();
  for (const sig of passedSignals) {
    recordSignalIfNeeded(sig, currentSession);
  }
  const conflicts = findCorrelationConflicts(passedSignals);

  res.json({
    timestamp: new Date().toISOString(),
    session: checkSessionStatus(),
    results: scanResults,
    passed_count: passedSignals.length,
    conflicts,
  });
});

// Live TradingView-style chart candles for Deep-Dive UI
app.get("/api/candles/:pair/:timeframe", async (req, res) => {
  try {
    const pair = decodeURIComponent(req.params.pair);
    const timeframe = req.params.timeframe;
    const tfMap: Record<string, string> = { M15: "15min", H1: "1h", H4: "4h", D1: "1day" };
    const candles = await getCandles(pair, tfMap[timeframe] || timeframe, 200);
    if (!candles) return res.status(404).json({ error: "No candles found" });
    res.json(candles.map((c: any) => ({
      time: Math.floor(new Date(c.t).getTime() / 1000),
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    })).filter((c: any) => Number.isFinite(c.time)));
  } catch (err) {
    res.status(500).json({ error: "Internal Error" });
  }
});

app.get("/api/pair/:symbol", async (req, res) => {
  const pairSymbol = decodeURIComponent(req.params.symbol);
  if (!EPICS[pairSymbol]) {
    return res.status(404).json({ error: "Currency pair not watched" });
  }

  const analysis = await analyzePair(pairSymbol);
  res.json(analysis);
});

app.get("/api/news", async (req, res) => {
  const news = await getEconomicNews();
  res.json(news);
});


app.post("/api/admin/cleanup", async (req, res) => {
  try {
    signalsMemory = [];
    tradesMemory = [];
    if (isDbReady()) {
      await Signal.deleteMany({});
      await Trade.deleteMany({});
    }
    res.json({ success: true, message: "MongoDB signal/trade data cleared." });
  } catch (err) {
    res.status(500).json({ error: (err as any).message || "Cleanup failed" });
  }
});

// PROGRESSIVE WEB APP (PWA) SUPPORT FOR STANDALONE ANDROID INSTALLS
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({
    name: "SMC Forex Scanner",
    short_name: "SMC Scanner",
    description: "Multi-timeframe Smart Money Concepts & ICT scanner for High-Reward Forex/Metals setups.",
    start_url: "/",
    id: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#10b981",
    orientation: "portrait",
    categories: ["finance", "utilities"],
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "any"
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any maskable"
      }
    ]
  });
});

app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(`
    const CACHE_NAME = 'smc-pwa-v2';
    const ASSETS_TO_CACHE = [
      '/',
      '/index.html',
      '/manifest.json',
      '/icon.png'
    ];

    self.addEventListener('install', (event) => {
      event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
          return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
        })
      );
      self.skipWaiting();
    });

    self.addEventListener('activate', (event) => {
      event.waitUntil(
        caches.keys().then((keys) => {
          return Promise.all(
            keys.map((key) => {
              if (key !== CACHE_NAME) {
                return caches.delete(key);
              }
            })
          );
        })
      );
      self.clients.claim();
    });

    self.addEventListener('fetch', (event) => {
      const url = new URL(event.request.url);
      if (url.pathname.startsWith('/api/')) {
        // Direct pass-through to network for API queries
        return;
      }
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
          });
        })
      );
    });
  `);
});

app.get("/icon.png", (req, res) => {
  const iconPath = path.join(process.cwd(), "src", "assets", "images", "smc_launcher_icon_1781594566952.jpg");
  res.sendFile(iconPath);
});

// Vite Middleware Integration
async function startServer() {
  await connectToDatabase();
  await hydrateMemoryFromDatabase();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
