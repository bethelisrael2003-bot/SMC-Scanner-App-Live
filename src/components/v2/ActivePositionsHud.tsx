import React, { useState } from "react";
import { ShieldCheck, AlertTriangle, Lock, XCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, Badge, Button, Modal, formatUSD } from "./ui";

export interface ActivePosition {
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

export interface ActivePositionsHudProps {
  openPositions: ActivePosition[];
  onClosePosition: (dealId: string) => Promise<void>;
  onUpdateStop: (dealId: string, entryPrice: number, profitLevel?: number) => Promise<void>;
  isClosing?: boolean;
  isUpdatingBe?: boolean;
}

export const ActivePositionsHud: React.FC<ActivePositionsHudProps> = ({
  openPositions,
  onClosePosition,
  onUpdateStop,
}) => {
  const [confirmClosePos, setConfirmClosePos] = useState<ActivePosition | null>(null);
  const [confirmBePos, setConfirmBePos] = useState<ActivePosition | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  if (!openPositions || openPositions.length === 0) {
    return null;
  }

  const handleConfirmClose = async () => {
    if (!confirmClosePos) return;
    setActionLoading(true);
    try {
      await onClosePosition(confirmClosePos.dealId);
      setConfirmClosePos(null);
    } catch (err) {
      console.error("[HUD] Error closing position:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBe = async () => {
    if (!confirmBePos) return;
    setActionLoading(true);
    try {
      await onUpdateStop(confirmBePos.dealId, confirmBePos.entryPrice, confirmBePos.profitLevel);
      setConfirmBePos(null);
    } catch (err) {
      console.error("[HUD] Error moving stop to BE:", err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-3 font-mono">
        <div className="flex items-center justify-between text-xs px-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-white uppercase tracking-wider">
              Live Broker Position ({openPositions.length}/2 Concurrency)
            </span>
          </div>
          <Badge variant="neutral" size="xs">Capital.com Demo</Badge>
        </div>

        {openPositions.map((pos) => {
          const isProfit = Number(pos.upl) >= 0;
          const isBuy = pos.direction === "BUY";
          const unitLabel = pos.pair.includes("XAU") || pos.pair.includes("XAG") ? "Oz" : "Units";

          return (
            <Card
              key={pos.dealId}
              variant="highlight"
              padding="sm"
              className="border-emerald-500/40 bg-gradient-to-r from-emerald-950/20 via-[#0E131A] to-emerald-950/20"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1">
                {/* Left: Direction & Pair Info */}
                <div className="flex items-start sm:items-center gap-3">
                  <Badge variant={isBuy ? "buy" : "sell"} size="md" className="shrink-0 text-xs">
                    {isBuy ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {pos.direction}
                  </Badge>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white tracking-tight">{pos.pair}</span>
                      <span className="text-xs text-zinc-400">
                        {pos.size} {unitLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-2 mt-0.5">
                      <span>Entry: <strong className="text-zinc-200">{pos.entryPrice}</strong></span>
                      <span>·</span>
                      <span>SL: <strong className="text-rose-400">{pos.stopLevel ?? "None"}</strong></span>
                      <span>·</span>
                      <span>TP: <strong className="text-emerald-400">{pos.profitLevel ?? "None"}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Right: Floating PnL & Protected Action Controls */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1E2633]">
                  <div className="text-left sm:text-right">
                    <span className={`text-base font-black tabular-nums tracking-tight ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                      {isProfit ? `+${formatUSD(pos.upl)}` : formatUSD(pos.upl)}
                    </span>
                    <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">
                      Floating P&amp;L
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {pos.entryPrice && pos.stopLevel !== pos.entryPrice && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmBePos(pos)}
                        icon={<Lock className="w-3 h-3 text-cyan-400" />}
                        title="Move Stop Loss to Entry Price (Zero Risk)"
                      >
                        Lock BE
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmClosePos(pos)}
                      icon={<XCircle className="w-3 h-3" />}
                    >
                      Close at Market
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Confirmation Modal: Close at Market */}
      <Modal
        isOpen={!!confirmClosePos}
        onClose={() => setConfirmClosePos(null)}
        onConfirm={handleConfirmClose}
        variant="destructive"
        isLoading={actionLoading}
        title="Confirm Market Close"
        confirmText="Execute Close"
        cancelText="Keep Open"
        description={
          confirmClosePos && (
            <div className="space-y-2 mt-1">
              <p>
                Are you sure you want to close your active <strong>{confirmClosePos.pair} {confirmClosePos.direction}</strong> position at market?
              </p>
              <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Size:</span>
                  <span className="text-white">{confirmClosePos.size} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Entry Price:</span>
                  <span className="text-white">{confirmClosePos.entryPrice}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Current Floating P&amp;L:</span>
                  <span className={Number(confirmClosePos.upl) >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {Number(confirmClosePos.upl) >= 0 ? `+${formatUSD(confirmClosePos.upl)}` : formatUSD(confirmClosePos.upl)}
                  </span>
                </div>
              </div>
            </div>
          )
        }
      />

      {/* Confirmation Modal: Lock Breakeven */}
      <Modal
        isOpen={!!confirmBePos}
        onClose={() => setConfirmBePos(null)}
        onConfirm={handleConfirmBe}
        variant="primary"
        isLoading={actionLoading}
        title="Move Stop Loss to Breakeven"
        confirmText="Lock Breakeven"
        cancelText="Cancel"
        description={
          confirmBePos && (
            <div className="space-y-2 mt-1">
              <p>
                Move Stop Loss to your entry price (<strong>{confirmBePos.entryPrice}</strong>) on Capital.com?
              </p>
              <p className="text-zinc-400 text-xs">
                This guarantees zero downside loss on this trade. Your Take Profit (<strong>{confirmBePos.profitLevel ?? "N/A"}</strong>) will be strictly preserved.
              </p>
            </div>
          )
        }
      />
    </>
  );
};
