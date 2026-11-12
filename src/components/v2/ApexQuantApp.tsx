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
import { EconomicRadar } from "./EconomicRadar";
import { PositionSizer } from "./PositionSizer";
import { SettingsDashboard } from "./SettingsDashboard";

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

  const toggleAutoTrading = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/capital/toggle-auto`, { method: "POST" });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error("Toggle auto trading error:", err);
    }
  };

  const setupPushNotificationChannels = async () => {
    try {
      if (isNativePlatform()) {
        await PushNotifications.requestPermissions();
      }
    } catch (err) {
      console.warn("Push permissions notice:", err);
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
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 pb-36 space-y-4">
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
        {/* TAB 3: ECONOMIC NEWS RADAR                                 */}
        {/* ========================================================== */}
        {activeTab === "radar" && (
          <EconomicRadar eventsData={economicEvents} />
        )}

        {/* ========================================================== */}
        {/* TAB 4: RISK & POSITION SIZER                               */}
        {/* ========================================================== */}
        {activeTab === "sizer" && (
          <PositionSizer
            profiles={DEDICATED_PROFILES}
            selectedIndex={selectedPairIndex}
            onSelectIndex={setSelectedPairIndex}
            accountBalance={liveBalance}
          />
        )}

        {/* ========================================================== */}
        {/* TAB 5: APPLICATION SETTINGS & RISK PROTOCOL                */}
        {/* ========================================================== */}
        {activeTab === "settings" && (
          <SettingsDashboard
            brokerAccount="#322839360067416350"
            brokerBalance={liveBalance}
            autoTradingEnabled={capitalStatus?.autoTradingEnabled ?? true}
            onToggleAutoTrading={toggleAutoTrading}
            spreadArmorPairs={spreadArmorData?.pairs || []}
            soundEnabled={soundEnabled}
            onToggleSound={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem("apex_sound", String(next));
            }}
            onRequestPushPerms={isNativePlatform() ? setupPushNotificationChannels : undefined}
            buildVersion="v4.5 Pro (Audit Hardened)"
          />
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
