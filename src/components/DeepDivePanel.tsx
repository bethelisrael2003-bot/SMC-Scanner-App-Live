const API_BASE_URL = import.meta.env.VITE_API_URL || "";
import { TrendingUp, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Sparkles, DollarSign, Copy, Activity, Search, AlertCircle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type React from "react";
import { CandlestickChart } from "./CandlestickChart";
import ErrorBoundary from "./ErrorBoundary";

function Info(props: React.SVGProps<SVGSVGElement>) {
  return (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>);
}

interface DeepDivePanelProps {
  activeResult: any;
  scanData: any;
  chartData: any[];
  chartTimeframe: string;
  setChartTimeframe: (tf: string) => void;
  chartLoading: boolean;
  copiedText: string | null;
  handleCopy: (text: string, label: string) => void;
  activeTrades: any[];
  setActiveTrades: Dispatch<SetStateAction<any[]>>;
  onFetchPerformance: () => Promise<void>;
}

export function DeepDivePanel({ activeResult, scanData, chartData, chartTimeframe, setChartTimeframe, chartLoading, copiedText, handleCopy, activeTrades, setActiveTrades, onFetchPerformance }: DeepDivePanelProps) {
  if (!activeResult) {
    return (
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center justify-center text-center">
        <Search className="w-10 h-10 text-zinc-600 mb-3" />
        <h3 className="text-sm font-semibold text-white">Select a Pair to Analyze</h3>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">Click on any currency pair or precious metal in the Watchlist panel to load its complete SMC gate checklist.</p>
      </div>
    );
  }

  const dec = activeResult.decision;
  const isJpy = activeResult.pair.includes("JPY");

  return (
    <div className="bg-zinc-900/60 border border-zinc-850 rounded-2xl p-6 flex flex-col gap-6 shadow-xl shadow-zinc-950/40 relative">
      {/* Pair header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display text-white tracking-tight flex items-center gap-2">
            {activeResult.pair} Deep-Dive
            <span className={`text-xs px-2.5 py-1 rounded-lg ${dec === "BUY" ? "bg-emerald-500 text-zinc-950 font-bold" : dec === "SELL" ? "bg-red-500 text-zinc-950 font-bold" : "bg-zinc-800 text-zinc-400"}`}>{dec}</span>
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-1">Scanned at real-time using Capital.com Demo API</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 w-full sm:w-auto font-mono text-xs">
          <div className="p-2 justify-center bg-zinc-800/40 rounded-xl border border-zinc-750 flex items-center gap-2"><span className="text-zinc-500">Mid:</span><span className="text-white font-semibold">{activeResult.price != null ? activeResult.price.toFixed(isJpy ? 3 : 5) : "--"}</span></div>
          <div className="p-2 justify-center bg-zinc-800/40 rounded-xl border border-zinc-750 flex items-center gap-2"><span className="text-zinc-550">Spread:</span><span className="text-emerald-400 font-semibold">{activeResult.live?.spread_pips ?? "--"} p</span></div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex bg-zinc-950/60 p-1 rounded-xl border border-zinc-850/80 w-fit">
            {["M15", "H1", "H4", "D1"].map((tf) => (<button key={tf} onClick={() => setChartTimeframe(tf)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${chartTimeframe === tf ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}>{tf}</button>))}
          </div>
        </div>
        <div className="relative min-h-[300px] w-full">
          {chartLoading && chartData.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/20 rounded-xl border border-zinc-800/80 backdrop-blur-sm z-10"><TrendingUp className="w-8 h-8 text-emerald-500 animate-spin mb-2" /><span className="text-xs font-mono text-zinc-500">Loading Chart Data...</span></div>
          ) : chartData.length > 0 ? (
            <ErrorBoundary fallback={<div className="h-[300px] flex flex-col items-center justify-center bg-zinc-900/20 rounded-xl border border-zinc-800/80"><AlertTriangle className="w-8 h-8 text-amber-500 mb-2" /><span className="text-xs font-mono text-zinc-500">Chart rendering failed.</span></div>}>
              <CandlestickChart data={chartData} pair={activeResult.pair} livePrice={activeResult.price} />
            </ErrorBoundary>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center bg-zinc-900/20 rounded-xl border border-zinc-800/80"><TrendingUp className="w-8 h-8 text-zinc-700 mb-2" /><span className="text-xs font-mono text-zinc-500">No chart data available</span></div>
          )}
        </div>
      </div>

      {/* Premium/Discount gauge */}
      {activeResult.range_high && activeResult.range_low && (
        <div className="p-4 bg-zinc-900/80 rounded-2xl border border-zinc-805 flex flex-col gap-3">
          <span className="text-zinc-400 font-display font-medium text-xs tracking-wider uppercase flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-zinc-500" />Dealer Range Position gauge</span>
          <div className="grid grid-cols-2 text-[10px] font-mono text-zinc-500">
            <span>R. Low (Discount): {activeResult.range_low.toFixed(isJpy ? 3 : 5)}</span>
            <span className="text-right">R. High (Premium): {activeResult.range_high.toFixed(isJpy ? 3 : 5)}</span>
          </div>
          <div className="relative h-6 w-full rounded-lg bg-zinc-850/80 border border-zinc-800 overflow-hidden flex">
            <div className="w-[30%] h-full bg-emerald-500/15 border-r border-dashed border-emerald-500/10 flex items-center justify-center"><span className="text-[9px] font-mono text-emerald-400/80 font-bold">DISCOUNT (30%)</span></div>
            <div className="w-[40%] h-full bg-zinc-800/20 border-r border-dashed border-zinc-750 flex items-center justify-center"><span className="text-[9px] font-mono text-zinc-500/60 font-bold">EQUILIBRIUM (40%)</span></div>
            <div className="w-[30%] h-full bg-red-500/15 flex items-center justify-center"><span className="text-[9px] font-mono text-red-400/80 font-bold">PREMIUM (30%)</span></div>
            {(() => {
              const rangeSize = activeResult.range_high - activeResult.range_low;
              const priceVal = activeResult.price != null ? activeResult.price : activeResult.range_low + rangeSize / 2;
              const posPercent = rangeSize > 0 ? ((priceVal - activeResult.range_low) / rangeSize) * 100 : 50;
              return <div style={{ left: `${Math.min(Math.max(posPercent, 0), 100)}%` }} className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] -translate-x-1/2 flex flex-col justify-between"><div className="w-2.5 h-2.5 bg-white border border-zinc-950 rounded-full -translate-x-1/3 -translate-y-[3px]" /><div className="w-2.5 h-2.5 bg-white border border-zinc-950 rounded-full -translate-x-1/3 translate-y-[3px]" /></div>;
            })()}
          </div>
          <div className="flex items-center justify-between text-xs font-mono"><span className="text-zinc-500">Residing zone:</span><span className={`font-bold px-2 py-0.5 rounded-md ${activeResult.zone === "DISCOUNT" ? "bg-emerald-500/10 text-emerald-400" : activeResult.zone === "PREMIUM" ? "bg-red-500/10 text-red-500" : "bg-zinc-800 text-zinc-400"}`}>{activeResult.zone}</span></div>
        </div>
      )}

      {/* Gate checklist */}
      <div>
        <h3 className="text-zinc-400 font-display font-medium text-xs tracking-wider uppercase mb-3 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />SMC Core gate verification</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[280px] overflow-y-auto pr-1">
          {Array.isArray(activeResult.checks) && activeResult.checks.map((check: string, idx: number) => {
            const isPass = check.includes("[OK]") || check.includes("Spread") && !check.includes("[X]");
            const isFail = check.includes("[X]") || check.includes("FAIL");
            const isWarning = check.includes("[!]");
            return (
              <div key={idx} className="p-2.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80 flex items-start gap-2 text-xs">
                {isPass ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : isFail ? <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" /> : isWarning ? <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> : <HelpCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />}
                <span className={isPass ? "text-zinc-200" : isFail ? "text-zinc-500" : isWarning ? "text-amber-300" : "text-zinc-400"}>{check.replace(/\[OK\]\s*|\[X\]\s*|\[!\]\s*/, "")}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confluences */}
      <div>
        <h3 className="text-zinc-400 font-display font-medium text-xs tracking-wider uppercase mb-3 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-zinc-500" />BONUSES & CONFLUENCES ({activeResult.bonuses}/7)</h3>
        {Array.isArray(activeResult.bonus_list) && activeResult.bonus_list.length > 0 ? (
          <div className="flex flex-wrap gap-2">{activeResult.bonus_list.map((bonus: string, index: number) => (<span key={index} className="px-2.5 py-1 bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 rounded-lg text-[10px] font-mono flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-yellow-400" />{bonus}</span>))}</div>
        ) : (<div className="text-[11px] font-mono text-zinc-500 bg-zinc-900/20 p-2.5 rounded-xl border border-zinc-800/60 text-center">No active confluences on current setup.</div>)}
      </div>

      {/* Trade plan */}
      {activeResult.plan ? (
        <div className={`p-4 rounded-2xl flex flex-col gap-3 border ${activeResult.passed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/5 border-zinc-805"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className={`text-[10px] font-mono tracking-wider uppercase flex items-center gap-1.5 ${activeResult.passed ? "text-emerald-400 font-semibold" : "text-amber-400"}`}><DollarSign className="w-3.5 h-3.5" />{activeResult.passed ? `SMC Confirmed Trade Plan (Grade ${activeResult.grade})` : "SMC Potential Trade Plan (WAIT status)"}</span>
              {!activeResult.passed && <span className="text-[10px] text-zinc-500 font-mono mt-0.5">*This setup has pending gates but a trade structure has been estimated below.</span>}
            </div>
            <div className="flex items-center gap-2 font-mono">
              {copiedText === "Trade Plan" ? (
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded-lg">Copied!</span>
              ) : (
                <button onClick={() => handleCopy(`${activeResult.pair} SMC Setup Plan:\nEntry: ${activeResult.plan.entry}\nSL: ${activeResult.plan.sl}\nTP1: ${activeResult.plan.tp1}\nTP2: ${activeResult.plan.tp2}\nTP3: ${activeResult.plan.tp3}`, "Trade Plan")} className="p-1 px-2.5 hover:bg-zinc-800 hover:text-zinc-200 text-zinc-400 rounded-lg text-[10px] flex items-center gap-1 cursor-pointer border border-zinc-800/80"><Copy className="w-3 h-3" />Copy</button>
              )}
              {activeTrades.some((t: any) => t.pair === activeResult.pair) ? (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 animate-pulse"><CheckCircle2 className="w-3.5 h-3.5" />Tracking In-Trade</span>
              ) : (
                <button onClick={async () => {
                  const newTrade = { pair: activeResult.pair, direction: activeResult.direction || "BUY", entry: activeResult.plan.entry, sl: activeResult.plan.sl, tp1: activeResult.plan.tp1, tp2: activeResult.plan.tp2, tp3: activeResult.plan.tp3, rr: activeResult.plan.rr, timestamp: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
                  setActiveTrades((prev: any[]) => [...prev, newTrade]);
                  try { await fetch(`${API_BASE_URL}/api/performance/enter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair: activeResult.pair, direction: activeResult.direction || "BUY", entryPrice: activeResult.plan.entry, sl: activeResult.plan.sl, tp1: activeResult.plan.tp1, tp2: activeResult.plan.tp2, tp3: activeResult.plan.tp3, grade: activeResult.grade }) }); onFetchPerformance(); } catch (err) { console.error("Could not sync trade to server performance monitor:", err); }
                }} className={`px-3 py-1 font-semibold font-display rounded-lg text-[11px] tracking-wider transition-all flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${activeResult.passed ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold shadow-md shadow-emerald-500/10" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"}`}>Mark as In Trade</button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
            <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center"><span className="text-[10px] text-zinc-500 font-mono uppercase">Entry</span><span className="text-sm font-bold text-white font-mono mt-0.5">{activeResult.plan.entry != null ? activeResult.plan.entry.toFixed(isJpy ? 3 : 5) : "--"}</span></div>
            <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center"><span className="text-[10px] text-red-400 font-mono uppercase">Stop Loss</span><span className="text-sm font-bold text-red-400 font-mono mt-0.5">{activeResult.plan.sl != null ? activeResult.plan.sl.toFixed(isJpy ? 3 : 5) : "--"}</span></div>
            <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center"><span className="text-[10px] text-zinc-500 font-mono uppercase">TP1 (1:2 RR)</span><span className="text-sm font-bold text-emerald-400 font-mono mt-0.5">{activeResult.plan.tp1 != null ? activeResult.plan.tp1.toFixed(isJpy ? 3 : 5) : "--"}</span></div>
            <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center"><span className="text-[10px] text-zinc-500 font-mono uppercase">TP2 (1:3 RR)</span><span className="text-sm font-bold text-emerald-400 font-mono mt-0.5">{activeResult.plan.tp2 != null ? activeResult.plan.tp2.toFixed(isJpy ? 3 : 5) : "--"}</span></div>
            <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center col-span-2 md:col-span-1"><span className="text-[10px] text-zinc-500 font-mono uppercase">TP3 (DOL)</span><span className="text-sm font-bold text-emerald-400 font-mono mt-0.5">{activeResult.plan.tp3 != null ? activeResult.plan.tp3.toFixed(isJpy ? 3 : 5) : "--"}</span></div>
          </div>
          <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 mt-2 pt-2 border-t border-zinc-800/60 gap-4">
            <span>R:R Reward target: <strong className="text-white">1:{activeResult.plan.rr}</strong></span>
            <span>Stop size: <strong className="text-white">{activeResult.plan.sl_atr}x ATR</strong></span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/15">Co-aligns of H1 + Daily Structure</span>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl flex items-center gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0" />
          <div><h4 className="text-xs font-bold text-white">No active trade plan</h4><p className="text-[11px] text-zinc-500 mt-0.5">Setup is currently in WAIT status because not all core gate filters are fully verified yet.</p></div>
        </div>
      )}

      {/* Correlation warning */}
      {scanData?.conflicts && scanData.conflicts.length > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col gap-2">
          <span className="text-red-400 text-xs font-semibold uppercase flex items-center gap-1.5 font-display"><AlertTriangle className="w-4 h-4 text-red-400" />USD Correlation Conflict Identified!</span>
          <div className="space-y-1.5 text-xs text-zinc-400 leading-relaxed font-mono mt-1">
            {Array.isArray(scanData.conflicts) && scanData.conflicts.map((c: any, index: number) => (<p key={index}>⚠️ Conflicted pairs detected: <span className="text-white font-bold">[{c.pair1}]</span> and <span className="text-white font-bold">[{c.pair2}]</span> share currency <span className="text-white font-bold">{c.currency}</span> but have opposite bias targets.</p>))}
            <p className="text-[10px] text-zinc-500 italic mt-1 pt-1.5 border-t border-red-500/10">*Rule K9: Do not trade both. Execute the stronger entry signal and put the weaker in WAIT.</p>
          </div>
        </div>
      )}
    </div>
  );
}
