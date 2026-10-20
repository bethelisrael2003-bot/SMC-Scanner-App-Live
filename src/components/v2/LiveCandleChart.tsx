import React, { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, ColorType, LineStyle } from "lightweight-charts";

interface LiveCandleChartProps {
  pair: string;
  timeframe?: "M15" | "H1" | "H4";
  onTimeframeChange?: (tf: "M15" | "H1" | "H4") => void;
  entryPrice?: number | null;
  slPrice?: number | null;
  tpPrice?: number | null;
  sweepPrice?: number | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

export function LiveCandleChart({
  pair,
  timeframe = "M15",
  onTimeframeChange,
  entryPrice,
  slPrice,
  tpPrice,
  sweepPrice,
}: LiveCandleChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [candlesLoading, setCandlesLoading] = useState(true);
  const [candleCount, setCandleCount] = useState(0);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart instance
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const width = container.clientWidth || 600;
    const height = 300;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0B0E14" },
        textColor: "#71717A",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      grid: {
        vertLines: { color: "rgba(39, 39, 42, 0.4)", style: LineStyle.Dotted },
        horzLines: { color: "rgba(39, 39, 42, 0.4)", style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: "#10B981", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#10B981" },
        horzLine: { color: "#10B981", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#10B981" },
      },
      timeScale: {
        borderColor: "rgba(39, 39, 42, 0.8)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(39, 39, 42, 0.8)",
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#F43F5E",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#F43F5E",
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    // Handle responsive resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Fetch candles when pair or timeframe changes
  useEffect(() => {
    let isCancelled = false;
    setCandlesLoading(true);

    async function fetchCandleData() {
      try {
        const tfParam = timeframe === "H1" ? "H1" : timeframe === "H4" ? "H4" : "M15";
        const encodedPair = encodeURIComponent(pair);
        const res = await fetch(`${API_BASE_URL}/api/candles/${encodedPair}/${tfParam}`);
        if (!res.ok) throw new Error("Candle fetch failed");
        const data = await res.json();

        if (!isCancelled && Array.isArray(data) && data.length > 0 && seriesRef.current) {
          // Format into lightweight-charts candlestick format
          const formatted = data
            .map((c: any) => ({
              time: Number(c.time),
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close),
            }))
            .sort((a, b) => a.time - b.time);

          // Deduplicate timestamps
          const unique: any[] = [];
          const seen = new Set();
          for (const item of formatted) {
            if (!seen.has(item.time)) {
              seen.add(item.time);
              unique.push(item);
            }
          }

          seriesRef.current.setData(unique);
          setCandleCount(unique.length);
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }

          // Price Lines for SMC levels
          if (entryPrice && entryPrice > 0) {
            seriesRef.current.createPriceLine({
              price: entryPrice,
              color: "#38BDF8",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "ENTRY",
            });
          }
          if (slPrice && slPrice > 0) {
            seriesRef.current.createPriceLine({
              price: slPrice,
              color: "#F43F5E",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "SL",
            });
          }
          if (tpPrice && tpPrice > 0) {
            seriesRef.current.createPriceLine({
              price: tpPrice,
              color: "#10B981",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "TP",
            });
          }
          if (sweepPrice && sweepPrice > 0) {
            seriesRef.current.createPriceLine({
              price: sweepPrice,
              color: "#F59E0B",
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: "SWEEP",
            });
          }
        }
      } catch (err) {
        console.error("[CANDLE CHART] Error loading candles:", err);
      } finally {
        if (!isCancelled) setCandlesLoading(false);
      }
    }

    fetchCandleData();
    const iv = setInterval(fetchCandleData, 15000); // 15s refresh for live candle updates

    return () => {
      isCancelled = true;
      clearInterval(iv);
    };
  }, [pair, timeframe, entryPrice, slPrice, tpPrice, sweepPrice]);

  return (
    <div className="w-full bg-[#0B0E14] rounded-2xl border border-zinc-800/80 p-3 sm:p-4 space-y-3 font-mono">
      {/* Chart Header Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-xs sm:text-sm">{pair}</span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">TradingView Core</span>
          {candlesLoading && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          )}
        </div>

        {/* Timeframe Selector Pills */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          {(["M15", "H1", "H4"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange && onTimeframeChange(tf)}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                timeframe === tf
                  ? "bg-zinc-800 text-emerald-400 border border-zinc-700/60 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div className="relative w-full h-[300px] overflow-hidden rounded-xl">
        <div ref={chartContainerRef} className="w-full h-full" />
        {candlesLoading && candleCount === 0 && (
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xs flex items-center justify-center text-xs text-zinc-400 gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin"></span>
            <span>Streaming Live Price Action...</span>
          </div>
        )}
      </div>

      {/* Chart Bottom Legend */}
      <div className="flex flex-wrap items-center justify-between text-[10px] text-zinc-400 pt-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Bull Candle
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span> Bear Candle
          </span>
          {sweepPrice && (
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-0.5 bg-amber-400"></span> Sweep Level ({sweepPrice})
            </span>
          )}
        </div>
        <span>{candleCount} Live Bars Loaded</span>
      </div>
    </div>
  );
}
