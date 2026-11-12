import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  Activity,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
  Zap,
  Radio,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  Info,
  DollarSign,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  RadialGauge,
  formatPairPrice,
  formatUSD,
} from "../ui";
import { LiveCandleChart } from "../LiveCandleChart";

export interface InstrumentWorkstationProps {
  pair: string;
  pairName: string;
  category?: string;
  pipSize?: number;
  spreadThreshold?: number;
  confluenceRecord: any;
  spreadArmorData: any;
  capitalStatus: any;
  economicEvents: any;
  scannedAt?: string;
  onBack: () => void;
  onAuditConfluence?: (pair: string) => void;
}

export const InstrumentWorkstationView: React.FC<InstrumentWorkstationProps> = ({
  pair,
  pairName,
  category = "Core Institutional",
  pipSize = 0.0001,
  spreadThreshold = 2.0,
  confluenceRecord,
  spreadArmorData,
  capitalStatus,
  economicEvents,
  scannedAt,
  onBack,
  onAuditConfluence,
}) => {
  const [chartTimeframe, setChartTimeframe] = useState<"M15" | "H1" | "H4">("M15");

  // Pair-specific spread armor status from /api/spread-armor
  const armorItem = useMemo(() => {
    return (spreadArmorData?.pairs || []).find((p: any) => p.pair === pair);
  }, [spreadArmorData, pair]);

  // Live prices from backend
  const livePrice = confluenceRecord?.livePrice;
  const curBid = livePrice?.bid ?? null;
  const curAsk = livePrice?.ask ?? null;
  const curSpread = livePrice?.spread_pips ?? null;

  // Market Data Freshness State based on genuine backend timestamp
  const freshness = useMemo(() => {
    if (curBid == null && curAsk == null) {
      return {
        status: "unavailable" as const,
        label: "Data Unavailable",
        color: "text-zinc-500",
        dot: "bg-zinc-600",
      };
    }
    const timestamp = confluenceRecord?.scannedAt || scannedAt;
    if (!timestamp) {
      return {
        status: "live" as const,
        label: "Capital.com Feed",
        color: "text-emerald-400",
        dot: "bg-emerald-400",
      };
    }
    const diffMs = Date.now() - new Date(timestamp).getTime();
    if (isNaN(diffMs) || diffMs < 0) {
      return {
        status: "live" as const,
        label: "Live Feed",
        color: "text-emerald-400",
        dot: "bg-emerald-400",
      };
    }
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec <= 90) {
      return {
        status: "live" as const,
        label: `Live (${diffSec}s ago)`,
        color: "text-emerald-400",
        dot: "bg-emerald-400 animate-pulse",
      };
    } else if (diffSec <= 300) {
      const mins = Math.floor(diffSec / 60);
      return {
        status: "delayed" as const,
        label: `Delayed (${mins}m ago)`,
        color: "text-amber-400",
        dot: "bg-amber-400",
      };
    } else {
      const mins = Math.floor(diffSec / 60);
      return {
        status: "stale" as const,
        label: `Stale Feed (${mins}m ago)`,
        color: "text-rose-400",
        dot: "bg-rose-400",
      };
    }
  }, [curBid, curAsk, confluenceRecord?.scannedAt, scannedAt]);

  // Confluence breakdown & grade from genuine backend calculation
  const score = confluenceRecord?.score ?? null;
  const grade = confluenceRecord?.confluenceGrade || "WAIT";
  const isQualified = (grade === "A+" || grade === "A") && score != null && score >= 80;
  const isArmorLocked = armorItem?.isLocked ?? false;

  const breakdown = confluenceRecord?.scoreBreakdown || null;

  // Name-based lookup of backend check diagnostics (avoids fragile array indexing)
  const checksList: string[] = confluenceRecord?.checks || [];
  const trendCheck = useMemo(() => {
    return checksList.find((c) => c.includes("Macro H1 Trend")) || null;
  }, [checksList]);

  const sweepCheck = useMemo(() => {
    return checksList.find((c) => c.includes("Liquidity Sweep")) || null;
  }, [checksList]);

  const sessionCheck = useMemo(() => {
    return checksList.find((c) => c.includes("Session Window")) || null;
  }, [checksList]);

  const displacementCheck = useMemo(() => {
    return checksList.find((c) => c.includes("Rejection Power")) || null;
  }, [checksList]);

  const riskCheck = useMemo(() => {
    return checksList.find((c) => c.includes("Spread & Volatility")) || null;
  }, [checksList]);

  const isBull = trendCheck?.includes("BULLISH") ?? false;
  const isBear = trendCheck?.includes("BEARISH") ?? false;

  const rawEngineName = confluenceRecord?.gradeAEngine || "Trend Sweep";
  const cleanEngineName = rawEngineName.replace(/\s*\([^\)]*\)\s*/g, "").trim() || "Trend Sweep";

  // 20-bar Structural extremes
  const m15High = confluenceRecord?.m15High ?? null;
  const m15Low = confluenceRecord?.m15Low ?? null;
  const rangePips =
    m15High != null && m15Low != null && pipSize > 0
      ? Math.round(((m15High - m15Low) / pipSize) * 10) / 10
      : null;

  // Liquidity mapping: Only label as BSL/SSL when supported by backend sweep output
  const isHighSwept = sweepCheck
    ? sweepCheck.toUpperCase().includes("SELL SWEEP") || sweepCheck.toUpperCase().includes("HIGH SWEEP")
    : false;
  const isLowSwept = sweepCheck
    ? sweepCheck.toUpperCase().includes("BUY SWEEP") || sweepCheck.toUpperCase().includes("LOW SWEEP")
    : false;

  const highLabel = isHighSwept ? "20-Bar High (BSL Swept)" : "20-Bar High";
  const lowLabel = isLowSwept ? "20-Bar Low (SSL Swept)" : "20-Bar Low";

  // Active broker position check from /api/capital/status
  const activePosition = useMemo(() => {
    return (capitalStatus?.openPositions || []).find((p: any) => {
      const pPair = p.pair || p.market?.symbol || p.market?.epic || "";
      const cleanPair = pair.replace("/", "");
      const cleanPPair = pPair.replace("/", "");
      if (cleanPair === cleanPPair) return true;
      if (pair === "XAU/USD" && (pPair === "GOLD" || pPair === "XAUUSD")) return true;
      if (pair === "XAG/USD" && (pPair === "SILVER" || pPair === "XAGUSD")) return true;
      return false;
    });
  }, [capitalStatus, pair]);

  // Genuine Tier-1 news lockout check from /api/economic-calendar
  const newsRestriction = useMemo(() => {
    const currencies = pair.split("/");
    const events = economicEvents?.events || [];
    const now = Date.now();
    for (const e of events) {
      if (currencies.includes(e.currency) && (e.impact === "High" || e.impact === "Tier-1")) {
        const eventTime = new Date(e.timestamp).getTime();
        const diffMins = (eventTime - now) / (60 * 1000);
        // Established lockout rule: 60 mins before to 15 mins after
        if (diffMins >= -15 && diffMins <= 60) {
          return {
            isRestricted: true,
            eventTitle: e.title,
            currency: e.currency,
            minsLeft: Math.round(diffMins),
          };
        }
      }
    }
    return { isRestricted: false };
  }, [pair, economicEvents]);

  const unitLabel = pair.includes("XAU") || pair.includes("XAG") ? "Oz" : "Units";

  return (
    <div className="space-y-4 font-mono select-none animate-in fade-in slide-in-from-right-3 duration-200">
      {/* ── Top Workstation Navigation & Instrument Breadcrumbs ──── */}
      <div className="flex items-center justify-between gap-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group shrink-0 whitespace-nowrap"
          title="Return to Terminal Cockpit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform shrink-0" />
          <span className="font-semibold whitespace-nowrap">Terminal</span>
          <span className="text-zinc-600">/</span>
          <span className="text-emerald-400 font-bold whitespace-nowrap">{pair}</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Badge variant="neutral" size="xs" className="whitespace-nowrap shrink-0">
            {category}
          </Badge>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 whitespace-nowrap shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot} shrink-0`} />
            <span className={freshness.color}>{freshness.label}</span>
          </div>
        </div>
      </div>

      {/* ── 1. Comprehensive Instrument Header Card ─────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-tight whitespace-nowrap shrink-0">{pair}</h1>
              <span className="text-xs text-zinc-400 font-sans truncate">· {pairName}</span>
              <Badge variant="neutral" size="xs" className="shrink-0 whitespace-nowrap">
                {cleanEngineName}
              </Badge>
            </div>

            {/* Bid / Ask / Spread Depth */}
            <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-2 tabular-nums">
              <span>
                Bid: <strong className="text-white font-bold">{curBid != null ? formatPairPrice(pair, curBid) : "—"}</strong>
              </span>
              <span className="text-zinc-600">·</span>
              <span>
                Ask: <strong className="text-white font-bold">{curAsk != null ? formatPairPrice(pair, curAsk) : "—"}</strong>
              </span>
              <span className="text-zinc-600">·</span>
              <span>
                Spread:{" "}
                <strong className={isArmorLocked ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                  {curSpread != null ? `${curSpread} pips` : "—"}
                </strong>
              </span>
            </div>
          </div>

          {/* Armor Status & Bias Pill */}
          <div className="flex items-center gap-2">
            <Badge
              variant={isArmorLocked ? "danger" : "success"}
              size="sm"
              dot
            >
              Spread Armor: {armorItem?.status || (isArmorLocked ? "LOCKED" : "SAFE")}
            </Badge>

            <span
              className={`px-2 py-1 rounded-lg text-xs font-bold border flex items-center gap-1 ${
                isBull
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : isBear
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  : "bg-zinc-800 text-zinc-300 border-zinc-700"
              }`}
            >
              {isBull ? <TrendingUp className="w-3 h-3" /> : isBear ? <TrendingDown className="w-3 h-3" /> : null}
              {isBull ? "BULLISH BIAS" : isBear ? "BEARISH BIAS" : "NEUTRAL RANGE"}
            </span>
          </div>
        </div>

        {/* 20-Bar Structural Extremes Micro-Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">{lowLabel}</span>
            <span className="font-bold text-white tabular-nums mt-0.5 block">
              {m15Low != null ? formatPairPrice(pair, m15Low) : "—"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">{highLabel}</span>
            <span className="font-bold text-white tabular-nums mt-0.5 block">
              {m15High != null ? formatPairPrice(pair, m15High) : "—"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">20-Bar Range</span>
            <span className="font-bold text-cyan-400 tabular-nums mt-0.5 block">
              {rangePips != null ? `${rangePips} pips` : "—"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Max Safe Tolerance</span>
            <span className="font-bold text-zinc-300 tabular-nums mt-0.5 block">
              {spreadThreshold} pips
            </span>
          </div>
        </div>
      </Card>

      {/* ── 2. Interactive TradingView Candlestick Chart ──────────── */}
      <Card variant="default" padding="sm" className="space-y-2">
        <div className="flex items-center justify-between px-2 pt-1 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
              {pair} TradingView Engine
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 shrink-0 whitespace-nowrap">
            Zoom / Pan Active
          </span>
        </div>

        <LiveCandleChart
          pair={pair}
          timeframe={chartTimeframe}
          onTimeframeChange={setChartTimeframe}
          entryPrice={confluenceRecord?.entryPrice}
          slPrice={confluenceRecord?.sl}
          tpPrice={confluenceRecord?.tp1}
          sweepPrice={confluenceRecord?.sweptLevel || null}
        />
      </Card>

      {/* ── 3. Active Position Status for this Instrument ─────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Active Broker Position ({pair})
            </h3>
          </div>
          <Badge variant={activePosition ? "success" : "neutral"} size="xs">
            {activePosition ? "OPEN ON CAPITAL.COM" : "NO OPEN POSITION"}
          </Badge>
        </div>

        {activePosition ? (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/20 via-[#0E131A] to-emerald-950/20 border border-emerald-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={activePosition.direction === "BUY" ? "buy" : "sell"} size="sm">
                  {activePosition.direction === "BUY" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {activePosition.direction}
                </Badge>
                <span className="font-bold text-white text-sm">
                  {activePosition.size} {unitLabel}
                </span>
                {activePosition.stopLevel === activePosition.entryPrice && (
                  <Badge variant="success" size="xs">
                    STOP AT BREAKEVEN
                  </Badge>
                )}
              </div>

              <div className="text-right">
                <span
                  className={`text-base font-black tabular-nums ${
                    Number(activePosition.upl) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {Number(activePosition.upl) >= 0 ? `+${formatUSD(activePosition.upl)}` : formatUSD(activePosition.upl)}
                </span>
                <span className="text-[10px] text-zinc-500 block uppercase">Floating P&amp;L</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Entry Fill Price</span>
                <span className="font-bold text-white tabular-nums mt-0.5 block">
                  {formatPairPrice(pair, activePosition.entryPrice)}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Stop Loss (SL)</span>
                <span className="font-bold text-rose-400 tabular-nums mt-0.5 block">
                  {activePosition.stopLevel != null ? formatPairPrice(pair, activePosition.stopLevel) : "None"}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-zinc-500 uppercase block">Take Profit (TP)</span>
                <span className="font-bold text-emerald-400 tabular-nums mt-0.5 block">
                  {activePosition.profitLevel != null ? formatPairPrice(pair, activePosition.profitLevel) : "None"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#111721] border border-[#1A222F] text-center space-y-1 py-5">
            <span className="text-xs text-zinc-400 font-sans block">
              No active broker position on {pair}.
            </span>
            <span className="text-[11px] text-zinc-500 font-sans block">
              Market entries remain gated by confluence and spread armor criteria.
            </span>
          </div>
        )}
      </Card>

      {/* ── 4. Smart Money Market Structure & 20-Bar Extremes ─────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Market Structure Card */}
        <Card variant="default" padding="md" className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Market Structure Analysis
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              M15 / H1 Alignment
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Macro Trend Regime:</span>
              <span className={`font-bold ${isBull ? "text-emerald-400" : isBear ? "text-rose-400" : "text-zinc-300"}`}>
                {trendCheck ? trendCheck.replace(/^\[OK\] |^\[INFO\] /i, "") : "EMA10 vs EMA20 Scan"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Primary SMC Model:</span>
              <span className="text-cyan-400 font-bold">{cleanEngineName}</span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Structural Status:</span>
              <span className="text-zinc-200">
                {sweepCheck ? sweepCheck.replace(/^\[OK\] |^\[INFO\] /i, "") : "Monitoring 20-Bar Range"}
              </span>
            </div>
          </div>
        </Card>

        {/* 20-Bar Structural Extremes & Liquidity Status */}
        <Card variant="default" padding="md" className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                20-Bar Structural Extremes &amp; Liquidity
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              Swing Extremes
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <div>
                <span className="font-bold text-zinc-200 block">{highLabel}</span>
                <span className="text-[10px] text-zinc-500 font-sans">
                  {isHighSwept ? "Confirmed institutional sweep above high" : "Rolling 20-bar swing high extreme"}
                </span>
              </div>
              <span className="font-bold text-white tabular-nums">
                {m15High != null ? formatPairPrice(pair, m15High) : "—"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <div>
                <span className="font-bold text-zinc-200 block">{lowLabel}</span>
                <span className="text-[10px] text-zinc-500 font-sans">
                  {isLowSwept ? "Confirmed institutional sweep below low" : "Rolling 20-bar swing low extreme"}
                </span>
              </div>
              <span className="font-bold text-white tabular-nums">
                {m15Low != null ? formatPairPrice(pair, m15Low) : "—"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Rejection Power:</span>
              <span className="text-purple-400 font-bold">
                {displacementCheck ? displacementCheck.replace(/^\[OK\] |^\[INFO\] /i, "") : "Normal Candle Displacement"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 5. Five-Pillar Confluence Scoring Breakdown ───────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Confluence Scoring Matrix (100-Point Audit)
              </h3>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
              Algorithmic execution gating strictly requires ≥ 80% confluence score to open an order.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded border inline-block ${
                isQualified
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : isArmorLocked
                  ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/30"
              }`}
            >
              {isQualified ? "QUALIFIED SETUP (≥80%)" : isArmorLocked ? "BLOCKED BY SPREAD" : "UNQUALIFIED / STANDBY"}
            </span>
          </div>
        </div>

        {/* Central Radial Score Display */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-4 flex items-center justify-center p-3 rounded-2xl bg-[#111721] border border-[#1A222F]">
            <RadialGauge
              score={score ?? 0}
              grade={grade}
              label="Confluence Score"
              size={96}
              strokeWidth={8}
            />
          </div>

          {/* Reasoning & Narrative */}
          <div className="md:col-span-8 p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Smart Money Engine Diagnostic Narrative
            </div>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {confluenceRecord?.reasoning ||
                confluenceRecord?.aiReasoning?.narrative ||
                "Smart Money is monitoring 20-bar structural boundaries. Capital strictly preserved with 0% risk allocated."}
            </p>
            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 pt-1 border-t border-zinc-800/80">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Verdict: {confluenceRecord?.aiReasoning?.verdict || "Stand by for confirmed structural break"}</span>
            </div>
          </div>
        </div>

        {/* The 5 Categories Breakdown Grid (Displays backend scores without recalculation) */}
        {breakdown ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
            {/* Category 1: Trend (Max 25 pts) */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">1. Trend</span>
                <span className="font-bold text-white">{breakdown.trend}/25</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${(Math.min(25, breakdown.trend) / 25) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 truncate block">H1 Macro EMA</span>
            </div>

            {/* Category 2: Liquidity Sweep (Max 25 pts) */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">2. Sweep</span>
                <span className="font-bold text-white">{breakdown.sweep}/25</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${(Math.min(25, breakdown.sweep) / 25) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 truncate block">20-Bar Swing Extremes</span>
            </div>

            {/* Category 3: Session Window (Max 20 pts) */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">3. Session</span>
                <span className="font-bold text-white">{breakdown.session}/20</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${(Math.min(20, breakdown.session) / 20) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 truncate block">Kill Zone Timing</span>
            </div>

            {/* Category 4: Displacement Power (Max 15 pts) */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">4. Displacement</span>
                <span className="font-bold text-white">{breakdown.displacement}/15</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full transition-all duration-500"
                  style={{ width: `${(Math.min(15, breakdown.displacement) / 15) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 truncate block">Rejection Body Ratio</span>
            </div>

            {/* Category 5: Risk Gate & Spread (Max 15 pts) */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5 sm:col-span-2 lg:col-span-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-zinc-400">5. Risk Gate</span>
                <span className="font-bold text-white">{breakdown.risk}/15</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${(Math.min(15, breakdown.risk) / 15) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 truncate block">Spread &amp; Volatility</span>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-[#111721] text-center text-xs text-zinc-500 py-3">
            Confluence scoring breakdown pending active engine scan.
          </div>
        )}

        {/* Verbatim Backend Checks List */}
        {checksList.length > 0 && (
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
              Verbatim Institutional Engine Audits
            </span>
            {checksList.map((chk: string, idx: number) => {
              const isOk = chk.startsWith("[OK]");
              const isScore = chk.startsWith("[SCORE]");
              return (
                <div
                  key={idx}
                  className={`text-[11px] font-mono flex items-center gap-1.5 ${
                    isOk ? "text-emerald-400" : isScore ? "text-cyan-400 font-bold" : "text-zinc-400"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                  <span>{chk}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Full-Screen Confluence Intelligence Audit Link */}
        {onAuditConfluence && (
          <div className="pt-2 border-t border-[#1E2633]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => onAuditConfluence(pair)}
              icon={<Zap className="w-3.5 h-3.5 text-cyan-400" />}
            >
              AUDIT FULL CONFLUENCE GATES →
            </Button>
          </div>
        )}
      </Card>

      {/* ── 6. Live Market Conditions & Gating Status ───────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Live Market Conditions &amp; Gating Status
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Institutional Regime
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <div>
              <span className="text-zinc-400 block">Session Status:</span>
              <span className="font-bold text-white mt-0.5 block">
                {sessionCheck ? sessionCheck.replace(/^\[OK\] |^\[INFO\] /i, "") : "Active Order Flow"}
              </span>
            </div>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <div>
              <span className="text-zinc-400 block">Spread Friction:</span>
              <span className={`font-bold mt-0.5 block ${isArmorLocked ? "text-rose-400" : "text-emerald-400"}`}>
                {curSpread != null ? `${curSpread}p (Max Safe: ${spreadThreshold}p)` : "Normal"}
              </span>
            </div>
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <div>
              <span className="text-zinc-400 block">Macro News Lockout:</span>
              <span className={`font-bold mt-0.5 block ${newsRestriction.isRestricted ? "text-rose-400" : "text-emerald-400"}`}>
                {newsRestriction.isRestricted
                  ? `Active (${newsRestriction.eventTitle} in ${newsRestriction.minsLeft}m)`
                  : "Normal (No Imminent Tier-1 Event)"}
              </span>
            </div>
            <Lock className={`w-4 h-4 ${newsRestriction.isRestricted ? "text-rose-400" : "text-zinc-500"}`} />
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <div>
              <span className="text-zinc-400 block">Session Liquidity:</span>
              <span className="text-emerald-400 font-bold mt-0.5 block">24/5 FX &amp; Metals Active</span>
            </div>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
        </div>
      </Card>
    </div>
  );
};
