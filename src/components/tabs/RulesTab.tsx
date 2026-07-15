import { BookOpen, TrendingUp, Shield } from "lucide-react";

export function RulesTab() {
  return (
    <div className="text-xs text-zinc-400 leading-relaxed font-sans max-h-[640px] overflow-y-auto flex flex-col gap-4">
      <div className="p-3.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-emerald-400" /> K1. Kill Zone Timings (GMT)</h3>
        <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400 font-mono">
          <li><strong className="text-emerald-400">London KZ:</strong> 07:00 – 10:00 (Nigerian 8am-11am)</li>
          <li><strong className="text-emerald-400">NY KZ:</strong> 12:00 – 15:00 (Nigerian 1pm-4pm)</li>
          <li><strong className="text-emerald-400">London/NY Overlap:</strong> 12:00 – 16:00 (Nigerian 1pm-5pm)</li>
          <li><strong className="text-red-400">Asian Session:</strong> 00:00 – 07:00 (Strictly No Trades)</li>
        </ul>
      </div>
      <div className="p-3.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> K4. Premium / Discount Zone</h3>
        <p className="mt-1">We use a 30% / 40% / 30% quartile allocation. We strictly trade only when the price resides at the extremes:</p>
        <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400 font-mono">
          <li><strong className="text-red-400">Premium (Top 30%):</strong> Shorts/Sell trades only</li>
          <li><strong className="text-zinc-500">Equilibrium (Middle 40%):</strong> No trades! No execution!</li>
          <li><strong className="text-emerald-400">Discount (Bottom 30%):</strong> Longs/Buy trades only</li>
        </ul>
      </div>
      <div className="p-3.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80">
        <h3 className="font-semibold text-white mb-2 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-emerald-400" /> Locked Risk Management</h3>
        <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400 font-mono">
          <li>Default Risk: 1% per setup</li>
          <li>Weekly/Daily/H1 Trend Align = A+ Setup (max 2% risk)</li>
          <li>Max limits: 3 Trades / Day or Daily DD Limit is -2%</li>
          <li>Breakeven protection: Always move SL to BE when price hits 1:1 RR</li>
        </ul>
      </div>
    </div>
  );
}
