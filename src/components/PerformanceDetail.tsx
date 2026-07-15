const API_BASE_URL = import.meta.env.VITE_API_URL || "";
import { Search } from "lucide-react";

interface PerformanceDetailProps {
  performanceStats: any;
  perfLoading: boolean;
  onRefresh: () => Promise<void>;
}

export function PerformanceDetail({ performanceStats, perfLoading: _perfLoading, onRefresh: _onRefresh }: PerformanceDetailProps) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-850 rounded-2xl p-6 flex flex-col gap-6 shadow-xl shadow-zinc-950/40 relative min-h-[500px]">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-teal-500 to-indigo-500" />
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">🏆 Virtual Trades History & System Memory</h2>
          <p className="text-xs text-zinc-500 font-mono mt-1">Forward-testing ledger persistent in server trades cache database</p>
        </div>
        <span className="text-[10px] font-mono px-2.5 py-1 bg-zinc-800/80 rounded-lg text-zinc-400 border border-zinc-700/50">SMC ALPHA v1.0</span>
      </div>
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1">
        {!performanceStats || !Array.isArray(performanceStats.trades) || performanceStats.trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-8 h-8 text-zinc-650 mb-3 animate-pulse" />
            <h4 className="text-sm font-semibold text-white">No virtual trades logged yet</h4>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">The background 1-minute scanning loop runs in the background. Once any high-impact news filter passes and Grade A+, A or B setup forms, virtual trades enter and log automatically here!</p>
          </div>
        ) : (
          performanceStats.trades.map((trade: any) => {
            const isWin = trade.status === "Closed - WIN";
            const isLoss = trade.status === "Closed - LOSS";
            const isOpen = trade.status === "Open";
            return (
              <div key={trade.id} className="p-4 bg-zinc-950/40 border border-zinc-850/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-zinc-950/80 hover:border-zinc-800">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold font-display text-sm tracking-tight">{trade.pair}</span>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md font-mono ${trade.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>{trade.direction}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-850 border border-zinc-800 text-zinc-300 font-mono">Grade {trade.grade}</span>
                    {trade.breakevenTriggered && (<span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-mono font-medium flex items-center gap-1">🔒 BE</span>)}
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
                    <span>Entry: <span className="text-zinc-300 font-semibold">{trade.entryPrice}</span></span>
                    <span>SL: <span className="text-zinc-300 font-semibold">{trade.sl}</span></span>
                    <span>TP1: <span className="text-zinc-300 font-semibold">{trade.tp1}</span></span>
                  </div>
                  <span className="text-[9px] text-zinc-550 font-mono">Entered: {new Date(trade.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-2 border-t sm:border-t-0 border-zinc-900 pt-2 sm:pt-0">
                  <div className="text-[10px] font-mono text-zinc-550 sm:text-right">Status</div>
                  {isOpen ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Live Ticks</div>
                  ) : isWin ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold">🏆 WINNER</div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-bold">❌ LOSS</div>
                  )}
                  {!isOpen && (<div className={`text-xs font-mono font-bold mt-1 ${isWin ? "text-emerald-400" : trade.rrGained === 0 ? "text-zinc-500" : "text-red-400"}`}>{trade.rrGained >= 0 ? `+${trade.rrGained.toFixed(2)}` : `${trade.rrGained.toFixed(2)}`} R:R</div>)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
