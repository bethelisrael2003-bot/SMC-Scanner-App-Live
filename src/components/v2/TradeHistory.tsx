import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Calendar,
  Clock,
  ExternalLink,
  Shield,
  Layers,
  DollarSign,
  Hash,
} from "lucide-react";
import {
  Card,
  Badge,
  BottomSheet,
  SegmentedControl,
  formatPairPrice,
  formatR,
  formatShortDate,
  formatUSD,
} from "./ui";

export interface TradeRecord {
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
}

export interface TradeHistoryProps {
  trades: TradeRecord[];
  onSelectTrade?: (tradeId: string) => void;
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({ trades, onSelectTrade }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPairFilter, setSelectedPairFilter] = useState("ALL");
  const [selectedOutcomeFilter, setSelectedOutcomeFilter] = useState("ALL");
  const [inspectingTrade, setInspectingTrade] = useState<TradeRecord | null>(null);

  // Available pairs extracted dynamically from actual trades
  const pairOptions = useMemo(() => {
    const pairs = Array.from(new Set(trades.map((t) => t.pair))).filter(Boolean);
    return [
      { value: "ALL", label: "All Pairs" },
      ...pairs.map((p) => ({ value: p, label: p })),
    ];
  }, [trades]);

  const outcomeOptions = [
    { value: "ALL", label: "All Outcomes" },
    { value: "WINS", label: "Wins Only" },
    { value: "LOSSES", label: "Losses Only" },
  ];

  // Filtered trades calculation
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // Pair filter
      if (selectedPairFilter !== "ALL" && t.pair !== selectedPairFilter) {
        return false;
      }

      // Outcome filter
      const isWin =
        t.status === "Closed - WIN" ||
        t.status === "win" ||
        (typeof t.rrGained === "number" && t.rrGained > 0);
      const isLoss =
        t.status === "Closed - LOSS" ||
        t.status === "loss" ||
        (typeof t.rrGained === "number" && t.rrGained < 0);

      if (selectedOutcomeFilter === "WINS" && !isWin) return false;
      if (selectedOutcomeFilter === "LOSSES" && !isLoss) return false;

      // Search query filter (pair, setup, reason, dealRef)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchPair = (t.pair || "").toLowerCase().includes(q);
        const matchSetup = (t.setupType || "").toLowerCase().includes(q);
        const matchReason = (t.closeReason || "").toLowerCase().includes(q);
        const matchDeal = (t.dealReference || "").toLowerCase().includes(q);
        if (!matchPair && !matchSetup && !matchReason && !matchDeal) {
          return false;
        }
      }

      return true;
    });
  }, [trades, selectedPairFilter, selectedOutcomeFilter, searchQuery]);

  return (
    <div className="space-y-3 font-mono">
      {/* Header & Controls Card */}
      <Card variant="default" padding="sm" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-bold text-white uppercase tracking-wider">
            Audited Trade Log
          </div>
          <span className="text-[11px] text-zinc-400">
            {filteredTrades.length} of {trades.length} Trades
          </span>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search pair, setup, deal ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#111721] border border-[#1E2633] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Outcome Filter */}
          <div className="shrink-0">
            <SegmentedControl
              options={outcomeOptions}
              value={selectedOutcomeFilter}
              onChange={setSelectedOutcomeFilter}
              size="sm"
            />
          </div>
        </div>

        {/* Pair Filter Pills Carousel */}
        {pairOptions.length > 2 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {pairOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedPairFilter(opt.value)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  selectedPairFilter === opt.value
                    ? "bg-[#1E2633] text-cyan-400 border border-cyan-400/40"
                    : "bg-[#111721] text-zinc-400 border border-[#1E2633] hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Trade Rows List */}
      <div className="space-y-1.5">
        {filteredTrades.length === 0 ? (
          <Card variant="default" padding="md" className="text-center text-zinc-500 text-xs py-8">
            No trades match the selected filter criteria.
          </Card>
        ) : (
          filteredTrades.map((t, idx) => {
            const isBuy = t.direction === "BUY";
            const rVal = t.rrGained ?? 0;
            const isWin = rVal > 0 || t.status.includes("WIN");
            const isLoss = rVal < 0 || t.status.includes("LOSS");
            const isBE = rVal === 0 && !isLoss;

            return (
              <div
                key={t.id || idx}
                onClick={() => {
                  if (onSelectTrade) {
                    onSelectTrade(t.id);
                  } else {
                    setInspectingTrade(t);
                  }
                }}
                className="group p-2.5 sm:p-3 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] hover:border-zinc-700 transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer select-none active:scale-[0.99]"
              >
                {/* Left: Direction Pill, Pair, Date */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Badge variant={isBuy ? "buy" : "sell"} size="xs" className="shrink-0">
                    {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {t.direction}
                  </Badge>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs">{t.pair}</span>
                      <span className="text-[10px] text-zinc-500 truncate hidden sm:inline">
                        · {t.setupType || "Setup"}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {formatShortDate(t.closeTimestamp || t.timestamp)}
                    </div>
                  </div>
                </div>

                {/* Center: Execution Path */}
                <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400">
                  <span>Entry: <strong className="text-zinc-200">{formatPairPrice(t.pair, t.entryPrice)}</strong></span>
                  <span>→</span>
                  <span>Exit: <strong className="text-zinc-200">{t.closePrice != null ? formatPairPrice(t.pair, t.closePrice) : "—"}</strong></span>
                </div>

                {/* Right: R-Multiple Badge & Reason */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="text-right">
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

                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Trade Detail Bottom Sheet */}
      <BottomSheet
        isOpen={!!inspectingTrade}
        onClose={() => setInspectingTrade(null)}
        title={inspectingTrade ? `${inspectingTrade.pair} ${inspectingTrade.direction} Execution Audit` : "Trade Audit"}
        subtitle="Forensic execution metrics, entry/exit levels, and broker reference"
      >
        {inspectingTrade && (
          <div className="space-y-4 font-mono text-xs">
            {/* Top Status Banner */}
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={inspectingTrade.direction === "BUY" ? "buy" : "sell"} size="sm">
                  {inspectingTrade.direction}
                </Badge>
                <span className="font-bold text-white text-sm">{inspectingTrade.pair}</span>
              </div>

              <div className="text-right">
                <span
                  className={`text-sm font-black px-2.5 py-1 rounded border inline-block ${
                    (inspectingTrade.rrGained ?? 0) > 0
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : (inspectingTrade.rrGained ?? 0) === 0
                      ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                      : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {formatR(inspectingTrade.rrGained)}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Result: {inspectingTrade.status}
                </span>
              </div>
            </div>

            {/* Execution Price Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Entry Fill Price</span>
                <span className="font-bold text-white text-sm mt-0.5 block">
                  {formatPairPrice(inspectingTrade.pair, inspectingTrade.entryPrice)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Exit Close Price</span>
                <span className="font-bold text-white text-sm mt-0.5 block">
                  {inspectingTrade.closePrice != null
                    ? formatPairPrice(inspectingTrade.pair, inspectingTrade.closePrice)
                    : "—"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Stop Loss (SL)</span>
                <span className="font-bold text-rose-400 text-sm mt-0.5 block">
                  {formatPairPrice(inspectingTrade.pair, inspectingTrade.sl)}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Take Profit 1 (TP1)</span>
                <span className="font-bold text-emerald-400 text-sm mt-0.5 block">
                  {formatPairPrice(inspectingTrade.pair, inspectingTrade.tp1)}
                </span>
              </div>
            </div>

            {/* Audit Details Table */}
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2.5">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
                <span className="text-zinc-500">Close Reason:</span>
                <span className="font-bold text-cyan-400">{inspectingTrade.closeReason || "CLOSED"}</span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
                <span className="text-zinc-500">Setup Model:</span>
                <span className="text-zinc-200">{inspectingTrade.setupType || "Institutional SMC"}</span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
                <span className="text-zinc-500">Opened Timestamp:</span>
                <span className="text-zinc-200">{inspectingTrade.timestamp}</span>
              </div>

              {inspectingTrade.closeTimestamp && (
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
                  <span className="text-zinc-500">Closed Timestamp:</span>
                  <span className="text-zinc-200">{inspectingTrade.closeTimestamp}</span>
                </div>
              )}

              {inspectingTrade.dealReference && (
                <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
                  <span className="text-zinc-500">Broker Deal Ref:</span>
                  <span className="text-zinc-300 font-mono text-[11px] truncate max-w-[200px]">
                    {inspectingTrade.dealReference}
                  </span>
                </div>
              )}

              {typeof inspectingTrade.fillDriftAtr === "number" && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Execution Drift:</span>
                  <span className={inspectingTrade.fillDriftAtr >= 0 ? "text-emerald-400" : "text-amber-400"}>
                    {inspectingTrade.fillDriftAtr >= 0 ? `+${inspectingTrade.fillDriftAtr} ATR` : `${inspectingTrade.fillDriftAtr} ATR`}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
};
