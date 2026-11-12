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

  // Reconciled dollar P&L (derived strictly at $25.00 risk parity standard unless broker cash P&L explicitly exists)
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

  // Chronological Timestamp Relationship Validation
  const timestampChronology = useMemo(() => {
    if (!trade.timestamp && !trade.closeTimestamp) {
      return {
        status: "MISSING_BOTH",
        isValid: false,
        displayLabel: "Timestamps unavailable",
        holdingDuration: null,
        durationLabel: "Not recorded",
        explanation: "Neither opening fill nor closing settlement timestamp was recorded in the trade log.",
      };
    }
    if (!trade.timestamp) {
      return {
        status: "MISSING_OPEN",
        isValid: false,
        displayLabel: "Opening timestamp unavailable",
        holdingDuration: null,
        durationLabel: "Not recorded (Opening time missing)",
        explanation: "Opening market fill timestamp is not recorded in the source log.",
      };
    }
    if (!trade.closeTimestamp) {
      return {
        status: "MISSING_CLOSE",
        isValid: false,
        displayLabel: "Timestamp unavailable",
        holdingDuration: null,
        durationLabel: "Not recorded (Closing time missing)",
        explanation: "Closing settlement timestamp is not recorded in the source log.",
      };
    }

    const openMs = new Date(trade.timestamp).getTime();
    const closeMs = new Date(trade.closeTimestamp).getTime();

    if (isNaN(openMs) || isNaN(closeMs)) {
      return {
        status: "PARSE_ERROR",
        isValid: false,
        displayLabel: "Timestamp parsing error",
        holdingDuration: null,
        durationLabel: "Not recorded (Invalid format)",
        explanation: "One or both timestamps cannot be parsed as valid ISO dates.",
      };
    }

    if (closeMs > openMs) {
      const diffMs = closeMs - openMs;
      const totalMins = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const duration = hours > 0 ? `${hours}h ${mins}m (Derived)` : `${mins}m (Derived)`;

      return {
        status: "VALID",
        isValid: true,
        displayLabel: trade.closeTimestamp,
        holdingDuration: duration,
        durationLabel: duration,
        explanation: "Valid chronological settlement timestamp.",
      };
    }

    if (closeMs === openMs) {
      return {
        status: "IDENTICAL",
        isValid: false,
        displayLabel: "Inconsistent (Identical to open timestamp)",
        holdingDuration: null,
        durationLabel: "Unavailable (Identical timestamps)",
        explanation: `Closing timestamp is identical to opening fill time (${trade.closeTimestamp}); no distinct settlement timestamp was logged.`,
      };
    }

    // closeMs < openMs
    return {
      status: "INVALID_CHRONOLOGY",
      isValid: false,
      displayLabel: "Chronologically invalid (Precedes open timestamp)",
      holdingDuration: null,
      durationLabel: "Chronologically invalid (Close < Open)",
      explanation: `Closing timestamp (${trade.closeTimestamp}) chronologically precedes opening timestamp (${trade.timestamp}).`,
    };
  }, [trade.timestamp, trade.closeTimestamp]);

  // Comprehensive Data Integrity & Anomaly Detection
  const anomaly = useMemo(() => {
    const reasons: string[] = [];
    let isDirectionInverted = false;
    let isInitialSlInconsistent = false;
    let isTpInconsistent = false;
    let isExitInconsistent = false;

    // Check chronological timestamp validity
    if (!timestampChronology.isValid) {
      if (timestampChronology.status === "IDENTICAL" || timestampChronology.status === "INVALID_CHRONOLOGY") {
        reasons.push(timestampChronology.explanation);
      }
    }

    if (trade.direction === "BUY") {
      // For BUY: exit should be > entry for winning outcome / TP
      if (
        trade.closePrice != null &&
        trade.closePrice < trade.entryPrice &&
        (rVal > 0 || (trade.status && trade.status.includes("WIN")) || trade.closeReason === "TP1")
      ) {
        isExitInconsistent = true;
        reasons.push(
          `BUY position closed below entry price (exit: ${trade.closePrice} < entry: ${trade.entryPrice}), yet outcome is marked as winning/TP1 (+${rVal}R).`
        );
      }
      // For BUY: initial SL must be below entry price
      if (trade.initialSl != null && trade.initialSl >= trade.entryPrice) {
        isInitialSlInconsistent = true;
        reasons.push(
          trade.initialSl === trade.entryPrice
            ? `Initial Stop Loss equals entry price (${trade.entryPrice}), indicating zero recorded risk distance.`
            : `Initial Stop Loss (${trade.initialSl}) is placed above entry price (${trade.entryPrice}) for a BUY position.`
        );
      }
      // For BUY: TP1 must be above entry price
      if (trade.tp1 != null && trade.tp1 <= trade.entryPrice) {
        isTpInconsistent = true;
        reasons.push(
          `Take Profit 1 target (${trade.tp1}) is at or below entry price (${trade.entryPrice}) for a BUY position.`
        );
      }
    } else if (trade.direction === "SELL") {
      // For SELL: exit should be < entry for winning outcome / TP
      if (
        trade.closePrice != null &&
        trade.closePrice > trade.entryPrice &&
        (rVal > 0 || (trade.status && trade.status.includes("WIN")) || trade.closeReason === "TP1")
      ) {
        isExitInconsistent = true;
        reasons.push(
          `SELL position closed above entry price (exit: ${trade.closePrice} > entry: ${trade.entryPrice}), yet outcome is marked as winning/TP1 (+${rVal}R).`
        );
      }
      // For SELL: initial SL must be above entry price
      if (trade.initialSl != null && trade.initialSl <= trade.entryPrice) {
        isInitialSlInconsistent = true;
        reasons.push(
          trade.initialSl === trade.entryPrice
            ? `Initial Stop Loss equals entry price (${trade.entryPrice}), indicating zero recorded risk distance.`
            : `Initial Stop Loss (${trade.initialSl}) is placed below entry price (${trade.entryPrice}) for a SELL position.`
        );
      }
      // For SELL: TP1 must be below entry price
      if (trade.tp1 != null && trade.tp1 >= trade.entryPrice) {
        isTpInconsistent = true;
        reasons.push(
          `Take Profit 1 target (${trade.tp1}) is at or above entry price (${trade.entryPrice}) for a SELL position.`
        );
      }
    }

    if (String(trade.id).startsWith("vtrade_cap_00000000-") && reasons.length > 0) {
      isDirectionInverted = true;
      reasons.push(
        `Broker activity sync signature (${trade.id.slice(0, 24)}...): Activity record ingested closing counter-order direction rather than opening position direction.`
      );
    }

    return {
      hasAnomaly: reasons.length > 0,
      reasons,
      isDirectionInverted,
      isInitialSlInconsistent,
      isTpInconsistent,
      isExitInconsistent,
      isTimestampInconsistent: timestampChronology.status === "IDENTICAL",
      isTimestampInvalid: timestampChronology.status === "INVALID_CHRONOLOGY",
    };
  }, [
    trade.direction,
    trade.entryPrice,
    trade.closePrice,
    trade.initialSl,
    trade.tp1,
    trade.status,
    trade.closeReason,
    trade.id,
    rVal,
    timestampChronology,
  ]);

  // Original risk in pips (derived calculation)
  const hasInitialSl = typeof trade.initialSl === "number" && !isNaN(trade.initialSl);
  const initialSl = hasInitialSl ? trade.initialSl : null;
  const slPips = useMemo(() => {
    if (!trade.entryPrice || initialSl == null) return null;
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

      {/* ── Data Integrity Notice Banner (displayed when anomaly detected) ─ */}
      {anomaly.hasAnomaly && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 space-y-1.5 select-none animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Data Integrity Notice · Unreconciled Record Anomaly
              </span>
            </div>
            <Badge variant="neutral" size="xs" className="text-amber-400 border-amber-500/30 bg-amber-500/10">
              Verification Pending
            </Badge>
          </div>
          <p className="text-[11px] text-amber-200/90 font-sans leading-relaxed">
            This broker-synchronized trade record contains contradictory execution parameters. Raw data is displayed exactly as ingested from the broker audit log without alteration:
          </p>
          <ul className="text-[10px] list-disc list-inside text-amber-300/80 font-mono space-y-0.5 pt-0.5">
            {anomaly.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Section A: Trade Identity & Outcome Banner ────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-tight whitespace-nowrap shrink-0">
                {trade.pair} {trade.direction} Execution
              </h1>
              <Badge variant="neutral" size="xs">
                {trade.grade ? `Grade ${trade.grade}` : "Grade N/A"}
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
                anomaly.hasAnomaly
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : isWin
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : isBE
                  ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                  : "bg-rose-500/15 text-rose-400 border-rose-500/30"
              }`}
            >
              {formatR(rVal)} ({dollarPnl >= 0 ? `+${formatUSD(dollarPnl)}` : formatUSD(dollarPnl)})
            </span>

            <span
              className={`text-xs font-bold px-2 py-1.5 rounded border ${
                anomaly.hasAnomaly
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-[#111721] border-[#1E2633] text-white"
              }`}
            >
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
                anomaly.hasAnomaly
                  ? "text-amber-400"
                  : isWin
                  ? "text-emerald-400"
                  : isBE
                  ? "text-zinc-300"
                  : "text-rose-400"
              }`}
            >
              {trade.status || (isWin ? "Closed - WIN" : "Closed - LOSS")}
              {anomaly.hasAnomaly && (
                <span className="block text-[9px] text-amber-400/80 font-normal">Unreconciled Anomaly</span>
              )}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Holding Duration</span>
            <span
              className={`font-bold mt-0.5 block ${
                timestampChronology.status === "INVALID_CHRONOLOGY"
                  ? "text-rose-400"
                  : timestampChronology.status === "IDENTICAL"
                  ? "text-amber-400"
                  : "text-white"
              }`}
            >
              {timestampChronology.durationLabel}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Risk Sizing</span>
            <span className="font-bold text-amber-400 mt-0.5 block">
              $25.00 Parity Standard <span className="text-[9px] text-zinc-500 font-normal">(Derived)</span>
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
              {trade.closePrice != null ? formatPairPrice(trade.pair, trade.closePrice) : "Not recorded"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
              {anomaly.isExitInconsistent
                ? `Reason: ${trade.closeReason || "CLOSED"} (Contradicts direction)`
                : `Reason: ${trade.closeReason || "CLOSED"}`}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Original Stop Loss</span>
            <span className="font-bold text-rose-400 text-sm mt-0.5 block tabular-nums">
              {initialSl != null ? formatPairPrice(trade.pair, initialSl) : "Not recorded"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
              {initialSl != null
                ? slPips === 0
                  ? "0.0 pips (SL equals entry · Inconsistent)"
                  : `${slPips} pips planned risk (Derived)`
                : "Level not recorded"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase block">Take Profit 1 (TP1)</span>
            <span className="font-bold text-emerald-400 text-sm mt-0.5 block tabular-nums">
              {trade.tp1 != null ? formatPairPrice(trade.pair, trade.tp1) : "Not recorded"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
              {trade.tp1 != null
                ? anomaly.isTpInconsistent
                  ? "Anomaly: TP1 target conflicts with direction"
                  : trade.closeReason === "TP1"
                  ? "Filled at Target"
                  : "Target Limit"
                : "Target not recorded"}
            </span>
          </div>
        </div>

        {/* Secondary Parameters (TP2, Final SL, Slippage) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <span className="text-zinc-400">Final Settled Stop:</span>
            <span className="font-bold text-white tabular-nums">
              {trade.sl != null ? formatPairPrice(trade.pair, trade.sl) : "Not recorded"}{" "}
              {trade.sl === trade.entryPrice && <strong className="text-cyan-400 text-[10px]">(BE)</strong>}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <span className="text-zinc-400">Target 2 (Runner):</span>
            <span className="font-bold text-zinc-200 tabular-nums">
              {trade.tp2 != null ? formatPairPrice(trade.pair, trade.tp2) : "Not set"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
            <span className="text-zinc-400">Execution Slippage:</span>
            <span
              className={
                typeof trade.fillDriftAtr === "number" && !isNaN(trade.fillDriftAtr)
                  ? trade.fillDriftAtr > 0
                    ? "text-emerald-400 font-bold"
                    : trade.fillDriftAtr < 0
                    ? "text-rose-400 font-bold"
                    : "text-zinc-300 font-bold"
                  : "text-zinc-500 font-normal"
              }
            >
              {typeof trade.fillDriftAtr === "number" && !isNaN(trade.fillDriftAtr)
                ? trade.fillDriftAtr === 0
                  ? "0.00 ATR (Clean Fill)"
                  : `${trade.fillDriftAtr > 0 ? "+" : ""}${trade.fillDriftAtr} ATR (${
                      trade.fillDriftAtr > 0 ? "Favorable" : "Adverse"
                    })`
                : "Not recorded"}
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
            Evidence-Based Trail
          </Badge>
        </div>

        {/* Vertical Timeline Track */}
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1E2633]">
          {/* Milestone 1: Signal Authorization */}
          <div className="relative">
            <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-cyan-400 ring-4 ring-[#0E131A]" />
            <div className="text-xs font-bold text-white flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span>1. Institutional Signal Authorization</span>
              <span className="text-[10px] text-zinc-500 font-mono font-normal">
                {trade.signalId ? "Timestamp unavailable (Signal ID recorded)" : "Timestamp unavailable (Signal unlinked)"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
              {trade.grade ? `Grade ${trade.grade}` : "Institutional"} {trade.direction} signal recorded by{" "}
              <strong>{cleanSetup}</strong> model. Exact authorization timestamp was not logged as a discrete field in the source record.
              {trade.signalId && (
                <span className="block mt-0.5 font-mono text-[10px] text-zinc-500">
                  Signal Identifier: {trade.signalId}
                </span>
              )}
            </p>
          </div>

          {/* Milestone 2: Market Order Filled */}
          <div className="relative">
            <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-[#0E131A]" />
            <div className="text-xs font-bold text-white flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span>2. Position Opened on Capital.com</span>
              <span className="text-[10px] text-emerald-400/80 font-mono font-normal">
                {trade.timestamp ? trade.timestamp : "Timestamp unavailable"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
              Market entry fill recorded at <strong className="text-zinc-200">{formatPairPrice(trade.pair, trade.entryPrice)}</strong>.
              Protection levels: Initial SL{" "}
              <strong className="text-rose-400">{initialSl != null ? formatPairPrice(trade.pair, initialSl) : "Not recorded"}</strong>,
              TP1 target <strong className="text-emerald-400">{trade.tp1 != null ? formatPairPrice(trade.pair, trade.tp1) : "Not recorded"}</strong>.
              <span className="block mt-0.5 text-[10px] text-zinc-500 font-sans">
                (Note: Discrete attachment timestamps for SL/TP are not recorded separately by broker sync).
              </span>
            </p>
          </div>

          {/* Milestone 3: Profit Defense / Breakeven (Strictly conditional on recorded flag) */}
          {(trade.breakevenTriggered || trade.closeReason === "BE") && (
            <div className="relative">
              <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-cyan-400 ring-4 ring-[#0E131A]" />
              <div className="text-xs font-bold text-white flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span>3. Tier-1 Profit Defense Activated (BE Lock)</span>
                <span className="text-[10px] text-zinc-500 font-mono font-normal">
                  Timestamp unavailable
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
                Stop Loss moved to Entry Price (<strong className="text-white">{formatPairPrice(trade.pair, trade.entryPrice)}</strong>).
                Event confirmed by source flag (<strong className="font-mono text-cyan-300">breakevenTriggered: true</strong>); exact modification timestamp was not discretely stored by broker.
              </p>
            </div>
          )}

          {/* Milestone 4: Final Closure & Settlement */}
          <div className="relative">
            <span
              className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full ring-4 ring-[#0E131A] ${
                !timestampChronology.isValid
                  ? timestampChronology.status === "INVALID_CHRONOLOGY"
                    ? "bg-rose-400"
                    : "bg-amber-400"
                  : anomaly.hasAnomaly
                  ? "bg-amber-400"
                  : isWin
                  ? "bg-emerald-400"
                  : isBE
                  ? "bg-zinc-400"
                  : "bg-rose-400"
              }`}
            />
            <div className="text-xs font-bold text-white flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span>
                {(trade.breakevenTriggered || trade.closeReason === "BE") ? "4" : "3"}. Position Closed &amp; Settled
              </span>
              <span
                className={`text-[10px] font-mono font-normal ${
                  timestampChronology.isValid
                    ? "text-zinc-300"
                    : timestampChronology.status === "INVALID_CHRONOLOGY"
                    ? "text-rose-400 font-semibold"
                    : "text-amber-400 font-semibold"
                }`}
              >
                {timestampChronology.displayLabel}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-relaxed">
              Order exited at{" "}
              <strong className="text-zinc-200">
                {trade.closePrice != null ? formatPairPrice(trade.pair, trade.closePrice) : "Not recorded"}
              </strong>{" "}
              via <strong className="text-cyan-400">{trade.closeReason || "CLOSED"}</strong>.
              Realized return:{" "}
              <strong className={anomaly.hasAnomaly ? "text-amber-400" : isWin ? "text-emerald-400" : isBE ? "text-zinc-300" : "text-rose-400"}>
                {formatR(rVal)}
              </strong>{" "}
              ({dollarPnl >= 0 ? `+${formatUSD(dollarPnl)}` : formatUSD(dollarPnl)} derived at $25 risk parity).
              {!timestampChronology.isValid && (
                <span className="block mt-0.5 text-[10px] text-amber-300/80 font-sans">
                  Note: {timestampChronology.explanation}
                </span>
              )}
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
              <span className="text-cyan-400 font-bold">
                {trade.grade ? `Grade ${trade.grade}` : "Not recorded"}
              </span>
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
                {trade.signalId ? trade.signalId : "Not linked"}
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
            <Badge
              variant="neutral"
              size="xs"
              className={
                anomaly.hasAnomaly
                  ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                  : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
              }
            >
              {anomaly.hasAnomaly ? "Data Anomaly Flagged" : "Audit Reconciled"}
            </Badge>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Target 1 Milestone:</span>
              <span
                className={
                  anomaly.isExitInconsistent || anomaly.isTpInconsistent
                    ? "text-amber-400 font-bold"
                    : trade.closeReason === "TP1" && !timestampChronology.isValid
                    ? "text-amber-400 font-bold"
                    : trade.closeReason === "TP1" || rVal >= 0.5
                    ? "text-emerald-400 font-bold"
                    : "text-zinc-400"
                }
              >
                {anomaly.isExitInconsistent || anomaly.isTpInconsistent
                  ? "Unreconciled (Exit contradicts direction)"
                  : trade.closeReason === "TP1" && !timestampChronology.isValid
                  ? "Unreconciled (Closure timestamp inconsistent)"
                  : trade.closeReason === "TP1"
                  ? "REACHED & FILLED"
                  : rVal >= 0.5
                  ? `Milestone Exceeded (${formatR(rVal)})`
                  : "Not Reached"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Stop Loss Triggered:</span>
              <span className={trade.closeReason === "SL" ? "text-rose-400 font-bold" : "text-zinc-400"}>
                {trade.closeReason === "SL"
                  ? "HIT AT FULL RISK"
                  : trade.closeReason === "BE"
                  ? "AVOIDED (Closed at Breakeven)"
                  : isWin
                  ? "AVOIDED (Winning Exit)"
                  : "Not Triggered"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Breakeven Defense:</span>
              <span
                className={
                  trade.breakevenTriggered || trade.closeReason === "BE"
                    ? "text-cyan-400 font-bold"
                    : "text-zinc-400"
                }
              >
                {trade.breakevenTriggered || trade.closeReason === "BE"
                  ? "ACTIVATED (Flag recorded)"
                  : "Not Triggered"}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-zinc-400">Settlement Method:</span>
              <span className="text-white font-bold">
                {trade.closeReason ? trade.closeReason : "Not recorded"}{" "}
                {anomaly.hasAnomaly && <span className="text-amber-400 text-[10px]">(Unreconciled)</span>}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
