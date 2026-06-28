import React, { useState, useEffect } from "react";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  RotateCw,
  BookOpen,
  Sparkles,
  Search,
  ExternalLink,
  DollarSign,
  Copy,
  ChevronRight,
  User,
  Shield,
  HelpCircle,
  Smartphone,
  Download,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AnalysisResult, SessionInfo, EconomicEvent, TradePlan } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [scanData, setScanData] = useState<{
    results: AnalysisResult[];
    conflicts: any[];
    session: SessionInfo;
  } | null>(null);
  const [newsData, setNewsData] = useState<EconomicEvent[]>([]);
  const [newsFilter, setNewsFilter] = useState<"high_medium" | "high" | "all">("high_medium");
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [loading, setLoading] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [newsLoading, setNewsLoading] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"watchlist" | "signals" | "active_trades" | "news" | "rules" | "performance">("watchlist");
  const [signals, setSignals] = useState<any[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<{
    lastScanTime: string;
    isScanning: boolean;
    message: string;
    pairsChecked: any[];
  } | null>(null);
  const [performanceStats, setPerformanceStats] = useState<{
    winRate: number;
    totalTrades: number;
    totalClosed: number;
    totalWins: number;
    totalLosses: number;
    sequence: string[];
    trades: any[];
  } | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [activeTrades, setActiveTrades] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("smc_active_trades");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("smc_active_trades", JSON.stringify(activeTrades));
  }, [activeTrades]);

  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Progressive Web App (PWA) installation trigger states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [pwaStatus, setPwaStatus] = useState<string>("checking");

  useEffect(() => {
    // Check if the global listener had caught the prompt before React mounted
    if (typeof window !== "undefined" && (window as any).deferredInstallPrompt) {
      setDeferredPrompt((window as any).deferredInstallPrompt);
      setShowPwaBanner(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      // Store the installation event
      setDeferredPrompt(e);
      (window as any).deferredInstallPrompt = e;
      setShowPwaBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Detect if already installed & running in immersive standalone mode (no browser bar)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowPwaBanner(false);
    }

    // Check service worker support and active status
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          setPwaStatus("active");
        } else {
          setPwaStatus("supported");
        }
      }).catch(() => {
        setPwaStatus("blocked");
      });
    } else {
      setPwaStatus("unsupported");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPwa = async () => {
    // 1. Check if we have the native installer prompt already. Trigger immediately for Instant Install!
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWA promotion install outcome status: ${outcome}`);
        setDeferredPrompt(null);
        (window as any).deferredInstallPrompt = null;
        setShowPwaBanner(false);
      } catch (err) {
        console.error("Installation prompt error:", err);
      }
      return;
    }

    // 2. If we are running inside an iframe, open the app top-level immediately!
    // This allows the browser to trigger prompt/PWA installation since iframe sandboxing blocks manual installs.
    if (window.self !== window.top) {
      window.open(window.location.href, "_blank");
      return;
    }

    // 3. Fallback: If top-level but browser hasn't fired the trigger yet, show the informative setup modal.
    setShowInstallModal(true);
  };

  const triggerBrowserInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA promotion install outcome status: ${outcome}`);
      setDeferredPrompt(null);
      (window as any).deferredInstallPrompt = null;
      setShowPwaBanner(false);
      setShowInstallModal(false);
    } catch (err) {
      console.error("Installation prompt error:", err);
    }
  };

  // Auto scan on load
  useEffect(() => {
    handleScan();
    handleFetchNews();
    handleFetchPerformance();
    handleFetchSignals();
    handleFetchScannerStatus();
  }, []);

  // Automatic frontend scanner interval daemon
  useEffect(() => {
    if (!autoScanEnabled) return;
    const interval = setInterval(() => {
      // Trigger scan automatically if not already loading
      handleScan();
    }, 45000); // 45 seconds

    return () => clearInterval(interval);
  }, [autoScanEnabled]);

  // Fetch performance and signal lists when their respective tab becomes active, with automatic background status polling
  useEffect(() => {
    if (activeTab === "performance") {
      handleFetchPerformance();
    }
    if (activeTab === "signals") {
      handleFetchSignals();
    }
    handleFetchScannerStatus();

    const interval = setInterval(() => {
      handleFetchScannerStatus();
      if (activeTab === "signals") {
        handleFetchSignals();
      }
    }, 15000); // Poll scanner telemetry status update every 15 seconds

    return () => clearInterval(interval);
  }, [activeTab]);

  const handleFetchSignals = async () => {
    setSignalsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/signals`);
      if (!res.ok) throw new Error("HTTP error fetching signals");
      const data = await res.json();
      setSignals(data);
    } catch (err) {
      console.error("Failed to fetch signals:", err);
    } finally {
      setSignalsLoading(false);
    }
  };

  const handleFetchScannerStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/scanner/status`);
      if (!res.ok) throw new Error("HTTP error retrieving scanner status");
      const data = await res.json();
      setScannerStatus(data);
    } catch (err) {
      console.error("Failed to fetch scanner status:", err);
    }
  };

  const handleScan = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      let url = force ? `${API_BASE_URL}/api/scan?force=true` : `${API_BASE_URL}/api/scan`;
      let res = await fetch(url);
      
      // If a forced request failed or timed out, attempt to fall back immediately to cached results!
      if (!res.ok && force) {
        console.warn("Forced live scan failed, falling back to cached scan...");
        url = `${API_BASE_URL}/api/scan`;
        res = await fetch(url);
      }

      if (!res.ok) throw new Error("HTTP error scanning the market");
      const data = await res.json();
      setScanData(data);
      setLastScanTime(new Date().toLocaleTimeString());
      
      // Warm up signals and status on scan completion
      handleFetchSignals();
      handleFetchScannerStatus();

      // Set first scanned pair as selected or keep current if available
      if (data.results && data.results.length > 0) {
        const found = data.results.find((r: any) => r.pair === selectedPair);
        if (!found) {
          setSelectedPair(data.results[0].pair);
        }
      }
    } catch (err: any) {
      console.error(err);
      // Check if we can do a secondary fallback to retrieve cached scan data
      if (force) {
        try {
          console.warn("Retrying fetch scan from cache as error fallback...");
          const res = await fetch(`${API_BASE_URL}/api/scan`);
          if (res.ok) {
            const data = await res.json();
            setScanData(data);
            setLastScanTime(new Date().toLocaleTimeString());
            handleFetchSignals();
            handleFetchScannerStatus();
            if (data.results && data.results.length > 0) {
              const found = data.results.find((r: any) => r.pair === selectedPair);
              if (!found) setSelectedPair(data.results[0].pair);
            }
            return;
          }
        } catch (fallback_err) {
          console.error("Fallback cached fetch also failed:", fallback_err);
        }
      }
      setError("Market scanner failed to connect. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchNews = async () => {
    setNewsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/news`);
      if (!res.ok) throw new Error("HTTP error fetching calendar events");
      const data = await res.json();
      setNewsData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setNewsLoading(false);
    }
  };

  const handleFetchPerformance = async () => {
    setPerfLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/performance/stats`);
      if (!res.ok) throw new Error("HTTP error retrieving performance metrics");
      const data = await res.json();
      setPerformanceStats(data);
    } catch (err) {
      console.error("Failed to fetch performance stats:", err);
    } finally {
      setPerfLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const activeResult = (scanData && Array.isArray(scanData.results)) ? scanData.results.find((r) => r.pair === selectedPair) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* HEADER SECTION */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">
                SMC Forex Scanner
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                  v1.0
                </span>
              </h1>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">Smart Money Concepts & ICT System</p>
            </div>
          </div>

          {/* SESSION TIMING MODULE */}
          <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs font-mono">
            {scanData?.session ? (
              <div className="px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center gap-2.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>
                  GMT: <span className="text-white font-medium">{scanData.session.currentGmt}</span>
                </span>
                <span className="text-zinc-600">|</span>
                <span className="flex items-center gap-1.5">
                  Session:{" "}
                  <span
                    className={`font-semibold ${
                      scanData.session.canTrade ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {scanData.session.session}
                  </span>
                </span>
                {scanData.session.mondayReduced && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]">
                    Monday Reduced
                  </span>
                )}
              </div>
            ) : (
              <div className="w-48 h-8 rounded-xl bg-zinc-800/40 animate-pulse border border-zinc-800" />
            )}

            {/* AUTO REFRESH TOGGLE */}
            <button
              onClick={() => setAutoScanEnabled(!autoScanEnabled)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border cursor-pointer whitespace-nowrap ${
                autoScanEnabled
                  ? "bg-zinc-900 border-emerald-500/30 text-emerald-400 font-bold"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-400"
              }`}
              title="Click to toggle automatic background 45-second market scanning"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoScanEnabled ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
              <span>Auto-refresh {autoScanEnabled ? "ON" : "OFF"}</span>
            </button>

            {/* SCAN BUTTON */}
            <button
              onClick={() => handleScan(true)}
              disabled={loading}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                loading
                  ? "bg-zinc-800 text-zinc-500 border border-zinc-750 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold hover:scale-[1.02] shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
              }`}
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Scanning..." : "Scan Market"}
            </button>

            {/* PWA INSTALL TRIGGER */}
            <button
              onClick={handleInstallPwa}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              title="Install SMC Scanner on your Android or mobile device as a standalone app"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Install App</span>
            </button>
          </div>
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* WATCHLIST / STATS STRIP */}
      {scanData && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Total Pairs Watched</span>
              <span className="text-2xl font-bold font-display mt-1 text-white">11</span>
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Market Status</span>
              <span className={`text-lg font-bold mt-1 uppercase ${scanData.session.canTrade ? "text-emerald-400" : "text-amber-400"}`}>
                {scanData.session.canTrade ? "Active / Open" : "Outside Kill Zones"}
              </span>
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Active Setup Trades</span>
              <span className="text-2xl font-bold font-display mt-1 text-emerald-400">
                {scanData.passed_count}
              </span>
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Last Scanned</span>
              <span className="text-sm font-mono mt-1 text-zinc-300">
                {lastScanTime || "Never"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CORE WORKSPACE LAYOUT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT SIDE: SELECTION & LISTINGS (5cols) */}
          <section className="lg:col-span-5 flex flex-col gap-4">
            {/* Nav Tabs container with responsive scroll */}
            <div className="flex border-b border-zinc-800 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800">
              <button
                onClick={() => setActiveTab("watchlist")}
                className={`py-2 px-3 text-xs font-semibold tracking-wider font-display border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === "watchlist"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Watchlist
              </button>
              <button
                onClick={() => setActiveTab("signals")}
                className={`py-2 px-3 text-xs font-semibold tracking-wider font-display border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === "signals"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Signals Log
                {signals.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-550/20 text-emerald-400 font-mono text-[9px] font-bold animate-pulse">
                    {signals.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("active_trades")}
                className={`py-2 px-3 text-xs font-semibold tracking-wider font-display border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === "active_trades"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Active Track
                {activeTrades.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[9px] font-bold">
                    {activeTrades.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("news")}
                className={`py-2 px-3 text-xs font-semibold tracking-wider font-display border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === "news"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Calendar News
                {newsData.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("rules")}
                className={`py-2 px-3 text-xs font-semibold tracking-wider font-display border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === "rules"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                SMC Locked Rules
              </button>
              <button
                onClick={() => setActiveTab("performance")}
                className={`py-2 px-3 text-xs font-semibold tracking-wider font-display border-b-2 transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === "performance"
                    ? "border-emerald-500 text-emerald-400 font-bold"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Performance
              </button>
            </div>

            {/* TAB CONTENT: WATCHLIST SCAN LISTINGS */}
            {activeTab === "watchlist" && (
              <div className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1">
                {loading && !scanData ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 rounded-xl bg-zinc-900/30 animate-pulse border border-zinc-900"
                    />
                  ))
                ) : scanData && scanData.results ? (
                  scanData.results.map((r) => {
                    const isSelected = selectedPair === r.pair;
                    const isActionable = r.decision === "BUY" || r.decision === "SELL";
                    return (
                      <div
                        key={r.pair}
                        onClick={() => setSelectedPair(r.pair)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                          isSelected
                            ? "bg-zinc-900 border-zinc-700 shadow-md shadow-zinc-950"
                            : "bg-zinc-900/30 border-zinc-800/80 hover:bg-zinc-900/50 hover:border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-1.5 rounded-lg border text-xs font-bold font-mono ${
                              r.decision === "BUY"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : r.decision === "SELL"
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : "bg-zinc-800/60 text-zinc-400 border-zinc-700/60"
                            }`}
                          >
                            {r.pair.replace("/", "")}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold tracking-tight text-white">
                                {r.pair}
                              </span>
                              {r.grade !== "-" && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                                  r.grade.includes("+") ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                                }`}>
                                  {r.grade}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-zinc-500">
                              <span>Mid: {r.price !== undefined && r.price !== null ? r.price.toFixed(r.pair.includes("JPY") ? 3 : 5) : "--"}</span>
                              <span>•</span>
                              <span>Spr: {r.live?.spread_pips ?? "--"} p</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg ${
                              r.decision === "BUY"
                                ? "bg-emerald-500 text-zinc-950"
                                : r.decision === "SELL"
                                ? "bg-red-500 text-zinc-950"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {r.decision}
                          </span>
                          <ChevronRight className={`w-4 h-4 text-zinc-500 ${isSelected ? "text-zinc-300" : ""}`} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-zinc-500 text-xs font-mono">
                    No scan data yet. Click "Scan Market" to begin.
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: DEPICTED SIGNALS LEDGER LISTINGS */}
            {activeTab === "signals" && (
              <div className="flex flex-col gap-3">
                {/* Visual Telemetry Live Widget */}
                {scannerStatus && (
                  <div className="bg-zinc-900/40 border border-zinc-800/80 p-3 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Auto-Scanner Status
                      </span>
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        scannerStatus.isScanning ? "bg-amber-500/10 text-amber-400 animate-pulse" : "bg-emerald-500/10 text-emerald-400"
                      }`}>
                        {scannerStatus.isScanning ? "Scanning..." : "Idle (Polling)"}
                      </span>
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
                      <div
                        key={i}
                        className="h-24 rounded-xl bg-zinc-900/30 animate-pulse border border-zinc-900"
                      />
                    ))
                  ) : Array.isArray(signals) && signals.length > 0 ? (
                    signals.map((sig) => {
                      return (
                        <div
                          key={sig.id}
                          className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-2 text-xs relative hover:border-zinc-700/60 transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded font-bold font-mono text-[10px] ${
                                  sig.direction === "BUY"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}
                              >
                                {sig.direction}
                              </span>
                              <span className="font-bold text-white text-sm font-mono">{sig.pair}</span>
                              {sig.grade && (
                                <span className="bg-zinc-800 text-zinc-350 text-[10px] font-bold px-1.5 py-0.2 rounded-md font-mono border border-zinc-700/60">
                                  Grade {sig.grade}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {new Date(sig.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-[10px] text-zinc-400 border-t border-zinc-850">
                            <div>
                              <span className="text-zinc-550 block text-[9px] uppercase">Entry</span>
                              <span className="text-zinc-200 mt-0.5 block">{sig.entryPrice.toFixed(sig.pair.includes("JPY") ? 3 : 5)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-550 block text-[9px] uppercase">Stop Loss</span>
                              <span className="text-red-400 mt-0.5 block">{sig.sl.toFixed(sig.pair.includes("JPY") ? 3 : 5)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-550 block text-[9px] uppercase">Target 1</span>
                              <span className="text-emerald-400 mt-0.5 block">{sig.tp1.toFixed(sig.pair.includes("JPY") ? 3 : 5)}</span>
                            </div>
                            <div>
                              <span className="text-zinc-550 block text-[9px] uppercase">Target 2</span>
                              <span className="text-teal-400 mt-0.5 block">{sig.tp2.toFixed(sig.pair.includes("JPY") ? 3 : 5)}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-1 pt-1 border-t border-zinc-900/60">
                            <span className="flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-emerald-500" />
                              <span>Score: +{sig.bonuses || 0} SMC factors</span>
                            </span>
                            <span className="text-zinc-500 font-bold uppercase">{sig.session} Killzone</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 bg-zinc-900/10 border border-zinc-800/60 rounded-xl p-6 flex flex-col items-center justify-center">
                      <Activity className="w-8 h-8 text-zinc-650 mb-2 animate-pulse" />
                      <h4 className="text-xs font-semibold text-white">Continuous scanning active...</h4>
                      <p className="text-[11px] text-zinc-550 max-w-xs text-center mt-1">
                        Any qualifying entries registered during the background cycles (checked every minute) will load here in real time.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: ACTIVE TRADES */}
            {activeTab === "active_trades" && (
              <div className="flex flex-col gap-3 max-h-[640px] overflow-y-auto pr-1">
                {activeTrades.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-900/10 border border-zinc-800/60 rounded-2xl p-6 flex flex-col items-center justify-center">
                    <TrendingUp className="w-8 h-8 text-zinc-650 mb-2" />
                    <h4 className="text-xs font-semibold text-white">No active positions tracked</h4>
                    <p className="text-[11px] text-zinc-500 mt-1 max-w-xs mx-auto">
                      Manually mark any pair as "In Trade" from its Trade Plan card inside the Deep-Dive view to track active positions.
                    </p>
                  </div>
                ) : (
                  activeTrades.map((t) => {
                    const scanItem = (scanData && Array.isArray(scanData.results)) ? scanData.results.find((r) => r.pair === t.pair) : null;
                    const currentPrice = scanItem ? scanItem.price : null;

                    let progressPercent = 0;
                    let isProfit = false;
                    if (currentPrice) {
                      const entryDist = Math.abs(currentPrice - t.entry);
                      const totalDist = Math.abs(t.tp1 - t.entry);
                      progressPercent = Math.min(Math.max((entryDist / (totalDist || 1)) * 100, 0), 100);

                      if (t.direction === "BUY") {
                        isProfit = currentPrice >= t.entry;
                      } else {
                        isProfit = currentPrice <= t.entry;
                      }
                    }

                    return (
                      <div
                        key={t.pair}
                        className="p-4 bg-zinc-900/40 hover:bg-zinc-900/50 border border-zinc-800/80 rounded-2xl flex flex-col gap-3 relative transition-all"
                      >
                        {/* Title Row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                t.direction === "BUY"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                              }`}
                            >
                              {t.direction}
                            </span>
                            <span className="text-sm font-semibold tracking-tight text-white">{t.pair}</span>
                          </div>
                          <button
                            onClick={() => {
                              setActiveTrades((prev) => prev.filter((p) => p.pair !== t.pair));
                            }}
                            className="p-1 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800/40 transition-all cursor-pointer"
                            title="Remove tracking"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Prices block */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                          <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60">
                            <span className="text-[10px] text-zinc-500 block">ENTRY</span>
                            <span className="text-white font-medium">
                              {t.entry !== undefined ? t.entry.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}
                            </span>
                          </div>
                          <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60">
                            <span className="text-[10px] text-zinc-500 block">CURRENT</span>
                            <span className={`font-semibold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                              {currentPrice !== null ? currentPrice.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}
                            </span>
                          </div>
                          <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60">
                            <span className="text-[10px] text-red-400/80 block">SL (STOP)</span>
                            <span className="text-red-400 font-medium">
                              {t.sl !== undefined ? t.sl.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}
                            </span>
                          </div>
                          <div className="bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/60">
                            <span className="text-[10px] text-emerald-400/80 block">TP1 (TARGET)</span>
                            <span className="text-emerald-400 font-medium">
                              {t.tp1 !== undefined ? t.tp1.toFixed(t.pair.includes("JPY") ? 3 : 5) : "--"}
                            </span>
                          </div>
                        </div>

                        {/* Progress visual bar */}
                        {currentPrice && (
                          <div className="mt-1">
                            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                              <span>SL</span>
                              <span>Entry</span>
                              <span>TP1 (1:2)</span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden mt-1 relative border border-zinc-850">
                              <div
                                style={{ width: `${progressPercent}%` }}
                                className={`h-full transition-all duration-500 ${isProfit ? "bg-emerald-500" : "bg-red-500"}`}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-850/65">
                          <span>Opened tracking: {t.timestamp}</span>
                          {scanItem && <span>Spread: {scanItem.live?.spread_pips ?? "--"} p</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB CONTENT: CALENDAR ECONOMIC NEWS */}
            {activeTab === "news" && (() => {
              const filteredNews = newsData.filter((event) => {
                const imp = (event.impact || "").toUpperCase();
                if (newsFilter === "high") {
                  return imp === "HIGH";
                }
                if (newsFilter === "high_medium") {
                  return imp === "HIGH" || imp === "MEDIUM";
                }
                return true;
              });

              return (
                <div className="flex flex-col gap-3 min-h-[300px] max-h-[640px] overflow-y-auto pr-1">
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-500 pb-2 border-b border-zinc-800">
                    <span>Economic Calendars today</span>
                    <button
                      onClick={handleFetchNews}
                      disabled={newsLoading}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className={`w-3 h-3 ${newsLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                  </div>

                  {/* News Impact Filter Tabs */}
                  <div className="flex gap-1.5 p-1 bg-zinc-950/60 rounded-xl border border-zinc-850/80">
                    <button
                      onClick={() => setNewsFilter("high_medium")}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] uppercase font-semibold transition-all cursor-pointer text-center ${
                        newsFilter === "high_medium"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "text-zinc-500 hover:text-zinc-350 border border-transparent"
                      }`}
                    >
                      Medium / High
                    </button>
                    <button
                      onClick={() => setNewsFilter("high")}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] uppercase font-semibold transition-all cursor-pointer text-center ${
                        newsFilter === "high"
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "text-zinc-500 hover:text-zinc-350 border border-transparent"
                      }`}
                    >
                      High Only
                    </button>
                    <button
                      onClick={() => setNewsFilter("all")}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] uppercase font-semibold transition-all cursor-pointer text-center ${
                        newsFilter === "all"
                          ? "bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                          : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                      }`}
                    >
                      All
                    </button>
                  </div>

                  {newsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-16 rounded-xl bg-zinc-900/30 animate-pulse border border-zinc-900"
                      />
                    ))
                  ) : filteredNews.length > 0 ? (
                    filteredNews.map((event, i) => {
                      const imp = (event.impact || "").toUpperCase();
                      const impactColorClass = imp === "HIGH" 
                        ? "bg-red-500/10 text-red-400 border-red-500/20" 
                        : imp === "MEDIUM" 
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                          : "bg-zinc-800 text-zinc-400 border-zinc-700";
                      
                      return (
                        <div
                          key={i}
                          className="p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/80 flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {event.time}
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${impactColorClass}`}>
                              {imp} IMPACT
                            </span>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="text-zinc-400 font-mono">[{event.currency}]</span> {event.event}
                            </h4>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-800/60">
                            <span>Frcst: <span className="text-zinc-300">{event.forecast || "-"}</span></span>
                            <span>Prev: <span className="text-zinc-300">{event.previous || "-"}</span></span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-zinc-500 text-xs font-mono">
                      No economic calendars listed for today.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TAB CONTENT: SMC TRADING RULES DOCUMENT */}
            {activeTab === "rules" && (
              <div className="text-xs text-zinc-400 leading-relaxed font-sans max-h-[640px] overflow-y-auto flex flex-col gap-4">
                <div className="p-3.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                    K1. Kill Zone Timings (GMT)
                  </h3>
                  <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400 font-mono">
                    <li><strong className="text-emerald-400">London KZ:</strong> 07:00 – 10:00 (Nigerian 8am-11am)</li>
                    <li><strong className="text-emerald-400">NY KZ:</strong> 12:00 – 15:00 (Nigerian 1pm-4pm)</li>
                    <li><strong className="text-emerald-400">London/NY Overlap:</strong> 12:00 – 16:00 (Nigerian 1pm-5pm)</li>
                    <li><strong className="text-red-400">Asian Session:</strong> 00:00 – 07:00 (Strictly No Trades)</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    K4. Premium / Discount Zone
                  </h3>
                  <p className="mt-1">
                    We use a 30% / 40% / 30% quartile allocation. We strictly trade only when the price resides at the extremes:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400 font-mono">
                    <li><strong className="text-red-400">Premium (Top 30%):</strong> Shorts/Sell trades only</li>
                    <li><strong className="text-zinc-500">Equilibrium (Middle 40%):</strong> No trades! No execution!</li>
                    <li><strong className="text-emerald-400">Discount (Bottom 30%):</strong> Longs/Buy trades only</li>
                  </ul>
                </div>

                <div className="p-3.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80">
                  <h3 className="font-semibold text-white mb-2 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Locked Risk Management
                  </h3>
                  <ul className="list-disc pl-4 space-y-1 mt-1 text-zinc-400 font-mono">
                    <li>Default Risk: 1% per setup</li>
                    <li>Weekly/Daily/H1 Trend Align = A+ Setup (max 2% risk)</li>
                    <li>Max limits: 3 Trades / Day or Daily DD Limit is -2%</li>
                    <li>Breakeven protection: Always move SL to BE when price hits 1:1 RR</li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB CONTENT: PERFORMANCE SUMMARY STATS */}
            {activeTab === "performance" && (
              <div className="flex flex-col gap-4">
                <div className="p-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl flex flex-col items-center text-center shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-505" />
                  
                  <span className="text-zinc-550 text-[10px] font-mono uppercase tracking-widest mb-1">Overall Win Rate</span>
                  {perfLoading && !performanceStats ? (
                    <div className="h-28 w-28 rounded-full border-4 border-zinc-800 border-t-emerald-500 animate-spin flex items-center justify-center my-3">
                      <span className="text-zinc-500 text-xs font-mono">Loading...</span>
                    </div>
                  ) : (
                    <div className="relative flex items-center justify-center my-2">
                      <svg className="w-32 h-32 transform -rotate-90">
                        <circle
                          cx="64"
                          cy="64"
                          r="52"
                          stroke="#18181b"
                          strokeWidth="8"
                          fill="transparent"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="52"
                          stroke="#10b981"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={2 * Math.PI * 52}
                          strokeDashoffset={2 * Math.PI * 52 * (1 - (performanceStats?.winRate || 0) / 100)}
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-3xl font-extrabold font-display text-white">
                          {performanceStats ? `${performanceStats.winRate.toFixed(1)}%` : "0%"}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mt-0.5">Verified Edge</span>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-zinc-400 max-w-xs mt-2 leading-relaxed">
                    Automatically monitored forward-testing trades entered on high-grade SMC structures.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col">
                    <span className="text-zinc-550 text-[10px] font-mono uppercase">Total Trades Logged</span>
                    <span className="text-xl font-bold font-display text-white mt-1">
                      {performanceStats?.totalTrades || 0}
                    </span>
                  </div>
                  <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col">
                    <span className="text-zinc-550 text-[10px] font-mono uppercase">Total Resolved</span>
                    <span className="text-xl font-bold font-display text-zinc-300 mt-1">
                      {performanceStats?.totalClosed || 0}
                    </span>
                  </div>
                  <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col">
                    <span className="text-zinc-550 text-[10px] font-mono uppercase text-emerald-500">Winners</span>
                    <span className="text-xl font-bold font-display text-emerald-400 mt-1">
                      {performanceStats?.totalWins || 0}
                    </span>
                  </div>
                  <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col">
                    <span className="text-zinc-550 text-[10px] font-mono uppercase text-red-500">Losers</span>
                    <span className="text-xl font-bold font-display text-red-400 mt-1">
                      {performanceStats?.totalLosses || 0}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl flex flex-col">
                  <span className="text-zinc-550 text-[10px] font-mono uppercase mb-2">Recent Trade Outcomes Track</span>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {performanceStats?.sequence && performanceStats.sequence.length > 0 ? (
                      performanceStats.sequence.map((icon, index) => (
                        <div
                          key={index}
                          className="w-7 h-7 rounded-lg bg-zinc-950/80 border border-zinc-800/60 flex items-center justify-center text-xs shadow-inner"
                          title={icon === "🟢" ? "Win Result" : "Loss Result"}
                        >
                          {icon}
                        </div>
                      ))
                    ) : (
                      <span className="text-zinc-550 text-[11px] font-mono">No sequence outcomes logged yet</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleFetchPerformance}
                    disabled={perfLoading}
                    className="flex-1 py-2.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-800 transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${perfLoading ? "animate-spin" : ""}`} />
                    <span>Refresh Stats</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm("Are you sure you want to clear all historical and active trade tracking memory on the server? This cannot be undone.")) {
                        try {
                          await fetch(`${API_BASE_URL}/api/performance/clear`, { method: "POST" });
                          handleFetchPerformance();
                        } catch (err) {
                          console.error(err);
                        }
                      }
                    }}
                    className="py-2.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-red-500/20 transition-all cursor-pointer active:scale-[0.98]"
                  >
                    Reset Data
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* RIGHT SIDE: SELECTED PAIR DEEP-DIVE (7cols) / PERFORMANCE MEMORY TRACK */}
          <section className="lg:col-span-7">
            {activeTab === "performance" ? (
              <div className="bg-zinc-900/60 border border-zinc-850 rounded-2xl p-6 flex flex-col gap-6 shadow-xl shadow-zinc-950/40 relative min-h-[500px]">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-teal-500 to-indigo-500" />
                
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                  <div>
                    <h2 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">
                       🏆 Virtual Trades History & System Memory
                    </h2>
                    <p className="text-xs text-zinc-500 font-mono mt-1">
                      Forward-testing ledger persistent in server trades cache database
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-1 bg-zinc-800/80 rounded-lg text-zinc-400 border border-zinc-700/50">
                    SMC ALPHA v1.0
                  </span>
                </div>

                <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1">
                  {!performanceStats || performanceStats.trades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Search className="w-8 h-8 text-zinc-650 mb-3 animate-pulse" />
                      <h4 className="text-sm font-semibold text-white">No virtual trades logged yet</h4>
                      <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                        The background 1-minute scanning loop runs in the background. Once any high-impact news filter passes and Grade A+, A or B setup forms, virtual trades enter and log automatically here!
                      </p>
                    </div>
                  ) : (
                    performanceStats.trades.map((trade: any) => {
                      const isWin = trade.status === "Closed - WIN";
                      const isLoss = trade.status === "Closed - LOSS";
                      const isOpen = trade.status === "Open";

                      return (
                        <div
                          key={trade.id}
                          className="p-4 bg-zinc-950/40 border border-zinc-850/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-zinc-950/80 hover:border-zinc-800"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-bold font-display text-sm tracking-tight">
                                {trade.pair}
                              </span>
                              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md font-mono ${
                                trade.direction === "BUY"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-red-500/10 text-red-500 border border-red-500/20"
                              }`}>
                                {trade.direction}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-850 border border-zinc-800 text-zinc-300 font-mono`}>
                                Grade {trade.grade}
                              </span>
                              {trade.breakevenTriggered && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-mono font-medium flex items-center gap-1">
                                  🔒 BE
                                </span>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
                              <span>
                                Entry: <span className="text-zinc-300 font-semibold">{trade.entryPrice}</span>
                              </span>
                              <span>
                                SL: <span className="text-zinc-300 font-semibold">{trade.sl}</span>
                              </span>
                              <span>
                                TP1: <span className="text-zinc-300 font-semibold">{trade.tp1}</span>
                              </span>
                            </div>
                            <span className="text-[9px] text-zinc-550 font-mono">
                              Entered: {new Date(trade.timestamp).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-2 border-t sm:border-t-0 border-zinc-900 pt-2 sm:pt-0">
                            <div className="text-[10px] font-mono text-zinc-550 sm:text-right">
                              Status
                            </div>
                            {isOpen ? (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Live Ticks
                              </div>
                            ) : isWin ? (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold">
                                🏆 WINNER
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-bold">
                                ❌ LOSS
                              </div>
                            )}

                            {!isOpen && (
                              <div className={`text-xs font-mono font-bold mt-1 ${isWin ? "text-emerald-400" : trade.rrGained === 0 ? "text-zinc-500" : "text-red-400"}`}>
                                {trade.rrGained >= 0 ? `+${trade.rrGained.toFixed(2)}` : `${trade.rrGained.toFixed(2)}`} R:R
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : activeResult ? (
              <div className="bg-zinc-900/60 border border-zinc-850 rounded-2xl p-6 flex flex-col gap-6 shadow-xl shadow-zinc-950/40 relative">
                
                {/* Pair header block */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
                  <div>
                    <h2 className="text-2xl font-bold font-display text-white tracking-tight flex items-center gap-2">
                      {activeResult.pair} Deep-Dive
                      <span
                        className={`text-xs px-2.5 py-1 rounded-lg ${
                          activeResult.decision === "BUY"
                            ? "bg-emerald-500 text-zinc-950 font-bold"
                            : activeResult.decision === "SELL"
                            ? "bg-red-500 text-zinc-950 font-bold"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {activeResult.decision}
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-500 font-mono mt-1">
                      Scanned at real-time using Capital.com Demo API
                    </p>
                  </div>

                  {/* Core metric details row */}
                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 w-full sm:w-auto font-mono text-xs">
                    <div className="p-2 justify-center bg-zinc-800/40 rounded-xl border border-zinc-750 flex items-center gap-2">
                      <span className="text-zinc-500">Mid:</span>
                      <span className="text-white font-semibold">
                        {activeResult.price !== undefined && activeResult.price !== null ? activeResult.price.toFixed(activeResult.pair.includes("JPY") ? 3 : 5) : "--"}
                      </span>
                    </div>
                    <div className="p-2 justify-center bg-zinc-800/40 rounded-xl border border-zinc-750 flex items-center gap-2">
                      <span className="text-zinc-500">Spread:</span>
                      <span className="text-emerald-400 font-semibold">
                        {activeResult.live?.spread_pips ?? "--"} p
                      </span>
                    </div>
                  </div>
                </div>

                {/* THE PREMIUM/DISCOUNT SLIDER / LIQUIDITY GRAPHICS */}
                {activeResult.range_high && activeResult.range_low && (
                  <div className="p-4 bg-zinc-900/80 rounded-2xl border border-zinc-805 flex flex-col gap-3">
                    <span className="text-zinc-400 font-display font-medium text-xs tracking-wider uppercase flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-zinc-500" />
                      Dealer Range Position gauge
                    </span>

                    <div className="grid grid-cols-2 text-[10px] font-mono text-zinc-500">
                      <span>R. Low (Discount): {activeResult.range_low.toFixed(activeResult.pair.includes("JPY") ? 3 : 5)}</span>
                      <span className="text-right">R. High (Premium): {activeResult.range_high.toFixed(activeResult.pair.includes("JPY") ? 3 : 5)}</span>
                    </div>

                    {/* Simple geometric gauge */}
                    <div className="relative h-6 w-full rounded-lg bg-zinc-850/80 border border-zinc-800 overflow-hidden flex">
                      <div className="w-[30%] h-full bg-emerald-500/15 border-r border-dashed border-emerald-500/10 flex items-center justify-center">
                        <span className="text-[9px] font-mono text-emerald-400/80 font-bold">DISCOUNT (30%)</span>
                      </div>
                      <div className="w-[40%] h-full bg-zinc-800/20 border-r border-dashed border-zinc-750 flex items-center justify-center">
                        <span className="text-[9px] font-mono text-zinc-500/60 font-bold">EQUILIBRIUM (40%)</span>
                      </div>
                      <div className="w-[30%] h-full bg-red-500/15 flex items-center justify-center">
                        <span className="text-[9px] font-mono text-red-400/80 font-bold">PREMIUM (30%)</span>
                      </div>

                      {/* Moving Price Pointer */}
                      {(() => {
                        const rangeSize = activeResult.range_high - activeResult.range_low;
                        const priceVal = activeResult.price !== undefined && activeResult.price !== null ? activeResult.price : activeResult.range_low + rangeSize / 2;
                        const posPercent = rangeSize > 0 ? ((priceVal - activeResult.range_low) / rangeSize) * 100 : 50;
                        const cleanPct = Math.min(Math.max(posPercent, 0), 100);
                        return (
                          <div
                            style={{ left: `${cleanPct}%` }}
                            className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] -translate-x-1/2 flex flex-col justify-between"
                          >
                            <div className="w-2.5 h-2.5 bg-white border border-zinc-950 rounded-full -translate-x-1/3 -translate-y-[3px]" />
                            <div className="w-2.5 h-2.5 bg-white border border-zinc-950 rounded-full -translate-x-1/3 translate-y-[3px]" />
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-500">Residing zone:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded-md ${
                          activeResult.zone === "DISCOUNT"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : activeResult.zone === "PREMIUM"
                            ? "bg-red-500/10 text-red-500"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {activeResult.zone}
                      </span>
                    </div>
                  </div>
                )}

                {/* THE 13 GATE FILTERS CHECKLISTS */}
                <div>
                  <h3 className="text-zinc-400 font-display font-medium text-xs tracking-wider uppercase mb-3 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />
                    SMC Core gate verification
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[280px] overflow-y-auto pr-1">
                    {activeResult.checks.map((check: string, idx: number) => {
                      const isPass = check.includes("[OK]") || check.includes("Spread") && !check.includes("[X]");
                      const isFail = check.includes("[X]") || check.includes("FAIL");
                      const isWarning = check.includes("[!]");
                      return (
                        <div
                          key={idx}
                          className="p-2.5 bg-zinc-900/30 rounded-xl border border-zinc-800/80 flex items-start gap-2 text-xs"
                        >
                          {isPass ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : isFail ? (
                            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          ) : isWarning ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <HelpCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                          )}
                          <span
                            className={
                              isPass ? "text-zinc-200" : isFail ? "text-zinc-500" : isWarning ? "text-amber-300" : "text-zinc-400"
                            }
                          >
                            {check.replace(/\[OK\]\s*|\[X\]\s*|\[!\]\s*/, "")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* CONFLUENCE LISTING */}
                <div>
                  <h3 className="text-zinc-400 font-display font-medium text-xs tracking-wider uppercase mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
                    BONUSES & CONFLUENCES ({activeResult.bonuses}/7)
                  </h3>

                  {activeResult.bonus_list.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {activeResult.bonus_list.map((bonus: string, index: number) => (
                        <span
                          key={index}
                          className="px-2.5 py-1 bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 rounded-lg text-[10px] font-mono flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3 h-3 text-yellow-400" />
                          {bonus}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-zinc-500 bg-zinc-900/20 p-2.5 rounded-xl border border-zinc-800/60 text-center">
                      No active confluences on current setup.
                    </div>
                  )}
                </div>

                {/* THE POWERFUL COMBINED TRADE PLAN BOX */}
                {activeResult.plan ? (
                  <div className={`p-4 rounded-2xl flex flex-col gap-3 border ${
                    activeResult.passed
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : "bg-amber-500/5 border-zinc-805"
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-mono tracking-wider uppercase flex items-center gap-1.5 ${
                          activeResult.passed ? "text-emerald-400 font-semibold" : "text-amber-400"
                        }`}>
                          <DollarSign className="w-3.5 h-3.5" />
                          {activeResult.passed
                            ? `SMC Confirmed Trade Plan (Grade ${activeResult.grade})`
                            : "SMC Potential Trade Plan (WAIT status)"
                          }
                        </span>
                        {!activeResult.passed && (
                          <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            *This setup has pending gates but a trade structure has been estimated below.
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono">
                        {/* COPY PLAN BUTTON */}
                        {copiedText === "Trade Plan" ? (
                          <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded-lg">
                            Copied!
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              const planTxt = `${activeResult.pair} SMC Setup Plan:\nEntry: ${activeResult.plan!.entry}\nSL: ${activeResult.plan!.sl}\nTP1: ${activeResult.plan!.tp1}\nTP2: ${activeResult.plan!.tp2}\nTP3: ${activeResult.plan!.tp3}`;
                              handleCopy(planTxt, "Trade Plan");
                            }}
                            className="p-1 px-2.5 hover:bg-zinc-800 hover:text-zinc-200 text-zinc-400 rounded-lg text-[10px] flex items-center gap-1 cursor-pointer border border-zinc-800/80"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        )}

                        {/* TOGGLE ACTIVE TRADE TRACKING BUTTON */}
                        {activeTrades.some(t => t.pair === activeResult.pair) ? (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 animate-pulse">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Tracking In-Trade
                          </span>
                        ) : (
                          <button
                            onClick={async () => {
                              const newTrade = {
                                pair: activeResult.pair,
                                direction: activeResult.direction || "BUY",
                                entry: activeResult.plan!.entry,
                                sl: activeResult.plan!.sl,
                                tp1: activeResult.plan!.tp1,
                                tp2: activeResult.plan!.tp2,
                                tp3: activeResult.plan!.tp3,
                                rr: activeResult.plan!.rr,
                                timestamp: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              };
                              setActiveTrades(prev => [...prev, newTrade]);

                              // Fire-and-forget server synchronizer
                              try {
                                await fetch(`${API_BASE_URL}/api/performance/enter`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    pair: activeResult.pair,
                                    direction: activeResult.direction || "BUY",
                                    entryPrice: activeResult.plan!.entry,
                                    sl: activeResult.plan!.sl,
                                    tp1: activeResult.plan!.tp1,
                                    tp2: activeResult.plan!.tp2,
                                    tp3: activeResult.plan!.tp3,
                                    grade: activeResult.grade
                                  })
                                });
                                // Instantly trigger a fetch of the backend stats to include the active trade
                                handleFetchPerformance();
                              } catch (err) {
                                console.error("Could not sync trade to server performance monitor:", err);
                              }
                            }}
                            className={`px-3 py-1 font-semibold font-display rounded-lg text-[11px] tracking-wider transition-all flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                              activeResult.passed
                                ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold shadow-md shadow-emerald-500/10"
                                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                            }`}
                          >
                            Mark as In Trade
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                      <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center">
                        <span className="text-[10px] text-zinc-500 font-mono uppercase">Entry</span>
                        <span className="text-sm font-bold text-white font-mono mt-0.5">
                          {activeResult.plan.entry !== undefined && activeResult.plan.entry !== null ? activeResult.plan.entry.toFixed(activeResult.pair.includes("JPY") ? 3 : 5) : "--"}
                        </span>
                      </div>
                      <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center">
                        <span className="text-[10px] text-red-400 font-mono uppercase">Stop Loss</span>
                        <span className="text-sm font-bold text-red-400 font-mono mt-0.5">
                          {activeResult.plan.sl !== undefined && activeResult.plan.sl !== null ? activeResult.plan.sl.toFixed(activeResult.pair.includes("JPY") ? 3 : 5) : "--"}
                        </span>
                      </div>
                      <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center">
                        <span className="text-[10px] text-zinc-500 font-mono uppercase">TP1 (1:2 RR)</span>
                        <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                          {activeResult.plan.tp1 !== undefined && activeResult.plan.tp1 !== null ? activeResult.plan.tp1.toFixed(activeResult.pair.includes("JPY") ? 3 : 5) : "--"}
                        </span>
                      </div>
                      <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center">
                        <span className="text-[10px] text-zinc-500 font-mono uppercase">TP2 (1:3 RR)</span>
                        <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                          {activeResult.plan.tp2 !== undefined && activeResult.plan.tp2 !== null ? activeResult.plan.tp2.toFixed(activeResult.pair.includes("JPY") ? 3 : 5) : "--"}
                        </span>
                      </div>
                      <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800 flex flex-col justify-center col-span-2 md:col-span-1">
                        <span className="text-[10px] text-zinc-500 font-mono uppercase">TP3 (DOL)</span>
                        <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5">
                          {activeResult.plan.tp3 !== undefined && activeResult.plan.tp3 !== null ? activeResult.plan.tp3.toFixed(activeResult.pair.includes("JPY") ? 3 : 5) : "--"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400 mt-2 pt-2 border-t border-zinc-800/60 gap-4">
                      <span>R:R Reward target: <strong className="text-white">1:{activeResult.plan.rr}</strong></span>
                      <span>Stop size: <strong className="text-white">{activeResult.plan.sl_atr}x ATR</strong></span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/15">
                        Co-aligns of H1 + Daily Structure
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl flex items-center gap-3">
                    <Info className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-white">No active trade plan</h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Setup is currently in WAIT status because not all core gate filters are fully verified yet.
                      </p>
                    </div>
                  </div>
                )}

                {/* CORRELATION WARNING PANEL */}
                {scanData?.conflicts && scanData.conflicts.length > 0 && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col gap-2">
                    <span className="text-red-400 text-xs font-semibold uppercase flex items-center gap-1.5 font-display">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      USD Correlation Conflict Identified!
                    </span>
                    <div className="space-y-1.5 text-xs text-zinc-400 leading-relaxed font-mono mt-1">
                      {scanData.conflicts.map((c: any, index: number) => (
                        <p key={index}>
                          ⚠️ Conflicted pairs detected: <span className="text-white font-bold">[{c.pair1}]</span> and{" "}
                          <span className="text-white font-bold">[{c.pair2}]</span> share currency{" "}
                          <span className="text-white font-bold">{c.currency}</span> but have opposite bias targets.
                        </p>
                      ))}
                      <p className="text-[10px] text-zinc-500 italic mt-1 pt-1.5 border-t border-red-500/10">
                        *Rule K9: Do not trade both. Execute the stronger entry signal and put the weaker in WAIT.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-16 flex flex-col items-center justify-center text-center">
                <Search className="w-10 h-10 text-zinc-600 mb-3" />
                <h3 className="text-sm font-semibold text-white">Select a Pair to Analyze</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Click on any currency pair or precious metal in the Watchlist panel to load its complete SMC gate checklist.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800 bg-zinc-950 py-8 mt-12 text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <p>© 2026 SMC Forex Scanner. Built on top of Capital.com Demo API Engine.</p>
          </div>
          <div className="flex gap-4">
            <span className="text-zinc-600">|</span>
            <span>Version 1.0 (Live 2026-06-15)</span>
            <span className="text-zinc-600">|</span>
            <span className="text-amber-500/80">Analysis is strictly for educational & support targets</span>
          </div>
        </div>
      </footer>
      {/* PWA INSTALLATION INTERACTIVE DIALOG */}
      <AnimatePresence>
        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInstallModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              {/* Decorative gradient top bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400" />

              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                    <Smartphone className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">SMC Forex PWA Application</h3>
                    <p className="text-[11px] text-zinc-400 font-mono">STANDALONE INSTALLATION ENGINE</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowInstallModal(false)}
                  className="p-1 px-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer text-sm font-semibold border border-zinc-900"
                >
                  ✕
                </button>
              </div>

              {/* Status / Notice Panel */}
              <div className="mt-5 space-y-4">
                {window.self !== window.top ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs space-y-2.5">
                    <div className="font-bold text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Viewing inside Workspace iFrame Sandbox</span>
                    </div>
                    <p className="text-zinc-300 leading-relaxed text-[11px]">
                      Web browsers block automatic PWA setup and service worker registrations when applications are loaded in an iframe. To download and install this on your Android home screen as a high-performance standalone app, you must launch it in its own browser tab.
                    </p>
                    <div className="pt-1">
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-md shadow-amber-500/15"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Launch in Standalone Tab</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <>
                    {deferredPrompt ? (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs flex flex-col gap-3">
                        <div>
                          <p className="font-bold text-emerald-400">⚡ 1-Tap Installation Active</p>
                          <p className="text-zinc-300 mt-1 leading-relaxed text-[11px]">
                            Your browser supports instant automated setup. Click below to launch the prompt in your secure system UI.
                          </p>
                        </div>
                        <button
                          onClick={triggerBrowserInstall}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg text-xs transition-colors cursor-pointer shadow-md shadow-emerald-500/15"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download & Install Standalone</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl text-[11px] text-zinc-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>Service Worker Engine: <strong className="text-emerald-400 ml-1">{pwaStatus === "active" ? "Synced & Active" : "Supported"}</strong></span>
                      </div>
                    )}
                  </>
                )}

                {/* Step-by-Step Device Setup Guide */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest font-mono border-b border-zinc-800/80 pb-1 w-fit mb-2">Android (Chrome setup)</h4>
                  <ol className="space-y-2.5 text-xs text-zinc-400 list-decimal pl-4 leading-relaxed">
                    <li className="pl-1">
                      <span className="text-zinc-200">Open in Mobile Web:</span> Access this link on your Android device (e.g. Chrome app).
                    </li>
                    <li className="pl-1">
                      <span className="text-zinc-200">Tap Options Menu:</span> Tap the three vertical dots <strong className="text-zinc-200">⋮</strong> on top-right of your Chrome window.
                    </li>
                    <li className="pl-1">
                      <span className="text-zinc-200">Install Standalone:</span> Select <strong className="text-emerald-400">"Add to Home screen"</strong> or <strong className="text-emerald-400">"Install App"</strong>.
                    </li>
                    <li className="pl-1">
                      <span className="text-zinc-200">Launch Smoothly:</span> Once added, open the <strong className="text-zinc-200">SMC Forex Scanner</strong> with full offline support, high-definition launcher icon, and zero web controls bar!
                    </li>
                  </ol>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-widest font-mono border-b border-zinc-800/80 pb-1 w-fit mb-2">Apple iOS (Safari setup)</h4>
                  <ol className="space-y-2.5 text-xs text-zinc-400 list-decimal pl-4 leading-relaxed">
                    <li className="pl-1">
                      <span className="text-zinc-200">Open in Safari:</span> Ensure you load this app inside Apple Safari.
                    </li>
                    <li className="pl-1">
                      <span className="text-zinc-200">Share Menu:</span> Click the native iOS Share icon (square with arrow pointing up).
                    </li>
                    <li className="pl-1">
                      <span className="text-zinc-200">Home Screen Launcher:</span> Click the <strong className="text-emerald-400">"Add to Home Screen"</strong> action button list.
                    </li>
                  </ol>
                </div>

                {/* Copy App Link Action */}
                <div className="pt-3 border-t border-zinc-900 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Direct Device Link:</span>
                    {copiedText === "copied_pwa_url" && <span className="text-emerald-400 font-mono">Saved to clipboard!</span>}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={window.location.href}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-zinc-400 focus:outline-none focus:border-emerald-500/50"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setCopiedText("copied_pwa_url");
                        setTimeout(() => setCopiedText(null), 2500);
                      }}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Dismiss controls footer */}
              <div className="mt-6 pt-4 border-t border-zinc-900 flex justify-end">
                <button
                  onClick={() => setShowInstallModal(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Done, Go Back
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Simple Helper for Lucide icons inside components if needed
function Info(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
