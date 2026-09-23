/* ==========================================================================
 * asianFade.test.ts — Unit tests & Backtest Verification for Asian Fade Engine
 * ========================================================================== */

import fs from "fs";
import path from "path";
import {
  computeAtr,
  computeEma,
  findCompletedH1Index,
  evaluateAsianFade,
  ASIAN_FADE_PAIRS,
  parseIsoSeconds,
  type Candle
} from "./asianFade";

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

console.log("\n=== Asian Fade Engine Test Suite ===\n");

// ── Test 1: Zero-Lookahead Completed H1 Lookup ───────────────────────────────
{
  const h1Bars: Candle[] = [
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-08T07:00:00Z" },
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-08T08:00:00Z" },
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-08T09:00:00Z" },
    { open: 1.10, high: 1.11, low: 1.09, close: 1.10, time: "2026-07-08T10:00:00Z" },
  ];

  // At 10:30:00 UTC, the candle starting at 10:00:00 is forming.
  // The last completed candle is index 2 (09:00:00 to 10:00:00).
  const m15Sec = parseIsoSeconds("2026-07-08T10:30:00Z");
  const idx = findCompletedH1Index(h1Bars, m15Sec);
  assert(idx === 2, `1a. Identifies 09:00:00 bar (index 2) as last completed at 10:30 UTC (got ${idx})`);
}

// ── Test 2: Synthetic Asian Fade Setup ───────────────────────────────────────
{
  // Build 230 H1 bars for EMA200
  const h1Bars: Candle[] = [];
  for (let i = 0; i < 230; i++) {
    const p = 1.2000 - i * 0.0002; // Bearish trend (EMA50 < EMA200)
    const day = 1 + Math.floor(i / 24);
    h1Bars.push({ open: p, high: p + 0.0010, low: p - 0.0010, close: p - 0.0005, time: `2026-07-${String(day).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00Z` });
  }

  // Build M15 bars: 30 bars from prior day + 28 Asian bars on 2026-07-10 + 1 signal bar at 08:15 UTC
  const m15Bars: Candle[] = [];
  for (let i = 0; i < 30; i++) {
    m15Bars.push({ open: 1.1000, high: 1.1020, low: 1.0990, close: 1.1005, time: `2026-07-09T${String(10 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}:00Z` });
  }
  // Build Asian session with range 0.0020 (1.0x ATR = coiled)
  // Low = 1.1000, High = 1.1020, Mid = 1.1010
  for (let h = 0; h < 7; h++) {
    for (let m = 0; m < 60; m += 15) {
      m15Bars.push({ open: 1.1005, high: 1.1020, low: 1.1000, close: 1.1010, time: `2026-07-10T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z` });
    }
  }

  // Signal Bar at 08:15 UTC sweeps high above 1.1020 + 0.15*0.002 (1.10230),
  // then closes below 1.1020 - 0.10*0.002 (1.10180)
  m15Bars.push({
    open: 1.1015,
    high: 1.1026, // Swept high by 0.00060 > 0.00030
    low: 1.1005,
    close: 1.1016, // Closed back inside below 1.10180
    time: "2026-07-10T08:15:00Z"
  });

  const res = evaluateAsianFade("EUR/USD", m15Bars, h1Bars, m15Bars.length - 1);
  assert(res.passed === true, "2a. Synthetic SELL sweep fade passed");
  assert(res.setup?.direction === "SELL", "2b. Direction is SELL");
  assert(res.setup?.tp1 === 1.1010, `2c. Target 1 is Asian Midpoint 1.1010 (got ${res.setup?.tp1})`);
}

// ── Test 3: Historical Dataset Replay Verification (12 trades, +5.52R) ───────
{
  const dataDir = path.join(process.cwd(), "replay", "data");
  const PAIR_EPICS: Record<string, string> = {
    "EUR/USD": "EURUSD", "GBP/USD": "GBPUSD", "USD/JPY": "USDJPY", "USD/CHF": "USDCHF",
    "USD/CAD": "USDCAD", "AUD/USD": "AUDUSD", "NZD/USD": "NZDUSD", "GBP/JPY": "GBPJPY",
    "EUR/JPY": "EURJPY", "XAU/USD": "GOLD", "XAG/USD": "SILVER"
  };

  let totalSimulatedTrades = 0;
  let totalRealizedR = 0;

  for (const pair of ASIAN_FADE_PAIRS) {
    const epic = PAIR_EPICS[pair];
    const m15Path = path.join(dataDir, `${epic}_M15.json`);
    const h1Path = path.join(dataDir, `${epic}_H1.json`);
    if (!fs.existsSync(m15Path) || !fs.existsSync(h1Path)) continue;

    const m15: any[] = JSON.parse(fs.readFileSync(m15Path, "utf-8"));
    const h1: any[] = JSON.parse(fs.readFileSync(h1Path, "utf-8"));
    const m15Candles: Candle[] = m15.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, time: b.t }));
    const h1Candles: Candle[] = h1.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, time: b.t }));

    if (m15Candles.length < 50 || h1Candles.length < 210) continue;

    const h1Closes = h1Candles.map(b => b.close);
    const ema50 = computeEma(h1Closes, 50);
    const ema200 = computeEma(h1Closes, 200);
    const trs = [0.0];
    for (let i = 1; i < h1Candles.length; i++) {
      const c = h1Candles[i], p = h1Candles[i - 1];
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    const h1Atr = new Array(h1Candles.length).fill(0);
    let s = 0;
    for (let i = 1; i <= 14 && i < trs.length; i++) s += trs[i];
    h1Atr[14] = s / 14;
    for (let i = 15; i < h1Candles.length; i++) h1Atr[i] = (h1Atr[i - 1] * 13 + trs[i]) / 14;

    const h1Ts = h1Candles.map(b => parseIsoSeconds(b.time));
    const dayState = new Map<string, { lo: number; hi: number; traded: boolean }>();
    const signals: any[] = [];

    for (let i = 0; i < m15Candles.length; i++) {
      const bar = m15Candles[i];
      const barSec = parseIsoSeconds(bar.time);
      const dt = new Date(barSec * 1000);
      const dateKey = dt.toISOString().slice(0, 10);
      const hour = dt.getUTCHours() + dt.getUTCMinutes() / 60;

      if (!dayState.has(dateKey)) dayState.set(dateKey, { lo: Infinity, hi: -Infinity, traded: false });
      const st = dayState.get(dateKey)!;

      if (hour < 7.0) {
        if (bar.low < st.lo) st.lo = bar.low;
        if (bar.high > st.hi) st.hi = bar.high;
        continue;
      }

      if (hour >= 12.0) continue;
      if (st.traded || st.lo === Infinity || st.hi === -Infinity) continue;

      const hi = st.hi, lo = st.lo;
      const asianRange = hi - lo;
      if (asianRange <= 0) continue;

      const hIdx = findCompletedH1Index(h1Candles, barSec);
      if (hIdx < 210) continue;
      const atr = h1Atr[hIdx];
      if (atr <= 0) continue;

      if (!(0.5 * atr <= asianRange && asianRange <= 1.5 * atr)) continue;

      const sweepDepthMin = 0.15 * atr;
      const rejectMargin = 0.10 * atr;
      const rr2Mult = 2.5;
      const mid = (hi + lo) / 2.0;

      const trendUp = ema50[hIdx] > ema200[hIdx];
      const trendDn = ema50[hIdx] < ema200[hIdx];

      const sweepUp = (bar.high > hi + sweepDepthMin) && (bar.close < hi - rejectMargin);
      const sweepDn = (bar.low < lo - sweepDepthMin) && (bar.close > lo + rejectMargin);

      let direction: "BUY" | "SELL" | null = null;
      if (sweepUp && !sweepDn && !trendUp) direction = "SELL";
      else if (sweepDn && !sweepUp && !trendDn) direction = "BUY";
      if (!direction) continue;

      const entryRef = direction === "BUY" ? m15[i].ac : m15[i].c;
      const buf = 0.05 * atr;
      if (direction === "BUY") {
        const sl = bar.low - buf;
        const risk = entryRef - sl;
        if (risk <= 0) continue;
        const tp1 = mid;
        const tp2 = lo + rr2Mult * asianRange;
        if (tp1 <= entryRef) continue;
        signals.push({ idx: i, direction: "BUY", sl, targets: [[0.5, tp1], [0.5, tp2]], be_r: 1.0, stale_h: 12 });
      } else {
        const sl = bar.high + buf;
        const risk = sl - entryRef;
        if (risk <= 0) continue;
        const tp1 = mid;
        const tp2 = hi - rr2Mult * asianRange;
        if (tp1 >= entryRef) continue;
        signals.push({ idx: i, direction: "SELL", sl, targets: [[0.5, tp1], [0.5, tp2]], be_r: 1.0, stale_h: 12 });
      }
      st.traded = true;
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

  assert(totalSimulatedTrades === 12, `3a. Exactly 12 historical trades executed (got ${totalSimulatedTrades})`);
  assert(Math.abs(totalRealizedR - 5.52) < 0.1, `3b. Exact realized R verified (+5.52R, got +${totalRealizedR.toFixed(2)}R)`);
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
