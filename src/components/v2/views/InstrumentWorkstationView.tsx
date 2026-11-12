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
  Maximize2,
  DollarSign,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  RadialGauge,
  formatPairPrice,
  formatR,
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
  onBack: () => void;
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
  onBack,
}) => {
  const [chartTimeframe, setChartTimeframe] = useState<"M15" | "H1" | "H4">("M15");

  // Pair-specific spread armor status
  const armorItem = useMemo(() => {
    return (spreadArmorData?.pairs || []).find((p: any) => p.pair === pair);
  }, [spreadArmorData, pair]);

  // Live prices from backend
  const livePrice = confluenceRecord?.livePrice;
  const curBid = livePrice?.bid ?? null;
  const curAsk = livePrice?.ask ?? null;
  const curSpread = livePrice?.spread_pips ?? null;

  // Confluence breakdown and grade
  const score = confluenceRecord?.score ?? 50;
  const grade = confluenceRecord?.confluenceGrade || "WAIT";
  const isQualified = (grade === "A+" || grade === "A") && score >= 80;
  const isArmorLocked = armorItem?.isLocked ?? false;

  const breakdown = confluenceRecord?.scoreBreakdown || {
    trend: 15,
    sweep: 5,
    session: 0,
    displacement: 5,
    risk: 15,
    total: score,
  };

  const isBull = confluenceRecord?.checks?.[0]?.includes("BULLISH") ?? false;
  const isBear = confluenceRecord?.checks?.[0]?.includes("BEARISH") ?? false;
  const engineName = confluenceRecord?.gradeAEngine || "Trend Sweep (🌊)";

  // 20-bar Structural extremes (Liquidity pools)
  const m15High = confluenceRecord?.m15High ?? null;
  const m15Low = confluenceRecord?.m15Low ?? null;
  const rangePips =
    m15High && m15Low && pipSize > 0
      ? Math.round(((m15High - m15Low) / pipSize) * 10) / 10
      : null;

  // Active position on this instrument (if any exists on Capital.com)
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

  // Check if upcoming Tier-1 news affects this instrument
  const newsRestriction = useMemo(() => {
    const currencies = pair.split("/");
    const events = economicEvents?.events || [];
    const now = Date.now();
    for (const e of events) {
      if (currencies.includes(e.currency) && (e.impact === "High" || e.impact === "Tier-1")) {
        const eventTime = new Date(e.timestamp).getTime();
        const diffMins = (eventTime - now) / (60 * 1000);
        // Lockout rule: 60 mins before to 15 mins after
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
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group"
          title="Return to Terminal Cockpit"
        >
          <ChevronLeft className="w-4 h-4 text-emerald-400 group-hover:-translate-x-0.5 transition-transform" />
          <span className="font-semibold">Terminal</span>
          <span className="text-zinc-600">/</span>
          <span className="text-emerald-400 font-bold">{pair}</span>
        </button>

        <div className="flex items-center gap-2">
          <Badge variant="neutral" size="xs">
            {category}
          </Badge>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Capital.com Demo</span>
          </div>
        </div>
      </div>

      {/* ── 1. Comprehensive Instrument Header Card ─────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">{pair}</h1>
              <span className="text-xs text-zinc-400 font-sans">· {pairName}</span>
              <Badge variant="neutral" size="xs">
                {engineName}
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

        {/* Quick Range / Volatility Micro-Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">20-Bar Low (SSL)</span>
            <span className="font-bold text-white tabular-nums mt-0.5 block">
              {m15Low != null ? formatPairPrice(pair, m15Low) : "—"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">20-Bar High (BSL)</span>
            <span className="font-bold text-white tabular-nums mt-0.5 block">
              {m15High != null ? formatPairPrice(pair, m15High) : "—"}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Structural Range</span>
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
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              {pair} TradingView Engine
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            Zoom / Pan Enabled · Crosshairs Active
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
            {activePosition ? "OPEN ON CAPITAL.COM" : "FLAT (ZERO RISK)"}
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
              No active position currently floating on {pair}.
            </span>
            <span className="text-[11px] text-zinc-500 font-sans block">
              Capital is 100% preserved. Autonomous execution will engage when confluence satisfies the 80% threshold.
            </span>
          </div>
        )}
      </Card>

      {/* ── 4. Smart Money Market Structure & Liquidity Intelligence ─ */}
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
                {confluenceRecord?.checks?.[0]?.replace(/^\[OK\] |^\[INFO\] /i, "") || "EMA10 vs EMA20 Scan"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Primary SMC Model:</span>
              <span className="text-cyan-400 font-bold">{engineName}</span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Structural Status:</span>
              <span className="text-zinc-200">
                {confluenceRecord?.checks?.[1]?.replace(/^\[OK\] |^\[INFO\] /i, "") || "Monitoring Range"}
              </span>
            </div>
          </div>
        </Card>

        {/* Liquidity Intelligence Card */}
        <Card variant="default" padding="md" className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Liquidity Intelligence Pools
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              20-Bar Walls
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <div>
                <span className="font-bold text-rose-400 block">Buy-Side Liquidity (BSL)</span>
                <span className="text-[10px] text-zinc-500 font-sans">Resting Buy-Stops above 20-bar high</span>
              </div>
              <span className="font-bold text-white tabular-nums">
                {m15High != null ? formatPairPrice(pair, m15High) : "—"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <div>
                <span className="font-bold text-emerald-400 block">Sell-Side Liquidity (SSL)</span>
                <span className="text-[10px] text-zinc-500 font-sans">Resting Sell-Stops below 20-bar low</span>
              </div>
              <span className="font-bold text-white tabular-nums">
                {m15Low != null ? formatPairPrice(pair, m15Low) : "—"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Rejection Displacement:</span>
              <span className="text-purple-400 font-bold">
                {confluenceRecord?.checks?.[3]?.replace(/^\[OK\] |^\[INFO\] /i, "") || "Candle Ratio Normal"}
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
              score={score}
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

        {/* The 5 Categories Breakdown Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          {/* Category 1: Trend */}
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-zinc-400">1. Trend</span>
              <span className="font-bold text-white">{breakdown.trend}/25</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${(breakdown.trend / 25) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 truncate block">H1 Macro EMA</span>
          </div>

          {/* Category 2: Liquidity Sweep */}
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-zinc-400">2. Sweep</span>
              <span className="font-bold text-white">{breakdown.sweep}/25</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${(breakdown.sweep / 25) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 truncate block">20-Bar Swing Extremes</span>
          </div>

          {/* Category 3: Session */}
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-zinc-400">3. Session</span>
              <span className="font-bold text-white">{breakdown.session}/20</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${(breakdown.session / 20) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 truncate block">Kill Zone Timing</span>
          </div>

          {/* Category 4: Displacement */}
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-zinc-400">4. Displacement</span>
              <span className="font-bold text-white">{breakdown.displacement}/15</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-400 rounded-full transition-all duration-500"
                style={{ width: `${(breakdown.displacement / 15) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 truncate block">Rejection Power</span>
          </div>

          {/* Category 5: Risk Gate */}
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5 sm:col-span-2 lg:col-span-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-zinc-400">5. Risk Gate</span>
              <span className="font-bold text-white">{breakdown.risk}/15</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${(breakdown.risk / 15) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 truncate block">Spread &amp; Volatility</span>
          </div>
        </div>

        {/* Verbatim Backend Checks List */}
        {confluenceRecord?.checks && confluenceRecord.checks.length > 0 && (
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
              Verbatim Institutional Engine Audits
            </span>
            {confluenceRecord.checks.map((chk: string, idx: number) => {
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
      </Card>

      {/* ── 6. Live Market Conditions & News Lockout Status ─────────── */}
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
                {confluenceRecord?.checks?.[2]?.replace(/^\[OK\] |^\[INFO\] /i, "") || "Active Order Flow"}
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
