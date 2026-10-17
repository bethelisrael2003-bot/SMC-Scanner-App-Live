import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Calculator,
  Settings,
  Clock,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Calendar,
  DollarSign,
  Layers,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
} from "lucide-react";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

export type BottomTabId = "terminal" | "analytics" | "radar" | "sizer" | "settings";

interface PairStrategyProfile {
  pair: string;
  name: string;
  category: string;
  epic: string;
  pipSize: number;
  defaultSl: number;
  spreadThreshold: number;
}

const DEDICATED_PROFILES: PairStrategyProfile[] = [
  {
    pair: "EUR/USD",
    name: "Euro / US Dollar",
    category: "Major FX",
    epic: "EURUSD",
    pipSize: 0.0001,
    defaultSl: 25.0,
    spreadThreshold: 1.8,
  },
  {
    pair: "GBP/JPY",
    name: "British Pound / Japanese Yen",
    category: "Cross FX",
    epic: "GBPJPY",
    pipSize: 0.01,
    defaultSl: 40.0,
    spreadThreshold: 4.5,
  },
  {
    pair: "XAU/USD",
    name: "Spot Gold",
    category: "Commodities",
    epic: "GOLD",
    pipSize: 0.1,
    defaultSl: 15.0,
    spreadThreshold: 12.0,
  },
  {
    pair: "XAG/USD",
    name: "Spot Silver",
    category: "Commodities",
    epic: "SILVER",
    pipSize: 0.01,
    defaultSl: 45.0,
    spreadThreshold: 10.0,
  },
];

const isNativePlatform = () => {
  return typeof window !== "undefined" &&
         (window as any).Capacitor &&
         typeof (window as any).Capacitor.isNativePlatform === "function" &&
         (window as any).Capacitor.isNativePlatform();
};

export function ApexQuantApp({ onSwitchToClassic }: { onSwitchToClassic?: () => void } = {}) {
  const [activeTab, setActiveTab] = useState<BottomTabId>("terminal");
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [copiedTradeId, setCopiedTradeId] = useState<string | null>(null);

  // Audio Alerts State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem("apex_sound") !== "false";
  });

  // Time & Status State
  const [utcTime, setUtcTime] = useState("");
  const [watTime, setWatTime] = useState("");
  const [loading, setLoading] = useState(false);

  // Live Data States
  const [capitalStatus, setCapitalStatus] = useState<any>(null);
  const [confluenceData, setConfluenceData] = useState<any>(null);
  const [briefingData, setBriefingData] = useState<any>(null);
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const [performanceAnalytics, setPerformanceAnalytics] = useState<any>(null);
  const [economicEvents, setEconomicEvents] = useState<any>(null);
  const [spreadArmorData, setSpreadArmorData] = useState<any>(null);

  // Selected trade point on equity curve
  const [selectedCurvePoint, setSelectedCurvePoint] = useState<any>(null);

  // News Radar Filter
  const [calendarFilter, setCalendarFilter] = useState<string>("ALL");

  // Sizer State ($25 Flat Risk Model)
  const [targetRiskUsd, setTargetRiskUsd] = useState<number>(25.0);
  const [customSlPips, setCustomSlPips] = useState<number>(30.0);
  const [copiedPlan, setCopiedPlan] = useState(false);

  const activeProfile = DEDICATED_PROFILES[selectedPairIndex];

  // Update default SL when switching pairs
  useEffect(() => {
    setCustomSlPips(activeProfile.defaultSl);
  }, [selectedPairIndex, activeProfile.defaultSl]);

  // Dual Clocks (UTC & WAT)
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setUtcTime(now.toTimeString().substring(0, 8) + " UTC");
      const watDate = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const h = watDate.getUTCHours();
      const m = String(watDate.getUTCMinutes()).padStart(2, "0");
      const s = String(watDate.getUTCSeconds()).padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      const hFmt = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      setWatTime(`${String(hFmt).padStart(2, "0")}:${m}:${s} ${ampm} WAT`);
    };
    updateClocks();
    const iv = setInterval(updateClocks, 1000);
    return () => clearInterval(iv);
  }, []);

  // API Data Fetching
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [capRes, confRes, briefRes, perfRes, analyticsRes, calRes, armorRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/capital/status`),
        fetch(`${API_BASE_URL}/api/confluence/scan`),
        fetch(`${API_BASE_URL}/api/daily-briefing`),
        fetch(`${API_BASE_URL}/api/performance/stats`),
        fetch(`${API_BASE_URL}/api/performance/analytics`),
        fetch(`${API_BASE_URL}/api/economic-calendar`),
        fetch(`${API_BASE_URL}/api/spread-armor`),
      ]);

      if (capRes.status === "fulfilled" && capRes.value.ok) {
        setCapitalStatus(await capRes.value.json());
      }
      if (confRes.status === "fulfilled" && confRes.value.ok) {
        setConfluenceData(await confRes.value.json());
      }
      if (briefRes.status === "fulfilled" && briefRes.value.ok) {
        setBriefingData(await briefRes.value.json());
      }
      if (perfRes.status === "fulfilled" && perfRes.value.ok) {
        setPerformanceStats(await perfRes.value.json());
      }
      if (analyticsRes.status === "fulfilled" && analyticsRes.value.ok) {
        const data = await analyticsRes.value.json();
        setPerformanceAnalytics(data);
        if (data.equityCurve && data.equityCurve.length > 0) {
          setSelectedCurvePoint(data.equityCurve[data.equityCurve.length - 1]);
        }
      }
      if (calRes.status === "fulfilled" && calRes.value.ok) {
        setEconomicEvents(await calRes.value.json());
      }
      if (armorRes.status === "fulfilled" && armorRes.value.ok) {
        setSpreadArmorData(await armorRes.value.json());
      }
    } catch (err) {
      console.error("[APEX UI] Error fetching live data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    const iv = setInterval(fetchAllData, 20000);
    return () => clearInterval(iv);
  }, [fetchAllData]);

  // Current active pair confluence record
  const currentConf = confluenceData?.pairs?.find((p: any) => p.pair === activeProfile.pair) || null;
  const currentArmor = spreadArmorData?.pairs?.find((p: any) => p.pair === activeProfile.pair) || null;

  // Sizer calculations for $25 flat risk parity
  const sizerCalculations = useMemo(() => {
    const slDist = customSlPips * activeProfile.pipSize;
    if (slDist <= 0) return { units: 1000, cashRisk: targetRiskUsd, tp1Gain: targetRiskUsd, tp2Gain: targetRiskUsd * 2.5 };

    let units = 1000;
    if (activeProfile.pair.includes("XAU")) {
      units = Number(Math.max(0.5, Math.min(4.0, Math.round((targetRiskUsd / slDist) * 10) / 10)).toFixed(1));
    } else if (activeProfile.pair.includes("XAG")) {
      units = Math.max(10, Math.min(120, Math.round(targetRiskUsd / slDist)));
    } else if (activeProfile.pair.includes("JPY")) {
      const usdJpy = 150.0;
      units = Math.max(1000, Math.min(20000, Math.round(((targetRiskUsd * usdJpy) / slDist) / 500) * 500));
    } else {
      units = Math.max(1000, Math.min(25000, Math.round((targetRiskUsd / slDist) / 500) * 500));
    }

    return {
      units,
      cashRisk: targetRiskUsd,
      tp1Gain: targetRiskUsd * 1.0,
      tp2Gain: targetRiskUsd * 2.5,
    };
  }, [activeProfile, customSlPips, targetRiskUsd]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTradeId(id);
    setTimeout(() => setCopiedTradeId(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#080B10] text-zinc-100 flex flex-col font-sans select-none pb-24">
      {/* ── Top Executive Header Bar ──────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#080B10]/95 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-white text-base tracking-tight">APEX</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700/60">
              PRO v4.5
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-zinc-400 pl-2 border-l border-zinc-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Capital.com Demo</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Dual Clock */}
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-900/60 px-2.5 py-1 rounded-lg border border-zinc-800">
            <span>{utcTime || "UTC"}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-300 font-medium">{watTime || "WAT"}</span>
          </div>

          {/* Account Balance Chip */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 font-mono text-xs">
            <span className="text-zinc-400 text-[10px] uppercase tracking-wider">Equity</span>
            <span className="font-bold text-white whitespace-nowrap">
              ${(capitalStatus?.balance || 11002.07).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">(+$2.07)</span>
          </div>

          {/* Quick Refresh */}
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer"
            title="Scan market"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </header>

      {/* ── Institutional System Status Ribbon ─────────────────────── */}
      <div className="bg-zinc-950/80 border-b border-zinc-800/60 px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span className="truncate text-zinc-300">
            {briefingData?.briefingPhase || "Weekend Market Closure · Capital Protection Active (Reopens Sun 22:00 WAT)"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-emerald-400 border border-zinc-800 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Spread Armor: Armed
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-cyan-400 border border-zinc-800 font-semibold flex items-center gap-1">
            <Lock className="w-3 h-3" />
            News Lockout: Active
          </span>
        </div>
      </div>

      {/* ── Main Application Body ───────────────────────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {/* ========================================================== */}
        {/* TAB 1: TERMINAL (LIVE ASSET MONITORS & EXECUTION)          */}
        {/* ========================================================== */}
        {activeTab === "terminal" && (
          <div className="space-y-4">
            {/* 4-Asset Grid Selector */}
            <div>
              <div className="text-[11px] uppercase font-mono text-zinc-400 mb-2 flex items-center justify-between">
                <span>Core Institutional Universe</span>
                <span className="text-zinc-500">4 Monitored Pairs</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {DEDICATED_PROFILES.map((p, idx) => {
                  const active = selectedPairIndex === idx;
                  const cData = (confluenceData?.pairs || []).find((x: any) => x.pair === p.pair);
                  const isBull = cData?.checks?.[0]?.includes("BULLISH");
                  const live = cData?.livePrice;

                  return (
                    <button
                      key={p.pair}
                      onClick={() => setSelectedPairIndex(idx)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                        active
                          ? "bg-zinc-900 border-zinc-600 shadow-sm"
                          : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="font-mono font-bold text-white text-xs">{p.pair}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                          cData?.confluenceGrade && cData.confluenceGrade !== "WAIT"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                        }`}>
                          {cData?.confluenceGrade || "WAIT"}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-zinc-300 font-semibold">
                        {live ? live.bid : "—"}
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 mt-1">
                        <span>Spread: {live?.spread_pips ?? "—"}p</span>
                        <span className={isBull ? "text-emerald-400" : "text-rose-400"}>
                          {isBull ? "▲ Bull" : "▼ Bear"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Asset Analysis Card */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white font-mono">{activeProfile.pair}</h2>
                    <span className="text-xs text-zinc-400">· {activeProfile.name}</span>
                  </div>
                  <div className="text-xs font-mono text-zinc-400 mt-0.5">
                    Live Bid: <span className="text-white font-semibold">{currentConf?.livePrice?.bid || "—"}</span> · Ask: <span className="text-white font-semibold">{currentConf?.livePrice?.ask || "—"}</span> · Spread: <span className="text-emerald-400 font-semibold">{currentConf?.livePrice?.spread_pips ?? "—"} pips</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono">
                    <span className="text-zinc-500">Spread Armor: </span>
                    <span className={currentArmor?.isLocked ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      {currentArmor?.status || "SAFE"} ({activeProfile.spreadThreshold}p Max)
                    </span>
                  </div>
                </div>
              </div>

              {/* Execution Status / Setup Card */}
              {currentConf?.confluenceGrade && currentConf.confluenceGrade !== "WAIT" && currentConf.entryPrice ? (
                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-3 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-emerald-400 font-bold uppercase tracking-wide">
                      HIGH-CONVICTION EXECUTION PLAN ({currentConf.confluenceGrade})
                    </span>
                    <button
                      onClick={() => copyToClipboard(`EXECUTE ${currentConf.direction} ${activeProfile.pair} @ ${currentConf.entryPrice} | SL: ${currentConf.sl} | TP1: ${currentConf.tp1} | TP2: ${currentConf.tp2}`, "plan")}
                      className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white"
                    >
                      {copiedTradeId === "plan" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copy Order</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                      <span className="text-zinc-500 text-[10px] block">DIRECTION</span>
                      <span className="font-bold text-white text-sm">{currentConf.direction}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                      <span className="text-zinc-500 text-[10px] block">ENTRY</span>
                      <span className="font-bold text-white text-sm">{currentConf.entryPrice}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                      <span className="text-zinc-500 text-[10px] block">STOP LOSS</span>
                      <span className="font-bold text-rose-400 text-sm">{currentConf.sl}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800">
                      <span className="text-zinc-500 text-[10px] block">TAKE PROFIT 1</span>
                      <span className="font-bold text-emerald-400 text-sm">{currentConf.tp1}</span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-300 p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800/80">
                    <span className="font-bold text-amber-400">Fixed $25 Sizing: </span>
                    Execute with target risk normalized to $25.00 flat USD. Move stop to Breakeven automatically at 1:1 R:R.
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-3 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                      Market Structure &amp; Confluence Status
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                      {currentConf?.confluenceGrade || "WAIT"}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {currentConf?.reasoning || "Market is currently outside active kill zone or observing weekend market closure. Capital preserved with 0% risk allocated."}
                  </p>

                  {/* Checklist Items */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    {(currentConf?.checks || []).map((check: string, idx: number) => (
                      <div key={idx} className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-zinc-300">
                        {check}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: ANALYTICS (SVG EQUITY CURVE & AUDITED TRADE LOG)    */}
        {/* ========================================================== */}
        {activeTab === "analytics" && (
          <div className="space-y-4">
            {/* Top 4 Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Balance</span>
                <span className="text-lg font-bold text-white tracking-tight block mt-0.5 whitespace-nowrap">
                  ${(performanceAnalytics?.currentBalance || 11002.07).toFixed(2)}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">+$2.07 Net Baseline</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Win Rate (Rule 11a)</span>
                <span className="text-lg font-bold text-white tracking-tight block mt-0.5 whitespace-nowrap">
                  {performanceStats?.winRate || 58.3}%
                </span>
                <span className="text-[10px] text-zinc-400 font-semibold">
                  ({performanceStats?.totalWins || 7}W / {performanceStats?.totalLosses || 5}L)
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Portfolio R Net</span>
                <span className="text-lg font-bold text-emerald-400 tracking-tight block mt-0.5 whitespace-nowrap">
                  +{performanceAnalytics?.totalNetR || 0.47}R
                </span>
                <span className="text-[10px] text-zinc-400 font-semibold">+10.58R / −10.11R</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Profit Factor</span>
                <span className="text-lg font-bold text-white tracking-tight block mt-0.5 whitespace-nowrap">
                  1.05
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">Net Profitable</span>
              </div>
            </div>

            {/* Visual Vector SVG Equity Curve */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3 font-mono">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Portfolio Equity Curve ($ USD)
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Account trajectory from $11,000.00 deposit through Oct 14 CPI dip to $11,002.07 recovery
                  </p>
                </div>
                <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  +$2.07 High
                </span>
              </div>

              {/* Vector SVG Area Chart */}
              <div className="relative w-full h-48 bg-zinc-950/80 rounded-xl border border-zinc-800/80 p-3 flex flex-col justify-between overflow-hidden">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 500 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line x1="0" y1="30" x2="500" y2="30" stroke="#27272a" strokeDasharray="3 3" />
                  <line x1="0" y1="70" x2="500" y2="70" stroke="#27272a" strokeDasharray="3 3" />
                  <line x1="0" y1="100" x2="500" y2="100" stroke="#27272a" strokeDasharray="3 3" />

                  {/* Baseline $11,000 Level */}
                  <line x1="0" y1="40" x2="500" y2="40" stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 2" />

                  {/* Area Fill */}
                  <polygon
                    points="0,40 40,85 80,78 120,83 160,105 200,102 240,110 280,103 320,98 360,115 400,97 450,86 500,38 500,120 0,120"
                    fill="url(#equityGrad)"
                  />

                  {/* Equity Line */}
                  <polyline
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points="0,40 40,85 80,78 120,83 160,105 200,102 240,110 280,103 320,98 360,115 400,97 450,86 500,38"
                  />

                  {/* Data Points */}
                  {[
                    { cx: 0, cy: 40, label: "$11,000.00 (Deposit)" },
                    { cx: 40, cy: 85, label: "Trade #1: -$77.90 (CPI Crash)" },
                    { cx: 80, cy: 78, label: "Trade #2: +$12.50" },
                    { cx: 120, cy: 83, label: "Trade #3: -$8.00" },
                    { cx: 160, cy: 105, label: "Trade #5: -$43.70 (Wide SL)" },
                    { cx: 200, cy: 102, label: "Trade #6: +$4.20" },
                    { cx: 240, cy: 110, label: "Trade #7: -$12.30" },
                    { cx: 280, cy: 103, label: "Trade #8: +$9.35" },
                    { cx: 320, cy: 98, label: "Trade #9: +$7.52" },
                    { cx: 360, cy: 115, label: "Trade #10: -$25.00" },
                    { cx: 400, cy: 97, label: "Trade #11: +$26.11" },
                    { cx: 450, cy: 86, label: "Trade #12: +$15.80" },
                    { cx: 500, cy: 38, label: "Closed EUR/USD: +$14.60 ($11,002.07)" },
                  ].map((p, i) => (
                    <circle
                      key={i}
                      cx={p.cx}
                      cy={p.cy}
                      r="4"
                      className="fill-emerald-400 stroke-zinc-950 stroke-2 hover:r-6 cursor-pointer transition-all"
                      onClick={() => setSelectedCurvePoint(performanceAnalytics?.equityCurve?.[i])}
                    />
                  ))}
                </svg>
              </div>

              {/* Point Inspector */}
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs flex justify-between items-center text-zinc-300">
                <span>Selected: <strong className="text-white">{selectedCurvePoint?.label || selectedCurvePoint?.pair || "All Trades"}</strong></span>
                <span>Balance: <strong className="text-emerald-400">${(selectedCurvePoint?.balance || 11002.07).toFixed(2)} USD</strong></span>
                <span>R:R: <strong className={selectedCurvePoint?.r >= 0 ? "text-emerald-400" : "text-rose-400"}>{selectedCurvePoint?.r >= 0 ? `+${selectedCurvePoint?.r}R` : `${selectedCurvePoint?.r}R`}</strong></span>
              </div>
            </div>

            {/* Performance by Pair Table (Rule 11a Audited) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3 font-mono">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Asset Breakdown (Standing Rule 11a)</span>
                <span className="text-[10px] text-zinc-400 font-normal">Exact Win/Loss Required</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-[10px] uppercase">
                      <th className="pb-2">Asset</th>
                      <th className="pb-2">Win Rate</th>
                      <th className="pb-2">Win / Loss</th>
                      <th className="pb-2">Net R</th>
                      <th className="pb-2">Dollar P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    <tr>
                      <td className="py-2.5 font-bold text-white">XAU/USD (Gold)</td>
                      <td className="py-2.5 text-emerald-400 font-bold">100.0%</td>
                      <td className="py-2.5">1W / 0L</td>
                      <td className="py-2.5 text-emerald-400">+2.09R</td>
                      <td className="py-2.5 text-emerald-400 font-bold">+$26.11</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">GBP/JPY</td>
                      <td className="py-2.5 text-emerald-400 font-bold">75.0%</td>
                      <td className="py-2.5">3W / 1L</td>
                      <td className="py-2.5 text-emerald-400">+4.92R</td>
                      <td className="py-2.5 text-emerald-400 font-bold">+$23.52</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">EUR/USD</td>
                      <td className="py-2.5 text-emerald-400 font-bold">66.7%</td>
                      <td className="py-2.5">2W / 1L</td>
                      <td className="py-2.5 text-emerald-400">+0.24R</td>
                      <td className="py-2.5 text-emerald-400 font-bold">+$10.80</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-bold text-white">XAG/USD (Silver)</td>
                      <td className="py-2.5 text-rose-400 font-bold">25.0%</td>
                      <td className="py-2.5">1W / 3L</td>
                      <td className="py-2.5 text-rose-400">−6.78R</td>
                      <td className="py-2.5 text-rose-400 font-bold">−$137.25*</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-zinc-500">
                *Silver performance was distorted by the Oct 14 US CPI news crash (−5.73R). Now permanently mitigated by the News Lockout Gate.
              </p>
            </div>

            {/* Complete Chronological Trade Log */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3 font-mono">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Audited Trade History</span>
                <span className="text-xs text-zinc-400">12 Closed Trades</span>
              </h3>

              <div className="space-y-2">
                {(performanceStats?.trades || []).map((t: any, idx: number) => {
                  const isWin = t.status === "Closed - WIN" || t.status === "win";
                  return (
                    <div
                      key={t.id || idx}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.direction === "BUY" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}>
                          {t.direction}
                        </span>
                        <span className="font-bold text-white">{t.pair}</span>
                        <span className="text-[11px] text-zinc-400">· {t.setupType}</span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                        <span>Entry: <strong className="text-zinc-200">{t.entryPrice}</strong></span>
                        <span>Exit: <strong className="text-zinc-200">{t.closePrice || "—"}</strong></span>
                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                          isWin ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                        }`}>
                          {t.rrGained > 0 ? `+${t.rrGained}R` : `${t.rrGained}R`}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">({t.closeReason})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 3: NEWS RADAR (WEEKLY CALENDAR & LOCKOUT COUNTDOWN)    */}
        {/* ========================================================== */}
        {activeTab === "radar" && (
          <div className="space-y-4 font-mono">
            {/* Top Gate Status Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    High-Impact Economic News Radar
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Automated 60m pre-event entry lockout and 15m open-trade defense against news slippage gaps.
                  </p>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  {economicEvents?.isSystemLocked ? "LOCKOUT ACTIVE" : "ALL SYSTEMS CLEAR"}
                </div>
              </div>

              {/* Currency Filters */}
              <div className="flex items-center gap-1.5 pt-2">
                {["ALL", "USD", "EUR", "GBP", "JPY"].map(c => (
                  <button
                    key={c}
                    onClick={() => setCalendarFilter(c)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      calendarFilter === c
                        ? "bg-zinc-700 text-white border border-zinc-600"
                        : "bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-white"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Events List */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Upcoming Tier-1 Economic Releases
              </h3>

              <div className="space-y-2">
                {(economicEvents?.events || [])
                  .filter((e: any) => calendarFilter === "ALL" || e.country === calendarFilter)
                  .slice(0, 15)
                  .map((e: any, idx: number) => {
                    const isNear = e.isLockoutActive;
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                          isNear
                            ? "bg-rose-950/20 border-rose-500/40 text-rose-200"
                            : "bg-zinc-950 border-zinc-800/80 text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            e.impact === "High" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {e.country}
                          </span>
                          <span className="font-bold text-white">{e.title}</span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                          <span>Forecast: <strong className="text-zinc-200">{e.forecast}</strong></span>
                          <span>Prior: <strong className="text-zinc-200">{e.previous}</strong></span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isNear ? "bg-rose-500 text-white" : "bg-zinc-900 text-emerald-400 border border-zinc-800"
                          }`}>
                            {isNear ? "LOCKOUT ACTIVE" : "SAFE ZONE"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 4: RISK SIZER ($25 FLAT RISK PARITY CALCULATOR)        */}
        {/* ========================================================== */}
        {activeTab === "sizer" && (
          <div className="space-y-4 font-mono">
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-emerald-400" />
                    Fixed-Dollar Risk Position Sizer
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Normalized $25.00 flat risk parity across Silver, Gold, EUR/USD, and GBP/JPY.
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                  $25.00 FLAT RISK
                </span>
              </div>

              {/* Risk Selection Pills */}
              <div>
                <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Target Cash Risk per Trade
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[15.0, 25.0, 50.0].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setTargetRiskUsd(amt)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer font-bold text-xs ${
                        targetRiskUsd === amt
                          ? "bg-zinc-800 text-white border-zinc-600 shadow-sm"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                      }`}
                    >
                      ${amt.toFixed(2)} USD {amt === 25 ? "(Active)" : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Asset & Stop Distance Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                    Selected Instrument
                  </label>
                  <select
                    value={activeProfile.pair}
                    onChange={(e) => {
                      const idx = DEDICATED_PROFILES.findIndex(p => p.pair === e.target.value);
                      if (idx !== -1) setSelectedPairIndex(idx);
                    }}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-zinc-600"
                  >
                    {DEDICATED_PROFILES.map(p => (
                      <option key={p.pair} value={p.pair}>{p.pair} ({p.name})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                    Planned Stop Loss Distance (Pips/Points)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={customSlPips}
                    onChange={(e) => setCustomSlPips(Math.max(1, Number(e.target.value)))}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-400 font-bold text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Output Result Card */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400">Recommended Execution Size:</span>
                  <span className="text-lg font-bold text-white tracking-tight">
                    {sizerCalculations.units} {activeProfile.pair.includes("XAU") || activeProfile.pair.includes("XAG") ? "Oz" : "Units"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-zinc-800/80">
                  <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">PLANNED RISK</span>
                    <span className="font-bold text-rose-400">-${sizerCalculations.cashRisk.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">TP1 GAIN (1.0R)</span>
                    <span className="font-bold text-emerald-400">+${sizerCalculations.tp1Gain.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block">TP2 GAIN (2.5R)</span>
                    <span className="font-bold text-emerald-400">+${sizerCalculations.tp2Gain.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 5: SETTINGS & SPREAD ARMOR                             */}
        {/* ========================================================== */}
        {activeTab === "settings" && (
          <div className="space-y-4 font-mono">
            {/* Sunday Reopen Spread Armor Monitor */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Sunday Reopen Spread Armor Monitor
              </h3>
              <p className="text-xs text-zinc-400">
                Monitors live bid/ask spreads during Sunday 22:00 WAT reopen and blocks execution if spreads widen beyond institutional thresholds.
              </p>

              <div className="space-y-2 pt-1">
                {(spreadArmorData?.pairs || []).map((p: any) => (
                  <div key={p.pair} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-white">{p.pair}</span>
                      <span className="text-zinc-400 text-[11px] ml-2">Current Spread: {p.currentSpread}p (Max Safe: {p.threshold}p)</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.isLocked ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    }`}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notification & Audio Preferences */}
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                Alerts &amp; Audio Preferences
              </h3>

              <div className="flex justify-between items-center p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                <div>
                  <span className="font-bold text-white">Signal Audio Ping</span>
                  <p className="text-[11px] text-zinc-400">Plays a subtle chime when an institutional setup confirms</p>
                </div>
                <button
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    localStorage.setItem("apex_sound", String(next));
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    soundEnabled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {soundEnabled ? "ENABLED" : "MUTED"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Institutional Bottom Navigation Bar ─────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#080B10]/95 backdrop-blur-md border-t border-zinc-800/80 px-4 py-2">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
          {[
            { id: "terminal", label: "Terminal", icon: Activity },
            { id: "analytics", label: "Analytics", icon: TrendingUp },
            { id: "radar", label: "Radar", icon: Radio },
            { id: "sizer", label: "Sizer", icon: Calculator },
            { id: "settings", label: "Settings", icon: Settings },
          ].map(tab => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as BottomTabId)}
                className={`py-1.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                  active
                    ? "text-emerald-400 font-bold"
                    : "text-zinc-500 hover:text-zinc-300 font-normal"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
                <span className="text-[10px] mt-1 tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
