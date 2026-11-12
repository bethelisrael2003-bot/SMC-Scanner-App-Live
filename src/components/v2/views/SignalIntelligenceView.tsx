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
  const score = confluenceRecord?.score ?? confluenceRecord?.confidencePct ?? null;
  const grade = confluenceRecord?.confluenceGrade || "WAIT";
  const rawEngine = confluenceRecord?.gradeAEngine || "Institutional SMC";
  const cleanEngine = rawEngine.replace(/\s*\([^\)]*\)\s*/g, "").trim() || "Institutional SMC";
  const isQualified = grade !== "WAIT";

  // ── 2. Market Data Freshness Calculation ──────────────────────────────
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

  // ── 3. Four-Pillar Diagnostic Breakdown from Server ───────────────────
  const breakdown = confluenceRecord?.scoreBreakdown || null;

  // Real backend pillar definitions (authoritative points distribution)
  const pillars = useMemo(() => {
    if (!breakdown) return [];

    const list = [
      {
        id: "trend",
        name: "Macro H1 Trend Structure",
        description: "H1 10/20 EMA regime and multi-timeframe directional order flow alignment",
        earned: typeof breakdown.trend === "number" ? breakdown.trend : 0,
        max: 25,
      },
      {
        id: "sweep",
        name: "Liquidity Pool Sweep Mechanics",
        description: "M15 rolling 20-bar high/low liquidity purge and sweep bar close confirmation",
        earned: typeof breakdown.sweep === "number" ? breakdown.sweep : 0,
        max: 25,
      },
      {
        id: "session",
        name: "Session Execution Window",
        description: "London Open (08:30–12:30 WAT) & New York Open (13:30–18:00 WAT) institutional kill zones",
        earned: typeof breakdown.session === "number" ? breakdown.session : 0,
        max: 20,
      },
      {
        id: "displacement",
        name: "Displacement & Rejection Power",
        description: "Post-sweep candle wick rejection ratio and momentum body expansion",
        earned: typeof breakdown.displacement === "number" ? breakdown.displacement : 0,
        max: 15,
      },
      {
        id: "risk",
        name: "Spread & Volatility Risk Gate",
        description: "Dynamic Spread Armor friction gate and M14 ATR structural volatility check",
        earned: typeof breakdown.risk === "number" ? breakdown.risk : 0,
        max: 15,
      },
    ];

    // Optional model agreement bonus if returned by backend
    if (typeof breakdown.bonus === "number" && breakdown.bonus > 0) {
      list.push({
        id: "bonus",
        name: "Multi-Engine Model Agreement",
        description: "Dedicated setup model confirms directional bias with secondary engine",
        earned: breakdown.bonus,
        max: 10,
      });
    }

    return list;
  }, [breakdown]);

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

  // Execution plan parameters when genuinely returned by backend
  const hasExecutionPlan = confluenceRecord?.entryPrice != null;

  // Spread armor item
  const armorItem = (spreadArmorData?.pairs || []).find((a: any) => a.pair === pair) || null;
  const isArmorLocked = armorItem?.isLocked ?? false;

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
            {grade === "A+"
              ? "GRADE A+ QUALIFIED"
              : grade === "A"
              ? "GRADE A QUALIFIED"
              : grade === "B+"
              ? "GRADE B+ CONFLUENCE"
              : "MONITORING (WAIT)"}
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
              Authoritative 100-point algorithmic evaluation from <strong className="text-zinc-200">/api/confluence/scan</strong>
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
              Gating Threshold: 80% Min for Grade A
            </span>
          </div>

          <div className="md:col-span-8 space-y-2 text-xs">
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase font-bold">Backend Gating Verdict</span>
                <Badge
                  variant={isQualified ? "success" : isArmorLocked ? "danger" : "neutral"}
                  size="xs"
                >
                  {isArmorLocked ? "ARMOR GATE LOCKED" : isQualified ? "SETUP AUTHORIZED" : "STANDBY (NO TRADE)"}
                </Badge>
              </div>
              <p className="text-zinc-200 font-sans text-xs leading-relaxed">
                {confluenceRecord?.reasoning ||
                  "Awaiting next 60-second cloud background scan. Capital strictly preserved with 0% risk allocated."}
              </p>
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
                    : "Not recorded"}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-zinc-500 uppercase block">Risk Sizing</span>
                <span className="font-bold text-amber-400 mt-0.5 block">
                  $25 Parity Standard
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Section B: Four-Pillar Diagnostic Breakdown ──────────────────── */}
      <Card variant="default" padding="md" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Diagnostic Scoring Breakdown (Authoritative Engine Pillars)
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            {score != null ? `${score} / 100 Points Earned` : "Score Pending"}
          </Badge>
        </div>

        {pillars.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#111721] text-center text-zinc-400 text-xs">
            Diagnostic breakdown data unavailable in active server response.
          </div>
        ) : (
          <div className="space-y-2.5">
            {pillars.map((p) => {
              const pct = Math.min(100, Math.round((p.earned / p.max) * 100));
              const isFull = p.earned === p.max;
              const isZero = p.earned === 0;

              return (
                <div
                  key={p.id}
                  className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <span className="font-bold text-white text-xs">{p.name}</span>
                      <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                        {p.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                      <span className="font-bold text-white text-xs tabular-nums">
                        {p.earned} <span className="text-zinc-500 font-normal">/ {p.max} pts</span>
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

        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
          <strong className="text-zinc-300">Scoring Integrity Notice:</strong> Pillar point allocations reflect genuine backend engine rules (Trend 25pts, Sweep 25pts, Session 20pts, Displacement 15pts, Risk Gate 15pts = 100pts Base). Scores are not manipulated or inflated on the frontend.
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
              Liquidity Pool Context
            </span>
            <p className="text-xs text-zinc-200 leading-relaxed font-sans">
              {confluenceRecord?.aiReasoning?.narrative || "No narrative available from server scan."}
            </p>
          </div>

          {/* Context Block */}
          {confluenceRecord?.aiReasoning?.context && (
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider font-bold block">
                Order Flow Structure &amp; Model Context
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                {confluenceRecord.aiReasoning.context}
              </p>
            </div>
          )}

          {/* Action & Verdict Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Engine Verdict</span>
              <p className="font-bold text-white text-xs">
                {confluenceRecord?.aiReasoning?.verdict || "Awaiting scan"}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="text-[10px] text-zinc-500 uppercase block">Recommended Action</span>
              <p className="font-bold text-emerald-400 text-xs">
                {confluenceRecord?.aiReasoning?.action || "Stand by for confirmed structural break"}
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
                {m15High != null ? formatPairPrice(pair, m15High) : "Not recorded"}
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
                {m15Low != null ? formatPairPrice(pair, m15Low) : "Not recorded"}
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
              const isPass = checkStr.startsWith("[OK]");
              const isInfo = checkStr.startsWith("[INFO]");
              const isFail = checkStr.startsWith("[X]");
              const isScore = checkStr.startsWith("[SCORE]");

              const cleanText = checkStr.replace(/^\[OK\] |^\[INFO\] |^\[X\] |^\[SCORE\] /i, "");
              const parts = cleanText.split(":");
              const ruleTitle = parts[0]?.trim() || cleanText;
              const ruleDetail = parts.slice(1).join(":").trim();

              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all ${
                    isPass
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : isFail
                      ? "bg-rose-500/5 border-rose-500/20"
                      : isScore
                      ? "bg-cyan-500/5 border-cyan-500/20"
                      : "bg-[#111721] border-[#1A222F]"
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {isPass ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isFail ? (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    ) : isScore ? (
                      <Zap className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Info className="w-4 h-4 text-amber-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="font-bold text-white text-xs">
                      {ruleTitle}
                    </span>

                    <span
                      className={`text-xs tabular-nums ${
                        isPass
                          ? "text-emerald-300 font-semibold"
                          : isFail
                          ? "text-rose-300 font-semibold"
                          : isScore
                          ? "text-cyan-300 font-bold"
                          : "text-zinc-300"
                      }`}
                    >
                      {ruleDetail || ruleTitle}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
          <strong className="text-zinc-300">Rule Audit Standard:</strong> Rendered checks represent the genuine output array from the backend confluence scanner without omission, substitution, or artificial pass formatting.
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
                  {activePosition.stopLevel != null ? formatPairPrice(pair, activePosition.stopLevel) : "Not set"}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Take Profit (TP)</span>
                <span className="font-bold text-emerald-400 tabular-nums mt-0.5 block">
                  {activePosition.profitLevel != null ? formatPairPrice(pair, activePosition.profitLevel) : "Not set"}
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
              Account is flat on {pair}. Capital is protected with zero market risk exposure. Background cloud engine is continuously scanning for an institutional setup meeting the 80% confluence threshold.
            </p>
          </div>
        )}

        {/* Existing Standby Execution Plan Parameters */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] text-zinc-500 uppercase block font-bold">
            {hasExecutionPlan ? "Active Execution Plan Parameters" : "Standby Risk Parity Model Standard"}
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Planned Entry</span>
              <span className="font-bold text-white tabular-nums mt-0.5 block">
                {hasExecutionPlan ? formatPairPrice(pair, confluenceRecord.entryPrice) : "Awaiting scan"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Planned Stop Loss</span>
              <span className="font-bold text-rose-400 tabular-nums mt-0.5 block">
                {hasExecutionPlan && confluenceRecord.sl != null ? formatPairPrice(pair, confluenceRecord.sl) : "Awaiting scan"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Target 1 (TP1)</span>
              <span className="font-bold text-emerald-400 tabular-nums mt-0.5 block">
                {hasExecutionPlan && confluenceRecord.tp1 != null ? formatPairPrice(pair, confluenceRecord.tp1) : "Awaiting scan"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase block">Monetary Parity</span>
              <span className="font-bold text-amber-400 mt-0.5 block">
                $25.00 Flat Risk
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
