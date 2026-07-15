import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export interface ScannerState {
  // Scan data
  scanData: { results: any[]; conflicts: any[]; session: any; passed_count?: number } | null;
  loading: boolean;
  error: string | null;
  lastScanTime: string;
  autoScanEnabled: boolean;
  // Signals
  signals: any[];
  signalsLoading: boolean;
  // Scanner status
  scannerStatus: { lastScanTime: string; isScanning: boolean; message: string; pairsChecked: any[] } | null;
  // News
  newsData: any[];
  newsLoading: boolean;
  // Performance
  performanceStats: any;
  perfLoading: boolean;
  // Chart
  selectedPair: string;
  chartTimeframe: string;
  chartData: any[];
  chartLoading: boolean;
  // Active trades
  activeTrades: any[];
  setActiveTrades: Dispatch<SetStateAction<any[]>>;
  setSelectedPair: Dispatch<SetStateAction<string>>;
  setChartTimeframe: Dispatch<SetStateAction<string>>;
  setAutoScanEnabled: Dispatch<SetStateAction<boolean>>;
  setNewsFilter: Dispatch<SetStateAction<"high_medium" | "high" | "all">>;
  // Actions
  handleScan: (force?: boolean) => Promise<void>;
  handleFetchNews: () => Promise<void>;
  handleFetchPerformance: () => Promise<void>;
  handleFetchSignals: () => Promise<void>;
}

/**
 * Custom hook that encapsulates ALL scanner state management:
 * 25 useState values, 7 useEffects, and all data-fetching handlers.
 * Lifted out of App() to keep the component tree clean and testable.
 */
export function useScannerState(): ScannerState {
  const [scanData, setScanData] = useState<any>(null);
  const [newsData, setNewsData] = useState<any[]>([]);
  const [, setNewsFilter] = useState<"high_medium" | "high" | "all">("high_medium");
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [chartTimeframe, setChartTimeframe] = useState<string>("H1");
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [newsLoading, setNewsLoading] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<any>(null);
  const [performanceStats, setPerformanceStats] = useState<any>(null);
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

  const handleFetchSignals = useCallback(async () => {
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
  }, []);

  const handleFetchScannerStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/scanner/status`);
      if (!res.ok) throw new Error("HTTP error retrieving scanner status");
      const data = await res.json();
      setScannerStatus(data);
    } catch (err) {
      console.error("Failed to fetch scanner status:", err);
    }
  }, []);

  const handleScan = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      let url = force ? `${API_BASE_URL}/api/scan?force=true` : `${API_BASE_URL}/api/scan`;
      let res = await fetch(url);
      if (!res.ok && force) {
        url = `${API_BASE_URL}/api/scan`;
        res = await fetch(url);
      }
      if (!res.ok) throw new Error("HTTP error scanning the market");
      const data = await res.json();
      setScanData(data);
      setLastScanTime(new Date().toLocaleTimeString());
      handleFetchSignals();
      handleFetchScannerStatus();
      if (data.results && data.results.length > 0) {
        setSelectedPair((prev) => {
          const found = data.results.find((r: any) => r.pair === prev);
          return found ? prev : data.results[0].pair;
        });
      }
    } catch (err: any) {
      console.error(err);
      if (force) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/scan`);
          if (res.ok) {
            const data = await res.json();
            setScanData(data);
            setLastScanTime(new Date().toLocaleTimeString());
            handleFetchSignals();
            handleFetchScannerStatus();
            return;
          }
        } catch (e) { console.error("Fallback failed:", e); }
      }
      setError("Market scanner failed to connect. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  }, [handleFetchSignals, handleFetchScannerStatus]);

  const handleFetchNews = useCallback(async () => {
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
  }, []);

  const handleFetchPerformance = useCallback(async () => {
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
  }, []);

  const handleFetchCandles = useCallback(async () => {
    if (!selectedPair) return;
    setChartLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/candles/${encodeURIComponent(selectedPair)}/${chartTimeframe}`);
      if (!res.ok) throw new Error("Failed to fetch candles");
      const data = await res.json();
      setChartData(data);
    } catch (err) {
      console.error(err);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [selectedPair, chartTimeframe]);

  // Auto scan on load
  useEffect(() => {
    handleScan();
    handleFetchNews();
    handleFetchPerformance();
    handleFetchSignals();
    handleFetchScannerStatus();
  }, []);

  // Auto-scan interval (45s)
  useEffect(() => {
    if (!autoScanEnabled) return;
    const interval = setInterval(() => { handleScan(); }, 45000);
    return () => clearInterval(interval);
  }, [autoScanEnabled, handleScan]);

  // Chart data fetch when pair/timeframe changes
  useEffect(() => {
    handleFetchCandles();
  }, [handleFetchCandles]);

  return {
    scanData, loading, error, lastScanTime, autoScanEnabled,
    signals, signalsLoading, scannerStatus,
    newsData, newsLoading,
    performanceStats, perfLoading,
    selectedPair, chartTimeframe, chartData, chartLoading,
    activeTrades, setActiveTrades,
    setSelectedPair, setChartTimeframe, setAutoScanEnabled, setNewsFilter,
    handleScan, handleFetchNews, handleFetchPerformance, handleFetchSignals,
  };
}
