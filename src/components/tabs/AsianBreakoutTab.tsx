const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Shield,
  Zap,
  Activity,
  BarChart3,
  CheckCircle2,
  XCircle,
  Award,
  Clock,
  Rocket,
  Flame,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

interface AsianRangeData {
  high: number;
  low: number;
  range: number;
  atrRatio: number;
  status: string;
}

interface AsianAnalysisResult {
  pair: string;
  timestamp: string;
  passed: boolean;
  asianRange: {
    day: string;
    high: number;
    low: number;
    range: number;
    barsCount: number;
    complete: boolean;
  } | null;
  setup: {
    pair: string;
    direction: "BUY" | "SELL";
    entry: number;
    sl: number;
    tp1: number;
    tp2: number;
    risk: number;
    asianHigh: number;
    asianLow: number;
    asianRange: number;
    atr: number;
    atrRatio: number;
    barRangeRatio: number;
    extensionRatio: number;
    barTime: string;
  } | null;
  checks: string[];
}

interface AsianSignal {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  timestamp: string;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  risk: number;
  asianHigh: number;
  asianLow: number;
  asianRange: number;
  atr: number;
  atrRatio: number;
  status: "active" | "expired" | "traded";
  expired?: boolean;
}

interface AsianStats {
  version: string;
  config: string;
  mode: string;
  backtestProven: string;
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

const ASIAN_PAIRS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "XAU/USD",
  "GBP/JPY"
];

function fmtPrice(pair: string, price: number | null | undefined): string {
  if (price === null || price === undefined) return "--";
  if (pair.includes("JPY")) return price.toFixed(3);
  if (pair.includes("XAU") || pair.includes("XAG")) return price.toFixed(2);
  return price.toFixed(5);
}

export function AsianBreakoutTab() {
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [analysis, setAnalysis] = useState<AsianAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<AsianSignal[]>([]);
  const [stats, setStats] = useState<AsianStats | null>(null);
  const [scanResults, setScanResults] = useState<{ pair: string; passed: boolean; direction: string; checksCount: number }[]>([]);

  const fetchAnalysis = useCallback(async (pair: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/asian/${encodeURIComponent(pair)}`);
      if (res.ok) setAnalysis(await res.json());
      else setAnalysis(null);
    } catch {
      setAnalysis(null);
    }
    setLoading(false);
  }, []);

  const fetchSignalsAndStats = useCallback(async () => {
    try {
      const [sigRes, statRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/asian/signals`),
        fetch(`${API_BASE_URL}/api/asian/stats`),
      ]);
      if (sigRes.ok) setSignals(await sigRes.json());
      if (statRes.ok) setStats(await statRes.json());
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchAnalysis(selectedPair);
  }, [selectedPair, fetchAnalysis]);

  useEffect(() => {
    fetchSignalsAndStats();
    const iv = setInterval(fetchSignalsAndStats, 30000);
    return () => clearInterval(iv);
  }, [fetchSignalsAndStats]);

  const runFullScan = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/asian/scan`);
      if (res.ok) {
        const data = await res.json();
        setScanResults(
          data.results?.map((r: any) => ({
            pair: r.pair,
            passed: r.passed,
            direction: r.setup ? r.setup.direction : "-",
            checksCount: r.checks?.filter((c: string) => c.startsWith("[OK]")).length ?? 0,
          })) ?? []
        );
        fetchSignalsAndStats();
        if (selectedPair) fetchAnalysis(selectedPair);
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-orange-400 to-rose-500" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">🚀</span>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Asian Session Range Breakout
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono border border-amber-500/20 font-bold flex items-center gap-1">
                <Award className="w-3 h-3" /> VERIFIED (+13.11R · 42.9% WR · 2.61 PF)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono border border-rose-500/20">
                SIMULATED · ISOLATED
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Asian Range (00:00–07:00 UTC) · Volatility Gate (0.36–1.35x ATR) · London Open Momentum (07:00–10:30 UTC) · Scaled Targets (35% @ 1.5R, 65% @ 4.0R, BE @ 0.8R)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runFullScan}
              disabled={loading}
              className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Scan Asian Setups
            </button>
          </div>
        </div>

        {/* Live Performance Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: "Signals", value: stats.totalSignals, sub: `${stats.activeSignals} active` },
              { label: "Trades", value: stats.trades.total, sub: `${stats.trades.open} open` },
              { label: "Win Rate", value: `${stats.trades.winRate}%`, sub: `${stats.trades.wins}W / ${stats.trades.losses}L` },
              { label: "R Total", value: `${stats.trades.rSum >= 0 ? "+" : ""}${stats.trades.rSum}R`, sub: "realized" },
              { label: "Avg R", value: stats.trades.avgR !== null ? `${stats.trades.avgR >= 0 ? "+" : ""}${stats.trades.avgR}R` : "—", sub: "per trade" },
              { label: "Closed", value: stats.trades.closed, sub: "resolved" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3 text-center">
                <div className="text-[9px] font-mono uppercase text-zinc-500">{label}</div>
                <div className={`text-lg font-bold font-mono ${label === "R Total" || label === "Avg R" ? (stats.trades.rSum >= 0 ? "text-amber-400" : "text-rose-400") : "text-white"}`}>{value}</div>
                <div className="text-[9px] text-zinc-500">{sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Pair Selector Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ASIAN_PAIRS.map(p => (
          <button
            key={p}
            onClick={() => setSelectedPair(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all whitespace-nowrap cursor-pointer ${
              selectedPair === p
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:border-zinc-700"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Deep Dive & Range Inspection Panel */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Asian Range Diagnostics &amp; Scaled Plan — {selectedPair}
          </h3>
          <span className="text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
            Window: 07:00–10:30 UTC
          </span>
        </div>

        {loading && !analysis ? (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">Analyzing Asian Session &amp; Momentum...</div>
        ) : analysis ? (
          <>
            {/* Status & Plan Banner */}
            <div className={`rounded-xl p-4 mb-4 border ${analysis.passed ? "bg-amber-500/5 border-amber-500/20" : "bg-zinc-950/60 border-zinc-800/60"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {analysis.passed ? (
                    <CheckCircle2 className="w-6 h-6 text-amber-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-zinc-500" />
                  )}
                  <div>
                    <div className={`text-sm font-bold ${analysis.passed ? "text-amber-400" : "text-zinc-400"}`}>
                      {analysis.passed ? `BREAKOUT DETECTED (${analysis.setup?.direction})` : "NO ACTIVE BREAKOUT SETUP"}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {analysis.asianRange ? `Asian Range: ${fmtPrice(selectedPair, analysis.asianRange.low)} – ${fmtPrice(selectedPair, analysis.asianRange.high)} (${analysis.asianRange.range.toFixed(5)})` : "Asian Range Forming"}
                    </div>
                  </div>
                </div>
                {analysis.setup && (
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${analysis.setup.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                    {analysis.setup.direction === "BUY" ? <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1" />}
                    {analysis.setup.direction}
                  </div>
                )}
              </div>

              {analysis.passed && analysis.setup && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-500 font-mono">Entry Price</div>
                    <div className="text-sm font-bold text-white font-mono">{fmtPrice(selectedPair, analysis.setup.entry)}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-500 font-mono">Stop Loss (+8% buff)</div>
                    <div className="text-sm font-bold text-rose-400 font-mono">{fmtPrice(selectedPair, analysis.setup.sl)}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-500 font-mono">Target 1 (35% @ 1.5R)</div>
                    <div className="text-sm font-bold text-amber-400 font-mono">{fmtPrice(selectedPair, analysis.setup.tp1)}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-500 font-mono">Target 2 (65% @ 4.0R)</div>
                    <div className="text-sm font-bold text-emerald-400 font-mono">{fmtPrice(selectedPair, analysis.setup.tp2)}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-500 font-mono">Risk Distance</div>
                    <div className="text-sm font-bold text-cyan-400 font-mono">{analysis.setup.risk}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Asian Range Metrics Card */}
            {analysis.asianRange && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3">
                  <div className="text-[9px] font-mono uppercase text-zinc-500">Asian High (00-07 UTC)</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">{fmtPrice(selectedPair, analysis.asianRange.high)}</div>
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3">
                  <div className="text-[9px] font-mono uppercase text-zinc-500">Asian Low (00-07 UTC)</div>
                  <div className="text-sm font-bold text-rose-400 font-mono">{fmtPrice(selectedPair, analysis.asianRange.low)}</div>
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3">
                  <div className="text-[9px] font-mono uppercase text-zinc-500">Asian Range</div>
                  <div className="text-sm font-bold text-white font-mono">{fmtPrice(selectedPair, analysis.asianRange.range)}</div>
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3">
                  <div className="text-[9px] font-mono uppercase text-zinc-500">Regime Status</div>
                  <div className="text-sm font-bold text-amber-400 font-mono">{analysis.asianRange.complete ? "Formed & Locked" : "Building (00-07 UTC)"}</div>
                </div>
              </div>
            )}

            {/* Diagnostic Gates Checklist */}
            <div className="space-y-1.5 font-mono text-xs">
              {analysis.checks?.map((chk, i) => {
                const isOk = chk.startsWith("[OK]");
                const isInfo = chk.startsWith("[INFO]");
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${
                      isOk
                        ? "bg-amber-500/5 border-amber-500/20 text-amber-300"
                        : isInfo
                        ? "bg-cyan-500/5 border-cyan-500/20 text-cyan-300"
                        : "bg-zinc-950/40 border-zinc-800/40 text-zinc-400"
                    }`}
                  >
                    <span className="font-bold shrink-0">{isOk ? "✓" : isInfo ? "ℹ" : "✗"}</span>
                    <span>{chk.replace(/^\[(OK|X|INFO)\]\s*/, "")}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-6 text-zinc-500 text-xs font-mono">No data available for {selectedPair}</div>
        )}
      </div>

      {/* Signals Feed */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-400" />
          Asian Breakout Signal Feed ({signals.length})
        </h3>
        {signals.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">
            No breakout signals logged yet today. Signals trigger between 07:00 and 10:30 UTC when an M15 candle closes decisively outside the Asian range.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {signals.map((sig) => (
              <div
                key={sig.id}
                className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 space-y-2 hover:border-zinc-700 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">{sig.pair}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        sig.direction === "BUY"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {sig.direction}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {sig.atrRatio}x ATR
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {new Date(sig.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                  <div className="bg-zinc-900/60 rounded p-1.5">
                    <div className="text-[8px] text-zinc-500 uppercase">Entry</div>
                    <div className="font-bold text-white">{fmtPrice(sig.pair, sig.entryPrice)}</div>
                  </div>
                  <div className="bg-zinc-900/60 rounded p-1.5">
                    <div className="text-[8px] text-zinc-500 uppercase">SL</div>
                    <div className="font-bold text-rose-400">{fmtPrice(sig.pair, sig.sl)}</div>
                  </div>
                  <div className="bg-zinc-900/60 rounded p-1.5">
                    <div className="text-[8px] text-zinc-500 uppercase">TP1 (1.5R)</div>
                    <div className="font-bold text-amber-400">{fmtPrice(sig.pair, sig.tp1)}</div>
                  </div>
                  <div className="bg-zinc-900/60 rounded p-1.5">
                    <div className="text-[8px] text-zinc-500 uppercase">TP2 (4.0R)</div>
                    <div className="font-bold text-emerald-400">{fmtPrice(sig.pair, sig.tp2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Simulated Paper Trades Ledger */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-amber-400" />
          Simulated Trades Ledger ({stats?.trades.total ?? 0})
        </h3>
        {!stats || stats.tradeList.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">
            No simulated trades yet. Trades enter automatically when an M15 breakout candle qualifies in the London Open window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase text-[9px] text-left">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Pair</th>
                  <th className="pb-2">Dir</th>
                  <th className="pb-2">Entry</th>
                  <th className="pb-2">SL</th>
                  <th className="pb-2">TP1 (1.5R)</th>
                  <th className="pb-2">TP2 (4.0R)</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Exit</th>
                  <th className="pb-2 text-right">R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {stats.tradeList.map((t: any) => (
                  <tr key={t.id} className="hover:bg-zinc-950/40">
                    <td className="py-2.5 text-zinc-400">{new Date(t.openedAt).toLocaleString()}</td>
                    <td className="py-2.5 font-bold text-white">{t.pair}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.direction === "BUY"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-300">{fmtPrice(t.pair, t.entryPrice)}</td>
                    <td className="py-2.5 text-rose-400">{fmtPrice(t.pair, t.sl)}</td>
                    <td className="py-2.5 text-amber-400">{fmtPrice(t.pair, t.tp1)}</td>
                    <td className="py-2.5 text-emerald-400">{fmtPrice(t.pair, t.tp2)}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          t.status === "open"
                            ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                            : t.status === "win"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-400">{t.exitReason || (t.breakevenTriggered ? "BE Active" : "—")}</td>
                    <td
                      className={`py-2.5 text-right font-bold ${
                        t.r !== undefined && t.r !== null
                          ? t.r >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {t.r !== undefined && t.r !== null ? `${t.r >= 0 ? "+" : ""}${t.r}R` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
