/*
 * replay.ts — MPR vs Classic detector replay over ~90 days of corrected
 * historical data. Analysis only; nothing here deploys.
 *
 * Books simulated independently per pair:
 *   mpr           — live-equivalent path: all gates + MPR trigger (at-market fill)
 *   classic_pure  — classic detector alone (sweep→CHOCH/BOS→POI→confirm),
 *                   gated only by: session, spread, RR, entry guard
 *   classic_conf  — classic detector + the full trend/PD/POI confluence gates
 *   combined      — both detectors live together, one position slot per pair,
 *                   MPR priority (what the live system would do)
 *
 * Key parity notes (documented assumptions):
 *   - Evaluation every M15 close (live scans every 60s — coarser).
 *   - In-progress H1/H4 bars are SYNTHESIZED from M15 bars (no lookahead);
 *     matches live where the last H1 bar is the in-progress candle.
 *   - Spread from the eval bar's ask-bid close; verifySpread thresholds as live.
 *   - Entry: BUY at ask close, SELL at bid close (spread-aware, as live).
 *   - Exits: SL checked before TP within a bar (conservative); fills at level.
 *   - BE at +1R (SL→entry), staleness close at 12h with <0R progress.
 *   - 30-min cooldown after close (2 M15 bars); one open trade per pair per book.
 *   - NOT simulated: news (advisory-only live), grade/bonus filter (live requires
 *     grade ≥ B), EOD-volatility close, dataGuard (replay data is correct by
 *     construction).
 */
import * as fs from "fs";
import * as path from "path";
import { findMomentumPauseSetup } from "../momentumPauseRetest";
import { findClassicSetup } from "../classicSetup";
import {
  classifyTrend, findOrderBlock, findFVG, checkPoiFreshness, checkEntryCandle,
} from "../classicSetup";

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

/* ── server.ts gate copies ─────────────────────────────────────────────── */

function atrS(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
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

/* ── trade simulation ──────────────────────────────────────────────────── */

interface TradeRec {
  book: string; pair: string; direction: "BUY" | "SELL"; setup: string;
  time: string; entry: number; sl: number; tp1: number; risk: number;
  planEntry?: number; fillDriftAtr?: number; slAtr: number;
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
    const exitLow = dir === "BUY" ? b.l : b.al;   // BUY exits at bid, SELL at ask
    const exitHigh = dir === "BUY" ? b.h : b.ah;
    const exitClose = dir === "BUY" ? b.c : b.ac;
    const ageH = (parseT(b.t) - t0) / 3600000;
    // Staleness (12h, <0R progress, before BE) — mirrors live
    if (ageH >= 12 && !be && risk > 0) {
      const prog = dir === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk;
      if (prog < 0) {
        const r = dir === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk;
        return { r, reason: "STALE", closeIdx: j, closeTime: b.t, exit: exitClose, holdH: ageH };
      }
    }
    // SL first (conservative same-bar rule)
    if (dir === "BUY" ? exitLow <= sl : exitHigh >= sl) {
      const r = dir === "BUY" ? (sl - entryFill) / risk : (entryFill - sl) / risk;
      return { r, reason: be ? "BE" : "SL", closeIdx: j, closeTime: b.t, exit: sl, holdH: ageH };
    }
    // TP
    if (dir === "BUY" ? exitHigh >= tp1 : exitLow <= tp1) {
      const r = dir === "BUY" ? (tp1 - entryFill) / risk : (entryFill - tp1) / risk;
      return { r, reason: "TP1", closeIdx: j, closeTime: b.t, exit: tp1, holdH: ageH };
    }
    // BE trigger at +1R
    if (!be && risk > 0 && (dir === "BUY" ? exitHigh >= entryFill + risk : exitLow <= entryFill - risk)) {
      be = true;
      sl = entryFill;
    }
  }
  const lb = m15[m15.length - 1];
  const exitClose = dir === "BUY" ? lb.c : lb.ac;
  const r = risk > 0 ? (dir === "BUY" ? (exitClose - entryFill) / risk : (entryFill - exitClose) / risk) : 0;
  return { r, reason: "EOD_DATA", closeIdx: m15.length - 1, closeTime: lb.t, exit: exitClose, holdH: (parseT(lb.t) - t0) / 3600000 };
}

/* ── books ─────────────────────────────────────────────────────────────── */

const CONF_VARIANTS = ["conf_m15_sweep", "conf_h1_sweep", "conf_h1_poi", "conf_m15_poi"] as const;
const BOOKS = ["mpr", "mpr_limit", "classic_pure", ...CONF_VARIANTS, "combined"] as const;
type BookName = typeof BOOKS[number];
interface BookState {
  trades: TradeRec[];
  cooldownUntil: Map<string, number>; // pair -> m15 idx from which entries allowed
  counters: Record<string, number>;
}
const newBook = (): BookState => ({ trades: [], cooldownUntil: new Map(), counters: {} });
const bump = (b: BookState, k: string) => { b.counters[k] = (b.counters[k] || 0) + 1; };

function tryOpen(book: BookState, name: BookName, pair: string, m15: Bar[], i: number,
                setup: "MPR" | "Classic", dir: "BUY" | "SELL", planEntry: number, sl: number, tp1: number,
                planRr: number, hAtr: number): boolean {
  const bar = m15[i];
  const fill = dir === "BUY" ? bar.ac : bar.c; // BUY at ask, SELL at bid
  // RR gate (plan-level, as live)
  if (Number(planRr.toFixed(2)) < 1.5) { bump(book, "rrBlock"); return false; } // mirrors live toFixed(2) check
  // Entry guard: fill strictly between SL and TP1
  const inBand = dir === "BUY" ? (fill > sl && fill < tp1) : (fill < sl && fill > tp1);
  if (!inBand) { bump(book, "entryGuardBlock"); return false; }
  const sim = simulateTrade(m15, i, dir, fill, sl, tp1);
  const risk = Math.abs(fill - sl);
  const drift = hAtr > 0 ? (dir === "BUY" ? (planEntry - fill) / hAtr : (fill - planEntry) / hAtr) : 0;
  book.trades.push({
    book: name, pair, direction: dir, setup, time: bar.t, entry: fill, sl, tp1, risk,
    planEntry, fillDriftAtr: Number(drift.toFixed(3)), slAtr: Number((risk / hAtr).toFixed(2)),
    closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
    reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
  });
  book.cooldownUntil.set(pair, sim.closeIdx + 2); // block until close + 30min
  return true;
}

/* ── main ──────────────────────────────────────────────────────────────── */

function loadBars(epic: string, tf: string): Bar[] {
  const p = path.join(DATA, `${epic}_${tf}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const books: Record<BookName, BookState> = Object.fromEntries(
    (["mpr", "mpr_limit", "classic_pure", ...CONF_VARIANTS, "combined"] as string[]).map(b => [b, newBook()])
  ) as Record<BookName, BookState>;
  // Staged-limit book state: one pending order per pair (MPR plan entry =
  // pause midpoint, 4h expiry = 16 M15 bars, cancelled if price crosses SL
  // before filling; BUY fills when ask touches the limit, SELL when bid does).
  const mprPending = new Map<string, { idx: number; dir: "BUY" | "SELL"; limit: number; sl: number; tp1: number }>();
  const confFires: Record<string, number> = { conf_m15_sweep: 0, conf_h1_sweep: 0, conf_h1_poi: 0, conf_m15_poi: 0 };
  let overlapFires = 0, mprFires = 0, classicPureFires = 0, overlapConfFires = 0;

  for (const [pair, epic] of PAIRS) {
    const m15 = loadBars(epic, "M15");
    const h1 = loadBars(epic, "H1");
    const h4 = loadBars(epic, "H4");
    const d1 = loadBars(epic, "D1");
    const mult = pipMult(pair);

    let h1p = 0, h4p = 0, d1p = 0; // pointers: bars with t <= evalTime
    const WARMUP = 400;

    for (let i = WARMUP; i < m15.length; i++) {
      const bar = m15[i];
      const E = parseT(bar.t);
      while (h1p < h1.length && parseT(h1[h1p].t) <= E) h1p++;
      while (h4p < h4.length && parseT(h4[h4p].t) <= E) h4p++;
      while (d1p < d1.length && parseT(d1[d1p].t) <= E) d1p++;
      if (h1p < 60 || h4p < 60 || d1p < 20) continue;

      if (!sessionCanTrade(E)) { for (const bn of BOOKS) bump(books[bn], "sessionSkip"); continue; }

      // Spread gate (eval bar's ask-bid close)
      const spreadPips = (bar.ac - bar.c) * mult;
      const spreadOk = verifySpread(pair, spreadPips) !== "FAIL";
      if (!spreadOk) { for (const bn of BOOKS) bump(books[bn], "spreadBlock"); continue; }

      // Windows (closed bars) + synthetic in-progress H1/H4 from M15 (no lookahead)
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
      if (!(hAtr > 0)) { for (const bn of BOOKS) bump(books[bn], "noAtr"); continue; }

      /* Shared confluence gates + direction (live MPR flow) */
      const h1TrendInfo = classifyTrend(h1C, 2);
      const h1Trend = h1TrendInfo.trend;
      const dTrend = d1C.length >= 20 ? classifyTrend(d1C, 2).trend : "RANGE";
      const pd = getPremiumDiscount(h1C, hAtr);
      const direction: "BUY" | "SELL" = (pd.zone === "DISCOUNT" || pd.pos <= 0.5) ? "BUY" : "SELL";
      const trendOk = h1Trend !== "RANGE" && h1Trend !== "UNCLEAR";
      const dailyOk = !(dTrend !== "RANGE" && dTrend !== "UNCLEAR" && dTrend !== h1Trend);
      const pdOk = pd.zone !== "COMPRESSED" && pd.zone !== "EQ";
      const tzOk = !((h1Trend === "BULLISH" && pd.zone === "PREMIUM") || (h1Trend === "BEARISH" && pd.zone === "DISCOUNT"));

      // POI gates (live flow: H4 OB -> M15 OB -> H4 FVG -> derived fallback)
      const h4AtrLocal = atrS(h4C, 14) || hAtr;
      let poi: any = findOrderBlock(h4C, h1Trend, h4AtrLocal);
      let poiSource = "H4_OB";
      if (!poi || !poi.valid) { const p2 = findOrderBlock(m15C, h1Trend, atrS(m15C, 14) || hAtr); if (p2 && p2.valid) { poi = p2; poiSource = "M15_OB"; } }
      if (!poi || !poi.valid) {
        const fvgs = findFVG(h4C, h1Trend);
        if (fvgs.length > 0) {
          const best = fvgs[fvgs.length - 1];
          poi = { type: best.type, direction, high: best.top, low: best.bottom, index: best.index, valid: true };
          poiSource = "H4_FVG";
        }
      }
      const poiExists = !!(poi && poi.valid);
      const poiFresh = poiExists ? checkPoiFreshness(h4C, poi) !== "DEAD" : false;
      const entryCandleOk = checkEntryCandle(m15C, direction).valid;

      const confluenceOk = trendOk && dailyOk && pdOk && tzOk && poiExists && poiFresh;

      /* MPR trigger (exact production module) */
      const mpr = confluenceOk && entryCandleOk
        ? findMomentumPauseSetup(h1C, direction, hAtr, {})
        : null;
      if (confluenceOk && !entryCandleOk) bump(books.mpr, "m15_noConfirm");
      const mprPlanRr = mpr ? Math.abs(mpr.tp1 - mpr.entry) / Math.abs(mpr.entry - mpr.sl) : 0;

      /* Classic triggers — conf variants: 2x2 matrix of
         { struct prior: M15-own | H1 } x { SL anchor: sweep | POI } */
      const classicConf: any = confluenceOk
        ? findClassicSetup(h4C, m15C, hAtr, direction, {})
        : null;
      const classicConfH1: any = confluenceOk
        ? findClassicSetup(h4C, m15C, hAtr, direction, { structPriorTrend: h1Trend })
        : null;
      const classicConfH1Poi: any = confluenceOk
        ? findClassicSetup(h4C, m15C, hAtr, direction, { structPriorTrend: h1Trend, slAnchor: "poi" })
        : null;
      const classicConfM15Poi: any = confluenceOk
        ? findClassicSetup(h4C, m15C, hAtr, direction, { slAnchor: "poi" })
        : null;
      let classicPure: any = null;
      let pureDir: "BUY" | "SELL" | null = null;
      const cpB = findClassicSetup(h4C, m15C, hAtr, "BUY");
      const cpS = findClassicSetup(h4C, m15C, hAtr, "SELL");
      if (cpB && cpS) { classicPure = parseT(cpB.sweepTime) >= parseT(cpS.sweepTime) ? cpB : cpS; pureDir = parseT(cpB.sweepTime) >= parseT(cpS.sweepTime) ? "BUY" : "SELL"; }
      else if (cpB) { classicPure = cpB; pureDir = "BUY"; }
      else if (cpS) { classicPure = cpS; pureDir = "SELL"; }

      if (mpr) mprFires++;
      if (classicPure) classicPureFires++;
      if (classicConf) confFires.conf_m15_sweep++;
      if (classicConfH1) confFires.conf_h1_sweep++;
      if (classicConfH1Poi) confFires.conf_h1_poi++;
      if (classicConfM15Poi) confFires.conf_m15_poi++;
      if (mpr && classicPure) overlapFires++;
      if (mpr && (classicConf || classicConfH1 || classicConfH1Poi || classicConfM15Poi)) overlapConfFires++;

      /* Books: entries (one slot per pair, cooldown after close) */
      const mprBook = books.mpr, cpBook = books.classic_pure, comBook = books.combined;

      if (mpr && (mprBook.cooldownUntil.get(pair) ?? 0) <= i) {
        tryOpen(mprBook, "mpr", pair, m15, i, "MPR", direction, mpr.entry, mpr.sl, mpr.tp1, mprPlanRr, hAtr);
      }

      /* Staged-limit MPR book: pending at the pause midpoint */
      {
        const lb = books.mpr_limit;
        const pend = mprPending.get(pair);
        if (pend) {
          const pbar = m15[i];
          const age = i - pend.idx;
          if (age > 16) {
            mprPending.delete(pair); bump(lb, "expired");
          } else if (pend.dir === "BUY" ? pbar.l <= pend.sl : pbar.h >= pend.sl) {
            mprPending.delete(pair); bump(lb, "cancelledSL");
          } else if (pend.dir === "BUY" ? pbar.al <= pend.limit : pbar.ah >= pend.limit) {
            // Filled at the limit price (paper semantics: touch = fill at limit)
            mprPending.delete(pair);
            const sim = simulateTrade(m15, i, pend.dir, pend.limit, pend.sl, pend.tp1);
            const risk = Math.abs(pend.limit - pend.sl);
            lb.trades.push({
              book: "mpr_limit", pair, direction: pend.dir, setup: "MPR",
              time: m15[i].t, entry: pend.limit, sl: pend.sl, tp1: pend.tp1, risk,
              planEntry: pend.limit, fillDriftAtr: 0, slAtr: Number((risk / hAtr).toFixed(2)),
              closeTime: sim.closeTime, exit: sim.exit, r: Number(sim.r.toFixed(2)),
              reason: sim.reason, holdH: Number(sim.holdH.toFixed(1)),
            });
            lb.cooldownUntil.set(pair, sim.closeIdx + 2);
            bump(lb, "filled");
          }
        }
        if (mpr && !mprPending.has(pair) && (lb.cooldownUntil.get(pair) ?? 0) <= i && mprPlanRr >= 1.5) {
          mprPending.set(pair, { idx: i, dir: direction, limit: mpr.entry, sl: mpr.sl, tp1: mpr.tp1 });
          bump(lb, "pendings");
        }
      }
      if (classicPure && pureDir && (cpBook.cooldownUntil.get(pair) ?? 0) <= i) {
        tryOpen(cpBook, "classic_pure", pair, m15, i, "Classic", pureDir, classicPure.entry, classicPure.sl, classicPure.tp1, 1.5, hAtr);
      }
      const confEntries: [string, any][] = [
        ["conf_m15_sweep", classicConf], ["conf_h1_sweep", classicConfH1],
        ["conf_h1_poi", classicConfH1Poi], ["conf_m15_poi", classicConfM15Poi],
      ];
      for (const [vn, vs] of confEntries) {
        if (vs && (books[vn as BookName].cooldownUntil.get(pair) ?? 0) <= i) {
          tryOpen(books[vn as BookName], vn as BookName, pair, m15, i, "Classic", direction, vs.entry, vs.sl, vs.tp1, 1.5, hAtr);
        }
      }
      if ((comBook.cooldownUntil.get(pair) ?? 0) <= i) {
        if (mpr) tryOpen(comBook, "combined", pair, m15, i, "MPR", direction, mpr.entry, mpr.sl, mpr.tp1, mprPlanRr, hAtr);
        else if (classicPure && pureDir) tryOpen(comBook, "combined", pair, m15, i, "Classic", pureDir, classicPure.entry, classicPure.sl, classicPure.tp1, 1.5, hAtr);
      }
    }
  }

  /* ── report ── */
  const fmt = (n: number) => Number(n.toFixed(2));
  console.log("\n════════ MPR vs CLASSIC — 90-DAY REPLAY ════════\n");
  console.log(`Trigger fires (pre-entry-guard): MPR=${mprFires}, classic_pure=${classicPureFires}, overlap_pure=${overlapFires}, overlap_anyconf=${overlapConfFires}`);
  console.log(`conf variant fires: ${JSON.stringify(confFires)}\n`);

  const summary: any = { fires: { mprFires, classicPureFires, overlapFires, overlapConfFires, confFires }, books: {} };
  for (const bn of BOOKS) {
    const b = books[bn];
    const trades = b.trades;
    const wins = trades.filter(t => t.r > 0);
    const losses = trades.filter(t => t.r <= 0);
    const rSum = trades.reduce((s, t) => s + t.r, 0);
    const rs = [...trades].map(t => t.r).sort((a, b2) => a - b2);
    const median = rs.length ? rs[Math.floor(rs.length / 2)] : 0;
    let equity = 0, peak = 0, maxDD = 0;
    for (const t of [...trades].sort((a, b2) => a.time.localeCompare(b2.time))) {
      equity += t.r; peak = Math.max(peak, equity); maxDD = Math.min(maxDD, equity - peak);
    }
    const avgHold = trades.length ? trades.reduce((s, t) => s + t.holdH, 0) / trades.length : 0;
    const avgDrift = trades.filter(t => t.setup === "MPR").length
      ? trades.filter(t => t.setup === "MPR").reduce((s, t) => s + (t.fillDriftAtr || 0), 0) / trades.filter(t => t.setup === "MPR").length
      : null;

    console.log(`── ${bn} ──`);
    console.log(`   trades: ${trades.length} | W/L: ${wins.length}/${losses.length} | WR: ${trades.length ? fmt(wins.length / trades.length * 100) : 0}%`);
    console.log(`   R sum: ${fmt(rSum)} | avg: ${trades.length ? fmt(rSum / trades.length) : 0}R | median: ${fmt(median)}R | best: ${rs.length ? fmt(rs[rs.length - 1]) : 0}R | worst: ${rs.length ? fmt(rs[0]) : 0}R`);
    console.log(`   max drawdown: ${fmt(maxDD)}R | avg hold: ${fmt(avgHold)}h${avgDrift !== null ? ` | MPR fill drift avg: ${fmt(avgDrift)} ATR` : ""}`);
    const byReason: Record<string, number> = {};
    trades.forEach(t => byReason[t.reason] = (byReason[t.reason] || 0) + 1);
    console.log(`   exits: ${JSON.stringify(byReason)}`);
    const byPair: Record<string, number> = {};
    trades.forEach(t => byPair[t.pair] = (byPair[t.pair] || 0) + 1);
    console.log(`   by pair: ${JSON.stringify(byPair)}`);
    const slAtrs = trades.map(t => t.slAtr).sort((a, b2) => a - b2);
    if (slAtrs.length) console.log(`   SL (xATR): min ${fmt(slAtrs[0])} / median ${fmt(slAtrs[Math.floor(slAtrs.length / 2)])} / max ${fmt(slAtrs[slAtrs.length - 1])}`);
    console.log(`   counters: ${JSON.stringify(b.counters)}\n`);

    summary.books[bn] = {
      trades: trades.length, wins: wins.length, losses: losses.length,
      winRate: trades.length ? Number((wins.length / trades.length * 100).toFixed(1)) : 0,
      rSum: Number(rSum.toFixed(2)), avgR: trades.length ? Number((rSum / trades.length).toFixed(2)) : 0,
      medianR: Number(median.toFixed(2)), maxDD: Number(maxDD.toFixed(2)),
      avgHoldH: Number(avgHold.toFixed(1)), exits: byReason, byPair, counters: b.counters,
      mprAvgDriftAtr: avgDrift === null ? null : Number(avgDrift.toFixed(3)),
    };
  }
  fs.writeFileSync(path.join(process.cwd(), "replay", "report.json"), JSON.stringify({ summary, trades: Object.fromEntries(BOOKS.map(bn => [bn, books[bn].trades])) }, null, 1));
  console.log("Full trade lists saved to replay/report.json");
}

main();
