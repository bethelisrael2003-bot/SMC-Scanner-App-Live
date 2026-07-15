import { Activity, Sparkles } from "lucide-react";

interface SignalsTabProps {
  signals: any[];
  signalsLoading: boolean;
  scannerStatus: any;
}

export function SignalsTab({ signals, signalsLoading, scannerStatus }: SignalsTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {scannerStatus && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Auto-Scanner Status
            </span>
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              scannerStatus.isScanning ? "bg-amber-500/10 text-amber-400 animate-pulse" : "bg-emerald-500/10 text-emerald-400"
            }`}>{scannerStatus.isScanning ? "Scanning..." : "Idle (Polling)"}</span>
          </div>
          <p className="text-xs text-zinc-300 font-semibold leading-relaxed">
            {scannerStatus.message || "Initializing daemon check..."}
          </p>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-zinc-850 pt-1.5 mt-0.5">
            <span>Last checked: {scannerStatus.lastScanTime ? new Date(scannerStatus.lastScanTime).toLocaleTimeString() : "Pending"}</span>
            <span>Total Checked: {scannerStatus.pairsChecked?.length || 0}</span>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
        {signalsLoading && signals.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-zinc-900/30 animate-pulse border border-zinc-900" />
          ))
        ) : Array.isArray(signals) && signals.length > 0 ? (
          signals.map((sig: any) => {
            if (!sig || !sig.pair) return null;
            const isJpy = sig.pair.includes("JPY");
            const entry = typeof sig.entryPrice === "number" ? sig.entryPrice : 0;
            const sl = typeof sig.sl === "number" ? sig.sl : 0;
            const tp1 = typeof sig.tp1 === "number" ? sig.tp1 : 0;
            const tp2 = typeof sig.tp2 === "number" ? sig.tp2 : 0;
            return (
              <div key={sig.id || Math.random()} className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-2 text-xs relative hover:border-zinc-700/60 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-bold font-mono text-[10px] ${
                      sig.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}>{sig.direction || "WAIT"}</span>
                    <span className="font-bold text-white text-sm font-mono">{sig.pair}</span>
                    {sig.grade && <span className="bg-zinc-800 text-zinc-350 text-[10px] font-bold px-1.5 py-0.2 rounded-md font-mono border border-zinc-700/60">Grade {sig.grade}</span>}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {sig.timestamp ? new Date(sig.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-[10px] text-zinc-400 border-t border-zinc-850">
                  <div><span className="text-zinc-550 block text-[9px] uppercase">Entry</span><span className="text-zinc-200 mt-0.5 block">{entry.toFixed(isJpy ? 3 : 5)}</span></div>
                  <div><span className="text-zinc-550 block text-[9px] uppercase">Stop Loss</span><span className="text-red-400 mt-0.5 block">{sl.toFixed(isJpy ? 3 : 5)}</span></div>
                  <div><span className="text-zinc-550 block text-[9px] uppercase">Target 1</span><span className="text-emerald-400 mt-0.5 block">{tp1.toFixed(isJpy ? 3 : 5)}</span></div>
                  <div><span className="text-zinc-550 block text-[9px] uppercase">Target 2</span><span className="text-teal-400 mt-0.5 block">{tp2.toFixed(isJpy ? 3 : 5)}</span></div>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-1 pt-1 border-t border-zinc-900/60">
                  <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-emerald-500" /><span>Score: +{sig.bonuses || 0} SMC factors</span></span>
                  <span className="text-zinc-500 font-bold uppercase">{sig.session || "ACTIVE"} Killzone</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 bg-zinc-900/10 border border-zinc-800/60 rounded-xl p-6 flex flex-col items-center justify-center">
            <Activity className="w-8 h-8 text-zinc-650 mb-2 animate-pulse" />
            <h4 className="text-xs font-semibold text-white">No signals yet</h4>
            <p className="text-[11px] text-zinc-550 max-w-xs text-center mt-1">Any qualifying entries registered during the background cycles (checked every minute) will load here in real time.</p>
          </div>
        )}
      </div>
    </div>
  );
}
