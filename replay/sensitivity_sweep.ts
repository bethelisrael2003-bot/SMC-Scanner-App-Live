import * as fs from "fs";
import * as path from "path";
import { findMomentumPauseSetup } from "../momentumPauseRetest";

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

/** Parameterizable M15 confirmation check */
function checkM15Confirm(
  candles: Candle[],
  direction: "BUY" | "SELL",
  minBodyRatio = 0.60,
  minWickRatio = 0.50,
  mode: "strict" | "moderate" | "loose" | "any_close" = "strict"
): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(curr.close - curr.open);
  const rng = curr.high - curr.low;
  if (rng === 0) return false;
  const bodyRatio = body / rng;

  if (mode === "any_close") {
    // Just close in the trade direction
    return direction === "BUY" ? curr.close > curr.open : curr.close < curr.open;
  }

  if (direction === "BUY") {
    if (curr.close <= curr.open) {
      // Bullish engulfing
      return prev.close < prev.open && curr.close > prev.open && curr.open < prev.close;
    }
    if (bodyRatio >= minBodyRatio) return true;
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;
    return (lowerWick / rng) > minWickRatio;
  } else {
    if (curr.close >= curr.open) {
      // Bearish engulfing
      return prev.close > prev.open && curr.close < prev.open && curr.open > prev.close;
    }
    if (bodyRatio >= minBodyRatio) return true;
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    return (upperWick / rng) > minWickRatio;
  }
}

interface TradeRec {
  pair: string; direction: "BUY" | "SELL"; time: string;
  entry: number; sl: number; tp1: number; risk: number;
  closeTime: string; exit: number; r: number; reason: string; holdH: number;
}

function simulateTrade(
  m15: Bar[], entryIdx: number, dir: "BUY" | "SELL",
  entryFill: number, sl0: number, tp1: number,
): { r: number; reason: string; closeIdx: number; closeTime: string; exit: number; holdH: number } {
  const risk = Math.abs(entryFill - sl0);
  let sl = sl0;
  let be = false;
  const t0 = parseT(m15[entryIdx].t);
  for (let j = entryIdx + 1; j < m15.length; j++) {
    const b = m15[j];
    const exitLow = dir === "BUY" ? b.l : b.al;
    const exitHigh = dir === "BUY" ? b.h : b.ah;
    const exitClose = dir === "BUY" ? b.c : b.ac;
    const ageH = (parseT(b.t) - t0) / 3600000;
    if (ageH >= 12 && !be && risk > 0) {
      const prog = dir === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk;
      if (prog < 0) {
        return { r: prog, reason: "STALE", closeIdx: j, closeTime: b.t, exit: exitClose, holdH: ageH };
      }
    }
    if (dir === "BUY" ? exitLow <= sl : exitHigh >= sl) {
      const r = dir === "BUY" ? (sl - entryFill) / risk : (entryFill - sl) / risk;
      return { r, reason: be ? "BE" : "SL", closeIdx: j, closeTime: b.t, exit: sl, holdH: ageH };
    }
    if (dir === "BUY" ? exitHigh >= tp1 : exitLow <= tp1) {
      const r = dir === "BUY" ? (tp1 - entryFill) / risk : (entryFill - tp1) / risk;
      return { r, reason: "TP1", closeIdx: j, closeTime: b.t, exit: tp1, holdH: ageH };
    }
    if (!be && risk > 0 && (dir === "BUY" ? exitHigh >= entryFill + risk : exitLow <= entryFill - risk)) {
      be = true;
      sl = entryFill;
    }
  }
  const lb = m15[m15.length - 1];
  const exitClose = dir === "BUY" ? lb.c : lb.ac;
  const r = risk > 0 ? (dir === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk) : 0;
  return { r, reason: "EOD", closeIdx: m15.length - 1, closeTime: lb.t, exit: exitClose, holdH: (parseT(lb.t) - t0) / 3600000 };
}

/* ── CONFIG DEFINITION FOR SENSITIVITY SWEEP ───────────────────────────── */

interface SweepConfig {
  id: string;
  category: "baseline" | "rr" | "m15" | "consolidation" | "combined";
  label: string;
  minRr: number;
  m15Mode: "strict" | "moderate" | "loose" | "any_close";
  m15Body: number;
  m15Wick: number;
  mprOpts: {
    consolMaxAtr?: number;
    consolRangeRatio?: number;
  };
}

const SWEEP_CONFIGS: SweepConfig[] = [
  // 1. Baseline
  { id: "baseline", category: "baseline", label: "Baseline (Current Prod)", minRr: 1.5, m15Mode: "strict", m15Body: 0.60, m15Wick: 0.50, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.50 } },

  // 2. Relaxed RR minimum
  { id: "rr_1_3", category: "rr", label: "RR >= 1.3 (from 1.5)", minRr: 1.3, m15Mode: "strict", m15Body: 0.60, m15Wick: 0.50, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.50 } },
  { id: "rr_1_2", category: "rr", label: "RR >= 1.2 (from 1.5)", minRr: 1.2, m15Mode: "strict", m15Body: 0.60, m15Wick: 0.50, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.50 } },
  { id: "rr_1_0", category: "rr", label: "RR >= 1.0 (from 1.5)", minRr: 1.0, m15Mode: "strict", m15Body: 0.60, m15Wick: 0.50, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.50 } },

  // 3. Relaxed M15 confirmation
  { id: "m15_mod", category: "m15", label: "M15 Body >= 50% / Wick > 40%", minRr: 1.5, m15Mode: "moderate", m15Body: 0.50, m15Wick: 0.40, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.50 } },
  { id: "m15_loose", category: "m15", label: "M15 Body >= 40% / Wick > 30%", minRr: 1.5, m15Mode: "loose", m15Body: 0.40, m15Wick: 0.30, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.50 } },
  { id: "m15_any", category: "m15", label: "M15 Any in-direction close", minRr: 1.5, m15Mode: "any_close", m15Body: 0, m15Wick: 0, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.50 } },

  // 4. Relaxed Consolidation Width
  { id: "consol_0_75", category: "consolidation", label: "Consolidation <= 0.75x ATR", minRr: 1.5, m15Mode: "strict", m15Body: 0.60, m15Wick: 0.50, mprOpts: { consolMaxAtr: 0.75, consolRangeRatio: 0.50 } },
  { id: "consol_1_00", category: "consolidation", label: "Consolidation <= 1.00x ATR", minRr: 1.5, m15Mode: "strict", m15Body: 0.60, m15Wick: 0.50, mprOpts: { consolMaxAtr: 1.00, consolRangeRatio: 0.50 } },
  { id: "consol_ratio_0_65", category: "consolidation", label: "Consol Range Ratio <= 0.65", minRr: 1.5, m15Mode: "strict", m15Body: 0.60, m15Wick: 0.50, mprOpts: { consolMaxAtr: 0.50, consolRangeRatio: 0.65 } },

  // 5. Combination test
  { id: "combo_balanced", category: "combined", label: "Balanced: RR>=1.3 + M15>=50% + Consol<=0.75", minRr: 1.3, m15Mode: "moderate", m15Body: 0.50, m15Wick: 0.40, mprOpts: { consolMaxAtr: 0.75, consolRangeRatio: 0.50 } },
];

function loadBars(epic: string, tf: string): Bar[] {
  const p = path.join(DATA, `${epic}_${tf}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function runSweep() {
  const allPairData = PAIRS.map(([pair, epic]) => ({
    pair,
    epic,
    mult: pipMult(pair),
    m15: loadBars(epic, "M15"),
    h1: loadBars(epic, "H1"),
    h4: loadBars(epic, "H4"),
    d1: loadBars(epic, "D1"),
  }));

  const results: Record<string, { config: SweepConfig; trades: TradeRec[]; fires: number }> = {};
  for (const cfg of SWEEP_CONFIGS) {
    results[cfg.id] = { config: cfg, trades: [], fires: 0 };
  }

  const WARMUP = 400;

  for (const { pair, m15, h1, h4, d1, mult } of allPairData) {
    let h1p = 0, h4p = 0, d1p = 0;
    const cooldowns = new Map<string, number>();
    for (const cfg of SWEEP_CONFIGS) cooldowns.set(cfg.id, 0);

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
      const m15C: Candle[] = m15.slice(Math.max(0, i - 119), i + 1).map(toCandle);

      const hAtr = atrS(h1C, 14);
      if (!(hAtr > 0)) continue;

      // Higher-timeframe confluence checks (shared across all sweeps)
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
      if (!poi || !poi.valid) {
        const p2 = findOrderBlock(m15C, h1Trend, atrS(m15C, 14) || hAtr);
        if (p2 && p2.valid) poi = p2;
      }
      if (!poi || !poi.valid) {
        const fvgs = findFVG(h4C, h1Trend);
        if (fvgs.length > 0) {
          const best = fvgs[fvgs.length - 1];
          poi = { type: best.type, direction, high: best.top, low: best.bottom, index: best.index, valid: true };
        }
      }
      const poiExists = !!(poi && poi.valid);
      const poiFresh = poiExists ? checkPoiFreshness(h4C, poi) !== "DEAD" : false;

      const confluenceOk = trendOk && dailyOk && pdOk && tzOk && poiExists && poiFresh;
      if (!confluenceOk) continue;

      // Now evaluate each sensitivity config independently!
      for (const cfg of SWEEP_CONFIGS) {
        // Check M15 confirmation under this config's parameters
        const m15Ok = checkM15Confirm(m15C, direction, cfg.m15Body, cfg.m15Wick, cfg.m15Mode);
        if (!m15Ok) continue;

        // Check MPR pattern under this config's consolidation options
        const mpr = findMomentumPauseSetup(h1C, direction, hAtr, cfg.mprOpts);
        if (!mpr) continue;

        const mprPlanRr = Math.abs(mpr.tp1 - mpr.entry) / Math.abs(mpr.entry - mpr.sl);
        if (Number(mprPlanRr.toFixed(2)) < cfg.minRr) continue;

        results[cfg.id].fires++;

        // Cooldown check for this specific config
        if ((cooldowns.get(cfg.id) ?? 0) > i) continue;

        // Entry guard: fill must be between SL and TP1
        const fill = direction === "BUY" ? bar.ac : bar.c;
        const inBand = direction === "BUY"
          ? (fill > mpr.sl && fill < mpr.tp1)
          : (fill < mpr.sl && fill > mpr.tp1);
        if (!inBand) continue;

        // Simulate trade
        const sim = simulateTrade(m15, i, direction, fill, mpr.sl, mpr.tp1);
        const risk = Math.abs(fill - mpr.sl);
        results[cfg.id].trades.push({
          pair, direction, time: bar.t, entry: fill, sl: mpr.sl, tp1: mpr.tp1, risk,
          closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
          reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
        });
        cooldowns.set(cfg.id, sim.closeIdx + 2);
      }
    }
  }

  // Generate Report
  console.log("\n═══════════════════════════════════════════════════════════════════════════════════════════════");
  console.log("                  SENSITIVITY ANALYSIS: GATE LOOSENING (92 DAYS, 11 PAIRS)                      ");
  console.log("═══════════════════════════════════════════════════════════════════════════════════════════════\n");

  const rows: any[] = [];
  for (const cfg of SWEEP_CONFIGS) {
    const res = results[cfg.id];
    const trades = res.trades;
    const wins = trades.filter(t => t.r > 0).length;
    const losses = trades.filter(t => t.r <= 0).length;
    const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    const rSum = trades.reduce((sum, t) => sum + t.r, 0);
    const avgR = trades.length > 0 ? rSum / trades.length : 0;
    const tradesPerWeek = (trades.length / (92 / 7));

    let eq = 0, peak = 0, maxDD = 0;
    for (const t of [...trades].sort((a, b) => a.time.localeCompare(b.time))) {
      eq += t.r; peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq - peak);
    }

    const beCount = trades.filter(t => t.reason === "BE").length;
    const staleCount = trades.filter(t => t.reason === "STALE").length;

    rows.push({
      Category: cfg.category.toUpperCase(),
      Setting: cfg.label,
      Fires: res.fires,
      Trades: trades.length,
      "Per Week": Number(tradesPerWeek.toFixed(1)),
      "Win Rate": `${wr.toFixed(1)}%`,
      "R Total": `${rSum >= 0 ? "+" : ""}${rSum.toFixed(2)}R`,
      "Avg R": `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`,
      "Max DD": `${maxDD.toFixed(1)}R`,
      "Exits (TP/SL/BE/ST)": `${trades.filter(t => t.reason === "TP1").length}/${trades.filter(t => t.reason === "SL").length}/${beCount}/${staleCount}`,
    });
  }

  console.table(rows);

  // Write detailed results to JSON
  fs.writeFileSync(path.join(process.cwd(), "replay", "sensitivity_results.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(process.cwd(), "replay", "sensitivity_trades.json"), JSON.stringify(
    Object.fromEntries(SWEEP_CONFIGS.map(c => [c.id, results[c.id].trades])), null, 1
  ));
  console.log("\nSaved detailed sweep results to replay/sensitivity_results.json\n");
}

runSweep();
