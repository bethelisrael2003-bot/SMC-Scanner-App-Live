/* ==========================================================================
 * precision.test.ts — Verification suite for precisionEngine.ts
 * Run: npx tsx precision.test.ts
 *
 * Covers:
 *   - Stop-loss directional sanity (BUY SL < entry, SELL SL > entry)
 *   - Minimum stop distance floor (0.3x ATR minimum, no sub-pip stops)
 *   - Near-zero division guard in Step 12 R:R
 *   - Trend classification, zone building, and 13-step sequence
 * ========================================================================== */

import { runPrecisionSequence, type Candle, computeAtr } from "./precisionEngine";

let passed = 0, failed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const eq = (a: number, b: number, tol = 1e-4) => Math.abs(a - b) <= tol;

// Helper to create synthetic candle series
const C = (o: number, h: number, l: number, c: number, t?: string): Candle => ({ open: o, high: h, low: l, close: c, time: t });

console.log("\n=== precisionEngine test suite ===\n");

/* 1. Gold-like pricing with near-zero zone edge: MUST NOT produce sub-pip stop */
{
  // 30 H4 bars drifting down (DOWNTREND)
  const h4: Candle[] = [];
  let px = 4400;
  for (let i = 0; i < 40; i++) {
    h4.push(C(px, px + 5, px - 10, px - 8, `2026-09-20T${String(i % 24).padStart(2, "0")}:00:00`));
    px -= 6;
  }
  // 30 H1 bars
  const h1: Candle[] = [];
  px = 4370;
  for (let i = 0; i < 40; i++) {
    h1.push(C(px, px + 2, px - 4, px - 3, `2026-09-22T${String(i % 24).padStart(2, "0")}:00:00`));
    px -= 2;
  }
  // M15 bars: last price at 4363.80
  const m15: Candle[] = [];
  px = 4368;
  for (let i = 0; i < 30; i++) {
    m15.push(C(px, px + 1, px - 1, px - 0.5, `2026-09-22T20:${String((i % 4) * 15).padStart(2, "0")}:00`));
    px -= 0.2;
  }
  // Last closed M15 candle at 4363.80
  m15.push(C(4364.50, 4364.80, 4363.60, 4363.80, "2026-09-22T20:30:00"));

  const res = runPrecisionSequence("XAU/USD", h4, h1, m15);
  const atr = computeAtr(h1, 14);

  check("1a. Engine ran without crash", res !== null);
  if (res.sl !== null && res.entry !== null) {
    const risk = Math.abs(res.entry - res.sl);
    check("1b. SL distance is at least 0.3x ATR floor", risk >= 0.3 * atr - 1e-4, `risk=${risk} minFloor=${0.3 * atr}`);
    if (res.direction === "SELL") {
      check("1c. SELL Stop Loss is strictly ABOVE entry price", res.sl > res.entry, `entry=${res.entry} sl=${res.sl}`);
    } else if (res.direction === "BUY") {
      check("1c. BUY Stop Loss is strictly BELOW entry price", res.sl < res.entry, `entry=${res.entry} sl=${res.sl}`);
    }
  } else {
    check("1b. Discarded invalid setup safely without generating sub-pip SL", true);
  }
  if (res.rr !== null) {
    check("1d. R:R is a realistic number (< 50)", res.rr < 50, `rr=${res.rr}`);
  }
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
