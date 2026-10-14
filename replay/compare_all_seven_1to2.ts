/* ==========================================================================
 * compare_all_seven_1to2.ts — Backtest-Only Simulation:
 * Straight 1:2 R:R Full Close vs Current Exit Models Across All 7 Strategies
 * --------------------------------------------------------------------------
 * BACKTEST ONLY — ZERO PRODUCTION MUTATIONS.
 * Runs against the 92-day dataset (11 pairs, ~69,000 candles).
 *
 * Compares 3 exit models for each of the 7 strategies:
 *   1. Current Live Production Model (partials, runners, auto-BE)
 *   2. Straight 1:2 R:R (100% full close @ 2.0R, with auto-BE @ 1.0R)
 *   3. Straight 1:2 R:R Pure (100% full close @ 2.0R, No BE / binary outcome)
 * ========================================================================== */

import * as fs from "fs";
import * as path from "path";

import { findMomentumPauseSetup } from "../momentumPauseRetest";
import { findClassicSetup, classifyTrend, findOrderBlock, findFVG, checkPoiFreshness, checkEntryCandle } from "../classicSetup";
import { runPrecisionSequence } from "../precisionEngine";
import { analyzeAsianBreakout, checkAsianBreakoutCandle, extractAsianSessionRange, computeAtr as computeAsianAtr, ASIAN_ELIGIBLE_PAIRS } from "../asianBreakout";
import { evaluateTrendSweep, TREND_SWEEP_PAIRS } from "../trendSweep";
import { evaluateAsianFade, ASIAN_FADE_PAIRS } from "../asianFade";

type Bar = { t: string; o: number; h: number; l: number; c: number; ao: number; ah: number; al: number; ac: number };
type Candle = { open: number; high: number; low: number; close: number; time?: string };

const DATA_DIR = path.join(process.cwd(), "replay", "data");
const PAIRS: [string, string][] = [
  ["EUR/USD", "EURUSD"], ["GBP/USD", "GBPUSD"], ["USD/JPY", "USDJPY"], ["USD/CHF", "USDCHF"],
  ["USD/CAD", "USDCAD"], ["AUD/USD", "AUDUSD"], ["NZD/USD", "NZDUSD"], ["GBP/JPY", "GBPJPY"],
  ["EUR/JPY", "EURJPY"], ["XAU/USD", "GOLD"], ["XAG/USD", "SILVER"],
];

const parseT = (t: string) => new Date(/[zZ+]/.test(t) ? t : t + "Z").getTime();
const toCandle = (b: Bar): Candle => ({ open: b.o, high: b.h, low: b.l, close: b.c, time: b.t });
const pipMult = (pair: string) => pair.includes("XAU") ? 10 : (pair.includes("XAG") || pair.includes("JPY")) ? 100 : 10000;

function atrWilder(bars: Candle[], period = 14): number[] {
  if (bars.length < period + 1) return new Array(bars.length).fill(0);
  const trs: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
  }
  const atr: number[] = new Array(bars.length).fill(0);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < bars.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function getPremiumDiscount(candles: Candle[], atrVal: number, lookback = 50) {
  const recent = candles.slice(-Math.min(lookback, candles.length));
  const rHigh = Math.max(...recent.map(c => c.high));
  const rLow = Math.min(...recent.map(c => c.low));
  const rSize = rHigh - rLow;
  const last = candles[candles.length - 1].close;
  if (rSize < 1.5 * atrVal) return { zone: "COMPRESSED", rHigh, rLow, pos: 0.5 };
  const pos = (last - rLow) / rSize;
  let zone = "EQ";
  if (pos >= 0.70) zone = "PREMIUM";
  else if (pos <= 0.30) zone = "DISCOUNT";
  return { zone, rHigh, rLow, pos };
}

// ── Multi-Target Simulation Engine ──────────────────────────────────────────
interface SimResult {
  r: number;
  reason: "SL" | "BE" | "TP1_BE" | "ALL_TP" | "STALE" | "EOD";
  closeIdx: number;
  holdH: number;
}

function simulateTrade(
  m15: Bar[],
  entryIdx: number,
  direction: "BUY" | "SELL",
  entryFill: number,
  sl: number,
  targets: [number, number][], // [weight, price]
  beTriggerR = 1.0,
  staleH = 12
): SimResult | null {
  const risk = Math.abs(entryFill - sl);
  if (risk <= 0) return null;

  let beTriggered = false;
  let currentSl = sl;
  const t0 = parseT(m15[entryIdx].t);
  let totalR = 0;
  let remainingWeight = 1.0;
  const activeTargets = targets.map(t => ({ w: t[0], tp: t[1], hit: false }));

  for (let j = entryIdx + 1; j < Math.min(entryIdx + 1 + 96, m15.length); j++) {
    const b = m15[j];
    const exitLow = direction === "BUY" ? b.l : b.al;
    const exitHigh = direction === "BUY" ? b.h : b.ah;
    const exitClose = direction === "BUY" ? b.c : b.ac;
    const ageH = (parseT(b.t) - t0) / (3600 * 1000);

    // Staleness check
    if (staleH > 0 && ageH >= staleH && !beTriggered && remainingWeight === 1.0 && risk > 0) {
      const prog = direction === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk;
      if (prog < 0) {
        return { r: Number(prog.toFixed(2)), reason: "STALE", closeIdx: j, holdH: Number(ageH.toFixed(1)) };
      }
    }

    // Stop Loss Check (conservative worst-case fill)
    if ((direction === "BUY" && exitLow <= currentSl) || (direction === "SELL" && exitHigh >= currentSl)) {
      const lossR = direction === "BUY" ? (currentSl - entryFill) / risk : (entryFill - currentSl) / risk;
      totalR += remainingWeight * lossR;
      const isTp1Be = beTriggered && totalR > 0.05;
      const reason = isTp1Be ? "TP1_BE" : (beTriggered ? "BE" : "SL");
      return { r: Number(totalR.toFixed(2)), reason, closeIdx: j, holdH: Number(ageH.toFixed(1)) };
    }

    // Target Checks
    for (const item of activeTargets) {
      if (!item.hit) {
        if ((direction === "BUY" && exitHigh >= item.tp) || (direction === "SELL" && exitLow <= item.tp)) {
          item.hit = true;
          const rGain = direction === "BUY" ? (item.tp - entryFill) / risk : (entryFill - item.tp) / risk;
          totalR += item.w * rGain;
          remainingWeight -= item.w;
          currentSl = entryFill; // Auto-move SL to breakeven
          beTriggered = true;
        }
      }
    }

    if (remainingWeight <= 0.001) {
      return { r: Number(totalR.toFixed(2)), reason: "ALL_TP", closeIdx: j, holdH: Number(ageH.toFixed(1)) };
    }

    // Early Breakeven trigger before target
    if (beTriggerR > 0 && !beTriggered) {
      if ((direction === "BUY" && exitHigh >= entryFill + beTriggerR * risk) ||
          (direction === "SELL" && exitLow <= entryFill - beTriggerR * risk)) {
        beTriggered = true;
        currentSl = entryFill;
      }
    }
  }

  // End of trade window
  const lastB = m15[Math.min(entryIdx + 96, m15.length - 1)];
  const exitC = direction === "BUY" ? lastB.c : lastB.ac;
  const finalR = direction === "BUY" ? (exitC - entryFill) / risk : (entryFill - exitC) / risk;
  totalR += remainingWeight * finalR;
  const holdH = (parseT(lastB.t) - t0) / (3600 * 1000);
  return { r: Number(totalR.toFixed(2)), reason: "EOD", closeIdx: Math.min(entryIdx + 96, m15.length - 1), holdH: Number(holdH.toFixed(1)) };
}

// ── Metric Calculator ───────────────────────────────────────────────────────
interface StrategyMetrics {
  trades: number;
  tradesPerWeek: number;
  wins: number;
  losses: number;
  winRate: number;
  rSum: number;
  avgR: number;
  profitFactor: number;
  maxDrawdown: number;
  retToDd: number;
}

function calcMetrics(tradesList: { r: number; time: string }[]): StrategyMetrics {
  const n = tradesList.length;
  if (n === 0) return { trades: 0, tradesPerWeek: 0, wins: 0, losses: 0, winRate: 0, rSum: 0, avgR: 0, profitFactor: 0, maxDrawdown: 0, retToDd: 0 };
  const wins = tradesList.filter(t => t.r > 0);
  const losses = tradesList.filter(t => t.r <= 0);
  const wr = Number(((wins.length / n) * 100).toFixed(1));
  const rSum = Number(tradesList.reduce((acc, t) => acc + t.r, 0).toFixed(2));
  const avgR = Number((rSum / n).toFixed(2));
  const posR = wins.reduce((acc, t) => acc + t.r, 0);
  const negR = Math.abs(losses.reduce((acc, t) => acc + t.r, 0));
  const pf = negR > 0 ? Number((posR / negR).toFixed(2)) : 99;

  let eq = 0, peak = 0, maxDd = 0;
  for (const t of tradesList) {
    eq += t.r;
    if (eq > peak) peak = eq;
    const dd = eq - peak;
    if (dd < maxDd) maxDd = dd;
  }

  const retToDd = maxDd < 0 ? Number((rSum / Math.abs(maxDd)).toFixed(2)) : 99;
  return {
    trades: n,
    tradesPerWeek: Number((n / (92 / 7)).toFixed(1)),
    wins: wins.length,
    losses: losses.length,
    winRate: wr,
    rSum,
    avgR,
    profitFactor: pf,
    maxDrawdown: Number(maxDd.toFixed(1)),
    retToDd,
  };
}

// ── Load Market Data ─────────────────────────────────────────────────────────
console.log("Loading 92-day dataset across 11 pairs...");
interface PairData {
  pair: string;
  epic: string;
  mult: number;
  m15: Bar[];
  h1: Bar[];
  h4: Bar[];
  d1: Bar[];
  m15C: Candle[];
  h1C: Candle[];
  h4C: Candle[];
  d1C: Candle[];
  h1Atr: number[];
}

const allData: PairData[] = [];
for (const [pair, epic] of PAIRS) {
  const m15Path = path.join(DATA_DIR, `${epic}_M15.json`);
  const h1Path = path.join(DATA_DIR, `${epic}_H1.json`);
  const h4Path = path.join(DATA_DIR, `${epic}_H4.json`);
  const d1Path = path.join(DATA_DIR, `${epic}_D1.json`);
  if (!fs.existsSync(m15Path) || !fs.existsSync(h1Path)) continue;

  const m15: Bar[] = JSON.parse(fs.readFileSync(m15Path, "utf-8"));
  const h1: Bar[] = JSON.parse(fs.readFileSync(h1Path, "utf-8"));
  const h4: Bar[] = fs.existsSync(h4Path) ? JSON.parse(fs.readFileSync(h4Path, "utf-8")) : [];
  const d1: Bar[] = fs.existsSync(d1Path) ? JSON.parse(fs.readFileSync(d1Path, "utf-8")) : [];

  const m15C = m15.map(toCandle);
  const h1C = h1.map(toCandle);
  const h4C = h4.map(toCandle);
  const d1C = d1.map(toCandle);
  const h1Atr = atrWilder(h1C, 14);

  allData.push({ pair, epic, mult: pipMult(pair), m15, h1, h4, d1, m15C, h1C, h4C, d1C, h1Atr });
}
console.log(`Loaded ${allData.length} pairs successfully.`);

// ══════════════════════════════════════════════════════════════════════════════
// SIGNAL DETECTORS FOR ALL 7 STRATEGIES
// ══════════════════════════════════════════════════════════════════════════════

interface RawSignal {
  pair: string;
  idx: number;
  direction: "BUY" | "SELL";
  entryFill: number;
  sl: number;
  currentTargets: [number, number][]; // [weight, price]
  target2R: [number, number][];       // 100% @ 2.0R
  staleH: number;
  currentBeR: number;
  time: string;
}

function generateSignals(stratId: string): RawSignal[] {
  const signals: RawSignal[] = [];

  for (const pdata of allData) {
    const { pair, mult, m15, h1, h4, d1, m15C, h1C, h4C, d1C, h1Atr } = pdata;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. CORE SMC / MPR (Momentum-Pause-Retest)
    // ─────────────────────────────────────────────────────────────────────────
    if (stratId === "mpr") {
      for (let i = 40; i < m15.length - 5; i++) {
        const bar = m15[i];
        const dt = new Date(parseT(bar.t));
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        const dow = dt.getUTCDay();
        if (dow === 0 || dow === 6 || hour < 7.0 || hour >= 16.0) continue;

        const spreadPips = (bar.ac - bar.c) * mult;
        if (spreadPips > (pair.includes("XAU") ? 50 : 5)) continue;

        const h1Idx = Math.floor(i / 4);
        if (h1Idx < 20 || h1Idx >= h1C.length) continue;
        const hAtr = h1Atr[h1Idx];
        if (hAtr <= 0) continue;

        const h1Sub = h1C.slice(Math.max(0, h1Idx - 120), h1Idx);
        const { trend: h1Trend } = classifyTrend(h1Sub, 2);
        if (h1Trend !== "BULLISH" && h1Trend !== "BEARISH") continue;

        const pd = getPremiumDiscount(h1Sub, hAtr);
        if (pd.zone === "COMPRESSED" || pd.zone === "EQ") continue;
        if ((h1Trend === "BULLISH" && pd.zone === "PREMIUM") || (h1Trend === "BEARISH" && pd.zone === "DISCOUNT")) continue;

        const direction: "BUY" | "SELL" = h1Trend === "BULLISH" ? "BUY" : "SELL";
        const m15Sub = m15C.slice(Math.max(0, i - 120), i);
        const conf = checkEntryCandle(m15Sub, direction);
        if (!conf.valid) continue;

        const mprSetup = findMomentumPauseSetup(h1Sub, direction, hAtr, {
          lookback: 20, maxPauseCandles: 3, momentumBodyRatio: 0.6,
          momentumBodyMultiple: 1.5, consolRangeRatio: 0.5, consolMaxAtr: 0.5,
          maxStalenessAtr: 0.75, slBufferAtr: 0.15, minSlAtr: 0.3, tp1Rr: 1.5, tp2Rr: 2.5, precision: 5
        });
        if (!mprSetup) continue;

        const entryFill = direction === "BUY" ? bar.ac : bar.c;
        const sl = mprSetup.sl;
        const risk = Math.abs(entryFill - sl);
        if (risk <= 0) continue;
        const tp1 = direction === "BUY" ? entryFill + 1.5 * risk : entryFill - 1.5 * risk;
        const tp2R = direction === "BUY" ? entryFill + 2.0 * risk : entryFill - 2.0 * risk;

        signals.push({
          pair, idx: i, direction, entryFill, sl,
          currentTargets: [[1.0, tp1]],
          target2R: [[1.0, tp2R]],
          staleH: 12, currentBeR: 1.0, time: bar.t,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. CLASSIC SMC (H4 Sweep -> M15 CHOCH -> H4 POI)
    // ─────────────────────────────────────────────────────────────────────────
    if (stratId === "classic") {
      for (let i = 40; i < m15.length - 5; i++) {
        const bar = m15[i];
        const dt = new Date(parseT(bar.t));
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        const dow = dt.getUTCDay();
        if (dow === 0 || dow === 6 || hour < 7.0 || hour >= 16.0) continue;

        const spreadPips = (bar.ac - bar.c) * mult;
        if (spreadPips > (pair.includes("XAU") ? 50 : 5)) continue;

        const h1Idx = Math.floor(i / 4);
        const h4Idx = Math.floor(i / 16);
        if (h1Idx < 20 || h4Idx < 20 || h1Idx >= h1C.length || h4Idx >= h4C.length) continue;
        const hAtr = h1Atr[h1Idx];
        if (hAtr <= 0) continue;

        const h1Sub = h1C.slice(Math.max(0, h1Idx - 120), h1Idx);
        const h4Sub = h4C.slice(Math.max(0, h4Idx - 120), h4Idx);
        const { trend: h1Trend } = classifyTrend(h1Sub, 2);
        if (h1Trend !== "BULLISH" && h1Trend !== "BEARISH") continue;

        const direction: "BUY" | "SELL" = h1Trend === "BULLISH" ? "BUY" : "SELL";
        const m15Sub = m15C.slice(Math.max(0, i - 120), i);

        const setup = findClassicSetup(h4Sub, m15Sub, hAtr, direction, {
          structPriorTrend: h1Trend, slAnchor: "sweep", h1: h1Sub, poiTimeframe: "H4", dolTargeting: false
        });
        if (!setup) continue;

        const entryFill = direction === "BUY" ? bar.ac : bar.c;
        const sl = setup.sl;
        const risk = Math.abs(entryFill - sl);
        if (risk <= 0) continue;

        const tp1 = direction === "BUY" ? entryFill + 1.5 * risk : entryFill - 1.5 * risk;
        const tp2R = direction === "BUY" ? entryFill + 2.0 * risk : entryFill - 2.0 * risk;

        signals.push({
          pair, idx: i, direction, entryFill, sl,
          currentTargets: [[1.0, tp1]],
          target2R: [[1.0, tp2R]],
          staleH: 12, currentBeR: 1.0, time: bar.t,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. INSTITUTIONAL DOL (Dual OB + DOL Opposing Pool Runner)
    // ─────────────────────────────────────────────────────────────────────────
    if (stratId === "institutional") {
      for (let i = 40; i < m15.length - 5; i++) {
        const bar = m15[i];
        const dt = new Date(parseT(bar.t));
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        const dow = dt.getUTCDay();
        if (dow === 0 || dow === 6 || hour < 7.0 || hour >= 16.0) continue;

        const spreadPips = (bar.ac - bar.c) * mult;
        if (spreadPips > (pair.includes("XAU") ? 50 : 5)) continue;

        const h1Idx = Math.floor(i / 4);
        const h4Idx = Math.floor(i / 16);
        if (h1Idx < 20 || h4Idx < 20 || h1Idx >= h1C.length || h4Idx >= h4C.length) continue;
        const hAtr = h1Atr[h1Idx];
        if (hAtr <= 0) continue;

        const h1Sub = h1C.slice(Math.max(0, h1Idx - 120), h1Idx);
        const h4Sub = h4C.slice(Math.max(0, h4Idx - 120), h4Idx);
        const { trend: h1Trend } = classifyTrend(h1Sub, 2);
        if (h1Trend !== "BULLISH" && h1Trend !== "BEARISH") continue;

        const direction: "BUY" | "SELL" = h1Trend === "BULLISH" ? "BUY" : "SELL";
        const m15Sub = m15C.slice(Math.max(0, i - 120), i);

        const setup = findClassicSetup(h4Sub, m15Sub, hAtr, direction, {
          structPriorTrend: h1Trend, slAnchor: "sweep", h1: h1Sub, poiTimeframe: "ANY", dolTargeting: true
        });
        if (!setup) continue;

        const entryFill = direction === "BUY" ? bar.ac : bar.c;
        const sl = setup.sl;
        const risk = Math.abs(entryFill - sl);
        if (risk <= 0) continue;

        const tp1 = direction === "BUY" ? entryFill + 1.5 * risk : entryFill - 1.5 * risk;
        const tpDol = setup.tp2Dol || setup.tp2;
        const tp2R = direction === "BUY" ? entryFill + 2.0 * risk : entryFill - 2.0 * risk;

        signals.push({
          pair, idx: i, direction, entryFill, sl,
          currentTargets: [[0.5, tp1], [0.5, tpDol]],
          target2R: [[1.0, tp2R]],
          staleH: 12, currentBeR: 1.0, time: bar.t,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. ASIAN BREAKOUT (London Open Momentum Breakout)
    // ─────────────────────────────────────────────────────────────────────────
    if (stratId === "asian") {
      if (!ASIAN_ELIGIBLE_PAIRS.includes(pair)) continue;

      // Group Asian ranges by day
      const dailyAsian = new Map<string, { high: number; low: number; range: number }>();
      for (const b of m15C) {
        const dt = new Date(parseT(b.time!));
        const day = dt.toISOString().slice(0, 10);
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        if (hour >= 0 && hour < 7.0) {
          if (!dailyAsian.has(day)) dailyAsian.set(day, { high: -1e9, low: 1e9, range: 0 });
          const it = dailyAsian.get(day)!;
          it.high = Math.max(it.high, b.high);
          it.low = Math.min(it.low, b.low);
          it.range = it.high - it.low;
        }
      }

      const takenDays = new Set<string>();
      for (let i = 20; i < m15.length - 5; i++) {
        const bar = m15[i];
        const dt = new Date(parseT(bar.t));
        const day = dt.toISOString().slice(0, 10);
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        if (hour < 7.0 || hour >= 10.5) continue;
        if (takenDays.has(day) || !dailyAsian.has(day)) continue;

        const asian = dailyAsian.get(day)!;
        if (asian.range <= 0) continue;

        const h1Idx = Math.floor(i / 4);
        const atrVal = h1Atr[Math.min(h1Idx, h1Atr.length - 1)] || (asian.range * 1.5);
        if (asian.range < 0.36 * atrVal || asian.range > 1.35 * atrVal) continue;

        const barRange = bar.h - bar.l;
        if (barRange < 0.36 * asian.range) continue;

        let direction: "BUY" | "SELL" | null = null;
        let sl = 0;
        if (bar.c > asian.high && bar.o < asian.high && (bar.c - asian.high) > 0.06 * atrVal) {
          direction = "BUY";
          sl = asian.low - 0.08 * asian.range;
        } else if (bar.c < asian.low && bar.o > asian.low && (asian.low - bar.c) > 0.06 * atrVal) {
          direction = "SELL";
          sl = asian.high + 0.08 * asian.range;
        }
        if (!direction) continue;

        const entryFill = direction === "BUY" ? bar.ac : bar.c;
        const risk = Math.abs(entryFill - sl);
        if (risk <= 0) continue;

        const tp1 = direction === "BUY" ? entryFill + 1.5 * risk : entryFill - 1.5 * risk;
        const tp2 = direction === "BUY" ? entryFill + 4.0 * risk : entryFill - 4.0 * risk;
        const tp2R = direction === "BUY" ? entryFill + 2.0 * risk : entryFill - 2.0 * risk;

        signals.push({
          pair, idx: i, direction, entryFill, sl,
          currentTargets: [[0.35, tp1], [0.65, tp2]],
          target2R: [[1.0, tp2R]],
          staleH: 7, currentBeR: 0.8, time: bar.t,
        });
        takenDays.add(day);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TREND SWEEP (Option A: Metals & Yen Trend Core)
    // ─────────────────────────────────────────────────────────────────────────
    if (stratId === "trendsweep") {
      if (!TREND_SWEEP_PAIRS.includes(pair)) continue;

      for (let i = 35; i < m15.length - 5; i++) {
        const bar = m15[i];
        const dt = new Date(parseT(bar.t));
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        const dow = dt.getUTCDay();
        if (dow === 0 || dow === 6 || hour < 8.0 || hour >= 15.0) continue;

        const m15Sub = m15C.slice(0, i + 1);
        const res = evaluateTrendSweep(pair, m15Sub, h1C, i);
        if (!res.passed || !res.setup) continue;

        const setup = res.setup;
        const entryFill = setup.direction === "BUY" ? bar.ac : bar.c;
        const sl = setup.sl;
        const risk = Math.abs(entryFill - sl);
        if (risk <= 0) continue;

        const tp1 = direction_target(setup.direction, entryFill, 1.0 * risk);
        const tp2 = direction_target(setup.direction, entryFill, 2.5 * risk);
        const tp2R = direction_target(setup.direction, entryFill, 2.0 * risk);

        signals.push({
          pair, idx: i, direction: setup.direction, entryFill, sl,
          currentTargets: [[0.5, tp1], [0.5, tp2]],
          target2R: [[1.0, tp2R]],
          staleH: 8, currentBeR: 1.0, time: bar.t,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. ASIAN FADE (Option 1: Mean-Reversion False Breakout Fade)
    // ─────────────────────────────────────────────────────────────────────────
    if (stratId === "asianfade") {
      if (!ASIAN_FADE_PAIRS.includes(pair)) continue;

      for (let i = 50; i < m15.length - 5; i++) {
        const bar = m15[i];
        const dt = new Date(parseT(bar.t));
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        if (hour < 7.0 || hour >= 12.0) continue;

        const m15Sub = m15C.slice(0, i + 1);
        const res = evaluateAsianFade(pair, m15Sub, h1C, i);
        if (!res.passed || !res.setup) continue;

        const setup = res.setup;
        const entryFill = setup.direction === "BUY" ? bar.ac : bar.c;
        const sl = setup.sl;
        const risk = Math.abs(entryFill - sl);
        if (risk <= 0) continue;

        const tp1 = setup.tp1;
        const tp2 = setup.tp2;
        const tp2R = direction_target(setup.direction, entryFill, 2.0 * risk);

        signals.push({
          pair, idx: i, direction: setup.direction, entryFill, sl,
          currentTargets: [[0.5, tp1], [0.5, tp2]],
          target2R: [[1.0, tp2R]],
          staleH: 12, currentBeR: 1.0, time: bar.t,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. PRECISION INTRADAY (13-Step Sequence Course Model)
    // ─────────────────────────────────────────────────────────────────────────
    if (stratId === "precision") {
      for (let i = 40; i < m15.length - 5; i += 4) { // evaluate once per hour (matches live cycle cadence)
        const bar = m15[i];
        const dt = new Date(parseT(bar.t));
        const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
        const dow = dt.getUTCDay();
        if (dow === 0 || dow === 6 || hour < 7.0 || hour >= 16.0) continue;

        const h1Idx = Math.floor(i / 4);
        const h4Idx = Math.floor(i / 16);
        if (h1Idx < 20 || h4Idx < 20) continue;

        const h4Sub = h4C.slice(0, h4Idx);
        const h1Sub = h1C.slice(0, h1Idx);
        const m15Sub = m15C.slice(0, i);

        const prec = runPrecisionSequence(pair, h4Sub, h1Sub, m15Sub);
        if (!prec.qualified || !prec.direction || !prec.entry || !prec.sl || !prec.tp) continue;

        const entryFill = prec.direction === "BUY" ? bar.ac : bar.c;
        const sl = prec.sl;
        const risk = Math.abs(entryFill - sl);
        if (risk <= 0) continue;

        const tp1 = prec.tp;
        const tp2R = direction_target(prec.direction, entryFill, 2.0 * risk);

        signals.push({
          pair, idx: i, direction: prec.direction, entryFill, sl,
          currentTargets: [[1.0, tp1]],
          target2R: [[1.0, tp2R]],
          staleH: 12, currentBeR: 1.0, time: bar.t,
        });
      }
    }
  }

  return signals;
}

function direction_target(dir: "BUY" | "SELL", entry: number, distance: number): number {
  return dir === "BUY" ? entry + distance : entry - distance;
}

// ── Run Evaluation Across Exit Models ───────────────────────────────────────
const STRATEGIES: { id: string; name: string; icon: string }[] = [
  { id: "mpr", name: "Core SMC / MPR", icon: "⚡" },
  { id: "classic", name: "Classic SMC", icon: "🏛" },
  { id: "institutional", name: "Institutional DOL", icon: "💎" },
  { id: "asian", name: "Asian Breakout", icon: "🚀" },
  { id: "trendsweep", name: "Trend Sweep", icon: "🌊" },
  { id: "asianfade", name: "Asian Fade", icon: "🎯" },
  { id: "precision", name: "Precision Intraday", icon: "🎯" },
];

console.log("\n==========================================================================================");
console.log("BACKTEST EXPERIMENT: STRAIGHT 1:2 R:R FULL CLOSE VS CURRENT PRODUCTION EXIT MODELS");
console.log("==========================================================================================");

interface ComparisonRow {
  strategy: string;
  // Current Live Model
  curTrades: number;
  curWins: number;
  curLosses: number;
  curWr: number;
  curR: number;
  curPf: number;
  curDd: number;
  // Straight 1:2 with Auto-BE
  beTrades: number;
  beWins: number;
  beLosses: number;
  beWr: number;
  beR: number;
  bePf: number;
  beDd: number;
  // Straight 1:2 Pure (No BE)
  pureTrades: number;
  pureWins: number;
  pureLosses: number;
  pureWr: number;
  pureR: number;
  purePf: number;
  pureDd: number;
}

const results: ComparisonRow[] = [];

for (const strat of STRATEGIES) {
  process.stdout.write(`Simulating ${strat.name}... `);
  const rawSignals = generateSignals(strat.id);

  // Group signals per pair
  const byPair = new Map<string, RawSignal[]>();
  for (const s of rawSignals) {
    if (!byPair.has(s.pair)) byPair.set(s.pair, []);
    byPair.get(s.pair)!.push(s);
  }

  // Helper to simulate book with cooldown
  const runBook = (mode: "current" | "1to2_be" | "1to2_pure") => {
    const executed: { r: number; time: string }[] = [];

    for (const [p, sigs] of byPair.entries()) {
      const pdata = allData.find(x => x.pair === p)!;
      let cooldownUntil = 0;

      for (const sig of sigs) {
        if (sig.idx < cooldownUntil) continue;

        let targets: [number, number][];
        let beR: number;

        if (mode === "current") {
          targets = sig.currentTargets;
          beR = sig.currentBeR;
        } else if (mode === "1to2_be") {
          targets = sig.target2R;
          beR = 1.0;
        } else {
          targets = sig.target2R;
          beR = 0; // Pure binary 1:2 (No BE)
        }

        const sim = simulateTrade(pdata.m15, sig.idx, sig.direction, sig.entryFill, sig.sl, targets, beR, sig.staleH);
        if (sim) {
          executed.push({ r: sim.r, time: sig.time });
          cooldownUntil = sim.closeIdx + 2;
        }
      }
    }
    return calcMetrics(executed);
  };

  const mCur = runBook("current");
  const mBe = runBook("1to2_be");
  const mPure = runBook("1to2_pure");

  console.log("Done.");
  results.push({
    strategy: `${strat.icon} ${strat.name}`,
    curTrades: mCur.trades, curWins: mCur.wins, curLosses: mCur.losses, curWr: mCur.winRate, curR: mCur.rSum, curPf: mCur.profitFactor, curDd: mCur.maxDrawdown,
    beTrades: mBe.trades, beWins: mBe.wins, beLosses: mBe.losses, beWr: mBe.winRate, beR: mBe.rSum, bePf: mBe.profitFactor, beDd: mBe.maxDrawdown,
    pureTrades: mPure.trades, pureWins: mPure.wins, pureLosses: mPure.losses, pureWr: mPure.winRate, pureR: mPure.rSum, purePf: mPure.profitFactor, pureDd: mPure.maxDrawdown,
  });
}

// ── Print Formatted Table ───────────────────────────────────────────────────
console.log("\n" + "=".repeat(154));
console.log(
  `| ${"STRATEGY".padEnd(23)} | ${"CURRENT LIVE MODEL".padEnd(40)} | ${"STRAIGHT 1:2 (WITH AUTO-BE)".padEnd(40)} | ${"STRAIGHT 1:2 PURE (NO BE)".padEnd(40)} |`
);
console.log(
  `| ${"".padEnd(23)} | ${"Trades (W / L) | Win% | Net R | PF | DD".padEnd(40)} | ${"Trades (W / L) | Win% | Net R | PF | DD".padEnd(40)} | ${"Trades (W / L) | Win% | Net R | PF | DD".padEnd(40)} |`
);
console.log("=".repeat(154));

for (const r of results) {
  const cCur = `${r.curTrades.toString().padStart(2)} (${r.curWins.toString().padStart(2)}W / ${r.curLosses.toString().padStart(2)}L) | ${r.curWr.toFixed(1).padStart(4)}% | ${(r.curR >= 0 ? "+" : "") + r.curR.toFixed(1).padStart(5)}R | ${r.curPf.toFixed(2)} | ${r.curDd.toFixed(1).padStart(5)}R`.padEnd(40);
  const cBe = `${r.beTrades.toString().padStart(2)} (${r.beWins.toString().padStart(2)}W / ${r.beLosses.toString().padStart(2)}L) | ${r.beWr.toFixed(1).padStart(4)}% | ${(r.beR >= 0 ? "+" : "") + r.beR.toFixed(1).padStart(5)}R | ${r.bePf.toFixed(2)} | ${r.beDd.toFixed(1).padStart(5)}R`.padEnd(40);
  const cPure = `${r.pureTrades.toString().padStart(2)} (${r.pureWins.toString().padStart(2)}W / ${r.pureLosses.toString().padStart(2)}L) | ${r.pureWr.toFixed(1).padStart(4)}% | ${(r.pureR >= 0 ? "+" : "") + r.pureR.toFixed(1).padStart(5)}R | ${r.purePf.toFixed(2)} | ${r.pureDd.toFixed(1).padStart(5)}R`.padEnd(40);
  console.log(`| ${r.strategy.padEnd(23)} | ${cCur} | ${cBe} | ${cPure} |`);
}
console.log("=".repeat(154));
console.log("CONFIRMATION: ZERO LIVE PRODUCTION CODE WAS MUTATED. THIS IS 100% STANDALONE REPLAY.");
