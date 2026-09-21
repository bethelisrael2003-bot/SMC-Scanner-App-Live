const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Target, TrendingUp, TrendingDown, Shield, Zap, Activity, Layers, BarChart3, AlertCircle, CheckCircle2, XCircle, ChevronDown } from "lucide-react";

interface ClassicAnalysisResult {
  pair: string;
  timestamp: string;
  qualified: boolean;
  direction: "BUY" | "SELL" | null;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  slAtr: number | null;
  confluence: {
    h1Trend: string;
    dailyTrend: string;
    pdZone: string;
    poiType: string;
    passed: boolean;
  };
  setup: {
    structType: "CHOCH" | "BOS";
    sweepLevel: number;
    sweepExtreme: number;
    sweepTime: string;
    poiType: string;
    poiHigh: number;
    poiLow: number;
  } | null;
  checks: string[];
}

interface ClassicSignal {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  timestamp: string;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  rr: number;
  structType: "CHOCH" | "BOS";
  sweepLevel: number;
  sweepExtreme: number;
  sweepTime: string;
  poiType: string;
  poiHigh: number;
  poiLow: number;
  slAtr: number;
  status: "active" | "expired" | "traded";
  expired?: boolean;
}

interface ClassicStats {
  version: string;
  config: string;
  mode: string;
  totalSignals: number;
  activeSignals: number;
  trades: {
    total: number;
    open: number;
    closed: number;
    wins: number;
    losses: number;
    winRate: number;
    rSum: number;
    avgR: number | null;
    byExit?: Record<string, number>;
  };
  tradeList: any[];
}

const PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF",
  "USD/CAD", "AUD/USD", "NZD/USD", "GBP/JPY",
  "EUR/JPY", "XAU/USD", "XAG/USD"
];

export function ClassicTab() {
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [analysis, setAnalysis] = useState<ClassicAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<ClassicSignal[]>([]);
  const [stats, setStats] = useState<ClassicStats | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<boolean>(true);
  const [scanResults, setScanResults] = useState<{ pair: string; qualified: boolean; direction: string; checksCount: number }[]>([]);

  const fetchAnalysis = useCallback(async (pair: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/classic/${encodeURIComponent(pair)}`);
      if (res.ok) setAnalysis(await res.json());
      else setAnalysis(null);
    } catch { setAnalysis(null); }
    setLoading(false);
  }, []);

  const fetchSignalsAndStats = useCallback(async () => {
    try {
      const [sigRes, statRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/classic/signals`),
        fetch(`${API_BASE_URL}/api/classic/stats`),
      ]);
      if (sigRes.ok) setSignals(await sigRes.json());
      if (statRes.ok) setStats(await statRes.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchAnalysis(selectedPair); }, [selectedPair, fetchAnalysis]);
  useEffect(() => {
    fetchSignalsAndStats();
    const iv = setInterval(fetchSignalsAndStats, 30000);
    return () => clearInterval(iv);
  }, [fetchSignalsAndStats]);

  const runFullScan = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/classic/scan`);
      if (res.ok) {
        const data = await res.json();
        setScanResults(data.results?.map((r: ClassicAnalysisResult) => ({
          pair: r.pair,
          qualified: r.qualified,
          direction: r.direction ?? "-",
          checksCount: r.checks?.filter(c => c.startsWith("[OK]")).length ?? 0,
        })) ?? []);
        fetchSignalsAndStats();
        if (selectedPair) fetchAnalysis(selectedPair);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-lg">🏛</span>
              Classic SMC Detector
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono border border-amber-500/20">
                SIMULATED · ISOLATED
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              BOS / CHOCH + H4 Liquidity Sweep + Return to POI + M15 Confirmation · Independent Win Rate &amp; Signals
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runFullScan}
              disabled={loading}
              className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Scan All Pairs
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: "Signals", value: stats.totalSignals, sub: `${stats.activeSignals} active` },
              { label: "Trades", value: stats.trades.total, sub: `${stats.trades.open} open` },
              { label: "Win Rate", value: `${stats.trades.winRate}%`, sub: `${stats.trades.wins}W / ${stats.trades.losses}L` },
              { label: "R Total", value: `${stats.trades.rSum >= 0 ? "+" : ""}${stats.trades.rSum}R`, sub: "cumulative" },
              { label: "Avg R", value: stats.trades.avgR !== null ? `${stats.trades.avgR >= 0 ? "+" : ""}${stats.trades.avgR}R` : "—", sub: "per trade" },
              { label: "Closed", value: stats.trades.closed, sub: "resolved" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3 text-center">
                <div className="text-[9px] font-mono uppercase text-zinc-600">{label}</div>
                <div className={`text-lg font-bold font-mono ${label === "R Total" || label === "Avg R" ? (stats.trades.rSum >= 0 ? "text-emerald-400" : "text-red-400") : "text-white"}`}>{value}</div>
                <div className="text-[9px] text-zinc-600">{sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pair selector + Sequence breakdown */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            Classic Setup Analysis — {selectedPair}
          </h3>
          <select
            value={selectedPair}
            onChange={e => setSelectedPair(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-1.5 text-xs font-mono"
          >
            {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {loading && !analysis ? (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">Analyzing Classic Setup...</div>
        ) : analysis ? (
          <>
            {/* Status & Plan Banner */}
            <div className={`rounded-xl p-4 mb-4 border ${analysis.qualified ? "bg-emerald-500/5 border-emerald-500/20" : "bg-zinc-950/60 border-zinc-800/60"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {analysis.qualified ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-zinc-500" />
                  )}
                  <div>
                    <div className={`text-sm font-bold ${analysis.qualified ? "text-emerald-400" : "text-zinc-400"}`}>
                      {analysis.qualified ? `QUALIFIED CLASSIC SETUP (${analysis.setup?.structType})` : "NO QUALIFIED SETUP"}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {analysis.confluence.passed ? "Confluence Passed · Waiting for complete trigger" : "Waiting for alignment"}
                    </div>
                  </div>
                </div>
                {analysis.direction && (
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${analysis.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                    {analysis.direction === "BUY" ? <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1" />}
                    {analysis.direction}
                  </div>
                )}
              </div>

              {analysis.qualified && analysis.entry && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">Entry (M15 Close)</div>
                    <div className="text-sm font-bold text-white font-mono">{analysis.entry}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">Stop (Sweep Extreme)</div>
                    <div className="text-sm font-bold text-red-400 font-mono">{analysis.sl}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">Target (TP1 · 1.5R)</div>
                    <div className="text-sm font-bold text-emerald-400 font-mono">{analysis.tp1}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">R:R &amp; Risk</div>
                    <div className="text-sm font-bold text-amber-400 font-mono">1:{analysis.rr} ({analysis.slAtr}x ATR)</div>
                  </div>
                </div>
              )}
            </div>

            {/* 4-Phase Structural Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4">
                <div className="text-[10px] font-mono uppercase text-amber-400 font-bold mb-2 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> Phase 1: Context &amp; Confluence
                </div>
                <div className="space-y-1 text-[11px] font-mono text-zinc-400">
                  <div className="flex justify-between"><span>H1 Trend:</span> <span className="text-white font-semibold">{analysis.confluence.h1Trend}</span></div>
                  <div className="flex justify-between"><span>Daily Alignment:</span> <span className="text-white font-semibold">{analysis.confluence.dailyTrend}</span></div>
                  <div className="flex justify-between"><span>Location / Zone:</span> <span className="text-white font-semibold">{analysis.confluence.pdZone}</span></div>
                  <div className="flex justify-between"><span>H4 POI Source:</span> <span className="text-white font-semibold">{analysis.confluence.poiType}</span></div>
                </div>
              </div>

              <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4">
                <div className="text-[10px] font-mono uppercase text-amber-400 font-bold mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Phase 2-4: Trigger &amp; Execution
                </div>
                {analysis.setup ? (
                  <div className="space-y-1 text-[11px] font-mono text-zinc-400">
                    <div className="flex justify-between"><span>H4 Sweep Level:</span> <span className="text-white font-semibold">{analysis.setup.sweepLevel.toFixed(5)}</span></div>
                    <div className="flex justify-between"><span>Sweep Wick Extreme:</span> <span className="text-red-400 font-semibold">{analysis.setup.sweepExtreme.toFixed(5)}</span></div>
                    <div className="flex justify-between"><span>M15 Structure Shift:</span> <span className="text-emerald-400 font-semibold">{analysis.setup.structType}</span></div>
                    <div className="flex justify-between"><span>H4 POI Zone:</span> <span className="text-white font-semibold">{analysis.setup.poiLow.toFixed(5)}–{analysis.setup.poiHigh.toFixed(5)}</span></div>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-zinc-500 py-2">
                    Waiting for H4 liquidity sweep, M15 CHOCH/BOS, POI return, or confirmation.
                  </div>
                )}
              </div>
            </div>

            {/* Checklist items */}
            <div className="rounded-xl bg-zinc-950/40 border border-zinc-800/60 overflow-hidden">
              <div
                className="p-3 bg-zinc-900/40 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedCheck(!expandedCheck)}
              >
                <span className="text-xs font-semibold text-zinc-300 font-mono">Detailed Checks Log ({analysis.checks?.length ?? 0})</span>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expandedCheck ? "rotate-180" : ""}`} />
              </div>
              {expandedCheck && (
                <div className="p-3 space-y-1 border-t border-zinc-800/40">
                  {analysis.checks?.map((check, i) => (
                    <div key={i} className="text-[11px] font-mono text-zinc-400 flex items-center gap-2">
                      <span className={check.startsWith("[OK]") ? "text-emerald-400 font-bold" : check.startsWith("[X]") ? "text-red-400 font-bold" : "text-amber-400"}>
                        {check.slice(0, 4)}
                      </span>
                      <span>{check.slice(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">No data available for {selectedPair}</div>
        )}
      </div>

      {/* Classic Signals */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-400" />
          Classic Signals Feed
          <span className="text-[10px] text-zinc-500 font-mono ml-2">{signals.length} total</span>
        </h3>
        {signals.length === 0 ? (
          <div className="text-center py-6 text-zinc-600 text-xs font-mono">
            No signals generated yet — scanner checks all pairs continuously
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {signals.map((sig) => (
              <div key={sig.id} className={`flex items-center justify-between p-3 rounded-xl border ${sig.expired ? "border-zinc-800/40 bg-zinc-950/20 opacity-60" : "border-zinc-800/60 bg-zinc-950/40"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-white font-mono w-16">{sig.pair}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sig.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {sig.direction}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                    {sig.structType}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {new Date(sig.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-white">@ {sig.entryPrice}</span>
                  <span className="text-red-400">SL {sig.sl}</span>
                  <span className="text-emerald-400">TP1 {sig.tp1}</span>
                  <span className="text-amber-400">1:{sig.rr}</span>
                  <span className="text-zinc-500">Sweep {sig.sweepLevel?.toFixed(4)}</span>
                  {sig.expired && <span className="text-amber-500">⏰</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Simulated Trade History (Shadow Positions) */}
      {stats && stats.tradeList.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              Classic Simulated Trades Ledger
            </h3>
            {stats.trades.byExit && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                <span>Exits:</span>
                {Object.entries(stats.trades.byExit).map(([k, v]) => (
                  <span key={k} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{k}: {v}</span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {stats.tradeList.map((trade: any) => (
              <div key={trade.id} className={`flex items-center justify-between p-3 rounded-xl border ${trade.status === "open" ? "border-amber-500/20 bg-amber-500/[0.03]" : trade.status === "win" ? "border-emerald-500/10 bg-emerald-500/[0.02]" : "border-red-500/10 bg-red-500/[0.02]"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-white font-mono w-16">{trade.pair}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${trade.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {trade.direction}
                  </span>
                  {trade.breakevenTriggered && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono">🔒 BE</span>
                  )}
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {new Date(trade.openedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-white">@ {trade.entryPrice}</span>
                  <span className="text-zinc-500">SL: {trade.sl}</span>
                  <span className="text-zinc-500">TP1: {trade.tp1}</span>
                  {trade.status === "open" ? (
                    <span className="text-amber-400 flex items-center gap-1 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> LIVE
                    </span>
                  ) : (
                    <>
                      <span className={trade.status === "win" ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                        {trade.status === "win" ? "🏆 WIN" : "❌ LOSS"} ({trade.exitReason})
                      </span>
                      <span className={`font-bold ${trade.r >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {trade.r >= 0 ? `+${trade.r.toFixed(2)}` : trade.r.toFixed(2)}R
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full scan results grid */}
      {scanResults.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-amber-400" />
            Watchlist Classic Scan Overview
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {scanResults.map(r => (
              <div key={r.pair} className={`p-2 rounded-lg border text-center ${r.qualified ? "border-emerald-500/20 bg-emerald-500/5" : "border-zinc-800/60 bg-zinc-950/40"}`}>
                <div className="text-[9px] font-mono text-zinc-500">{r.pair}</div>
                <div className={`text-[10px] font-bold font-mono ${r.qualified ? "text-emerald-400" : "text-zinc-400"}`}>
                  {r.qualified ? r.direction : `${r.checksCount} checks`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
