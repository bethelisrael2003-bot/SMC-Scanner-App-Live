import React from "react";
import { TrendingUp, TrendingDown, ShieldCheck, AlertCircle } from "lucide-react";
import { Card, Badge, formatPairPrice } from "./ui";

export interface PairProfile {
  pair: string;
  name: string;
  category: string;
  pipSize: number;
  spreadThreshold: number;
}

export interface MarketWatchlistProps {
  profiles: PairProfile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpenWorkstation?: (pair: string) => void;
  confluenceData: any;
  spreadArmorData: any;
}

export const MarketWatchlist: React.FC<MarketWatchlistProps> = ({
  profiles,
  selectedIndex,
  onSelect,
  onOpenWorkstation,
  confluenceData,
  spreadArmorData,
}) => {
  return (
    <div className="space-y-2 font-mono">
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-[11px] uppercase text-zinc-400 font-semibold tracking-wider">
          Core Institutional Watchlist
        </span>
        <span className="text-[10px] text-zinc-500">
          4 High-Liquidity Markets
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {profiles.map((profile, idx) => {
          const isSelected = selectedIndex === idx;
          const pairData = (confluenceData?.pairs || []).find((p: any) => p.pair === profile.pair);
          const armorItem = (spreadArmorData?.pairs || []).find((p: any) => p.pair === profile.pair);

          const live = pairData?.livePrice;
          const isBull = pairData?.checks?.[0]?.includes("BULLISH");
          const grade = pairData?.confluenceGrade || "WAIT";
          const hasActiveSignal = grade !== "WAIT" && pairData?.entryPrice;

          return (
            <Card
              key={profile.pair}
              variant={isSelected ? "elevated" : "default"}
              padding="sm"
              interactive
              onClick={() => {
                onSelect(idx);
                if (onOpenWorkstation) {
                  onOpenWorkstation(profile.pair);
                }
              }}
              className={`relative overflow-hidden transition-all duration-150 ${
                isSelected
                  ? "border-[#38BDF8] bg-[#141B24] ring-1 ring-[#38BDF8]/40 shadow-lg shadow-black/50"
                  : "border-[#1E2633] bg-[#0E131A] hover:border-zinc-700"
              }`}
            >
              {/* Top Row: Pair & Grade Badge */}
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className="text-xs font-bold text-white tracking-tight">{profile.pair}</span>
                <Badge
                  variant={hasActiveSignal ? "gradeA" : "wait"}
                  size="xs"
                  dot={hasActiveSignal}
                  pulseDot={hasActiveSignal}
                >
                  {grade}
                </Badge>
              </div>

              {/* Price Row: Big Tabular Price */}
              <div className="text-sm font-bold text-zinc-100 tabular-nums">
                {live ? formatPairPrice(profile.pair, live.bid) : "—"}
              </div>

              {/* Spread & Trend Metadata */}
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-1 pt-1 border-t border-[#1E2633]">
                <span className={armorItem?.isLocked ? "text-rose-400" : "text-zinc-400"}>
                  {live?.spread_pips != null ? `${live.spread_pips}p` : "—"}
                </span>

                <span className={`flex items-center gap-0.5 font-semibold ${isBull ? "text-emerald-400" : "text-rose-400"}`}>
                  {isBull ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {isBull ? "Bull" : "Bear"}
                </span>
              </div>

              {/* Real M15 Range from Backend */}
              {pairData?.m15Low != null && pairData?.m15High != null && (
                <div className="text-[9px] text-zinc-500 truncate mt-0.5">
                  R: {formatPairPrice(profile.pair, pairData.m15Low)} – {formatPairPrice(profile.pair, pairData.m15High)}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
