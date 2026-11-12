import React, { useMemo } from "react";
import {
  ChevronLeft,
  Zap,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  Clock,
  Compass,
  Layers,
  Target,
  ExternalLink,
  CheckCircle2,
  XCircle,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Radio,
  Lock,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  RadialGauge,
  formatPairPrice,
  formatUSD,
} from "../ui";

export interface SignalIntelligenceProps {
  pair: string;
  pairName: string;
  category: string;
  confluenceRecord: any;
  capitalStatus?: any;
  spreadArmorData?: any;
  scannedAt?: string;
  onBack: () => void;
  onOpenInstrumentWorkstation?: (pair: string) => void;
}

export function parseBackendCheck(checkStr: string) {
  if (typeof checkStr !== "string" || !checkStr.trim()) {
    return { status: "UNKNOWN" as const, label: "Unknown", title: "Unspecified Check", detail: "Not available" };
  }
  const match = checkStr.match(/^\[(OK|INFO|X|SCORE)\]\s*(.*)$/i);
  if (!match) {
    return { status: "UNKNOWN" as const, label: "Unknown", title: checkStr, detail: "Status not specified" };
  }
  const tag = match[1].toUpperCase();
  const body = match[2];
  const colonIdx = body.indexOf(":");
  const title = colonIdx !== -1 ? body.substring(0, colonIdx).trim() : body.trim();
  const detail = colonIdx !== -1 ? body.substring(colonIdx + 1).trim() : body.trim();

  let status: "PASS" | "INFO" | "FAIL" | "SCORE" | "UNKNOWN" = "UNKNOWN";
  let label = "Unknown";
  if (tag === "OK") { status = "PASS"; label = "Pass"; }
  else if (tag === "INFO") { status = "INFO"; label = "Info"; }
  else if (tag === "X") { status = "FAIL"; label = "Fail"; }
  else if (tag === "SCORE") { status = "SCORE"; label = "Verdict"; }
  else { status = "UNKNOWN"; label = "Unknown"; }

  return { status, label, title, detail };
}

export const SignalIntelligenceView: React.FC<SignalIntelligenceProps> = ({
  pair,
  pairName,
  category,
  confluenceRecord,
  capitalStatus,
  spreadArmorData,
  scannedAt,
  onBack,
  onOpenInstrumentWorkstation,
}) => {
  // ── 1. Authoritative Backend Confluence Fields ─────────────────────────
  const score = typeof confluenceRecord?.score === "number" ? confluenceRecord.score : null;
  const grade = confluenceRecord?.confluenceGrade || "WAIT";
  const rawEngine = confluenceRecord?.gradeAEngine || "Institutional SMC";
  const cleanEngine = rawEngine.replace(/\s*\([^\)]*\)\s*/g, "").trim() || "Institutional SMC";

  // ── 2. Market Data Freshness Calculation (Strictly server scannedAt) ───
  const freshness = useMemo(() => {
    if (!scannedAt) {
      return {
        label: "Awaiting scan",
        color: "text-zinc-500",
        dot: "bg-zinc-600",
        status: "UNAVAILABLE",
      };
    }
    const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(scannedAt).getTime()) / 1000));
    if (ageSeconds < 90) {
      return {
        label: `Live (${ageSeconds}s ago)`,
        color: "text-emerald-400",
        dot: "bg-emerald-400 animate-pulse",
        status: "LIVE",
      };
    }
    if (ageSeconds < 180) {
      return {
        label: `Delayed (${Math.floor(ageSeconds / 60)}m ago)`,
        color: "text-amber-400",
        dot: "bg-amber-400",
        status: "DELAYED",
      };
    }
    return {
      label: `Stale (>${Math.floor(ageSeconds / 60)}m ago)`,
      color: "text-rose-400",
      dot: "bg-rose-400",
      status: "STALE",
    };
  }, [scannedAt]);

  // ── 3. Diagnostic Scoring Breakdown from Server ───────────────────────
  const breakdown = confluenceRecord?.scoreBreakdown || null;

  // Real backend scoring components (matches server.ts scoreBreakdown structure)
  const components = useMemo(() => {
    if (!breakdown) return [];

    const list = [
      {
        rawKey: "trend",
        name: "Macro H1 Trend Structure",
        earned: typeof breakdown.trend === "number" ? breakdown.trend : 0,
        max: 25,
      },
      {
        rawKey: "sweep",
        name: "Liquidity Pool Sweep Mechanics",
        earned: typeof breakdown.sweep === "number" ? breakdown.sweep : 0,
        max: 25,
      },
      {
        rawKey: "session",
        name: "Session Execution Window",
        earned: typeof breakdown.session === "number" ? breakdown.session : 0,
        max: 20,
      },
      {
        rawKey: "displacement",
        name: "Displacement & Rejection Power",
        earned: typeof breakdown.displacement === "number" ? breakdown.displacement : 0,
        max: 15,
      },
      {
        rawKey: "risk",
        name: "Spread & Volatility Risk Gate",
        earned: typeof breakdown.risk === "number" ? breakdown.risk : 0,
        max: 15,
      },
    ];

    // Model agreement bonus component if returned by backend
    if (typeof breakdown.bonus === "number" && breakdown.bonus > 0) {
      list.push({
        rawKey: "bonus",
        name: "Multi-Engine Model Agreement",
        earned: breakdown.bonus,
        max: 10,
      });
    }

    return list;
  }, [breakdown]);

  // Total points sum verification
  const componentPointsSum = useMemo(() => {
    return components.reduce((sum, c) => sum + c.earned, 0);
  }, [components]);

  // ── 4. Liquidity Pools & 20-Bar Structural Extremes ────────────────────
  const m15High = typeof confluenceRecord?.m15High === "number" ? confluenceRecord.m15High : null;
  const m15Low = typeof confluenceRecord?.m15Low === "number" ? confluenceRecord.m15Low : null;

  // Structural labels: Default strictly to "20-Bar High" / "20-Bar Low"
  // Only tag BSL or SSL when backend explicitly confirms sweep occurrence
  const isHighSwept = useMemo(() => {
    return (confluenceRecord?.checks || []).some(
      (c: string) => c.includes("SELL Sweep") || (c.includes("Sweep") && c.includes("high"))
    );
  }, [confluenceRecord?.checks]);

  const isLowSwept = useMemo(() => {
    return (confluenceRecord?.checks || []).some(
      (c: string) => c.includes("BUY Sweep") || (c.includes("Sweep") && c.includes("low"))
    );
  }, [confluenceRecord?.checks]);

  const highLabel = isHighSwept ? "Buy-Side Liquidity (BSL Swept)" : "20-Bar High";
  const lowLabel = isLowSwept ? "Sell-Side Liquidity (SSL Swept)" : "20-Bar Low";

  // ── 5. Position & Risk Read-Only Telemetry ─────────────────────────────
  const openPositions = capitalStatus?.openPositions || [];
  const activePosition = useMemo(() => {
    return openPositions.find((pos: any) => pos.pair === pair) || null;
  }, [openPositions, pair]);

  const unitLabel = pair.includes("XAU") || pair.includes("XAG") ? "Troy Oz" : "Units";

  // Execution plan parameters: render ONLY when genuinely supplied by backend
  const hasExecutionPlan =
    confluenceRecord?.entryPrice != null &&
    confluenceRecord?.sl != null &&
    confluenceRecord?.tp1 != null;

  // Spread armor item from /api/spread-armor
  const armorItem = (spreadArmorData?.pairs || []).find((a: any) => a.pair === pair) || null;
  const isArmorLocked = armorItem?.isLocked ?? false;

  // Documented cash risk source: read directly from backend cashRisk if populated
  const backendCashRisk = typeof confluenceRecord?.cashRisk === "number" && confluenceRecord.cashRisk > 0
    ? formatUSD(confluenceRecord.cashRisk)
    : "Not available";

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
          <span className="text-emerald-400 font-normal whitespace-nowrap">Confluence Intelligence</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Badge
            variant={
              grade === "A+" || grade === "A"
                ? "success"
                : grade === "B+"
                ? "warning"
                : "neutral"
            }
            size="xs"
            className="whitespace-nowrap shrink-0"
          >
            Backend Grade: {grade}
          </Badge>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 whitespace-nowrap shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${freshness.dot} shrink-0`} />
            <span className={freshness.color}>{freshness.label}</span>
          </div>
        </div>
      </div>

      {/* ── Section A: Algorithmic Conviction Hero Card ──────────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-tight whitespace-nowrap shrink-0">
                {pair} Confluence Intelligence
              </h1>
              <span className="text-xs text-zinc-400 font-sans truncate">· {pairName}</span>
              <Badge variant="neutral" size="xs">
                {cleanEngine}
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">
              Authoritative scoring evaluation from <strong className="text-zinc-200">/api/confluence/scan</strong>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenInstrumentWorkstation && (
              <button
                onClick={() => onOpenInstrumentWorkstation(pair)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white transition-all cursor-pointer text-xs shrink-0 group"
                title="Inspect TradingView Candlestick Chart"
              >
                <span className="font-bold whitespace-nowrap">View Live Chart</span>
                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            )}
          </div>
        </div>

        {/* Central Radial Score Display & Gating Summary */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-[#111721] border border-[#1A222F]">
            <RadialGauge
              score={score ?? 0}
              grade={grade}
              label="Composite Score"
              size={110}
              strokeWidth={9}
            />
            <span className="text-[10px] text-zinc-500 mt-2 font-mono text-center block">
              Max Score: 100 Points
            </span>
          </div>

          <div className="md:col-span-8 space-y-2 text-xs">
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Backend Grade Verdict</span>
                <Badge
                  variant={grade === "A+" || grade === "A" ? "success" : isArmorLocked ? "danger" : "neutral"}
                  size="xs"
                >
                  Backend Grade: {grade}
                </Badge>
              </div>
              <p className="text-zinc-200 font-sans text-xs leading-relaxed">
                {confluenceRecord?.reasoning || "Awaiting scan from server."}
              </p>
              <span className="text-[10px] text-zinc-500 block pt-0.5 font-sans">
                Grade does not guarantee entry; execution guards apply.
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Operating Engine</span>
                <span className="font-bold text-cyan-400 mt-0.5 block truncate">
                  {cleanEngine}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Spread Friction</span>
                <span
                  className={`font-bold mt-0.5 block tabular-nums ${
                    isArmorLocked ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {confluenceRecord?.livePrice?.spread_pips != null
                    ? `${confluenceRecord.livePrice.spread_pips} pips`
                    : "Not available"}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-zinc-500 uppercase block">Allocated Risk</span>
                <span className="font-bold text-amber-400 mt-0.5 block tabular-nums">
                  {backendCashRisk}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Section B: Diagnostic Scoring Components Breakdown ───────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Diagnostic Scoring Components ({components.length} Backend Components)
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            {score != null ? `${score} / 100 Points Earned` : "Score Pending"}
          </Badge>
        </div>

        {components.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#111721] text-center text-zinc-400 text-xs">
            Diagnostic component breakdown unavailable in active server response.
          </div>
        ) : (
          <div className="space-y-2.5">
            {components.map((c) => {
              const pct = Math.min(100, Math.round((c.earned / c.max) * 100));
              const isFull = c.earned === c.max;
              const isZero = c.earned === 0;

              return (
                <div
                  key={c.rawKey}
                  className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <span className="font-bold text-white text-xs">{c.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono ml-2">
                        [raw: {c.rawKey}]
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                      <span className="font-bold text-white text-xs tabular-nums">
                        {c.earned} <span className="text-zinc-500 font-normal">/ {c.max} pts</span>
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border tabular-nums ${
                          isFull
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : isZero
                            ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                            : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isFull
                          ? "bg-emerald-400"
                          : isZero
                          ? "bg-zinc-700"
                          : "bg-amber-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans flex items-start justify-between flex-wrap gap-2">
          <span>
            <strong className="text-zinc-300">Component Integrity:</strong> Component allocations reflect raw backend breakdown keys (`trend`, `sweep`, `session`, `displacement`, `risk`, `bonus`). Component earned sum: <strong className="text-white font-mono">{componentPointsSum} pts</strong> (Backend score: <strong className="text-white font-mono">{score ?? "—"} pts</strong>).
          </span>
        </div>
      </Card>

      {/* ── Section C: Smart Money Narrative & Liquidity Pool Context ────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-purple-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Smart Money Liquidity Narrative &amp; Market Structure
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Algorithmic Audit
          </Badge>
        </div>

        <div className="space-y-3 text-xs">
          {/* Narrative Block */}
          <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
            <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold block">
              Liquidity Pool Context (aiReasoning.narrative)
            </span>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {confluenceRecord?.aiReasoning?.narrative || "No narrative available from server scan."}
            </p>
          </div>

          {/* Context Block */}
          {confluenceRecord?.aiReasoning?.context && (
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider font-bold block">
                Order Flow Structure &amp; Model Context (aiReasoning.context)
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                {confluenceRecord.aiReasoning.context}
              </p>
            </div>
          )}

          {/* Action & Verdict Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Engine Verdict (aiReasoning.verdict)</span>
              <p className="font-bold text-white text-xs">
                {confluenceRecord?.aiReasoning?.verdict || "Awaiting scan"}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Recommended Action (aiReasoning.action)</span>
              <p className="font-bold text-emerald-400 text-xs">
                {confluenceRecord?.aiReasoning?.action || "Awaiting scan"}
              </p>
            </div>
          </div>

          {/* 20-Bar Structural Extremes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
              <div>
                <span className="font-bold text-white text-xs block">{highLabel}</span>
                <span className="text-[10px] text-zinc-500 font-sans">
                  {isHighSwept ? "Confirmed institutional sweep above high" : "Rolling 20-bar swing high boundary"}
                </span>
              </div>
              <span className="font-bold text-white tabular-nums text-sm">
                {m15High != null ? formatPairPrice(pair, m15High) : "Not available"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex justify-between items-center">
              <div>
                <span className="font-bold text-white text-xs block">{lowLabel}</span>
                <span className="text-[10px] text-zinc-500 font-sans">
                  {isLowSwept ? "Confirmed institutional sweep below low" : "Rolling 20-bar swing low boundary"}
                </span>
              </div>
              <span className="font-bold text-white tabular-nums text-sm">
                {m15Low != null ? formatPairPrice(pair, m15Low) : "Not available"}
              </span>
            </div>
          </div>

          {/* Educational Disclaimer */}
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
            <strong className="text-zinc-300">Educational &amp; Observational Context Only:</strong> Algorithmic narrative describes technical market structure and liquidity pool mechanics. It does not constitute financial advice, guaranteed market forecasts, or manual trade execution signals.
          </div>
        </div>
      </Card>

      {/* ── Section D: Algorithmic Rule Verification Gates ───────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Algorithmic Rule Verification Checklist
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            {confluenceRecord?.checks?.length ?? 0} Gates Evaluated
          </Badge>
        </div>

        {(!confluenceRecord?.checks || confluenceRecord.checks.length === 0) ? (
          <div className="p-4 rounded-xl bg-[#111721] text-center text-zinc-400 text-xs">
            Rule verification checklist not available in active server response.
          </div>
        ) : (
          <div className="space-y-1.5 text-xs">
            {confluenceRecord.checks.map((checkStr: string, idx: number) => {
              const parsed = parseBackendCheck(checkStr);

              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all ${
                    parsed.status === "PASS"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : parsed.status === "FAIL"
                      ? "bg-rose-500/5 border-rose-500/20"
                      : parsed.status === "SCORE"
                      ? "bg-cyan-500/5 border-cyan-500/20"
                      : parsed.status === "INFO"
                      ? "bg-[#111721] border-[#1A222F]"
                      : "bg-zinc-900/40 border-zinc-800"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {parsed.status === "PASS" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : parsed.status === "FAIL" ? (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    ) : parsed.status === "SCORE" ? (
                      <Zap className="w-4 h-4 text-cyan-400" />
                    ) : parsed.status === "INFO" ? (
                      <Info className="w-4 h-4 text-amber-400" />
                    ) : (
                      <HelpCircle className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-white text-xs">
                        {parsed.title}
                      </span>
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                        {parsed.label}
                      </span>
                    </div>

                    <span
                      className={`text-xs tabular-nums ${
                        parsed.status === "PASS"
                          ? "text-emerald-300 font-semibold"
                          : parsed.status === "FAIL"
                          ? "text-rose-300 font-semibold"
                          : parsed.status === "SCORE"
                          ? "text-cyan-300 font-bold"
                          : "text-zinc-300"
                      }`}
                    >
                      {parsed.detail}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
          <strong className="text-zinc-300">Rule Audit Standard:</strong> Rendered checks represent the genuine output array from the backend confluence scanner. Any unrecognized check status strictly defaults to neutral Unknown.
        </div>
      </Card>

      {/* ── Section E: Position & Risk Telemetry (Strictly Read-Only) ───── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Position &amp; Risk Telemetry (Read-Only)
            </h3>
          </div>
          <Badge variant={activePosition ? "success" : "neutral"} size="xs">
            {activePosition ? "OPEN ON CAPITAL.COM" : "NO OPEN POSITION"}
          </Badge>
        </div>

        {/* Case 1: Active Position on this Instrument */}
        {activePosition ? (
          <div className="p-3.5 rounded-xl bg-[#111721] border border-emerald-500/40 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={activePosition.direction === "BUY" ? "buy" : "sell"} size="sm">
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Entry Fill</span>
                <span className="font-bold text-white tabular-nums mt-0.5 block">
                  {formatPairPrice(pair, activePosition.entryPrice)}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Stop Loss (SL)</span>
                <span className="font-bold text-rose-400 tabular-nums mt-0.5 block">
                  {activePosition.stopLevel != null ? formatPairPrice(pair, activePosition.stopLevel) : "Not available"}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Take Profit (TP)</span>
                <span className="font-bold text-emerald-400 tabular-nums mt-0.5 block">
                  {activePosition.profitLevel != null ? formatPairPrice(pair, activePosition.profitLevel) : "Not available"}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Deal Reference</span>
                <span className="font-mono text-[10px] text-zinc-300 mt-0.5 block truncate">
                  {activePosition.dealId}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Case 2: No Open Position */
          <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="font-bold text-white text-xs uppercase tracking-wider">
                NO OPEN POSITION
              </span>
            </div>
            <p className="text-xs text-zinc-300 font-sans leading-relaxed">
              Account has NO OPEN POSITION on {pair}. Background cloud engine is continuously scanning for an institutional setup.
            </p>
          </div>
        )}

        {/* Execution Plan Parameters: Renders ONLY when backend genuinely supplies them */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] text-zinc-500 uppercase block font-bold">
            Execution Plan Parameters (Backend Supplied)
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Planned Entry</span>
              <span className="font-bold text-white tabular-nums mt-0.5 block">
                {hasExecutionPlan ? formatPairPrice(pair, confluenceRecord.entryPrice) : "Not available"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Planned Stop Loss</span>
              <span className="font-bold text-rose-400 tabular-nums mt-0.5 block">
                {hasExecutionPlan ? formatPairPrice(pair, confluenceRecord.sl) : "Not available"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Target 1 (TP1)</span>
              <span className="font-bold text-emerald-400 tabular-nums mt-0.5 block">
                {hasExecutionPlan ? formatPairPrice(pair, confluenceRecord.tp1) : "Not available"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Target 2 (TP2)</span>
              <span className="font-bold text-emerald-400 tabular-nums mt-0.5 block">
                {hasExecutionPlan && confluenceRecord.tp2 != null ? formatPairPrice(pair, confluenceRecord.tp2) : "Not available"}
              </span>
            </div>
          </div>
        </div>

        {/* Read-Only Safety Guarantee Note */}
        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Read-Only Observational Interface:</strong> This workstation contains zero broker mutation controls. No orders, stop updates, or position closures can be triggered from this view. Existing protected action modals on the Terminal HUD remain the sole authorized operational pathways.
          </span>
        </div>
      </Card>
    </div>
  );
};
