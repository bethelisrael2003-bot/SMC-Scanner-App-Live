/* ==========================================================================
 * momentumPauseRetest.ts
 * --------------------------------------------------------------------------
 * Momentum-Pause-Retest (MPR) setup detector for H1 forex/gold candles.
 *
 * This is a merged/best-of implementation, combining:
 *   - Core correctness + edge-case handling (from the "teamily" submission):
 *       zero-range rejection, deterministic tie-break among multiple valid
 *       setups, precision-aware rounding that preserves exact R:R, input
 *       immutability, and throw-vs-null error semantics.
 *   - Rich diagnostic/telemetry fields + a standalone ATR helper
 *     (from the "arena" submission): useful for logging and backtesting.
 *   - Post-hoc validity re-check + human-readable description utilities
 *     (from the "myninja" submission's utility ideas — NOT its buggy SL/TP
 *     math, which has been independently re-verified here).
 *
 * The pattern in one sentence
 *   A strong one-directional H1 candle prints, the next 1-3 candles go quiet
 *   (a tight pause), and the trade is STAGED AT THE MIDPOINT OF THE PAUSE
 *   CANDLE so that price has to come back into the pause zone before the
 *   position is filled — a pullback/retest entry, never a market entry.
 *
 * Inputs
 *   candles   - H1 OHLC series, OLDEST FIRST. The LAST element is the most
 *               recent closed candle and is treated as "now" (current price).
 *   direction - "BUY" or "SELL" (the direction the momentum must have).
 *   atr       - ATR(14) of the SAME H1 series, in price units. Use
 *               {@link computeAtr} if you don't already have one.
 *
 * Output
 *   null when no valid setup exists, otherwise an {@link MomentumPauseSetup}.
 * ========================================================================== */

/** A single OHLC candle. `time` is optional and never used by the logic. */
export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time?: number | string;
}

export type Direction = "BUY" | "SELL";

/** The signal returned when a valid setup is found. */
export interface MomentumPauseSetup {
  /** Limit order price: the midpoint of the pause candle (the retest level). */
  entry: number;
  /** Stop loss, beyond the pause candle extreme plus an ATR buffer. */
  sl: number;
  /** Take profit 1 = entry +/- tp1Rr * risk. */
  tp1: number;
  /** Take profit 2 = entry +/- tp2Rr * risk. */
  tp2: number;
  /** Midpoint of the pause candle (same as `entry`, kept for readability). */
  consolMid: number;
  /** High of the pause candle. */
  consolHigh: number;
  /** Low of the pause candle. */
  consolLow: number;

  /* ---- diagnostics (extra, for transparency / logging / backtesting) --- */
  /** Index of the momentum candle within the input array. */
  momentumIndex: number;
  /** Index of the pause (retest) candle within the input array. */
  consolIndex: number;
  /** Absolute body size of the momentum candle. */
  momentumBody: number;
  /** High-low range of the momentum candle. */
  momentumRange: number;
  /** Average body size over the preceding lookback window. */
  avgBody: number;
  /** High-low range of the pause candle. */
  consolRange: number;
  /** Final SL distance from entry (after any minimum-distance widening). */
  slDistance: number;
  /** Absolute distance from current price to the pause midpoint at detection time. */
  staleness: number;
  /** The ATR value that was supplied. */
  atr: number;
}

/** Optional knobs. Every field has a default; the required signature works without it. */
export interface MprConfig {
  /** Candles before the momentum candle used for the average-body baseline. @default 20 */
  lookback: number;
  /** How many candles after the momentum candle may hold the pause (1..N). @default 3 */
  maxPauseCandles: number;
  /** Momentum body must be >= this fraction of its own high-low range. @default 0.60 */
  momentumBodyRatio: number;
  /** Momentum body must be >= this multiple of the average body. @default 1.5 */
  momentumBodyMultiple: number;
  /** Pause range must be < this fraction of the momentum candle's range. @default 0.50 */
  consolRangeRatio: number;
  /** Pause range must be <= this multiple of ATR (width/noise filter). @default 0.5 */
  consolMaxAtr: number;
  /** Reject if current price is more than this multiple of ATR from the pause midpoint. @default 0.75 */
  maxStalenessAtr: number;
  /** Stop buffer beyond the pause extreme, in ATR. @default 0.15 */
  slBufferAtr: number;
  /** Minimum stop distance from entry, in ATR (widens tight stops). @default 0.3 */
  minSlAtr: number;
  /** TP1 = entry +/- tp1Rr * SL distance. @default 1.5 */
  tp1Rr: number;
  /** TP2 = entry +/- tp2Rr * SL distance. @default 2.5 */
  tp2Rr: number;
  /** Decimal places the returned prices are rounded to. @default 5 (FX-style); use 2 for XAUUSD. */
  precision: number;
}

const DEFAULTS: MprConfig = {
  lookback: 20,
  maxPauseCandles: 3,
  momentumBodyRatio: 0.6,
  momentumBodyMultiple: 1.5,
  consolRangeRatio: 0.5,
  consolMaxAtr: 0.5,
  maxStalenessAtr: 0.75,
  slBufferAtr: 0.15,
  minSlAtr: 0.3,
  tp1Rr: 1.5,
  tp2Rr: 2.5,
  precision: 5,
};

/** Minimum candles needed before the routine will attempt anything. */
const MIN_CANDLES = 5;
/** Of the `lookback` candles preceding a momentum candle, at least this share must be usable. */
const MIN_USABLE_LOOKBACK_RATIO = 0.5;

/**
 * Absolute tolerance for price comparisons. H1 FX/gold prices are O(1)-O(1e4),
 * where IEEE-754 double error is ~1e-13 to 1e-12, so 1e-9 is comfortably above
 * float noise and far below any real tick — it prevents a candle that is
 * *mathematically* exactly on a threshold from being rejected by a 1e-16 artefact.
 */
const EPS = 1e-9;

/* --------------------------------------------------------------------------
 * helpers
 * ----------------------------------------------------------------------- */

/** True only for a real, positive, finite number (rejects 0, negative, NaN, Infinity). */
function isFinitePositive(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Structural sanity check on one candle. Rejects NaN/Infinity, an inverted bar
 * (high < low), and any bar whose open/close sits outside its own high/low —
 * all of which indicate a broken feed rather than a real market event.
 */
function isUsableCandle(candle: Candle | undefined | null): candle is Candle {
  if (candle === undefined || candle === null) return false;
  const { open, high, low, close } = candle;
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return false;
  }
  if (high < low - EPS) return false;
  if (open < low - EPS || open > high + EPS) return false;
  if (close < low - EPS || close > high + EPS) return false;
  return true;
}

function candleRange(candle: Candle): number {
  return candle.high - candle.low;
}

function candleBody(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

/**
 * Rounds to `decimals` places using toFixed (rounds the exact binary value),
 * so the caller can place orders at the instrument's tick size instead of
 * getting e.g. 2409.0000000000002. Never returns negative zero.
 */
function roundTo(value: number, decimals: number): number {
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Internal shape of a valid candidate while the scan runs. */
interface Candidate {
  momentumIndex: number;
  consolIndex: number;
  momentumBody: number;
  momentumRange: number;
  avgBody: number;
  consolHigh: number;
  consolLow: number;
  consolRange: number;
  consolMid: number;
  staleness: number;
}

/* ==========================================================================
 * findMomentumPauseSetup
 * ========================================================================== */

/**
 * Scans `candles` for the freshest valid momentum -> pause -> retest setup
 * in `direction`.
 *
 * @throws TypeError  if `direction` is neither "BUY" nor "SELL" (a caller bug).
 * @throws RangeError if a config option is out of its documented range (a caller bug).
 * @returns the setup (rounded to `config.precision` decimals), or `null` when
 *          no valid setup exists — a legitimate market condition, not an error.
 */
export function findMomentumPauseSetup(
  candles: readonly Candle[],
  direction: Direction,
  atr: number,
  opts: Partial<MprConfig> = {},
): MomentumPauseSetup | null {
  // ---- 0. Caller-contract validation (throws — this is a programmer error) ----
  if (direction !== "BUY" && direction !== "SELL") {
    throw new TypeError(
      `findMomentumPauseSetup: direction must be "BUY" or "SELL" (received ${String(direction)})`,
    );
  }

  const cfg: MprConfig = { ...DEFAULTS, ...opts };

  if (!Number.isInteger(cfg.lookback) || cfg.lookback < 1) {
    throw new RangeError(`findMomentumPauseSetup: lookback must be an integer >= 1 (received ${String(cfg.lookback)})`);
  }
  if (!Number.isInteger(cfg.maxPauseCandles) || cfg.maxPauseCandles < 1) {
    throw new RangeError(`findMomentumPauseSetup: maxPauseCandles must be an integer >= 1 (received ${String(cfg.maxPauseCandles)})`);
  }
  if (!Number.isInteger(cfg.precision) || cfg.precision < 0 || cfg.precision > 15) {
    throw new RangeError(`findMomentumPauseSetup: precision must be an integer in [0,15] (received ${String(cfg.precision)})`);
  }

  // ---- 1. Market-condition validation (returns null — not a caller error) ----
  if (!Array.isArray(candles) || candles.length < MIN_CANDLES) return null;
  if (!isFinitePositive(atr)) return null;

  const n = candles.length;
  const isBull = direction === "BUY";

  const lastCandle = candles[n - 1];
  if (!isUsableCandle(lastCandle)) return null;
  const currentPrice = lastCandle.close;

  // ---- 2. Prefix sums for O(1) average-body lookups -------------------------
  const bodyPrefix = new Array<number>(n + 1).fill(0);
  const countPrefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const usable = isUsableCandle(candles[i]);
    bodyPrefix[i + 1] = bodyPrefix[i] + (usable ? candleBody(candles[i]) : 0);
    countPrefix[i + 1] = countPrefix[i] + (usable ? 1 : 0);
  }
  const minUsableInWindow = Math.ceil(cfg.lookback * MIN_USABLE_LOOKBACK_RATIO);

  // ---- 3. Scan for momentum candles (a momentum candle needs `lookback` ----
  // candles before it and at least one candle after it for the pause).
  const candidates: Candidate[] = [];

  for (let m = n - 2; m >= cfg.lookback; m--) {
    const momentum = candles[m];
    if (!isUsableCandle(momentum)) continue;

    const momRange = candleRange(momentum);
    const momBody = candleBody(momentum);
    if (!(momRange > EPS) || !(momBody > EPS)) continue;

    // Rule 1a: body >= 60% of the total range (small wicks = conviction).
    if (momBody + EPS < cfg.momentumBodyRatio * momRange) continue;

    // Rule 1b: body >= 1.5x the average body of the candles BEFORE it
    // (the momentum candle is excluded from its own baseline).
    const windowSum = bodyPrefix[m] - bodyPrefix[Math.max(0, m - cfg.lookback)];
    const windowCount = countPrefix[m] - countPrefix[Math.max(0, m - cfg.lookback)];
    if (windowCount < minUsableInWindow) continue;
    const avgBody = windowSum / windowCount;
    if (momBody + EPS < cfg.momentumBodyMultiple * avgBody) continue;

    // Rule 1c: direction must match the candle's own direction.
    const isBullish = momentum.close > momentum.open;
    if (isBull && !isBullish) continue;
    if (!isBull && !(momentum.close < momentum.open)) continue;

    // ---- 4. Look for the pause in the next 1..maxPauseCandles candles ----
    for (let k = 1; k <= cfg.maxPauseCandles; k++) {
      const pauseIndex = m + k;
      if (pauseIndex > n - 1) break;

      const pause = candles[pauseIndex];
      if (!isUsableCandle(pause)) continue;

      const pauseRange = candleRange(pause);
      // A zero-range pause gives no distinguishable retest zone — reject it
      // (more likely a stalled/frozen feed than a genuine tradeable pause).
      if (!(pauseRange > EPS)) continue;

      // Rule 2: pause must be genuinely tight vs. the momentum candle.
      if (pauseRange + EPS > cfg.consolRangeRatio * momRange) continue;
      // Rule 3: and tight in absolute terms vs. current volatility.
      if (pauseRange > cfg.consolMaxAtr * atr + EPS) continue;

      const consolHigh = pause.high;
      const consolLow = pause.low;
      const consolMid = (consolHigh + consolLow) / 2;

      // Rule 5: staleness gate — price must still be near the retest zone.
      const staleness = Math.abs(currentPrice - consolMid);
      if (staleness > cfg.maxStalenessAtr * atr + EPS) continue;

      candidates.push({
        momentumIndex: m,
        consolIndex: pauseIndex,
        momentumBody: momBody,
        momentumRange: momRange,
        avgBody,
        consolHigh,
        consolLow,
        consolRange: pauseRange,
        consolMid,
        staleness,
      });
    }
  }

  if (candidates.length === 0) return null;

  // ---- 5. Deterministic tie-break when several setups qualify at once ------
  // More than one momentum candle can qualify, one momentum candle can have
  // several qualifying pauses, and two different momentum candles can even
  // share a pause candle. Rank, in order:
  //   1. freshest pause candle   - the zone most likely being tested right now;
  //   2. tighter pause range     - the higher-quality pause;
  //   3. more recent momentum    - the fresher impulse.
  // This also fixes a real bug found in one AI-generated submission that
  // scanned oldest-first and returned the FIRST (i.e. stalest) valid match
  // instead of the freshest one.
  candidates.sort((a, b) => {
    if (a.consolIndex !== b.consolIndex) return b.consolIndex - a.consolIndex;
    const rangeDiff = a.consolRange - b.consolRange;
    if (Math.abs(rangeDiff) > EPS) return rangeDiff;
    return b.momentumIndex - a.momentumIndex;
  });

  const best = candidates[0];

  // ---- 6. Stop loss: beyond the pause extreme + buffer, floored at a minimum
  const buffer = cfg.slBufferAtr * atr;
  const rawStop = isBull ? best.consolLow - buffer : best.consolHigh + buffer;
  let slDistance = Math.abs(best.consolMid - rawStop);
  let stopLevel = rawStop;
  const minStopDistance = cfg.minSlAtr * atr;
  if (slDistance + EPS < minStopDistance) {
    slDistance = minStopDistance;
    stopLevel = isBull ? best.consolMid - slDistance : best.consolMid + slDistance;
  }

  // ---- 7. Round to instrument precision FIRST, then derive risk/targets from
  // the ROUNDED entry/stop — this keeps the published R:R exact at the quoted
  // tick size instead of drifting due to rounding (verified against a real
  // FX-precision bug class found during review of other submissions).
  const entry = roundTo(best.consolMid, cfg.precision);
  const sl = roundTo(stopLevel, cfg.precision);
  const risk = Math.abs(entry - sl);

  const tp1 = roundTo(isBull ? entry + cfg.tp1Rr * risk : entry - cfg.tp1Rr * risk, cfg.precision);
  const tp2 = roundTo(isBull ? entry + cfg.tp2Rr * risk : entry - cfg.tp2Rr * risk, cfg.precision);

  const setup: MomentumPauseSetup = {
    entry,
    sl,
    tp1,
    tp2,
    consolMid: entry,
    consolHigh: roundTo(best.consolHigh, cfg.precision),
    consolLow: roundTo(best.consolLow, cfg.precision),
    momentumIndex: best.momentumIndex,
    consolIndex: best.consolIndex,
    momentumBody: best.momentumBody,
    momentumRange: best.momentumRange,
    avgBody: best.avgBody,
    consolRange: best.consolRange,
    slDistance: risk,
    staleness: best.staleness,
    atr,
  };

  // ---- 8. Degenerate-precision guard ----------------------------------------
  // When ATR is tiny relative to the requested precision, rounding can
  // collapse levels onto each other (sl == entry, or a target on the wrong
  // side). An unusable signal is worse than no signal.
  const coherent = isBull
    ? setup.sl < setup.entry && setup.entry < setup.tp1 && setup.tp1 < setup.tp2
    : setup.sl > setup.entry && setup.entry > setup.tp1 && setup.tp1 > setup.tp2;
  if (!coherent) return null;

  return setup;
}

/**
 * Compute Wilder's ATR (average true range) over `period` periods.
 * Provided as a convenience — the detector itself accepts ATR as a parameter.
 * Returns `null` if there is not enough data.
 */
export function computeAtr(candles: readonly Candle[], period = 14): number | null {
  if (!Array.isArray(candles) || period < 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    if (!isUsableCandle(c) || !isUsableCandle(p)) continue;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close),
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;

  let atr = 0;
  for (let i = 0; i < period; i++) atr += trs[i];
  atr /= period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/**
 * Re-check whether a previously detected setup is still valid against fresh
 * candle data — useful when a limit order hasn't filled yet and you want to
 * confirm the retest opportunity hasn't already passed.
 */
export function validateSetupStillValid(
  setup: MomentumPauseSetup,
  candles: readonly Candle[],
  atr: number,
  opts: Partial<Pick<MprConfig, "maxStalenessAtr">> = {},
): boolean {
  if (!setup || !Array.isArray(candles) || candles.length === 0) return false;
  if (!isFinitePositive(atr)) return false;

  const last = candles[candles.length - 1];
  if (!isUsableCandle(last)) return false;

  const maxStalenessAtr = opts.maxStalenessAtr ?? DEFAULTS.maxStalenessAtr;
  const distance = Math.abs(last.close - setup.entry);
  return distance <= maxStalenessAtr * atr;
}

/** Human-readable description of a setup, useful for logs/alerts/UI display. */
export function describeSetup(setup: MomentumPauseSetup, direction: Direction): string {
  const risk = Math.abs(setup.entry - setup.sl);
  const reward1 = Math.abs(setup.tp1 - setup.entry);
  const reward2 = Math.abs(setup.tp2 - setup.entry);

  return `Momentum-Pause-Retest Setup (${direction}):
├─ Entry: ${setup.entry} (retest of pause zone ${setup.consolLow}-${setup.consolHigh})
├─ Stop Loss: ${setup.sl} (risk: ${risk})
├─ TP1: ${setup.tp1} (reward: ${reward1}, R:R ${(reward1 / risk).toFixed(2)}:1)
├─ TP2: ${setup.tp2} (reward: ${reward2}, R:R ${(reward2 / risk).toFixed(2)}:1)
├─ Momentum candle body/avg: ${(setup.momentumBody / setup.avgBody).toFixed(2)}x
└─ Pause range vs momentum: ${((setup.consolRange / setup.momentumRange) * 100).toFixed(1)}%`;
}

export default findMomentumPauseSetup;
