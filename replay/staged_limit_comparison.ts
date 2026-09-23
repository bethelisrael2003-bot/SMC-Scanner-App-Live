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

function checkEntryCandle(candles: Candle[], direction: "BUY" | "SELL") {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(curr.close - curr.open);
  const rng = curr.high - curr.low;
  if (rng === 0) return false;
  const bodyRatio = body / rng;
  if (direction === "BUY") {
    if (curr.close <= curr.open) {
      return prev.close < prev.open && curr.close > prev.open && curr.open < prev.close;
    }
    if (bodyRatio >= 0.60) return true;
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;
    return (lowerWick / rng) > 0.50;
  } else {
    if (curr.close >= curr.open) {
      return prev.close > prev.open && curr.close < prev.open && curr.open > prev.close;
    }
    if (bodyRatio >= 0.60) return true;
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    return (upperWick / rng) > 0.50;
  }
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

interface TradeRec {
  pair: string; direction: "BUY" | "SELL"; time: string;
  entry: number; sl: number; tp1: number; risk: number;
  planEntry: number; fillDriftAtr: number; slAtr: number;
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

function loadBars(epic: string, tf: string): Bar[] {
  const p = path.join(DATA, `${epic}_${tf}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/* ── MODELS TO COMPARE ─────────────────────────────────────────────────── */

interface ModelResult {
  id: string;
  name: string;
  trades: TradeRec[];
  pendings: number;
  fills: number;
  expired: number;
  cancelledSL: number;
}

function runComparison() {
  const allPairData = PAIRS.map(([pair, epic]) => ({
    pair,
    epic,
    mult: pipMult(pair),
    m15: loadBars(epic, "M15"),
    h1: loadBars(epic, "H1"),
    h4: loadBars(epic, "H4"),
    d1: loadBars(epic, "D1"),
  }));

  const models: Record<string, ModelResult> = {
    at_market:       { id: "at_market", name: "1. At-Market (Current Prod)", trades: [], pendings: 0, fills: 0, expired: 0, cancelledSL: 0 },
    limit_touch_4h:  { id: "limit_touch_4h", name: "2. Limit Touch-Fill (4h Expiry)", trades: [], pendings: 0, fills: 0, expired: 0, cancelledSL: 0 },
    limit_touch_2h:  { id: "limit_touch_2h", name: "3. Limit Touch-Fill (2h Expiry)", trades: [], pendings: 0, fills: 0, expired: 0, cancelledSL: 0 },
    limit_touch_6h:  { id: "limit_touch_6h", name: "4. Limit Touch-Fill (6h Expiry)", trades: [], pendings: 0, fills: 0, expired: 0, cancelledSL: 0 },
    limit_confirm_4h:{ id: "limit_confirm_4h", name: "5. Limit Confirm-Fill (Touch+M15 Close, 4h)", trades: [], pendings: 0, fills: 0, expired: 0, cancelledSL: 0 },
  };

  const WARMUP = 400;

  for (const { pair, m15, h1, h4, d1, mult } of allPairData) {
    let h1p = 0, h4p = 0, d1p = 0;

    const cooldowns: Record<string, number> = {
      at_market: 0, limit_touch_4h: 0, limit_touch_2h: 0, limit_touch_6h: 0, limit_confirm_4h: 0,
    };

    const pendings: Record<string, { idx: number; dir: "BUY" | "SELL"; limit: number; sl: number; tp1: number; touched?: boolean } | null> = {
      limit_touch_4h: null, limit_touch_2h: null, limit_touch_6h: null, limit_confirm_4h: null,
    };

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

      // 1. Process active pendings for the limit models
      const checkPendingTouch = (modelKey: string, maxBars: number) => {
        const pend = pendings[modelKey];
        if (!pend) return;
        const pbar = m15[i];
        const age = i - pend.idx;
        if (age > maxBars) {
          pendings[modelKey] = null;
          models[modelKey].expired++;
        } else if (pend.dir === "BUY" ? pbar.l <= pend.sl : pbar.h >= pend.sl) {
          pendings[modelKey] = null;
          models[modelKey].cancelledSL++;
        } else if (pend.dir === "BUY" ? pbar.al <= pend.limit : pbar.ah >= pend.limit) {
          // Filled at the limit price
          pendings[modelKey] = null;
          models[modelKey].fills++;
          const sim = simulateTrade(m15, i, pend.dir, pend.limit, pend.sl, pend.tp1);
          const risk = Math.abs(pend.limit - pend.sl);
          models[modelKey].trades.push({
            pair, direction: pend.dir, time: m15[i].t, entry: pend.limit, sl: pend.sl, tp1: pend.tp1, risk,
            planEntry: pend.limit, fillDriftAtr: 0, slAtr: 0,
            closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
            reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
          });
          cooldowns[modelKey] = sim.closeIdx + 2;
        }
      };

      checkPendingTouch("limit_touch_4h", 16); // 4h = 16 bars
      checkPendingTouch("limit_touch_2h", 8);  // 2h = 8 bars
      checkPendingTouch("limit_touch_6h", 24); // 6h = 24 bars

      // Process pending confirm-fill (Model 5)
      {
        const pend = pendings.limit_confirm_4h;
        if (pend) {
          const pbar = m15[i];
          const age = i - pend.idx;
          if (age > 16) {
            pendings.limit_confirm_4h = null;
            models.limit_confirm_4h.expired++;
          } else if (pend.dir === "BUY" ? pbar.l <= pend.sl : pbar.h >= pend.sl) {
            pendings.limit_confirm_4h = null;
            models.limit_confirm_4h.cancelledSL++;
          } else {
            const touchedNow = pend.dir === "BUY" ? pbar.al <= pend.limit : pbar.ah >= pend.limit;
            if (touchedNow) pend.touched = true;
            const confirmed = pend.touched && (pend.dir === "BUY" ? pbar.c > pend.limit : pbar.ac < pend.limit);
            if (confirmed) {
              const fill = pend.dir === "BUY" ? pbar.ac : pbar.c;
              const inBand = pend.dir === "BUY" ? (fill > pend.sl && fill < pend.tp1) : (fill < pend.sl && fill > pend.tp1);
              pendings.limit_confirm_4h = null;
              if (inBand) {
                models.limit_confirm_4h.fills++;
                const sim = simulateTrade(m15, i, pend.dir, fill, pend.sl, pend.tp1);
                const risk = Math.abs(fill - pend.sl);
                models.limit_confirm_4h.trades.push({
                  pair, direction: pend.dir, time: m15[i].t, entry: fill, sl: pend.sl, tp1: pend.tp1, risk,
                  planEntry: pend.limit, fillDriftAtr: 0, slAtr: 0,
                  closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
                  reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
                });
                cooldowns.limit_confirm_4h = sim.closeIdx + 2;
              }
            }
          }
        }
      }

      // Build synthesized candles for setup evaluation
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
        if (fvgs && fvgs.length > 0) {
          const best = fvgs[fvgs.length - 1];
          poi = { type: best.type, direction, high: best.top, low: best.bottom, index: best.index, valid: true };
        }
      }
      const poiExists = !!(poi && poi.valid);
      const poiFresh = poiExists ? checkPoiFreshness(h4C, poi) !== "DEAD" : false;

      const confluenceOk = trendOk && dailyOk && pdOk && tzOk && poiExists && poiFresh;
      if (!confluenceOk) continue;

      const m15Ok = checkEntryCandle(m15C, direction);
      if (!m15Ok) continue;

      const mpr = findMomentumPauseSetup(h1C, direction, hAtr, {});
      if (!mpr) continue;

      const mprPlanRr = Math.abs(mpr.tp1 - mpr.entry) / Math.abs(mpr.entry - mpr.sl);
      if (Number(mprPlanRr.toFixed(2)) < 1.5) continue;

      // Model 1: At-Market Fill (Current Prod)
      if (cooldowns.at_market <= i) {
        const fill = direction === "BUY" ? bar.ac : bar.c;
        const inBand = direction === "BUY" ? (fill > mpr.sl && fill < mpr.tp1) : (fill < mpr.sl && fill > mpr.tp1);
        if (inBand) {
          const sim = simulateTrade(m15, i, direction, fill, mpr.sl, mpr.tp1);
          const risk = Math.abs(fill - mpr.sl);
          models.at_market.trades.push({
            pair, direction, time: bar.t, entry: fill, sl: mpr.sl, tp1: mpr.tp1, risk,
            planEntry: mpr.entry, fillDriftAtr: Number(((direction === "BUY" ? (mpr.entry - fill) : (fill - mpr.entry)) / hAtr).toFixed(3)),
            slAtr: Number((risk / hAtr).toFixed(2)),
            closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
            reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
          });
          cooldowns.at_market = sim.closeIdx + 2;
        }
      }

      // Model 2: Limit Touch (4h)
      if (!pendings.limit_touch_4h && cooldowns.limit_touch_4h <= i) {
        pendings.limit_touch_4h = { idx: i, dir: direction, limit: mpr.entry, sl: mpr.sl, tp1: mpr.tp1 };
        models.limit_touch_4h.pendings++;
      }

      // Model 3: Limit Touch (2h)
      if (!pendings.limit_touch_2h && cooldowns.limit_touch_2h <= i) {
        pendings.limit_touch_2h = { idx: i, dir: direction, limit: mpr.entry, sl: mpr.sl, tp1: mpr.tp1 };
        models.limit_touch_2h.pendings++;
      }

      // Model 4: Limit Touch (6h)
      if (!pendings.limit_touch_6h && cooldowns.limit_touch_6h <= i) {
        pendings.limit_touch_6h = { idx: i, dir: direction, limit: mpr.entry, sl: mpr.sl, tp1: mpr.tp1 };
        models.limit_touch_6h.pendings++;
      }

      // Model 5: Limit Confirm (4h)
      if (!pendings.limit_confirm_4h && cooldowns.limit_confirm_4h <= i) {
        pendings.limit_confirm_4h = { idx: i, dir: direction, limit: mpr.entry, sl: mpr.sl, tp1: mpr.tp1, touched: false };
        models.limit_confirm_4h.pendings++;
      }
    }
  }

  // Generate Report
  console.log("\n═══════════════════════════════════════════════════════════════════════════════════════════════");
  console.log("            EXECUTION MODEL COMPARISON: AT-MARKET vs STAGED-LIMIT (92 DAYS, 11 PAIRS)           ");
  console.log("═══════════════════════════════════════════════════════════════════════════════════════════════\n");

  const rows: any[] = [];
  for (const mKey of Object.keys(models)) {
    const m = models[mKey];
    const ts = m.trades;
    const wins = ts.filter(t => t.r > 0).length;
    const losses = ts.filter(t => t.r <= 0).length;
    const wr = ts.length > 0 ? (wins / ts.length) * 100 : 0;
    const rSum = ts.reduce((sum, t) => sum + t.r, 0);
    const avgR = ts.length > 0 ? rSum / ts.length : 0;
    const tradesPerWeek = (ts.length / (92 / 7));

    let eq = 0, peak = 0, maxDD = 0;
    for (const t of [...ts].sort((a, b) => a.time.localeCompare(b.time))) {
      eq += t.r; peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq - peak);
    }

    const beCount = ts.filter(t => t.reason === "BE").length;
    const staleCount = ts.filter(t => t.reason === "STALE").length;

    rows.push({
      Model: m.name,
      Pendings: m.pendings || "—",
      "Filled / Trades": `${ts.length} ${m.pendings ? `(${((ts.length / m.pendings) * 100).toFixed(0)}%)` : ""}`,
      "Trades / Wk": Number(tradesPerWeek.toFixed(1)),
      "Win Rate": `${wr.toFixed(1)}%`,
      "R Total": `${rSum >= 0 ? "+" : ""}${rSum.toFixed(2)}R`,
      "Avg R": `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R`,
      "Max DD": `${maxDD.toFixed(1)}R`,
      "Winner R Values": ts.filter(t => t.r > 0).map(t => t.r).sort((a,b)=>a-b).slice(0, 5).join(", ") + (wins > 5 ? "..." : ""),
      "Exits (TP/SL/BE/ST)": `${ts.filter(t => t.reason === "TP1").length}/${ts.filter(t => t.reason === "SL").length}/${beCount}/${staleCount}`,
    });
  }

  console.table(rows);
  fs.writeFileSync(path.join(process.cwd(), "replay", "staged_limit_comparison.json"), JSON.stringify(rows, null, 2));
}

runComparison();
