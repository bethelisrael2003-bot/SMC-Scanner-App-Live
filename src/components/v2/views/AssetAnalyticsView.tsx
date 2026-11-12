import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  Award,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Layers,
  Zap,
  Flame,
  AlertCircle,
  Hash,
  Filter,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  MetricCard,
  SegmentedControl,
  formatPairPrice,
  formatR,
  formatPercent,
  formatShortDate,
} from "../ui";

export interface AssetAnalyticsProps {
  pair: string;
  pairStat: any;
  trades: any[];
  allEquityPoints: any[];
  onBack: () => void;
}

export const AssetAnalyticsView: React.FC<AssetAnalyticsProps> = ({
  pair,
  pairStat,
  trades,
  allEquityPoints,
  onBack,
}) => {
  const [periodFilter, setPeriodFilter] = useState<"7D" | "30D" | "ALL">("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | "WINS" | "LOSSES">("ALL");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  // Available pair names
  const pairNames: Record<string, string> = {
    "EUR/USD": "Euro / US Dollar",
    "GBP/JPY": "British Pound / Japanese Yen",
    "XAU/USD": "Spot Gold / US Dollar",
    "XAG/USD": "Spot Silver / US Dollar",
  };
  const pairFullName = pairNames[pair] || "Core Institutional Market";

  // Filter trades by selected reporting period
  const filteredByPeriodTrades = useMemo(() => {
    if (!trades || trades.length === 0) return [];
    if (periodFilter === "ALL") return trades;

    const days = periodFilter === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    return trades.filter((t) => {
      const ts = new Date(t.closeTimestamp || t.timestamp).getTime();
      return isNaN(ts) || ts >= cutoff;
    });
  }, [trades, periodFilter]);

  // Reconciled Metrics calculated honestly from the active trade list
  const metrics = useMemo(() => {
    const list = filteredByPeriodTrades;
    const total = list.length;
    if (total === 0) {
      return {
        total: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        netR: 0,
        avgR: 0,
        avgWinR: 0,
        avgLossR: 0,
        profitFactor: 0,
        winLossLabel: "0.0% (0W / 0L)",
      };
    }

    let wins = 0;
    let losses = 0;
    let sumR = 0;
    let grossWinR = 0;
    let grossLossR = 0;

    for (const t of list) {
      const r = typeof t.rrGained === "number" ? t.rrGained : 0;
      sumR += r;
      if (r > 0 || (t.status && t.status.includes("WIN"))) {
        wins++;
        grossWinR += r;
      } else if (r < 0 || (t.status && t.status.includes("LOSS"))) {
        losses++;
        grossLossR += Math.abs(r);
      }
    }

    const winRate = Number(((wins / total) * 100).toFixed(1));
    const netR = Number(sumR.toFixed(2));
    const avgR = Number((sumR / total).toFixed(2));
    const avgWinR = wins > 0 ? Number((grossWinR / wins).toFixed(2)) : 0;
    const avgLossR = losses > 0 ? Number((grossLossR / losses).toFixed(2)) : 0;
    const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? 99.0 : 1.0;

    return {
      total,
      wins,
      losses,
      winRate,
      netR,
      avgR,
      avgWinR,
      avgLossR,
      profitFactor,
      winLossLabel: `${winRate.toFixed(1)}% (${wins}W / ${losses}L)`,
    };
  }, [filteredByPeriodTrades]);

  // Build Instrument-Specific Performance Curve (Cumulative R Progression)
  const chartHeight = 140;
  const chartWidth = 500;
  const paddingY = 20;

  const { pointsString, areaString, baselineY, svgPoints, curvePoints } = useMemo(() => {
    // Extract trades in chronological order
    const chronological = [...filteredByPeriodTrades].sort(
      (a, b) => new Date(a.closeTimestamp || a.timestamp).getTime() - new Date(b.closeTimestamp || b.timestamp).getTime()
    );

    if (chronological.length === 0) {
      return { pointsString: "", areaString: "", baselineY: 70, svgPoints: [], curvePoints: [] };
    }

    let running = 0;
    const points = [
      {
        idx: 0,
        date: chronological[0].timestamp,
        rDelta: 0,
        runningR: 0,
        setupType: "Baseline Start",
      },
    ];

    chronological.forEach((t, i) => {
      const r = typeof t.rrGained === "number" ? t.rrGained : 0;
      running += r;
      const cleanSetup = (t.setupType || "Setup").replace(/\s*\([^\)]*\)\s*/g, "").trim() || "Setup";
      points.push({
        idx: i + 1,
        date: t.closeTimestamp || t.timestamp,
        rDelta: r,
        runningR: Number(running.toFixed(2)),
        setupType: cleanSetup,
      });
    });

    const rValues = points.map((p) => p.runningR);
    const minR = Math.min(-1, ...rValues);
    const maxR = Math.max(1, ...rValues);
    const span = Math.max(1, maxR - minR);

    const getY = (val: number) => {
      const normalized = (val - minR) / span;
      return chartHeight - paddingY - normalized * (chartHeight - 2 * paddingY);
    };

    const bY = getY(0);

    const pts = points.map((p, idx) => {
      const x = points.length === 1 ? chartWidth / 2 : (idx / (points.length - 1)) * chartWidth;
      const y = getY(p.runningR);
      return { x, y, data: p };
    });

    const pStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
    const aStr = `${pStr} ${chartWidth},${bY} 0,${bY}`;

    return {
      pointsString: pStr,
      areaString: aStr,
      baselineY: bY,
      svgPoints: pts,
      curvePoints: points,
    };
  }, [filteredByPeriodTrades]);

  const activeCurvePoint =
    selectedPointIndex != null && curvePoints[selectedPointIndex]
      ? curvePoints[selectedPointIndex]
      : curvePoints[curvePoints.length - 1] || null;

  // Trading Behavior Insights derived genuinely from trade history
  const behaviorInsights = useMemo(() => {
    const list = filteredByPeriodTrades;
    if (list.length === 0) return null;

    // 1. Setup Model Distribution
    const models: Record<string, { trades: number; wins: number; losses: number; netR: number }> = {};
    // 2. Weekday Distribution
    const weekdays: Record<string, { trades: number; wins: number; netR: number }> = {
      Mon: { trades: 0, wins: 0, netR: 0 },
      Tue: { trades: 0, wins: 0, netR: 0 },
      Wed: { trades: 0, wins: 0, netR: 0 },
      Thu: { trades: 0, wins: 0, netR: 0 },
      Fri: { trades: 0, wins: 0, netR: 0 },
    };
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    let bestR = -Infinity;
    let worstR = Infinity;
    let bestTrade: any = null;
    let worstTrade: any = null;

    let totalDurationMs = 0;
    let durationCount = 0;

    // Chronological order for streak calculations
    const chronological = [...list].sort(
      (a, b) => new Date(a.closeTimestamp || a.timestamp).getTime() - new Date(b.closeTimestamp || b.timestamp).getTime()
    );

    chronological.forEach((t) => {
      const r = typeof t.rrGained === "number" ? t.rrGained : 0;
      const isWin = r > 0 || (t.status && t.status.includes("WIN"));
      const isLoss = r < 0 || (t.status && t.status.includes("LOSS"));

      // Model breakdown
      const mName = (t.setupType || "Institutional SMC").replace(/\s*\([^\)]*\)\s*/g, "").trim();
      if (!models[mName]) {
        models[mName] = { trades: 0, wins: 0, losses: 0, netR: 0 };
      }
      models[mName].trades++;
      models[mName].netR = Number((models[mName].netR + r).toFixed(2));
      if (isWin) models[mName].wins++;
      if (isLoss) models[mName].losses++;

      // Weekday breakdown
      const dt = new Date(t.timestamp);
      const dName = dayNames[dt.getDay()];
      if (weekdays[dName]) {
        weekdays[dName].trades++;
        weekdays[dName].netR = Number((weekdays[dName].netR + r).toFixed(2));
        if (isWin) weekdays[dName].wins++;
      }

      // Streaks
      if (isWin) {
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      } else if (isLoss) {
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      }

      // Extremes
      if (r > bestR) {
        bestR = r;
        bestTrade = t;
      }
      if (r < worstR) {
        worstR = r;
        worstTrade = t;
      }

      // Duration
      if (t.timestamp && t.closeTimestamp) {
        const dMs = new Date(t.closeTimestamp).getTime() - new Date(t.timestamp).getTime();
        if (dMs > 0 && dMs < 7 * 24 * 3600 * 1000) {
          totalDurationMs += dMs;
          durationCount++;
        }
      }
    });

    const avgDurationHours =
      durationCount > 0 ? (totalDurationMs / durationCount / (1000 * 3600)).toFixed(1) : null;

    return {
      models: Object.entries(models).map(([name, data]) => ({
        name,
        ...data,
        winRate: Number(((data.wins / data.trades) * 100).toFixed(1)),
      })),
      weekdays: Object.entries(weekdays).filter(([_, d]) => d.trades > 0),
      maxWinStreak,
      maxLossStreak,
      bestTrade,
      worstTrade,
      avgDurationHours,
    };
  }, [filteredByPeriodTrades]);

  // Filter trade history by outcome
  const finalTradeList = useMemo(() => {
    return filteredByPeriodTrades.filter((t) => {
      const r = typeof t.rrGained === "number" ? t.rrGained : 0;
      const isWin = r > 0 || (t.status && t.status.includes("WIN"));
      const isLoss = r < 0 || (t.status && t.status.includes("LOSS"));
      if (outcomeFilter === "WINS") return isWin;
      if (outcomeFilter === "LOSSES") return isLoss;
      return true;
    });
  }, [filteredByPeriodTrades, outcomeFilter]);

  return (
    <div className="space-y-4 font-mono select-none overflow-x-hidden animate-in fade-in slide-in-from-right-3 duration-200">
      {/* ── Top Navigation & Breadcrumbs ──── */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group shrink-0 whitespace-nowrap"
          title="Return to Analytics Overview"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform shrink-0" />
          <span className="font-semibold whitespace-nowrap">Analytics</span>
          <span className="text-zinc-600">/</span>
          <span className="text-cyan-400 font-bold whitespace-nowrap">{pair}</span>
        </button>

        <div className="shrink-0">
          <SegmentedControl
            options={[
              { value: "7D", label: "7D" },
              { value: "30D", label: "30D" },
              { value: "ALL", label: "All" },
            ]}
            value={periodFilter}
            onChange={(val) => setPeriodFilter(val as any)}
            size="sm"
          />
        </div>
      </div>

      {/* ── Section A: Asset Performance Header Card ──────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-tight whitespace-nowrap shrink-0">{pair}</h1>
              <span className="text-xs text-zinc-400 font-sans truncate">· {pairFullName}</span>
              <Badge variant="neutral" size="xs" className="whitespace-nowrap shrink-0">
                Standing Rule 11a
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">
              Audited institutional performance for period: <strong>{periodFilter === "ALL" ? "All-Time Records" : `Last ${periodFilter}`}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-sm font-black px-2.5 py-1 rounded border inline-block tabular-nums ${
                metrics.netR >= 0
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-400 border-rose-500/30"
              }`}
            >
              {formatR(metrics.netR)} Net
            </span>

            <span className="text-xs font-bold px-2 py-1 rounded bg-[#111721] border border-[#1E2633] text-white tabular-nums whitespace-nowrap">
              {metrics.winLossLabel}
            </span>
          </div>
        </div>

        {/* ── Section B: Performance Summary (KPI Cards) ───────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <MetricCard
            label="Total Trades"
            value={metrics.total}
            subValue={`${metrics.wins}W / ${metrics.losses}L`}
            status={metrics.wins >= metrics.losses ? "positive" : "negative"}
            hint="Recorded"
          />

          <MetricCard
            label="Win Rate (11a)"
            value={formatPercent(metrics.winRate)}
            subValue={`(${metrics.wins}W / ${metrics.losses}L)`}
            status={metrics.winRate >= 50 ? "positive" : "negative"}
            icon={<Award className="w-3.5 h-3.5 text-cyan-400" />}
            hint="Rule 11a Verified"
          />

          <MetricCard
            label="Net Return R"
            value={formatR(metrics.netR)}
            subValue={metrics.netR >= 0 ? "Positive Edge" : "Drawdown"}
            status={metrics.netR >= 0 ? "positive" : "negative"}
            icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
            hint="Realized R"
          />

          <MetricCard
            label="Avg R / Trade"
            value={formatR(metrics.avgR)}
            subValue={metrics.avgR >= 0 ? "Positive" : "Negative"}
            status={metrics.avgR >= 0 ? "positive" : "negative"}
            hint="Expectancy"
          />

          <MetricCard
            label="Profit Factor"
            value={metrics.profitFactor > 50 ? ">50.0" : metrics.profitFactor.toFixed(2)}
            subValue={metrics.profitFactor >= 1.2 ? "Profitable" : "Near 1:1"}
            status={metrics.profitFactor >= 1.0 ? "positive" : "warning"}
            icon={<BarChart2 className="w-3.5 h-3.5 text-purple-400" />}
            hint="Gross W/L"
          />

          <MetricCard
            label="Avg Win / Loss"
            value={`${metrics.avgWinR > 0 ? `+${metrics.avgWinR}` : "0"}R / -${metrics.avgLossR}R`}
            subValue={metrics.avgWinR >= metrics.avgLossR ? "Positive Asymmetry" : "Negative Asymmetry"}
            status={metrics.avgWinR >= metrics.avgLossR ? "positive" : "negative"}
            hint="Win vs Loss"
          />
        </div>
      </Card>

      {/* ── Section C: Cumulative Performance Curve (In R) ────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Cumulative Performance Trajectory (R)
              </h3>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
              Cumulative R-multiple progression across every closed execution for {pair}
            </p>
          </div>

          {activeCurvePoint && (
            <div className="text-right tabular-nums text-xs">
              <span className="text-zinc-400 text-[10px] block">Point #{activeCurvePoint.idx} Progression</span>
              <strong className={activeCurvePoint.runningR >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {formatR(activeCurvePoint.runningR)}
              </strong>
            </div>
          )}
        </div>

        {/* Vector SVG Performance Chart */}
        <div className="relative w-full h-40 bg-zinc-950/80 rounded-xl border border-zinc-800/80 p-3 flex flex-col justify-between overflow-hidden select-none">
          {curvePoints.length >= 2 ? (
            <>
              <svg
                className="w-full h-full overflow-visible"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={`grad-${pair.replace("/", "")}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={metrics.netR >= 0 ? "#10B981" : "#F43F5E"} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={metrics.netR >= 0 ? "#10B981" : "#F43F5E"} stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Breakeven Baseline */}
                <line
                  x1="0"
                  y1={baselineY}
                  x2={chartWidth}
                  y2={baselineY}
                  stroke="rgba(113, 113, 122, 0.4)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />

                {/* Shaded Area */}
                {areaString && <polygon points={areaString} fill={`url(#grad-${pair.replace("/", "")})`} />}

                {/* Trajectory Line */}
                {pointsString && (
                  <polyline
                    fill="none"
                    stroke={metrics.netR >= 0 ? "#10B981" : "#F43F5E"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsString}
                  />
                )}

                {/* Interactive Points */}
                {svgPoints.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={selectedPointIndex === i || (selectedPointIndex == null && i === svgPoints.length - 1) ? 4.5 : 2.5}
                    className={`cursor-pointer transition-all ${
                      selectedPointIndex === i || (selectedPointIndex == null && i === svgPoints.length - 1)
                        ? "fill-white stroke-2 stroke-emerald-400"
                        : "fill-emerald-400/80 hover:fill-white"
                    }`}
                    onClick={() => setSelectedPointIndex(i)}
                  />
                ))}
              </svg>

              {/* Chart Tooltip Footer */}
              {activeCurvePoint && (
                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-800/80 font-mono">
                  <span>
                    Trade #{activeCurvePoint.idx}: <strong className="text-white">{activeCurvePoint.setupType}</strong>
                  </span>
                  <span>
                    Delta:{" "}
                    <strong className={activeCurvePoint.rDelta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {formatR(activeCurvePoint.rDelta)}
                    </strong>
                  </span>
                  <span>
                    Cumulative:{" "}
                    <strong className={activeCurvePoint.runningR >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {formatR(activeCurvePoint.runningR)}
                    </strong>
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-zinc-500 font-sans">
              Insufficient historical points to render curve in this period.
            </div>
          )}
        </div>
      </Card>

      {/* ── Section E: Trading Behavior Insights ──────────────────── */}
      {behaviorInsights && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Setup Model Performance Breakdown */}
          <Card variant="default" padding="md" className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Model Conviction Breakdown
                </h3>
              </div>
              <Badge variant="neutral" size="xs">
                By Setup Type
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              {behaviorInsights.models.map((m) => (
                <div
                  key={m.name}
                  className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 pr-1">
                    <span className="font-bold text-white block truncate">{m.name}</span>
                    <span className="text-[10px] text-zinc-400 font-sans">
                      {m.trades} trades · Win Rate: <strong>{m.winRate}% ({m.wins}W / {m.losses}L)</strong>
                    </span>
                  </div>

                  <span
                    className={`font-bold tabular-nums px-2 py-0.5 rounded border shrink-0 ${
                      m.netR >= 0
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    {formatR(m.netR)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Behavior Statistics & Streaks */}
          <Card variant="default" padding="md" className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Execution Patterns &amp; Streaks
                </h3>
              </div>
              <Badge variant="neutral" size="xs">
                Audited Stats
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
                <span className="text-[10px] text-zinc-500 uppercase block">Max Win Streak</span>
                <span className="font-bold text-emerald-400 text-sm mt-0.5 block">
                  {behaviorInsights.maxWinStreak} consecutive
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
                <span className="text-[10px] text-zinc-500 uppercase block">Max Loss Streak</span>
                <span className="font-bold text-rose-400 text-sm mt-0.5 block">
                  {behaviorInsights.maxLossStreak} consecutive
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
                <span className="text-[10px] text-zinc-500 uppercase block">Best Execution</span>
                <span className="font-bold text-emerald-400 mt-0.5 block">
                  {behaviorInsights.bestTrade ? formatR(behaviorInsights.bestTrade.rrGained) : "—"}
                </span>
                <span className="text-[9px] text-zinc-500 truncate block">
                  {behaviorInsights.bestTrade ? behaviorInsights.bestTrade.closeReason || "TP1" : ""}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
                <span className="text-[10px] text-zinc-500 uppercase block">Worst Execution</span>
                <span className="font-bold text-rose-400 mt-0.5 block">
                  {behaviorInsights.worstTrade ? formatR(behaviorInsights.worstTrade.rrGained) : "—"}
                </span>
                <span className="text-[9px] text-zinc-500 truncate block">
                  {behaviorInsights.worstTrade ? behaviorInsights.worstTrade.closeReason || "SL" : ""}
                </span>
              </div>

              {behaviorInsights.avgDurationHours && (
                <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] col-span-2 flex items-center justify-between">
                  <span className="text-zinc-400">Avg Position Duration:</span>
                  <span className="font-bold text-white">{behaviorInsights.avgDurationHours} hours</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Section D: Trading History Breakdown ──────────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1E2633]">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {pair} Historical Trade Records
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
              Displaying {finalTradeList.length} of {filteredByPeriodTrades.length} trades
            </p>
          </div>

          <SegmentedControl
            options={[
              { value: "ALL", label: "All" },
              { value: "WINS", label: "Wins" },
              { value: "LOSSES", label: "Losses" },
            ]}
            value={outcomeFilter}
            onChange={(val) => setOutcomeFilter(val as any)}
            size="sm"
          />
        </div>

        {/* Compact Mobile Trade Rows */}
        <div className="space-y-1.5">
          {finalTradeList.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#111721] text-center text-xs text-zinc-500 py-6 font-sans">
              No historical trades match the selected criteria for this instrument.
            </div>
          ) : (
            finalTradeList.map((t, idx) => {
              const isBuy = t.direction === "BUY";
              const rVal = typeof t.rrGained === "number" ? t.rrGained : 0;
              const isWin = rVal > 0 || (t.status && t.status.includes("WIN"));
              const isLoss = rVal < 0 || (t.status && t.status.includes("LOSS"));
              const isBE = rVal === 0 && !isLoss;

              return (
                <div
                  key={t.id || idx}
                  className="p-2.5 sm:p-3 rounded-xl bg-[#0E131A] border border-[#1E2633] flex items-center justify-between gap-3"
                >
                  {/* Left: Direction Badge & Dates */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Badge variant={isBuy ? "buy" : "sell"} size="xs" className="shrink-0">
                      {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {t.direction}
                    </Badge>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-xs">{(t.setupType || "Setup").replace(/\s*\([^\)]*\)\s*/g, "").trim()}</span>
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {formatShortDate(t.closeTimestamp || t.timestamp)}
                      </div>
                    </div>
                  </div>

                  {/* Center: Execution Prices (Desktop/Tablet) */}
                  <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
                    <span>Entry: <strong className="text-zinc-200">{formatPairPrice(t.pair, t.entryPrice)}</strong></span>
                    <span>→</span>
                    <span>Exit: <strong className="text-zinc-200">{t.closePrice != null ? formatPairPrice(t.pair, t.closePrice) : "—"}</strong></span>
                  </div>

                  {/* Right: R-Multiple Badge & Close Reason */}
                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded font-mono border inline-block tabular-nums ${
                        isWin
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : isBE
                          ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {formatR(rVal)}
                    </span>
                    <span className="text-[10px] text-zinc-500 block uppercase mt-0.5">
                      {t.closeReason || "CLOSED"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};
