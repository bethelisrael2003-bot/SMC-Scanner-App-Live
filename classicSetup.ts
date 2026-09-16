/* ==========================================================================
 * classicSetup.ts — Classic SMC/ICT reversal-continuation detector
 * --------------------------------------------------------------------------
 * Detects the original manual-method setup:
 *   liquidity sweep (H4) → CHOCH/BOS (M15) → return to POI (H4 OB/FVG)
 *   → confirmation candle (M15)
 *
 * Companion to momentumPauseRetest.ts (MPR). Where MPR demands a specific
 * shape (impulse → tight pause → retest), this detector accepts the broader
 * playbook: any swept level + structure break + POI retest + confirmation.
 *
 * DETECTION SEMANTICS (mirrors server.ts functions where they exist):
 *   - Pools/sweeps: findLiquidityPools + detectSweep on H4 (8-bar lookback,
 *     server's existing sweep-recency definition). BUY setups sweep lows
 *     (sell-side liquidity); SELL setups sweep highs.
 *   - Structure break: CHOCH/BOS on M15 against M15's OWN prior trend
 *     (textbook definition; note server's advisory m15Struct uses H1 trend).
 *     Break must occur AFTER the sweep bar.
 *   - POI: H4 order block in the setup direction (findOrderBlock with
 *     synthetic trend = setup direction), fallback H4 FVG. NO derived
 *     fallback — a classic setup REQUIRES a real POI. Freshness != DEAD.
 *   - Return: the latest M15 bar overlaps the POI zone, or its close is
 *     within 0.25× ATR of the near edge.
 *   - Confirmation: checkEntryCandle on the latest M15 bar (strong body /
 *     engulfing / wick rejection — same rules as the live M15 gate).
 *
 * TRADE PLAN:
 *   - Entry: market at the confirmation bar's close (caller applies spread).
 *   - SL: beyond the sweep extreme (the wick) ± 0.15× ATR buffer, floored
 *     at 0.3× ATR — same conventions as MPR. No cap (sweeps define risk).
 *   - TP1 = 1.5R, TP2 = 2.5R.
 *
 * Sequence strictness: sweep → break → (return+confirmation now). The break
 * must be within the last 96 M15 bars (24h). Everything else must be current.
 * ========================================================================== */

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time?: number | string;
}

export type Direction = "BUY" | "SELL";

export interface ClassicSetup {
  entry: number;            // confirmation close (reference price)
  sl: number;
  tp1: number;
  tp2: number;
  direction: Direction;
  structType: "CHOCH" | "BOS";
  sweepLevel: number;       // swept liquidity pool level
  sweepExtreme: number;     // the sweep wick (SL anchor)
  sweepTime: string;
  poiType: string;
  poiHigh: number;
  poiLow: number;
  slDistance: number;
  slAtr: number;            // SL distance in ATR units (diagnostics)
}

/* ── server.ts function copies (verbatim semantics) ─────────────────────── */

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

export function classifyTrend(candles: Candle[], lookback = 2) {
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

function findLiquidityPools(candles: Candle[], tolPct = 0.0015) {
  const pools: any[] = [];
  const last = candles[candles.length - 1].close;
  const window = candles.slice(-30);
  const highs = window.map((c, i) => ({ i, h: c.high, t: c.time }));
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].h - highs[j].h) / highs[i].h < tolPct) {
        const level = (highs[i].h + highs[j].h) / 2;
        if (level > last) { pools.push({ level, side: "BUY", source: "equal_high" }); break; }
      }
    }
  }
  const lows = window.map((c, i) => ({ i, l: c.low, t: c.time }));
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].l - lows[j].l) / lows[i].l < tolPct) {
        const level = (lows[i].l + lows[j].l) / 2;
        if (level < last) { pools.push({ level, side: "SELL", source: "equal_low" }); break; }
      }
    }
  }
  if (candles.length >= 48) {
    const dayAgo = candles.slice(-24, -1);
    const pdh = Math.max(...dayAgo.map(c => c.high));
    const pdl = Math.min(...dayAgo.map(c => c.low));
    if (pdh > last) pools.push({ level: pdh, side: "BUY", source: "prev_day_high" });
    if (pdl < last) pools.push({ level: pdl, side: "SELL", source: "prev_day_low" });
  }
  const sessionWindow = candles.slice(-12);
  const sh = Math.max(...sessionWindow.map(c => c.high));
  const sl = Math.min(...sessionWindow.map(c => c.low));
  if (sh > last) pools.push({ level: sh, side: "BUY", source: "session_high" });
  if (sl < last) pools.push({ level: sl, side: "SELL", source: "session_low" });
  const buyPools = pools.filter(p => p.side === "BUY").sort((a, b) => a.level - b.level);
  const sellPools = pools.filter(p => p.side === "SELL").sort((a, b) => b.level - a.level);
  return { buyPools: buyPools.slice(0, 2), sellPools: sellPools.slice(0, 2) };
}

/** Server's detectSweep, extended to return the sweep bar (for the extreme + time). */
function detectSweepBar(candles: Candle[], pool: any, lookback = 5) {
  const level = pool.level;
  const side = pool.side;
  const tol = level * 0.0008;
  const recent = candles.slice(-Math.min(lookback, candles.length));
  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i];
    if (side === "BUY") {
      if (c.high > level + tol && c.close < level) {
        return { swept: true, bar: c, extreme: c.high };
      }
    } else {
      if (c.low < level - tol && c.close > level) {
        return { swept: true, bar: c, extreme: c.low };
      }
    }
  }
  return { swept: false, bar: null as Candle | null, extreme: 0 };
}

function detectStructureBreak(candles: Candle[], highs: any[], lows: any[], priorTrend: string) {
  if (highs.length === 0 || lows.length === 0) return null;
  const lastSH = highs[highs.length - 1].price;
  const lastSL = lows[lows.length - 1].price;
  const checkRange = Math.min(5, candles.length);
  const recent = candles.slice(-checkRange);
  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i];
    if (priorTrend === "BULLISH") {
      if (c.close < lastSL) return { type: "CHOCH", bar: c, brokenLevel: lastSL };
    } else if (priorTrend === "BEARISH") {
      if (c.close > lastSH) return { type: "CHOCH", bar: c, brokenLevel: lastSH };
    }
    if (c.close > lastSH && priorTrend === "BULLISH") {
      return { type: "BOS", bar: c, brokenLevel: lastSH };
    }
    if (c.close < lastSL && priorTrend === "BEARISH") {
      return { type: "BOS", bar: c, brokenLevel: lastSL };
    }
  }
  return null;
}

function atrFn(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function findOrderBlock(candles: Candle[], trend: string, atrVal: number) {
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
        return { type: "BULLISH_OB", direction: "BUY", high: c.high, low: c.low, index: i, time: c.time, valid: dispAtr >= 1.5 };
      }
    } else {
      if (c.close <= c.open) continue;
      const impulse = candles.slice(i + 1, i + 4);
      if (impulse.length < 2) continue;
      const move = Math.abs(impulse.reduce((acc, x) => acc + (x.close - x.open), 0));
      const dispAtr = move / atrVal;
      const allBear = impulse.every(x => x.close < x.open);
      if (move >= 1.5 * atrVal && allBear) {
        return { type: "BEARISH_OB", direction: "SELL", high: c.high, low: c.low, index: i, time: c.time, valid: dispAtr >= 1.5 };
      }
    }
  }
  return null;
}

export function findFVG(candles: Candle[], trend: string) {
  const fvgs: any[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    if (trend !== "BEARISH" && candles[i - 1].low > candles[i + 1].high) {
      fvgs.push({ type: "BULLISH_FVG", direction: "BUY", top: candles[i - 1].low, bottom: candles[i + 1].high, index: i, time: candles[i].time, valid: true });
    }
    if (trend !== "BULLISH" && candles[i - 1].high < candles[i + 1].low) {
      fvgs.push({ type: "BEARISH_FVG", direction: "SELL", top: candles[i + 1].low, bottom: candles[i - 1].high, index: i, time: candles[i].time, valid: true });
    }
  }
  return fvgs.slice(-3);
}

export function checkPoiFreshness(candles: Candle[], poi: any) {
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

export function checkEntryCandle(candles: Candle[], direction: Direction) {
  if (candles.length < 2) return { valid: false, reason: "Insufficient data" };
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(curr.close - curr.open);
  const rng = curr.high - curr.low;
  if (rng === 0) return { valid: false, reason: "Zero range candle" };
  const bodyRatio = body / rng;
  if (direction === "BUY") {
    if (curr.close <= curr.open) {
      if (prev.close < prev.open && curr.close > prev.open && curr.open < prev.close) {
        return { valid: true, reason: "Bullish engulfing" };
      }
      return { valid: false, reason: "Bearish close in BUY setup" };
    }
    if (bodyRatio >= 0.6) return { valid: true, reason: "Strong bullish body" };
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;
    if (lowerWick > 0.5 * rng) return { valid: true, reason: "Lower wick rejection" };
    return { valid: false, reason: "Weak bullish candle" };
  } else {
    if (curr.close >= curr.open) {
      if (prev.close > prev.open && curr.close < prev.open && curr.open > prev.close) {
        return { valid: true, reason: "Bearish engulfing" };
      }
      return { valid: false, reason: "Bullish close in SELL setup" };
    }
    if (bodyRatio >= 0.6) return { valid: true, reason: "Strong bearish body" };
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    if (upperWick > 0.5 * rng) return { valid: true, reason: "Upper wick rejection" };
    return { valid: false, reason: "Weak bearish candle" };
  }
}

/* ── the detector ────────────────────────────────────────────────────────── */

const SWEEP_LOOKBACK_H4 = 8;      // server's sweep recency (8 H4 bars = 32h)
const BREAK_MAX_AGE_M15 = 96;     // break must be within last 96 M15 bars (24h)
const POI_NEAR_EDGE_ATR = 0.25;   // "returned to POI" tolerance

export function findClassicSetup(
  h4: Candle[],
  m15: Candle[],
  h1Atr: number,
  direction: Direction,
): ClassicSetup | null {
  if (!h4 || h4.length < 50 || !m15 || m15.length < 50) return null;
  if (!(h1Atr > 0)) return null;

  const m15Win = m15.slice(-120);
  const h4Win = h4.slice(-120);
  const lastM15 = m15Win[m15Win.length - 1];
  const isBuy = direction === "BUY";

  /* 1. Liquidity sweep on H4 (wick through pool, close back) */
  const pools = findLiquidityPools(h4Win);
  const testPools = isBuy ? pools.sellPools : pools.buyPools;
  let sweep: { level: number; extreme: number; time: string } | null = null;
  for (const pool of testPools) {
    const s = detectSweepBar(h4Win, pool, SWEEP_LOOKBACK_H4);
    if (s.swept && s.bar) {
      sweep = { level: pool.level, extreme: s.extreme, time: String((s.bar as any).time ?? "") };
      break;
    }
  }
  if (!sweep) return null;

  /* 2. CHOCH/BOS on M15 against M15's own prior trend, AFTER the sweep */
  const m15TrendInfo = classifyTrend(m15Win);
  if (m15TrendInfo.trend === "RANGE" || m15TrendInfo.trend === "UNCLEAR") {
    // No prior M15 structure to break — not a textbook CHOCH/BOS context.
    return null;
  }
  const struct = detectStructureBreak(m15Win, m15TrendInfo.highs, m15TrendInfo.lows, m15TrendInfo.trend);
  if (!struct || !struct.bar) return null;
  // Direction check: the break must be in the SETUP direction
  const brokeUp = struct.bar.close > struct.bar.open ? true : struct.bar.close > struct.brokenLevel;
  if (isBuy !== brokeUp) return null;
  // Sequence: break bar AFTER the sweep bar
  const breakTime = new Date(String((struct.bar as any).time ?? "")).getTime();
  const sweepTime = new Date(sweep.time).getTime();
  if (!(breakTime > sweepTime)) return null;
  // Break recency: within BREAK_MAX_AGE_M15 bars of now
  const breakIdx = m15Win.findIndex(c => c.time === struct.bar!.time);
  if (breakIdx < 0 || m15Win.length - 1 - breakIdx > BREAK_MAX_AGE_M15) return null;

  /* 3. POI (H4 OB in setup direction, fallback H4 FVG) — returned-to and fresh */
  const synthTrend = isBuy ? "BULLISH" : "BEARISH";
  const h4Atr = atrFn(h4Win, 14) || h1Atr;
  let poi: any = findOrderBlock(h4Win, synthTrend, h4Atr);
  let poiSource = "H4_OB";
  if (!poi || !poi.valid) {
    const fvgs = findFVG(h4Win, synthTrend);
    if (fvgs.length > 0) {
      const best = fvgs[fvgs.length - 1];
      poi = { type: best.type, direction, high: best.top, low: best.bottom, index: best.index, valid: true };
      poiSource = "H4_FVG";
    }
  }
  if (!poi || !poi.valid) return null; // classic requires a REAL POI
  if (checkPoiFreshness(h4Win, poi) === "DEAD") return null;

  // "Return to POI": latest M15 bar overlaps the zone or close near the edge
  const poiHigh = poi.high ?? poi.top;
  const poiLow = poi.low ?? poi.bottom;
  const overlaps = lastM15.low <= poiHigh && lastM15.high >= poiLow;
  const nearEdgeDist = isBuy
    ? Math.max(0, poiLow - lastM15.close)
    : Math.max(0, lastM15.close - poiHigh);
  if (!overlaps && nearEdgeDist > POI_NEAR_EDGE_ATR * h1Atr) return null;

  /* 4. Confirmation candle on the latest M15 bar */
  const conf = checkEntryCandle(m15Win, direction);
  if (!conf.valid) return null;

  /* Trade plan: entry at confirmation close, SL beyond sweep extreme */
  const entry = lastM15.close;
  const buffer = 0.15 * h1Atr;
  const rawStop = isBuy ? sweep.extreme - buffer : sweep.extreme + buffer;
  let slDistance = Math.abs(entry - rawStop);
  let stopLevel = rawStop;
  const minStop = 0.3 * h1Atr;
  if (slDistance < minStop) {
    slDistance = minStop;
    stopLevel = isBuy ? entry - minStop : entry + minStop;
  }
  const sl = Number(stopLevel.toFixed(5));
  const e = Number(entry.toFixed(5));
  const risk = Math.abs(e - sl);
  const tp1 = Number((isBuy ? e + 1.5 * risk : e - 1.5 * risk).toFixed(5));
  const tp2 = Number((isBuy ? e + 2.5 * risk : e - 2.5 * risk).toFixed(5));

  const coherent = isBuy ? sl < e && e < tp1 : sl > e && e > tp1;
  if (!coherent || risk <= 0) return null;

  return {
    entry: e,
    sl,
    tp1,
    tp2,
    direction,
    structType: struct.type as "CHOCH" | "BOS",
    sweepLevel: sweep.level,
    sweepExtreme: sweep.extreme,
    sweepTime: sweep.time,
    poiType: poiSource === "H4_OB" ? poi.type : poiSource,
    poiHigh,
    poiLow,
    slDistance: risk,
    slAtr: risk / h1Atr,
  };
}

export default findClassicSetup;
