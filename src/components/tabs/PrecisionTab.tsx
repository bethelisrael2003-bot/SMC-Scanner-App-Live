const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";
import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Target, TrendingUp, TrendingDown, Shield, Zap, Eye, Activity, Layers, BarChart3, AlertCircle, CheckCircle2, XCircle, ChevronDown } from "lucide-react";

interface PrecisionStep {
  step: number;
  name: string;
  question: string;
  passed: boolean;
  detail: string;
  mandatory: boolean;
}

interface PrecisionResult {
  pair: string;
  timestamp: string;
  steps: PrecisionStep[];
  qualified: boolean;
  direction: "BUY" | "SELL" | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  rr: number | null;
  h4Trend: { state: string; description: string };
  h1Trend: { state: string; description: string };
  zones: any[];
  liquidity: { buyPools: any[]; sellPools: any[] };
  sweep: any;
  confirmation: any;
  noTradeReasons: string[];
}

interface PrecisionSignal {
  id: string;
  pair: string;
  direction: string;
  timestamp: string;
  entryPrice: number;
  sl: number;
  tp: number;
  rr: number;
  h4Trend: string;
  h1Trend: string;
  zoneType: string;
  zoneRange: string;
  confirmationType: string;
  stepsPassed: number;
  stepsTotal: number;
  status: string;
  expired?: boolean;
}

interface PrecisionStats {
  version: string;
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
  };
  tradeList: any[];
}

const PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "USD/CAD", "AUD/USD", "NZD/USD", "GBP/JPY", "EUR/JPY", "XAU/USD", "XAG/USD"];

function stepIcon(passed: boolean, mandatory: boolean) {
  if (passed) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (mandatory) return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertCircle className="w-4 h-4 text-amber-400" />;
}

export function PrecisionTab() {
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [analysis, setAnalysis] = useState<PrecisionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<PrecisionSignal[]>([]);
  const [stats, setStats] = useState<PrecisionStats | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [scanResults, setScanResults] = useState<{ pair: string; qualified: boolean; direction: string; steps: number }[]>([]);

  const fetchAnalysis = useCallback(async (pair: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/precision/${encodeURIComponent(pair)}`);
      if (res.ok) setAnalysis(await res.json());
      else setAnalysis(null);
    } catch { setAnalysis(null); }
    setLoading(false);
  }, []);

  const fetchSignalsAndStats = useCallback(async () => {
    try {
      const [sigRes, statRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/precision/signals`),
        fetch(`${API_BASE_URL}/api/precision/stats`),
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
      const res = await fetch(`${API_BASE_URL}/api/precision/scan`);
      if (res.ok) {
        const data = await res.json();
        setScanResults(data.results?.map((r: PrecisionResult) => ({
          pair: r.pair, qualified: r.qualified,
          direction: r.direction ?? "-", steps: r.steps.filter(s => s.passed).length,
        })) ?? []);
        fetchSignalsAndStats();
        if (selectedPair) fetchAnalysis(selectedPair);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  const mandatoryPassed = analysis?.steps.filter(s => s.mandatory && s.passed).length ?? 0;
  const mandatoryTotal = analysis?.steps.filter(s => s.mandatory).length ?? 0;
  const allPassed = analysis?.steps.filter(s => s.passed).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              Precision Intraday Trading
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              13-step structural sequence · 4H direction → 1H location → 15M execution · Completely independent system
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runFullScan} disabled={loading}
              className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all">
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
              { label: "R Total", value: `${stats.trades.rSum >= 0 ? "+" : ""}${stats.trades.rSum}R`, sub: "sum" },
              { label: "Avg R", value: stats.trades.avgR !== null ? `${stats.trades.avgR}R` : "—", sub: "per trade" },
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

      {/* Pair selector + 13-step analysis */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            13-Step Sequence — {selectedPair}
          </h3>
          <select value={selectedPair} onChange={e => setSelectedPair(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-3 py-1.5 text-xs font-mono">
            {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {loading && !analysis ? (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">Running 13-step sequence...</div>
        ) : analysis ? (
          <>
            {/* Summary bar */}
            <div className={`rounded-xl p-4 mb-4 border ${analysis.qualified ? "bg-emerald-500/5 border-emerald-500/20" : "bg-zinc-950/60 border-zinc-800/60"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {analysis.qualified ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400" />
                  )}
                  <div>
                    <div className={`text-sm font-bold ${analysis.qualified ? "text-emerald-400" : "text-red-400"}`}>
                      {analysis.qualified ? "QUALIFIED TRADE" : "NO TRADE"}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {mandatoryPassed}/{mandatoryTotal} mandatory · {allPassed}/13 total steps passed
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
                <div className="grid grid-cols-4 gap-3 mt-4">
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">Entry</div>
                    <div className="text-sm font-bold text-white font-mono">{analysis.entry}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">Stop</div>
                    <div className="text-sm font-bold text-red-400 font-mono">{analysis.sl}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">Target</div>
                    <div className="text-sm font-bold text-emerald-400 font-mono">{analysis.tp}</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2 text-center border border-zinc-800">
                    <div className="text-[8px] uppercase text-zinc-600 font-mono">R:R</div>
                    <div className="text-sm font-bold text-cyan-400 font-mono">1:{analysis.rr}</div>
                  </div>
                </div>
              )}
            </div>

            {/* 13 steps */}
            <div className="space-y-1.5">
              {analysis.steps.map((step) => (
                <div key={step.step}
                  className={`rounded-lg border transition-all cursor-pointer ${step.passed ? "border-emerald-500/10 bg-emerald-500/[0.02]" : step.mandatory ? "border-red-500/10 bg-red-500/[0.02]" : "border-zinc-800/60 bg-zinc-950/40"}`}
                  onClick={() => setExpandedStep(expandedStep === step.step ? null : step.step)}>
                  <div className="flex items-center gap-3 p-3">
                    {stepIcon(step.passed, step.mandatory)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-zinc-600">STEP {step.step}</span>
                        <span className="text-xs font-semibold text-zinc-200">{step.name}</span>
                        {!step.mandatory && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-mono border border-amber-500/20">STRENGTHENING</span>}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate">{step.question}</div>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${expandedStep === step.step ? "rotate-180" : ""}`} />
                  </div>
                  {expandedStep === step.step && (
                    <div className="px-6 pb-3 text-[11px] text-zinc-400 font-mono leading-relaxed border-t border-zinc-800/40 pt-2">
                      {step.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* No-trade reasons */}
            {analysis.noTradeReasons.length > 0 && (
              <div className="mt-4 rounded-xl bg-red-500/[0.03] border border-red-500/10 p-4">
                <div className="text-[10px] font-bold text-red-400 uppercase mb-2 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> No-Trade Conditions ({analysis.noTradeReasons.length})
                </div>
                {analysis.noTradeReasons.map((reason, i) => (
                  <div key={i} className="text-[11px] text-zinc-400 font-mono pl-4 border-l border-red-500/20 mb-1.5">{reason}</div>
                ))}
              </div>
            )}

            {/* HTF context */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4">
                <div className="text-[9px] font-mono uppercase text-zinc-600 mb-1">4H Environment</div>
                <div className={`text-sm font-bold ${analysis.h4Trend.state === "UPTREND" ? "text-emerald-400" : analysis.h4Trend.state === "DOWNTREND" ? "text-red-400" : "text-amber-400"}`}>
                  {analysis.h4Trend.state}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1 font-mono">{analysis.h4Trend.description}</div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4">
                <div className="text-[9px] font-mono uppercase text-zinc-600 mb-1">1H Context</div>
                <div className={`text-sm font-bold ${analysis.h1Trend.state === "UPTREND" ? "text-emerald-400" : analysis.h1Trend.state === "DOWNTREND" ? "text-red-400" : "text-amber-400"}`}>
                  {analysis.h1Trend.state}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1 font-mono">{analysis.h1Trend.description}</div>
              </div>
            </div>

            {/* Zones */}
            {analysis.zones && analysis.zones.length > 0 && (
              <div className="mt-3 bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4">
                <div className="text-[9px] font-mono uppercase text-zinc-600 mb-2 flex items-center gap-1.5">
                  <Shield className="w-3 h-3" /> Zones ({analysis.zones.length})
                </div>
                <div className="space-y-1.5">
                  {analysis.zones.slice(0, 5).map((zone, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={`px-1.5 py-0.5 rounded ${zone.type === "demand" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                        {zone.type.toUpperCase()}
                      </span>
                      <span className="text-zinc-400">{zone.low.toFixed(5)} – {zone.high.toFixed(5)}</span>
                      <span className="text-zinc-600">({zone.source.replace(/_/g, " ")}, grade {zone.grade}, {zone.touches} touches)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono">No data available for {selectedPair}</div>
        )}
      </div>

      {/* Signals */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-cyan-400" />
          Precision Signals
          <span className="text-[10px] text-zinc-500 font-mono ml-2">{signals.length} total</span>
        </h3>
        {signals.length === 0 ? (
          <div className="text-center py-6 text-zinc-600 text-xs font-mono">No signals yet — the system scans every 5 minutes</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {signals.map((sig) => (
              <div key={sig.id} className={`flex items-center justify-between p-3 rounded-xl border ${sig.expired ? "border-zinc-800/40 bg-zinc-950/20 opacity-60" : "border-zinc-800/60 bg-zinc-950/40"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-white font-mono w-16">{sig.pair}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sig.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {sig.direction}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {new Date(sig.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-white">{sig.entryPrice}</span>
                  <span className="text-red-400">SL {sig.sl}</span>
                  <span className="text-emerald-400">TP {sig.tp}</span>
                  <span className="text-cyan-400">1:{sig.rr}</span>
                  <span className="text-zinc-500">{sig.stepsPassed}/{sig.stepsTotal} steps</span>
                  {sig.expired && <span className="text-amber-500">⏰</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trade History */}
      {stats && stats.tradeList.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Precision Trade History
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {stats.tradeList.map((trade: any) => (
              <div key={trade.id} className={`flex items-center justify-between p-3 rounded-xl border ${trade.status === "open" ? "border-amber-500/20 bg-amber-500/[0.03]" : trade.status === "win" ? "border-emerald-500/10 bg-emerald-500/[0.02]" : "border-red-500/10 bg-red-500/[0.02]"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-white font-mono w-16">{trade.pair}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${trade.direction === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                    {trade.direction}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {new Date(trade.openedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-white">@ {trade.entryPrice}</span>
                  {trade.status === "open" ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> OPEN
                    </span>
                  ) : (
                    <>
                      <span className={trade.status === "win" ? "text-emerald-400" : "text-red-400"}>
                        {trade.status === "win" ? "🏆" : "❌"} {trade.exitReason}
                      </span>
                      <span className={`font-bold ${trade.r >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {trade.r >= 0 ? "+" : ""}{trade.r}R
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full scan results */}
      {scanResults.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-cyan-400" />
            Last Scan Results
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {scanResults.map(r => (
              <div key={r.pair} className={`p-2 rounded-lg border text-center ${r.qualified ? "border-emerald-500/20 bg-emerald-500/5" : "border-zinc-800/60 bg-zinc-950/40"}`}>
                <div className="text-[9px] font-mono text-zinc-500">{r.pair}</div>
                <div className={`text-[10px] font-bold font-mono ${r.qualified ? "text-emerald-400" : "text-zinc-400"}`}>
                  {r.qualified ? r.direction : `${r.steps}/13`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
