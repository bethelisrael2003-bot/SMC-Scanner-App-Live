import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Sparkles, DollarSign, Copy, Activity } from "lucide-react";
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
}

export function DeepDivePanel({ activeResult, scanData, chartData, chartTimeframe, setChartTimeframe, chartLoading, copiedText, handleCopy }: DeepDivePanelProps) {
  if (!activeResult) return null;

  const isJpy = activeResult.pair.includes("JPY");
  const dec = activeResult.decision;

  return (
    <div className="rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3" style={{ borderBottom: "1px solid var(--border-dim)" }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold" style={{ color: "var(--text-primary)" }}>{activeResult.pair}</span>
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: dec === "BUY" ? "rgba(0,255,136,0.15)" : dec === "SELL" ? "rgba(255,51,102,0.15)" : "rgba(255,255,255,0.05)", color: dec === "BUY" ? "#00ff88" : dec === "SELL" ? "#ff3366" : "var(--text-muted)" }}>{dec}</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span style={{ color: "var(--text-muted)" }}>Mid:</span>
          <span style={{ color: "#00d4ff" }}>{activeResult.price != null ? activeResult.price.toFixed(isJpy ? 3 : 5) : "--"}</span>
          <span style={{ color: "var(--text-muted)" }}>| Spr:</span>
          <span style={{ color: "#00ff88" }}>{activeResult.live?.spread_pips ?? "--"}p</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex items-center gap-1 mb-3">
        {["M15", "H1", "H4", "D1"].map((tf) => (
          <button key={tf} onClick={() => setChartTimeframe(tf)} className="px-3 py-1.5 rounded font-mono text-[10px] font-bold transition-all cursor-pointer" style={{ background: chartTimeframe === tf ? "rgba(0,212,255,0.1)" : "transparent", color: chartTimeframe === tf ? "#00d4ff" : "var(--text-muted)", border: `1px solid ${chartTimeframe === tf ? "rgba(0,212,255,0.3)" : "var(--border-dim)"}` }}>{tf}</button>
        ))}
      </div>
      <div className="relative min-h-[280px] w-full mb-4">
        {chartLoading && chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[280px] rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-dim)" }}>
            <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>Loading chart...</span>
          </div>
        ) : chartData.length > 0 ? (
          <ErrorBoundary fallback={<div className="h-[280px] flex items-center justify-center rounded-lg" style={{ background: "var(--bg-primary)" }}><span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>Chart error</span></div>}>
            <CandlestickChart data={chartData} pair={activeResult.pair} livePrice={activeResult.price} />
          </ErrorBoundary>
        ) : (
          <div className="h-[280px] flex items-center justify-center rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-dim)" }}>
            <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>No chart data</span>
          </div>
        )}
      </div>

      {/* Premium/Discount gauge */}
      {activeResult.range_high && activeResult.range_low && (
        <div className="p-3 rounded-lg mb-4" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-dim)" }}>
          <div className="flex justify-between font-mono text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>
            <span>R.Low: {activeResult.range_low.toFixed(isJpy ? 3 : 5)}</span>
            <span style={{ color: "#00d4ff" }}>Zone: {activeResult.zone}</span>
            <span>R.High: {activeResult.range_high.toFixed(isJpy ? 3 : 5)}</span>
          </div>
          <div className="relative h-5 rounded overflow-hidden flex" style={{ background: "var(--bg-primary)" }}>
            <div className="w-[30%] h-full" style={{ background: "rgba(0,255,136,0.1)" }} />
            <div className="w-[40%] h-full" style={{ background: "rgba(255,255,255,0.02)" }} />
            <div className="w-[30%] h-full" style={{ background: "rgba(255,51,102,0.1)" }} />
            {(() => {
              const rs = activeResult.range_high - activeResult.range_low;
              const pct = rs > 0 ? Math.min(Math.max(((activeResult.price - activeResult.range_low) / rs) * 100, 0), 100) : 50;
              return <div style={{ left: `${pct}%` }} className="absolute top-0 bottom-0 w-0.5 bg-white" />;
            })()}
          </div>
        </div>
      )}

      {/* Gate checks */}
      <div className="mb-4">
        <div className="font-mono text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>SMC GATE VERIFICATION</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {(activeResult.checks || []).map((check: string, idx: number) => {
            const isPass = check.includes("[OK]");
            const isFail = check.includes("[X]");
            const isWarn = check.includes("[!]");
            return (
              <div key={idx} className="p-2 rounded flex items-start gap-2 text-xs" style={{ background: "var(--bg-primary)" }}>
                {isPass ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#00ff88" }} /> : isFail ? <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#ff3366" }} /> : isWarn ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#ffaa00" }} /> : <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--text-muted)" }} />}
                <span style={{ color: isPass ? "var(--text-secondary)" : "var(--text-muted)" }}>{check.replace(/\[OK\]\s*|\[X\]\s*|\[!\]\s*/, "")}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confluences */}
      {activeResult.bonus_list && activeResult.bonus_list.length > 0 && (
        <div className="mb-4">
          <div className="font-mono text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>CONFLUENCES ({activeResult.bonuses}/7)</div>
          <div className="flex flex-wrap gap-2">
            {activeResult.bonus_list.map((bonus: string, i: number) => (
              <span key={i} className="font-mono text-[10px] px-2 py-1 rounded flex items-center gap-1" style={{ background: "rgba(255,170,0,0.08)", color: "#ffaa00", border: "1px solid rgba(255,170,0,0.2)" }}><Sparkles className="w-3 h-3" />{bonus}</span>
            ))}
          </div>
        </div>
      )}

      {/* Trade plan (display only — no manual entry) */}
      {activeResult.plan ? (
        <div className="p-3 rounded-lg" style={{ background: activeResult.passed ? "rgba(0,255,136,0.05)" : "var(--bg-primary)", border: `1px solid ${activeResult.passed ? "rgba(0,255,136,0.2)" : "var(--border-dim)"}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px]" style={{ color: activeResult.passed ? "#00ff88" : "#ffaa00" }}>
              {activeResult.passed ? `CONFIRMED SETUP (Grade ${activeResult.grade})` : "POTENTIAL SETUP (WAIT)"}
            </span>
            {copiedText === "Trade Plan" ? (
              <span className="font-mono text-[9px]" style={{ color: "#00ff88" }}>Copied!</span>
            ) : (
              <button onClick={() => handleCopy(`${activeResult.pair} ${dec}\nEntry: ${activeResult.plan.entry}\nSL: ${activeResult.plan.sl}\nTP1: ${activeResult.plan.tp1}\nTP2: ${activeResult.plan.tp2}`, "Trade Plan")} className="font-mono text-[9px] px-2 py-0.5 rounded cursor-pointer" style={{ color: "var(--text-muted)", border: "1px solid var(--border-dim)" }}><Copy className="w-3 h-3 inline" /> Copy</button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[{ l: "ENTRY", v: activeResult.plan.entry, c: "var(--text-primary)" }, { l: "SL", v: activeResult.plan.sl, c: "#ff3366" }, { l: "TP1", v: activeResult.plan.tp1, c: "#00ff88" }, { l: "TP2", v: activeResult.plan.tp2, c: "#00d4ff" }, { l: "TP3", v: activeResult.plan.tp3, c: "#8b5cf6" }].map(({ l, v, c }) => (
              <div key={l} className="text-center p-1.5 rounded" style={{ background: "var(--bg-card)" }}>
                <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>{l}</div>
                <div className="font-mono text-xs font-semibold" style={{ color: c }}>{v != null ? v.toFixed(isJpy ? 3 : 5) : "--"}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 pt-2 font-mono text-[10px]" style={{ borderTop: "1px solid var(--border-dim)", color: "var(--text-muted)" }}>
            <span>RR: <span style={{ color: "#00d4ff" }}>1:{activeResult.plan.rr}</span></span>
            <span>SL Size: <span style={{ color: "var(--text-secondary)" }}>{activeResult.plan.sl_atr}x ATR</span></span>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-lg flex items-center gap-2" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-dim)" }}>
          <Info className="w-4 h-4 shrink-0" style={{ color: "#ffaa00" }} />
          <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>No trade plan — setup has pending gates.</span>
        </div>
      )}
    </div>
  );
}
