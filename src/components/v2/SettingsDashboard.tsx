import React, { useState } from "react";
import {
  Settings,
  ShieldCheck,
  Volume2,
  VolumeX,
  Bell,
  Clock,
  Radio,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  Power,
  ShieldAlert,
} from "lucide-react";
import { Card, Badge, Button, Modal, formatPips, formatUSD } from "./ui";

export interface SpreadArmorPair {
  pair: string;
  currentSpread: number;
  threshold: number;
  isLocked: boolean;
  reason?: string;
  status: string;
}

export interface SettingsDashboardProps {
  brokerAccount?: string;
  brokerBalance?: number;
  autoTradingEnabled?: boolean;
  onToggleAutoTrading?: () => Promise<void>;
  spreadArmorPairs: SpreadArmorPair[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRequestPushPerms?: () => Promise<void>;
  buildVersion?: string;
}

export const SettingsDashboard: React.FC<SettingsDashboardProps> = ({
  brokerAccount = "#322839360067416350",
  brokerBalance = 10722.1,
  autoTradingEnabled = true,
  onToggleAutoTrading,
  spreadArmorPairs,
  soundEnabled,
  onToggleSound,
  onRequestPushPerms,
  buildVersion = "v4.5 Pro (Audit Hardened)",
}) => {
  const [toggleLoading, setToggleLoading] = useState(false);
  const [confirmToggleAction, setConfirmToggleAction] = useState<"enable" | "disable" | null>(null);

  const handleInitiateToggle = () => {
    if (!onToggleAutoTrading || toggleLoading) return;
    setConfirmToggleAction(autoTradingEnabled ? "disable" : "enable");
  };

  const handleConfirmToggle = async () => {
    if (!onToggleAutoTrading) return;
    setToggleLoading(true);
    try {
      await onToggleAutoTrading();
      setConfirmToggleAction(null);
    } catch (err) {
      console.error("[SETTINGS] Error toggling auto-trading:", err);
    } finally {
      setToggleLoading(false);
    }
  };

  return (
    <div className="space-y-4 font-mono">
      {/* ── Section 1: Execution Engine & Broker Link ── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400 shrink-0" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Broker Connection &amp; Cloud Engine
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans leading-relaxed">
              24/7 automated background execution connecting to Capital.com REST API.
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <Badge variant="success" size="xs" dot pulseDot className="whitespace-nowrap">
              Connected
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Broker Target Account</span>
            <span className="text-sm font-bold text-white mt-0.5 block">{brokerAccount}</span>
            <span className="text-[10px] text-zinc-400 mt-1 block">Capital.com Demo CFD</span>
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Verified Live Equity</span>
            <span className="text-sm font-bold text-emerald-400 mt-0.5 block">{formatUSD(brokerBalance)}</span>
            <span className="text-[10px] text-zinc-400 mt-1 block">USD Base Currency</span>
          </div>
        </div>

        {/* Auto-Trading Switcher Card */}
        <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-white block">Automated Broker Execution</span>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
              Fires confirmed Grade A+ / Grade A setups on Capital.com demo
            </p>
          </div>

          {onToggleAutoTrading && (
            <Button
              type="button"
              variant={autoTradingEnabled ? "primary" : "secondary"}
              size="sm"
              isLoading={toggleLoading}
              onClick={handleInitiateToggle}
              icon={<Power className="w-3.5 h-3.5" />}
            >
              {autoTradingEnabled ? "ACTIVE (ON)" : "DISABLED (OFF)"}
            </Button>
          )}
        </div>
      </Card>

      {/* Confirmation Modal: Enable Automated Execution */}
      <Modal
        isOpen={confirmToggleAction === "enable"}
        onClose={() => setConfirmToggleAction(null)}
        onConfirm={handleConfirmToggle}
        variant="primary"
        isLoading={toggleLoading}
        title="Enable Automated Execution?"
        confirmText="Enable Automation"
        cancelText="Keep Disabled"
        icon={<Power className="w-4 h-4 text-emerald-400" />}
        description={
          <div className="space-y-2.5 mt-1 font-sans">
            <p className="text-zinc-200">
              Automated broker execution will allow the 24/7 cloud engine to autonomously place Capital.com demo CFD orders when confirmed <strong>Grade A+ / Grade A setups</strong> satisfy the <strong>80% confluence threshold</strong>.
            </p>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono space-y-1 text-zinc-400">
              <div className="text-zinc-300 font-bold uppercase text-[10px] tracking-wider mb-1">
                Active Cloud Safeguards:
              </div>
              <div>• $25.00 Flat Risk Parity sizing per trade</div>
              <div>• 2-Hour Post-Loss Lockout on recent loss pairs</div>
              <div>• Daily Drawdown Circuit Breaker (Max 2 losses / -$50/day)</div>
              <div>• Max 1 trade per pair per day cap</div>
              <div>• Dynamic Spread Armor &amp; News Lockout gates</div>
            </div>
          </div>
        }
      />

      {/* Confirmation Modal: Disable Automated Execution */}
      <Modal
        isOpen={confirmToggleAction === "disable"}
        onClose={() => setConfirmToggleAction(null)}
        onConfirm={handleConfirmToggle}
        variant="warning"
        isLoading={toggleLoading}
        title="Disable Automated Execution?"
        confirmText="Disable Automation"
        cancelText="Keep Active"
        icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
        description={
          <div className="space-y-2.5 mt-1 font-sans">
            <p className="text-zinc-200">
              This will freeze all new automated market entries across all pairs. No new trades will be opened by the background engine.
            </p>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono space-y-1.5 text-zinc-400">
              <div className="text-emerald-400 font-bold uppercase text-[10px] tracking-wider">
                Existing Position Defense:
              </div>
              <p className="text-zinc-300">
                Any currently open broker positions will <strong>remain open</strong> and continue to be defended by their native Capital.com Stop Loss and Take Profit orders, plus cloud profit defense trailing guards.
              </p>
            </div>
          </div>
        }
      />

      {/* ── Section 2: Risk Armor & Spread Monitor ── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Risk Armor &amp; Spread Gates
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans leading-relaxed">
              Monitors live broker liquidity. Enforces 2-hour post-loss lockouts &amp; max 2 losses/day circuit breaker.
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <Badge variant="neutral" size="xs" className="whitespace-nowrap">Armed</Badge>
          </div>
        </div>

        <div className="space-y-2">
          {spreadArmorPairs.map((p) => (
            <div
              key={p.pair}
              className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
            >
              <div className="min-w-0 pr-1">
                <span className="font-bold text-white text-xs">{p.pair}</span>
                <span className="text-[11px] text-zinc-400 ml-2">
                  Current Spread: <strong className={p.isLocked ? "text-rose-400" : "text-emerald-400"}>{p.currentSpread}p</strong> (Max Safe: {p.threshold}p)
                </span>
              </div>

              <div className="shrink-0">
                <Badge variant={p.isLocked ? "danger" : "success"} size="xs" dot className="whitespace-nowrap">
                  {p.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Section 3: Alerts & Audio Preferences ── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Alerts &amp; Audio Notifications
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-sans">
              Tactile audio chimes and native Android push notifications for signal confirmations.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] flex items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-white block">Signal Audio Ping</span>
            <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
              Plays a discreet institutional chime when an A+ setup confirms
            </p>
          </div>

          <Button
            type="button"
            variant={soundEnabled ? "successOutline" : "secondary"}
            size="sm"
            onClick={onToggleSound}
            icon={soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          >
            {soundEnabled ? "CHIME ENABLED" : "MUTED"}
          </Button>
        </div>

        {onRequestPushPerms && (
          <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] flex items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-white block">Android Push Notifications</span>
              <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                High-priority background alerts for trade entries and Take Profit hits
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRequestPushPerms}
              icon={<Bell className="w-3.5 h-3.5 text-cyan-400" />}
            >
              Verify Push
            </Button>
          </div>
        )}
      </Card>

      {/* ── Section 4: Institutional Trading Windows (Visual Timetable) ── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400 shrink-0" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Institutional Market Schedule (Nigeria WAT / UTC)
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans leading-relaxed">
              Algorithmic execution strictly aligns with peak institutional order flow windows.
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <Badge variant="neutral" size="xs" className="whitespace-nowrap">GMT+1</Badge>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-xl bg-[#111721] border border-emerald-500/30 flex justify-between items-center gap-2">
            <div className="min-w-0 pr-1">
              <span className="font-bold text-emerald-400 block truncate">1. London Open Morning Window</span>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                08:30 – 12:30 WAT · 07:30 – 11:30 UTC · Peak European Liquidity Runs
              </div>
            </div>
            <div className="shrink-0">
              <Badge variant="success" size="xs" className="whitespace-nowrap">Grade A+</Badge>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-cyan-500/30 flex justify-between items-center gap-2">
            <div className="min-w-0 pr-1">
              <span className="font-bold text-cyan-400 block truncate">2. US Pre-Market &amp; Economic Data</span>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                13:30 – 15:30 WAT · 12:30 – 14:30 UTC · US Tier-1 Volatility Releases
              </div>
            </div>
            <div className="shrink-0">
              <Badge variant="info" size="xs" className="whitespace-nowrap">High Alert</Badge>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-purple-500/30 flex justify-between items-center gap-2">
            <div className="min-w-0 pr-1">
              <span className="font-bold text-purple-400 block truncate">3. New York Open Peak Volatility</span>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                15:30 – 19:00 WAT · 14:30 – 18:00 UTC · Major Trend Expansions &amp; NY Sweeps
              </div>
            </div>
            <div className="shrink-0">
              <Badge variant="gradeB" size="xs" className="whitespace-nowrap">Grade A</Badge>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between items-center gap-2 opacity-75">
            <div className="min-w-0 pr-1">
              <span className="font-bold text-zinc-400 block truncate">4. Asian &amp; Night Lull (Dead Zones)</span>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Midnight – 08:00 AM WAT · Low Volatility Compression · Zero Risk Allocated
              </div>
            </div>
            <div className="shrink-0">
              <Badge variant="wait" size="xs" className="whitespace-nowrap">No Trades</Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
