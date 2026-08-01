import React, { useState, useEffect } from "react";
import { Activity, RotateCw, Copy, AlertCircle } from "lucide-react";
import { useScannerState } from "./hooks/useScannerState";
import { WatchlistTab } from "./components/tabs/WatchlistTab";
import { SignalsTab } from "./components/tabs/SignalsTab";
import { ActiveTradesTab } from "./components/tabs/ActiveTradesTab";
import { NewsTab } from "./components/tabs/NewsTab";
import { RulesTab } from "./components/tabs/RulesTab";
import { PerformanceTab } from "./components/tabs/PerformanceTab";
import { DeepDivePanel } from "./components/DeepDivePanel";
import { PerformanceDetail } from "./components/PerformanceDetail";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

import { PushNotifications } from '@capacitor/push-notifications';

async function setupPush() {
  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted') {
      console.log('Push permissions not granted');
      return;
    }
    await PushNotifications.register();
    PushNotifications.addListener('registration', (token) => {
      console.log('Push token registered:', token.value);
      fetch(`${API_BASE_URL}/api/device/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.value })
      }).catch(err => console.error('Device register failed:', err));
    });
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Notification received:', notification);
    });
  } catch (err) {
    console.error('Error in setupPush:', err);
  }
}

export default function App() {
  const s = useScannerState();

  useEffect(() => {
    setupPush();
  }, []);

  const [activeTab, setActiveTab] = useState<"watchlist" | "signals" | "active_trades" | "news" | "rules" | "performance">("watchlist");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Tab-based polling
  useEffect(() => {
    if (activeTab === "performance") s.handleFetchPerformance();
    if (activeTab === "signals") s.handleFetchSignals();
    const interval = setInterval(() => {
      s.handleFetchSignals();
      if (activeTab === "signals") s.handleFetchSignals();
    }, 15000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const activeResult = (s.scanData && Array.isArray(s.scanData.results)) ? s.scanData.results.find((r: any) => r.pair === s.selectedPair) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* HEADER */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400"><Activity className="w-6 h-6 animate-pulse" /></div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight text-white flex items-center gap-2">SMC Forex Scanner<span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">v1.0</span></h1>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">Smart Money Concepts & ICT System</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs font-mono">
            {s.scanData?.session ? (
              <div className="px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center gap-2.5">
                <span>GMT: <span className="text-white font-medium">{s.scanData.session.currentGmt}</span></span><span className="text-zinc-600">|</span>
                <span>Session: <span className={`font-semibold ${s.scanData.session.canTrade ? "text-emerald-400" : "text-amber-400"}`}>{s.scanData.session.session}</span></span>
                {s.scanData.session.mondayReduced && <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px]">Monday Reduced</span>}
              </div>
            ) : <div className="w-48 h-8 rounded-xl bg-zinc-800/40 animate-pulse border border-zinc-800" />}
            <button onClick={() => s.setAutoScanEnabled(!s.autoScanEnabled)} className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border cursor-pointer whitespace-nowrap ${s.autoScanEnabled ? "bg-zinc-900 border-emerald-500/30 text-emerald-400 font-bold" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.autoScanEnabled ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} /><span>Auto-refresh {s.autoScanEnabled ? "ON" : "OFF"}</span>
            </button>
            <button onClick={() => s.handleScan(true)} disabled={s.loading} className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${s.loading ? "bg-zinc-800 text-zinc-500 border border-zinc-750 cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold hover:scale-[1.02] shadow-lg shadow-emerald-500/10 active:scale-[0.98]"}`}>
              <RotateCw className={`w-3.5 h-3.5 ${s.loading ? "animate-spin" : ""}`} />{s.loading ? "Scanning..." : "Scan Market"}
            </button>
          </div>
        </div>
      </header>

      {s.error && (<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4"><div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{s.error}</span></div></div>)}

      {s.scanData && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4"><span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Total Pairs Watched</span><span className="text-2xl font-bold font-display mt-1 text-white">11</span></div>
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4"><span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Market Status</span><span className={`text-lg font-bold mt-1 uppercase ${s.scanData.session.canTrade ? "text-emerald-400" : "text-amber-400"}`}>{s.scanData.session.canTrade ? "Active / Open" : "Outside Kill Zones"}</span></div>
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4"><span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Active Setup Trades</span><span className="text-2xl font-bold font-display mt-1 text-emerald-400">{s.scanData.passed_count}</span></div>
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4"><span className="text-zinc-500 text-[11px] font-mono uppercase tracking-widest">Last Scanned</span><span className="text-sm font-mono mt-1 text-zinc-300">{s.lastScanTime || "Never"}</span></div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: TABS */}
          <section className="lg:col-span-5 flex flex-col gap-4">
            {/* Tab nav */}
            <div className="flex border-b border-zinc-800 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800">
              {([["watchlist", "Watchlist"], ["signals", "Signals Log"], ["active_trades", "Active Track"], ["news", "Calendar News"], ["rules", "SMC Locked Rules"], ["performance", "Performance"]] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`py-2 px-3 text-xs font-semibold tracking-wider font-display border-b-2 transition-all cursor-pointer whitespace-nowrap ${activeTab === tab ? "border-emerald-500 text-emerald-400 font-bold" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>{label}{tab === "signals" && s.signals.length > 0 && <span className="px-1.5 py-0.2 rounded-full bg-emerald-550/20 text-emerald-400 font-mono text-[9px] font-bold animate-pulse ml-1">{s.signals.length}</span>}{tab === "active_trades" && s.activeTrades.length > 0 && <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[9px] font-bold ml-1">{s.activeTrades.length}</span>}</button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === "watchlist" && <WatchlistTab scanData={s.scanData} loading={s.loading} selectedPair={s.selectedPair} setSelectedPair={s.setSelectedPair} />}
            {activeTab === "signals" && <SignalsTab signals={s.signals} signalsLoading={s.signalsLoading} scannerStatus={s.scannerStatus} />}
            {activeTab === "active_trades" && <ActiveTradesTab activeTrades={s.activeTrades} scanData={s.scanData} setActiveTrades={s.setActiveTrades} />}
            {activeTab === "news" && <NewsTab newsData={s.newsData} newsLoading={s.newsLoading} onRefresh={s.handleFetchNews} />}
            {activeTab === "rules" && <RulesTab />}
            {activeTab === "performance" && <PerformanceTab performanceStats={s.performanceStats} perfLoading={s.perfLoading} onRefresh={s.handleFetchPerformance} />}
          </section>

          {/* RIGHT: DEEP DIVE / PERFORMANCE DETAIL */}
          <section className="lg:col-span-7">
            {activeTab === "performance" ? (
              <PerformanceDetail performanceStats={s.performanceStats} perfLoading={s.perfLoading} onRefresh={s.handleFetchPerformance} />
            ) : (
              <DeepDivePanel activeResult={activeResult} scanData={s.scanData} chartData={s.chartData} chartTimeframe={s.chartTimeframe} setChartTimeframe={s.setChartTimeframe} chartLoading={s.chartLoading} copiedText={copiedText} handleCopy={handleCopy} activeTrades={s.activeTrades} setActiveTrades={s.setActiveTrades} onFetchPerformance={s.handleFetchPerformance} />
            )}
          </section>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800 bg-zinc-950 py-8 mt-12 text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 SMC Forex Scanner. Built on top of Capital.com Demo API Engine.</p>
          <div className="flex gap-4"><span className="text-zinc-600">|</span><span>Version 1.0 (Live 2026-06-15)</span><span className="text-zinc-600">|</span><span className="text-amber-500/80">Analysis is strictly for educational & support targets</span></div>
        </div>
      </footer>
    </div>
  );
}
