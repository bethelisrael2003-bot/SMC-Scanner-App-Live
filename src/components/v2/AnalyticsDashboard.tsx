import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldCheck,
  Award,
  Layers,
  BarChart2,
  Calendar,
  Percent,
} from "lucide-react";
import {
  Card,
  Badge,
  MetricCard,
  SegmentedControl,
  formatUSD,
  formatR,
  formatPercent,
} from "./ui";

export interface EquityPoint {
  point: number;
  tradeId?: string;
  date: string;
  pair?: string;
  direction?: string;
  setupType?: string;
  r?: number;
  runningR?: number;
  dollarPnl?: number;
  balance: number;
  status?: string;
  closeReason?: string;
  label?: string;
}

export interface PairStatItem {
  pair: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  rNet: number;
}

export interface AnalyticsDashboardProps {
  currentBalance: number;
  baselineDeposit?: number;
  winRate: number;
  totalWins: number;
  totalLosses: number;
  totalNetR: number;
  profitFactor?: number;
  equityCurve: EquityPoint[];
  pairStats: PairStatItem[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  currentBalance,
  baselineDeposit = 11000.0,
  winRate,
  totalWins,
  totalLosses,
  totalNetR,
  profitFactor = 1.05,
  equityCurve,
  pairStats,
}) => {
  const [curveFilter, setCurveFilter] = useState<"ALL" | "30D" | "7D">("ALL");
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(
    equityCurve.length > 0 ? equityCurve.length - 1 : 0
  );

  const balanceDelta = currentBalance - baselineDeposit;
  const isNetProfit = balanceDelta >= 0;

  // Filtered equity points based on date range
  const displayCurve = useMemo(() => {
    if (!equityCurve || equityCurve.length === 0) return [];
    if (curveFilter === "ALL") return equityCurve;

    const days = curveFilter === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const filtered = equityCurve.filter((p) => {
      if (p.point === 0) return true; // keep starting point
      const t = new Date(p.date).getTime();
      return isNaN(t) || t >= cutoff;
    });

    return filtered.length >= 2 ? filtered : equityCurve;
  }, [equityCurve, curveFilter]);

  const activePoint = displayCurve[selectedPointIndex] || displayCurve[displayCurve.length - 1] || null;

  // SVG Chart Dimensions & Dynamic Scaling
  const chartHeight = 140;
  const chartWidth = 500;
  const paddingY = 20;

  const { pointsString, areaString, baselineY, svgPoints } = useMemo(() => {
    if (!displayCurve || displayCurve.length === 0) {
      return { pointsString: "", areaString: "", baselineY: 70, svgPoints: [] };
    }

    const balances = displayCurve.map((p) => p.balance);
    const minBal = Math.min(baselineDeposit - 200, ...balances);
    const maxBal = Math.max(baselineDeposit + 200, ...balances);
    const span = Math.max(1, maxBal - minBal);

    const getY = (bal: number) => {
      const normalized = (bal - minBal) / span;
      return chartHeight - paddingY - normalized * (chartHeight - 2 * paddingY);
    };

    const bY = getY(baselineDeposit);

    const pts = displayCurve.map((p, idx) => {
      const x = (idx / Math.max(1, displayCurve.length - 1)) * chartWidth;
      const y = getY(p.balance);
      return { x, y, point: p };
    });

    const ptsStr = pts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
    const areaStr = `0,${chartHeight} ${ptsStr} ${chartWidth},${chartHeight}`;

    return { pointsString: ptsStr, areaString: areaStr, baselineY: bY, svgPoints: pts };
  }, [displayCurve, baselineDeposit]);

  return (
    <div className="space-y-4 font-mono">
      {/* ── Top 4 Key Performance Indicators (Visual Hierarchy) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <MetricCard
          label="Account Balance"
          value={formatUSD(currentBalance)}
          subValue={
            isNetProfit
              ? `+${formatUSD(balanceDelta)} Net Gain`
              : `${formatUSD(balanceDelta)} Baseline`
          }
          status={isNetProfit ? "positive" : "negative"}
          icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
          hint={`Deposit: ${formatUSD(baselineDeposit)}`}
        />

        <MetricCard
          label="Win Rate (Rule 11a)"
          value={formatPercent(winRate)}
          subValue={`(${totalWins}W / ${totalLosses}L)`}
          status={winRate >= 50 ? "positive" : "negative"}
          icon={<Award className="w-4 h-4 text-cyan-400" />}
          hint={`${totalWins + totalLosses} Total Trades`}
        />

        <MetricCard
          label="Portfolio R Net"
          value={formatR(totalNetR)}
          subValue={totalNetR >= 0 ? "Positive Edge" : "Drawdown"}
          status={totalNetR >= 0 ? "positive" : "negative"}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          hint="Spread-Corrected"
        />

        <MetricCard
          label="Profit Factor"
          value={profitFactor.toFixed(2)}
          subValue={profitFactor >= 1.2 ? "Profitable" : "Near 1:1"}
          status={profitFactor >= 1.0 ? "positive" : "warning"}
          icon={<BarChart2 className="w-4 h-4 text-purple-400" />}
          hint="Gross W/L"
        />
      </div>

      {/* ── Visual Vector SVG Equity Curve ── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Equity Curve Trajectory ($ USD)
              </h3>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Live account balance plotted across every closed execution
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <SegmentedControl
              options={[
                { value: "7D", label: "7D" },
                { value: "30D", label: "30D" },
                { value: "ALL", label: "All Time" },
              ]}
              value={curveFilter}
              onChange={(val) => setCurveFilter(val as any)}
              size="sm"
            />
          </div>
        </div>

        {/* Vector SVG Area Chart */}
        <div className="relative w-full h-44 bg-zinc-950/80 rounded-xl border border-zinc-800/80 p-3 flex flex-col justify-between overflow-hidden select-none">
          <svg
            className="w-full h-full overflow-visible"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="apexEquityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Guides */}
            <line x1="0" y1="30" x2={chartWidth} y2="30" stroke="#1E2633" strokeDasharray="3 3" />
            <line x1="0" y1="70" x2={chartWidth} y2="70" stroke="#1E2633" strokeDasharray="3 3" />
            <line x1="0" y1="110" x2={chartWidth} y2="110" stroke="#1E2633" strokeDasharray="3 3" />

            {/* Baseline $11,000 Level */}
            <line
              x1="0"
              y1={baselineY}
              x2={chartWidth}
              y2={baselineY}
              stroke="#3F3F46"
              strokeWidth="1"
              strokeDasharray="2 2"
            />

            {/* Area Fill */}
            {areaString && (
              <polygon points={areaString} fill="url(#apexEquityGradient)" />
            )}

            {/* Line Stroke */}
            {pointsString && (
              <polyline
                fill="none"
                stroke="#10B981"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsString}
              />
            )}

            {/* Interactive Data Points */}
            {svgPoints.map((pt, idx) => (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r={selectedPointIndex === idx ? "5" : "3.5"}
                className={`transition-all duration-150 cursor-pointer ${
                  selectedPointIndex === idx
                    ? "fill-white stroke-emerald-400 stroke-2"
                    : "fill-emerald-400 stroke-zinc-950 stroke-1 hover:r-5"
                }`}
                onClick={() => setSelectedPointIndex(idx)}
              />
            ))}
          </svg>
        </div>

        {/* Selected Point Inspector */}
        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs flex flex-wrap justify-between items-center gap-2 text-zinc-300">
          <span>
            Point #{activePoint?.point ?? 0}:{" "}
            <strong className="text-white">
              {activePoint?.pair || activePoint?.label || "Baseline Deposit"}
            </strong>
          </span>
          <span>
            Balance:{" "}
            <strong className="text-emerald-400">
              {formatUSD(activePoint?.balance ?? currentBalance)}
            </strong>
          </span>
          {activePoint?.r != null && (
            <span>
              Delta R:{" "}
              <strong className={activePoint.r >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {formatR(activePoint.r)}
              </strong>
            </span>
          )}
        </div>
      </Card>

      {/* ── Asset Performance Matrix (Rule 11a Exact Counts) ── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Asset Performance Matrix
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Audited win/loss distribution and net R contribution per instrument
            </p>
          </div>
          <Badge variant="neutral" size="xs">Standing Rule 11a</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {pairStats.map((item) => {
            const isProfitable = item.rNet >= 0;
            return (
              <div
                key={item.pair}
                className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{item.pair}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded border ${
                      isProfitable
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    }`}
                  >
                    {formatR(item.rNet)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>
                    Win Rate:{" "}
                    <strong className={item.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}>
                      {formatPercent(item.winRate)}
                    </strong>
                  </span>
                  <span>
                    Exact: <strong>{item.wins}W / {item.losses}L</strong>
                  </span>
                </div>

                {/* Progress Visualizer */}
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.winRate >= 50 ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                    style={{ width: `${Math.max(5, Math.min(100, item.winRate))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
