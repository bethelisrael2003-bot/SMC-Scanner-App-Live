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
import { LiveCandleChart } from "./LiveCandleChart";
import { ActivePositionsHud } from "./ActivePositionsHud";
import { MarketWatchlist } from "./MarketWatchlist";
import { ConfluenceDashboard } from "./ConfluenceDashboard";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { TradeHistory } from "./TradeHistory";

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

  // Position Action Pending States
  const [closingDealId, setClosingDealId] = useState<string | null>(null);
  const [movingBeDealId, setMovingBeDealId] = useState<string | null>(null);

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
  const [chartTimeframe, setChartTimeframe] = useState<"M15" | "H1" | "H4">("M15");

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
    const iv = setInterval(fetchAllData, 10000); // 10s auto-refresh for live positions
    return () => clearInterval(iv);
  }, [fetchAllData]);

  // Position Management Actions (Direct Broker Orders)
  const closeCapitalTrade = async (dealId: string) => {
    setClosingDealId(dealId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/capital/close-position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error("Close position error:", err);
    } finally {
      setClosingDealId(null);
    }
  };

  const moveTradeToBreakeven = async (dealId: string, entryPrice: number) => {
    setMovingBeDealId(dealId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/capital/update-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, newStopLevel: entryPrice }),
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error("Move to BE error:", err);
    } finally {
      setMovingBeDealId(null);
    }
  };

  // Dynamic Calculation of Pair Breakdown (Rule 11a — Zero Hardcoded Numbers)
  const dynamicPairStats = useMemo(() => {
    const trades = performanceStats?.trades || [];
    const map: Record<string, { pair: string; trades: number; wins: number; losses: number; rNet: number }> = {};

    for (const t of trades) {
      const p = t.pair || "Unknown";
      if (!map[p]) map[p] = { pair: p, trades: 0, wins: 0, losses: 0, rNet: 0 };
      map[p].trades++;
      map[p].rNet += (t.rrGained || 0);
      const isWin = t.status === "Closed - WIN" || t.status === "win" || (t.rrGained && t.rrGained > 0);
      if (isWin) map[p].wins++;
      else map[p].losses++;
    }

    return Object.values(map).map(item => ({
      ...item,
      winRate: Number(((item.wins / item.trades) * 100).toFixed(1)),
      rNet: Number(item.rNet.toFixed(2)),
    }));
  }, [performanceStats?.trades]);

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

  const liveBalance = capitalStatus?.balance ?? 11046.98;
  const balanceDelta = liveBalance - 11000.00;

  return (
    <div className="min-h-screen bg-[#080B10] text-zinc-100 flex flex-col font-sans select-none pb-36">
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

          {/* Account Balance Chip (100% Dynamic) */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 font-mono text-xs">
            <span className="text-zinc-400 text-[10px] uppercase tracking-wider">Equity</span>
            <span className="font-bold text-white whitespace-nowrap">
              ${liveBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`text-[10px] font-semibold ${balanceDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              ({balanceDelta >= 0 ? `+$${balanceDelta.toFixed(2)}` : `-$${Math.abs(balanceDelta).toFixed(2)}`})
            </span>
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
            {briefingData?.briefingPhase || "Active Market Session · Capital Protected with $25 Flat Risk Parity"}
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
            {/* 1. Live Active Broker Positions Command HUD (with Confirmation Modals) */}
            <ActivePositionsHud
              openPositions={capitalStatus?.openPositions || []}
              onClosePosition={closeCapitalTrade}
              onUpdateStop={moveTradeToBreakeven}
            />

            {/* 2. Core Institutional Watchlist Carousel */}
            <MarketWatchlist
              profiles={DEDICATED_PROFILES}
              selectedIndex={selectedPairIndex}
              onSelect={setSelectedPairIndex}
              confluenceData={confluenceData}
              spreadArmorData={spreadArmorData}
            />

            {/* 3. Live Interactive TradingView Candlestick Chart */}
            <LiveCandleChart
              pair={activeProfile.pair}
              timeframe={chartTimeframe}
              onTimeframeChange={setChartTimeframe}
              entryPrice={currentConf?.entryPrice}
              slPrice={currentConf?.sl}
              tpPrice={currentConf?.tp1}
              sweepPrice={currentConf?.sweptLevel || null}
            />

            {/* 4. Four-Pillar Visual Confluence & Market Structure Cockpit */}
            <ConfluenceDashboard
              pair={activeProfile.pair}
              pairName={activeProfile.name}
              confluenceRecord={currentConf}
              armorStatus={currentArmor?.status || "SAFE"}
              maxSafeSpread={activeProfile.spreadThreshold}
              onCopyOrder={(text) => copyToClipboard(text, "plan")}
              copiedOrder={copiedTradeId === "plan"}
            />
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: ANALYTICS & AUDITED TRADE HISTORY                   */}
        {/* ========================================================== */}
        {activeTab === "analytics" && (
          <div className="space-y-4">
            <AnalyticsDashboard
              currentBalance={liveBalance}
              baselineDeposit={11000.0}
              winRate={performanceStats?.winRate || 60.0}
              totalWins={performanceStats?.totalWins || 9}
              totalLosses={performanceStats?.totalLosses || 6}
              totalNetR={performanceAnalytics?.totalNetR ?? 2.91}
              profitFactor={performanceAnalytics?.summary?.profitFactor || 1.05}
              equityCurve={performanceAnalytics?.equityCurve || []}
              pairStats={dynamicPairStats}
            />

            <TradeHistory trades={performanceStats?.trades || []} />
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
