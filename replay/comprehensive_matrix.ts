import * as fs from "fs";
import * as path from "path";
import { findMomentumPauseSetup } from "../momentumPauseRetest";
import { findClassicSetup } from "../classicSetup";
import { runPrecisionSequence } from "../precisionEngine";

type Bar = { t: string; o: number; h: number; l: number; c: number; ao: number; ah: number; al: number; ac: number };
type Candle = { open: number; high: number; low: number; close: number; time?: string };

const DATA = path.join(process.cwd(), "replay", "data");
const PAIRS: [string, string][] = [
  ["EUR/USD", "EURUSD"], ["GBP/USD", "GBPUSD"], ["USD/JPY", "USDJPY"], ["USD/CHF", "USDCHF"],
  ["USD/CAD", "USDCAD"], ["AUD/USD", "AUDUSD"], ["NZD/USD", "NZDUSD"], ["GBP/JPY", "GBPJPY"],
  ["EUR/JPY", "EURJPY"], ["XAU/USD", "GOLD"], ["XAG/USD", "SILVER"],
];

const parseT = (t: string) => new Date(/[zZ+]/.test(t) ? t : t + "Z").getTime();
const toCandle = (b: Bar): Candle => ({ open: b.o, high: b.h, low: b.l, close: b.c, time: b.t });
const pipMult = (pair: string) => pair.includes("XAU") ? 10 : (pair.includes("XAG") || pair.includes("JPY")) ? 100 : 10000;

function atrS(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function findSwings(candles: Candle[], lookback = 2) {
  const highs: any[] = [];
  const lows: any[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[i].high < candles[j].high) isHigh = false;
      if (candles[i].low > candles[j].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].time });
    if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].time });
  }
  return { highs, lows };
}

function classifyTrend(candles: Candle[], lookback = 2) {
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

function findOrderBlock(candles: Candle[], trend: string, atrVal: number) {
  if (trend !== "BULLISH" && trend !== "BEARISH") return null;
  const searchStart = Math.max(0, candles.length - 40);
  for (let i = candles.length - 3; i > searchStart; i--) {
    const c = candles[i];
    if (trend === "BULLISH") {
      if (c.close >= c.open) continue;
      const impulse = candles.slice(i + 1, i + 4);
      if (impulse.length < 2) continue;
      const move = impulse.reduce((acc, x) => acc + (x.close - x.open), 0);
      const dispAtr = move / atrVal;
      const allBull = impulse.every(x => x.close > x.open);
      if (move >= 1.5 * atrVal && allBull) {
        return { type: "BULLISH_OB", direction: "BUY", high: c.high, low: c.low, index: i, valid: dispAtr >= 1.5 };
      }
    } else {
      if (c.close <= c.open) continue;
      const impulse = candles.slice(i + 1, i + 4);
      if (impulse.length < 2) continue;
      const move = Math.abs(impulse.reduce((acc, x) => acc + (x.close - x.open), 0));
      const dispAtr = move / atrVal;
      const allBear = impulse.every(x => x.close < x.open);
      if (move >= 1.5 * atrVal && allBear) {
        return { type: "BEARISH_OB", direction: "SELL", high: c.high, low: c.low, index: i, valid: dispAtr >= 1.5 };
      }
    }
  }
  return null;
}

function findFVG(candles: Candle[], trend: string) {
  const fvgs: any[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    if (trend !== "BEARISH" && candles[i - 1].low > candles[i + 1].high) {
      fvgs.push({ type: "BULLISH_FVG", direction: "BUY", top: candles[i - 1].low, bottom: candles[i + 1].high, index: i, valid: true });
    }
    if (trend !== "BULLISH" && candles[i - 1].high < candles[i + 1].low) {
      fvgs.push({ type: "BEARISH_FVG", direction: "SELL", top: candles[i + 1].low, bottom: candles[i - 1].high, index: i, valid: true });
    }
  }
  return fvgs.slice(-3);
}

function checkPoiFreshness(candles: Candle[], poi: any) {
  const idx = poi.index + 1;
  const high = poi.high || poi.top;
  const low = poi.low || poi.bottom;
  let touches = 0;
  for (let i = idx; i < candles.length; i++) {
    const c = candles[i];
    if (c.low <= high && c.high >= low) {
      touches++;
      const body = Math.abs(c.close - c.open);
      const rng = c.high - c.low;
      const isStrongBody = rng > 0 ? body > 0.5 * rng : false;
      if (poi.direction === "BUY") {
        if (c.close < low && isStrongBody && c.close < c.open) return "DEAD";
      } else {
        if (c.close > high && isStrongBody && c.close > c.open) return "DEAD";
      }
    }
  }
  return touches === 0 ? "FRESH" : "USED";
}

function checkEntryCandle(candles: Candle[], direction: "BUY" | "SELL") {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(curr.close - curr.open);
  const rng = curr.high - curr.low;
  if (rng === 0) return false;
  const bodyRatio = body / rng;
  if (direction === "BUY") {
    if (curr.close <= curr.open) {
      return prev.close < prev.open && curr.close > prev.open && curr.open < prev.close;
    }
    if (bodyRatio >= 0.60) return true;
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;
    return (lowerWick / rng) > 0.50;
  } else {
    if (curr.close >= curr.open) {
      return prev.close > prev.open && curr.close < prev.open && curr.open > prev.close;
    }
    if (bodyRatio >= 0.60) return true;
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    return (upperWick / rng) > 0.50;
  }
}

function verifySpread(pair: string, spreadPips: number) {
  if (pair.includes("XAU")) return spreadPips > 50 ? "FAIL" : "PASS";
  if (pair.includes("XAG")) return spreadPips > 15 ? "FAIL" : "PASS";
  return spreadPips > 5 ? "FAIL" : "PASS";
}

function sessionCanTrade(ms: number): boolean {
  const d = new Date(ms);
  const dow = d.getUTCDay();
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (dow === 6) return false;
  if (dow === 0 && hour < 21) return false;
  if (hour < 7) return false;
  return true;
}

interface TradeRec {
  pair: string; direction: "BUY" | "SELL"; time: string;
  entry: number; sl: number; tp1: number; risk: number;
  closeTime: string; exit: number; r: number; reason: string; holdH: number;
}

/** Trade simulator with configurable management knobs */
function simulateTradeCustom(
  m15: Bar[], entryIdx: number, dir: "BUY" | "SELL",
  entryFill: number, sl0: number, tp1: number,
  options: { beTriggerR?: number; stalenessHours?: number } = {}
): { r: number; reason: string; closeIdx: number; closeTime: string; exit: number; holdH: number } {
  const risk = Math.abs(entryFill - sl0);
  let sl = sl0;
  let be = false;
  const beR = options.beTriggerR ?? 1.0;
  const staleH = options.stalenessHours ?? 12;
  const t0 = parseT(m15[entryIdx].t);

  for (let j = entryIdx + 1; j < m15.length; j++) {
    const b = m15[j];
    const exitLow = dir === "BUY" ? b.l : b.al;
    const exitHigh = dir === "BUY" ? b.h : b.ah;
    const exitClose = dir === "BUY" ? b.c : b.ac;
    const ageH = (parseT(b.t) - t0) / 3600000;

    // Staleness check
    if (staleH > 0 && ageH >= staleH && !be && risk > 0) {
      const prog = dir === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk;
      if (prog < 0) {
        return { r: prog, reason: "STALE", closeIdx: j, closeTime: b.t, exit: exitClose, holdH: ageH };
      }
    }

    // SL check (conservative within-bar)
    if (dir === "BUY" ? exitLow <= sl : exitHigh >= sl) {
      const r = dir === "BUY" ? (sl - entryFill) / risk : (entryFill - sl) / risk;
      return { r, reason: be ? "BE" : "SL", closeIdx: j, closeTime: b.t, exit: sl, holdH: ageH };
    }

    // TP check
    if (dir === "BUY" ? exitHigh >= tp1 : exitLow <= tp1) {
      const r = dir === "BUY" ? (tp1 - entryFill) / risk : (entryFill - tp1) / risk;
      return { r, reason: "TP1", closeIdx: j, closeTime: b.t, exit: tp1, holdH: ageH };
    }

    // BE Trigger
    if (beR > 0 && !be && risk > 0 && (dir === "BUY" ? exitHigh >= entryFill + beR * risk : exitLow <= entryFill - beR * risk)) {
      be = true;
      sl = entryFill;
    }
  }

  const lb = m15[m15.length - 1];
  const exitClose = dir === "BUY" ? lb.c : lb.ac;
  const r = risk > 0 ? (dir === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk) : 0;
  return { r, reason: "EOD", closeIdx: m15.length - 1, closeTime: lb.t, exit: exitClose, holdH: (parseT(lb.t) - t0) / 3600000 };
}

function loadBars(epic: string, tf: string): Bar[] {
  const p = path.join(DATA, `${epic}_${tf}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/* ═══════════════════════════════════════════════════════════════════════════
   STRATEGY DEFINITIONS FOR COMPREHENSIVE MATRIX
   ═══════════════════════════════════════════════════════════════════════════ */

interface StrategySpec {
  id: string;
  family: "CLASSIC" | "PRECISION" | "MPR" | "HYBRID";
  name: string;
  targetR: number;              // Target multiple (e.g. 1.5, 2.0, 2.5, 3.0) or 0 for structural
  minRrFloor: number;
  beTriggerR: number;           // 1.0 for standard BE, 0 for no BE
  stalenessHours: number;       // 12 for standard, 0 for none
  execution: "market" | "limit_poi" | "limit_touch_mpr";
  classicOpts?: {
    structPriorTrend?: "H1" | "M15";
    slAnchor?: "sweep" | "poi";
  };
  mprOpts?: {
    consolMaxAtr?: number;
    momentumBodyMultiple?: number;
  };
}

const STRATEGIES: StrategySpec[] = [
  // ── FAMILY 1: CLASSIC SMC SWEEP + CHOCH/BOS ──
  { id: "classic_h1_sweep_15r", family: "CLASSIC", name: "Classic (H1 Prior, Sweep SL, 1.5R, BE=1R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },
  { id: "classic_h1_sweep_20r", family: "CLASSIC", name: "Classic (H1 Prior, Sweep SL, 2.0R, BE=1R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },
  { id: "classic_h1_sweep_25r", family: "CLASSIC", name: "Classic (H1 Prior, Sweep SL, 2.5R, BE=1R)", targetR: 2.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },
  { id: "classic_h1_sweep_30r", family: "CLASSIC", name: "Classic (H1 Prior, Sweep SL, 3.0R, BE=1R)", targetR: 3.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },
  { id: "classic_h1_sweep_no_be", family: "CLASSIC", name: "Classic (H1 Prior, Sweep SL, 1.5R, NO BE)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },
  { id: "classic_h1_sweep_no_stale", family: "CLASSIC", name: "Classic (H1 Prior, Sweep SL, 1.5R, NO Staleness)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 0, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },
  
  { id: "classic_m15_sweep_15r", family: "CLASSIC", name: "Classic (M15 Prior, Sweep SL, 1.5R, BE=1R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "M15", slAnchor: "sweep" } },
  { id: "classic_m15_sweep_20r", family: "CLASSIC", name: "Classic (M15 Prior, Sweep SL, 2.0R, BE=1R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "M15", slAnchor: "sweep" } },
  { id: "classic_m15_sweep_25r", family: "CLASSIC", name: "Classic (M15 Prior, Sweep SL, 2.5R, BE=1R)", targetR: 2.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "M15", slAnchor: "sweep" } },
  { id: "classic_m15_sweep_no_be", family: "CLASSIC", name: "Classic (M15 Prior, Sweep SL, 1.5R, NO BE)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "M15", slAnchor: "sweep" } },

  { id: "classic_h1_poi_15r", family: "CLASSIC", name: "Classic (H1 Prior, POI SL, 1.5R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "poi" } },
  { id: "classic_h1_poi_20r", family: "CLASSIC", name: "Classic (H1 Prior, POI SL, 2.0R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", classicOpts: { structPriorTrend: "H1", slAnchor: "poi" } },

  // Limit order at POI edge for Classic
  { id: "classic_limit_poi_15r", family: "CLASSIC", name: "Classic (Limit @ POI edge, 1.5R, BE=1R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "limit_poi", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },
  { id: "classic_limit_poi_20r", family: "CLASSIC", name: "Classic (Limit @ POI edge, 2.0R, BE=1R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "limit_poi", classicOpts: { structPriorTrend: "H1", slAnchor: "sweep" } },

  // ── FAMILY 2: PRECISION INTRADAY (13-Step Sequence) ──
  { id: "precision_structural", family: "PRECISION", name: "Precision (13-step, Structural Opposing Target, RR>=2.0)", targetR: 0, minRrFloor: 2.0, beTriggerR: 1.0, stalenessHours: 12, execution: "market" },
  { id: "precision_fixed_20r", family: "PRECISION", name: "Precision (13-step, Fixed 2.0R Target, BE=1R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market" },
  { id: "precision_fixed_15r", family: "PRECISION", name: "Precision (13-step, Fixed 1.5R Target, BE=1R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market" },
  { id: "precision_no_be", family: "PRECISION", name: "Precision (13-step, Fixed 2.0R, NO BE)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 0, stalenessHours: 12, execution: "market" },

  // ── FAMILY 3: MPR (Momentum-Pause-Retest) ──
  { id: "mpr_market_baseline", family: "MPR", name: "MPR (At-Market Baseline, 1.5R, BE=1R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market" },
  { id: "mpr_market_20r", family: "MPR", name: "MPR (At-Market, 2.0R, BE=1R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market" },
  { id: "mpr_market_no_be", family: "MPR", name: "MPR (At-Market, 1.5R, NO BE)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 0, stalenessHours: 12, execution: "market" },
  { id: "mpr_limit_touch_15r", family: "MPR", name: "MPR (Limit Touch-Fill @ Midpoint, 1.5R, BE=1R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "limit_touch_mpr" },
  { id: "mpr_limit_touch_20r", family: "MPR", name: "MPR (Limit Touch-Fill @ Midpoint, 2.0R, BE=1R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "limit_touch_mpr" },
  { id: "mpr_limit_touch_25r", family: "MPR", name: "MPR (Limit Touch-Fill @ Midpoint, 2.5R, BE=1R)", targetR: 2.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "limit_touch_mpr" },
  { id: "mpr_limit_touch_no_be", family: "MPR", name: "MPR (Limit Touch-Fill @ Midpoint, 1.5R, NO BE)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 0, stalenessHours: 12, execution: "limit_touch_mpr" },
  
  // High-displacement MPR (momentumBodyMultiple = 2.0x instead of 1.5x)
  { id: "mpr_high_disp_limit", family: "MPR", name: "MPR (High Disp 2.0x Body, Limit Touch, 1.5R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "limit_touch_mpr", mprOpts: { momentumBodyMultiple: 2.0 } },
  { id: "mpr_high_disp_market", family: "MPR", name: "MPR (High Disp 2.0x Body, At-Market, 1.5R)", targetR: 1.5, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "market", mprOpts: { momentumBodyMultiple: 2.0 } },

  // ── FAMILY 4: HYBRID (Sweep + Structural Alignment + Retest) ──
  { id: "hybrid_classic_mpr", family: "HYBRID", name: "Hybrid (H4 Sweep -> M15 CHOCH -> MPR Retest Limit, 2.0R)", targetR: 2.0, minRrFloor: 1.5, beTriggerR: 1.0, stalenessHours: 12, execution: "limit_touch_mpr" },
];

function runMatrix() {
  const allPairData = PAIRS.map(([pair, epic]) => ({
    pair,
    epic,
    mult: pipMult(pair),
    m15: loadBars(epic, "M15"),
    h1: loadBars(epic, "H1"),
    h4: loadBars(epic, "H4"),
    d1: loadBars(epic, "D1"),
  }));

  const tradeBooks: Record<string, TradeRec[]> = {};
  for (const s of STRATEGIES) tradeBooks[s.id] = [];

  const WARMUP = 400;

  for (const { pair, m15, h1, h4, d1, mult } of allPairData) {
    let h1p = 0, h4p = 0, d1p = 0;

    const cooldowns = new Map<string, number>();
    const pendings = new Map<string, { idx: number; dir: "BUY" | "SELL"; limit: number; sl: number; tp1: number }>();
    for (const s of STRATEGIES) cooldowns.set(s.id, 0);

    for (let i = WARMUP; i < m15.length; i++) {
      const bar = m15[i];
      const E = parseT(bar.t);
      while (h1p < h1.length && parseT(h1[h1p].t) <= E) h1p++;
      while (h4p < h4.length && parseT(h4[h4p].t) <= E) h4p++;
      while (d1p < d1.length && parseT(d1[d1p].t) <= E) d1p++;
      if (h1p < 60 || h4p < 60 || d1p < 20) continue;

      if (!sessionCanTrade(E)) continue;

      const spreadPips = (bar.ac - bar.c) * mult;
      if (verifySpread(pair, spreadPips) === "FAIL") continue;

      // Check active limit pendings
      for (const s of STRATEGIES) {
        if (s.execution === "limit_touch_mpr" || s.execution === "limit_poi") {
          const pend = pendings.get(s.id);
          if (pend) {
            const ageBars = i - pend.idx;
            if (ageBars > 16) { // 4 hours
              pendings.delete(s.id);
            } else if (pend.dir === "BUY" ? bar.l <= pend.sl : bar.h >= pend.sl) {
              pendings.delete(s.id);
            } else if (pend.dir === "BUY" ? bar.al <= pend.limit : bar.ah >= pend.limit) {
              // Filled!
              pendings.delete(s.id);
              const sim = simulateTradeCustom(m15, i, pend.dir, pend.limit, pend.sl, pend.tp1, {
                beTriggerR: s.beTriggerR,
                stalenessHours: s.stalenessHours
              });
              const risk = Math.abs(pend.limit - pend.sl);
              tradeBooks[s.id].push({
                pair, direction: pend.dir, time: m15[i].t, entry: pend.limit, sl: pend.sl, tp1: pend.tp1, risk,
                closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
                reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
              });
              cooldowns.set(s.id, sim.closeIdx + 2);
            }
          }
        }
      }

      // Build synthesized candles
      const h1C: Candle[] = h1.slice(Math.max(0, h1p - 119), h1p).map(toCandle);
      const h4C: Candle[] = h4.slice(Math.max(0, h4p - 119), h4p).map(toCandle);
      const d1C: Candle[] = d1.slice(Math.max(0, d1p - 99), d1p).map(toCandle);

      const synthFromM15 = (periodMs: number): Candle | null => {
        const start = E - ((E % periodMs) ? (E % periodMs) : periodMs);
        let o: number | null = null, h = -Infinity, l = Infinity, c = 0, tHit = false;
        for (let k = i; k >= 0 && parseT(m15[k].t) > start - 1; k--) {
          const tm = parseT(m15[k].t);
          if (tm <= start) break;
          tHit = true;
          if (o === null) { o = m15[k].o; }
          h = Math.max(h, m15[k].h); l = Math.min(l, m15[k].l); c = m15[k].c;
        }
        return tHit && o !== null ? { open: o, high: h, low: l, close: c, time: bar.t } : null;
      };
      const h1Part = synthFromM15(3600000);
      if (h1Part) h1C.push(h1Part);
      const h4Part = synthFromM15(4 * 3600000);
      if (h4Part) h4C.push(h4Part);
      const m15All: Candle[] = m15.slice(Math.max(0, i - 119), i + 1).map(toCandle);
      const m15Closed = m15All.slice(0, -1); // Closed candles only

      const hAtr = atrS(h1C, 14);
      if (!(hAtr > 0)) continue;

      // Higher-timeframe confluence checks
      const h1TrendInfo = classifyTrend(h1C, 2);
      const h1Trend = h1TrendInfo.trend;
      const dTrend = d1C.length >= 20 ? classifyTrend(d1C, 2).trend : "RANGE";
      const pd = getPremiumDiscount(h1C, hAtr);
      const direction: "BUY" | "SELL" = (pd.zone === "DISCOUNT" || pd.pos <= 0.5) ? "BUY" : "SELL";

      const trendOk = h1Trend !== "RANGE" && h1Trend !== "UNCLEAR";
      const dailyOk = !(dTrend !== "RANGE" && dTrend !== "UNCLEAR" && dTrend !== h1Trend);
      const pdOk = pd.zone !== "COMPRESSED" && pd.zone !== "EQ";
      const tzOk = !((h1Trend === "BULLISH" && pd.zone === "PREMIUM") || (h1Trend === "BEARISH" && pd.zone === "DISCOUNT"));

      const h4AtrLocal = atrS(h4C, 14) || hAtr;
      let poi: any = findOrderBlock(h4C, h1Trend, h4AtrLocal);
      let poiSource = "H4_OB";
      if (!poi || !poi.valid) {
        const p2 = findOrderBlock(m15Closed, h1Trend, atrS(m15Closed, 14) || hAtr);
        if (p2 && p2.valid) { poi = p2; poiSource = "M15_OB"; }
      }
      if (!poi || !poi.valid) {
        const fvgs = findFVG(h4C, h1Trend);
        if (fvgs.length > 0) {
          const best = fvgs[fvgs.length - 1];
          poi = { type: best.type, direction, high: best.top, low: best.bottom, index: best.index, valid: true };
          poiSource = "H4_FVG";
        }
      }
      const poiExists = !!(poi && poi.valid);
      const poiFresh = poiExists ? checkPoiFreshness(h4C, poi) !== "DEAD" : false;

      const confluenceOk = trendOk && dailyOk && pdOk && tzOk && poiExists && poiFresh;

      // Confirmation candle on M15 closed
      const m15Ok = checkEntryCandle(m15Closed, direction);

      // Evaluate each strategy in the matrix
      for (const strat of STRATEGIES) {
        if ((cooldowns.get(strat.id) ?? 0) > i) continue;

        // 1. CLASSIC FAMILY
        if (strat.family === "CLASSIC") {
          if (!confluenceOk) continue;
          const prior = strat.classicOpts?.structPriorTrend === "M15" ? undefined : h1Trend;
          const anchor = strat.classicOpts?.slAnchor ?? "sweep";
          const cl = findClassicSetup(h4C, m15Closed, hAtr, direction, { structPriorTrend: prior, slAnchor: anchor });
          if (!cl) continue;

          const risk = cl.slDistance;
          if (risk <= 0) continue;
          const targetMultiplier = strat.targetR > 0 ? strat.targetR : 1.5;
          const tpLevel = direction === "BUY" ? cl.entry + targetMultiplier * risk : cl.entry - targetMultiplier * risk;

          if (strat.execution === "market") {
            const fill = direction === "BUY" ? bar.ac : bar.c;
            const inBand = direction === "BUY" ? (fill > cl.sl && fill < tpLevel) : (fill < cl.sl && fill > tpLevel);
            if (!inBand) continue;

            const sim = simulateTradeCustom(m15, i, direction, fill, cl.sl, tpLevel, {
              beTriggerR: strat.beTriggerR,
              stalenessHours: strat.stalenessHours
            });
            tradeBooks[strat.id].push({
              pair, direction, time: bar.t, entry: fill, sl: cl.sl, tp1: tpLevel, risk: Math.abs(fill - cl.sl),
              closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
              reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
            });
            cooldowns.set(strat.id, sim.closeIdx + 2);
          } else if (strat.execution === "limit_poi") {
            // Stage limit at POI boundary
            const poiEntry = direction === "BUY" ? cl.poiHigh : cl.poiLow;
            const limRisk = Math.abs(poiEntry - cl.sl);
            if (limRisk <= 0) continue;
            const limTp = direction === "BUY" ? poiEntry + targetMultiplier * limRisk : poiEntry - targetMultiplier * limRisk;
            if (!pendings.has(strat.id)) {
              pendings.set(strat.id, { idx: i, dir: direction, limit: poiEntry, sl: cl.sl, tp1: limTp });
            }
          }
        }

        // 2. PRECISION FAMILY
        if (strat.family === "PRECISION") {
          const prec = runPrecisionSequence(pair, h4C, h1C, m15Closed);
          if (!prec.qualified || !prec.direction || !prec.entry || !prec.sl) continue;

          const pRisk = Math.abs(prec.entry - prec.sl);
          if (pRisk <= 0) continue;

          let targetPrice = prec.tp;
          if (strat.targetR > 0) {
            targetPrice = prec.direction === "BUY" ? prec.entry + strat.targetR * pRisk : prec.entry - strat.targetR * pRisk;
          }
          if (!targetPrice) continue;

          const fill = prec.direction === "BUY" ? bar.ac : bar.c;
          const inBand = prec.direction === "BUY" ? (fill > prec.sl && fill < targetPrice) : (fill < prec.sl && fill > targetPrice);
          if (!inBand) continue;

          const sim = simulateTradeCustom(m15, i, prec.direction, fill, prec.sl, targetPrice, {
            beTriggerR: strat.beTriggerR,
            stalenessHours: strat.stalenessHours
          });
          tradeBooks[strat.id].push({
            pair, direction: prec.direction, time: bar.t, entry: fill, sl: prec.sl, tp1: targetPrice, risk: Math.abs(fill - prec.sl),
            closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
            reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
          });
          cooldowns.set(strat.id, sim.closeIdx + 2);
        }

        // 3. MPR FAMILY
        if (strat.family === "MPR") {
          if (!confluenceOk || !m15Ok) continue;
          const mpr = findMomentumPauseSetup(h1C, direction, hAtr, strat.mprOpts ?? {});
          if (!mpr) continue;

          const mRisk = mpr.slDistance;
          if (mRisk <= 0) continue;
          const targetMultiplier = strat.targetR > 0 ? strat.targetR : 1.5;
          const targetPrice = direction === "BUY" ? mpr.entry + targetMultiplier * mRisk : mpr.entry - targetMultiplier * mRisk;
          const planRr = Math.abs(targetPrice - mpr.entry) / mRisk;
          if (Number(planRr.toFixed(2)) < strat.minRrFloor) continue;

          if (strat.execution === "market") {
            const fill = direction === "BUY" ? bar.ac : bar.c;
            const inBand = direction === "BUY" ? (fill > mpr.sl && fill < targetPrice) : (fill < mpr.sl && fill > targetPrice);
            if (!inBand) continue;

            const sim = simulateTradeCustom(m15, i, direction, fill, mpr.sl, targetPrice, {
              beTriggerR: strat.beTriggerR,
              stalenessHours: strat.stalenessHours
            });
            tradeBooks[strat.id].push({
              pair, direction, time: bar.t, entry: fill, sl: mpr.sl, tp1: targetPrice, risk: Math.abs(fill - mpr.sl),
              closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
              reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
            });
            cooldowns.set(strat.id, sim.closeIdx + 2);
          } else if (strat.execution === "limit_touch_mpr") {
            if (!pendings.has(strat.id)) {
              pendings.set(strat.id, { idx: i, dir: direction, limit: mpr.entry, sl: mpr.sl, tp1: targetPrice });
            }
          }
        }

        // 4. HYBRID FAMILY (H4 Sweep -> M15 CHOCH -> MPR Retest Limit)
        if (strat.family === "HYBRID") {
          if (!confluenceOk) continue;
          const cl = findClassicSetup(h4C, m15Closed, hAtr, direction, { structPriorTrend: h1Trend, slAnchor: "sweep" });
          if (!cl) continue;
          // When classic setup triggers, search for an MPR pause on H1
          const mpr = findMomentumPauseSetup(h1C, direction, hAtr, {});
          if (!mpr) continue;
          const targetMultiplier = 2.0;
          const targetPrice = direction === "BUY" ? mpr.entry + targetMultiplier * mpr.slDistance : mpr.entry - targetMultiplier * mpr.slDistance;
          if (!pendings.has(strat.id)) {
            pendings.set(strat.id, { idx: i, dir: direction, limit: mpr.entry, sl: cl.sl, tp1: targetPrice });
          }
        }
      }
    }
  }

  // Compile Comprehensive Results
  const reportRows: any[] = [];
  for (const strat of STRATEGIES) {
    const ts = tradeBooks[strat.id];
    const wins = ts.filter(t => t.r > 0).length;
    const losses = ts.filter(t => t.r <= 0).length;
    const wr = ts.length > 0 ? (wins / ts.length) * 100 : 0;
    const rSum = ts.reduce((sum, t) => sum + t.r, 0);
    const avgR = ts.length > 0 ? rSum / ts.length : 0;
    const tradesPerWeek = ts.length / (92 / 7);

    // Calculate breakeven win rate needed for this target
    // If targetR is 1.5R, breakeven WR is 1 / (1 + 1.5) = 40%
    const effTargetR = strat.targetR > 0 ? strat.targetR : 2.0;
    const breakevenWr = (1.0 / (1.0 + effTargetR)) * 100;
    const wrEdge = wr - breakevenWr;

    let eq = 0, peak = 0, maxDD = 0;
    for (const t of [...ts].sort((a, b) => a.time.localeCompare(b.time))) {
      eq += t.r; peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq - peak);
    }

    const retToDd = maxDD < 0 ? (rSum / Math.abs(maxDD)) : (rSum > 0 ? 99 : 0);
    const profitTrades = ts.filter(t => t.r > 0).reduce((s, t) => s + t.r, 0);
    const lossTrades = Math.abs(ts.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0));
    const profitFactor = lossTrades > 0 ? profitTrades / lossTrades : (profitTrades > 0 ? 99 : 0);

    reportRows.push({
      id: strat.id,
      family: strat.family,
      name: strat.name,
      trades: ts.length,
      tradesPerWeek: Number(tradesPerWeek.toFixed(1)),
      winRate: Number(wr.toFixed(1)),
      breakevenWr: Number(breakevenWr.toFixed(1)),
      wrEdge: Number(wrEdge.toFixed(1)),
      rSum: Number(rSum.toFixed(2)),
      avgR: Number(avgR.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      maxDD: Number(maxDD.toFixed(1)),
      retToDd: Number(retToDd.toFixed(2)),
      tpExits: ts.filter(t => t.reason === "TP1").length,
      slExits: ts.filter(t => t.reason === "SL").length,
      beExits: ts.filter(t => t.reason === "BE").length,
      staleExits: ts.filter(t => t.reason === "STALE").length,
    });
  }

  // Sort by composite ranking: Real Profitability (Total R) descending
  reportRows.sort((a, b) => b.rSum - a.rSum);

  console.log("\n══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════");
  console.log("                           COMPREHENSIVE BACKTEST MATRIX: ALL STRATEGIES RANKED BY REAL PROFITABILITY                             ");
  console.log("══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════\n");

  const tableData = reportRows.map((r, i) => ({
    Rank: i + 1,
    Family: r.family,
    Strategy: r.name,
    Trades: r.trades,
    "Tr/Wk": r.tradesPerWeek,
    "Win%": `${r.winRate}%`,
    "BE-WR": `${r.breakevenWr}%`,
    "Edge%": `${r.wrEdge >= 0 ? "+" : ""}${r.wrEdge}%`,
    "Total R": `${r.rSum >= 0 ? "+" : ""}${r.rSum}R`,
    "Avg R": `${r.avgR >= 0 ? "+" : ""}${r.avgR}R`,
    PF: r.profitFactor,
    "Max DD": `${r.maxDD}R`,
    "R/DD": r.retToDd,
  }));

  console.table(tableData);

  fs.writeFileSync(path.join(process.cwd(), "replay", "comprehensive_results.json"), JSON.stringify({
    timestamp: new Date().toISOString(),
    days: 92,
    pairs: PAIRS.length,
    rankings: reportRows,
    trades: tradeBooks,
  }, null, 2));

  console.log("\nSaved full trade-level records to replay/comprehensive_results.json\n");
}

runMatrix();
