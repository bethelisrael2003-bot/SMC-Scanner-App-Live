import { TrendingUp, XCircle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

interface ActiveTradesTabProps {
  activeTrades: any[];
  scanData: any;
  setActiveTrades: Dispatch<SetStateAction<any[]>>;
}

export function ActiveTradesTab({ activeTrades, scanData, setActiveTrades }: ActiveTradesTabProps) {
  return (
    <div className="flex flex-col gap-3 max-h-[640px] overflow-y-auto pr-1">
      {activeTrades.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900/10 border border-zinc-800/60 rounded-2xl p-6 flex flex-col items-center justify-center">
          <TrendingUp className="w-8 h-8 text-zinc-650 mb-2" />
          <h4 className="text-xs font-semibold text-white">No active positions tracked</h4>
          <p className="text-[11px] text-zinc-500 mt-1 max-w-xs mx-auto">Manually mark any pair as "In Trade" from its Trade Plan card inside the Deep-Dive view to track active positions.</p>
        </div>
      ) : (
        activeTrades.map((t: any) => {
          const scanItem = (scanData && Array.isArray(scanData.results)) ? scanData.results.find((r: any) => r.pair === t.pair) : null;
          const currentPrice = scanItem ? scanItem.price : null;
          let progressPercent = 0;
          let isProfit = false;
          if (currentPrice) {
            const entryDist = Math.abs(currentPrice - t.entry);
            const totalDist = Math.abs(t.tp1 - t.entry);
            progressPercent = Math.min(Math.max((entryDist / (totalDist || 1)) * 100, 0), 100);
            isProfit = t.direction === "BUY" ? currentPrice >= t.entry : currentPrice <= t.entry;
          }
          return (
            <div key={t.pair} className="p-4 bg-zinc-900/40 hover:bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col gap-3 relative transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    t.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}>{t.direction}</span>
                  <span className="text-sm font-semibold tracking-tight text-white">{t.pair}</span>
                </div>
                <button onClick={() => setActiveTrades((prev: any[]) => prev.filter((p: any) => p.pair !== t.pair))} className="p-1 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800/40 transition-all cursor-pointer" title="Remove tracking">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60"><span className="text-[10px] text-zinc-500 block">ENTRY</span><span className="text-white font-medium">{t.entry !== undefined ? t.entry.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}</span></div>
                <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60"><span className="text-[10px] text-zinc-500 block">CURRENT</span><span className={`font-semibold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>{currentPrice !== null ? currentPrice.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}</span></div>
                <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60"><span className="text-[10px] text-red-400/80 block">SL (STOP)</span><span className="text-red-400 font-medium">{t.sl !== undefined ? t.sl.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}</span></div>
                <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60"><span className="text-[10px] text-emerald-400/80 block">TP1 (TARGET)</span><span className="text-emerald-400 font-medium">{t.tp1 !== undefined ? t.tp1.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}</span></div>
              </div>
              {currentPrice && (
                <div className="mt-1">
                  <div className="flex justify-between text-[9px] text-zinc-500 font-mono"><span>SL</span><span>Entry</span><span>TP1 (1:2)</span></div>
                  <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden mt-1 relative border border-zinc-850">
                    <div style={{ width: `${progressPercent}%` }} className={`h-full transition-all duration-500 ${isProfit ? "bg-emerald-500" : "bg-red-500"}`} />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-850/65">
                <span>Opened tracking: {t.timestamp}</span>
                {scanItem && <span>Spread: {scanItem.live?.spread_pips ?? "--"} p</span>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
