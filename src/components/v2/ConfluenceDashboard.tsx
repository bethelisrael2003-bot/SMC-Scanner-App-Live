import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Clock,
  Zap,
  Shield,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, Badge, Button, RadialGauge, BottomSheet, formatPairPrice } from "./ui";

export interface ConfluenceDashboardProps {
  pair: string;
  pairName: string;
  confluenceRecord: any;
  armorStatus?: string;
  maxSafeSpread?: number;
  onCopyOrder?: (text: string) => void;
  copiedOrder?: boolean;
}

export const ConfluenceDashboard: React.FC<ConfluenceDashboardProps> = ({
  pair,
  pairName,
  confluenceRecord,
  armorStatus = "SAFE",
  maxSafeSpread = 2.0,
  onCopyOrder,
  copiedOrder = false,
}) => {
  const [showEvidenceSheet, setShowEvidenceSheet] = useState(false);

  const score = confluenceRecord?.score ?? 50;
  const grade = confluenceRecord?.confluenceGrade || "WAIT";
  const hasActiveSignal = grade !== "WAIT" && confluenceRecord?.entryPrice;
  const breakdown = confluenceRecord?.scoreBreakdown || {
    trend: 15,
    sweep: 5,
    session: 0,
    displacement: 15,
    risk: 15,
    total: score,
  };

  const isBuy = confluenceRecord?.direction === "BUY";
  const engineName = confluenceRecord?.gradeAEngine || "Trend Sweep (🌊)";

  // Format order copy text
  const orderCopyText = hasActiveSignal
    ? `EXECUTE ${confluenceRecord.direction} ${pair} @ ${confluenceRecord.entryPrice} | SL: ${confluenceRecord.sl} | TP1: ${confluenceRecord.tp1} | TP2: ${confluenceRecord.tp2}`
    : "";

  return (
    <>
      <Card variant="default" padding="md" className="space-y-4 font-mono">
        {/* Top Header Bar: Asset Info & Live Spread */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">{pair}</h2>
              <span className="text-xs text-zinc-400">· {pairName}</span>
              <Badge variant="neutral" size="xs">{engineName}</Badge>
            </div>
            <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
              <span>Bid: <strong className="text-white">{confluenceRecord?.livePrice?.bid ? formatPairPrice(pair, confluenceRecord.livePrice.bid) : "—"}</strong></span>
              <span>·</span>
              <span>Ask: <strong className="text-white">{confluenceRecord?.livePrice?.ask ? formatPairPrice(pair, confluenceRecord.livePrice.ask) : "—"}</strong></span>
              <span>·</span>
              <span>Spread: <strong className="text-emerald-400">{confluenceRecord?.livePrice?.spread_pips ?? "—"} pips</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={armorStatus === "SAFE" ? "success" : "danger"} size="sm" dot>
              Spread Armor: {armorStatus} ({maxSafeSpread}p Max)
            </Badge>
          </div>
        </div>

        {/* Central Cockpit: Radial Gauge + Execution or Waiting Status */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Left: Precision SVG Score Gauge */}
          <div className="md:col-span-4 flex items-center justify-center p-3 rounded-2xl bg-[#111721] border border-[#1A222F]">
            <RadialGauge
              score={score}
              grade={grade}
              label="Confluence Score"
              size={96}
              strokeWidth={8}
            />
          </div>

          {/* Right: Active Execution Plan or Structured Standby Card */}
          <div className="md:col-span-8">
            {hasActiveSignal ? (
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant={isBuy ? "buy" : "sell"} size="sm">
                    {confluenceRecord.direction} SETUP ({grade})
                  </Badge>
                  {onCopyOrder && (
                    <Button
                      type="button"
                      variant="successOutline"
                      size="sm"
                      onClick={() => onCopyOrder(orderCopyText)}
                      icon={copiedOrder ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    >
                      {copiedOrder ? "Copied" : "Copy Order"}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">ENTRY</span>
                    <span className="font-bold text-white text-sm">{formatPairPrice(pair, confluenceRecord.entryPrice)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">STOP LOSS</span>
                    <span className="font-bold text-rose-400 text-sm">{formatPairPrice(pair, confluenceRecord.sl)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">TARGET 1</span>
                    <span className="font-bold text-emerald-400 text-sm">{formatPairPrice(pair, confluenceRecord.tp1)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase block">TARGET 2</span>
                    <span className="font-bold text-emerald-400 text-sm">{formatPairPrice(pair, confluenceRecord.tp2)}</span>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-300 p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                  <span className="font-bold text-amber-400">$25 Parity: </span>
                  Target risk normalized to $25.00 flat USD. Stop Loss moves to Breakeven at +0.75R profit.
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Institutional Regime
                  </span>
                  <Badge variant="wait" size="xs">{grade}</Badge>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  {confluenceRecord?.reasoning ||
                    "Monitoring 20-bar structural extremes and macro H1 trend alignment. Capital preserved with 0% risk allocated."}
                </p>

                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 pt-1">
                  <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Trade gating enforces minimum 80% confluence score to execute.</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── The 4-Pillar SMC Visual Matrix ────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-[11px] uppercase text-zinc-400 font-semibold tracking-wider">
              Smart Money Confluence Pillars (100-Point Audit)
            </span>
            <span className="text-[10px] text-zinc-500">
              {score}/100 Total
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Pillar 1: Macro H1 Trend */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  Macro Trend
                </span>
                <span className="font-bold text-white">{breakdown.trend}/25</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${(breakdown.trend / 25) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {confluenceRecord?.checks?.[0]?.replace(/^\[OK\] |^\[INFO\] |^\[X\] /i, "") || "EMA10 vs EMA20 Alignment"}
              </div>
            </div>

            {/* Pillar 2: Liquidity Sweep */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  Liquidity Sweep
                </span>
                <span className="font-bold text-white">{breakdown.sweep}/25</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${(breakdown.sweep / 25) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {confluenceRecord?.checks?.[1]?.replace(/^\[OK\] |^\[INFO\] |^\[X\] /i, "") || "20-Bar Structural Extremes"}
              </div>
            </div>

            {/* Pillar 3: Kill Zone Session */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Session Window
                </span>
                <span className="font-bold text-white">{breakdown.session}/20</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${(breakdown.session / 20) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {confluenceRecord?.checks?.[2]?.replace(/^\[OK\] |^\[INFO\] |^\[X\] /i, "") || "London / NY Kill Zone"}
              </div>
            </div>

            {/* Pillar 4: Displacement Power */}
            <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  Displacement
                </span>
                <span className="font-bold text-white">{breakdown.displacement}/15</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full transition-all duration-500"
                  style={{ width: `${(breakdown.displacement / 15) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {confluenceRecord?.checks?.[3]?.replace(/^\[OK\] |^\[INFO\] |^\[X\] /i, "") || "Rejection Body Ratio"}
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Trigger Button */}
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            fullWidth
            onClick={() => setShowEvidenceSheet(true)}
            icon={<Info className="w-3.5 h-3.5 text-cyan-400" />}
          >
            Inspect Smart Money Narrative &amp; Engine Evidence
          </Button>
        </div>
      </Card>

      {/* Slide-Up Bottom Sheet for Deep SMC Technical Evidence */}
      <BottomSheet
        isOpen={showEvidenceSheet}
        onClose={() => setShowEvidenceSheet(false)}
        title={`${pair} — Institutional SMC Analysis`}
        subtitle="Full algorithmic audit, narrative breakdown, and rule verification"
      >
        <div className="space-y-4 font-mono">
          {/* Narrative Block */}
          {confluenceRecord?.aiReasoning?.narrative && (
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
              <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-bold block">
                Liquidity Pool Context
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                {confluenceRecord.aiReasoning.narrative}
              </p>
            </div>
          )}

          {/* Macro Context Block */}
          {confluenceRecord?.aiReasoning?.context && (
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider font-bold block">
                Order Flow Structure
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                {confluenceRecord.aiReasoning.context}
              </p>
            </div>
          )}

          {/* Raw Verification Checks List (Zero Info Removed!) */}
          <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold block">
              Algorithmic Gate Checklist ({confluenceRecord?.checks?.length || 0} Gates Verified)
            </span>
            <div className="space-y-1.5 text-xs">
              {(confluenceRecord?.checks || []).map((check: string, idx: number) => {
                const isPass = check.startsWith("[OK]");
                return (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800 flex items-start gap-2"
                  >
                    {isPass ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                    )}
                    <span className={isPass ? "text-zinc-200" : "text-zinc-400"}>
                      {check.replace(/^\[OK\] |^\[INFO\] |^\[X\] /i, "")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </BottomSheet>
    </>
  );
};
