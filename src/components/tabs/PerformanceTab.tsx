import { RotateCw } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

interface PerformanceTabProps {
  performanceStats: any;
  perfLoading: boolean;
  onRefresh: () => Promise<void>;
}

export function PerformanceTab({ performanceStats, perfLoading, onRefresh }: PerformanceTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="p-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl flex flex-col items-center text-center shadow-lg relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-505" />
        <span className="text-zinc-550 text-[10px] font-mono uppercase tracking-widest mb-1">Overall Win Rate</span>
        {perfLoading && !performanceStats ? (
          <div className="h-28 w-28 rounded-full border-4 border-zinc-800 border-t-emerald-500 animate-spin flex items-center justify-center my-3"><span className="text-zinc-500 text-xs font-mono">Loading...</span></div>
        ) : (
          <div className="relative flex items-center justify-center my-2">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle cx="64" cy="64" r="52" stroke="#18181b" strokeWidth="8" fill="transparent" />
              <circle cx="64" cy="64" r="52" stroke="#10b981" strokeWidth="8" fill="transparent" strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - (performanceStats?.winRate || 0) / 100)} className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold font-display text-white">{performanceStats ? `${performanceStats.winRate.toFixed(1)}%` : "0%"}</span>
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mt-0.5">Verified Edge</span>
            </div>
          </div>
        )}
        <p className="text-[11px] text-zinc-400 max-w-xs mt-2 leading-relaxed">Automatically monitored forward-testing trades entered on high-grade SMC structures.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col"><span className="text-zinc-550 text-[10px] font-mono uppercase">Total Trades Logged</span><span className="text-xl font-bold font-display text-white mt-1">{performanceStats?.totalTrades || 0}</span></div>
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col"><span className="text-zinc-550 text-[10px] font-mono uppercase">Total Resolved</span><span className="text-xl font-bold font-display text-zinc-300 mt-1">{performanceStats?.totalClosed || 0}</span></div>
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col"><span className="text-zinc-550 text-[10px] font-mono uppercase text-emerald-500">Winners</span><span className="text-xl font-bold font-display text-emerald-400 mt-1">{performanceStats?.totalWins || 0}</span></div>
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col"><span className="text-zinc-550 text-[10px] font-mono uppercase text-red-500">Losers</span><span className="text-xl font-bold font-display text-red-400 mt-1">{performanceStats?.totalLosses || 0}</span></div>
      </div>
      <div className="p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl flex flex-col">
        <span className="text-zinc-550 text-[10px] font-mono uppercase mb-2">Recent Trade Outcomes Track</span>
        <div className="flex flex-wrap gap-1.5 items-center">
          {performanceStats && Array.isArray(performanceStats.sequence) && performanceStats.sequence.length > 0 ? (
            performanceStats.sequence.map((icon: string, index: number) => (<div key={index} className="w-7 h-7 rounded-lg bg-zinc-950/80 border border-zinc-800/60 flex items-center justify-center text-xs shadow-inner" title={icon === "🟢" ? "Win Result" : "Loss Result"}>{icon}</div>))
          ) : (<span className="text-zinc-550 text-[11px] font-mono">No sequence outcomes logged yet</span>)}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onRefresh()} disabled={perfLoading} className="flex-1 py-2.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-800 transition-all cursor-pointer active:scale-[0.98]">
          <RotateCw className={`w-3.5 h-3.5 ${perfLoading ? "animate-spin" : ""}`} /><span>Refresh Stats</span>
        </button>
        <button onClick={async () => {
          if (window.confirm("Are you sure you want to clear all historical and active trade tracking memory on the server? This cannot be undone.")) {
            try { await fetch(`${API_BASE_URL}/api/performance/clear`, { method: "POST" }); onRefresh(); } catch (err) { console.error(err); }
          }
        }} className="py-2.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-red-500/20 transition-all cursor-pointer active:scale-[0.98]">Reset Data</button>
      </div>
    </div>
  );
}
