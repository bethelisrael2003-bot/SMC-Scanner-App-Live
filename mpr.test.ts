/* ==========================================================================
 * mpr.test.ts — verification suite for momentumPauseRetest.ts
 * --------------------------------------------------------------------------
 * Plain-script tests (no framework). Run: npx tsx mpr.test.ts
 * Covers the exact bug patterns that burned the live system before:
 *   - wide-SL bug (entry far from consolidation)  → must return null
 *   - stale-vs-fresh setup selection              → freshest must win
 *   - zero-range / degenerate pause candles       → must return null
 *   - precision collapse (sl == entry after rounding) → must return null
 * plus boundary semantics, throw-vs-null contracts, and helpers.
 * ========================================================================== */

import {
  findMomentumPauseSetup,
  computeAtr,
  validateSetupStillValid,
  describeSetup,
  type Candle,
} from "./momentumPauseRetest";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function throws(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const eq = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;

/** Candle factory */
const C = (o: number, h: number, l: number, c: number): Candle => ({ open: o, high: h, low: l, close: c });

/** 20 quiet baseline candles: body 1, range 2, around 100 */
function baseline(n = 20): Candle[] {
  return Array.from({ length: n }, () => C(100, 101, 99, 101));
}

console.log("\n=== MPR test suite ===\n");

/* ------------------------------------------------------------------ */
/* 1. Fresh valid BUY setup — exact entry/SL/TP values                */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),   // momentum: body 8, range 9, ratio .89
    C(109, 109.4, 108.6, 109),   // pause: range 0.8, mid 109
    C(109, 109.9, 108.5, 109.05) // "now": close 109.05, range 1.4 (not a pause)
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("1a. fresh BUY setup detected", s !== null);
  if (s) {
    check("1b. entry = pause midpoint (109)", eq(s.entry, 109), `entry=${s.entry}`);
    check("1c. sl = pause low - 0.15*ATR buffer (108.3)", eq(s.sl, 108.3), `sl=${s.sl}`);
    check("1d. tp1 = 1.5R (110.05)", eq(s.tp1, 110.05), `tp1=${s.tp1}`);
    check("1e. tp2 = 2.5R (110.75)", eq(s.tp2, 110.75), `tp2=${s.tp2}`);
    check("1f. slDistance = 0.7", eq(s.slDistance, 0.7), `slDistance=${s.slDistance}`);
    check("1g. staleness = 0.05", eq(s.staleness, 0.05), `staleness=${s.staleness}`);
    check("1h. momentumIndex 20 / consolIndex 21", s.momentumIndex === 20 && s.consolIndex === 21,
      `m=${s.momentumIndex} c=${s.consolIndex}`);
    check("1i. R:R exact: tp1 1.5 / tp2 2.5",
      eq((s.tp1 - s.entry) / s.slDistance, 1.5, 1e-6) && eq((s.tp2 - s.entry) / s.slDistance, 2.5, 1e-6));
    check("1j. entry is NOT current price (109.05)", !eq(s.entry, 109.05));
  }
}

/* ------------------------------------------------------------------ */
/* 2. THE WIDE-SL BUG — price ran away after the pause → null          */
/*    (pre-6500e27 this entered with entry 500 pips from SL)           */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.4, 108.6, 109),
    C(111.5, 112.3, 111.0, 111.5)  // price ran 2.5 away (1.25x ATR > 0.75) and last candle is wide → not a new pause
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("2a. stale setup (price 1.25x ATR away) → null", s === null, `got ${JSON.stringify(s?.entry)}`);
}
{
  // Boundary: exactly 0.75x ATR away → still accepted (<= semantics)
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.4, 108.6, 109),
    C(110.5, 111.2, 109.8, 110.5)  // close 110.5, staleness exactly 1.5 = 0.75*ATR
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("2b. staleness exactly 0.75x ATR → accepted", s !== null && eq(s.entry, 109));
}
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.4, 108.6, 109),
    C(110.6, 111.3, 109.9, 110.6)  // 1.6 away > 1.5 → rejected
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("2c. staleness just past 0.75x ATR → null", s === null);
}

/* ------------------------------------------------------------------ */
/* 3. Min-SL widening: ultra-tight pause → SL floored at 0.3x ATR      */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.02, 108.98, 109),  // pause range 0.04
    C(109.05, 109.9, 108.5, 109.05)
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("3a. tight-pause setup detected", s !== null);
  if (s) {
    check("3b. slDistance widened to 0.3*ATR (0.6)", eq(s.slDistance, 0.6), `slDistance=${s.slDistance}`);
    check("3c. sl = entry - 0.6 (108.4)", eq(s.sl, 108.4), `sl=${s.sl}`);
  }
}

/* ------------------------------------------------------------------ */
/* 4. Zero-range pause → null (degenerate feed)                        */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109, 109, 109),        // zero range
    C(109.05, 109.9, 108.5, 109.05)
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("4. zero-range pause → null", s === null);
}

/* ------------------------------------------------------------------ */
/* 5. Tie-break: two fully valid setups → freshest pause wins          */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),    // momentum A (20)
    C(109, 109.4, 108.6, 109),    // pause A (21), mid 109
    C(109, 109.7, 108.3, 109.15), // filler (22): range 1.4 → not a pause, body 0.15 → not momentum
    C(109.15, 111.35, 109.15, 111.15), // momentum B (23): body 2.0, range 2.2
    C(111.15, 111.55, 110.75, 111.15), // pause B (24), mid 111.15
    C(110.3, 111.1, 109.5, 110.3)      // now: close 110.3, near both mids
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("5a. setup detected among two valid setups", s !== null);
  if (s) {
    check("5b. freshest pause (index 24) wins", s.consolIndex === 24, `consolIndex=${s.consolIndex}`);
    check("5c. entry = fresh pause mid (111.15)", eq(s.entry, 111.15), `entry=${s.entry}`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. Tie-break: one momentum, two valid pauses → FRESHEST pause wins  */
/*    (old server code returned the earliest pause — behavioral fix)   */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),   // momentum (20)
    C(109, 109.4, 108.6, 109),   // pause 1 (21), mid 109
    C(109.5, 109.9, 109.1, 109.5), // pause 2 (22), mid 109.5
    C(109.3, 110.1, 108.9, 109.3)  // now: close 109.3, range 1.2 → not a pause
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("6a. setup detected", s !== null);
  if (s) {
    check("6b. fresher pause (22) chosen over earlier (21)", s.consolIndex === 22, `consolIndex=${s.consolIndex}`);
    check("6c. entry = 109.5 (pause 2 mid)", eq(s.entry, 109.5), `entry=${s.entry}`);
  }
}

/* ------------------------------------------------------------------ */
/* 7. Tie-break: shared pause, two momenta → fresher momentum wins     */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),   // momentum A (20)
    C(109, 117.5, 108.5, 117),   // momentum B (21)
    C(117, 117.4, 116.6, 117),   // shared pause (22), mid 117
    C(117, 117.9, 116.5, 117.05) // now
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("7a. shared-pause setup detected", s !== null);
  if (s) {
    check("7b. fresher momentum (21) wins", s.momentumIndex === 21, `momentumIndex=${s.momentumIndex}`);
    check("7c. entry = 117", eq(s.entry, 117), `entry=${s.entry}`);
  }
}

/* ------------------------------------------------------------------ */
/* 8. Direction contracts                                              */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.4, 108.6, 109),
    C(109, 109.9, 108.5, 109.05)
  ];
  check("8a. bullish momentum + SELL direction → null",
    findMomentumPauseSetup(candles, "SELL", 2.0) === null);
}
{
  // Mirrored (bearish) series + SELL → valid
  const candles = [
    ...Array.from({ length: 20 }, () => C(118, 119, 117, 117)),
    C(117, 117.5, 108.5, 109),   // bearish momentum: body 8
    C(109, 109.4, 108.6, 109),   // pause, mid 109
    C(109, 109.5, 108.1, 108.95) // now: close 108.95
  ];
  const s = findMomentumPauseSetup(candles, "SELL", 2.0);
  check("8b. bearish momentum + SELL → setup", s !== null);
  if (s) {
    check("8c. SELL entry 109, sl above pause high + buffer (109.7)", eq(s.entry, 109) && eq(s.sl, 109.7),
      `entry=${s?.entry} sl=${s?.sl}`);
    check("8d. SELL tp1 107.95 / tp2 107.25", eq(s.tp1, 107.95) && eq(s.tp2, 107.25),
      `tp1=${s?.tp1} tp2=${s?.tp2}`);
  }
}

/* ------------------------------------------------------------------ */
/* 9. Momentum quality gates                                           */
/* ------------------------------------------------------------------ */
{
  // Body ratio too low (big wicks)
  const candles = [
    ...baseline(),
    C(101, 115, 100, 103),       // body 2, range 15 → ratio 0.13
    C(103, 103.4, 102.6, 103),
    C(103, 103.9, 102.5, 103.05)
  ];
  check("9a. momentum body < 60% of range → null", findMomentumPauseSetup(candles, "BUY", 2.0) === null);
}
{
  // Body multiple too low vs baseline
  const candles = [
    ...Array.from({ length: 20 }, () => C(100, 105.5, 96.5, 105)), // body 5 avg
    C(105, 111.5, 102, 111),     // body 6 < 7.5 = 1.5x5
    C(111, 111.4, 110.6, 111),
    C(111, 111.9, 110.5, 111.05)
  ];
  check("9b. momentum body < 1.5x avg body → null", findMomentumPauseSetup(candles, "BUY", 6.0) === null);
}
{
  // avgBody baseline EXCLUDES the momentum candle itself
  const candles = [
    ...Array.from({ length: 20 }, () => C(100, 102.5, 98.5, 102)), // body 2 avg
    C(102, 105.6, 101.4, 105.02), // body 3.02 ≥ 1.5x2 (but < 1.5x2.049 if self-included)
    C(105.02, 105.5, 104.7, 105.02),
    C(105.1, 106.4, 103.8, 105.1)
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 4.0);
  check("9c. avgBody excludes momentum candle (3.02 >= 1.5x2.0 accepted)", s !== null,
    "old code self-included the momentum candle in its baseline");
  // Companion: body 2.9 < 3.0 threshold → null
  const candles2 = [
    ...Array.from({ length: 20 }, () => C(100, 102.5, 98.5, 102)),
    C(102, 105.4, 101.6, 104.9), // body 2.9
    C(104.9, 105.4, 104.6, 104.9),
    C(105.0, 106.3, 103.7, 105.0)
  ];
  check("9d. momentum body 2.9 < 1.5x2.0 → null", findMomentumPauseSetup(candles2, "BUY", 4.0) === null);
}

/* ------------------------------------------------------------------ */
/* 10. Pause width gates                                               */
/* ------------------------------------------------------------------ */
{
  // Pause too wide vs momentum range (0.5 ratio)
  const candles = [
    ...baseline(),
    C(101.5, 105.2, 101.3, 105),  // momentum range 3.9
    C(105, 106.2, 103.8, 105),    // pause range 2.4 > 1.95 = 0.5x3.9
    C(105, 106.7, 103.3, 105)     // wide "now" so it isn't a pause itself
  ];
  check("10a. pause > 50% of momentum range → null", findMomentumPauseSetup(candles, "BUY", 6.0) === null);
}
{
  // Pause too wide in ATR terms (MAX_CONSOL_ATR = 0.5)
  const candles = [
    ...baseline(),
    C(101.5, 105.2, 101.3, 105),  // momentum range 3.9
    C(105, 105.15, 104.85, 105),  // pause range 0.3 — ok vs momentum, too wide vs ATR
    C(105, 105.35, 104.65, 105)   // "now": range 0.7 > 0.25 → not a pause
  ];
  check("10b. pause > 0.5x ATR → null", findMomentumPauseSetup(candles, "BUY", 0.5) === null);
}
{
  // Boundary: pause exactly 0.5x ATR → accepted
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.5, 108.5, 109),    // range 1.0 = 0.5xATR exactly
    C(109.05, 109.9, 108.5, 109.05)
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 2.0);
  check("10c. pause exactly 0.5x ATR → accepted", s !== null && eq(s.consolRange, 1.0));
}

/* ------------------------------------------------------------------ */
/* 11. Precision: gold-style prices, precision 2, exact R:R at tick    */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...Array.from({ length: 20 }, () => C(2398, 2400.5, 2397.5, 2400)),
    C(2400, 2417, 2399, 2416),         // momentum: body 16, range 18
    C(2416, 2416.447, 2415.661, 2416), // pause: mid 2416.054
    C(2416.1, 2418.8, 2413.4, 2416.1)  // "now": wide, close 2416.1
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 10.0, { precision: 2 });
  check("11a. gold setup detected (precision 2)", s !== null);
  if (s) {
    check("11b. entry rounds mid to 2416.05", eq(s.entry, 2416.05), `entry=${s.entry}`);
    check("11c. sl widened to 0.3xATR → 2413.05", eq(s.sl, 2413.05), `sl=${s.sl}`);
    check("11d. tp1 2420.55 / tp2 2423.55", eq(s.tp1, 2420.55) && eq(s.tp2, 2423.55),
      `tp1=${s.tp1} tp2=${s.tp2}`);
    const atTick = [s.entry, s.sl, s.tp1, s.tp2].every((v) => eq(v * 100, Math.round(v * 100), 1e-6));
    check("11e. all levels at 0.01 tick", atTick);
    check("11f. exact R:R at tick: 1.5 and 2.5",
      eq((s.tp1 - s.entry) / (s.entry - s.sl), 1.5, 1e-9) && eq((s.tp2 - s.entry) / (s.entry - s.sl), 2.5, 1e-9));
  }
}

/* ------------------------------------------------------------------ */
/* 12. Degenerate precision: tiny ATR + rounding collapses levels → null */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...Array.from({ length: 20 }, () => C(100, 100.00000006, 99.99999999, 100.00000005)),
    C(100.00000005, 100.00000014, 100.00000004, 100.00000013), // momentum
    C(100.00000012, 100.00000012, 100.00000010, 100.00000011), // pause, mid 100.00000011
    C(100.00000011, 100.00000016, 100.00000006, 100.00000011)  // now
  ];
  const s = findMomentumPauseSetup(candles, "BUY", 0.00000004, { precision: 5 });
  check("12. rounding collapses sl onto entry → null (coherence guard)", s === null);
}

/* ------------------------------------------------------------------ */
/* 13. Caller-contract errors (throw) vs market conditions (null)      */
/* ------------------------------------------------------------------ */
{
  const good = [...baseline(), C(101, 109.5, 100.5, 109), C(109, 109.4, 108.6, 109), C(109, 109.9, 108.5, 109.05)];
  check("13a. direction 'buy' (lowercase) → TypeError",
    throws(() => findMomentumPauseSetup(good, "buy" as any, 2.0)));
  check("13b. lookback 0.5 → RangeError",
    throws(() => findMomentumPauseSetup(good, "BUY", 2.0, { lookback: 0.5 })));
  check("13c. precision 16 → RangeError",
    throws(() => findMomentumPauseSetup(good, "BUY", 2.0, { precision: 16 })));
  check("13d. maxPauseCandles 0 → RangeError",
    throws(() => findMomentumPauseSetup(good, "BUY", 2.0, { maxPauseCandles: 0 })));
  check("13e. 4 candles → null (not throw)", findMomentumPauseSetup(baseline(4), "BUY", 2.0) === null);
  check("13f. atr = 0 → null (not throw)", findMomentumPauseSetup(good, "BUY", 0) === null);
  check("13g. atr = NaN → null (not throw)", findMomentumPauseSetup(good, "BUY", NaN) === null);
}

/* ------------------------------------------------------------------ */
/* 14. Broken-feed candles are skipped/rejected                        */
/* ------------------------------------------------------------------ */
{
  const withNanMomentum = [
    ...baseline(),
    C(101, NaN, 100.5, 109),     // NaN high in momentum
    C(109, 109.4, 108.6, 109),
    C(109, 109.9, 108.5, 109.05)
  ];
  check("14a. NaN in momentum candle → skipped → null",
    findMomentumPauseSetup(withNanMomentum, "BUY", 2.0) === null);
}
{
  const withInvertedPause = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 108.0, 109.4, 109),   // high < low → unusable
    C(109, 109.9, 108.5, 109.05)
  ];
  check("14b. inverted pause (high<low) → skipped → null",
    findMomentumPauseSetup(withInvertedPause, "BUY", 2.0) === null);
}
{
  const withNanLast = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.4, 108.6, 109),
    C(NaN, 109.9, 108.5, 109.05) // "now" unusable → whole scan null
  ];
  check("14c. NaN in last candle → null", findMomentumPauseSetup(withNanLast, "BUY", 2.0) === null);
}
{
  const withCloseOutsideRange = [
    ...baseline(),
    C(101, 109.5, 100.5, 112),   // close > high → unusable momentum
    C(109, 109.4, 108.6, 109),
    C(109, 109.9, 108.5, 109.05)
  ];
  check("14d. close outside high/low → skipped → null",
    findMomentumPauseSetup(withCloseOutsideRange, "BUY", 2.0) === null);
}

/* ------------------------------------------------------------------ */
/* 15. Input immutability                                              */
/* ------------------------------------------------------------------ */
{
  const candles = [
    ...baseline(),
    C(101, 109.5, 100.5, 109),
    C(109, 109.4, 108.6, 109),
    C(109, 109.9, 108.5, 109.05)
  ];
  const snapshot = JSON.stringify(candles);
  findMomentumPauseSetup(candles, "BUY", 2.0);
  check("15. input candles not mutated", JSON.stringify(candles) === snapshot);
}

/* ------------------------------------------------------------------ */
/* 16. computeAtr helper                                               */
/* ------------------------------------------------------------------ */
{
  const flat = Array.from({ length: 25 }, () => C(100, 101, 99, 100)); // TR = 2 every bar
  check("16a. computeAtr on constant-range series = 2", eq(computeAtr(flat, 14) ?? -1, 2, 1e-9));
  check("16b. computeAtr insufficient data → null", computeAtr(flat.slice(0, 10), 14) === null);
}

/* ------------------------------------------------------------------ */
/* 17. validateSetupStillValid                                         */
/* ------------------------------------------------------------------ */
{
  const setup = findMomentumPauseSetup(
    [...baseline(), C(101, 109.5, 100.5, 109), C(109, 109.4, 108.6, 109), C(109, 109.9, 108.5, 109.05)],
    "BUY", 2.0,
  );
  check("17a. setup exists for validity check", setup !== null);
  if (setup) {
    check("17b. price returned near entry → still valid",
      validateSetupStillValid(setup, [C(109, 109.5, 108.5, 109.2)], 2.0) === true);
    check("17c. price 2x ATR away → invalid",
      validateSetupStillValid(setup, [C(111, 111.5, 110.5, 111)], 2.0) === false);
  }
}

/* ------------------------------------------------------------------ */
/* 18. describeSetup smoke test                                        */
/* ------------------------------------------------------------------ */
{
  const setup = findMomentumPauseSetup(
    [...baseline(), C(101, 109.5, 100.5, 109), C(109, 109.4, 108.6, 109), C(109, 109.9, 108.5, 109.05)],
    "BUY", 2.0,
  );
  const desc = setup ? describeSetup(setup, "BUY") : "";
  check("18. describeSetup renders entry + R:R lines",
    desc.includes("Entry: 109") && desc.includes("R:R 1.50:1") && desc.includes("R:R 2.50:1"),
    desc.split("\n")[1] ?? "");
}

/* ------------------------------------------------------------------ */
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log("Failed checks:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
