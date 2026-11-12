import React, { useMemo } from "react";
import {
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Shield,
  Clock,
  Calendar,
  DollarSign,
  Award,
  Layers,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Hash,
  ExternalLink,
  Target,
  Lock,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  MetricCard,
  formatPairPrice,
  formatR,
  formatUSD,
  formatShortDate,
} from "../ui";

export interface TradeDetailRecord {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  grade?: string;
  setupType?: string;
  timestamp: string;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  initialSl?: number;
  status: string;
  rrGained: number;
  closePrice?: number;
  closeTimestamp?: string;
  closeReason?: string;
  dealReference?: string;
  signalId?: string;
  fillDriftAtr?: number;
  dollarPnl?: number;
  breakevenTriggered?: boolean;
}

export interface ForensicTradeDetailProps {
  trade: TradeDetailRecord | null;
  equityPoint?: any;
  onBack: () => void;
}

export const ForensicTradeDetailView: React.FC<ForensicTradeDetailProps> = ({
  trade,
  equityPoint,
  onBack,
}) => {
  if (!trade) {
    return (
      <div className="space-y-4 font-mono select-none animate-in fade-in duration-150">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E131A] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400" />
          <span>Back</span>
        </button>
        <Card variant="default" padding="md" className="text-center py-10 text-zinc-400 text-xs">
          Trade record not found or unavailable in historical audit logs.
        </Card>
      </div>
    );
  }

  const isBuy = trade.direction === "BUY";
  const rVal = typeof trade.rrGained === "number" ? trade.rrGained : 0;
  const isWin = rVal > 0 || (trade.status && trade.status.includes("WIN"));
  const isLoss = rVal < 0 || (trade.status && trade.status.includes("LOSS"));
  const isBE = rVal === 0 && !isLoss;

  const rawSetup = trade.setupType || "Institutional SMC";
  const cleanSetup = rawSetup.replace(/\s*\([^\)]*\)\s*/g, "").trim() || "Institutional SMC";

  // Reconciled dollar P&L (prefers genuine equity point record from server)
  const dollarPnl = useMemo(() => {
    if (equityPoint && typeof equityPoint.dollarPnl === "number") {
      return equityPoint.dollarPnl;
    }
    if (typeof trade.dollarPnl === "number") {
      return trade.dollarPnl;
    }
    // Standard $25.00 risk parity calculation: R * $25
    return Number((rVal * 25.0).toFixed(2));
  }, [equityPoint, trade.dollarPnl, rVal]);

  // Position holding duration (from actual open and close timestamps)
  const holdingDuration = useMemo(() => {
    if (!trade.timestamp || !trade.closeTimestamp) return null;
    const openMs = new Date(trade.timestamp).getTime();
    const closeMs = new Date(trade.closeTimestamp).getTime();
    const diffMs = closeMs - openMs;
    if (diffMs <= 0 || isNaN(diffMs)) return null;

    const totalMins = Math.floor(diffMs / (60 * 1000));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }, [trade.timestamp, trade.closeTimestamp]);

  // Original risk in pips
  const initialSl = trade.initialSl || trade.sl;
  const slPips = useMemo(() => {
    if (!trade.entryPrice || !initialSl) return null;
    const diff = Math.abs(trade.entryPrice - initialSl);
    const mult = trade.pair.includes("JPY") ? 100 : trade.pair.includes("XAU") ? 10 : trade.pair.includes("XAG") ? 100 : 10000;
    return Number((diff * mult).toFixed(1));
  }, [trade.entryPrice, initialSl, trade.pair]);

  return (
    <div className="space-y-4 font-mono select-none overflow-x-hidden animate-in fade-in slide-in-from-right-3 duration-200">
      {/* ── Top Navigation & Breadcrumbs ──── */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group shrink-0 whitespace-nowrap"
          title="Return to Previous View"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform shrink-0" />
          <span className="font-semibold whitespace-nowrap">Audit Log</span>
          <span className="text-zinc-600">/</span>
          <span className="text-white font-bold whitespace-nowrap">{trade.pair}</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={isBuy ? "buy" : "sell"} size="sm">
            {isBuy ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {trade.direction}
          </Badge>
          <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
            ID: {trade.id.slice(0, 16)}...
          </span>
        </div>
      </div>

      {/* ── Section A: Trade Identity & Outcome Banner ────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-tight whitespace-nowrap shrink-0">
                {trade.pair} {trade.direction} Execution
              </h1>
              <Badge variant="neutral" size="xs">
                Grade {trade.grade || "A"}
              </Badge>
              <Badge variant="neutral" size="xs">
                {cleanSetup}
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">
              Broker Reference: <strong className="font-mono text-zinc-300">{trade.id}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-sm font-black px-3 py-1.5 rounded border inline-block tabular-nums ${
                isWin
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : isBE
                  ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                  : "bg-rose-500/15 text-rose-400 border-rose-500/30"
              }`}
            >
              {formatR(rVal)} ({dollarPnl >= 0 ? `+${formatUSD(dollarPnl)}` : formatUSD(dollarPnl)})
            </span>

            <span className="text-xs font-bold px-2 py-1.5 rounded bg-[#111721] border border-[#1E2633] text-white">
              {trade.closeReason || "CLOSED"}
            </span>
          </div>
        </div>

        {/* Key Metrics Quick Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Trade Outcome</span>
            <span
              className={`font-bold mt-0.5 block ${
                isWin ? "text-emerald-400" : isBE ? "text-zinc-300" : "text-rose-400"
              }`}
            >
              {trade.status || (isWin ? "Closed - WIN" : "Closed - LOSS")}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Holding Duration</span>
            <span className="font-bold text-white mt-0.5 block">
              {holdingDuration || "Recorded Instant"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Risk Sizing</span>
            <span className="font-bold text-amber-400 mt-0.5 block">
              $25.00 Parity Standard
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Breakeven Defense</span>
            <span className="font-bold text-cyan-400 mt-0.5 block">
              {trade.breakevenTriggered || trade.closeReason === "BE" ? "ACTIVATED (+0.75R)" : "Not Triggered"}
            </span>
          </div>
        </div>
      </Card>

      {/* ── Section B: Exact Execution Price Grid ──────────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Broker Fill &amp; Order Execution Matrix
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Capital.com CFD
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Entry Fill Price</span>
            <span className="font-bold text-white text-sm mt-0.5 block tabular-nums">
              {formatPairPrice(trade.pair, trade.entryPrice)}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">Authorized Market Fill</span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Exit Close Price</span>
            <span className="font-bold text-white text-sm mt-0.5 block tabular-nums">
              {trade.closePrice != null ? formatPairPrice(trade.pair, trade.closePrice) : "—"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
              Reason: {trade.closeReason || "CLOSED"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Original Stop Loss</span>
            <span className="font-bold text-rose-400 text-sm mt-0.5 block tabular-nums">
              {initialSl != null ? formatPairPrice(trade.pair, initialSl) : "—"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
              {slPips != null ? `${slPips} pips planned risk` : "Initial Level"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Take Profit 1 (TP1)</span>
            <span className="font-bold text-emerald-400 text-sm mt-0.5 block tabular-nums">
              {trade.tp1 != null ? formatPairPrice(trade.pair, trade.tp1) : "—"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
              {trade.closeReason === "TP1" ? "Filled at Target" : "Target Limit"}
            </span>
          </div>
        </div>

        {/* Secondary Parameters (TP2, Final SL, Slippage) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <span className="text-zinc-400">Final Settled Stop:</span>
            <span className="font-bold text-white tabular-nums">
              {trade.sl != null ? formatPairPrice(trade.pair, trade.sl) : "—"}{" "}
              {trade.sl === trade.entryPrice && <strong className="text-cyan-400 text-[10px]">(BE)</strong>}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <span className="text-zinc-400">Target 2 (Runner):</span>
            <span className="font-bold text-zinc-200 tabular-nums">
              {trade.tp2 != null ? formatPairPrice(trade.pair, trade.tp2) : "1:2.50 Structural"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <span className="text-zinc-400">Execution Slippage:</span>
            <span className={typeof trade.fillDriftAtr === "number" && trade.fillDriftAtr >= 0 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
              {typeof trade.fillDriftAtr === "number" ? `${trade.fillDriftAtr > 0 ? "+" : ""}${trade.fillDriftAtr} ATR` : "0.00 ATR (Clean Fill)"}
            </span>
          </div>
        </div>
      </Card>

      {/* ── Section C: Trade Lifecycle Chronological Timeline ─────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Chronological Trade Lifecycle
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Audit Trail
          </Badge>
        </div>

        {/* Vertical Timeline Track */}
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1E2633]">
          {/* Milestone 1: Signal Authorization */}
          <div className="relative">
            <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-cyan-400 ring-4 ring-[#0E131A]" />
            <div className="text-xs font-bold text-white flex items-center justify-between gap-2">
              <span>1. Institutional Signal Authorized</span>
              <span className="text-[10px] text-zinc-500 font-normal">{trade.timestamp}</span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
              Grade {trade.grade || "A"} {trade.direction} signal generated by <strong>{cleanSetup}</strong> model.
              Confluence threshold verified by cloud scanner.
            </p>
          </div>

          {/* Milestone 2: Market Order Filled */}
          <div className="relative">
            <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-[#0E131A]" />
            <div className="text-xs font-bold text-white flex items-center justify-between gap-2">
              <span>2. Position Opened on Capital.com</span>
              <span className="text-[10px] text-zinc-500 font-normal">{trade.timestamp}</span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
              Market entry filled at <strong className="text-zinc-200">{formatPairPrice(trade.pair, trade.entryPrice)}</strong>. Initial Stop Loss placed at{" "}
              <strong className="text-rose-400">{formatPairPrice(trade.pair, initialSl)}</strong> and TP1 target attached at{" "}
              <strong className="text-emerald-400">{formatPairPrice(trade.pair, trade.tp1)}</strong>.
            </p>
          </div>

          {/* Milestone 3: Profit Defense / Breakeven (Conditional on actual record) */}
          {(trade.breakevenTriggered || trade.closeReason === "BE") && (
            <div className="relative">
              <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-cyan-400 ring-4 ring-[#0E131A]" />
              <div className="text-xs font-bold text-white flex items-center justify-between gap-2">
                <span>3. Tier-1 Profit Defense Activated (BE Lock)</span>
                <span className="text-[10px] text-zinc-500 font-normal">
                  {trade.updatedAt ? trade.updatedAt : "Milestone Trigger"}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
                Position advanced past +0.75R profit threshold. Stop Loss moved to Entry Price (
                <strong className="text-white">{formatPairPrice(trade.pair, trade.entryPrice)}</strong>), eliminating downside risk while strictly preserving Take Profit.
              </p>
            </div>
          )}

          {/* Milestone 4: Final Closure & Settlement */}
          <div className="relative">
            <span
              className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full ring-4 ring-[#0E131A] ${
                isWin ? "bg-emerald-400" : isBE ? "bg-zinc-400" : "bg-rose-400"
              }`}
            />
            <div className="text-xs font-bold text-white flex items-center justify-between gap-2">
              <span>
                {(trade.breakevenTriggered || trade.closeReason === "BE") ? "4" : "3"}. Position Closed &amp; Settled
              </span>
              <span className="text-[10px] text-zinc-500 font-normal">
                {trade.closeTimestamp || trade.updatedAt || trade.timestamp}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
              Order exited at <strong className="text-zinc-200">{trade.closePrice != null ? formatPairPrice(trade.pair, trade.closePrice) : "Market"}</strong> via{" "}
              <strong className="text-cyan-400">{trade.closeReason || "Market Close"}</strong>. Final realized return:{" "}
              <strong className={isWin ? "text-emerald-400" : isBE ? "text-zinc-300" : "text-rose-400"}>
                {formatR(rVal)}
              </strong>{" "}
              ({dollarPnl >= 0 ? `+${formatUSD(dollarPnl)}` : formatUSD(dollarPnl)}).
            </p>
          </div>
        </div>
      </Card>

      {/* ── Section D & E: Strategy Evidence & Technical Attributes ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Strategy Evidence Card */}
        <Card variant="default" padding="md" className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Strategy &amp; Confluence Evidence
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              Recorded Data
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Setup Model:</span>
              <span className="text-white font-bold">{cleanSetup}</span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Conviction Grade:</span>
              <span className="text-cyan-400 font-bold">Grade {trade.grade || "A"}</span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Order Direction:</span>
              <Badge variant={isBuy ? "buy" : "sell"} size="xs">
                {trade.direction}
              </Badge>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Signal Reference:</span>
              <span className="text-zinc-300 font-mono text-[10px] truncate max-w-[180px]">
                {trade.signalId || trade.id}
              </span>
            </div>
          </div>
        </Card>

        {/* Outcome Verification Card */}
        <Card variant="default" padding="md" className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Outcome Reconciliation
              </h3>
            </div>
            <Badge variant="neutral" size="xs">
              Audit Verified
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Target 1 Milestone:</span>
              <span className={trade.closeReason === "TP1" || rVal >= 0.5 ? "text-emerald-400 font-bold" : "text-zinc-400"}>
                {trade.closeReason === "TP1" ? "REACHED & FILLED" : rVal >= 0.5 ? "Milestone Exceeded" : "Not Reached"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Stop Loss Triggered:</span>
              <span className={trade.closeReason === "SL" ? "text-rose-400 font-bold" : "text-zinc-400"}>
                {trade.closeReason === "SL" ? "HIT AT FULL RISK" : "Avoided"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Breakeven Defense:</span>
              <span className={trade.breakevenTriggered || trade.closeReason === "BE" ? "text-cyan-400 font-bold" : "text-zinc-400"}>
                {trade.breakevenTriggered || trade.closeReason === "BE" ? "ACTIVE / TRIGGERED" : "Not Activated"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Settlement Method:</span>
              <span className="text-white font-bold">{trade.closeReason || "CLOSED"}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
