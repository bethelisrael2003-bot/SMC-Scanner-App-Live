/* ==========================================================================
 * classic.test.ts — verification suite for classicSetup.ts
 * Run: npx tsx classic.test.ts
 *
 * Synthetic but mechanically complete BUY setup:
 *   H4: rising history (lows spaced > 0.2, no accidental pools) → equal-lows
 *       pool (100.00/100.05) → bearish OB candle (100.10-101.10) + 1.5x ATR
 *       bullish impulse → SWEEP bar (wicks to 99.80, closes 100.60) → current
 *       bar 100.70. Pool arithmetic verified so the ONLY swept pool resolves
 *       to the intended sweep bar.
 *   M15: 9-period declining zigzag (BEARISH: lower swing highs + lower swing
 *       lows) ending ~100.42 → final bar closes 100.90 above the last swing
 *       high (~100.71) with a strong bullish body = break + confirmation.
 * ========================================================================== */
import { findClassicSetup, type Candle } from "./classicSetup";

let passed = 0, failed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const eq = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const iso = (base: number, minutes: number) => new Date(base + minutes * 60000).toISOString().slice(0, 16);

const T0 = Date.parse("2026-09-14T00:00:00Z");

const H4 = (): Candle[] => {
  const bars: Candle[] = [];
  let px = 90;
  for (let i = 0; i < 50; i++) {                       // rising history
    bars.push({ open: px, high: px + 0.16, low: px - 0.05, close: px + 0.15, time: iso(T0, i * 60) });
    px += 0.21;
  }
  // Overwrite the last history bar: its generated low (100.24) would pair with
  // the OB lows (100.10) into an extra pool at 100.17 — verified collision.
  // Low 100.21 keeps every unintended pair-mean either absent or unsweepable.
  bars[49] = { open: 100.23, high: 100.55, low: 100.21, close: 100.40, time: iso(T0, 49 * 60) };
  // idx 50, 51: equal-lows liquidity pool (100.00 / 100.05)
  bars.push({ open: px, high: px + 0.03, low: 100.00, close: px + 0.02, time: "2026-09-16T09:00" });
  bars.push({ open: px + 0.02, high: px + 0.07, low: 100.05, close: px + 0.05, time: "2026-09-16T10:00" });
  // idx 52, 53: rise with lows (100.78 / 100.98) spaced > 0.15 from every other
  // low in the window — verified: no unintended equal-low pools form, so the
  // only swept pool is the intended one (swept by the idx-58 bar)
  bars.push({ open: 100.80, high: 101.02, low: 100.78, close: 101.00, time: "2026-09-16T11:00" });
  bars.push({ open: 101.00, high: 101.22, low: 100.98, close: 101.20, time: "2026-09-16T12:00" });
  // idx 54: bearish OB candle — the POI [100.10, 101.10]
  bars.push({ open: 101.00, high: 101.10, low: 100.10, close: 100.20, time: "2026-09-16T13:00" });
  // idx 55-57: bullish impulse (>> 1.5x ATR)
  bars.push({ open: 100.20, high: 102.30, low: 100.10, close: 102.20, time: "2026-09-16T14:00" });
  bars.push({ open: 102.20, high: 103.60, low: 102.10, close: 103.50, time: "2026-09-16T15:00" });
  bars.push({ open: 103.50, high: 103.90, low: 103.40, close: 103.80, time: "2026-09-16T16:00" });
  // idx 58: SWEEP — wicks below the pool, closes back above
  bars.push({ open: 102.00, high: 102.30, low: 99.80, close: 100.60, time: "2026-09-16T18:00" });
  // idx 59: current bar
  bars.push({ open: 100.60, high: 100.75, low: 100.50, close: 100.70, time: "2026-09-16T20:00" });
  return bars;
};

const M15 = (lastClose?: number, lastHigh?: number): Candle[] => {
  const bars: Candle[] = [];
  const TM0 = Date.parse("2026-09-16T06:00:00Z");
  let px = 101.5;
  for (let i = 0; i < 54; i++) {                       // 9 periods: 3 up (+0.05), 3 down (-0.09)
    const up = i % 6 < 3;
    const c = up ? px + 0.05 : px - 0.09;
    bars.push({
      open: px,
      high: up ? c + 0.02 : px + 0.01,
      low: up ? px - 0.01 : c - 0.02,
      close: c,
      time: iso(TM0, i * 15),
    });
    px = c;
  }
  // idx 54-58: drift, closes and highs below the last swing high (~100.71)
  const drift: [number, number, number, number][] = [
    [100.42, 100.60, 100.38, 100.55],
    [100.55, 100.58, 100.44, 100.46],
    [100.46, 100.56, 100.40, 100.52],
    [100.52, 100.55, 100.42, 100.45],
    [100.45, 100.58, 100.41, 100.50],
  ];
  drift.forEach((d, k) => bars.push({ open: d[0], high: d[1], low: d[2], close: d[3], time: iso(TM0, (54 + k) * 15) }));
  // idx 59: BREAK + CONFIRMATION — close 100.90 above last SH (~100.71),
  // strong body, inside the POI zone
  const c = lastClose ?? 100.90, h = lastHigh ?? 100.95;
  bars.push({ open: 100.50, high: h, low: 100.44, close: c, time: iso(TM0, 59 * 15) });
  return bars;
};

console.log("\n=== classicSetup test suite ===\n");

const h4 = H4(), m15 = M15();
const ATR = 0.5;

/* 1. Default config (M15-own prior, sweep anchor) — valid BUY setup */
{
  const s = findClassicSetup(h4, m15, ATR, "BUY");
  check("1a. valid BUY setup detected (default config)", s !== null);
  if (s) {
    check("1b. structType CHOCH (M15 prior BEARISH, close above last SH)", s.structType === "CHOCH", `got ${s.structType}`);
    check("1c. structPrior BEARISH (M15 own trend)", s.structPrior === "BEARISH", `got ${s.structPrior}`);
    check("1d. sweep anchor: SL = sweep wick - 0.15*ATR (99.725)", s.slAnchor === "sweep" && eq(s.sl, 99.725, 1e-5), `sl=${s.sl}`);
    check("1e. entry = confirmation close (100.90)", eq(s.entry, 100.9), `entry=${s.entry}`);
    const risk = 100.9 - 99.725;
    check("1f. tp1 = entry + 1.5R (102.6625)", eq(s.tp1, 100.9 + 1.5 * risk, 1e-5), `tp1=${s.tp1}`);
    check("1g. sweepExtreme = the sweep wick (99.80)", eq(s.sweepExtreme, 99.8), `got ${s.sweepExtreme}`);
    check("1h. POI = the H4 order block [100.10, 101.10]", eq(s.poiLow, 100.1, 1e-9) && eq(s.poiHigh, 101.1, 1e-9), `poi ${s.poiLow}-${s.poiHigh}`);
    check("1i. slAtr = risk/ATR (2.35)", eq(s.slAtr, risk / ATR, 1e-4), `slAtr=${s.slAtr}`);
  }
}

/* 2. H1-prior config (live shadow-mode config): same plan, labelled BOS */
{
  const s = findClassicSetup(h4, m15, ATR, "BUY", { structPriorTrend: "BULLISH" });
  check("2a. valid with structPriorTrend=BULLISH", s !== null);
  if (s) {
    check("2b. structType BOS (prior BULLISH, close above last SH)", s.structType === "BOS", `got ${s.structType}`);
    check("2c. structPrior BULLISH", s.structPrior === "BULLISH");
    check("2d. plan identical to default config", eq(s.sl, 99.725, 1e-5) && eq(s.entry, 100.9) && eq(s.tp1, 102.6625, 1e-4), `sl=${s.sl} tp1=${s.tp1}`);
  }
}

/* 3. POI SL anchor: SL beyond the OB far edge */
{
  const s = findClassicSetup(h4, m15, ATR, "BUY", { structPriorTrend: "BULLISH", slAnchor: "poi" });
  check("3a. valid with slAnchor=poi", s !== null);
  if (s) {
    check("3b. SL = poiLow - 0.15*ATR (100.025)", s.slAnchor === "poi" && eq(s.sl, 100.025, 1e-5), `sl=${s.sl}`);
    check("3c. tp1 = entry + 1.5R (102.2125)", eq(s.tp1, 102.2125, 1e-4), `tp1=${s.tp1}`);
  }
}

/* 4. RANGE prior -> null */
check("4. structPriorTrend=RANGE -> null", findClassicSetup(h4, m15, ATR, "BUY", { structPriorTrend: "RANGE" }) === null);

/* 5. Sweep wick short of every pool -> null.
   Low 100.09 sits ABOVE every pool's tolerance floor (highest is 100.155 -
   0.08 = 100.075) and forms no new valid pair, so nothing sweeps. */
{
  const h5 = [...h4];
  h5[58] = { ...h5[58], low: 100.09 };
  check("5. sweep wick short of every pool -> null", findClassicSetup(h5, m15, ATR, "BUY", { structPriorTrend: "BULLISH" }) === null);
}

/* 6. SELL on this BUY-shaped series -> null */
check("6. SELL direction -> null (no sell-side confirmation)", findClassicSetup(h4, m15, ATR, "SELL", { structPriorTrend: "BEARISH" }) === null);

/* 7. Sweep AFTER the break (sequence violated) -> null */
{
  const h7 = [...h4];
  h7[58] = { ...h7[58], time: "2026-09-16T21:00" };   // M15 break is at 20:45
  check("7. sweep timestamp after the break -> null (sequence)", findClassicSetup(h7, m15, ATR, "BUY", { structPriorTrend: "BULLISH" }) === null);
}

/* 8. No break + weak confirmation on the last bar -> null */
{
  const m8 = M15(100.52, 100.60);                      // closes below the SH, weak body
  check("8. no break + no confirmation -> null", findClassicSetup(h4, m8, ATR, "BUY", { structPriorTrend: "BULLISH" }) === null);
}

/* 9. Dual OB + DOL Targeting (Champion #1 features) */
{
  const s = findClassicSetup(h4, m15, ATR, "BUY", {
    structPriorTrend: "BULLISH",
    slAnchor: "sweep",
    h1: h4, // pass h1 candles
    poiTimeframe: "ANY",
    dolTargeting: true,
  });
  check("9a. valid with Dual OB + DOL targeting", s !== null);
  if (s) {
    check("9b. tp2Dol is defined and > entry for BUY", typeof s.tp2Dol === "number" && s.tp2Dol > s.entry, `tp2Dol=${s.tp2Dol} entry=${s.entry}`);
    check("9c. rrDol is defined and >= 1.5", typeof s.rrDol === "number" && s.rrDol >= 1.5, `rrDol=${s.rrDol}`);
    check("9d. poiSource is defined", typeof s.poiSource === "string", `poiSource=${s.poiSource}`);
  }
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) { failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
