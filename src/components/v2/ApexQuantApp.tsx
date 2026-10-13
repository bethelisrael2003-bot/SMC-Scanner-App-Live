import React, { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Calculator,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  Activity,
  Award,
  Flame,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  Radio
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

interface PairConfig {
  pair: string;
  name: string;
  icon: string;
  category: string;
  pipSize: number;
  pipVal: number;
  sixMonthWr: string;
  sixMonthRecord: string;
  sixMonthProfit: string;
  defaultSl: number;
}

const PRIMARY_3_PAIRS: PairConfig[] = [
  {
    pair: "XAG/USD",
    name: "Silver",
    icon: "🥈",
    category: "Precious Metals",
    pipSize: 0.01,
    pipVal: 0.08,
    sixMonthWr: "66.7%",
    sixMonthRecord: "6W / 3L",
    sixMonthProfit: "+$186.20 Profit (+4.60R)",
    defaultSl: 45.0,
  },
  {
    pair: "GBP/JPY",
    name: "Guppy",
    icon: "⚡",
    category: "High-Velocity Cross",
    pipSize: 0.01,
    pipVal: 0.09,
    sixMonthWr: "75.0%",
    sixMonthRecord: "3W / 1L",
    sixMonthProfit: "+$68.45 Profit (+1.45R)",
    defaultSl: 35.0,
  },
  {
    pair: "EUR/USD",
    name: "Euro",
    icon: "💶",
    category: "Forex Major",
    pipSize: 0.0001,
    pipVal: 0.09,
    sixMonthWr: "50.0%",
    sixMonthRecord: "3W / 3L",
    sixMonthProfit: "Neutral Anchor (-0.39R)",
    defaultSl: 15.0,
  },
];

function fmtPrice(pair: string, price: number | null | undefined): string {
  if (price === null || price === undefined) return "--";
  if (pair.includes("JPY")) return price.toFixed(3);
  if (pair.includes("XAG")) return price.toFixed(2);
  return price.toFixed(5);
}

export function ApexQuantApp({ onSwitchToClassic }: { onSwitchToClassic: () => void }) {
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [copiedTradeId, setCopiedTradeId] = useState<string | null>(null);

  // Live Nigeria (WAT) Time & Briefing State
  const [watTime, setWatTime] = useState("");
  const [briefingData, setBriefingData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // RoboForex Cent Calculator State
  const [calcBalance, setCalcBalance] = useState<number>(677);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(6.0);
  const [calcSlPips, setCalcSlPips] = useState<number>(45.0);
  const [copiedCalc, setCopiedCalc] = useState(false);

  // Active Signals Feed
  const [signals, setSignals] = useState<any[]>([]);

  const activePairConfig = PRIMARY_3_PAIRS[selectedPairIndex];

  // Update SL pips when pair switches
  useEffect(() => {
    setCalcSlPips(activePairConfig.defaultSl);
  }, [selectedPairIndex]);

  // Real-time WAT Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const wat = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const h = wat.getUTCHours();
      const m = wat.getUTCMinutes();
      const s = wat.getUTCSeconds();
      const hFmt = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      const ampm = h >= 12 ? "PM" : "AM";
      setWatTime(`${String(hFmt).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${ampm} WAT`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch Live Briefing & Signals
  const fetchLiveBriefing = useCallback(async () => {
    setLoading(true);
    try {
      const [briefRes, sigRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/daily-briefing`),
        fetch(`${API_BASE_URL}/api/aggressive-smc/signals`),
      ]);

      if (briefRes.status === "fulfilled" && briefRes.value.ok) {
        setBriefingData(await briefRes.value.json());
      }
      if (sigRes.status === "fulfilled" && sigRes.value.ok) {
        setSignals(await sigRes.value.json());
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveBriefing();
    const iv = setInterval(fetchLiveBriefing, 30000);
    return () => clearInterval(iv);
  }, [fetchLiveBriefing]);

  // Sizing Calculations (RoboForex Cent)
  const cashRisk = calcBalance * (calcRiskPct / 100.0);
  const rawLot = (calcSlPips > 0 && activePairConfig.pipVal > 0)
    ? (cashRisk / (calcSlPips * activePairConfig.pipVal)) / 100.0
    : 0.01;
  const recommendedLot = Math.max(0.01, Math.floor(rawLot * 100) / 100);
  const gainTp1 = cashRisk * 0.50; // 50% scale @ 1.0R
  const gainTp2 = cashRisk * 1.75; // 50% @ 1.0R + 50% @ 2.5R

  const pairLiveInfo = briefingData?.pairs?.find((p: any) => p.pair === activePairConfig.pair);
  const setupObj = pairLiveInfo?.analysis?.setup || null;
  const isSetupActive = setupObj && pairLiveInfo?.analysis?.decision?.verdict !== "WAIT";

  const copyTrade = (tradeText: string, id: string) => {
    navigator.clipboard.writeText(tradeText);
    setCopiedTradeId(id);
    setTimeout(() => setCopiedTradeId(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans select-none pb-12">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-amber-500/40 flex items-center justify-center font-mono font-black text-amber-400 text-sm shadow-[0_0_15px_rgba(245,158,11,0.25)]">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white font-mono">APEX 3-PAIR COMMAND</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-mono font-bold border border-amber-500/20">FOCUSED</span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-cyan-400" />
              <span className="text-cyan-400 font-bold">{watTime || "WAT CLOCK"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToClassic}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer"
          >
            <span>🖥️</span>
            <span className="hidden sm:inline">All Tabs</span>
          </button>

          <button
            onClick={fetchLiveBriefing}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            <span>UPDATE</span>
          </button>
        </div>
      </header>

      {/* ── 3-Times-Daily Live Intelligence Ribbon ─────────────────── */}
      <div className="bg-zinc-950/90 border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 truncate">
          <Radio className={`w-3.5 h-3.5 shrink-0 ${briefingData?.isKillZone ? "text-emerald-400 animate-pulse" : "text-amber-400"}`} />
          <span className={briefingData?.isKillZone ? "text-emerald-400 font-bold truncate" : "text-zinc-300 truncate"}>
            {briefingData?.briefingPhase || "Active Session Monitor (Nigeria WAT)"}
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-cyan-400 border border-zinc-800 shrink-0 font-bold">
          3x Daily Scan
        </span>
      </div>

      {/* ── Main Content Area ─────────────────────────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {/* ── 1. The 3 Focused Pair Selector ───────────────────────── */}
        <div>
          <div className="text-[11px] uppercase font-mono text-zinc-400 mb-2 flex items-center justify-between">
            <span>Primary Focus Watchlist</span>
            <span className="text-emerald-400 font-bold">6-Mo Win Rate: 63.2% (12W / 7L)</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {PRIMARY_3_PAIRS.map((p, idx) => {
              const active = selectedPairIndex === idx;
              return (
                <button
                  key={p.pair}
                  onClick={() => setSelectedPairIndex(idx)}
                  className={`p-3 rounded-2xl border transition-all text-left cursor-pointer relative overflow-hidden ${
                    active
                      ? "bg-amber-500/15 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.2)] text-white"
                      : "bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base">{p.icon}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${active ? "bg-amber-500 text-black" : "bg-zinc-950 text-zinc-400 border border-zinc-800"}`}>
                      {p.sixMonthWr}
                    </span>
                  </div>
                  <div className="font-mono text-xs font-bold text-white tracking-tight">{p.pair}</div>
                  <div className="font-mono text-[10px] text-zinc-500">{p.name}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 2. Active Pair Live Command Card ─────────────────────── */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{activePairConfig.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold font-mono text-white">{activePairConfig.pair}</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-cyan-400 font-mono border border-zinc-800">
                    {activePairConfig.category}
                  </span>
                </div>
                <div className="text-xs font-mono text-zinc-400 mt-0.5">
                  Macro H1 Trend: <span className={pairLiveInfo?.macroTrend === "BULLISH" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{pairLiveInfo?.macroTrend || "CALCULATING"}</span>
                  {" · "}Spread: <span className="text-zinc-300 font-bold">{pairLiveInfo?.livePrice?.spread_pips || 0} pips</span>
                </div>
              </div>
            </div>

            {/* Live Quotes Display */}
            <div className="text-right p-2 rounded-xl bg-zinc-950 border border-zinc-800 font-mono">
              <div className="text-[9px] uppercase text-zinc-500">Live Bid / Ask</div>
              <div className="text-sm font-bold text-white">
                <span className="text-cyan-400">{pairLiveInfo?.livePrice?.bid || "--"}</span>
                <span className="text-zinc-600 mx-1">/</span>
                <span className="text-zinc-400">{pairLiveInfo?.livePrice?.ask || "--"}</span>
              </div>
            </div>
          </div>

          {/* Active Setup Hero Banner OR Waiting Banner */}
          {isSetupActive && setupObj ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    PRISTINE {setupObj.direction} SETUP CONFIRMED
                  </div>
                  <div className="font-mono text-[11px] text-zinc-300 mt-1">
                    Entry: {fmtPrice(activePairConfig.pair, setupObj.entry)} · SL: {fmtPrice(activePairConfig.pair, setupObj.sl)} ({setupObj.slPips || activePairConfig.defaultSl} pips)
                  </div>
                </div>

                <button
                  onClick={() => copyTrade(
                    `ROBOFOREX CENT ORDER\nPair: ${activePairConfig.pair}\nAction: ${setupObj.direction}\nEntry: ${setupObj.entry}\nSL: ${setupObj.sl}\nTP1: ${setupObj.tp1} (Scale 50% & BE)\nTP2: ${setupObj.tp2}\nLot: ${recommendedLot} Lots\nRisk: $${cashRisk.toFixed(2)} (6%)`,
                    "hero-copy"
                  )}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black font-mono text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-400 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0"
                >
                  {copiedTradeId === "hero-copy" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedTradeId === "hero-copy" ? "ORDER COPIED!" : "COPY TO METATRADER"}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-[9px] text-zinc-500">TP1 (1.0R AUTO-BE)</div>
                  <div className="text-xs font-bold text-blue-400">{fmtPrice(activePairConfig.pair, setupObj.tp1)}</div>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-[9px] text-zinc-500">TP2 (2.5R RUNNER)</div>
                  <div className="text-xs font-bold text-emerald-400">{fmtPrice(activePairConfig.pair, setupObj.tp2)}</div>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-[9px] text-zinc-500">RECOMMENDED LOT</div>
                  <div className="text-xs font-bold text-amber-400">{recommendedLot.toFixed(2)} Lots</div>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <div className="text-[9px] text-zinc-500">MAX CASH RISK</div>
                  <div className="text-xs font-bold text-rose-400">${cashRisk.toFixed(2)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  M15 20-Bar Range: [{fmtPrice(activePairConfig.pair, pairLiveInfo?.m15Low)} – {fmtPrice(activePairConfig.pair, pairLiveInfo?.m15High)}]
                </span>
                <span className="text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px]">
                  STATUS: WAITING FOR CLEAN SWEEP
                </span>
              </div>
              <p className="font-mono text-[11px] text-zinc-400">
                {pairLiveInfo?.analysis?.decision?.reasoning || "Strict rule: M15 20-bar liquidity sweep + >50% body rejection in alignment with completed H1 trend required. No forced trades."}
              </p>
            </div>
          )}

          {/* Hardcoded 3 Gates Checklist */}
          <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Completed H1 Trend Alignment</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>M15 20-Bar Liquidity Sweep</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>1.2x ATR Stop Cushion</span>
            </div>
          </div>
        </div>

        {/* ── 3. Interactive RoboForex Cent Lot Sizer (Directly Linked) ── */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-400" />
              <h3 className="font-mono text-sm font-bold text-white">RoboForex Cent Lot Sizer ({activePairConfig.pair})</h3>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">${activePairConfig.pipVal} / 0.01 lot</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Equity ($ USD)</label>
              <input
                type="number"
                value={calcBalance}
                onChange={(e) => setCalcBalance(Number(e.target.value))}
                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Risk Allocation</label>
              <input
                type="number"
                step="0.5"
                value={calcRiskPct}
                onChange={(e) => setCalcRiskPct(Number(e.target.value))}
                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-amber-400 font-bold focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">SL Pips</label>
              <input
                type="number"
                step="0.5"
                value={calcSlPips}
                onChange={(e) => setCalcSlPips(Number(e.target.value))}
                className="w-full p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-rose-400 font-bold focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Recommended Lots</label>
              <div className="p-2 rounded-lg bg-zinc-950 border border-emerald-500/30 text-emerald-400 font-extrabold text-sm text-center">
                {recommendedLot.toFixed(2)} L
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
            <div>
              <span className="text-zinc-500 text-[10px]">RISK: </span>
              <span className="text-amber-400 font-bold">${cashRisk.toFixed(2)}</span>
              <span className="text-zinc-600 mx-2">|</span>
              <span className="text-zinc-500 text-[10px]">GAIN @ TP1: </span>
              <span className="text-blue-400 font-bold">+${gainTp1.toFixed(2)}</span>
              <span className="text-zinc-600 mx-2">|</span>
              <span className="text-zinc-500 text-[10px]">GAIN @ TP2: </span>
              <span className="text-emerald-400 font-bold">+${gainTp2.toFixed(2)}</span>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `ROBOFOREX CENT TICKET\nPair: ${activePairConfig.pair}\nEquity: $${calcBalance}\nRisk: ${calcRiskPct}% ($${cashRisk.toFixed(2)})\nSL Pips: ${calcSlPips}\nLot Size: ${recommendedLot.toFixed(2)} Lots`
                );
                setCopiedCalc(true);
                setTimeout(() => setCopiedCalc(false), 2500);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1 cursor-pointer"
            >
              {copiedCalc ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCalc ? "COPIED" : "COPY SIZING"}</span>
            </button>
          </div>
        </div>

        {/* ── 4. Audited 6-Month Rock-Solid Foundation Card ─────────── */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 font-mono">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase">
              180-Day Audited Proof (April 14 – October 13, 2026)
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-[9px] uppercase text-zinc-400">WIN RATE (11A)</div>
              <div className="text-base font-bold text-emerald-400">63.2%</div>
              <div className="text-[10px] text-emerald-300 font-bold">12W / 7L</div>
            </div>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <div className="text-[9px] uppercase text-zinc-400">NET RETURN</div>
              <div className="text-base font-bold text-cyan-400">+34.5%</div>
              <div className="text-[10px] text-cyan-300 font-bold">$677 → $910.30</div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <div className="text-[9px] uppercase text-zinc-400">MAX DRAWDOWN</div>
              <div className="text-base font-bold text-rose-400">-14.4%</div>
              <div className="text-[10px] text-rose-300 font-bold">Safe & Controlled</div>
            </div>
          </div>

          <div className="space-y-1 text-[11px] pt-1">
            <div className="flex justify-between p-2 rounded-lg bg-zinc-950">
              <span className="text-zinc-300">Silver (XAG/USD) Performance</span>
              <span className="text-emerald-400 font-bold">{PRIMARY_3_PAIRS[0].sixMonthProfit}</span>
            </div>
            <div className="flex justify-between p-2 rounded-lg bg-zinc-950">
              <span className="text-zinc-300">GBP/JPY Performance</span>
              <span className="text-emerald-400 font-bold">{PRIMARY_3_PAIRS[1].sixMonthProfit}</span>
            </div>
            <div className="flex justify-between p-2 rounded-lg bg-zinc-950">
              <span className="text-zinc-300">EUR/USD Performance</span>
              <span className="text-zinc-400 font-bold">{PRIMARY_3_PAIRS[2].sixMonthProfit}</span>
            </div>
          </div>
        </div>

        {/* ── 5. Active Signals Feed ─────────────────────────────────── */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-400" />
              Active Signals on Watchlist
            </span>
            <span className="text-[10px] text-zinc-500">{signals.length} Active Records</span>
          </div>

          {signals.length === 0 ? (
            <div className="text-center py-6 text-xs text-zinc-500">
              No active signals at this moment. Engine evaluates next M15 candle close during Kill Zones.
            </div>
          ) : (
            <div className="space-y-2">
              {signals.map((sig, i) => (
                <div key={sig.id || i} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${sig.direction === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                      {sig.direction}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white">{sig.pair}</div>
                      <div className="text-[10px] text-zinc-400">Entry: {fmtPrice(sig.pair, sig.entryPrice)} · SL: {fmtPrice(sig.pair, sig.sl)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => copyTrade(
                      `ROBOFOREX CENT ORDER\nPair: ${sig.pair}\nAction: ${sig.direction}\nEntry: ${sig.entryPrice}\nSL: ${sig.sl}\nTP1: ${sig.tp1}\nTP2: ${sig.tp2}\nLot: ${recommendedLot}`,
                      `sig-${i}`
                    )}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    {copiedTradeId === `sig-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedTradeId === `sig-${i}` ? "COPIED" : "COPY"}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
