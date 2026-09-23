/* ==========================================================================
 * precisionEngine.ts — Precision Intraday Trading Analysis Engine
 * --------------------------------------------------------------------------
 * Implements the complete 13-step sequence from the 11-module course at
 * omniforgelabs-dev.github.io/precision-intraday-trading/
 *
 * PHILOSOPHY (Module 1):
 *   4H → DIRECTION ("which side am I willing to trade?")
 *   1H → LOCATION  ("where exactly do I care?")
 *   15M → EXECUTION ("is it happening? where is my risk?")
 *   Information flows DOWN. Authority NEVER flows UP.
 *   Only 15M CLOSES count as confirmation. Wicks are liquidity events.
 *   Frequency reduction is the goal — often 0-2 trades per session.
 *
 * THE 13 STEPS (Module 4):
 *   1. 4H directional environment (HH/HL or LH/LL sequence)
 *   2. 1H context (agrees with or refines the 4H direction)
 *   3. Meaningful 1H/4H location (zone from 4 sources)
 *   4. Relevant liquidity (pools, sweeps, resting orders)
 *   5. Wait for interaction (price must actually arrive)
 *   6. Liquidity event / structural reaction (sweep or BOS/MSS)
 *   7. 15M price-action confirmation (CLOSE, not wick)
 *   8. 15M structure shift / BOS (strengthening, not mandatory)
 *   9. Displacement (strengthening, not mandatory)
 *   10. Structural invalidation point (the stop)
 *   11. Structural target (nearest genuine opposing level)
 *   12. Reward-to-risk ≥ 1:2 (hard floor)
 *   13. Qualification decision
 *
 * NO-TRADE CONDITIONS (Module 8): 16 conditions, any one sufficient.
 * ========================================================================== */

export interface Candle {
  open: number; high: number; low: number; close: number;
  time?: number | string;
}

export type Direction = "BUY" | "SELL";
export type TrendState = "UPTREND" | "DOWNTREND" | "RANGE" | "CONTRACTION" | "UNCLEAR";

/* ── SECTION 1: Swing Point Detection (Module 2, §2.2) ─────────────────── */

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
  time?: string;
}

/**
 * Detect swing points using the 3-candle rule + significance filter.
 * Significance = price moved away by ≥ 1.5× ATR(14) on this timeframe.
 * Module 2: "treat pivot detection as a candidate generator and filter
 * candidates by the size of the move away from them — measured in ATR."
 */
export function detectSwings(candles: Candle[], atrVal: number): SwingPoint[] {
  if (candles.length < 5 || !(atrVal > 0)) return [];
  const swings: SwingPoint[] = [];
  const n = candles.length;

  for (let i = 1; i < n - 1; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const next = candles[i + 1];

    // Swing high: high > both neighbors (3-candle rule)
    if (c.high > prev.high && c.high > next.high) {
      // Significance filter: the move away must be ≥ 1.5× ATR
      const moveAway = Math.abs(c.high - Math.min(next.low, candles[Math.min(i + 3, n - 1)].low));
      if (moveAway >= 1.5 * atrVal) {
        swings.push({ index: i, price: c.high, type: "high", time: String(c.time ?? "") });
      }
    }

    // Swing low: low < both neighbors
    if (c.low < prev.low && c.low < next.low) {
      const moveAway = Math.abs(c.high - Math.max(next.high, candles[Math.min(i + 3, n - 1)].high));
      if (moveAway >= 1.5 * atrVal) {
        swings.push({ index: i, price: c.low, type: "low", time: String(c.time ?? "") });
      }
    }
  }

  return swings.sort((a, b) => a.index - b.index);
}

/* ── SECTION 2: Trend Classification (Module 2, §2.3) ───────────────────── */

export interface TrendAnalysis {
  state: TrendState;
  direction: Direction | null;   // null = no-trade (range/contraction/unclear)
  lastHigherLow?: number;        // for uptrend: the invalidation reference
  lastLowerHigh?: number;        // for downtrend: the invalidation reference
  swings: SwingPoint[];
  description: string;
}

/**
 * Classify trend from swing sequence.
 * UPTREND: HH + HL alternating. DOWNTREND: LH + LL alternating.
 * RANGE: equal highs/lows. CONTRACTION: LH AND HL (coiling).
 * Module 2: "Both conditions must hold. Higher highs with equal or lower
 * lows is not an uptrend — it is a broadening range."
 */
export function classifyTrend(candles: Candle[], atrVal: number): TrendAnalysis {
  const swings = detectSwings(candles, atrVal);
  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");

  if (highs.length < 2 || lows.length < 2) {
    return { state: "UNCLEAR", direction: null, swings, description: "Insufficient swing points for classification" };
  }

  // Take the last 2 highs and last 2 lows
  const lastTwoHighs = highs.slice(-2);
  const lastTwoLows = lows.slice(-2);

  const hh = lastTwoHighs[1].price > lastTwoHighs[0].price;
  const hl = lastTwoLows[1].price > lastTwoLows[0].price;
  const lh = lastTwoHighs[1].price < lastTwoHighs[0].price;
  const ll = lastTwoLows[1].price < lastTwoLows[0].price;

  // Equal-ish highs/lows (within 0.5× ATR → range)
  const eqHighs = Math.abs(lastTwoHighs[1].price - lastTwoHighs[0].price) < 0.5 * atrVal;
  const eqLows = Math.abs(lastTwoLows[1].price - lastTwoLows[0].price) < 0.5 * atrVal;

  if (hh && hl) {
    return {
      state: "UPTREND", direction: "BUY", swings,
      lastHigherLow: lastTwoLows[1].price,
      description: `UPTREND: HH ${lastTwoHighs[1].price} > ${lastTwoHighs[0].price}, HL ${lastTwoLows[1].price} > ${lastTwoLows[0].price}. Longs permitted at pullback locations. Invalidation: below ${lastTwoLows[1].price}`,
    };
  }
  if (lh && ll) {
    return {
      state: "DOWNTREND", direction: "SELL", swings,
      lastLowerHigh: lastTwoHighs[1].price,
      description: `DOWNTREND: LH ${lastTwoHighs[1].price} < ${lastTwoHighs[0].price}, LL ${lastTwoLows[1].price} < ${lastTwoLows[0].price}. Shorts permitted at pullback locations. Invalidation: above ${lastTwoHighs[1].price}`,
    };
  }
  if (eqHighs && eqLows) {
    return { state: "RANGE", direction: null, swings, description: "RANGE: equal highs and lows. Edge-to-edge only, never centre." };
  }
  if (lh && hl) {
    return { state: "CONTRACTION", direction: null, swings, description: "CONTRACTION: lower highs AND higher lows — coiling. Wait for expansion." };
  }
  return { state: "UNCLEAR", direction: null, swings, description: "Mixed structure — no clear directional bias." };
}

/* ── SECTION 3: Zone Construction (Module 3) ───────────────────────────── */

export interface Zone {
  high: number;
  low: number;
  source: "displacement_origin" | "reaction_area" | "pre_expansion_base" | "swing_area";
  type: "demand" | "supply";
  grade: number;          // 1 (best) to 6 (worst) — Module 3 §3.6
  touches: number;        // how many times price has returned
  fresh: boolean;         // never tested since creation
  index: number;          // candle index where zone was identified
  time?: string;
}

/**
 * Build zones from the four Module 3 sources:
 * 1. Displacement origin — the consolidation that launched a displacement leg
 * 2. Reaction area — where price has visibly turned before
 * 3. Pre-expansion base — a consolidation before a breakout
 * 4. Swing area — around significant swing points
 */
export function buildZones(candles: Candle[], atrVal: number, trend: TrendAnalysis): Zone[] {
  if (candles.length < 20 || !(atrVal > 0)) return [];
  const zones: Zone[] = [];
  const n = candles.length;

  // ── Source 1: Displacement origin ──
  // Find displacement legs (Module 2 §2.6: body ratio ≥ 0.70, range ≥ 1.5× ATR)
  for (let i = 2; i < n - 1; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) continue;
    const bodyRatio = body / range;

    // Displacement candle criteria (Module 2, §2.6)
    if (bodyRatio >= 0.70 && range >= 1.5 * atrVal) {
      // The origin is the consolidation BEFORE the displacement
      const prev = candles[i - 1];
      const prev2 = candles[i - 2];

      if (c.close > c.open) {
        // Bullish displacement → demand zone at origin
        const zoneHigh = Math.max(prev.open, prev.close);
        const zoneLow = Math.min(prev2.low, prev.low);
        zones.push({
          high: zoneHigh, low: zoneLow,
          source: "displacement_origin", type: "demand",
          grade: 1, touches: 0, fresh: true, index: i - 1,
          time: String(prev.time ?? ""),
        });
      } else {
        // Bearish displacement → supply zone at origin
        const zoneLow = Math.min(prev.open, prev.close);
        const zoneHigh = Math.max(prev2.high, prev.high);
        zones.push({
          high: zoneHigh, low: zoneLow,
          source: "displacement_origin", type: "supply",
          grade: 1, touches: 0, fresh: true, index: i - 1,
          time: String(prev.time ?? ""),
        });
      }
    }
  }

  // ── Source 4: Swing area zones ──
  for (const sw of trend.swings) {
    if (sw.type === "low") {
      const c = candles[sw.index];
      zones.push({
        high: c.close, low: c.low,
        source: "swing_area", type: "demand",
        grade: 3, touches: 0, fresh: true, index: sw.index,
        time: sw.time,
      });
    } else {
      const c = candles[sw.index];
      zones.push({
        high: c.high, low: c.close,
        source: "swing_area", type: "supply",
        grade: 3, touches: 0, fresh: true, index: sw.index,
        time: sw.time,
      });
    }
  }

  // Count touches (each return to the zone consumes potency — Module 3 §3.7)
  for (const zone of zones) {
    for (let i = zone.index + 1; i < n; i++) {
      const c = candles[i];
      if (c.low <= zone.high && c.high >= zone.low) {
        zone.touches++;
        zone.fresh = false;
        // Module 3: "the third touch is weaker than the first"
        if (zone.touches >= 3) zone.grade = Math.max(zone.grade, 5);
        else if (zone.touches >= 2) zone.grade = Math.max(zone.grade, 4);
      }
    }
  }

  // Filter: only keep zones that are near current price (within 5× ATR)
  const lastClose = candles[n - 1].close;
  return zones.filter(z => Math.abs((z.high + z.low) / 2 - lastClose) <= 5 * atrVal);
}

/* ── SECTION 4: Liquidity Detection (Module 3, §3.5) ────────────────────── */

export interface LiquidityPool {
  level: number;
  side: "buy" | "sell";     // buy = above (buy-side stops), sell = below
  source: string;
}

export interface LiquidityEvent {
  swept: boolean;
  level: number;
  direction: Direction;      // direction the sweep favors
  barIndex: number;
  time?: string;
}

/**
 * Find liquidity pools (Module 3: obvious highs/lows where stops cluster).
 */
export function findPools(candles: Candle[]): { buyPools: LiquidityPool[]; sellPools: LiquidityPool[] } {
  const pools: LiquidityPool[] = [];
  const n = candles.length;
  if (n < 10) return { buyPools: [], sellPools: [] };
  const last = candles[n - 1].close;

  // Equal highs (within tolerance)
  const window = candles.slice(-30);
  const tol = last * 0.0015;
  for (let i = 0; i < window.length; i++) {
    for (let j = i + 1; j < window.length; j++) {
      if (Math.abs(window[i].high - window[j].high) < tol) {
        const level = (window[i].high + window[j].high) / 2;
        if (level > last) pools.push({ level, side: "buy", source: "equal_highs" });
        break;
      }
    }
  }
  for (let i = 0; i < window.length; i++) {
    for (let j = i + 1; j < window.length; j++) {
      if (Math.abs(window[i].low - window[j].low) < tol) {
        const level = (window[i].low + window[j].low) / 2;
        if (level < last) pools.push({ level, side: "sell", source: "equal_lows" });
        break;
      }
    }
  }

  // Session extremes
  const session = candles.slice(-12);
  const sh = Math.max(...session.map(c => c.high));
  const sl = Math.min(...session.map(c => c.low));
  if (sh > last) pools.push({ level: sh, side: "buy", source: "session_high" });
  if (sl < last) pools.push({ level: sl, side: "sell", source: "session_low" });

  // PDH/PDL
  if (n >= 48) {
    const dayAgo = candles.slice(-48, -24);
    const pdh = Math.max(...dayAgo.map(c => c.high));
    const pdl = Math.min(...dayAgo.map(c => c.low));
    if (pdh > last) pools.push({ level: pdh, side: "buy", source: "prev_day_high" });
    if (pdl < last) pools.push({ level: pdl, side: "sell", source: "prev_day_low" });
  }

  const buyPools = pools.filter(p => p.side === "buy").sort((a, b) => a.level - b.level).slice(0, 3);
  const sellPools = pools.filter(p => p.side === "sell").sort((a, b) => b.level - a.level).slice(0, 3);
  return { buyPools, sellPools };
}

/**
 * Detect a liquidity sweep: wick through a pool + close back on the original side.
 * Module 2 §2.5: "Wick through, close back inside = rejection."
 */
export function detectSweep(candles: Candle[], pool: LiquidityPool, lookback = 5): LiquidityEvent | null {
  const level = pool.level;
  const tol = level * 0.0008;
  const recent = candles.slice(-Math.min(lookback, candles.length));

  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i];
    if (pool.side === "buy") {
      // Sweep of buy-side liquidity: wick above, close back below
      if (c.high > level + tol && c.close < level) {
        return { swept: true, level, direction: "SELL", barIndex: i, time: String(c.time ?? "") };
      }
    } else {
      // Sweep of sell-side liquidity: wick below, close back above
      if (c.low < level - tol && c.close > level) {
        return { swept: true, level, direction: "BUY", barIndex: i, time: String(c.time ?? "") };
      }
    }
  }
  return null;
}

/* ── SECTION 5: Displacement Detection (Module 2, §2.6) ─────────────────── */

export interface DisplacementResult {
  isDisplacement: boolean;
  bodyRatio: number;
  rangeVsAtr: number;
  consecutiveCloses: number;
  overlap: number;
  direction: Direction | null;
}

/**
 * Test for displacement (Module 2 §2.6):
 * - Body ratio ≥ 0.70
 * - Range ≥ 1.5× ATR(20) on this timeframe
 * - 2+ consecutive same-direction closes with body overlap < 25%
 */
export function detectDisplacement(candles: Candle[], atrVal: number): DisplacementResult {
  const n = candles.length;
  if (n < 3 || !(atrVal > 0)) {
    return { isDisplacement: false, bodyRatio: 0, rangeVsAtr: 0, consecutiveCloses: 0, overlap: 1, direction: null };
  }

  const last = candles[n - 1];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  const bodyRatio = range > 0 ? body / range : 0;
  const rangeVsAtr = range / atrVal;

  // Count consecutive same-direction closes
  let consecutiveCloses = 0;
  let dir: Direction | null = null;
  for (let i = n - 1; i >= Math.max(0, n - 5); i--) {
    const c = candles[i];
    if (dir === null) {
      dir = c.close > c.open ? "BUY" : c.close < c.open ? "SELL" : null;
      if (dir) consecutiveCloses = 1;
    } else {
      const thisDir = c.close > c.open ? "BUY" : c.close < c.open ? "SELL" : null;
      if (thisDir === dir) consecutiveCloses++;
      else break;
    }
  }

  // Body overlap between consecutive candles
  let overlap = 1;
  if (n >= 2) {
    const c1 = candles[n - 2];
    const c2 = candles[n - 1];
    const body1 = { top: Math.max(c1.open, c1.close), bot: Math.min(c1.open, c1.close) };
    const body2 = { top: Math.max(c2.open, c2.close), bot: Math.min(c2.open, c2.close) };
    const overlapTop = Math.min(body1.top, body2.top);
    const overlapBot = Math.max(body1.bot, body2.bot);
    const overlapSize = Math.max(0, overlapTop - overlapBot);
    const avgBody = (body1.top - body1.bot + body2.top - body2.bot) / 2;
    overlap = avgBody > 0 ? overlapSize / avgBody : 1;
  }

  const isDisplacement = bodyRatio >= 0.70 && rangeVsAtr >= 1.5 && consecutiveCloses >= 2 && overlap < 0.25;

  return { isDisplacement, bodyRatio, rangeVsAtr, consecutiveCloses, overlap, direction: dir };
}

/* ── SECTION 6: 15M Confirmation (Modules 4-5) ──────────────────────────── */

export interface ConfirmationResult {
  confirmed: boolean;
  reason: string;
  candleType: string;
  bodyRatio: number;
  closesInDirection: boolean;
  structureShift: boolean;     // Step 8 (strengthening)
  displacement: DisplacementResult; // Step 9 (strengthening)
}

/**
 * Check 15M confirmation (Module 4, Step 7).
 * ONLY evaluates CLOSED candles. The candle must close in the thesis direction.
 * Module 1 §1.4: "A 15M candle trading in your favour mid-formation is not
 * evidence. It has not closed."
 */
export function check15MConfirmation(
  m15Closed: Candle[],  // MUST be closed candles only
  direction: Direction,
  atr15: number,
): ConfirmationResult {
  if (m15Closed.length < 2) {
    return { confirmed: false, reason: "Insufficient data", candleType: "none", bodyRatio: 0, closesInDirection: false, structureShift: false, displacement: detectDisplacement(m15Closed, atr15) };
  }

  const curr = m15Closed[m15Closed.length - 1];
  const prev = m15Closed[m15Closed.length - 2];
  const body = Math.abs(curr.close - curr.open);
  const range = curr.high - curr.low;
  const bodyRatio = range > 0 ? body / range : 0;
  const closesInDirection = direction === "BUY" ? curr.close > curr.open : curr.close < curr.open;

  let candleType = "unknown";
  let confirmed = false;
  let reason = "";

  if (range === 0) {
    candleType = "zero_range";
    reason = "Zero range candle — no information";
  } else if (direction === "BUY") {
    if (closesInDirection) {
      if (bodyRatio >= 0.6) {
        candleType = "strong_bullish_body";
        confirmed = true;
        reason = `Strong bullish body (${(bodyRatio * 100).toFixed(0)}% of range)`;
      } else {
        const lowerWick = Math.min(curr.open, curr.close) - curr.low;
        if (lowerWick > 0.5 * range) {
          candleType = "lower_wick_rejection";
          confirmed = true;
          reason = `Lower wick rejection (${((lowerWick / range) * 100).toFixed(0)}%)`;
        } else {
          candleType = "weak_bullish";
          reason = "Weak bullish candle — insufficient conviction";
        }
      }
    } else {
      // Bearish close in BUY setup → check for bullish engulfing
      if (prev.close < prev.open && curr.close > prev.open && curr.open < prev.close) {
        candleType = "bullish_engulfing";
        confirmed = true;
        reason = `Bullish engulfing (body ${(bodyRatio * 100).toFixed(0)}%)`;
      } else {
        candleType = "bearish_close";
        reason = "Bearish close in BUY setup — no confirmation";
      }
    }
  } else {
    // SELL direction
    if (closesInDirection) {
      if (bodyRatio >= 0.6) {
        candleType = "strong_bearish_body";
        confirmed = true;
        reason = `Strong bearish body (${(bodyRatio * 100).toFixed(0)}% of range)`;
      } else {
        const upperWick = curr.high - Math.max(curr.open, curr.close);
        if (upperWick > 0.5 * range) {
          candleType = "upper_wick_rejection";
          confirmed = true;
          reason = `Upper wick rejection (${((upperWick / range) * 100).toFixed(0)}%)`;
        } else {
          candleType = "weak_bearish";
          reason = "Weak bearish candle — insufficient conviction";
        }
      }
    } else {
      if (prev.close > prev.open && curr.close < prev.open && curr.open > prev.close) {
        candleType = "bearish_engulfing";
        confirmed = true;
        reason = `Bearish engulfing (body ${(bodyRatio * 100).toFixed(0)}%)`;
      } else {
        candleType = "bullish_close";
        reason = "Bullish close in SELL setup — no confirmation";
      }
    }
  }

  // Step 8: Check for 15M structure shift (strengthening, not mandatory)
  const structureShift = checkStructureShift(m15Closed, direction);

  // Step 9: Check for displacement (strengthening, not mandatory)
  const displacement = detectDisplacement(m15Closed, atr15);

  return { confirmed, reason, candleType, bodyRatio, closesInDirection, structureShift, displacement };
}

/**
 * Check for a 15M structure shift (BOS or MSS).
 * Module 2 §2.4: BOS = close beyond swing point WITH trend. MSS = close beyond AGAINST trend.
 */
function checkStructureShift(m15: Candle[], direction: Direction): boolean {
  if (m15.length < 5) return false;
  const n = m15.length;

  // Find the last swing high and low on 15M
  let lastSwingHigh = -Infinity;
  let lastSwingLow = Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (m15[i].high > m15[i - 1].high && m15[i].high > m15[i + 1].high) {
      lastSwingHigh = Math.max(lastSwingHigh, m15[i].high);
    }
    if (m15[i].low < m15[i - 1].low && m15[i].low < m15[i + 1].low) {
      lastSwingLow = Math.min(lastSwingLow, m15[i].low);
    }
  }

  if (lastSwingHigh === -Infinity || lastSwingLow === Infinity) return false;

  const lastClose = m15[n - 1].close;
  // For BUY: structure shift = close above last swing high (BOS in uptrend)
  // For SELL: structure shift = close below last swing low (BOS in downtrend)
  if (direction === "BUY" && lastClose > lastSwingHigh) return true;
  if (direction === "SELL" && lastClose < lastSwingLow) return true;
  return false;
}

/* ── SECTION 7: ATR Helper ──────────────────────────────────────────────── */

export function computeAtr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/* ── SECTION 8: The Complete 13-Step Sequence (Module 4) ────────────────── */

export interface PrecisionStep {
  step: number;
  name: string;
  question: string;
  passed: boolean;
  detail: string;
  mandatory: boolean;
}

export interface PrecisionResult {
  pair: string;
  timestamp: string;
  steps: PrecisionStep[];
  qualified: boolean;       // all mandatory steps passed
  direction: Direction | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  rr: number | null;
  // Diagnostic data
  h4Trend: TrendAnalysis;
  h1Trend: TrendAnalysis;
  zones: Zone[];
  liquidity: { buyPools: LiquidityPool[]; sellPools: LiquidityPool[] };
  sweep: LiquidityEvent | null;
  confirmation: ConfirmationResult | null;
  noTradeReasons: string[];
}

/**
 * Run the complete 13-step Precision Intraday sequence on one pair.
 *
 * @param pair - e.g. "EUR/USD"
 * @param h4 - 4H candles (oldest first, last = most recent CLOSED bar)
 * @param h1 - 1H candles (oldest first, last = most recent CLOSED bar)
 * @param m15 - 15M candles (oldest first, MUST be closed candles only)
 */
export function runPrecisionSequence(
  pair: string,
  h4: Candle[],
  h1: Candle[],
  m15: Candle[],
): PrecisionResult {
  const steps: PrecisionStep[] = [];
  const noTradeReasons: string[] = [];
  const now = new Date().toISOString();

  // Compute ATRs
  const atr4h = computeAtr(h4, 14);
  const atr1h = computeAtr(h1, 14);
  const atr15m = computeAtr(m15, 14);

  // ── STEP 1: 4H Directional Environment ──
  const h4Trend = classifyTrend(h4, atr4h);
  const step1Passed = h4Trend.direction !== null;
  steps.push({
    step: 1, name: "4H Direction", question: "Which side am I allowed to consider?",
    passed: step1Passed, mandatory: true,
    detail: h4Trend.description,
  });
  if (!step1Passed) noTradeReasons.push(`4H: ${h4Trend.state} — no directional bias (Module 8: chop/poor structure)`);

  // ── STEP 2: 1H Context ──
  const h1Trend = classifyTrend(h1, atr1h);
  const h1Agrees = step1Passed && (
    (h4Trend.direction === "BUY" && h1Trend.state !== "DOWNTREND") ||
    (h4Trend.direction === "SELL" && h1Trend.state !== "UPTREND")
  );
  steps.push({
    step: 2, name: "1H Context", question: "Does the 1H agree with or refine the 4H direction?",
    passed: h1Agrees, mandatory: true,
    detail: h1Trend.description,
  });
  if (step1Passed && !h1Agrees) noTradeReasons.push("1H conflicts with 4H — no coherent bias (Module 8: conflicting HTF context)");

  // If no direction after steps 1-2, we can stop but still report all steps
  const direction = step1Passed && h1Agrees ? h4Trend.direction! : null;

  // ── STEP 3: Meaningful 1H/4H Location ──
  const zones = direction ? buildZones(h1, atr1h, h1Trend) : [];
  const relevantZones = direction === "BUY"
    ? zones.filter(z => z.type === "demand")
    : direction === "SELL"
      ? zones.filter(z => z.type === "supply")
      : [];
  const bestZone = relevantZones.length > 0
    ? relevantZones.sort((a, b) => a.grade - b.grade)[0]
    : null;

  const step3Passed = bestZone !== null;
  steps.push({
    step: 3, name: "1H/4H Location", question: "Where specifically do I care about price arriving?",
    passed: step3Passed, mandatory: true,
    detail: bestZone
      ? `${bestZone.type.toUpperCase()} zone [${bestZone.low.toFixed(5)}–${bestZone.high.toFixed(5)}] from ${bestZone.source.replace(/_/g, " ")}, grade ${bestZone.grade}, ${bestZone.touches} touch(es), ${bestZone.fresh ? "FRESH" : "tested"}`
      : "No qualifying zone found",
  });
  if (direction && !step3Passed) noTradeReasons.push("No meaningful 1H/4H location (Module 8: weak/unclear S&R)");

  // ── STEP 4: Relevant Liquidity ──
  const liquidity = findPools(h1);
  const relevantPools = direction === "BUY" ? liquidity.sellPools : liquidity.buyPools;
  const step4Passed = relevantPools.length > 0 || (bestZone !== null);
  steps.push({
    step: 4, name: "Liquidity", question: "What unfilled orders make this location more than a shape?",
    passed: step4Passed, mandatory: true,
    detail: relevantPools.length > 0
      ? `${relevantPools.length} liquidity pool(s): ${relevantPools.map(p => `${p.source}@${p.level.toFixed(5)}`).join(", ")}`
      : bestZone ? "Zone provides structural reference" : "No liquidity mapped",
  });
  if (direction && !step4Passed) noTradeReasons.push("No liquidity at location (Module 8: poor liquidity)");

  // ── STEP 5: Wait for Interaction ──
  const lastPrice = m15.length > 0 ? m15[m15.length - 1].close : 0;
  const nearZone = bestZone !== null && lastPrice > 0 &&
    Math.abs(lastPrice - (bestZone.high + bestZone.low) / 2) <= 2 * atr1h;
  steps.push({
    step: 5, name: "Price Interaction", question: "Has price actually arrived at the location?",
    passed: nearZone, mandatory: true,
    detail: nearZone
      ? `Price ${lastPrice} is near zone [${bestZone!.low.toFixed(5)}–${bestZone!.high.toFixed(5)}]`
      : `Price ${lastPrice} not at zone yet`,
  });

  // ── STEP 6: Liquidity Event / Structural Reaction ──
  let sweep: LiquidityEvent | null = null;
  if (direction && relevantPools.length > 0) {
    for (const pool of relevantPools) {
      const ev = detectSweep(m15.slice(-10), pool, 5);
      if (ev && ev.swept && ev.direction === direction) {
        sweep = ev;
        break;
      }
    }
  }
  const step6Passed = sweep !== null || (nearZone && bestZone !== null);
  steps.push({
    step: 6, name: "Liquidity Event / Reaction", question: "Did something happen when price arrived?",
    passed: step6Passed, mandatory: true,
    detail: sweep
      ? `Sweep of ${sweep.level.toFixed(5)} (${sweep.direction === "BUY" ? "sell-side" : "buy-side"} liquidity) — wick + close back`
      : nearZone ? "Price in zone (structural interaction)" : "No reaction detected",
  });

  // ── STEP 7: 15M Price-Action Confirmation ──
  const confirmation = direction ? check15MConfirmation(m15, direction, atr15m) : null;
  const step7Passed = confirmation !== null && confirmation.confirmed;
  steps.push({
    step: 7, name: "15M Confirmation", question: "Does the CLOSE (not wick) agree with my thesis?",
    passed: step7Passed, mandatory: true,
    detail: confirmation
      ? `${confirmation.candleType}: ${confirmation.reason} (body ratio ${(confirmation.bodyRatio * 100).toFixed(0)}%)`
      : "No direction to confirm",
  });
  if (direction && !step7Passed) noTradeReasons.push(`15M confirmation failed: ${confirmation?.reason ?? "no data"} (Module 8: weak confirmation)`);

  // ── STEP 8: 15M Structure Shift (strengthening, NOT mandatory) ──
  const step8Passed = confirmation?.structureShift ?? false;
  steps.push({
    step: 8, name: "15M Structure Shift", question: "Has the immediate 15M structure turned?",
    passed: step8Passed, mandatory: false,
    detail: step8Passed ? "Structure shift detected (BOS/MSS on 15M)" : "No structure shift — strengthening condition absent",
  });

  // ── STEP 9: Displacement (strengthening, NOT mandatory) ──
  const step9Passed = confirmation?.displacement.isDisplacement ?? false;
  steps.push({
    step: 9, name: "Displacement", question: "Is there force behind the move?",
    passed: step9Passed, mandatory: false,
    detail: step9Passed
      ? `Displacement: body ratio ${(confirmation!.displacement.bodyRatio * 100).toFixed(0)}%, range ${confirmation!.displacement.rangeVsAtr.toFixed(1)}× ATR, ${confirmation!.displacement.consecutiveCloses} consecutive closes`
      : "No qualifying displacement",
  });

  // ── STEP 10: Structural Invalidation Point (the stop) ──
  // HARDENING (2026-09-23 fix): Floor stop distance at minStop = 0.3× ATR
  // and enforce directional coherence. Prevents sub-pip stop artifacts that
  // caused division-by-near-zero R values (e.g. +650R on Gold).
  let sl: number | null = null;
  const minStop = 0.3 * atr1h;

  if (direction && bestZone && lastPrice > 0) {
    if (direction === "BUY") {
      const sweepLow = sweep ? sweep.level : Infinity;
      let rawStop = Math.min(bestZone.low, sweepLow) - 0.15 * atr1h;
      // Floor at minStop below entry if stop is too tight or on wrong side
      if (lastPrice - rawStop < minStop) {
        rawStop = lastPrice - minStop;
      }
      sl = Number(rawStop.toFixed(5));
    } else {
      const sweepHigh = sweep ? sweep.level : -Infinity;
      let rawStop = Math.max(bestZone.high, sweepHigh) + 0.15 * atr1h;
      // Floor at minStop above entry if stop is too tight or on wrong side
      if (rawStop - lastPrice < minStop) {
        rawStop = lastPrice + minStop;
      }
      sl = Number(rawStop.toFixed(5));
    }
  }
  const step10Passed = sl !== null;
  steps.push({
    step: 10, name: "Structural Stop", question: "At what exact price is my reasoning wrong?",
    passed: step10Passed, mandatory: true,
    detail: sl !== null ? `SL ${sl} — beyond zone ${direction === "BUY" ? "low" : "high"} / sweep extreme + 0.15× ATR buffer (floored at 0.3× ATR)` : "No structural invalidation identified",
  });
  if (direction && !step10Passed) noTradeReasons.push("No clear structural invalidation point (Module 8: unclear invalidation)");

  // ── STEP 11: Structural Target ──
  let tp: number | null = null;
  if (direction && step10Passed) {
    if (direction === "BUY") {
      // Target: nearest opposing structure above (supply zone, swing high, or liquidity pool)
      const opposing = [
        ...zones.filter(z => z.type === "supply").map(z => z.low),
        ...h1Trend.swings.filter(s => s.type === "high").map(s => s.price),
        ...liquidity.buyPools.map(p => p.level),
      ].filter(level => level > lastPrice);
      tp = opposing.length > 0 ? Number(Math.min(...opposing).toFixed(5)) : null;
    } else {
      const opposing = [
        ...zones.filter(z => z.type === "demand").map(z => z.high),
        ...h1Trend.swings.filter(s => s.type === "low").map(s => s.price),
        ...liquidity.sellPools.map(p => p.level),
      ].filter(level => level < lastPrice);
      tp = opposing.length > 0 ? Number(Math.max(...opposing).toFixed(5)) : null;
    }
  }
  const step11Passed = tp !== null;
  steps.push({
    step: 11, name: "Structural Target", question: "What is the nearest genuine level that opposes me?",
    passed: step11Passed, mandatory: true,
    detail: tp !== null ? `TP ${tp} — nearest opposing structure` : "No opposing structure identified",
  });
  if (direction && !step11Passed) noTradeReasons.push("No genuine opposing structural target (Module 8: unclear target)");

  // ── STEP 12: Reward-to-Risk ≥ 1:2 ──
  const entry = step7Passed && nearZone ? lastPrice : null;
  let rr: number | null = null;
  let coherent = false;

  if (entry !== null && sl !== null && tp !== null) {
    coherent = direction === "BUY"
      ? (sl < entry && entry < tp)
      : (sl > entry && entry > tp);

    if (coherent) {
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      if (risk >= minStop) {
        rr = Number((reward / risk).toFixed(2));
      }
    }
  }

  const step12Passed = coherent && rr !== null && rr >= 2.0;
  steps.push({
    step: 12, name: "Reward-to-Risk", question: "Does the honest arithmetic clear 1:2?",
    passed: step12Passed, mandatory: true,
    detail: !coherent && entry !== null
      ? "Incoherent SL/TP levels (stop must be beyond entry on invalidation side, target towards opposing structure)"
      : (rr !== null ? `R:R 1:${rr.toFixed(2)} ${rr >= 2.0 ? "≥" : "<"} 1:2 minimum` : "Cannot calculate R:R"),
  });
  if (direction && !step12Passed) {
    if (!coherent && entry !== null) noTradeReasons.push("Incoherent SL/TP levels (Module 6: stop must be on invalidation side)");
    else if (rr !== null) noTradeReasons.push(`R:R 1:${rr} < 1:2 minimum (Module 8: poor R:R)`);
  }

  // ── STEP 13: Qualification Decision ──
  const mandatorySteps = steps.filter(s => s.mandatory);
  const allMandatoryPassed = mandatorySteps.every(s => s.passed);
  const qualified = allMandatoryPassed && noTradeReasons.length === 0;
  steps.push({
    step: 13, name: "Qualification", question: "Given all of the above, does this trade exist?",
    passed: qualified, mandatory: true,
    detail: qualified
      ? "ALL 13 STEPS PASSED — qualified trade"
      : `REJECTED: ${noTradeReasons.length} no-trade condition(s)`,
  });

  return {
    pair, timestamp: now, steps, qualified,
    direction: qualified ? direction : null,
    entry: qualified ? entry : null,
    sl: qualified ? sl : null,
    tp: qualified ? tp : null,
    rr: qualified ? rr : null,
    h4Trend, h1Trend, zones, liquidity, sweep, confirmation,
    noTradeReasons,
  };
}

export default runPrecisionSequence;
