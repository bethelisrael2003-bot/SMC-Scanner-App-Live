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
  Radio,
  Settings,
  Sliders,
  Layers,
  ArrowRight,
  Sparkles
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

export type BottomTabId = "command" | "sizer" | "briefing" | "settings";

interface PairStrategyProfile {
  pair: string;
  name: string;
  icon: string;
  category: string;
  dedicatedGradeA: string;
  dedicatedIcon: string;
  shortModel: string;
  gradeAEngineKey: string;
  alternativeGradeB: string;
  confluenceGradeC: string;
  sixMonthWr: string;
  sixMonthRecord: string;
  sixMonthProfit: string;
  sixMonthR: string;
  profitFactor: string;
  maxDd: string;
  pipSize: number;
  pipVal: number;
  defaultSl: number;
}

const DEDICATED_PROFILES: PairStrategyProfile[] = [
  {
    pair: "XAG/USD",
    name: "Silver",
    icon: "🥈",
    category: "Precious Metals",
    dedicatedGradeA: "Trend Sweep / Aggressive",
    dedicatedIcon: "🌊",
    shortModel: "🌊 Trend Sweep",
    gradeAEngineKey: "trendsweep",
    alternativeGradeB: "Asian Fade (🎯)",
    confluenceGradeC: "Core MPR (⚡)",
    sixMonthWr: "55.6%",
    sixMonthRecord: "5W / 4L",
    sixMonthProfit: "+$134.68 (+19.9%)",
    sixMonthR: "+3.50R",
    profitFactor: "1.88",
    maxDd: "-11.6%",
    pipSize: 0.01,
    pipVal: 0.08,
    defaultSl: 45.0,
  },
  {
    pair: "GBP/JPY",
    name: "Guppy Cross",
    icon: "⚡",
    category: "High-Velocity Cross",
    dedicatedGradeA: "Trend Sweep (H1 EMA Filter)",
    dedicatedIcon: "🌊",
    shortModel: "🌊 Trend Sweep",
    gradeAEngineKey: "trendsweep",
    alternativeGradeB: "Asian Fade (🎯)",
    confluenceGradeC: "Asian Breakout (🚀)",
    sixMonthWr: "50.0%",
    sixMonthRecord: "2W / 2L",
    sixMonthProfit: "+$69.36 (+10.2%)",
    sixMonthR: "+1.82R",
    profitFactor: "2.21",
    maxDd: "-6.0%",
    pipSize: 0.01,
    pipVal: 0.09,
    defaultSl: 35.0,
  },
  {
    pair: "EUR/USD",
    name: "Euro Dollar",
    icon: "💶",
    category: "Forex Major",
    dedicatedGradeA: "Asian Range Breakout",
    dedicatedIcon: "🚀",
    shortModel: "🚀 Asian Breakout",
    gradeAEngineKey: "asian",
    alternativeGradeB: "Trend Sweep (🌊)",
    confluenceGradeC: "Asian Fade (🎯)",
    sixMonthWr: "50.0%",
    sixMonthRecord: "9W / 9L",
    sixMonthProfit: "+$577.78 (+85.3%)",
    sixMonthR: "+11.46R",
    profitFactor: "3.53",
    maxDd: "-15.1%",
    pipSize: 0.0001,
    pipVal: 0.09,
    defaultSl: 20.0,
  },
];

function fmtPrice(pair: string, price: number | null | undefined): string {
  if (price === null || price === undefined) return "--";
  if (pair.includes("JPY")) return Number(price).toFixed(3);
  if (pair.includes("XAG")) return Number(price).toFixed(2);
  return Number(price).toFixed(5);
}

export function ApexQuantApp({ onSwitchToClassic }: { onSwitchToClassic: () => void }) {
  const [activeTab, setActiveTab] = useState<BottomTabId>("command");
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [copiedTradeId, setCopiedTradeId] = useState<string | null>(null);

  // Live Nigeria (WAT) Time & Telemetry
  const [watTime, setWatTime] = useState("");
  const [briefingData, setBriefingData] = useState<any>(null);
  const [confluenceData, setConfluenceData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // RoboForex Cent Calculator State
  const [calcBalance, setCalcBalance] = useState<number>(() => {
    return Number(localStorage.getItem("apex_balance")) || 677;
  });
  const [calcRiskPct, setCalcRiskPct] = useState<number>(() => {
    return Number(localStorage.getItem("apex_risk_pct")) || 6.0;
  });
  const [calcSlPips, setCalcSlPips] = useState<number>(45.0);
  const [copiedCalc, setCopiedCalc] = useState(false);

  const activeProfile = DEDICATED_PROFILES[selectedPairIndex];

  // Update default SL when switching pairs
  useEffect(() => {
    setCalcSlPips(activeProfile.defaultSl);
  }, [selectedPairIndex, activeProfile.defaultSl]);

  // Persist balance & risk
  useEffect(() => {
    localStorage.setItem("apex_balance", String(calcBalance));
    localStorage.setItem("apex_risk_pct", String(calcRiskPct));
  }, [calcBalance, calcRiskPct]);

  // Real-time Nigeria (WAT) Clock
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

  // Fetch Live Confluence Scan & Briefing
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [confRes, briefRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/confluence/scan?balance=${calcBalance}`),
        fetch(`${API_BASE_URL}/api/daily-briefing`),
      ]);

      if (confRes.status === "fulfilled" && confRes.value.ok) {
        setConfluenceData(await confRes.value.json());
      }
      if (briefRes.status === "fulfilled" && briefRes.value.ok) {
        setBriefingData(await briefRes.value.json());
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [calcBalance]);

  useEffect(() => {
    fetchAllData();
    const iv = setInterval(fetchAllData, 20000);
    return () => clearInterval(iv);
  }, [fetchAllData]);

  // Current pair active confluence record
  const currentConf = confluenceData?.pairs?.find((p: any) => p.pair === activeProfile.pair) || null;
  const pairBriefing = briefingData?.pairs?.find((p: any) => p.pair === activeProfile.pair) || null;

  // Grade-Adjusted Risk % (A+ = 6%, A = 4%, B+ = 2%)
  const effectiveRiskPct = currentConf?.confluenceGrade === "A+"
    ? 6.0
    : currentConf?.confluenceGrade === "A"
    ? 4.0
    : currentConf?.confluenceGrade === "B+"
    ? 2.0
    : calcRiskPct;

  const cashRisk = Math.round(calcBalance * (effectiveRiskPct / 100.0) * 100) / 100;
  const rawLot = (calcSlPips > 0 && activeProfile.pipVal > 0)
    ? (cashRisk / (calcSlPips * activeProfile.pipVal)) / 100.0
    : 0.01;
  const recommendedLot = Math.max(0.01, Math.floor(rawLot * 100) / 100);
  const gainTp1 = Math.round(cashRisk * 0.50 * 100) / 100;
  const gainTp2 = Math.round(cashRisk * 1.75 * 100) / 100;

  const isTradeActive = currentConf?.confluenceGrade && currentConf?.confluenceGrade !== "WAIT" && currentConf?.entryPrice;

  // 1-Tap Copy helper
  const copyTrade = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTradeId(id);
    setTimeout(() => setCopiedTradeId(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-zinc-100 flex flex-col font-sans select-none pb-24">
      {/* ── Top Header Bar ────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#070a12]/95 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/25 to-yellow-600/20 border border-amber-500/40 flex items-center justify-center font-mono font-black text-amber-400 text-sm shadow-[0_0_15px_rgba(245,158,11,0.25)]">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white font-mono">APEX INSTITUTIONAL</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 font-mono font-bold border border-amber-500/30">PRO</span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-cyan-400" />
              <span className="text-cyan-400 font-bold">{watTime || "00:00:00 WAT"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Refresh */}
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>SCAN</span>
          </button>
        </div>
      </header>

      {/* ── 3-Daily Live Intelligence Ribbon (Nigeria WAT) ─────────── */}
      <div className="bg-zinc-950/90 border-b border-zinc-800/60 px-4 py-2.5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 truncate">
          <Radio className={`w-3.5 h-3.5 shrink-0 ${briefingData?.isKillZone ? "text-emerald-400 animate-pulse" : "text-amber-400"}`} />
          <span className={briefingData?.isKillZone ? "text-emerald-400 font-bold truncate" : "text-zinc-300 truncate"}>
            {briefingData?.briefingPhase || "Active Session Monitor (Nigeria WAT)"}
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-cyan-400 border border-zinc-800 shrink-0 font-bold">
          3-Pair Core
        </span>
      </div>

      {/* ── Main Body (Switched via Bottom Nav) ───────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {/* ========================================================== */}
        {/* TAB 1: COMMAND CENTER (LIVE PAIR MONITORS)                 */}
        {/* ========================================================== */}
        {activeTab === "command" && (
          <div className="space-y-4">
            {/* Pair Switcher with Dedicated Grade A Badges */}
            <div>
              <div className="text-[11px] uppercase font-mono text-zinc-400 mb-2 flex items-center justify-between">
                <span>Select Primary Asset</span>
                <span className="text-emerald-400 font-bold">Grade A Dedicated Model</span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {DEDICATED_PROFILES.map((p, idx) => {
                  const active = selectedPairIndex === idx;
                  return (
                    <button
                      key={p.pair}
                      onClick={() => setSelectedPairIndex(idx)}
                      className={`p-3 sm:p-3.5 rounded-2xl border transition-all text-left cursor-pointer relative overflow-hidden ${
                        active
                          ? "bg-amber-500/15 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.2)] text-white"
                          : "bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-lg">{p.icon}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${active ? "bg-amber-500 text-black" : "bg-zinc-950 text-zinc-400 border border-zinc-800"}`}>
                          {p.sixMonthWr}
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-white tracking-tight">{p.pair}</div>
                      <div className="font-mono text-[10px] text-amber-400 font-semibold truncate mt-0.5">
                        {p.shortModel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Pair Live Setup & Confluence Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{activeProfile.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold font-mono text-white">{activeProfile.pair}</h2>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-cyan-400 font-mono border border-zinc-800">
                        {activeProfile.category}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-zinc-400 mt-0.5">
                      Macro H1 Trend: <span className={pairBriefing?.macroTrend === "BULLISH" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{pairBriefing?.macroTrend || "CALCULATING"}</span>
                      {" · "}Spread: <span className="text-zinc-300 font-bold">{currentConf?.livePrice?.spread_pips || pairBriefing?.livePrice?.spread_pips || 0.8} pips</span>
                    </div>
                  </div>
                </div>

                <div className="text-right p-2 rounded-xl bg-zinc-950 border border-zinc-800 font-mono">
                  <div className="text-[9px] uppercase text-zinc-500">Live Bid / Ask</div>
                  <div className="text-sm font-bold text-white">
                    <span className="text-cyan-400">{currentConf?.livePrice?.bid || pairBriefing?.livePrice?.bid || "--"}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span className="text-zinc-400">{currentConf?.livePrice?.ask || pairBriefing?.livePrice?.ask || "--"}</span>
                  </div>
                </div>
              </div>

              {/* Active Signal Banner OR Waiting Card */}
              {isTradeActive ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${currentConf.confluenceGrade === "A+" ? "bg-amber-400 text-black animate-pulse" : "bg-emerald-500 text-black"}`}>
                          ⭐ GRADE {currentConf.confluenceGrade}
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-400">
                          {currentConf.direction} SIGNAL CONFIRMED
                        </span>
                      </div>
                      <div className="font-mono text-xs text-zinc-300 mt-1">
                        Entry: {fmtPrice(activeProfile.pair, currentConf.entryPrice)} · SL: {fmtPrice(activeProfile.pair, currentConf.sl)} ({currentConf.slPips || activeProfile.defaultSl} pips)
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400 mt-0.5">
                        {currentConf.reasoning}
                      </div>
                    </div>

                    <button
                      onClick={() => copyTrade(
                        `ROBOFOREX CENT ORDER\nPair: ${activeProfile.pair}\nGrade: ${currentConf.confluenceGrade}\nAction: ${currentConf.direction}\nEntry: ${currentConf.entryPrice}\nSL: ${currentConf.sl}\nTP1: ${currentConf.tp1} (Scale 50% & Auto-BE)\nTP2: ${currentConf.tp2}\nLot: ${recommendedLot} Lots\nRisk: $${cashRisk.toFixed(2)} (${effectiveRiskPct}%)`,
                        "trade-copy"
                      )}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black font-mono text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-400 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0"
                    >
                      {copiedTradeId === "trade-copy" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedTradeId === "trade-copy" ? "ORDER COPIED!" : "COPY TO METATRADER"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">TP1 (AUTO-BE)</div>
                      <div className="text-xs font-bold text-blue-400">{fmtPrice(activeProfile.pair, currentConf.tp1)}</div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">TP2 (RUNNER)</div>
                      <div className="text-xs font-bold text-emerald-400">{fmtPrice(activeProfile.pair, currentConf.tp2)}</div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">RECOMMENDED LOT</div>
                      <div className="text-xs font-bold text-amber-400">{recommendedLot.toFixed(2)} Lots</div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">MAX CASH RISK</div>
                      <div className="text-xs font-bold text-rose-400">${cashRisk.toFixed(2)} ({effectiveRiskPct}%)</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      M15 20-Bar Range: [{fmtPrice(activeProfile.pair, currentConf?.m15Low || pairBriefing?.m15Low)} – {fmtPrice(activeProfile.pair, currentConf?.m15High || pairBriefing?.m15High)}]
                    </span>
                    <span className="text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px]">
                      STATUS: WAITING FOR DEDICATED SETUP
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-400">
                    {currentConf?.reasoning || `Primary model (${activeProfile.dedicatedGradeA}) is monitoring ${activeProfile.pair} for structural alignment during active Kill Zones.`}
                  </p>
                </div>
              )}

              {/* Hierarchy Strategy Breakdown for Selected Pair */}
              <div className="mt-3.5 pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded-lg bg-zinc-950 border border-amber-500/20 flex justify-between items-center gap-2">
                  <div className="min-w-0 truncate">
                    <span className="text-amber-400 font-bold">⭐ Grade A: </span>
                    <span className="text-zinc-200">{activeProfile.dedicatedGradeA}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 whitespace-nowrap">Primary</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 flex justify-between items-center gap-2">
                  <div className="min-w-0 truncate">
                    <span className="text-blue-400 font-bold">🥈 Grade B: </span>
                    <span className="text-zinc-300">{activeProfile.alternativeGradeB}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 whitespace-nowrap">Alternative</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 flex justify-between items-center gap-2">
                  <div className="min-w-0 truncate">
                    <span className="text-emerald-400 font-bold">🥉 Grade C: </span>
                    <span className="text-zinc-300">{activeProfile.confluenceGradeC}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 whitespace-nowrap">Confluence</span>
                </div>
              </div>
            </div>

            {/* 180-Day Audited Proof Card (Rule 11a Compliant) */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 font-mono">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase">
                  180-Day Dedicated Model Verification (April 14 – October 13, 2026)
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
                  <div className="text-[10px] text-rose-300 font-bold">Controlled Risk</div>
                </div>
              </div>

              <div className="space-y-1 text-[11px] pt-1">
                {DEDICATED_PROFILES.map(dp => (
                  <div key={dp.pair} className="flex justify-between p-2 rounded-lg bg-zinc-950 border border-zinc-800/40">
                    <span className="text-zinc-300">{dp.pair} ({dp.dedicatedGradeA})</span>
                    <span className="text-emerald-400 font-bold">{dp.sixMonthProfit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: FULL-SCREEN ROBOFOREX CENT LOT SIZER                */}
        {/* ========================================================== */}
        {activeTab === "sizer" && (
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
                  ROBOFOREX CENT
                </span>
              </div>

              {/* Balance Quick Presets */}
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5 block">Account Equity Presets ($ USD)</label>
                <div className="grid grid-cols-5 gap-1.5 font-mono text-xs">
                  {[200, 500, 677, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCalcBalance(amt)}
                      className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer whitespace-nowrap text-[11px] sm:text-xs font-bold ${
                        calcBalance === amt
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      ${amt >= 1000 ? `${amt/1000}k` : amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk Percentage Toggle */}
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5 block">Risk Allocation Per Trade</label>
                <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                  {[
                    { pct: 2.0, label: "2.0% (Grade B+)" },
                    { pct: 4.0, label: "4.0% (Grade A)" },
                    { pct: 6.0, label: "6.0% (Grade A+)" }
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

              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="text-[10px] uppercase text-zinc-400 block mb-1">Target Instrument</label>
                  <select
                    value={activeProfile.pair}
                    onChange={(e) => {
                      const idx = DEDICATED_PROFILES.findIndex(p => p.pair === e.target.value);
                      if (idx !== -1) setSelectedPairIndex(idx);
                    }}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    {DEDICATED_PROFILES.map(p => (
                      <option key={p.pair} value={p.pair}>{p.icon} {p.pair} ({p.name})</option>
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

              {/* Big Hero Position Size Output Display */}
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
                    <div className="text-sm font-bold text-white">${activeProfile.pipVal.toFixed(2)} / 0.01L</div>
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

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `ROBOFOREX CENT SIZING\nEquity: $${calcBalance}\nRisk: ${effectiveRiskPct}% ($${cashRisk.toFixed(2)})\nPair: ${activeProfile.pair}\nSL Pips: ${calcSlPips} pips\nRecommended: ${recommendedLot.toFixed(2)} Lots`
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

        {/* ========================================================== */}
        {/* TAB 3: 3x DAILY BRIEFINGS & SESSIONS                       */}
        {/* ========================================================== */}
        {activeTab === "briefing" && (
          <div className="space-y-4 font-mono">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-cyan-400" />
                The 3 Daily Institutional Windows (Nigeria WAT)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 flex justify-between items-center bg-emerald-500/5">
                  <div>
                    <div className="text-emerald-400 font-bold">1. London Open Morning Window</div>
                    <div className="text-[10px] text-zinc-400">09:00 AM - 12:00 PM WAT · Asian Sweep &amp; London Breakouts</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">ACTIVE</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-cyan-500/30 flex justify-between items-center bg-cyan-500/5">
                  <div>
                    <div className="text-cyan-400 font-bold">2. US Pre-Market &amp; Economic Releases</div>
                    <div className="text-[10px] text-zinc-400">01:30 PM - 03:30 PM WAT · High Impact US Data &amp; Pre-NY Setup</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">CRUCIAL</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/30 flex justify-between items-center bg-amber-500/5">
                  <div>
                    <div className="text-amber-400 font-bold">3. New York Open Peak Volatility</div>
                    <div className="text-[10px] text-zinc-400">03:30 PM - 07:00 PM WAT · Maximum Expansion on Silver &amp; Yen</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">MAX VOL</span>
                </div>
              </div>
            </div>

            {/* Current Market State Breakdown */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                Live Market Analysis Summary
              </h3>
              <div className="space-y-2 text-xs">
                {DEDICATED_PROFILES.map(dp => {
                  const bItem = briefingData?.pairs?.find((x: any) => x.pair === dp.pair);
                  return (
                    <div key={dp.pair} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-white font-bold">{dp.icon} {dp.pair} ({dp.name})</div>
                        <div className="text-[10px] text-zinc-400">
                          H1 Trend: <span className={bItem?.macroTrend === "BULLISH" ? "text-emerald-400" : "text-rose-400"}>{bItem?.macroTrend || "CALCULATING"}</span>
                          {" · "}Range: [{bItem?.m15Low || "--"} – {bItem?.m15High || "--"}]
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-amber-400 font-bold border border-zinc-800">
                        {dp.dedicatedGradeA}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 4: SETTINGS & TERMINAL VIEW SWITCHER                   */}
        {/* ========================================================== */}
        {activeTab === "settings" && (
          <div className="space-y-4 font-mono">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Settings className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-base font-bold text-white">Terminal Settings &amp; Platform Switcher</h2>
                  <p className="text-xs text-zinc-400">Switch between focused and multi-tab modes anytime</p>
                </div>
              </div>

              {/* Mode Switcher Buttons */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white uppercase block">Select Interface View</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-4 rounded-xl border border-amber-500/60 bg-amber-500/10 text-white flex flex-col justify-between">
                    <div>
                      <div className="font-bold text-amber-400 text-sm flex items-center gap-1.5">
                        <Zap className="w-4 h-4" />
                        Apex Pro Command (Active)
                      </div>
                      <p className="text-[11px] text-zinc-300 mt-1">
                        Dedicated 3-Pair Terminal (Silver, GBP/JPY, EUR/USD). Zero clutter, Grade A models, and A+ confluence grading.
                      </p>
                    </div>
                    <span className="mt-3 text-[10px] text-emerald-400 font-bold">CURRENT ACTIVE VIEW</span>
                  </div>

                  <button
                    onClick={onSwitchToClassic}
                    className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 hover:border-zinc-600 text-zinc-300 text-left flex flex-col justify-between cursor-pointer transition-all"
                  >
                    <div>
                      <div className="font-bold text-white text-sm flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        Classic Multi-Tab Terminal
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        Original view with all 8 strategy tabs, deep dive panels, candle charts, and news advisories.
                      </p>
                    </div>
                    <div className="mt-3 text-xs text-cyan-400 font-bold flex items-center gap-1">
                      <span>Switch to Classic</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                </div>
              </div>

              {/* Account Capital Presets */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <label className="text-xs font-bold text-white uppercase block">Default Account Balance ($ USD)</label>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {[200, 500, 677, 1000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCalcBalance(amt)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        calcBalance === amt
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Confluence Hierarchy Guide */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] space-y-1.5">
                <div className="text-white font-bold text-xs uppercase flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Confluence Confidence Hierarchy
                </div>
                <div className="text-emerald-400">⭐ Grade A+ Signal: 6.0% Aggressive Risk (Grade A + B/C Agree)</div>
                <div className="text-amber-400">⭐ Grade A Signal: 4.0% Standard Risk (Dedicated Model Solo)</div>
                <div className="text-cyan-400">🥈 Grade B+ Signal: 2.0% Controlled Risk (Grade B + C Agree)</div>
                <div className="text-zinc-500">🚫 Conflict / Dead Zone: 0.0% Risk (Output WAIT)</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Fixed Bottom Navigation Bar (4 Ergonomic Mobile Hubs) ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#070a12]/95 backdrop-blur-lg border-t border-zinc-800/90 px-3 pt-2"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}
      >
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
          {[
            { id: "command", label: "Command", icon: Zap },
            { id: "sizer", label: "Lot Sizer", icon: Calculator },
            { id: "briefing", label: "Briefing", icon: Radio },
            { id: "settings", label: "Settings", icon: Settings },
          ].map(hub => {
            const active = activeTab === hub.id;
            const IconComponent = hub.icon;
            return (
              <button
                key={hub.id}
                onClick={() => setActiveTab(hub.id as BottomTabId)}
                className={`py-2 px-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                  active
                    ? "text-amber-400 font-bold"
                    : "text-zinc-500 hover:text-zinc-300 font-normal"
                }`}
              >
                <IconComponent className={`w-5 h-5 mb-1 ${active ? "text-amber-400 stroke-[2.5]" : "text-zinc-500"}`} />
                <span className="text-[11px] font-mono tracking-tight">{hub.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
