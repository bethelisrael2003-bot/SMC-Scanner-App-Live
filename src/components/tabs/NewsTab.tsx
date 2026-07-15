import { RotateCw } from "lucide-react";
import { useState } from "react";

interface NewsTabProps {
  newsData: any[];
  newsLoading: boolean;
  onRefresh: () => Promise<void>;
}

export function NewsTab({ newsData, newsLoading, onRefresh }: NewsTabProps) {
  const [newsFilter, setNewsFilter] = useState<"high_medium" | "high" | "all">("high_medium");

  const filteredNews = newsData.filter((event: any) => {
    const imp = (event.impact || "").toUpperCase();
    if (newsFilter === "high") return imp === "HIGH";
    if (newsFilter === "high_medium") return imp === "HIGH" || imp === "MEDIUM";
    return true;
  });

  return (
    <div className="flex flex-col gap-3 min-h-[300px] max-h-[640px] overflow-y-auto pr-1">
      <div className="flex items-center justify-between text-xs font-mono text-zinc-500 pb-2 border-b border-zinc-800">
        <span>Economic Calendars today</span>
        <button onClick={() => onRefresh()} disabled={newsLoading} className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer">
          <RotateCw className={`w-3 h-3 ${newsLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="flex gap-1.5 p-1 bg-zinc-950/60 rounded-xl border border-zinc-850/80">
        <button onClick={() => setNewsFilter("high_medium")} className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] uppercase font-semibold transition-all cursor-pointer text-center ${newsFilter === "high_medium" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-zinc-500 hover:text-zinc-350 border border-transparent"}`}>Medium / High</button>
        <button onClick={() => setNewsFilter("high")} className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] uppercase font-semibold transition-all cursor-pointer text-center ${newsFilter === "high" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "text-zinc-500 hover:text-zinc-350 border border-transparent"}`}>High Only</button>
        <button onClick={() => setNewsFilter("all")} className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] uppercase font-semibold transition-all cursor-pointer text-center ${newsFilter === "all" ? "bg-zinc-800 text-zinc-300 border border-zinc-700/60" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>All</button>
      </div>
      {newsLoading ? (
        Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-16 rounded-xl bg-zinc-900/30 animate-pulse border border-zinc-900" />))
      ) : filteredNews.length > 0 ? (
        filteredNews.map((event: any, i: number) => {
          const imp = (event.impact || "").toUpperCase();
          const impactColorClass = imp === "HIGH" ? "bg-red-500/10 text-red-400 border-red-500/20" : imp === "MEDIUM" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-zinc-800 text-zinc-400 border-zinc-700";
          return (
            <div key={i} className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/80 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">{event.time}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${impactColorClass}`}>{imp} IMPACT</span>
              </div>
              <div><h4 className="text-xs font-bold text-white flex items-center gap-1.5"><span className="text-zinc-400 font-mono">[{event.currency}]</span> {event.event}</h4></div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60">
                <span>Frcst: <span className="text-zinc-300">{event.forecast || "-"}</span></span>
                <span>Prev: <span className="text-zinc-300">{event.previous || "-"}</span></span>
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-8 text-zinc-500 text-xs font-mono">No economic calendars listed for today.</div>
      )}
    </div>
  );
}
