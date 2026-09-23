/* ==========================================================================
 * asian.test.ts — Unit tests for Asian Session Range Breakout Engine
 * ========================================================================== */

import fs from "fs";
import path from "path";
import {
  computeAtr,
  extractAsianSessionRange,
  checkAsianBreakoutCandle,
  analyzeAsianBreakout,
  ASIAN_ELIGIBLE_PAIRS,
  type Candle
} from "./asianBreakout";

let passed = 0;
let failed = 0;

function assert(cond: boolean, desc: string) {
  if (cond) {
    console.log(`  PASS  ${desc}`);
    passed++;
  } else {
    console.error(`  FAIL  ${desc}`);
    failed++;
  }
}

console.log("\n=== Asian Breakout Engine Test Suite ===\n");

// ── Test 1: ATR Calculation ──────────────────────────────────────────────────
{
  const testBars: Candle[] = [];
  for (let i = 0; i < 30; i++) {
    testBars.push({ open: 100, high: 102, low: 98, close: 100, time: `2026-09-20T${String(i).padStart(2, "0")}:00:00Z` });
  }
  const atrVal = computeAtr(testBars, 14);
  assert(Math.abs(atrVal - 4.0) < 0.01, `1. Constant 4-pip range generates ATR ~4.0 (got ${atrVal})`);
}

// ── Test 2: Asian Session Extraction (00:00 - 07:00 UTC) ─────────────────────
{
  const m15Bars: Candle[] = [];
  // Build 28 candles from 00:00 to 06:45 UTC
  for (let h = 0; h < 7; h++) {
    for (let m = 0; m < 60; m += 15) {
      const timeStr = `2026-09-22T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
      // Let low be 1.08000 and high be 1.08500
      const isExtremeHigh = (h === 3 && m === 30);
      const isExtremeLow = (h === 1 && m === 15);
      const high = isExtremeHigh ? 1.08600 : 1.08400;
      const low = isExtremeLow ? 1.07900 : 1.08100;
      m15Bars.push({ open: 1.08200, high, low, close: 1.08250, time: timeStr });
    }
  }

  const range = extractAsianSessionRange(m15Bars, "2026-09-22");
  assert(range !== null, "2a. Successfully extracted Asian session range");
  assert(range?.high === 1.08600, `2b. Asian High correctly identified (1.08600, got ${range?.high})`);
  assert(range?.low === 1.07900, `2c. Asian Low correctly identified (1.07900, got ${range?.low})`);
  assert(Math.abs((range?.range || 0) - 0.00700) < 1e-6, `2d. Asian Range size = 0.00700 (got ${range?.range})`);
  assert(range?.barsCount === 28, `2e. Exactly 28 M15 bars collected in 7-hour session (got ${range?.barsCount})`);
}

// ── Test 3: Volatility Regime Filter ─────────────────────────────────────────
{
  const asianRange = {
    day: "2026-09-22",
    high: 1.08600,
    low: 1.07900,
    range: 0.00700,
    barsCount: 28,
    complete: true
  };

  const candleInsideWindow: Candle = {
    open: 1.08500,
    high: 1.08950,
    low: 1.08450,
    close: 1.08900,
    time: "2026-09-22T08:15:00Z"
  };

  // If ATR is 0.03000 (range 0.00700 is 0.23x ATR, which is < 0.36x) -> should reject
  const deadRegime = checkAsianBreakoutCandle("EUR/USD", candleInsideWindow, asianRange, 0.03000);
  assert(deadRegime === null, "3a. Range < 0.36x ATR rejected (too compressed/dead)");

  // If ATR is 0.00400 (range 0.00700 is 1.75x ATR, which is > 1.35x) -> should reject
  const expandedRegime = checkAsianBreakoutCandle("EUR/USD", candleInsideWindow, asianRange, 0.00400);
  assert(expandedRegime === null, "3b. Range > 1.35x ATR rejected (overextended)");

  // If ATR is 0.01000 (range 0.00700 is 0.70x ATR, between 0.36x and 1.35x) -> valid regime
  const normalRegime = checkAsianBreakoutCandle("EUR/USD", candleInsideWindow, asianRange, 0.01000);
  assert(normalRegime !== null, "3c. Range 0.70x ATR accepted (normal volatility regime)");
}

// ── Test 4: Window Timing Gate ───────────────────────────────────────────────
{
  const asianRange = {
    day: "2026-09-22",
    high: 1.08600,
    low: 1.07900,
    range: 0.00700,
    barsCount: 28,
    complete: true
  };

  // Candle at 06:45 UTC (before 07:00 London open)
  const earlyCandle: Candle = {
    open: 1.08500, high: 1.08950, low: 1.08450, close: 1.08900,
    time: "2026-09-22T06:45:00Z"
  };
  assert(checkAsianBreakoutCandle("EUR/USD", earlyCandle, asianRange, 0.01000) === null, "4a. Candle before 07:00 UTC rejected");

  // Candle at 10:45 UTC (after 10:30 UTC window close)
  const lateCandle: Candle = {
    open: 1.08500, high: 1.08950, low: 1.08450, close: 1.08900,
    time: "2026-09-22T10:45:00Z"
  };
  assert(checkAsianBreakoutCandle("EUR/USD", lateCandle, asianRange, 0.01000) === null, "4b. Candle after 10:30 UTC rejected");
}

// ── Test 5: BUY Breakout Math & Target Scaling ───────────────────────────────
{
  const asianRange = {
    day: "2026-09-22",
    high: 1.08600,
    low: 1.08000,
    range: 0.00600,
    barsCount: 28,
    complete: true
  };
  const atr = 0.00800; // range/atr = 0.006/0.008 = 0.75x (normal)

  // Candle: open 1.08550 (< high), close 1.08700 (> high by 0.00100 > 0.06*0.008=0.00048)
  // barRange = 1.08750 - 1.08500 = 0.00250 >= 0.36 * 0.006 = 0.00216
  const buyCandle: Candle = {
    open: 1.08550,
    high: 1.08750,
    low: 1.08500,
    close: 1.08700,
    time: "2026-09-22T07:45:00Z"
  };

  const setup = checkAsianBreakoutCandle("EUR/USD", buyCandle, asianRange, atr);
  assert(setup !== null, "5a. Valid BUY breakout setup generated");
  assert(setup?.direction === "BUY", "5b. Direction is BUY");
  assert(setup?.entry === 1.08700, `5c. Entry at close 1.08700 (got ${setup?.entry})`);

  // Expected SL = Asian Low (1.08000) - 0.08 * 0.00600 (0.00048) = 1.07952
  assert(setup?.sl === 1.07952, `5d. SL is Asian Low - 8% range = 1.07952 (got ${setup?.sl})`);

  // Expected Risk = 1.08700 - 1.07952 = 0.00748
  assert(setup?.risk === 0.00748, `5e. Risk is 0.00748 (got ${setup?.risk})`);

  // TP1 (1.5R) = 1.08700 + 1.5 * 0.00748 = 1.09822
  assert(setup?.tp1 === 1.09822, `5f. TP1 (1.5R) is 1.09822 (got ${setup?.tp1})`);

  // TP2 (4.0R) = 1.08700 + 4.0 * 0.00748 = 1.11692
  assert(setup?.tp2 === 1.11692, `5g. TP2 (4.0R) is 1.11692 (got ${setup?.tp2})`);
}

// ── Test 6: SELL Breakout Math ───────────────────────────────────────────────
{
  const asianRange = {
    day: "2026-09-22",
    high: 1.08600,
    low: 1.08000,
    range: 0.00600,
    barsCount: 28,
    complete: true
  };
  const atr = 0.00800;

  // Candle: open 1.08050 (> low), close 1.07900 (< low by 0.00100 > 0.00048)
  const sellCandle: Candle = {
    open: 1.08050,
    high: 1.08100,
    low: 1.07850,
    close: 1.07900,
    time: "2026-09-22T08:00:00Z"
  };

  const setup = checkAsianBreakoutCandle("EUR/USD", sellCandle, asianRange, atr);
  assert(setup !== null, "6a. Valid SELL breakout setup generated");
  assert(setup?.direction === "SELL", "6b. Direction is SELL");
  assert(setup?.entry === 1.07900, `6c. Entry at close 1.07900 (got ${setup?.entry})`);

  // Expected SL = Asian High (1.08600) + 0.08 * 0.00600 = 1.08648
  assert(setup?.sl === 1.08648, `6d. SL is Asian High + 8% range = 1.08648 (got ${setup?.sl})`);

  // Expected Risk = 1.08648 - 1.07900 = 0.00748
  assert(setup?.risk === 0.00748, `6e. Risk is 0.00748 (got ${setup?.risk})`);

  // TP1 (1.5R) = 1.07900 - 1.5 * 0.00748 = 1.06778
  assert(setup?.tp1 === 1.06778, `6f. TP1 (1.5R) is 1.06778 (got ${setup?.tp1})`);

  // TP2 (4.0R) = 1.07900 - 4.0 * 0.00748 = 1.04908
  assert(setup?.tp2 === 1.04908, `6g. TP2 (4.0R) is 1.04908 (got ${setup?.tp2})`);
}

// ── Test 7: Gold (XAU/USD) Precision ─────────────────────────────────────────
{
  const asianRange = {
    day: "2026-09-22",
    high: 2650.00,
    low: 2635.00,
    range: 15.00,
    barsCount: 28,
    complete: true
  };
  const atr = 18.00; // range 15 / 18 = 0.83x ATR (normal)

  const goldCandle: Candle = {
    open: 2648.00,
    high: 2656.00,
    low: 2646.00,
    close: 2654.00, // close > high by 4.00 > 0.06*18=1.08. barRange = 10 >= 0.36*15=5.4
    time: "2026-09-22T08:30:00Z"
  };

  const setup = checkAsianBreakoutCandle("XAU/USD", goldCandle, asianRange, atr);
  assert(setup !== null, "7a. Valid Gold breakout setup generated");
  assert(setup?.entry === 2654.00, `7b. Gold entry 2654.00 (got ${setup?.entry})`);
  // SL = 2635 - 0.08 * 15 = 2635 - 1.20 = 2633.80
  assert(setup?.sl === 2633.80, `7c. Gold SL rounded to 2 decimals: 2633.80 (got ${setup?.sl})`);
  assert(setup?.risk === 20.20, `7d. Gold Risk = 20.20 (got ${setup?.risk})`);
}

// ── Test 8: Universe Filter ──────────────────────────────────────────────────
{
  const nonEligible = analyzeAsianBreakout("NZD/USD", [], []);
  assert(!nonEligible.passed, "8a. Non-eligible pair (NZD/USD) correctly rejected");
  assert(nonEligible.checks[0].includes("not in Asian Breakout universe"), "8b. Diagnostic message indicates universe restriction");
}

// ── Test 9: Historical Replay Dataset Verification (28 trades, +13.11R) ──────
{
  const dataDir = path.join(process.cwd(), "replay", "data");

  const PAIR_EPICS: Record<string, string> = {
    "EUR/USD": "EURUSD",
    "GBP/USD": "GBPUSD",
    "USD/JPY": "USDJPY",
    "AUD/USD": "AUDUSD",
    "XAU/USD": "GOLD",
    "GBP/JPY": "GBPJPY",
  };

  let replayTradesCount = 0;
  let replayRSum = 0;

  for (const pair of ASIAN_ELIGIBLE_PAIRS) {
    const epic = PAIR_EPICS[pair];
    const m15Path = path.join(dataDir, `${epic}_M15.json`);
    const h1Path = path.join(dataDir, `${epic}_H1.json`);
    if (!fs.existsSync(m15Path) || !fs.existsSync(h1Path)) continue;

    const m15: any[] = JSON.parse(fs.readFileSync(m15Path, "utf-8"));
    const h1: any[] = JSON.parse(fs.readFileSync(h1Path, "utf-8"));
    const h1Candles: Candle[] = h1.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, time: b.t }));

    const trs: number[] = [0];
    for (let i = 1; i < h1Candles.length; i++) {
      const h = h1Candles[i].high, l = h1Candles[i].low, prevC = h1Candles[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
    }
    const h1AtrArr: number[] = new Array(h1Candles.length).fill(0);
    let sum = 0;
    for (let i = 0; i < 14 && i < trs.length; i++) sum += trs[i];
    if (h1Candles.length >= 14) {
      let curAtr = sum / 14;
      h1AtrArr[13] = curAtr;
      for (let i = 14; i < h1Candles.length; i++) {
        curAtr = (curAtr * 13 + trs[i]) / 14;
        h1AtrArr[i] = curAtr;
      }
    }
    const h1TimeToAtr = new Map<string, number>();
    for (let i = 0; i < h1Candles.length; i++) h1TimeToAtr.set(h1Candles[i].time!.toString(), h1AtrArr[i]);

    const dailyAsian = new Map<string, { high: number; low: number }>();
    for (const bar of m15) {
      const dt = new Date(bar.t.replace("Z", "").split("+")[0] + "Z");
      const day = dt.toISOString().slice(0, 10);
      const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
      if (hour >= 0 && hour < 7.0) {
        if (!dailyAsian.has(day)) dailyAsian.set(day, { high: -1e9, low: 1e9 });
        const it = dailyAsian.get(day)!;
        it.high = Math.max(it.high, bar.h);
        it.low = Math.min(it.low, bar.l);
      }
    }

    const takenDays = new Set<string>();
    const signals: any[] = [];
    for (let i = 20; i < m15.length - 5; i++) {
      const bar = m15[i];
      const dt = new Date(bar.t.replace("Z", "").split("+")[0] + "Z");
      const day = dt.toISOString().slice(0, 10);
      const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
      if (hour < 7.0 || hour >= 10.5) continue;
      if (takenDays.has(day)) continue;
      if (!dailyAsian.has(day)) continue;
      const asian = dailyAsian.get(day)!;
      const rangeSize = asian.high - asian.low;
      if (rangeSize <= 0) continue;

      let atrVal = 0;
      for (let j = i; j >= Math.max(0, i - 20); j--) {
        const ht = m15[j].t.slice(0, 13) + ":00:00";
        if (h1TimeToAtr.has(ht)) {
          atrVal = h1TimeToAtr.get(ht)!;
          break;
        }
      }
      if (atrVal <= 0) atrVal = rangeSize * 2;
      if (rangeSize < 0.36 * atrVal || rangeSize > 1.35 * atrVal) continue;
      const barRange = bar.h - bar.l;
      if (barRange < 0.36 * rangeSize) continue;

      if (bar.c > asian.high && bar.o < asian.high && (bar.c - asian.high) > 0.06 * atrVal) {
        const sl = asian.low - 0.08 * rangeSize;
        const entryApprox = bar.c;
        const risk = entryApprox - sl;
        if (risk <= 0) continue;
        signals.push({ idx: i, direction: "BUY", sl, targets: [[0.35, entryApprox + 1.5 * risk], [0.65, entryApprox + 4.0 * risk]], be_r: 0.8, stale_h: 7 });
        takenDays.add(day);
      } else if (bar.c < asian.low && bar.o > asian.low && (asian.low - bar.c) > 0.06 * atrVal) {
        const sl = asian.high + 0.08 * rangeSize;
        const entryApprox = bar.c;
        const risk = sl - entryApprox;
        if (risk <= 0) continue;
        signals.push({ idx: i, direction: "SELL", sl, targets: [[0.35, entryApprox - 1.5 * risk], [0.65, entryApprox - 4.0 * risk]], be_r: 0.8, stale_h: 7 });
        takenDays.add(day);
      }
    }

    let cooldownUntil = 0;
    for (const sig of signals) {
      const idx = sig.idx;
      if (idx < cooldownUntil || idx >= m15.length - 5) continue;
      const bar = m15[idx];
      const dt = new Date(bar.t.replace("Z", "").split("+")[0] + "Z");
      const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
      const dow = dt.getUTCDay();
      if (dow === 6 || (dow === 0 && hour < 21.0) || hour < 7.0) continue;

      const mult = pair.includes("JPY") ? 100 : (pair.includes("XAU") ? 10 : 10000);
      const spreadPips = (bar.ac - bar.c) * mult;
      if (spreadPips > (pair.includes("XAU") ? 50 : 5)) continue;

      const entryFill = sig.direction === "BUY" ? bar.ac : bar.c;
      const risk = Math.abs(entryFill - sig.sl);
      if (risk <= 0) continue;

      let beTriggered = false;
      let currentSl = sig.sl;
      const t0 = new Date(bar.t.replace("Z", "").split("+")[0] + "Z").getTime() / 1000;
      let totalR = 0;
      let remainingWeight = 1.0;
      const activeTargets = sig.targets.map((t: any) => [t[0], t[1], false]);
      let tradeResult: any = null;

      for (let j = idx + 1; j < Math.min(idx + 1 + 96, m15.length); j++) {
        const b = m15[j];
        const exitLow = sig.direction === "BUY" ? b.l : b.al;
        const exitHigh = sig.direction === "BUY" ? b.h : b.ah;
        const exitClose = sig.direction === "BUY" ? b.c : b.ac;
        const tj = new Date(b.t.replace("Z", "").split("+")[0] + "Z").getTime() / 1000;
        const ageH = (tj - t0) / 3600;

        if (sig.stale_h > 0 && ageH >= sig.stale_h && !beTriggered && remainingWeight === 1.0 && risk > 0) {
          const prog = sig.direction === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk;
          if (prog < 0) {
            tradeResult = { r: Number(prog.toFixed(2)), reason: "STALE", close_idx: j };
            break;
          }
        }

        if ((sig.direction === "BUY" && exitLow <= currentSl) || (sig.direction === "SELL" && exitHigh >= currentSl)) {
          const lossR = sig.direction === "BUY" ? (currentSl - entryFill) / risk : (entryFill - currentSl) / risk;
          totalR += remainingWeight * lossR;
          tradeResult = { r: Number(totalR.toFixed(2)), reason: beTriggered ? "BE" : "SL", close_idx: j };
          break;
        }

        for (const item of activeTargets) {
          const [w, tp, hit] = item;
          if (!hit) {
            if ((sig.direction === "BUY" && exitHigh >= tp) || (sig.direction === "SELL" && exitLow <= tp)) {
              item[2] = true;
              const rGain = sig.direction === "BUY" ? (tp - entryFill) / risk : (entryFill - tp) / risk;
              totalR += w * rGain;
              remainingWeight -= w;
              currentSl = entryFill;
              beTriggered = true;
            }
          }
        }

        if (remainingWeight <= 0.001) {
          tradeResult = { r: Number(totalR.toFixed(2)), reason: "ALL_TP", close_idx: j };
          break;
        }

        if (sig.be_r > 0 && !beTriggered) {
          if ((sig.direction === "BUY" && exitHigh >= entryFill + sig.be_r * risk) ||
              (sig.direction === "SELL" && exitLow <= entryFill - sig.be_r * risk)) {
            beTriggered = true;
            currentSl = entryFill;
          }
        }
      }

      if (!tradeResult) {
        const lastB = m15[Math.min(idx + 96, m15.length - 1)];
        const exitC = sig.direction === "BUY" ? lastB.c : lastB.ac;
        const finalR = sig.direction === "BUY" ? (exitC - entryFill) / risk : (entryFill - exitC) / risk;
        totalR += remainingWeight * finalR;
        tradeResult = { r: Number(totalR.toFixed(2)), reason: "EOD", close_idx: Math.min(idx + 96, m15.length - 1) };
      }

      replayTradesCount++;
      replayRSum += tradeResult.r;
      cooldownUntil = tradeResult.close_idx + 2;
    }
  }

  assert(replayTradesCount === 28, `9a. Exact 28 historical trades executed (got ${replayTradesCount})`);
  assert(Math.abs(replayRSum - 13.12) < 0.1, `9b. Exact realized R verified (+13.11R / +13.12R, got +${replayRSum.toFixed(2)}R)`);
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
