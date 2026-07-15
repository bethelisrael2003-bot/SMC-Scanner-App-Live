import { ChevronRight } from "lucide-react";

interface WatchlistTabProps {
  scanData: any;
  loading: boolean;
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
}

export function WatchlistTab({ scanData, loading, selectedPair, setSelectedPair }: WatchlistTabProps) {
  return (
    <div className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1">
      {loading && !scanData ? (
        Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-zinc-900/30 animate-pulse border border-zinc-900" />
        ))
      ) : scanData && scanData.results ? (
        scanData.results.map((r: any) => {
          const isSelected = selectedPair === r.pair;
          return (
            <div
              key={r.pair}
              onClick={() => setSelectedPair(r.pair)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                isSelected
                  ? "bg-zinc-900 border-zinc-700 shadow-md shadow-zinc-950"
                  : "bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-900/50 hover:border-zinc-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg border text-xs font-bold font-mono ${
                  r.decision === "BUY"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : r.decision === "SELL"
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-zinc-800/60 text-zinc-400 border-zinc-700/60"
                }`}>
                  {r.pair.replace("/", "")}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold tracking-tight text-white">{r.pair}</span>
                    {r.grade !== "-" && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                        r.grade.includes("+") ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                      }`}>{r.grade}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-zinc-500">
                    <span>Mid: {r.price !== undefined && r.price !== null ? r.price.toFixed(r.pair.includes("JPY") ? 3 : 5) : "--"}</span>
                    <span>•</span>
                    <span>Spr: {r.live?.spread_pips ?? "--"} p</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg ${
                  r.decision === "BUY" ? "bg-emerald-500 text-zinc-950"
                    : r.decision === "SELL" ? "bg-red-500 text-zinc-950"
                    : "bg-zinc-800 text-zinc-400"
                }`}>{r.decision}</span>
                <ChevronRight className={`w-4 h-4 text-zinc-500 ${isSelected ? "text-zinc-300" : ""}`} />
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-8 text-zinc-500 text-xs font-mono">
          No scan data yet. Click "Scan Market" to begin.
        </div>
      )}
    </div>
  );
}
