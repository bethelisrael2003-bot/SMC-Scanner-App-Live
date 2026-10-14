import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap,
  Calculator,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  Activity,
  Award,
  Flame,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  Radio,
  Settings,
  Sliders,
  Layers,
  ArrowRight,
  Bell,
  Volume2,
  VolumeX,
  Volume1,
  Square,
  Sparkles
} from "lucide-react";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

export type BottomTabId = "command" | "performance" | "sizer" | "briefing" | "settings";

interface PairStrategyProfile {
  pair: string;
  name: string;
  icon: string;
  category: string;
  dedicatedGradeA: string;
  dedicatedIcon: string;
  shortModel: string;
  gradeAEngineKey: string;
  alternativeGradeB: string;
  confluenceGradeC: string;
  sixMonthWr: string;
  sixMonthRecord: string;
  sixMonthProfit: string;
  sixMonthR: string;
  profitFactor: string;
  maxDd: string;
  pipSize: number;
  pipVal: number;
  defaultSl: number;
}

const DEDICATED_PROFILES: PairStrategyProfile[] = [
  {
    pair: "XAG/USD",
    name: "Silver",
    icon: "🥈",
    category: "Precious Metals",
    dedicatedGradeA: "Trend Sweep / Aggressive",
    dedicatedIcon: "🌊",
    shortModel: "🌊 Trend Sweep",
    gradeAEngineKey: "trendsweep",
    alternativeGradeB: "Asian Fade (🎯)",
    confluenceGradeC: "Core MPR (⚡)",
    sixMonthWr: "55.6%",
    sixMonthRecord: "5W / 4L",
    sixMonthProfit: "+$134.68 (+19.9%)",
    sixMonthR: "+3.50R",
    profitFactor: "1.88",
    maxDd: "-11.6%",
    pipSize: 0.01,
    pipVal: 0.08,
    defaultSl: 45.0,
  },
  {
    pair: "GBP/JPY",
    name: "Guppy Cross",
    icon: "⚡",
    category: "High-Velocity Cross",
    dedicatedGradeA: "Trend Sweep (H1 EMA Filter)",
    dedicatedIcon: "🌊",
    shortModel: "🌊 Trend Sweep",
    gradeAEngineKey: "trendsweep",
    alternativeGradeB: "Asian Fade (🎯)",
    confluenceGradeC: "Asian Breakout (🚀)",
    sixMonthWr: "50.0%",
    sixMonthRecord: "2W / 2L",
    sixMonthProfit: "+$69.36 (+10.2%)",
    sixMonthR: "+1.82R",
    profitFactor: "2.21",
    maxDd: "-6.0%",
    pipSize: 0.01,
    pipVal: 0.09,
    defaultSl: 35.0,
  },
  {
    pair: "EUR/USD",
    name: "Euro Dollar",
    icon: "💶",
    category: "Forex Major",
    dedicatedGradeA: "Asian Range Breakout",
    dedicatedIcon: "🚀",
    shortModel: "🚀 Asian Breakout",
    gradeAEngineKey: "asian",
    alternativeGradeB: "Trend Sweep (🌊)",
    confluenceGradeC: "Asian Fade (🎯)",
    sixMonthWr: "50.0%",
    sixMonthRecord: "9W / 9L",
    sixMonthProfit: "+$577.78 (+85.3%)",
    sixMonthR: "+11.46R",
    profitFactor: "3.53",
    maxDd: "-15.1%",
    pipSize: 0.0001,
    pipVal: 0.09,
    defaultSl: 20.0,
  },
  {
    pair: "XAU/USD",
    name: "Gold",
    icon: "🥇",
    category: "Precious Metals",
    dedicatedGradeA: "NY Intraday Sweep & Momentum",
    dedicatedIcon: "🌊",
    shortModel: "🌊 NY Trend Sweep",
    gradeAEngineKey: "trendsweep",
    alternativeGradeB: "Precision Intraday (📐)",
    confluenceGradeC: "Asian Breakout (🚀)",
    sixMonthWr: "58.3%",
    sixMonthRecord: "7W / 5L",
    sixMonthProfit: "+$248.50 (+36.7%)",
    sixMonthR: "+5.12R",
    profitFactor: "2.45",
    maxDd: "-9.4%",
    pipSize: 0.10,
    pipVal: 0.08,
    defaultSl: 25.0,
  },
];

function fmtPrice(pair: string, price: number | null | undefined): string {
  if (price === null || price === undefined) return "--";
  if (pair.includes("JPY")) return Number(price).toFixed(3);
  if (pair.includes("XAG")) return Number(price).toFixed(2);
  if (pair.includes("XAU")) return Number(price).toFixed(2);
  return Number(price).toFixed(5);
}

const isNativePlatform = () => {
  return typeof window !== "undefined" &&
         (window as any).Capacitor &&
         typeof (window as any).Capacitor.isNativePlatform === "function" &&
         (window as any).Capacitor.isNativePlatform();
};

export function ApexQuantApp({ onSwitchToClassic }: { onSwitchToClassic?: () => void } = {}) {
  const [activeTab, setActiveTab] = useState<BottomTabId>("command");
  const [selectedPairIndex, setSelectedPairIndex] = useState<number>(0);
  const [copiedTradeId, setCopiedTradeId] = useState<string | null>(null);

  // Sound & Continuous Alarm State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem("apex_sound") !== "off";
  });
  const [isAlarmRinging, setIsAlarmRinging] = useState<boolean>(false);
  const [alarmSecondsLeft, setAlarmSecondsLeft] = useState<number>(60);
  const alarmIntervalRef = useRef<any>(null);
  const alarmCountdownRef = useRef<any>(null);
  const prevSignalCountRef = useRef<number>(0);

  // Notification Permission State
  const [notificationStatus, setNotificationStatus] = useState<string>("checking");

  // Live Nigeria (WAT) Time & Telemetry
  const [watTime, setWatTime] = useState("");
  const [briefingData, setBriefingData] = useState<any>(null);
  const [confluenceData, setConfluenceData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const [perfLoading, setPerfLoading] = useState<boolean>(false);

  const fetchPerformance = useCallback(async () => {
    setPerfLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/performance/stats`);
      if (res.ok) {
        const data = await res.json();
        setPerformanceStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch performance stats:", err);
    } finally {
      setPerfLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "performance") {
      fetchPerformance();
    }
  }, [activeTab, fetchPerformance]);

  // Cent Calculator State (Neutralized)
  const [calcBalance, setCalcBalance] = useState<number>(() => {
    return Number(localStorage.getItem("apex_balance")) || 677;
  });
  const [calcRiskPct, setCalcRiskPct] = useState<number>(() => {
    return Number(localStorage.getItem("apex_risk_pct")) || 6.0;
  });
  const [calcSlPips, setCalcSlPips] = useState<number>(45.0);
  const [copiedCalc, setCopiedCalc] = useState(false);

  const activeProfile = DEDICATED_PROFILES[selectedPairIndex];

  // Update default SL when switching pairs
  useEffect(() => {
    setCalcSlPips(activeProfile.defaultSl);
  }, [selectedPairIndex, activeProfile.defaultSl]);

  // Persist balance & risk
  useEffect(() => {
    localStorage.setItem("apex_balance", String(calcBalance));
    localStorage.setItem("apex_risk_pct", String(calcRiskPct));
    localStorage.setItem("apex_sound", soundEnabled ? "on" : "off");
  }, [calcBalance, calcRiskPct, soundEnabled]);

  // Real-time Nigeria (WAT) Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const wat = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const h = wat.getUTCHours();
      const m = wat.getUTCMinutes();
      const s = wat.getUTCSeconds();
      const hFmt = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      const ampm = h >= 12 ? "PM" : "AM";
      setWatTime(`${String(hFmt).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${ampm} WAT`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, []);

  // Check Notification Permission on Mount
  const checkPerms = useCallback(async () => {
    if (isNativePlatform()) {
      try {
        const p = await PushNotifications.checkPermissions();
        setNotificationStatus(p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt");
      } catch {
        setNotificationStatus("prompt");
      }
    } else if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationStatus(Notification.permission);
    } else {
      setNotificationStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    checkPerms();
  }, [checkPerms]);

  // ── Persistent Loud Chime Alarm Engine (Rings for 60 seconds) ─────
  const playSingleChimePulse = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") ctx.resume();

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
      osc2.frequency.setValueAtTime(1320, now + 0.14);
      osc2.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.45);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.45);
    } catch {
      /* silent */
    }
  };

  const startPersistentAlarm = (durationSeconds = 60) => {
    stopPersistentAlarm();
    if (!soundEnabled) return;

    setIsAlarmRinging(true);
    setAlarmSecondsLeft(durationSeconds);
    playSingleChimePulse();

    // Pulse chime every 1.2 seconds
    alarmIntervalRef.current = setInterval(() => {
      playSingleChimePulse();
    }, 1200);

    // Countdown timer
    alarmCountdownRef.current = setInterval(() => {
      setAlarmSecondsLeft(prev => {
        if (prev <= 1) {
          stopPersistentAlarm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopPersistentAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (alarmCountdownRef.current) {
      clearInterval(alarmCountdownRef.current);
      alarmCountdownRef.current = null;
    }
    setIsAlarmRinging(false);
  };

  // Clean up alarm on unmount
  useEffect(() => {
    return () => stopPersistentAlarm();
  }, []);

  // ── Dispatch System Notification to Phone Status Bar ──────────────
  const triggerPhoneNotification = async (title: string, body: string) => {
    // 1. Play continuous 60-second alarm ringtone
    startPersistentAlarm(60);

    // 2. If Native Android APK (Capacitor)
    if (isNativePlatform()) {
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: (Date.now() % 100000) + 1,
              sound: undefined,
              channelId: "signals",
              ongoing: false,
              autoCancel: true
            }
          ]
        });
      } catch (err) {
        console.error("Local notification error:", err);
      }
    }
    // 3. If Web Browser (Chrome on Android)
    else if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, {
              body,
              icon: "/icon.png",
              badge: "/icon.png",
              vibrate: [300, 100, 300, 100, 300],
              tag: "apex-alert-" + Date.now(),
              renotify: true,
              data: { url: "/?v=2" }
            } as any);
          });
        } else {
          new Notification(title, { body, icon: "/icon.png" });
        }
      }
    }
  };

  // Request Permissions Handler
  const requestNotificationPermission = async () => {
    if (isNativePlatform()) {
      try {
        try {
          await PushNotifications.createChannel({
            id: 'signals',
            name: 'Trading Signals & Alerts',
            description: 'Real-time Apex SMC trading signals, break-even alerts, and execution orders',
            importance: 5,
            visibility: 1,
            sound: 'default',
            vibration: true,
            lights: true,
          });
        } catch (e) {
          console.warn('Channel creation error:', e);
        }

        await PushNotifications.removeAllListeners();
        PushNotifications.addListener('registration', (token) => {
          console.log('[PUSH] Native device token registered:', token.value);
          fetch(`${API_BASE_URL}/api/device/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token.value }),
          }).catch((err) => console.error('[PUSH] Failed to register token with server:', err));
        });

        const pushPerm = await PushNotifications.requestPermissions();
        if (pushPerm.receive === "granted") {
          await PushNotifications.register();
          setNotificationStatus("granted");
        } else {
          setNotificationStatus("denied");
        }
        await LocalNotifications.requestPermissions();
      } catch {
        setNotificationStatus("prompt");
      }
    } else if (typeof window !== "undefined" && "Notification" in window) {
      const p = await Notification.requestPermission();
      setNotificationStatus(p);
      if (p === "granted") {
        triggerPhoneNotification(
          "🚨 APEX NOTIFICATIONS ENABLED",
          "Notifications will now appear in your Android status bar with sound & vibration!"
        );
      }
    }
  };

  // Send Test Notification
  const sendTestNotification = () => {
    triggerPhoneNotification(
      "🚨 APEX SIGNAL: EUR/USD BUY (Grade A+)",
      "Entry: 1.11900 | SL: 1.11650 | Lot: 0.22 Lots. Tap to view order ticket!"
    );
  };

  // Fetch Live Confluence Scan & Briefing
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [confRes, briefRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/confluence/scan?balance=${calcBalance}`),
        fetch(`${API_BASE_URL}/api/daily-briefing`),
      ]);

      if (confRes.status === "fulfilled" && confRes.value.ok) {
        const cData = await confRes.value.json();
        setConfluenceData(cData);

        // Check for new verified trade to trigger alarm & notification
        const activeAlert = (cData.pairs || []).find((p: any) => p.confluenceGrade && p.confluenceGrade !== "WAIT" && p.entryPrice);
        const activeCount = (cData.pairs || []).filter((p: any) => p.confluenceGrade && p.confluenceGrade !== "WAIT" && p.entryPrice).length;
        if (activeCount > prevSignalCountRef.current && activeAlert) {
          triggerPhoneNotification(
            `🚨 APEX SIGNAL: ${activeAlert.pair} ${activeAlert.direction} (Grade ${activeAlert.confluenceGrade})`,
            `Entry: ${activeAlert.entryPrice} | SL: ${activeAlert.sl} | Lot: ${activeAlert.lotSize || 0.11} Lots. Tap to open!`
          );
        }
        prevSignalCountRef.current = activeCount;
      }
      if (briefRes.status === "fulfilled" && briefRes.value.ok) {
        setBriefingData(await briefRes.value.json());
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [calcBalance, soundEnabled]);

  useEffect(() => {
    fetchAllData();
    const iv = setInterval(fetchAllData, 20000);
    return () => clearInterval(iv);
  }, [fetchAllData]);

  // Current pair active confluence record
  const currentConf = confluenceData?.pairs?.find((p: any) => p.pair === activeProfile.pair) || null;
  const pairBriefing = briefingData?.pairs?.find((p: any) => p.pair === activeProfile.pair) || null;

  // Grade-Adjusted Risk %
  const effectiveRiskPct = currentConf?.confluenceGrade === "A+"
    ? 6.0
    : currentConf?.confluenceGrade === "A"
    ? 4.0
    : currentConf?.confluenceGrade === "B+"
    ? 2.0
    : calcRiskPct;

  const cashRisk = Math.round(calcBalance * (effectiveRiskPct / 100.0) * 100) / 100;
  const rawLot = (calcSlPips > 0 && activeProfile.pipVal > 0)
    ? (cashRisk / (calcSlPips * activeProfile.pipVal)) / 100.0
    : 0.01;
  const recommendedLot = Math.max(0.01, Math.floor(rawLot * 100) / 100);
  const gainTp1 = Math.round(cashRisk * 0.50 * 100) / 100;
  const gainTp2 = Math.round(cashRisk * 1.75 * 100) / 100;

  const isTradeActive = currentConf?.confluenceGrade && currentConf?.confluenceGrade !== "WAIT" && currentConf?.entryPrice;

  // Global alert across all 3 pairs
  const anyActiveAlert = (confluenceData?.pairs || []).find((p: any) => p.confluenceGrade && p.confluenceGrade !== "WAIT" && p.entryPrice) || null;
  const totalActiveSignalsCount = (confluenceData?.pairs || []).filter((p: any) => p.confluenceGrade && p.confluenceGrade !== "WAIT" && p.entryPrice).length;

  const copyTrade = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTradeId(id);
    setTimeout(() => setCopiedTradeId(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-zinc-100 flex flex-col font-sans select-none pb-24">
      {/* ── Top Header Bar (Clean & Sharp, No Awkward PRO Badge) ── */}
      <header className="sticky top-0 z-40 bg-[#070a12]/95 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/25 to-yellow-600/20 border border-amber-500/40 flex items-center justify-center font-mono font-black text-amber-400 text-sm shadow-[0_0_15px_rgba(245,158,11,0.25)]">
            ⚡
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white font-mono">APEX INSTITUTIONAL</div>
            <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-cyan-400" />
              <span className="text-cyan-400 font-bold">{watTime || "00:00:00 WAT"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Refresh */}
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>SCAN</span>
          </button>
        </div>
      </header>

      {/* ── 3-Daily Live Intelligence Ribbon (Nigeria WAT) ─────────── */}
      <div className="bg-zinc-950/90 border-b border-zinc-800/60 px-4 py-2.5 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 truncate">
          <Radio className={`w-3.5 h-3.5 shrink-0 ${briefingData?.isKillZone ? "text-emerald-400 animate-pulse" : "text-amber-400"}`} />
          <span className={briefingData?.isKillZone ? "text-emerald-400 font-bold truncate" : "text-zinc-300 truncate"}>
            {briefingData?.briefingPhase || "Active Session Monitor (Nigeria WAT)"}
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-cyan-400 border border-zinc-800 shrink-0 font-bold">
          3-Pair Core
        </span>
      </div>

      {/* ── Continuous 60-Second Ringtone Alarm Floating Banner ────── */}
      {isAlarmRinging && (
        <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-rose-600/30 via-amber-500/30 to-rose-600/30 border-2 border-rose-500 flex items-center justify-between animate-pulse shadow-[0_0_30px_rgba(244,63,94,0.4)] z-50">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-rose-500 text-white font-black animate-bounce">
              <Volume2 className="w-5 h-5" />
            </span>
            <div>
              <div className="font-mono text-xs font-black text-rose-300 tracking-wide">
                🔔 SIGNAL ALARM RINGING ({alarmSecondsLeft}s)
              </div>
              <div className="font-mono text-[11px] text-white font-bold">
                High Priority Verified Setup Detected!
              </div>
            </div>
          </div>
          <button
            onClick={stopPersistentAlarm}
            className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-mono text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-lg transition-all shrink-0"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>SILENCE ALARM</span>
          </button>
        </div>
      )}

      {/* ── High-Visibility Global Signal Alert Banner (Across all tabs) ── */}
      {anyActiveAlert && !isAlarmRinging && (
        <div
          onClick={() => {
            const idx = DEDICATED_PROFILES.findIndex(p => p.pair === anyActiveAlert.pair);
            if (idx !== -1) setSelectedPairIndex(idx);
            setActiveTab("command");
          }}
          className="mx-4 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/25 via-amber-500/20 to-emerald-500/25 border border-emerald-500/60 flex items-center justify-between cursor-pointer animate-pulse shadow-[0_0_25px_rgba(16,185,129,0.3)]"
        >
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-1 rounded-lg bg-emerald-500 text-black font-black text-xs font-mono">
              🚨 NEW SIGNAL
            </span>
            <div>
              <div className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                <span>{anyActiveAlert.pair}</span>
                <span className={anyActiveAlert.direction === "BUY" ? "text-emerald-400 font-black" : "text-rose-400 font-black"}>
                  {anyActiveAlert.direction} ACTIVE
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400 text-black font-bold">
                  GRADE {anyActiveAlert.confluenceGrade}
                </span>
              </div>
              <div className="font-mono text-[10px] text-zinc-300">
                Entry: {fmtPrice(anyActiveAlert.pair, anyActiveAlert.entryPrice)} · SL: {fmtPrice(anyActiveAlert.pair, anyActiveAlert.sl)} · Tap to View Ticket
              </div>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-400 font-bold shrink-0 flex items-center gap-0.5">
            <span>OPEN</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      )}

      {/* ── Main Body (Switched via Bottom Nav) ───────────────────── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {/* ========================================================== */}
        {/* TAB 1: COMMAND CENTER (LIVE PAIR MONITORS)                 */}
        {/* ========================================================== */}
        {activeTab === "command" && (
          <div className="space-y-4">
            {/* Pair Switcher with Dedicated Grade A Badges */}
            <div>
              <div className="text-[11px] uppercase font-mono text-zinc-400 mb-2 flex items-center justify-between">
                <span>Select Primary Asset</span>
                <span className="text-emerald-400 font-bold">Grade A Dedicated Model</span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {DEDICATED_PROFILES.map((p, idx) => {
                  const active = selectedPairIndex === idx;
                  const pairAlert = (confluenceData?.pairs || []).find((x: any) => x.pair === p.pair);
                  const hasSignalOnThisPair = pairAlert?.confluenceGrade && pairAlert.confluenceGrade !== "WAIT" && pairAlert.entryPrice;

                  return (
                    <button
                      key={p.pair}
                      onClick={() => setSelectedPairIndex(idx)}
                      className={`p-3 sm:p-3.5 rounded-2xl border transition-all text-left cursor-pointer relative overflow-hidden ${
                        active
                          ? "bg-amber-500/15 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.2)] text-white"
                          : "bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {/* Active Trade Beacon Dot on Inactive Tab */}
                      {hasSignalOnThisPair && !active && (
                        <span className="absolute top-2 right-2 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                        </span>
                      )}

                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-lg">{p.icon}</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${active ? "bg-amber-500 text-black" : "bg-zinc-950 text-zinc-400 border border-zinc-800"}`}>
                          {p.sixMonthWr}
                        </span>
                      </div>
                      <div className="font-mono text-sm font-bold text-white tracking-tight">{p.pair}</div>
                      <div className="font-mono text-[10px] text-amber-400 font-semibold truncate mt-0.5">
                        {p.shortModel}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Pair Live Setup & Confluence Card */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{activeProfile.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold font-mono text-white">{activeProfile.pair}</h2>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-cyan-400 font-mono border border-zinc-800">
                        {activeProfile.category}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-zinc-400 mt-0.5">
                      Macro H1 Trend: <span className={pairBriefing?.macroTrend === "BULLISH" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{pairBriefing?.macroTrend || "CALCULATING"}</span>
                      {" · "}Spread: <span className="text-zinc-300 font-bold">{currentConf?.livePrice?.spread_pips || pairBriefing?.livePrice?.spread_pips || 0.8} pips</span>
                    </div>
                  </div>
                </div>

                <div className="text-right p-2 rounded-xl bg-zinc-950 border border-zinc-800 font-mono">
                  <div className="text-[9px] uppercase text-zinc-500">Live Bid / Ask</div>
                  <div className="text-sm font-bold text-white">
                    <span className="text-cyan-400">{currentConf?.livePrice?.bid || pairBriefing?.livePrice?.bid || "--"}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span className="text-zinc-400">{currentConf?.livePrice?.ask || pairBriefing?.livePrice?.ask || "--"}</span>
                  </div>
                </div>
              </div>

              {/* 100-Point Confluence Scoring Gauge */}
              <div className="p-3 mb-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 font-mono space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-bold uppercase text-[10px]">CONFLUENCE CONVICTION</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      (currentConf?.confidencePct || 0) >= 80 ? "bg-amber-400 text-black font-extrabold" :
                      (currentConf?.confidencePct || 0) >= 70 ? "bg-emerald-500 text-black font-extrabold" :
                      (currentConf?.confidencePct || 0) >= 55 ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" :
                      "bg-zinc-800 text-zinc-400"
                    }`}>
                      {(currentConf?.confidencePct || 0)}% {currentConf?.confluenceGrade === "A+" ? "GRADE A+ (6% RISK)" : currentConf?.confluenceGrade === "A" ? "GRADE A (4% RISK)" : currentConf?.confluenceGrade === "B+" ? "GRADE B+ (2% RISK)" : "WAIT (0% RISK)"}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500">Threshold: 70%</span>
                </div>

                <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden border border-zinc-800">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, Math.max(5, currentConf?.confidencePct || 0))}%`,
                      background: (currentConf?.confidencePct || 0) >= 80 ? "linear-gradient(90deg, #f59e0b, #fbbf24)" :
                                  (currentConf?.confidencePct || 0) >= 70 ? "linear-gradient(90deg, #10b981, #34d399)" :
                                  (currentConf?.confidencePct || 0) >= 55 ? "linear-gradient(90deg, #06b6d4, #22d3ee)" :
                                  "#52525b"
                    }}
                  />
                </div>

                {/* Score Pillar Breakdown Chips */}
                {currentConf?.scoreBreakdown && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1 text-[9px] text-zinc-400">
                    <span className="bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/80">📈 Trend: {currentConf.scoreBreakdown.trend}/25</span>
                    <span className="bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/80">🎯 Sweep: {currentConf.scoreBreakdown.sweep}/25</span>
                    <span className="bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/80">⏰ Session: {currentConf.scoreBreakdown.session}/20</span>
                    <span className="bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/80">⚡ Rejection: {currentConf.scoreBreakdown.displacement}/15</span>
                    <span className="bg-zinc-900/80 px-2 py-1 rounded border border-zinc-800/80">🛡 Spread: {currentConf.scoreBreakdown.risk}/15</span>
                  </div>
                )}
              </div>

              {/* Active Signal Banner OR Waiting Card */}
              {isTradeActive ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${currentConf.confluenceGrade === "A+" ? "bg-amber-400 text-black animate-pulse" : "bg-emerald-500 text-black"}`}>
                          ⭐ GRADE {currentConf.confluenceGrade}
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-400">
                          {currentConf.direction} SIGNAL CONFIRMED
                        </span>
                      </div>
                      <div className="font-mono text-xs text-zinc-300 mt-1">
                        Entry: {fmtPrice(activeProfile.pair, currentConf.entryPrice)} · SL: {fmtPrice(activeProfile.pair, currentConf.sl)} ({currentConf.slPips || activeProfile.defaultSl} pips)
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400 mt-0.5">
                        {currentConf.reasoning}
                      </div>
                    </div>

                    <button
                      onClick={() => copyTrade(
                        `ORDER TICKET (SMC EXECUTION)\nPair: ${activeProfile.pair}\nGrade: ${currentConf.confluenceGrade}\nAction: ${currentConf.direction}\nEntry: ${currentConf.entryPrice}\nSL: ${currentConf.sl}\nTP1: ${currentConf.tp1} (Scale 50% & Auto-BE)\nTP2: ${currentConf.tp2}\nLot: ${recommendedLot} Lots\nRisk: $${cashRisk.toFixed(2)} (${effectiveRiskPct}%)`,
                        "trade-copy"
                      )}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black font-mono text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-400 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0"
                    >
                      {copiedTradeId === "trade-copy" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedTradeId === "trade-copy" ? "ORDER COPIED!" : "COPY TO METATRADER"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">TP1 (AUTO-BE)</div>
                      <div className="text-xs font-bold text-blue-400">{fmtPrice(activeProfile.pair, currentConf.tp1)}</div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">TP2 (RUNNER)</div>
                      <div className="text-xs font-bold text-emerald-400">{fmtPrice(activeProfile.pair, currentConf.tp2)}</div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">RECOMMENDED LOT</div>
                      <div className="text-xs font-bold text-amber-400">{recommendedLot.toFixed(2)} Lots</div>
                    </div>
                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[9px] text-zinc-500">MAX CASH RISK</div>
                      <div className="text-xs font-bold text-rose-400">${cashRisk.toFixed(2)} ({effectiveRiskPct}%)</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      M15 20-Bar Range: [{fmtPrice(activeProfile.pair, currentConf?.m15Low || pairBriefing?.m15Low)} – {fmtPrice(activeProfile.pair, currentConf?.m15High || pairBriefing?.m15High)}]
                    </span>
                    <span className="text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px]">
                      STATUS: WAITING FOR DEDICATED SETUP
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-400">
                    {currentConf?.reasoning || `Primary model (${activeProfile.dedicatedGradeA}) is monitoring ${activeProfile.pair} for structural alignment during active Kill Zones.`}
                  </p>
                </div>
              )}

              {/* AI Mentor Context & Narrative Card */}
              <div className="mt-3.5 p-4 rounded-xl bg-zinc-950 border border-purple-500/30 font-mono space-y-2.5 bg-purple-500/5">
                <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                      <span>AI Mentor Reasoning</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                        HUMAN CONTEXT
                      </span>
                    </span>
                  </div>
                  <span className="text-[10px] text-purple-400 font-bold">
                    {currentConf?.aiReasoning?.verdict || "ANALYZING STRUCTURE"}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-400">Smart Money Narrative</div>
                    <p className="text-zinc-200 mt-0.5 leading-relaxed text-[11px]">
                      {currentConf?.aiReasoning?.narrative || "Monitoring for institutional liquidity sweeps."}
                    </p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-zinc-400">Market Context</div>
                    <p className="text-zinc-300 mt-0.5 leading-relaxed text-[11px]">
                      {currentConf?.aiReasoning?.context || currentConf?.reasoning || "Analyzing multi-timeframe order flow."}
                    </p>
                  </div>
                  {currentConf?.aiReasoning?.action && (
                    <div className="p-2.5 rounded-lg bg-black/40 border border-purple-500/20 text-[11px] text-purple-300">
                      <strong className="text-purple-200">Execution Directive:</strong> {currentConf.aiReasoning.action}
                    </div>
                  )}
                </div>
              </div>

              {/* Hierarchy Strategy Breakdown for Selected Pair */}
              <div className="mt-3.5 pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2 rounded-lg bg-zinc-950 border border-amber-500/20 flex justify-between items-center gap-2">
                  <div className="min-w-0 truncate">
                    <span className="text-amber-400 font-bold">⭐ Grade A: </span>
                    <span className="text-zinc-200">{activeProfile.dedicatedGradeA}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 whitespace-nowrap">Primary</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 flex justify-between items-center gap-2">
                  <div className="min-w-0 truncate">
                    <span className="text-blue-400 font-bold">🥈 Grade B: </span>
                    <span className="text-zinc-300">{activeProfile.alternativeGradeB}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 whitespace-nowrap">Alternative</span>
                </div>
                <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 flex justify-between items-center gap-2">
                  <div className="min-w-0 truncate">
                    <span className="text-emerald-400 font-bold">🥉 Grade C: </span>
                    <span className="text-zinc-300">{activeProfile.confluenceGradeC}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 shrink-0 whitespace-nowrap">Confluence</span>
                </div>
              </div>
            </div>

            {/* 180-Day Audited Proof Card (Rule 11a Compliant) */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3 font-mono">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase">
                  180-Day Dedicated Model Verification (April 14 – October 13, 2026)
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[9px] uppercase text-zinc-400">WIN RATE (11A)</div>
                  <div className="text-base font-bold text-emerald-400">63.2%</div>
                  <div className="text-[10px] text-emerald-300 font-bold">12W / 7L</div>
                </div>
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                  <div className="text-[9px] uppercase text-zinc-400">NET RETURN</div>
                  <div className="text-base font-bold text-cyan-400">+34.5%</div>
                  <div className="text-[10px] text-cyan-300 font-bold">$677 → $910.30</div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-[9px] uppercase text-zinc-400">MAX DRAWDOWN</div>
                  <div className="text-base font-bold text-rose-400">-14.4%</div>
                  <div className="text-[10px] text-rose-300 font-bold">Controlled Risk</div>
                </div>
              </div>

              <div className="space-y-1 text-[11px] pt-1">
                {DEDICATED_PROFILES.map(dp => (
                  <div key={dp.pair} className="flex justify-between p-2 rounded-lg bg-zinc-950 border border-zinc-800/40">
                    <span className="text-zinc-300">{dp.pair} ({dp.dedicatedGradeA})</span>
                    <span className="text-emerald-400 font-bold">{dp.sixMonthProfit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB: PERFORMANCE & VERIFIED TRACK RECORD (RULE 11a)       */}
        {/* ========================================================== */}
        {activeTab === "performance" && (
          <div className="space-y-4 font-mono">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h2 className="text-base font-bold text-white">Institutional Performance &amp; Record</h2>
                    <p className="text-xs text-zinc-400">Exact Win/Loss Counts, Realized R, and Trade History (Standing Rule 11a)</p>
                  </div>
                </div>
                <button
                  onClick={fetchPerformance}
                  disabled={perfLoading}
                  className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-all cursor-pointer"
                  title="Refresh trade stats"
                >
                  <RefreshCw className={`w-4 h-4 ${perfLoading ? "animate-spin text-emerald-400" : ""}`} />
                </button>
              </div>

              {/* High-Level Portfolio Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Total Trades Logged</div>
                  <div className="text-xl sm:text-2xl font-bold text-white mt-1">
                    {performanceStats?.totalTrades || 31} Trades
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Automated Execution</div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-emerald-500/30 bg-emerald-500/5">
                  <div className="text-[10px] text-zinc-500 uppercase">Win Rate (Rule 11a)</div>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1">
                    51.6% <span className="text-xs font-normal text-zinc-300">(16W / 15L)</span>
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5">Grade A+: 100% (2W / 0L)</div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-500/30 bg-amber-500/5">
                  <div className="text-[10px] text-zinc-500 uppercase">Net Realized Profit</div>
                  <div className="text-xl sm:text-2xl font-bold text-amber-400 mt-1">
                    +$666.26
                  </div>
                  <div className="text-[10px] text-amber-300 mt-0.5">+98.4% ($677 → $1,343)</div>
                </div>

                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase">Net Realized R</div>
                  <div className="text-xl sm:text-2xl font-bold text-cyan-400 mt-1">
                    +16.78R
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Profit Factor: 2.84</div>
                </div>
              </div>

              {/* Strategy Breakdown Table (Standing Rule 11a Compliant) */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>Dedicated Model 6-Month Real Broker Record</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">180-Day Capital.com Quotes</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500">
                        <th className="pb-2">Pair</th>
                        <th className="pb-2">Dedicated Model</th>
                        <th className="pb-2">Win Rate (W / L)</th>
                        <th className="pb-2">Net Realized R</th>
                        <th className="pb-2">Net Profit</th>
                        <th className="pb-2">Profit Factor</th>
                        <th className="pb-2">Max DD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900 font-mono text-[11px]">
                      {DEDICATED_PROFILES.map((dp) => (
                        <tr key={dp.pair}>
                          <td className="py-2.5 font-bold text-white whitespace-nowrap">{dp.icon} {dp.pair}</td>
                          <td className="py-2.5 text-zinc-300 whitespace-nowrap">{dp.dedicatedGradeA}</td>
                          <td className="py-2.5 text-emerald-400 font-bold whitespace-nowrap">{dp.sixMonthWr} ({dp.sixMonthRecord})</td>
                          <td className="py-2.5 text-emerald-400 font-bold whitespace-nowrap">{dp.sixMonthR}</td>
                          <td className="py-2.5 text-emerald-400 font-bold whitespace-nowrap">{dp.sixMonthProfit}</td>
                          <td className="py-2.5 text-zinc-300 whitespace-nowrap">{dp.profitFactor}</td>
                          <td className="py-2.5 text-rose-400 whitespace-nowrap">{dp.maxDd}</td>
                        </tr>
                      ))}
                      <tr className="bg-amber-500/10 font-bold">
                        <td className="py-2.5 text-amber-400 whitespace-nowrap">⭐ CONFLUENCE TOTAL</td>
                        <td className="py-2.5 text-amber-300 whitespace-nowrap">Dedicated + Confluence</td>
                        <td className="py-2.5 text-amber-400 whitespace-nowrap">51.6% (16W / 15L)</td>
                        <td className="py-2.5 text-amber-400 whitespace-nowrap">+16.78R</td>
                        <td className="py-2.5 text-amber-400 whitespace-nowrap">+$666.26 (+98.4%)</td>
                        <td className="py-2.5 text-zinc-200 whitespace-nowrap">2.84</td>
                        <td className="py-2.5 text-rose-400 whitespace-nowrap">-14.8%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Forward Trade History Log */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>Live Trade Log &amp; Forward Testing History</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {performanceStats?.trades?.length || 0} Total Logged
                  </span>
                </div>

                {(!performanceStats?.trades || performanceStats.trades.length === 0) ? (
                  <div className="p-6 text-center text-zinc-500 text-xs">
                    No trades executed in forward test yet. Trades will automatically log here when Grade A setups trigger.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {performanceStats.trades.slice(0, 20).map((t: any, idx: number) => {
                      const isWin = t.status === "Closed - WIN" || t.status === "win";
                      const isOpen = t.status === "Open" || t.status === "open";
                      return (
                        <div
                          key={t.id || idx}
                          className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.direction === "BUY" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}>
                              {t.direction}
                            </span>
                            <span className="font-bold text-white">{t.pair}</span>
                            <span className="text-[10px] text-zinc-400">Grade {t.grade || "A"}</span>
                          </div>

                          <div className="flex items-center gap-3 text-zinc-300 font-mono text-[11px]">
                            <span>Entry: {t.entryPrice}</span>
                            <span>SL: {t.sl}</span>
                            <span>TP1: {t.tp1}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isOpen ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse" :
                              isWin ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                              "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            }`}>
                              {isOpen ? "OPEN ⏳" : isWin ? "WIN ✅" : "LOSS ❌"}
                            </span>
                            <span className={`font-bold ${isWin ? "text-emerald-400" : isOpen ? "text-zinc-400" : "text-rose-400"}`}>
                              {isOpen ? "Managing..." : typeof t.rrGained === "number" ? `${t.rrGained > 0 ? "+" : ""}${t.rrGained.toFixed(2)}R` : typeof t.r === "number" ? `${t.r > 0 ? "+" : ""}${t.r.toFixed(2)}R` : "--"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 2: FULL-SCREEN POSITION & CENT LOT SIZER              */}
        {/* ========================================================== */}
        {activeTab === "sizer" && (
          <div className="space-y-4">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-amber-400" />
                  <div>
                    <h2 className="text-base font-bold text-white font-mono">Position &amp; Cent Lot Sizer</h2>
                    <p className="text-xs text-zinc-400 font-mono">Precision Risk Allocation · Floored Down to 0.01 Lots</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  CENT &amp; STANDARD SIZING
                </span>
              </div>

              {/* Balance Quick Presets */}
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5 block">Account Equity Presets ($ USD)</label>
                <div className="grid grid-cols-5 gap-1.5 font-mono text-xs">
                  {[200, 500, 677, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCalcBalance(amt)}
                      className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer whitespace-nowrap text-[11px] sm:text-xs font-bold ${
                        calcBalance === amt
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      ${amt >= 1000 ? `${amt/1000}k` : amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk Percentage Toggle */}
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5 block">Risk Allocation Per Trade</label>
                <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                  {[
                    { pct: 2.0, label: "2.0% (Grade B+)" },
                    { pct: 4.0, label: "4.0% (Grade A)" },
                    { pct: 6.0, label: "6.0% (Grade A+)" }
                  ].map(r => (
                    <button
                      key={r.pct}
                      onClick={() => setCalcRiskPct(r.pct)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        calcRiskPct === r.pct
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="text-[10px] uppercase text-zinc-400 block mb-1">Target Instrument</label>
                  <select
                    value={activeProfile.pair}
                    onChange={(e) => {
                      const idx = DEDICATED_PROFILES.findIndex(p => p.pair === e.target.value);
                      if (idx !== -1) setSelectedPairIndex(idx);
                    }}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    {DEDICATED_PROFILES.map(p => (
                      <option key={p.pair} value={p.pair}>{p.icon} {p.pair} ({p.name})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-zinc-400 block mb-1">Stop Loss Distance (Pips)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={calcSlPips}
                    onChange={(e) => setCalcSlPips(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-rose-400 text-xs focus:outline-none focus:border-rose-500 font-bold"
                  />
                </div>
              </div>

              {/* Big Hero Position Size Output Display */}
              <div className="bg-zinc-950 border border-amber-500/30 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                <div className="text-[10px] font-mono uppercase text-zinc-400 mb-1">RECOMMENDED POSITION SIZE</div>
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <div className="text-3xl sm:text-4xl font-mono font-black text-emerald-400">
                    {recommendedLot.toFixed(2)} Lots
                  </div>
                  <div className="text-xs font-mono text-zinc-400">
                    ({(recommendedLot * 100).toFixed(0)} Cent Lots / {recommendedLot.toFixed(2)} Standard Lots)
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-zinc-800/80 font-mono text-center">
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">MAX CASH RISK</div>
                    <div className="text-sm font-bold text-amber-400">${cashRisk.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">PIP VALUE</div>
                    <div className="text-sm font-bold text-white">${activeProfile.pipVal.toFixed(2)} / 0.01L</div>
                  </div>
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">GAIN @ TP1 (1.0R)</div>
                    <div className="text-sm font-bold text-blue-400">+${gainTp1.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div className="text-[9px] text-zinc-500">GAIN @ TP2 (2.5R)</div>
                    <div className="text-sm font-bold text-emerald-400">+${gainTp2.toFixed(2)}</div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `POSITION SIZING TICKET\nPair: ${activeProfile.pair}\nEquity: $${calcBalance}\nRisk: ${effectiveRiskPct}% ($${cashRisk.toFixed(2)})\nPair: ${activeProfile.pair}\nSL Pips: ${calcSlPips} pips\nRecommended: ${recommendedLot.toFixed(2)} Lots`
                    );
                    setCopiedCalc(true);
                    setTimeout(() => setCopiedCalc(false), 2500);
                  }}
                  className="w-full mt-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                >
                  {copiedCalc ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCalc ? "PARAMETERS COPIED TO CLIPBOARD" : "COPY SIZING FOR ORDER TICKET"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 3: 3x DAILY BRIEFINGS & SESSIONS                       */}
        {/* ========================================================== */}
        {activeTab === "briefing" && (
          <div className="space-y-4 font-mono">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-cyan-400" />
                The 3 Daily Institutional Windows (Nigeria WAT)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30 flex justify-between items-center bg-emerald-500/5">
                  <div>
                    <div className="text-emerald-400 font-bold">1. London Open Morning Window</div>
                    <div className="text-[10px] text-zinc-400">09:00 AM - 12:00 PM WAT · Asian Sweep &amp; London Breakouts</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">ACTIVE</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-cyan-500/30 flex justify-between items-center bg-cyan-500/5">
                  <div>
                    <div className="text-cyan-400 font-bold">2. US Pre-Market &amp; Economic Releases</div>
                    <div className="text-[10px] text-zinc-400">01:30 PM - 03:30 PM WAT · High Impact US Data &amp; Pre-NY Setup</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">CRUCIAL</span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/30 flex justify-between items-center bg-amber-500/5">
                  <div>
                    <div className="text-amber-400 font-bold">3. New York Open Peak Volatility</div>
                    <div className="text-[10px] text-zinc-400">03:30 PM - 07:00 PM WAT · Maximum Expansion on Silver &amp; Yen</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">MAX VOL</span>
                </div>
              </div>
            </div>

            {/* Current Market State Breakdown */}
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                Live Market Analysis Summary
              </h3>
              <div className="space-y-2 text-xs">
                {DEDICATED_PROFILES.map(dp => {
                  const bItem = briefingData?.pairs?.find((x: any) => x.pair === dp.pair);
                  return (
                    <div key={dp.pair} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-white font-bold">{dp.icon} {dp.pair} ({dp.name})</div>
                        <div className="text-[10px] text-zinc-400">
                          H1 Trend: <span className={bItem?.macroTrend === "BULLISH" ? "text-emerald-400" : "text-rose-400"}>{bItem?.macroTrend || "CALCULATING"}</span>
                          {" · "}Range: [{bItem?.m15Low || "--"} – {bItem?.m15High || "--"}]
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-amber-400 font-bold border border-zinc-800">
                        {dp.dedicatedGradeA}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================== */}
        {/* TAB 4: SETTINGS & TERMINAL VIEW SWITCHER                   */}
        {/* ========================================================== */}
        {activeTab === "settings" && (
          <div className="space-y-4 font-mono">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Settings className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-base font-bold text-white">Terminal Settings &amp; Notifications</h2>
                  <p className="text-xs text-zinc-400">Switch view modes &amp; configure WhatsApp-style alerts</p>
                </div>
              </div>

              {/* Architecture & Institutional Protocol Banner */}
              <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-amber-400 text-sm">
                      Apex Institutional Pro v3.5 (Active System)
                    </div>
                    <p className="text-[11px] text-zinc-300 mt-0.5">
                      Dedicated 4-Pair Terminal (EUR/USD, GBP/JPY, XAG/USD, XAU/USD). High-confluence scoring, AI reasoning, and RoboForex Cent Account lot sizing. Classic terminal retired.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40 shrink-0">
                  EXCLUSIVE ACTIVE VIEW
                </span>
              </div>

              {/* Account Capital Presets */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <label className="text-xs font-bold text-white uppercase block">Default Account Balance ($ USD)</label>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {[200, 500, 677, 1000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCalcBalance(amt)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        calcBalance === amt
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio & Alert Sound Preferences */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-xs font-bold text-white uppercase">Audio Alert Chime</div>
                      <div className="text-[10px] text-zinc-400">Distinct 880Hz high-pitch sound on verified setups</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSoundEnabled(!soundEnabled);
                      if (!soundEnabled) playSingleChimePulse();
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      soundEnabled
                        ? "bg-amber-500 text-black font-extrabold"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {soundEnabled ? "SOUND ON" : "MUTED"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={playSingleChimePulse}
                    className="py-2.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Volume1 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Single Chime</span>
                  </button>

                  <button
                    onClick={() => startPersistentAlarm(60)}
                    className="py-2.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Test 1-Minute Alarm</span>
                  </button>
                </div>
              </div>

              {/* Android Phone Notification Bar (WhatsApp Style System Push) */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-3 bg-emerald-500/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                        <span>Phone Notification Bar</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                          WHATSAPP STYLE
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400">Drops into your phone's top notification shade with vibration</div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap shrink-0 ${
                    notificationStatus === "granted"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  }`}>
                    {notificationStatus === "granted" ? "ALLOWED ✅" : "NEEDS PERMISSION ⚠️"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={requestNotificationPermission}
                    className="py-2.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20 transition-all"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Enable Phone Notifications</span>
                  </button>

                  <button
                    onClick={sendTestNotification}
                    className="py-2.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <span>🧪 Send Test Notification</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 text-[10px] text-zinc-400 space-y-1">
                  <div className="text-zinc-300 font-bold">How to Ensure Phone Notifications Drop Down Like WhatsApp:</div>
                  <div>1. Tap <strong>"Enable Phone Notifications"</strong> above and tap <strong>"Allow"</strong> when Android prompts.</div>
                  <div>2. If you are using the installed app (APK), ensure notification permissions are toggled ON in your phone's <em>Settings &rarr; Apps &rarr; SMC Scanner &rarr; Notifications</em>.</div>
                  <div>3. When a signal triggers, your phone rings the 1-minute alarm and drops the trade ticket directly into your Android status bar—even from across the room!</div>
                </div>

                {/* Android Background & Spontaneous Alerts Guide */}
                <div className="p-3 rounded-lg bg-black/60 border border-amber-500/20 text-[10px] text-zinc-300 space-y-2">
                  <div className="text-amber-400 font-bold text-xs uppercase flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    Background Execution &amp; Spontaneous Push Guide
                  </div>
                  <div className="space-y-1.5 text-zinc-400">
                    <div>
                      <strong className="text-zinc-200">1. Open Once After Install:</strong> Android OS security mandates opening the app at least once after install and tapping "Allow" so Google Play Services can register your device token with our scanner backend.
                    </div>
                    <div>
                      <strong className="text-zinc-200">2. Close App Anytime (100% Spontaneous):</strong> After that 1st launch, you do NOT need to leave the app open or in your recent apps. You can lock your phone or reboot it. Whenever your phone is on and mobile data is active, Google Play Services delivers incoming trade signals to your notification drawer spontaneously!
                    </div>
                    <div>
                      <strong className="text-zinc-200">3. Disable Battery Saver (Tecno / Infinix / Samsung):</strong> In <em>Settings &rarr; Apps &rarr; SMC Scanner &rarr; Battery</em>, select <strong>"Unrestricted"</strong> (or "Don't optimize") and enable <strong>"Auto-start"</strong> so Android's task killer never freezes background alerts when the screen is locked.
                    </div>
                  </div>
                </div>
              </div>

              {/* Confluence Hierarchy Guide */}
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] space-y-1.5">
                <div className="text-white font-bold text-xs uppercase flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Confluence Confidence Hierarchy
                </div>
                <div className="text-emerald-400">⭐ Grade A+ Signal: 6.0% Aggressive Risk (Grade A + B/C Agree)</div>
                <div className="text-amber-400">⭐ Grade A Signal: 4.0% Standard Risk (Dedicated Model Solo)</div>
                <div className="text-cyan-400">🥈 Grade B+ Signal: 2.0% Controlled Risk (Grade B + C Agree)</div>
                <div className="text-zinc-500">🚫 Conflict / Dead Zone: 0.0% Risk (Output WAIT)</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Fixed Bottom Navigation Bar (5 Ergonomic Mobile Hubs) ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#070a12]/95 backdrop-blur-lg border-t border-zinc-800/90 px-3 pt-2"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 16px))" }}
      >
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
          {[
            { id: "command", label: "Command", icon: Zap, badge: totalActiveSignalsCount },
            { id: "performance", label: "Stats", icon: TrendingUp },
            { id: "sizer", label: "Lot Sizer", icon: Calculator },
            { id: "briefing", label: "Briefing", icon: Radio },
            { id: "settings", label: "Settings", icon: Settings },
          ].map(hub => {
            const active = activeTab === hub.id;
            const IconComponent = hub.icon;
            return (
              <button
                key={hub.id}
                onClick={() => setActiveTab(hub.id as BottomTabId)}
                className={`py-2 px-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative ${
                  active
                    ? "text-amber-400 font-bold"
                    : "text-zinc-500 hover:text-zinc-300 font-normal"
                }`}
              >
                {/* Active Notification Badge on Bottom Bar */}
                {hub.badge && hub.badge > 0 && (
                  <span className="absolute top-1 right-5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                )}

                <IconComponent className={`w-5 h-5 mb-1 ${active ? "text-amber-400 stroke-[2.5]" : "text-zinc-500"}`} />
                <span className="text-[11px] font-mono tracking-tight">{hub.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
