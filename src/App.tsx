import { useState, useEffect } from "react";
import { useScannerState } from "./hooks/useScannerState";
import { DeepDivePanel } from "./components/DeepDivePanel";
import { CandlestickChart } from "./components/CandlestickChart";
import { PushNotifications } from '@capacitor/push-notifications';

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

// ── Push Setup ──────────────────────────────────────────────────────────────
async function setupPush() {
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await PushNotifications.register();
    PushNotifications.addListener('registration', (token) => {
      fetch(`${API_BASE_URL}/api/device/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.value })
      }).catch(() => {});
    });
  } catch (err) { console.error('Push error:', err); }
}

// ── Types ───────────────────────────────────────────────────────────────────
type TabId = "signals" | "watchlist" | "trades" | "performance" | "news" | "rules";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "signals", label: "Signals", icon: "⚡" },
  { id: "watchlist", label: "Watchlist", icon: "👁" },
  { id: "trades", label: "Trades", icon: "📊" },
  { id: "performance", label: "Performance", icon: "📈" },
  { id: "news", label: "News", icon: "📡" },
  { id: "rules", label: "SMC Rules", icon: "📖" },
];

// ── Mini Components ─────────────────────────────────────────────────────────
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return <div className="w-full h-1 rounded-full bg-white/5"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 80},${32 - ((v - min) / range) * 32}`).join(" ");
  return <svg width="80" height="32" viewBox="0 0 80 32"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function fmtPrice(pair: string, price: number): string {
  if (!price && price !== 0) return "--";
  if (pair.includes("JPY")) return price.toFixed(3);
  if (pair.includes("XAU") || pair.includes("XAG")) return price.toFixed(2);
  return price.toFixed(5);
}

// ── Signals Tab ─────────────────────────────────────────────────────────────
function SignalsTab({ signals, loading }: { signals: any[]; loading: boolean }) {
  if (loading && signals.length === 0) return <div className="text-center py-12 font-mono text-xs" style={{ color: "var(--text-muted)" }}>Scanning for setups...</div>;
  if (!signals || signals.length === 0) return <div className="text-center py-12"><div className="font-mono text-xs mb-2" style={{ color: "var(--text-muted)" }}>No signals yet</div><p className="text-[11px] max-w-xs mx-auto" style={{ color: "var(--text-muted)" }}>Signals will appear here when the scanner detects A-grade setups during Kill Zones.</p></div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {signals.map((sig, idx) => (
        <div key={sig.id || idx} className="animate-fade-up bracket-border rounded-lg p-4" style={{ background: "var(--bg-card)", border: `1px solid ${sig.direction === "BUY" ? "rgba(0,255,136,0.12)" : "rgba(255,51,102,0.12)"}`, animationDelay: `${idx * 0.05}s` }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold" style={{ color: "var(--text-primary)" }}>{sig.pair}</span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: sig.direction === "BUY" ? "rgba(0,255,136,0.15)" : "rgba(255,51,102,0.15)", color: sig.direction === "BUY" ? "#00ff88" : "#ff3366" }}>{sig.direction}</span>
                {sig.grade && <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff" }}>Grade {sig.grade}</span>}
              </div>
              <div className="font-mono text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>{sig.timestamp ? new Date(sig.timestamp).toLocaleString() : ""} · {sig.session || ""}</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[{ l: "ENTRY", v: sig.entryPrice, c: "var(--text-primary)" }, { l: "SL", v: sig.sl, c: "#ff3366" }, { l: "TP1", v: sig.tp1, c: "#00ff88" }, { l: "TP2", v: sig.tp2, c: "#00d4ff" }].map(({ l, v, c }) => (
              <div key={l} className="text-center p-1.5 rounded" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>{l}</div>
                <div className="font-mono text-xs font-semibold" style={{ color: c }}>{v ? fmtPrice(sig.pair, v) : "--"}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1"><span className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>SCORE</span><span className="font-mono text-xs font-bold" style={{ color: "#ffaa00" }}>+{sig.bonuses || 0}</span></div>
            <span className="font-mono text-[9px] px-2 py-0.5 rounded" style={{ background: "rgba(0,255,136,0.08)", color: "#00ff88" }}>{sig.session || "ACTIVE"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Watchlist Tab ───────────────────────────────────────────────────────────
function WatchlistTab({ scanData, loading, selectedPair, setSelectedPair }: { scanData: any; loading: boolean; selectedPair: string; setSelectedPair: (p: string) => void }) {
  const results = scanData?.results || [];
  if (loading && results.length === 0) return <div className="text-center py-12 font-mono text-xs" style={{ color: "var(--text-muted)" }}>Loading scan data...</div>;
  
  // Sort: BUY/SELL first, then by most gates passed
  const sorted = [...results].sort((a: any, b: any) => {
    if (a.decision !== "WAIT" && b.decision === "WAIT") return -1;
    if (a.decision === "WAIT" && b.decision !== "WAIT") return 1;
    const aPass = (a.checks || []).filter((c: string) => c.includes("[OK]")).length;
    const bPass = (b.checks || []).filter((c: string) => c.includes("[OK]")).length;
    return bPass - aPass;
  });

  return (
    <div className="space-y-2">
      {sorted.map((r: any, idx: number) => {
        const plan = r.plan;
        const checks = r.checks || [];
        const passed = checks.filter((c: string) => c.includes("[OK]")).length;
        const failed = checks.filter((c: string) => c.includes("[X]"));
        const mainBlock = failed[0]?.replace(/\[X\]\s*/, "") || "All gates passed";
        const isActionable = r.decision === "BUY" || r.decision === "SELL";
        
        return (
          <div key={r.pair} onClick={() => setSelectedPair(r.pair)} className="animate-fade-up rounded-lg p-3 cursor-pointer transition-all" style={{ 
            background: selectedPair === r.pair ? "var(--bg-card-hover)" : "var(--bg-card)", 
            border: `1px solid ${isActionable ? (r.decision === "BUY" ? "rgba(0,255,136,0.3)" : "rgba(255,51,102,0.3)") : selectedPair === r.pair ? "rgba(0,212,255,0.3)" : "var(--border-dim)"}`, 
            animationDelay: `${idx * 0.04}s` 
          }}>
            {/* Row 1: Pair + Decision */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{r.pair}</span>
                {r.grade && r.grade !== "-" && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff" }}>{r.grade}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{r.price ? fmtPrice(r.pair, r.price) : "--"}</span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ 
                  background: r.decision === "BUY" ? "rgba(0,255,136,0.15)" : r.decision === "SELL" ? "rgba(255,51,102,0.15)" : "rgba(255,255,255,0.05)", 
                  color: r.decision === "BUY" ? "#00ff88" : r.decision === "SELL" ? "#ff3366" : "var(--text-muted)" 
                }}>{r.decision}</span>
              </div>
            </div>

            {/* Row 2: Trade plan levels (always show if available) */}
            {plan && (
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {[{ l: "ENTRY", v: plan.entry, c: "var(--text-secondary)" }, { l: "SL", v: plan.sl, c: "#ff3366" }, { l: "TP1", v: plan.tp1, c: "#00ff88" }, { l: "TP2", v: plan.tp2, c: "#00d4ff" }].map(({ l, v, c }) => (
                  <div key={l} className="text-center py-1 rounded" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="font-mono text-[8px]" style={{ color: "var(--text-muted)" }}>{l}</div>
                    <div className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v != null ? fmtPrice(r.pair, v) : "--"}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Row 3: Trend + Zone + Gate readiness */}
            <div className="flex items-center gap-3 text-[9px] font-mono">
              {r.h1_trend && <span style={{ color: r.h1_trend === "BULLISH" ? "#00ff88" : r.h1_trend === "BEARISH" ? "#ff3366" : "var(--text-muted)" }}>H1: {r.h1_trend}</span>}
              {r.zone && r.zone !== "COMPRESSED" && <span style={{ color: r.zone === "DISCOUNT" ? "#00ff88" : r.zone === "PREMIUM" ? "#ff3366" : "var(--text-muted)" }}>Zone: {r.zone}</span>}
              <span style={{ color: passed >= 5 ? "#00ff88" : passed >= 3 ? "#ffaa00" : "var(--text-muted)" }}>Gates: {passed}/{checks.length}</span>
            </div>

            {/* Row 4: What's blocking (only if WAIT) */}
            {!isActionable && failed.length > 0 && (
              <div className="font-mono text-[9px] mt-1.5 pt-1.5" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-dim)" }}>
                <span style={{ color: "#ff3366" }}>●</span> {mainBlock.slice(0, 70)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Trades Tab ──────────────────────────────────────────────────────────────
function TradesTab({ activeTrades, scanData }: { activeTrades: any[]; scanData: any }) {
  if (!activeTrades || activeTrades.length === 0) return <div className="text-center py-12"><div className="font-mono text-xs mb-2" style={{ color: "var(--text-muted)" }}>No active trades</div><p className="text-[11px] max-w-xs mx-auto" style={{ color: "var(--text-muted)" }}>Track positions by marking pairs as "In Trade" from the pair detail view.</p></div>;
  return (
    <div className="space-y-3">
      {activeTrades.map((t: any, idx: number) => {
        const scanItem = scanData?.results?.find((r: any) => r.pair === t.pair);
        const current = scanItem?.price ?? t.entry;
        const isProfit = t.direction === "BUY" ? current >= t.entry : current <= t.entry;
        return (
          <div key={t.pair} className="animate-fade-up p-4 rounded-lg" style={{ background: "var(--bg-card)", border: `1px solid ${isProfit ? "rgba(0,255,136,0.15)" : "rgba(255,51,102,0.15)"}`, animationDelay: `${idx * 0.08}s` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="animate-pulse-dot w-2 h-2 rounded-full inline-block" style={{ background: isProfit ? "#00ff88" : "#ff3366" }} />
                <span className="font-mono text-base font-bold" style={{ color: "var(--text-primary)" }}>{t.pair}</span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: t.direction === "BUY" ? "rgba(0,255,136,0.12)" : "rgba(255,51,102,0.12)", color: t.direction === "BUY" ? "#00ff88" : "#ff3366" }}>{t.direction}</span>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>CURRENT</div>
                <div className="font-mono text-sm font-bold" style={{ color: "#00d4ff" }}>{fmtPrice(t.pair, current)}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div><div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>ENTRY</div><div className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>{fmtPrice(t.pair, t.entry)}</div></div>
              <div><div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>SL</div><div className="font-mono text-sm" style={{ color: "#ff3366" }}>{fmtPrice(t.pair, t.sl)}</div></div>
              <div><div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>TP1</div><div className="font-mono text-sm" style={{ color: "#00ff88" }}>{fmtPrice(t.pair, t.tp1)}</div></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Performance Tab ─────────────────────────────────────────────────────────
function PerformanceTab({ stats, loading, onRefresh }: { stats: any; loading: boolean; onRefresh: () => void }) {
  if (loading && !stats) return <div className="text-center py-12 font-mono text-xs" style={{ color: "var(--text-muted)" }}>Loading performance...</div>;
  const wr = stats?.winRate || 0, total = stats?.totalTrades || 0, wins = stats?.totalWins || 0, losses = stats?.totalLosses || 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[{ l: "WIN RATE", v: `${wr}%`, c: wr >= 50 ? "#00ff88" : "#ffaa00" }, { l: "TOTAL TRADES", v: total, c: "#00d4ff" }, { l: "WINS", v: wins, c: "#00ff88" }, { l: "LOSSES", v: losses, c: "#ff3366" }].map(({ l, v, c }) => (
          <div key={l} className="p-4 rounded-lg bracket-border" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
            <div className="font-mono text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>{l}</div>
            <div className="font-mono text-2xl font-bold" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>
      {stats?.sequence && stats.sequence.length > 0 && (
        <div className="p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
          <div className="font-mono text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>RECENT OUTCOMES</div>
          <div className="flex flex-wrap gap-1.5">{stats.sequence.map((icon: string, i: number) => <div key={i} className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-dim)" }}>{icon}</div>)}</div>
        </div>
      )}
      {(stats?.trades || []).map((t: any, i: number) => (
        <div key={t.id || i} className="px-4 py-3 rounded-lg" style={{ background: "var(--bg-card)", border: `1px solid ${t.breakevenTriggered ? "rgba(139,92,246,0.2)" : "var(--border-dim)"}` }}>
          {/* Top row: pair + badges + outcome */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t.pair}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: t.direction === "BUY" ? "rgba(0,255,136,0.1)" : "rgba(255,51,102,0.1)", color: t.direction === "BUY" ? "#00ff88" : "#ff3366" }}>{t.direction}</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.08)", color: "#00d4ff" }}>{t.grade}</span>
              {t.breakevenTriggered && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.3)" }}>🔒 BE</span>}
            </div>
            {t.status === "Open" ? (
              <span className="font-mono text-xs px-2 py-0.5 rounded flex items-center gap-1.5 shrink-0" style={{ background: "rgba(255,170,0,0.1)", color: "#ffaa00" }}>
                <span className="animate-pulse-dot w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ background: "#ffaa00" }} />LIVE
              </span>
            ) : (
              <span className="font-mono text-xs font-bold shrink-0" style={{ color: t.status === "Closed - WIN" ? "#00ff88" : "#ff3366" }}>
                {t.status === "Closed - WIN" ? "🏆" : "❌"} {t.rrGained >= 0 ? "+" : ""}{t.rrGained?.toFixed(2)}R
              </span>
            )}
          </div>
          {/* Bottom row: entry + SL */}
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span style={{ color: "var(--text-muted)" }}>Entry: <span style={{ color: "var(--text-secondary)" }}>{t.entryPrice}</span></span>
            {t.sl && <span style={{ color: "var(--text-muted)" }}>SL: <span style={{ color: t.breakevenTriggered ? "#8b5cf6" : "#ff3366" }}>{t.sl}{t.breakevenTriggered ? " → BE" : ""}</span></span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── News Tab ────────────────────────────────────────────────────────────────
function NewsTab({ news, loading }: { news: any[]; loading: boolean }) {
  if (loading && (!news || news.length === 0)) return <div className="text-center py-12 font-mono text-xs" style={{ color: "var(--text-muted)" }}>Loading calendar...</div>;
  if (!news || news.length === 0) return <div className="text-center py-12 font-mono text-xs" style={{ color: "var(--text-muted)" }}>No events today</div>;
  return (
    <div className="space-y-3">{news.map((item: any, idx: number) => {
      const imp = (item.impact || "").toUpperCase();
      const color = imp === "HIGH" ? "#ff3366" : imp === "MEDIUM" ? "#ffaa00" : "#7a9bb5";
      return (
        <div key={idx} className="animate-fade-up p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)", animationDelay: `${idx * 0.05}s` }}>
          <div className="flex items-start gap-3">
            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border" style={{ color, borderColor: color + "44" }}>{imp}</span>
            <div className="flex-1">
              <div className="font-mono text-[9px] mb-1" style={{ color: "var(--text-muted)" }}>[{item.currency}] {item.time}</div>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{item.event}</p>
              <div className="mt-1 flex gap-3"><span className="font-mono text-[10px]" style={{ color: "var(--text-secondary)" }}>F: {item.forecast || "-"}</span><span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>P: {item.previous || "-"}</span></div>
            </div>
          </div>
        </div>
      );
    })}</div>
  );
}

// ── Rules Tab ───────────────────────────────────────────────────────────────
function RulesTab() {
  return (
    <div className="space-y-4">
      {[
        { t: "Kill Zone Timings (GMT)", items: ["London KZ: 07:00–10:00 (Lagos 8-11am)", "NY KZ: 12:00–15:00 (Lagos 1-4pm)", "Overlap: 12:00–16:00 — BEST", "Asian: 00:00–07:00 — NO TRADES"] },
        { t: "Premium / Discount Zones", items: ["Premium (top 30%) = SELL only", "Discount (bottom 30%) = BUY only", "EQ (middle 40%) = NO TRADES", "Range must be ≥ 1.5× ATR"] },
        { t: "Risk Management", items: ["Default risk: 1% per setup", "A+ setup (3+ confluence): max 2%", "Max 3 trades/day or -2% DD", "Breakeven at 1:1 R:R"] },
      ].map((s, si) => (
        <div key={si} className="p-4 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
          <div className="font-mono text-sm font-bold mb-2" style={{ color: "#00d4ff" }}>{s.t}</div>
          <ul className="space-y-1">{s.items.map((item, i) => <li key={i} className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>• {item}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

// ── Right Sidebar ───────────────────────────────────────────────────────────
function RightSidebar({ scanData, signals, perfStats }: { scanData: any; signals: any[]; perfStats: any }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  const sessions = [{ n: "LONDON", s: 7, e: 16 }, { n: "NEW YORK", s: 12, e: 21 }, { n: "TOKYO", s: 0, e: 8 }];
  const utcH = time.getUTCHours();
  const wr = perfStats?.winRate || 0;
  return (
    <div className="w-60 shrink-0 flex flex-col gap-3">
      <div className="p-3 rounded-lg text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
        <div className="font-mono text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>UTC CLOCK</div>
        <div className="font-mono text-2xl font-bold tabular-nums" style={{ color: "#00d4ff" }}>{time.toUTCString().slice(17, 25)}</div>
      </div>
      <div className="p-3 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
        <div className="font-mono text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>SESSIONS</div>
        {sessions.map(s => { const open = utcH >= s.s && utcH < s.e; return (
          <div key={s.n} className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: open ? "#00ff88" : "#1a2a3a" }} /><span className="font-mono text-xs" style={{ color: open ? "var(--text-primary)" : "var(--text-muted)" }}>{s.n}</span></div>
            <span className="font-mono text-[9px] px-2 py-0.5 rounded" style={{ background: open ? "rgba(0,255,136,0.1)" : "rgba(0,0,0,0.2)", color: open ? "#00ff88" : "var(--text-muted)" }}>{open ? "OPEN" : "CLOSED"}</span>
          </div>
        ); })}
      </div>
      <div className="p-3 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
        <div className="font-mono text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>STATS</div>
        {[{ l: "Signals", v: signals?.length || 0, c: "#00d4ff" }, { l: "Win Rate", v: `${wr}%`, c: wr >= 50 ? "#00ff88" : "#ffaa00" }, { l: "Setups Today", v: scanData?.passed_count || 0, c: "#00ff88" }].map(({ l, v, c }) => (
          <div key={l} className="flex justify-between mb-1.5"><span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{l}</span><span className="font-mono text-xs font-bold" style={{ color: c }}>{v}</span></div>
        ))}
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const s = useScannerState();
  const [activeTab, setActiveTab] = useState<TabId>("watchlist");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setupPush(); }, []);

  // Tab polling
  useEffect(() => {
    if (activeTab === "performance") s.handleFetchPerformance();
    if (activeTab === "signals") s.handleFetchSignals();
    const interval = setInterval(() => { s.handleFetchSignals(); }, 15000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const activeResult = s.scanData?.results?.find((r: any) => r.pair === s.selectedPair);
  const tickerPairs = s.scanData?.results || [];

  return (
    <div className="scanline min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Ticker */}
      <div className="overflow-hidden py-1.5" style={{ background: "rgba(0,212,255,0.05)", borderBottom: "1px solid var(--border-dim)" }}>
        <div className="animate-ticker flex gap-8 whitespace-nowrap w-max">
          {[...tickerPairs, ...tickerPairs].map((t: any, i: number) => (
            <span key={i} className="font-mono text-[11px] flex items-center gap-2">
              <span style={{ color: "var(--text-muted)" }}>{t.pair}</span>
              <span style={{ color: "#00d4ff" }}>{t.price ? fmtPrice(t.pair, t.price) : "--"}</span>
              <span style={{ color: t.decision === "BUY" ? "#00ff88" : t.decision === "SELL" ? "#ff3366" : "var(--text-muted)" }}>{t.decision}</span>
              <span style={{ color: "var(--border-dim)" }}>|</span>
            </span>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="px-4 sm:px-6 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border-dim)", background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "linear-gradient(135deg, #00d4ff22, #8b5cf622)", border: "1px solid rgba(0,212,255,0.3)" }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#00d4ff" strokeWidth="1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
          </div>
          <div>
            <div className="font-mono text-sm font-bold" style={{ color: "#00d4ff", letterSpacing: "0.15em" }}>SMC SCANNER</div>
            <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>SMART MONEY TERMINAL</div>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-1">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs transition-all" style={{ background: activeTab === tab.id ? "rgba(0,212,255,0.1)" : "transparent", color: activeTab === tab.id ? "#00d4ff" : "var(--text-muted)", borderBottom: activeTab === tab.id ? "1px solid #00d4ff" : "1px solid transparent" }}>
              <span>{tab.icon}</span><span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={() => s.handleScan(true)} disabled={s.loading} className="px-3 py-1.5 rounded font-mono text-xs font-bold transition-all cursor-pointer" style={{ background: s.loading ? "rgba(0,212,255,0.05)" : "rgba(0,212,255,0.15)", color: s.loading ? "var(--text-muted)" : "#00d4ff", border: "1px solid rgba(0,212,255,0.3)" }}>
            {s.loading ? "SCANNING..." : "⚡ SCAN"}
          </button>
          <button className="md:hidden p-2 rounded" style={{ border: "1px solid var(--border-dim)", color: "var(--text-secondary)" }} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        </div>
      </header>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="md:hidden px-4 py-3 flex flex-wrap gap-2" style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-dim)" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setMenuOpen(false); }} className="flex items-center gap-1 px-3 py-1.5 rounded font-mono text-xs" style={{ background: activeTab === tab.id ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.03)", color: activeTab === tab.id ? "#00d4ff" : "var(--text-muted)", border: `1px solid ${activeTab === tab.id ? "rgba(0,212,255,0.3)" : "var(--border-dim)"}` }}>
              <span>{tab.icon}</span><span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex gap-4 p-4 overflow-auto">
        <div className="flex-1 min-w-0 space-y-4">
          {/* Pair detail (always visible at top on watchlist tab) */}
          {activeTab === "watchlist" && activeResult && (
            <DeepDivePanel activeResult={activeResult} scanData={s.scanData} chartData={s.chartData} chartTimeframe={s.chartTimeframe} setChartTimeframe={s.setChartTimeframe} chartLoading={s.chartLoading} copiedText={null} handleCopy={() => {}} />
          )}
          {/* Tab content */}
          {activeTab === "watchlist" && <WatchlistTab scanData={s.scanData} loading={s.loading} selectedPair={s.selectedPair} setSelectedPair={s.setSelectedPair} />}
          {activeTab === "signals" && <SignalsTab signals={s.signals} loading={s.signalsLoading} />}
          {activeTab === "trades" && <TradesTab activeTrades={s.activeTrades} scanData={s.scanData} />}
          {activeTab === "performance" && <PerformanceTab stats={s.performanceStats} loading={s.perfLoading} onRefresh={s.handleFetchPerformance} />}
          {activeTab === "news" && <NewsTab news={s.newsData} loading={s.newsLoading} />}
          {activeTab === "rules" && <RulesTab />}
        </div>
        {/* Right sidebar */}
        <div className="hidden lg:block"><RightSidebar scanData={s.scanData} signals={s.signals} perfStats={s.performanceStats} /></div>
      </main>

      {/* Status bar */}
      <footer className="px-4 sm:px-6 py-2 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-dim)", background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>SIGNALS: <span style={{ color: "#00d4ff" }}>{s.scanData?.passed_count || 0}</span></span>
          <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>SOURCE: <span style={{ color: "#00d4ff" }}>Capital.com</span></span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded flex items-center gap-1.5" style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88" }}>
            <span className="animate-pulse-dot w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />LIVE
          </span>
        </div>
      </footer>
    </div>
  );
}
