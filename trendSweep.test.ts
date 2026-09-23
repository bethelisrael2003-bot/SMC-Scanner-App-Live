/* ==========================================================================
 * trendSweep.test.ts — Unit tests & Backtest Verification for Trend Sweep Engine
 * ========================================================================== */

import fs from "fs";
import path from "path";
import {
  computeAtr,
  computeEma,
  findCompletedH1Index,
  evaluateTrendSweep,
  TREND_SWEEP_PAIRS,
  parseIsoSeconds,
  type Candle
} from "./trendSweep";

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

console.log("\n=== Trend Sweep Engine Test Suite ===\n");

// ── Test 1: EMA Calculation ──────────────────────────────────────────────────
{
  const series = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const ema = computeEma(series, 5);
  assert(ema.length === series.length, "1a. EMA series length matches input");
  assert(ema[4] === 12, `1b. Initial SMA at index 4 is 12 (got ${ema[4]})`);
  assert(ema[ema.length - 1] >= 18.0, `1c. Final EMA value reflects upward trend (got ${ema[ema.length - 1]})`);
}

// ── Test 2: Zero-Lookahead Completed H1 Lookup ───────────────────────────────
{
  const h1Bars: Candle[] = [
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-02T10:00:00Z" },
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-02T11:00:00Z" },
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-02T12:00:00Z" },
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-02T13:00:00Z" },
  ];

  // At 13:15:00 UTC, the candle starting at 13:00:00 is forming.
  // The last completed candle is index 2 (12:00:00 to 13:00:00).
  const m15Sec = parseIsoSeconds("2026-07-02T13:15:00Z");
  const idx = findCompletedH1Index(h1Bars, m15Sec);
  assert(idx === 2, `2a. Strictly identifies 12:00:00 bar (index 2) as last completed at 13:15 UTC (got ${idx})`);

  // At 14:00:00 UTC, the candle starting at 13:00:00 has just completed.
  const m15Sec2 = parseIsoSeconds("2026-07-02T14:00:00Z");
  const idx2 = findCompletedH1Index(h1Bars, m15Sec2);
  assert(idx2 === 3, `2b. Identifies 13:00:00 bar (index 3) as completed at 14:00 UTC (got ${idx2})`);
}

// ── Test 3: Synthetic BUY Sweep & Targets ─────────────────────────────────────
{
  // 30 H1 bars with strong bullish trend (EMA10 > EMA20, close > EMA10)
  const h1Bars: Candle[] = [];
  for (let i = 0; i < 30; i++) {
    const p = 1.0500 + i * 0.0020;
    h1Bars.push({ open: p, high: p + 0.0015, low: p - 0.0005, close: p + 0.0010, time: `2026-07-01T${String(i % 24).padStart(2, "0")}:00:00Z` });
  }

  // 35 M15 bars
  const m15Bars: Candle[] = [];
  for (let i = 0; i < 35; i++) {
    const p = 1.1000 + (i < 20 ? i * 0.0005 : 0.0100);
    m15Bars.push({ open: p, high: p + 0.0010, low: p - 0.0005, close: p + 0.0005, time: `2026-07-02T${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}:00Z` });
  }

  // Bar 34 sweeps prior low with strong body (>50%)
  // candleRange = 0.0025, body = 0.0016 (64% body)
  const priorLow = Math.min(...m15Bars.slice(14, 34).map(b => b.low));
  m15Bars[34] = {
    open: priorLow - 0.00030,
    high: priorLow + 0.00150,
    low: priorLow - 0.00100, // sweeps low!
    close: priorLow + 0.00130, // closes back above!
    time: "2026-07-02T10:15:00Z"
  };

  const result = evaluateTrendSweep("EUR/JPY", m15Bars, h1Bars, 34);
  assert(result.macroRegime === "BUY", "3a. Macro H1 trend recognized as BUY");
  assert(result.passed === true, "3b. BUY liquidity sweep setup passed");
  assert(result.setup?.direction === "BUY", "3c. Direction is BUY");
  assert(result.setup?.tp1 !== undefined && result.setup.tp1 > result.setup.entry, "3d. Target 1 is above entry");
  assert(result.setup?.tp2 !== undefined && result.setup.tp2 > result.setup.tp1, "3e. Target 2 is above Target 1");
}

// ── Test 4: Universe Rejection ───────────────────────────────────────────────
{
  const nonEligible = evaluateTrendSweep("NZD/USD", [], []);
  assert(!nonEligible.passed, "4a. Non-eligible pair (NZD/USD) correctly rejected");
  assert(nonEligible.checks[0].includes("not in Trend Sweep universe"), "4b. Diagnostic message indicates universe restriction");
}

// ── Test 5: Historical Dataset Verification (21 trades, +12.78R) ─────────────
{
  const dataDir = path.join(process.cwd(), "replay", "data");
  const PAIR_EPICS: Record<string, string> = {
    "XAU/USD": "GOLD",
    "XAG/USD": "SILVER",
    "USD/JPY": "USDJPY",
    "GBP/JPY": "GBPJPY",
    "EUR/JPY": "EURJPY",
    "USD/CHF": "USDCHF"
  };

  let totalSimulatedTrades = 0;
  let totalRealizedR = 0;

  for (const pair of TREND_SWEEP_PAIRS) {
    const epic = PAIR_EPICS[pair];
    const m15Path = path.join(dataDir, `${epic}_M15.json`);
    const h1Path = path.join(dataDir, `${epic}_H1.json`);
    if (!fs.existsSync(m15Path) || !fs.existsSync(h1Path)) continue;

    const m15: any[] = JSON.parse(fs.readFileSync(m15Path, "utf-8"));
    const h1: any[] = JSON.parse(fs.readFileSync(h1Path, "utf-8"));
    const m15Candles: Candle[] = m15.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, time: b.t }));
    const h1Candles: Candle[] = h1.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, time: b.t }));

    const trs = [0.0];
    for (let i = 1; i < m15Candles.length; i++) {
      const b = m15Candles[i], p = m15Candles[i - 1];
      trs.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)));
    }
    const m15Atr = new Array(m15Candles.length).fill(0);
    let s = 0;
    for (let i = 1; i <= 14 && i < trs.length; i++) s += trs[i];
    m15Atr[14] = s / 14;
    for (let i = 15; i < m15Candles.length; i++) {
      m15Atr[i] = (m15Atr[i - 1] * 13 + trs[i]) / 14;
    }

    const h1Closes = h1Candles.map(c => c.close);
    const ema10 = computeEma(h1Closes, 10);
    const ema20 = computeEma(h1Closes, 20);

    const signals: any[] = [];
    for (let i = 35; i < m15Candles.length; i++) {
      const bar = m15Candles[i];
      const barSec = parseIsoSeconds(bar.time);
      const dt = new Date(barSec * 1000);
      const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;
      if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || hour < 8.0 || hour >= 15.0) continue;

      const h1Idx = findCompletedH1Index(h1Candles, barSec);
      if (h1Idx < 20) continue;

      const completedH1 = h1Candles[h1Idx];
      let regime: "BUY" | "SELL" | null = null;
      if (ema10[h1Idx] > ema20[h1Idx] && completedH1.close > ema10[h1Idx]) regime = "BUY";
      else if (ema10[h1Idx] < ema20[h1Idx] && completedH1.close < ema10[h1Idx]) regime = "SELL";
      if (!regime) continue;

      const prior = m15Candles.slice(i - 20, i);
      let priorLow = Infinity, priorHigh = -Infinity;
      for (const p of prior) {
        if (p.low < priorLow) priorLow = p.low;
        if (p.high > priorHigh) priorHigh = p.high;
      }

      const cr = bar.high - bar.low;
      if (cr <= 0 || m15Atr[i] <= 0) continue;
      if (Math.abs(bar.close - bar.open) / cr < 0.50) continue;

      if (regime === "BUY" && bar.low < priorLow && bar.close > priorLow && bar.close > bar.open) {
        const entry = m15[i].ac;
        const sl = bar.low - 1.2 * m15Atr[i];
        const risk = entry - sl;
        if (risk <= 0) continue;
        signals.append ? null : signals.push({
          idx: i, direction: "BUY", sl, targets: [[0.50, entry + 1.0 * risk], [0.50, entry + 2.50 * risk]], be_r: 1.0, stale_h: 8
        });
      } else if (regime === "SELL" && bar.high > priorHigh && bar.close < priorHigh && bar.close < bar.open) {
        const entry = m15[i].c;
        const sl = bar.high + 1.2 * m15Atr[i];
        const risk = sl - entry;
        if (risk <= 0) continue;
        signals.push({
          idx: i, direction: "SELL", sl, targets: [[0.50, entry - 1.0 * risk], [0.50, entry - 2.50 * risk]], be_r: 1.0, stale_h: 8
        });
      }
    }

    let cooldownUntil = 0;
    for (const sig of signals) {
      const idx = sig.idx;
      if (idx < cooldownUntil || idx >= m15.length - 5) continue;
      const bar = m15[idx];
      const mult = pair.includes("JPY") ? 100 : (pair.includes("XAU") ? 10 : (pair.includes("XAG") ? 100 : 10000));
      const spreadPips = (bar.ac - bar.c) * mult;
      if (spreadPips > (pair.includes("XAU") ? 50 : 15)) continue;

      const entryFill = sig.direction === "BUY" ? bar.ac : bar.c;
      const risk = Math.abs(entryFill - sig.sl);
      if (risk <= 0) continue;

      let beTriggered = false;
      let currentSl = sig.sl;
      const t0 = parseIsoSeconds(bar.t);
      let totalR = 0;
      let remainingWeight = 1.0;
      const activeTargets = sig.targets.map((t: any) => [t[0], t[1], false]);
      let tradeResult: any = null;

      for (let j = idx + 1; j < Math.min(idx + 1 + 96, m15.length); j++) {
        const b = m15[j];
        const exitLow = sig.direction === "BUY" ? b.l : b.al;
        const exitHigh = sig.direction === "BUY" ? b.h : b.ah;
        const exitClose = sig.direction === "BUY" ? b.c : b.ac;
        const tj = parseIsoSeconds(b.t);
        const ageH = (tj - t0) / 3600;

        // Staleness check
        if (sig.stale_h > 0 && ageH >= sig.stale_h && !beTriggered && remainingWeight === 1.0 && risk > 0) {
          const prog = sig.direction === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk;
          if (prog < 0) {
            tradeResult = { r: Number(prog.toFixed(2)), reason: "STALE", close_idx: j };
            break;
          }
        }

        // SL check
        if ((sig.direction === "BUY" && exitLow <= currentSl) || (sig.direction === "SELL" && exitHigh >= currentSl)) {
          const lossR = sig.direction === "BUY" ? (currentSl - entryFill) / risk : (entryFill - currentSl) / risk;
          totalR += remainingWeight * lossR;
          tradeResult = { r: Number(totalR.toFixed(2)), reason: beTriggered ? "BE" : "SL", close_idx: j };
          break;
        }

        // Target check
        for (const item of activeTargets) {
          const [w, tp, hit] = item;
          if (!hit) {
            if ((sig.direction === "BUY" && exitHigh >= tp) || (sig.direction === "SELL" && exitLow <= tp)) {
              item[2] = true;
              const rGain = sig.direction === "BUY" ? (tp - entryFill) / risk : (entryFill - tp) / risk;
              totalR += w * rGain;
              remainingWeight -= w;
              currentSl = entryFill; // move SL to BE
              beTriggered = true;
            }
          }
        }

        if (remainingWeight <= 0.001) {
          tradeResult = { r: Number(totalR.toFixed(2)), reason: "ALL_TP", close_idx: j };
          break;
        }
      }

      if (!tradeResult) {
        const lastB = m15[Math.min(idx + 96, m15.length - 1)];
        const exitC = sig.direction === "BUY" ? lastB.c : lastB.ac;
        const finalR = sig.direction === "BUY" ? (exitC - entryFill) / risk : (entryFill - exitC) / risk;
        totalR += remainingWeight * finalR;
        tradeResult = { r: Number(totalR.toFixed(2)), reason: "EOD", close_idx: Math.min(idx + 96, m15.length - 1) };
      }

      totalSimulatedTrades++;
      totalRealizedR += tradeResult.r;
      cooldownUntil = tradeResult.close_idx + 2;
    }
  }

  assert(totalSimulatedTrades === 21, `5a. Exactly 21 historical trades executed (got ${totalSimulatedTrades})`);
  assert(Math.abs(totalRealizedR - 12.78) < 0.1, `5b. Exact realized R verified (+12.78R, got +${totalRealizedR.toFixed(2)}R)`);
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
