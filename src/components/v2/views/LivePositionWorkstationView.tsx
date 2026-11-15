import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronLeft,
  Activity,
  DollarSign,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  Clock,
  Compass,
  Layers,
  Target,
  Lock,
  XCircle,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  HelpCircle,
  Radio,
  Zap,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  Modal,
  formatPairPrice,
  formatUSD,
  formatR,
} from "../ui";
import { backCoordinator } from "../navigation/BackCoordinator";

export interface ActiveBrokerPosition {
  dealId: string;
  pair: string;
  direction: "BUY" | "SELL";
  size: number;
  entryPrice: number;
  stopLevel?: number;
  profitLevel?: number;
  upl: number;
  createdDateUTC?: string;
}

export interface LivePositionWorkstationProps {
  dealId: string;
  openPositions: ActiveBrokerPosition[];
  trades: any[];
  confluenceData: any;
  spreadArmorData: any;
  economicEvents: any;
  accountBalance?: number;
  onClosePosition: (dealId: string) => Promise<void>;
  onUpdateStop: (dealId: string, entryPrice: number, profitLevel?: number) => Promise<void>;
  onBack: () => void;
  onOpenSignalIntelligence?: (pair: string) => void;
  onOpenInstrumentWorkstation?: (pair: string) => void;
}

// ── Instrument Precision & Multiplier Map ───────────────────────────────
function getInstrumentPrecision(pair: string): { precision: number; tickSize: number; pipSize: number } {
  const p = (pair || "").toUpperCase();
  if (p.includes("JPY")) return { precision: 3, tickSize: 0.001, pipSize: 0.01 };
  if (p.includes("XAU")) return { precision: 2, tickSize: 0.01, pipSize: 0.10 };
  if (p.includes("XAG")) return { precision: 2, tickSize: 0.01, pipSize: 0.01 };
  return { precision: 5, tickSize: 0.00001, pipSize: 0.0001 };
}

// ── R-Multiple Evaluation with 10 Rigorous Mathematical Safeguards ───────
export interface RMultipleResult {
  status: "CALCULATED" | "UNAVAILABLE";
  rawR: number | null;
  displayR: string;
  reason?: string;
}

export function evaluateLiveRMultiple(
  direction: "BUY" | "SELL" | string,
  entryPrice: number | null | undefined,
  originalInitialSL: number | null | undefined,
  liveBid: number | null | undefined,
  liveAsk: number | null | undefined,
  isDataFresh: boolean
): RMultipleResult {
  // Safeguard 1: Freshness verification (stale market data returns Unavailable)
  if (!isDataFresh) {
    return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Market data stale or delayed" };
  }

  // Safeguard 2: Number.isFinite validation on all 4 required price levels
  if (
    typeof entryPrice !== "number" || !Number.isFinite(entryPrice) ||
    typeof originalInitialSL !== "number" || !Number.isFinite(originalInitialSL) ||
    typeof liveBid !== "number" || !Number.isFinite(liveBid) ||
    typeof liveAsk !== "number" || !Number.isFinite(liveAsk)
  ) {
    return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Incomplete price inputs" };
  }

  // Safeguard 3: Positive and valid quotes
  if (entryPrice <= 0 || originalInitialSL <= 0 || liveBid <= 0 || liveAsk <= 0) {
    return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Non-positive price quote" };
  }

  // Safeguard 4: Strict BUY / SELL direction validation
  if (direction !== "BUY" && direction !== "SELL") {
    return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Invalid contract direction" };
  }

  // Safeguard 5: Reject crossed or locked quotes (Bid must be < Ask)
  if (liveBid >= liveAsk) {
    return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Crossed or locked quotes" };
  }

  let unroundedR = 0;

  if (direction === "BUY") {
    // Safeguard 6: Correct direction-specific risk denominator (entry - initialSL)
    const riskDenominator = entryPrice - originalInitialSL;
    if (riskDenominator <= 0) {
      return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Initial SL >= Entry for BUY" };
    }

    // Safeguard 7: BUY exit valued strictly at executable Bid
    const executableExit = liveBid;
    const gainNumerator = executableExit - entryPrice;
    unroundedR = gainNumerator / riskDenominator;
  } else {
    // Safeguard 8: Correct direction-specific risk denominator (initialSL - entry)
    const riskDenominator = originalInitialSL - entryPrice;
    if (riskDenominator <= 0) {
      return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Initial SL <= Entry for SELL" };
    }

    // Safeguard 9: SELL exit valued strictly at executable Ask
    const executableExit = liveAsk;
    const gainNumerator = entryPrice - executableExit;
    unroundedR = gainNumerator / riskDenominator;
  }

  // Safeguard 10: Validate finite result and preserve unrounded R for milestones
  if (!Number.isFinite(unroundedR)) {
    return { status: "UNAVAILABLE", rawR: null, displayR: "Unavailable", reason: "Non-finite R result" };
  }

  const displayR = `${unroundedR >= 0 ? "+" : ""}${unroundedR.toFixed(2)}R`;

  return {
    status: "CALCULATED",
    rawR: unroundedR,
    displayR,
  };
}

// ── Tick-Aware Stop Classification (Normalized Integer Ticks) ────────────
export function classifyBrokerStopByTick(
  direction: "BUY" | "SELL" | string,
  entryPrice: number | null | undefined,
  stopLevel: number | null | undefined,
  initialSl: number | null | undefined,
  precision: number
): { status: string; label: string; badgeVariant: "success" | "warning" | "danger" | "neutral" } {
  if (
    typeof entryPrice !== "number" || !Number.isFinite(entryPrice) || entryPrice <= 0 ||
    typeof stopLevel !== "number" || !Number.isFinite(stopLevel) || stopLevel <= 0 ||
    (direction !== "BUY" && direction !== "SELL")
  ) {
    return { status: "UNAVAILABLE", label: "STOP STATUS UNAVAILABLE", badgeVariant: "neutral" };
  }

  const multiplier = Math.pow(10, precision);
  const entryTick = Math.round(entryPrice * multiplier);
  const stopTick = Math.round(stopLevel * multiplier);
  const initialSlTick = (typeof initialSl === "number" && Number.isFinite(initialSl) && initialSl > 0)
    ? Math.round(initialSl * multiplier)
    : null;

  // Signed tick difference relative to entry:
  // For BUY: positive means stop is above entry (profit); negative means below entry (adverse).
  // For SELL: positive means stop is below entry (profit); negative means above entry (adverse).
  const tickDelta = direction === "BUY" ? (stopTick - entryTick) : (entryTick - stopTick);

  if (tickDelta === 0) {
    return { status: "BE_CONFIRMED", label: "STOP CONFIRMED AT BREAKEVEN", badgeVariant: "success" };
  }

  if (tickDelta > 0) {
    return { status: "PROFIT_STOP", label: "PROFIT STOP CONFIRMED", badgeVariant: "success" };
  }

  // tickDelta < 0: stop is one or more ticks on the adverse side
  if (initialSlTick !== null) {
    const isBeyondInitialSl = direction === "BUY"
      ? (stopTick < initialSlTick)
      : (stopTick > initialSlTick);

    if (isBeyondInitialSl) {
      return { status: "INCONSISTENT", label: "STOP INCONSISTENT WITH DIRECTION", badgeVariant: "danger" };
    }
  }

  return { status: "NOT_CONFIRMED", label: "STOP UPDATE NOT CONFIRMED", badgeVariant: "warning" };
}

export const LivePositionWorkstationView: React.FC<LivePositionWorkstationProps> = ({
  dealId,
  openPositions,
  trades,
  confluenceData,
  spreadArmorData,
  economicEvents,
  accountBalance = 10873.67,
  onClosePosition,
  onUpdateStop,
  onBack,
  onOpenSignalIntelligence,
  onOpenInstrumentWorkstation,
}) => {
  // ── Modal State Management (100% Reuse of Phase A Infrastructure) ───────
  const [confirmClosePos, setConfirmClosePos] = useState<ActiveBrokerPosition | null>(null);
  const [confirmBePos, setConfirmBePos] = useState<ActiveBrokerPosition | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Find targeted active position
  const activePosition = useMemo(() => {
    return openPositions.find((p) => p.dealId === dealId) || openPositions[0] || null;
  }, [openPositions, dealId]);

  const pair = activePosition?.pair || "EUR/USD";
  const { precision, pipSize } = useMemo(() => getInstrumentPrecision(pair), [pair]);

  // Linked VirtualTrade in database audit logs
  const linkedTrade = useMemo(() => {
    if (!activePosition) return null;
    return (
      trades.find(
        (t) =>
          t.dealReference === activePosition.dealId ||
          t.id === `vtrade_cap_${activePosition.dealId}` ||
          String(t.id).includes(activePosition.dealId)
      ) ||
      trades.find((t) => t.pair === activePosition.pair && t.status === "Open") ||
      null
    );
  }, [trades, activePosition]);

  // Live price quote for this instrument
  const pairConfluence = useMemo(() => {
    return (confluenceData?.pairs || []).find((p: any) => p.pair === pair) || null;
  }, [confluenceData, pair]);

  const livePrice = pairConfluence?.livePrice || null;
  const liveBid = typeof livePrice?.bid === "number" ? livePrice.bid : null;
  const liveAsk = typeof livePrice?.ask === "number" ? livePrice.ask : null;
  const liveSpread = typeof livePrice?.spread_pips === "number" ? livePrice.spread_pips : null;

  // Quote freshness derived from server's scannedAt timestamp
  const scannedAt = confluenceData?.scannedAt || null;
  const freshness = useMemo(() => {
    if (!scannedAt) {
      return { label: "Awaiting scan", isFresh: false, color: "text-zinc-500", dot: "bg-zinc-600" };
    }
    const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(scannedAt).getTime()) / 1000));
    if (ageSeconds < 90) {
      return { label: `Live (${ageSeconds}s ago)`, isFresh: true, color: "text-emerald-400", dot: "bg-emerald-400 animate-pulse" };
    }
    if (ageSeconds < 180) {
      return { label: `Delayed (${Math.floor(ageSeconds / 60)}m ago)`, isFresh: true, color: "text-amber-400", dot: "bg-amber-400" };
    }
    return { label: `Stale (>${Math.floor(ageSeconds / 60)}m ago)`, isFresh: false, color: "text-rose-400", dot: "bg-rose-400" };
  }, [scannedAt]);

  // Original Initial Stop Loss
  const initialSl = useMemo(() => {
    if (linkedTrade && typeof linkedTrade.initialSl === "number" && Number.isFinite(linkedTrade.initialSl)) {
      return linkedTrade.initialSl;
    }
    return null;
  }, [linkedTrade]);

  // Direction-Aware Live R-Multiple Evaluation
  const rEvaluation = useMemo(() => {
    if (!activePosition) return { status: "UNAVAILABLE" as const, rawR: null, displayR: "Unavailable" };
    return evaluateLiveRMultiple(
      activePosition.direction,
      activePosition.entryPrice,
      initialSl,
      liveBid,
      liveAsk,
      freshness.isFresh
    );
  }, [activePosition, initialSl, liveBid, liveAsk, freshness.isFresh]);

  // Tick-Aware Stop Confirmation Status
  const stopClassification = useMemo(() => {
    if (!activePosition) return { status: "UNAVAILABLE", label: "STOP STATUS UNAVAILABLE", badgeVariant: "neutral" as const };
    return classifyBrokerStopByTick(
      activePosition.direction,
      activePosition.entryPrice,
      activePosition.stopLevel,
      initialSl,
      precision
    );
  }, [activePosition, initialSl, precision]);

  // Elapsed Holding Duration (Calculated from createdDateUTC)
  const elapsedDuration = useMemo(() => {
    if (!activePosition?.createdDateUTC) return "Not recorded";
    try {
      const openMs = new Date(activePosition.createdDateUTC).getTime();
      const diffMs = Date.now() - openMs;
      if (diffMs <= 0 || isNaN(diffMs)) return "Just opened";
      const totalMins = Math.floor(diffMs / (60 * 1000));
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    } catch {
      return "Not recorded";
    }
  }, [activePosition?.createdDateUTC]);

  // Spread Armor status from /api/spread-armor
  const armorItem = useMemo(() => {
    return (spreadArmorData?.pairs || []).find((p: any) => p.pair === pair) || null;
  }, [spreadArmorData, pair]);

  const unitLabel = pair.includes("XAU") || pair.includes("XAG") ? "Troy Oz" : "Units";

  // ── Phase A Modal Action Handlers ─────────────────────────────────────────
  const handleCloseModal = () => {
    if (actionLoading) return;
    setConfirmClosePos(null);
    setConfirmBePos(null);
    setActionError(null);
  };

  const handleConfirmClose = async () => {
    if (!confirmClosePos) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await onClosePosition(confirmClosePos.dealId);
      setConfirmClosePos(null);
      onBack();
    } catch (err: any) {
      console.error("[WORKSTATION] Close error:", err);
      setActionError(err.message || "Failed to close position on broker. Please retry.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBe = async () => {
    if (!confirmBePos) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await onUpdateStop(confirmBePos.dealId, confirmBePos.entryPrice, confirmBePos.profitLevel);
      setConfirmBePos(null);
    } catch (err: any) {
      console.error("[WORKSTATION] Update stop error:", err);
      setActionError(err.message || "Failed to move stop to Breakeven on broker. Please retry.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── FLAT STANDBY STATE (When zero positions are active) ───────────────────
  if (!activePosition) {
    return (
      <div className="space-y-4 font-mono select-none overflow-x-hidden animate-in fade-in slide-in-from-right-3 duration-200 pb-36">
        {/* Top Navigation */}
        <div className="flex items-center justify-between gap-2.5">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group shrink-0 whitespace-nowrap"
            title="Return to Terminal Cockpit"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform shrink-0" />
            <span className="font-semibold whitespace-nowrap">Terminal</span>
            <span className="text-zinc-600">/</span>
            <span className="text-white font-bold whitespace-nowrap">Live Positions</span>
          </button>

          <Badge variant="neutral" size="xs">
            NO OPEN POSITION
          </Badge>
        </div>

        {/* Factual Standby Card */}
        <Card variant="default" padding="md" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
            <div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                <h1 className="text-lg font-black text-white tracking-tight">
                  Market Status: NO OPEN POSITION
                </h1>
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-sans">
                Account has no open market commitments on Capital.com demo.
              </p>
            </div>

            <Badge variant="neutral" size="sm">
              Open Positions: 0 of 2 Max
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Account Cash Balance</span>
              <span className="text-sm font-bold text-white mt-1 block tabular-nums">
                {formatUSD(accountBalance)}
              </span>
              <span className="text-[10px] text-zinc-500 font-sans block mt-0.5">
                Authoritative balance from broker
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Active Exposure</span>
              <span className="text-sm font-bold text-emerald-400 mt-1 block tabular-nums">
                0 Active Deals
              </span>
              <span className="text-[10px] text-zinc-500 font-sans block mt-0.5">
                0.00R active position risk
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Latest Server Scan</span>
              <span className="text-xs font-bold text-zinc-300 mt-1 block">
                {scannedAt ? `${scannedAt.substring(11, 19)} UTC` : "Awaiting scan"}
              </span>
              <span className={`text-[10px] block mt-0.5 ${freshness.color}`}>
                Freshness: {freshness.label}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 font-sans space-y-1">
            <div className="text-zinc-200 font-bold uppercase text-[10px]">
              Institutional Monitoring Notice
            </div>
            <p>
              Autonomous cloud scanning engine is monitoring all 4 core markets (EUR/USD, GBP/JPY, XAU/USD, XAG/USD). Trades execute automatically when confirmed setups satisfy the 80% confluence threshold.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ── ACTIVE POSITION WORKSTATION (When position exists) ───────────────────
  const isBuy = activePosition.direction === "BUY";
  const isProfit = Number(activePosition.upl) >= 0;
  const isBeEligible =
    activePosition.entryPrice &&
    stopClassification.status !== "BE_CONFIRMED" &&
    stopClassification.status !== "PROFIT_STOP";

  return (
    <div className="space-y-4 font-mono select-none overflow-x-hidden animate-in fade-in slide-in-from-right-3 duration-200 pb-36">
      {/* ── Top Navigation & Breadcrumbs ──── */}
      <div className="flex items-center justify-between gap-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group shrink-0 whitespace-nowrap"
          title="Return to Previous View"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform shrink-0" />
          <span className="font-semibold whitespace-nowrap">Terminal</span>
          <span className="text-zinc-600">/</span>
          <span className="text-white font-bold whitespace-nowrap">{pair}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-emerald-400 font-normal whitespace-nowrap">Live Position Forensics</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Badge variant={isBuy ? "buy" : "sell"} size="sm">
            {isBuy ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {activePosition.direction}
          </Badge>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 whitespace-nowrap shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot} shrink-0`} />
            <span className={freshness.color}>{freshness.label}</span>
          </div>
        </div>
      </div>

      {/* ── Section 1: Active Position Lifecycle Hero Card ────────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-tight whitespace-nowrap shrink-0">
                {pair} {activePosition.direction} Active Deal
              </h1>
              <Badge variant="neutral" size="xs">
                {activePosition.size} {unitLabel}
              </Badge>
              <Badge variant="neutral" size="xs" className="font-mono text-[10px]">
                Deal: {activePosition.dealId.slice(0, 16)}...
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">
              Opened: <strong className="text-zinc-200">{activePosition.createdDateUTC || "Recent"}</strong> · Elapsed Duration: <strong className="text-white">{elapsedDuration}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 uppercase block font-mono">Floating P&amp;L</span>
              <span
                className={`text-lg font-black px-2.5 py-1 rounded border inline-block tabular-nums ${
                  isProfit
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                }`}
              >
                {isProfit ? `+${formatUSD(activePosition.upl)}` : formatUSD(activePosition.upl)}{" "}
                <span className="text-xs font-bold ml-1 font-mono">({rEvaluation.displayR})</span>
              </span>
            </div>
          </div>
        </div>

        {/* 4-Metric Quick Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Entry Fill Price</span>
            <span className="font-bold text-white text-sm mt-0.5 block tabular-nums">
              {formatPairPrice(pair, activePosition.entryPrice)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Current Broker Stop</span>
            <span className="font-bold text-rose-400 text-sm mt-0.5 block tabular-nums">
              {activePosition.stopLevel != null ? formatPairPrice(pair, activePosition.stopLevel) : "Not set"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Take Profit Target</span>
            <span className="font-bold text-emerald-400 text-sm mt-0.5 block tabular-nums">
              {activePosition.profitLevel != null ? formatPairPrice(pair, activePosition.profitLevel) : "Not set"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Stop Confirmation</span>
            <span className={`font-bold text-xs mt-0.5 block truncate ${
              stopClassification.badgeVariant === "success" ? "text-emerald-400" :
              stopClassification.badgeVariant === "danger" ? "text-rose-400" : "text-amber-400"
            }`}>
              {stopClassification.label}
            </span>
          </div>
        </div>
      </Card>

      {/* ── Section 2: Profit Defense & Stop Status Trajectory ─────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Profit Defense &amp; Stop Status Trajectory
            </h3>
          </div>
          <Badge variant={stopClassification.badgeVariant} size="xs">
            {stopClassification.label}
          </Badge>
        </div>

        <div className="space-y-3 text-xs">
          {/* Milestone Progress Track */}
          <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-zinc-400">Autonomous Price Milestone Trajectory:</span>
              <span className="font-bold text-white tabular-nums">
                Current: {rEvaluation.displayR}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`p-2.5 rounded-lg border ${
                rEvaluation.rawR !== null && rEvaluation.rawR >= 0.75
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400"
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span>+0.75R Milestone</span>
                  <span>{rEvaluation.rawR !== null && rEvaluation.rawR >= 0.75 ? "REACHED" : "PENDING"}</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-sans block mt-0.5">
                  Tier-1 Breakeven Trigger Level
                </span>
              </div>

              <div className={`p-2.5 rounded-lg border ${
                rEvaluation.rawR !== null && rEvaluation.rawR >= 1.25
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-zinc-950 border-zinc-800 text-zinc-400"
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span>+1.25R Milestone</span>
                  <span>{rEvaluation.rawR !== null && rEvaluation.rawR >= 1.25 ? "REACHED" : "PENDING"}</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-sans block mt-0.5">
                  Tier-2 +0.50R Profit Trailing Trigger
                </span>
              </div>
            </div>

            <div className="text-[10px] text-zinc-500 font-sans pt-1">
              Note: Reaching price milestones represents a price trigger only. Stop status is confirmed strictly when the broker stop order is verified at that price level.
            </div>
          </div>

          {/* Initial vs Active Stop Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Original Planned Stop Loss</span>
              <span className="text-sm font-bold text-rose-400 mt-0.5 block tabular-nums">
                {initialSl != null ? formatPairPrice(pair, initialSl) : "Not available (Unlinked deal)"}
              </span>
              <span className="text-[10px] text-zinc-500 font-sans block mt-0.5">
                Recorded risk baseline for R calculation
              </span>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Active Broker Stop</span>
              <span className="text-sm font-bold text-white mt-0.5 block tabular-nums">
                {activePosition.stopLevel != null ? formatPairPrice(pair, activePosition.stopLevel) : "Not set"}
              </span>
              <span className="text-[10px] text-zinc-500 font-sans block mt-0.5">
                Current order attached on Capital.com
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
            <strong className="text-zinc-300">Stop Defense Notice:</strong> Confirmed breakeven stops represent stop order placement at entry price on Capital.com. This does not guarantee zero monetary loss, as spread friction, financing rollover fees, and execution slippage remain possible.
          </div>
        </div>
      </Card>

      {/* ── Section 3: Execution & Spread Intelligence ─────────────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Execution &amp; Spread Intelligence
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Executable Liquidity
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Entry Fill</span>
            <span className="font-bold text-white mt-0.5 block tabular-nums">
              {formatPairPrice(pair, activePosition.entryPrice)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">
              Executable Exit ({isBuy ? "Bid" : "Ask"})
            </span>
            <span className="font-bold text-white mt-0.5 block tabular-nums">
              {isBuy ? (liveBid != null ? formatPairPrice(pair, liveBid) : "Not available") : (liveAsk != null ? formatPairPrice(pair, liveAsk) : "Not available")}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Current Spread</span>
            <span className="font-bold text-emerald-400 mt-0.5 block tabular-nums">
              {liveSpread != null ? `${liveSpread} pips` : "Not available"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Recorded Entry Drift</span>
            <span className="font-bold text-zinc-200 mt-0.5 block">
              {typeof linkedTrade?.fillDriftAtr === "number"
                ? `${linkedTrade.fillDriftAtr > 0 ? "+" : ""}${linkedTrade.fillDriftAtr} ATR`
                : "Not recorded"}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
          <strong className="text-zinc-300">Spread Accuracy Policy:</strong> Current spread represents live broker bid-ask friction and is strictly reported in pips. Spread friction is never labeled as slippage.
        </div>
      </Card>

      {/* ── Section 4: Strategy Origin & Confluence Evidence ──────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-purple-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Strategy Origin &amp; Confluence Context
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Signal Attribution
          </Badge>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Originating Setup Model</span>
              <span className="font-bold text-cyan-400 text-sm mt-0.5 block truncate">
                {linkedTrade?.setupType || "Manual Broker Execution"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Originating Grade</span>
              <span className="font-bold text-white text-sm mt-0.5 block">
                {linkedTrade?.grade ? `Grade ${linkedTrade.grade}` : "Not recorded"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Signal Reference ID</span>
              <span className="font-mono text-[11px] text-zinc-300 mt-0.5 block truncate">
                {linkedTrade?.signalId || "Unlinked"}
              </span>
            </div>
          </div>

          {/* Current Confluence Scan Card */}
          <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">
                Current Market Confluence (Active Conditions — Not Entry-Time State)
              </span>
              <p className="text-xs text-zinc-200 font-sans mt-0.5">
                Current engine evaluation: <strong className="text-white">{pairConfluence?.score ?? "—"}%</strong> score ({pairConfluence?.confluenceGrade ?? "WAIT"})
              </p>
            </div>

            {onOpenSignalIntelligence && (
              <button
                onClick={() => onOpenSignalIntelligence(pair)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white transition-all cursor-pointer text-xs shrink-0 self-start sm:self-auto group"
                title="Open Signal Intelligence Workstation"
              >
                <span className="font-bold whitespace-nowrap">Audit Confluence Gates →</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
            <strong className="text-zinc-300">Data Preservation Notice:</strong> Historical entry-time checklist was not serialized into the trade log. Live confluence metrics represent current market structure and are not substituted for entry-time evidence.
          </div>
        </div>
      </Card>

      {/* ── Section 5: Capital Defense & Macro News Proximity ──────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Capital Defense &amp; Macro Proximity
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Risk Armor
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">
              Guard 2: Macro News Lockout
            </span>
            <div className="flex items-center justify-between">
              <span className="text-white font-bold">
                {economicEvents?.isLockoutActive ? "ACTIVE (Entries Frozen)" : "CLEAR (Standby)"}
              </span>
              <Badge variant={economicEvents?.isLockoutActive ? "danger" : "success"} size="xs">
                {economicEvents?.isLockoutActive ? "LOCKOUT" : "SAFE"}
              </Badge>
            </div>
            <p className="text-[10px] text-zinc-400 font-sans">
              Next Tier-1: {economicEvents?.nextHighImpact ? `${economicEvents.nextHighImpact.title} (${economicEvents.nextHighImpact.country})` : "None imminent"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">
              Guard 0A: Weekend Flattener Policy
            </span>
            <div className="flex items-center justify-between">
              <span className="text-white font-bold">Configured Policy Schedule</span>
              <Badge variant="neutral" size="xs">Enforced Weekly</Badge>
            </div>
            <p className="text-[10px] text-zinc-400 font-sans">
              Friday 17:00 UTC (18:00 WAT) Lockout · 20:00 UTC (21:00 WAT) Auto-Flattener
            </p>
          </div>
        </div>
      </Card>

      {/* ── Section 6: Level-2 Protected Emergency Manual Controls ─────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Emergency Manual Risk Controls (Protected)
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Phase A Confirmation
          </Badge>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-white block">Manual Trade Interventions</span>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
              Requires 2-step confirmation modal before dispatching orders to Capital.com.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isBeEligible && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmBePos(activePosition)}
                icon={<Lock className="w-3.5 h-3.5 text-cyan-400" />}
              >
                Lock Breakeven
              </Button>
            )}

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmClosePos(activePosition)}
              icon={<XCircle className="w-3.5 h-3.5" />}
            >
              Close Position at Market
            </Button>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Safety Protocol:</strong> All manual actions re-use the approved Phase A confirmation modals with synchronous re-entrancy locks and native Android Back dismissal. Zero unconfirmed mutating actions exist on this workstation.
          </span>
        </div>
      </Card>

      {/* ── Phase A Reusable Confirmation Modal: Close at Market ────────────── */}
      <Modal
        isOpen={!!confirmClosePos}
        onClose={handleCloseModal}
        onConfirm={handleConfirmClose}
        variant="destructive"
        isLoading={actionLoading}
        title="Close Position at Market?"
        confirmText="Confirm Market Close"
        cancelText="Keep Position Open"
        description={
          confirmClosePos && (
            <div className="space-y-2.5 mt-1 font-sans">
              <p className="text-zinc-200">
                You are about to close your active <strong>{confirmClosePos.pair} {confirmClosePos.direction}</strong> position at market price on Capital.com.
              </p>
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Position Size:</span>
                  <span className="text-white font-semibold">
                    {confirmClosePos.size} {unitLabel}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Entry Fill:</span>
                  <span className="text-white font-mono">{confirmClosePos.entryPrice}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-zinc-800/80">
                  <span className="text-zinc-500">Floating P&amp;L:</span>
                  <span className={`font-bold tabular-nums ${Number(confirmClosePos.upl) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {Number(confirmClosePos.upl) >= 0 ? `+${formatUSD(confirmClosePos.upl)}` : formatUSD(confirmClosePos.upl)}
                  </span>
                </div>
              </div>

              {actionError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <p className="text-[11px] text-zinc-400 leading-tight">
                This trade will close immediately at current broker market liquidity. This action cannot be reversed.
              </p>
            </div>
          )
        }
      />

      {/* ── Phase A Reusable Confirmation Modal: Lock Breakeven ─────────────── */}
      <Modal
        isOpen={!!confirmBePos}
        onClose={handleCloseModal}
        onConfirm={handleConfirmBe}
        variant="warning"
        isLoading={actionLoading}
        title="Lock Stop Loss at Breakeven?"
        confirmText="Confirm Breakeven Lock"
        cancelText="Cancel"
        description={
          confirmBePos && (
            <div className="space-y-2.5 mt-1 font-sans">
              <p className="text-zinc-200">
                You are about to adjust your active <strong>{confirmBePos.pair} {confirmBePos.direction}</strong> Stop Loss directly to your entry fill price on Capital.com.
              </p>
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Entry Fill Level:</span>
                  <span className="text-white font-mono">{confirmBePos.entryPrice}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">New Stop Loss:</span>
                  <span className="text-emerald-400 font-bold">{confirmBePos.entryPrice}</span>
                </div>
              </div>

              {actionError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <p className="text-[11px] text-zinc-400 leading-tight">
                Adjusts stop level on Capital.com broker order. Your Take Profit level will remain strictly preserved.
              </p>
            </div>
          )
        }
      />
    </div>
  );
};
