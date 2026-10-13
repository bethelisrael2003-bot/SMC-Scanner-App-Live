import React, { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Radar,
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
  Sliders,
  Layers,
  PieChart,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

export type HubId = "engines" | "sizer" | "radar" | "ledger";

export type StrategyKey =
  | "aggressive"
  | "trendsweep"
  | "asianfade"
  | "asian"
  | "institutional"
  | "classic"
  | "precision"
  | "mpr";

interface StrategyMeta {
  key: StrategyKey;
  name: string;
  icon: string;
  winRate: string;
  record: string;
  netReturn: string;
  rTotal: string;
  maxDd: string;
  desc: string;
  badgeColor: string;
}

const STRATEGIES: StrategyMeta[] = [
  {
    key: "aggressive",
    name: "Aggressive Cent",
    icon: "⚡",
    winRate: "75.0%",
    record: "18W / 6L",
    netReturn: "+103.2%",
    rTotal: "+12.67R",
    maxDd: "-11.6%",
    desc: "WAT Kill Zones · H1 EMA10/20 Trend · 1.2x ATR Stop Buffer · RoboForex 6% Cent Sizer",
    badgeColor: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  },
  {
    key: "trendsweep",
    name: "Trend Sweep",
    icon: "🌊",
    winRate: "71.4%",
    record: "15W / 6L",
    netReturn: "+89.4%",
    rTotal: "+12.78R",
    maxDd: "-1.0R",
    desc: "Turtle Soup Liquidity Sweep · 50% @ 1.0R auto-BE · 50% @ 2.50R Runner",
    badgeColor: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  },
  {
    key: "asianfade",
    name: "Asian Fade",
    icon: "🎯",
    winRate: "75.0%",
    record: "9W / 3L",
    netReturn: "+41.2%",
    rTotal: "+5.52R",
    maxDd: "-1.0R",
    desc: "Early London Stop-Hunt Fade · Coiled Asian 0.5-1.5x ATR · 50% @ Asian Mid",
    badgeColor: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  },
  {
    key: "asian",
    name: "Asian Breakout",
    icon: "🚀",
    winRate: "42.9%",
    record: "12W / 16L",
    netReturn: "+68.0%",
    rTotal: "+13.11R",
    maxDd: "-3.5R",
    desc: "London Open Momentum Expansion · 35% @ 1.5R · 65% @ 4.0R Runner",
    badgeColor: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  },
  {
    key: "institutional",
    name: "SMC Institutional",
    icon: "💎",
    winRate: "28.5%",
    record: "72W / 181L",
    netReturn: "-1.70R",
    rTotal: "-1.70R",
    maxDd: "-6.3R",
    desc: "Dual Order Blocks (H4/H1) + Opposing Liquidity Pool DOL Targets",
    badgeColor: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  },
  {
    key: "classic",
    name: "Classic SMC",
    icon: "🏛",
    winRate: "30.0%",
    record: "64W / 149L",
    netReturn: "+1.50R",
    rTotal: "+1.50R",
    maxDd: "-5.8R",
    desc: "H4 Liquidity Sweep → M15 CHOCH → H4 Order Block Confirmed",
    badgeColor: "text-gray-400 bg-gray-400/10 border-gray-400/20",
  },
  {
    key: "precision",
    name: "Precision Intraday",
    icon: "📐",
    winRate: "50.0%",
    record: "2W / 2L",
    netReturn: "+0.54R",
    rTotal: "+0.54R",
    maxDd: "-1.0R",
    desc: "13-Step Institutional Course Sequence · 0.3x ATR Stop Floor",
    badgeColor: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
  },
  {
    key: "mpr",
    name: "Core SMC / MPR",
    icon: "⚡",
    winRate: "37.5%",
    record: "0W / 2L Clean",
    netReturn: "-2.27R",
    rTotal: "-2.27R",
    maxDd: "-2.3R",
    desc: "Momentum-Pause-Retest Intraday Engine · 0.3x ATR SL Floor Guard",
    badgeColor: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  },
];

const PAIRS = ["XAG/USD", "GBP/JPY", "EUR/USD", "XAU/USD", "EUR/JPY", "USD/CHF"];

export function ApexQuantApp({ onSwitchToClassic }: { onSwitchToClassic: () => void }) {
  const [activeHub, setActiveHub] = useState<HubId>("engines");
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyKey>("aggressive");
  const [selectedPair, setSelectedPair] = useState<string>("XAG/USD");
  const [copiedTradeId, setCopiedTradeId] = useState<string | null>(null);

  // Live Time in Nigeria (WAT)
  const [watTime, setWatTime] = useState("");
  const [sessionInfo, setSessionInfo] = useState({ name: "Checking...", isKillZone: false });

  // Calculator State
  const [calcBalance, setCalcBalance] = useState<number>(677);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(6.0);
  const [calcPair, setCalcPair] = useState<string>("XAG/USD");
  const [calcSlPips, setCalcSlPips] = useState<number>(45.0);
  const [copiedCalc, setCopiedCalc] = useState(false);

  // Live Data State
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);

  // Real-time WAT Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const wat = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const h = wat.getUTCHours();
      const m = wat.getUTCMinutes();
      const s = wat.getUTCSeconds();
      const mins = h * 60 + m;

      const hFmt = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      const ampm = h >= 12 ? "PM" : "AM";
      setWatTime(`${String(hFmt).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${ampm} WAT`);

      const london = mins >= 9 * 60 && mins <= 12 * 60;
      const ny = mins >= 15 * 60 + 30 && mins <= 19 * 60;
      const usPre = mins >= 13 * 60 + 30 && mins < 15 * 60 + 30;
      const deadAsian = mins >= 0 && mins < 8 * 60;
      const deadLunch = mins > 12 * 60 && mins < 13 * 60 + 30;

      if (london) setSessionInfo({ name: "London Open Kill Zone (09:00 - 12:00 WAT)", isKillZone: true });
      else if (ny) setSessionInfo({ name: "New York Open Kill Zone (03:30 - 07:00 PM WAT)", isKillZone: true });
      else if (usPre) setSessionInfo({ name: "US Pre-Market & Data (01:30 - 03:30 PM WAT)", isKillZone: true });
      else if (deadAsian) setSessionInfo({ name: "Asian Dead Zone (Midnight - 08:00 AM WAT) — WAIT", isKillZone: false });
      else if (deadLunch) setSessionInfo({ name: "Lunch Hour Dead Zone (12:00 - 01:30 PM WAT) — WAIT", isKillZone: false });
      else setSessionInfo({ name: "Outside Kill Zones — WAIT", isKillZone: false });
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const endpointPrefix = selectedStrategy === "aggressive" ? "aggressive-smc" : selectedStrategy;
      const [sigRes, statRes, pairRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/${endpointPrefix}/signals`),
        fetch(`${API_BASE_URL}/api/${endpointPrefix}/stats`),
        fetch(`${API_BASE_URL}/api/${endpointPrefix}/${encodeURIComponent(selectedPair)}`)
      ]);

      if (sigRes.status === "fulfilled" && sigRes.value.ok) setSignals(await sigRes.value.json());
      if (statRes.status === "fulfilled" && statRes.value.ok) setStats(await statRes.value.json());
      if (pairRes.status === "fulfilled" && pairRes.value.ok) setAnalysis(await pairRes.value.json());
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, selectedPair]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // Lot size calculations
  const cashRisk = calcBalance * (calcRiskPct / 100.0);
  const pipVal = (calcPair.includes("XAG") || calcPair.includes("XAU")) ? 0.08 : 0.09;
  const rawLot = (calcSlPips > 0 && pipVal > 0) ? (cashRisk / (calcSlPips * pipVal)) / 100.0 : 0.01;
  const recommendedLot = Math.max(0.01, Math.floor(rawLot * 100) / 100);
  const gainTp1 = cashRisk * 0.50;
  const gainTp2 = cashRisk * 1.75;

  const currentMeta = STRATEGIES.find(s => s.key === selectedStrategy) || STRATEGIES[0];

  // Copy helper
  const copyTrade = (tradeText: string, id: string) => {
    navigator.clipboard.writeText(tradeText);
    setCopiedTradeId(id);
    setTimeout(() => setCopiedTradeId(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans pb-20 select-none">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#09090b]/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-amber-500/30 flex items-center justify-center font-mono font-black text-amber-400 text-sm shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white font-mono">APEX QUANT</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-mono font-bold border border-amber-500/20">v2.0</span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-cyan-400" />
              <span className="text-cyan-400 font-bold">{watTime || "WAT CLOCK"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch to Classic UI Button */}
          <button
            onClick={onSwitchToClassic}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[11px] font-mono flex items-center gap-1 transition-all cursor-pointer"
            title="Switch to original terminal view"
          >
            <span>🖥️</span>
            <span className="hidden sm:inline">Classic</span>
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            <span>SCAN</span>
          </button>
        </div>
      </header>

      {/* ── Active Session Alert Ribbon ─────────────────────────── */}
      <div className="bg-zinc-950/90 border-b border-zinc-800/60 px-4 py-2 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 truncate">
          <span className={`w-2 h-2 rounded-full shrink-0 ${sessionInfo.isKillZone ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
          <span className={sessionInfo.isKillZone ? "text-emerald-400 font-bold truncate" : "text-zinc-400 truncate"}>
            {sessionInfo.name}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-500 shrink-0">
          <span>London: 09-12 WAT</span>
          <span>·</span>
          <span>NY: 15:30-19 WAT</span>
        </div>
      </div>

      {/* ── Main Content Area (Dynamic by Hub) ──────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {/* ======================================================== */}
        {/* HUB 1: STRATEGY ENGINES                                  */}
        {/* ======================================================== */}
        {activeHub === "engines" && (
          <div className="space-y-4">
            {/* Strategy Carousel / Grid Header */}
            <div>
              <div className="text-[11px] uppercase font-mono text-zinc-400 mb-2 flex items-center justify-between">
                <span>Select Strategy Engine</span>
                <span className="text-zinc-500">{STRATEGIES.length} Isolated Models</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
                {STRATEGIES.map(st => {
                  const active = selectedStrategy === st.key;
                  return (
                    <button
                      key={st.key}
                      onClick={() => setSelectedStrategy(st.key)}
                      style={{ flexShrink: 0, minWidth: "max-content", maxWidth: "none" }}
                      className={`shrink-0 px-3.5 py-2.5 rounded-xl text-xs font-mono flex items-center gap-2 whitespace-nowrap transition-all border cursor-pointer ${
                        active
                          ? "bg-amber-500/20 text-white border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.25)] font-bold"
                          : "bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <span className="text-sm">{st.icon}</span>
                      <span>{st.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${st.badgeColor}`}>
                        {st.winRate}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Performance Ribbon (4 Metrics) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-xl p-3 text-center bg-emerald-500/5">
                <div className="text-[10px] font-mono uppercase text-emerald-400 font-bold">WIN RATE (11A)</div>
                <div className="text-xl font-mono font-black text-emerald-400 mt-0.5">{currentMeta.winRate}</div>
                <div className="text-[10px] font-mono text-emerald-300 font-bold">{currentMeta.record}</div>
              </div>

              <div className="bg-zinc-900/80 border border-amber-500/30 rounded-xl p-3 text-center bg-amber-500/5">
                <div className="text-[10px] font-mono uppercase text-amber-400 font-bold">NET RETURN</div>
                <div className="text-xl font-mono font-black text-amber-400 mt-0.5">{currentMeta.netReturn}</div>
                <div className="text-[10px] font-mono text-amber-300">$677 Cent Growth</div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-center">
                <div className="text-[10px] font-mono uppercase text-zinc-400">TOTAL R</div>
                <div className="text-xl font-mono font-black text-blue-400 mt-0.5">{currentMeta.rTotal}</div>
                <div className="text-[10px] font-mono text-zinc-500">Realized Expectancy</div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-center">
                <div className="text-[10px] font-mono uppercase text-zinc-400">MAX DRAWDOWN</div>
                <div className="text-xl font-mono font-black text-rose-400 mt-0.5">{currentMeta.maxDd}</div>
                <div className="text-[10px] font-mono text-zinc-500">Peak-to-Trough</div>
              </div>
            </div>

            {/* Pair Switcher for Selected Strategy */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
              <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1 shrink-0">Pairs:</span>
              {PAIRS.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPair(p)}
                  style={{ flexShrink: 0, minWidth: "max-content", maxWidth: "none" }}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap cursor-pointer ${
                    selectedPair === p
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                      : "bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Live Setup & Diagnostic Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{currentMeta.icon}</span>
                  <span className="font-mono text-sm font-bold text-white">{selectedPair} Live Setup</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-cyan-400 border border-zinc-800">
                  {currentMeta.name}
                </span>
              </div>

              {analysis?.setup ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        ACTIVE {analysis.setup.direction} CONFIRMED
                      </div>
                      <div className="font-mono text-[11px] text-zinc-300 mt-1">
                        Entry: {analysis.setup.entry} · SL: {analysis.setup.sl} ({analysis.setup.slPips || 45} pips)
                      </div>
                    </div>
                    <button
                      onClick={() => copyTrade(
                        `ROBOFOREX CENT ORDER\nPair: ${selectedPair}\nAction: ${analysis.setup.direction}\nEntry: ${analysis.setup.entry}\nSL: ${analysis.setup.sl}\nTP1: ${analysis.setup.tp1} (Scale 50% & BE)\nTP2: ${analysis.setup.tp2}\nLot: ${recommendedLot} Lots\nRisk: $${cashRisk.toFixed(2)} (6%)`,
                        "hero-copy"
                      )}
                      className="px-3 py-2 rounded-lg bg-emerald-500 text-black font-mono text-xs font-bold flex items-center gap-1 hover:bg-emerald-400 transition-all cursor-pointer"
                    >
                      {copiedTradeId === "hero-copy" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedTradeId === "hero-copy" ? "COPIED!" : "COPY MT4"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-center">
                    <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">TP1 (1.0R AUTO-BE)</div>
                      <div className="text-xs font-bold text-blue-400">{analysis.setup.tp1}</div>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">TP2 (2.5R RUNNER)</div>
                      <div className="text-xs font-bold text-emerald-400">{analysis.setup.tp2}</div>
                    </div>
                    <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">CENT LOT (6% RISK)</div>
                      <div className="text-xs font-bold text-amber-400">{recommendedLot} Lots</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-center space-y-2">
                  <div className="font-mono text-xs text-zinc-400">
                    STATUS: <span className="text-amber-400 font-bold">WAITING FOR CLEAN SWEEP</span>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-500 max-w-md mx-auto">
                    {analysis?.decision?.reasoning || "Strict rule: M15 20-bar liquidity sweep + >50% body rejection in alignment with completed H1 trend required. No forced trades."}
                  </p>
                </div>
              )}

              {/* Protocol Gates Checklist */}
              <div className="mt-3 pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Completed H1 Trend Gate</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>20-Bar Liquidity Sweep</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>1.2x ATR Stop Cushion</span>
                </div>
              </div>
            </div>

            {/* Quick MT4/MT5 Signal Feed List */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3 font-mono text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Live Actionable Signals
                </span>
                <span className="text-zinc-500">{signals.length} Active Records</span>
              </div>

              {signals.length === 0 ? (
                <div className="text-center py-6 font-mono text-xs text-zinc-500">
                  No signals currently active. System monitors next M15 candle close.
                </div>
              ) : (
                <div className="space-y-2">
                  {signals.map((sig, i) => (
                    <div key={sig.id || i} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${sig.direction === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                          {sig.direction}
                        </span>
                        <div>
                          <div className="font-mono text-xs font-bold text-white">{sig.pair}</div>
                          <div className="font-mono text-[10px] text-zinc-400">Entry: {sig.entryPrice} · SL: {sig.sl}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => copyTrade(
                          `ROBOFOREX CENT ORDER\nPair: ${sig.pair}\nAction: ${sig.direction}\nEntry: ${sig.entryPrice}\nSL: ${sig.sl}\nTP1: ${sig.tp1}\nTP2: ${sig.tp2}\nLot: ${recommendedLot}`,
                          `sig-${i}`
                        )}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono flex items-center gap-1 cursor-pointer"
                      >
                        {copiedTradeId === `sig-${i}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedTradeId === `sig-${i}` ? "COPIED" : "COPY"}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* HUB 2: ROBOFOREX CENT LOT SIZER                          */}
        {/* ======================================================== */}
        {activeHub === "sizer" && (
          <div className="space-y-4">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-amber-400" />
                  <div>
                    <h2 className="text-base font-bold text-white font-mono">RoboForex Cent Lot Sizer</h2>
                    <p className="text-xs text-zinc-400 font-mono">Precision Risk Allocation · Floored Down to 0.01 Lots</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  REAL DOLLARS IN CENT ACCT
                </span>
              </div>

              {/* Balance Quick Presets */}
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5 block">Account Equity Presets ($ USD)</label>
                <div className="grid grid-cols-5 gap-2 font-mono text-xs">
                  {[200, 500, 677, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCalcBalance(amt)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        calcBalance === amt
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk Percentage Toggle */}
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5 block">Risk Allocation Per Trade</label>
                <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                  {[
                    { pct: 2.0, label: "2.0% Safe" },
                    { pct: 3.0, label: "3.0% Balanced" },
                    { pct: 6.0, label: "6.0% Aggressive" }
                  ].map(r => (
                    <button
                      key={r.pct}
                      onClick={() => setCalcRiskPct(r.pct)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        calcRiskPct === r.pct
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="text-[10px] uppercase text-zinc-400 block mb-1">Instrument</label>
                  <select
                    value={calcPair}
                    onChange={(e) => setCalcPair(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    {PAIRS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-zinc-400 block mb-1">Stop Loss Distance (Pips)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={calcSlPips}
                    onChange={(e) => setCalcSlPips(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-400 text-xs focus:outline-none focus:border-rose-500 font-bold"
                  />
                </div>
              </div>

              {/* Big Output Hero Display */}
              <div className="bg-zinc-950 border border-amber-500/30 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                <div className="text-[10px] font-mono uppercase text-zinc-400 mb-1">RECOMMENDED POSITION SIZE</div>
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <div className="text-3xl sm:text-4xl font-mono font-black text-emerald-400">
                    {recommendedLot.toFixed(2)} Lots
                  </div>
                  <div className="text-xs font-mono text-zinc-400">
                    ({(recommendedLot * 100).toFixed(0)} Cent Lots on RoboForex MT4/MT5)
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-zinc-800/80 font-mono text-center">
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">MAX CASH RISK</div>
                    <div className="text-sm font-bold text-amber-400">${cashRisk.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">PIP VALUE</div>
                    <div className="text-sm font-bold text-white">${pipVal.toFixed(2)} / 0.01L</div>
                  </div>
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">GAIN @ TP1 (1.0R)</div>
                    <div className="text-sm font-bold text-blue-400">+${gainTp1.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">GAIN @ TP2 (2.5R)</div>
                    <div className="text-sm font-bold text-emerald-400">+${gainTp2.toFixed(2)}</div>
                  </div>
                </div>

                {/* 1-Tap Copy Sizing Parameters */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `ROBOFOREX CENT SIZING\nEquity: $${calcBalance}\nRisk: ${calcRiskPct}% ($${cashRisk.toFixed(2)})\nPair: ${calcPair}\nSL Pips: ${calcSlPips} pips\nRecommended: ${recommendedLot.toFixed(2)} Lots`
                    );
                    setCopiedCalc(true);
                    setTimeout(() => setCopiedCalc(false), 2500);
                  }}
                  className="w-full mt-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                >
                  {copiedCalc ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCalc ? "PARAMETERS COPIED TO CLIPBOARD" : "COPY SIZING FOR ORDER TICKET"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* HUB 3: RADAR (MARKET SESSIONS & WATCHLIST)               */}
        {/* ======================================================== */}
        {activeHub === "radar" && (
          <div className="space-y-4">
            {/* Global Session Bar */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-mono text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-cyan-400" />
                Global Trading Sessions (WAT Time)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                  <div>
                    <div className="text-white font-bold">Tokyo Session</div>
                    <div className="text-[10px] text-zinc-500">01:00 - 09:00 WAT</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-400">Asian</span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 flex justify-between items-center bg-emerald-500/5">
                  <div>
                    <div className="text-emerald-400 font-bold">London Kill Zone</div>
                    <div className="text-[10px] text-zinc-400">09:00 - 12:00 WAT</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold animate-pulse">ACTIVE</span>
                </div>
                <div className="p-3 rounded-xl bg-zinc-950 border border-cyan-500/30 flex justify-between items-center bg-cyan-500/5">
                  <div>
                    <div className="text-cyan-400 font-bold">New York Kill Zone</div>
                    <div className="text-[10px] text-zinc-400">15:30 - 19:00 WAT</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">High Vol</span>
                </div>
              </div>
            </div>

            {/* Asset Watchlist */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-mono text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Radar className="w-4 h-4 text-amber-400" />
                Primary & Trend Core Watchlist
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
                {PAIRS.map(pair => (
                  <div key={pair} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white">{pair}</div>
                      <div className="text-[10px] text-zinc-500">{pair.includes("XAG") || pair.includes("XAU") ? "Precious Metal" : "Forex Cross"}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-cyan-400 border border-zinc-800 font-bold">
                        H1 TREND GATE ACTIVE
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* HUB 4: LEDGER & COMPOUNDING TRACKER                      */}
        {/* ======================================================== */}
        {activeHub === "ledger" && (
          <div className="space-y-4">
            {/* Compounding Milestones Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="font-mono text-sm font-bold text-white">Cent Account Compounding Trajectory</h3>
                    <p className="font-mono text-xs text-zinc-400">Initial: $677.00 USD · Doubled to $1,375.66 USD (+103.2%)</p>
                  </div>
                </div>
              </div>

              {/* Progress Bar Milestones */}
              <div className="space-y-2 font-mono">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Current Phase: Milestone 1 Achieved</span>
                  <span className="text-emerald-400 font-bold">103.2% Completed</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full" style={{ width: "100%" }} />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Start: $677</span>
                  <span>Goal 1: $1,000 (Hit)</span>
                  <span>Goal 2: $1,375 (Hit)</span>
                  <span>Goal 3: $2,500</span>
                </div>
              </div>

              {/* Performance Table Breakdown */}
              <div className="pt-3 border-t border-zinc-800/80 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between p-2 rounded-lg bg-zinc-950">
                  <span className="text-zinc-300">Silver (XAG/USD) Contribution</span>
                  <span className="text-emerald-400 font-bold">+$241.82 Profit (4W / 2L)</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-zinc-950">
                  <span className="text-zinc-300">Yen Crosses (GBP/JPY, EUR/JPY)</span>
                  <span className="text-emerald-400 font-bold">+$276.40 Profit (6W / 1L)</span>
                </div>
                <div className="flex justify-between p-2 rounded-lg bg-zinc-950">
                  <span className="text-zinc-300">Forex Majors (EUR/USD, USD/CHF)</span>
                  <span className="text-cyan-400 font-bold">+$180.44 Profit (8W / 3L)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Fixed Bottom Navigation Bar (4 Core Hubs) ───────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-lg border-t border-zinc-800/90 py-1.5 px-3">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
          {[
            { id: "engines", label: "Engines", icon: Zap },
            { id: "sizer", label: "Lot Sizer", icon: Calculator },
            { id: "radar", label: "Radar", icon: Radar },
            { id: "ledger", label: "Ledger", icon: TrendingUp },
          ].map(hub => {
            const active = activeHub === hub.id;
            const IconComponent = hub.icon;
            return (
              <button
                key={hub.id}
                onClick={() => setActiveHub(hub.id as HubId)}
                className={`py-1.5 px-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                  active
                    ? "text-amber-400 font-bold"
                    : "text-zinc-500 hover:text-zinc-300 font-normal"
                }`}
              >
                <IconComponent className={`w-5 h-5 mb-0.5 ${active ? "text-amber-400 stroke-[2.5]" : "text-zinc-500"}`} />
                <span className="text-[10px] font-mono tracking-tight">{hub.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
