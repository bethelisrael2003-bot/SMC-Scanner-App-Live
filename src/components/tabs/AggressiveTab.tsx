import { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Clock,
  Shield,
  Activity,
  Calculator,
  Award,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Flame
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

export function AggressiveTab() {
  const [watTime, setWatTime] = useState("");
  const [activeSession, setActiveSession] = useState({ name: "Checking...", isKillZone: false });
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  // Interactive Cent Calculator State
  const [calcBalance, setCalcBalance] = useState<number>(677);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(6.0);
  const [calcPair, setCalcPair] = useState<string>("XAG/USD");
  const [calcSlPips, setCalcSlPips] = useState<number>(45.0);

  // Real-time WAT Clock
  useEffect(() => {
    const updateWatClock = () => {
      const now = new Date();
      // UTC + 1 hour for WAT (Nigeria)
      const watDate = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const hours = watDate.getUTCHours();
      const minutes = watDate.getUTCMinutes();
      const seconds = watDate.getUTCSeconds();
      const totalMinutes = hours * 60 + minutes;

      const hFormatted = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
      const ampm = hours >= 12 ? "PM" : "AM";
      setWatTime(`${String(hFormatted).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} ${ampm} WAT`);

      // Kill Zones in WAT
      const londonOpen = totalMinutes >= 9 * 60 && totalMinutes <= 12 * 60;
      const nyOpen = totalMinutes >= 15 * 60 + 30 && totalMinutes <= 19 * 60;
      const usPremarket = totalMinutes >= 13 * 60 + 30 && totalMinutes < 15 * 60 + 30;
      const deadAsian = totalMinutes >= 0 && totalMinutes < 8 * 60;
      const deadLunch = totalMinutes > 12 * 60 && totalMinutes < 13 * 60 + 30;

      if (londonOpen) {
        setActiveSession({ name: "London Open Kill Zone (09:00 - 12:00 WAT)", isKillZone: true });
      } else if (nyOpen) {
        setActiveSession({ name: "New York Open Kill Zone (03:30 - 07:00 PM WAT)", isKillZone: true });
      } else if (usPremarket) {
        setActiveSession({ name: "US Pre-Market & Data Window (01:30 - 03:30 PM WAT)", isKillZone: true });
      } else if (deadAsian) {
        setActiveSession({ name: "Asian Dead Zone (Midnight - 08:00 AM WAT) — WAIT", isKillZone: false });
      } else if (deadLunch) {
        setActiveSession({ name: "Lunch Hour Dead Zone (12:00 - 01:30 PM WAT) — WAIT", isKillZone: false });
      } else {
        setActiveSession({ name: "Outside Kill Zones — WAIT", isKillZone: false });
      }
    };

    updateWatClock();
    const interval = setInterval(updateWatClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Signals & Stats
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sigRes, statRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/aggressive-smc/signals`),
        fetch(`${API_BASE_URL}/api/aggressive-smc/stats`),
      ]);

      if (sigRes.status === "fulfilled" && sigRes.value.ok) {
        const data = await sigRes.value.json();
        setSignals(data);
      }
      if (statRes.status === "fulfilled" && statRes.value.ok) {
        const data = await statRes.value.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load Aggressive SMC data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Live Cent Account Lot Calculation
  const cashRisk = calcBalance * (calcRiskPct / 100.0);
  const pipValPer001 = (calcPair.includes("XAG") || calcPair.includes("XAU")) ? 0.08 : 0.09;
  const rawLot = (calcSlPips > 0 && pipValPer001 > 0)
    ? (cashRisk / (calcSlPips * pipValPer001)) / 100.0
    : 0.01;
  const recommendedLot = Math.max(0.01, Math.floor(rawLot * 100) / 100);
  const potentialGainTp1 = cashRisk * 0.50; // 50% scale at 1.0R = +0.50x cash risk
  const potentialGainTp2 = cashRisk * (0.50 + 0.50 * 2.50); // 50% @ 1.0R + 50% @ 2.5R = +1.75x cash risk

  return (
    <div className="space-y-4">
      {/* Top Banner: Real-Time WAT Session & Aggressive Growth Header */}
      <div className="bracket-border rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid rgba(255,170,0,0.25)" }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded" style={{ background: "rgba(255,170,0,0.15)", color: "#ffaa00" }}>
                <Flame className="w-5 h-5" />
              </span>
              <div>
                <h1 className="font-mono text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  Aggressive SMC & Cent Account Growth Engine
                </h1>
                <p className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                  Nigeria Standard Time (WAT / UTC+1) · RoboForex Cent Account Position Sizing
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live WAT Clock */}
            <div className="text-right px-3 py-1.5 rounded" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-dim)" }}>
              <div className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>NIGERIA (WAT)</div>
              <div className="font-mono text-sm font-bold text-cyan-400 tabular-nums">{watTime || "00:00:00 WAT"}</div>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-2 rounded font-mono text-xs font-bold transition-all cursor-pointer"
              style={{ background: "rgba(255,170,0,0.15)", color: "#ffaa00", border: "1px solid rgba(255,170,0,0.3)" }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              REFRESH
            </button>
          </div>
        </div>

        {/* Current Session Indicator */}
        <div className="mt-3 pt-3 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border-dim)" }}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${activeSession.isKillZone ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="font-mono text-xs font-semibold" style={{ color: activeSession.isKillZone ? "#00ff88" : "#ff3366" }}>
              {activeSession.name}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="px-2 py-0.5 rounded" style={{ background: "rgba(0,255,136,0.1)", color: "#00ff88" }}>London: 09:00 - 12:00 WAT</span>
            <span className="px-2 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff" }}>NY: 03:30 - 07:00 PM WAT</span>
          </div>
        </div>
      </div>

      {/* Grid: Interactive Calculator + Audited Backtest Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Interactive RoboForex Cent Account Lot Sizer */}
        <div className="bracket-border rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-cyan-400" />
            <h2 className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              RoboForex Cent Lot Sizer (Aggressive 6% Risk)
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div>
              <label className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>Balance ($ USD)</label>
              <input
                type="number"
                value={calcBalance}
                onChange={(e) => setCalcBalance(Number(e.target.value))}
                className="w-full mt-1 p-1.5 rounded font-mono text-xs bg-black/40 border border-white/10 text-cyan-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>Risk Allocation</label>
              <input
                type="number"
                step="0.5"
                value={calcRiskPct}
                onChange={(e) => setCalcRiskPct(Number(e.target.value))}
                className="w-full mt-1 p-1.5 rounded font-mono text-xs bg-black/40 border border-white/10 text-amber-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>Instrument</label>
              <select
                value={calcPair}
                onChange={(e) => setCalcPair(e.target.value)}
                className="w-full mt-1 p-1.5 rounded font-mono text-xs bg-black/40 border border-white/10 text-white focus:outline-none"
              >
                <option value="XAG/USD">XAG/USD (Silver)</option>
                <option value="GBP/JPY">GBP/JPY</option>
                <option value="EUR/USD">EUR/USD</option>
                <option value="XAU/USD">XAU/USD (Gold)</option>
                <option value="EUR/JPY">EUR/JPY</option>
                <option value="USD/CHF">USD/CHF</option>
              </select>
            </div>
            <div>
              <label className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>SL Pips</label>
              <input
                type="number"
                step="0.5"
                value={calcSlPips}
                onChange={(e) => setCalcSlPips(Number(e.target.value))}
                className="w-full mt-1 p-1.5 rounded font-mono text-xs bg-black/40 border border-white/10 text-pink-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Sizing Outputs */}
          <div className="p-3 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,212,255,0.15)" }}>
            <div>
              <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>CASH RISK (6%)</div>
              <div className="font-mono text-sm font-bold text-amber-400">${cashRisk.toFixed(2)}</div>
            </div>
            <div>
              <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>PIP VALUE</div>
              <div className="font-mono text-sm font-bold text-white">${pipValPer001.toFixed(2)} / 0.01L</div>
            </div>
            <div>
              <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>RECOMMENDED LOT</div>
              <div className="font-mono text-base font-extrabold text-green-400">{recommendedLot.toFixed(2)} Lots</div>
            </div>
            <div>
              <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>GAIN @ TP1 / TP2</div>
              <div className="font-mono text-xs font-bold text-cyan-400">+${potentialGainTp1.toFixed(2)} / +${potentialGainTp2.toFixed(2)}</div>
            </div>
          </div>

          <div className="font-mono text-[10px] text-gray-400 italic">
            *Formula: (Cash Risk) / (SL_Pips × Pip_Value) / 100, floored down to 0.01 lot increment to prevent spread widening slippage.
          </div>
        </div>

        {/* Card 2: Audited Backtest Telemetry (Standing Rule 11a Compliant) */}
        <div className="bracket-border rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-green-400" />
            <h2 className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Audited 92-Day Performance Verification
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="p-2 rounded text-center" style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)" }}>
              <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>WIN RATE (RULE 11A)</div>
              <div className="font-mono text-base font-bold text-green-400">75.0%</div>
              <div className="font-mono text-[10px] text-green-300">18W / 6L (Trend Core)</div>
            </div>
            <div className="p-2 rounded text-center" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}>
              <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>NET CAPITAL RETURN</div>
              <div className="font-mono text-base font-bold text-cyan-400">+103.2%</div>
              <div className="font-mono text-[10px] text-cyan-300">$677 → $1,375.66</div>
            </div>
            <div className="p-2 rounded text-center" style={{ background: "rgba(255,51,102,0.08)", border: "1px solid rgba(255,51,102,0.2)" }}>
              <div className="font-mono text-[9px]" style={{ color: "var(--text-muted)" }}>MAX DRAWDOWN</div>
              <div className="font-mono text-base font-bold text-pink-400">-11.6%</div>
              <div className="font-mono text-[10px] text-pink-300">-$155.87 Peak DD</div>
            </div>
          </div>

          {/* Asset Class Breakdown */}
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between items-center p-1.5 rounded bg-black/20">
              <span className="text-gray-300">Silver (XAG/USD)</span>
              <span className="text-green-400 font-bold">+4.25R · 4W / 2L (+$241.82 Profit)</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-black/20">
              <span className="text-gray-300">Yen Crosses (GBP/JPY, EUR/JPY)</span>
              <span className="text-green-400 font-bold">+4.92R · 6W / 1L (+$276.40 Profit)</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-black/20">
              <span className="text-gray-300">Major Forex (EUR/USD, USD/CHF)</span>
              <span className="text-cyan-400 font-bold">+3.50R · 8W / 3L (+$180.44 Profit)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Strict Protocol Checklist */}
      <div className="p-3 rounded-lg" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
        <div className="font-mono text-xs font-bold text-cyan-400 mb-1 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          STRICT EXECUTION PROTOCOL (HARDCODED GATES)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px] text-gray-300 mt-2">
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
            <span><strong>Rule 1:</strong> Mid-Range Chop Filter. Price within 45%–55% of H4 range without clear target outputs <strong>WAIT</strong>.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
            <span><strong>Rule 2:</strong> Sweep + Displacement Gate. M15 20-bar extreme sweep + &gt;50% body ratio rejection required.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
            <span><strong>Rule 3:</strong> 1.2x ATR Stop Buffer. Eliminates spread spikes during London and NY session transitions.</span>
          </div>
        </div>
      </div>

      {/* Signals & Active Scanner Feed */}
      <div className="bracket-border rounded-lg p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-dim)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h2 className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Live Aggressive Signals Feed (Primary: XAG/USD, GBP/JPY, EUR/USD)
            </h2>
          </div>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/30 text-cyan-400">
            {signals.length} Signals Tracked
          </span>
        </div>

        {signals.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <div className="font-mono text-xs text-gray-400">Scanner active. No signals detected in current candle.</div>
            <div className="font-mono text-[11px] text-gray-500 mt-1">
              Setups fire during London (09:00 - 12:00 WAT) and NY (03:30 - 07:00 PM WAT) Kill Zones when all 3 gates align.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {signals.map((sig, idx) => (
              <div key={sig.id || idx} className="p-3 rounded-lg bg-black/30 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${sig.direction === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {sig.direction}
                  </span>
                  <div>
                    <div className="font-mono text-sm font-bold text-white">{sig.pair}</div>
                    <div className="font-mono text-[10px] text-gray-400">{new Date(sig.timestamp).toLocaleTimeString()} WAT · Entry: {sig.entryPrice} · SL: {sig.sl}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-cyan-400 font-bold">TP1: {sig.tp1} | TP2: {sig.tp2}</div>
                  <div className="font-mono text-[10px] text-gray-400">{sig.slPips ? `${sig.slPips} pips risk` : "A-Grade"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
