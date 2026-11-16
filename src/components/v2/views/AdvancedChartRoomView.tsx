/**
 * AdvancedChartRoomView.tsx
 * APEX Phase C (Part 7): Dedicated Full-Screen Advanced Chart Room
 *
 * Operational & Technical Specifications:
 * - Engine: TradingView Lightweight Charts v5.2.1 Core Engine (standalone Canvas renderer).
 * - Datafeed: Capital.com Demo CFD Candlestick Feed via `/api/candles/:pair/:timeframe`.
 * - Verified Supported Timeframes: M1 (1min), M15 (15min), H1 (1h), H4 (4h), D1 (1day).
 * - Explicit Transparency: M5 and M30 are visibly flagged as unsupported by the Capital.com CFD backend feed.
 * - Technical Overlays: EMA 20, EMA 50, SMA 200, Bollinger Bands (20, 2), and SMC Key Order Structure Levels.
 * - Advanced Observational Drawing Layer:
 *   - Horizontal Support/Resistance lines (at live price, crosshair, or custom level)
 *   - Trendlines (institutional swing anchors or manual points)
 *   - Multiple independently identifiable drawing objects with selection, inspection, deletion, and clear-all
 * - Interactive Crosshair Legend: Dynamic Date/Time, OHLC, points change, and percentage spread inspection.
 * - Navigation: Integrated with BackCoordinator (Hardware Android Back & Header Back priority 2).
 * - Safety Guarantee: Purely observational workspace. 0 broker mutation controls or direct execution buttons.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  Activity,
  Maximize2,
  Minimize2,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Sliders,
  Eye,
  EyeOff,
  Layers,
  Radio,
  Info,
  ShieldCheck,
  AlertCircle,
  Plus,
  Trash2,
  Compass,
  LineChart,
  PenTool,
  Check,
  X,
  Target,
} from "lucide-react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import { Card, Badge, Button, formatPairPrice, formatUSD } from "../ui";
import { backCoordinator } from "../navigation/BackCoordinator";

export type SupportedTimeframe = "M1" | "M15" | "H1" | "H4" | "D1";

export type DrawingType = "horizontal" | "trendline";

export interface ChartDrawing {
  id: string;
  pair: string; // Strictly scoped to specific instrument (e.g. EUR/USD)
  type: DrawingType;
  label: string;
  color: string;
  price?: number; // For horizontal lines
  t1?: number; // Trendline start timestamp
  p1?: number; // Trendline start price
  t2?: number; // Trendline end timestamp
  p2?: number; // Trendline end price
  createdAt: number;
}

export interface AdvancedChartRoomProps {
  pair: string;
  initialTimeframe?: SupportedTimeframe;
  confluenceRecord?: any;
  capitalStatus?: any;
  spreadArmorData?: any;
  onBack: () => void;
  onOpenInstrumentWorkstation?: (pair: string) => void;
}

const API_BASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "https://smc-scanner-backend.onrender.com";

const SUPPORTED_PAIRS = [
  { pair: "EUR/USD", name: "Euro / US Dollar", category: "Forex Major" },
  { pair: "GBP/JPY", name: "British Pound / Yen", category: "Forex Cross" },
  { pair: "XAU/USD", name: "Gold Spot CFD", category: "Precious Metal" },
  { pair: "XAG/USD", name: "Silver Spot CFD", category: "Precious Metal" },
];

const TIMEFRAMES: { id: SupportedTimeframe; label: string; desc: string; supported: boolean }[] = [
  { id: "M1", label: "M1", desc: "1 Minute", supported: true },
  { id: "M15", label: "M15", desc: "15 Minutes", supported: true },
  { id: "H1", label: "H1", desc: "1 Hour", supported: true },
  { id: "H4", label: "H4", desc: "4 Hours", supported: true },
  { id: "D1", label: "D1", desc: "Daily", supported: true },
];

const DRAWING_COLORS = [
  { name: "Cyan", hex: "#06B6D4" },
  { name: "Emerald", hex: "#10B981" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Rose", hex: "#F43F5E" },
  { name: "Purple", hex: "#A855F7" },
];

// ── Pure Math Indicator Calculations ─────────────────────────────────────────

export function calculateEMA(data: { time: number; close: number }[], period: number) {
  if (!data || data.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: number; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: Number(ema.toFixed(5)) });

  for (let i = period; i < data.length; i++) {
    ema = (data[i].close - ema) * k + ema;
    result.push({ time: data[i].time, value: Number(ema.toFixed(5)) });
  }
  return result;
}

export function calculateSMA(data: { time: number; close: number }[], period: number) {
  if (!data || data.length < period) return [];
  const result: { time: number; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  result.push({ time: data[period - 1].time, value: Number((sum / period).toFixed(5)) });

  for (let i = period; i < data.length; i++) {
    sum += data[i].close - data[i - period].close;
    result.push({ time: data[i].time, value: Number((sum / period).toFixed(5)) });
  }
  return result;
}

export function calculateBollingerBands(data: { time: number; close: number }[], period = 20, multiplier = 2) {
  if (!data || data.length < period) return { upper: [], middle: [], lower: [] };
  const upper: { time: number; value: number }[] = [];
  const middle: { time: number; value: number }[] = [];
  const lower: { time: number; value: number }[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const sma = slice.reduce((acc, c) => acc + c.close, 0) / period;
    const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    const time = data[i].time;

    middle.push({ time, value: Number(sma.toFixed(5)) });
    upper.push({ time, value: Number((sma + multiplier * stdDev).toFixed(5)) });
    lower.push({ time, value: Number((sma - multiplier * stdDev).toFixed(5)) });
  }
  return { upper, middle, lower };
}

export const AdvancedChartRoomView: React.FC<AdvancedChartRoomProps> = ({
  pair: initialPair,
  initialTimeframe = "H1",
  confluenceRecord,
  capitalStatus,
  spreadArmorData,
  onBack,
  onOpenInstrumentWorkstation,
}) => {
  const [activePair, setActivePair] = useState<string>(initialPair || "EUR/USD");
  const [timeframe, setTimeframe] = useState<SupportedTimeframe>(initialTimeframe);
  const [candlesLoading, setCandlesLoading] = useState<boolean>(true);
  const [candleCount, setCandleCount] = useState<number>(0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Technical Indicator Overlays State
  const [showEma20, setShowEma20] = useState<boolean>(true);
  const [showEma50, setShowEma50] = useState<boolean>(false);
  const [showSma200, setShowSma200] = useState<boolean>(false);
  const [showBollinger, setShowBollinger] = useState<boolean>(false);
  const [showSmcLevels, setShowSmcLevels] = useState<boolean>(true);
  const [showExtremes, setShowExtremes] = useState<boolean>(true);

  // Advanced Observational Drawing Layer State (Session-Preserved & Instrument-Scoped)
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() => {
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        const saved = sessionStorage.getItem("apex_chart_drawings");
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [showDrawingTools, setShowDrawingTools] = useState<boolean>(false);
  const [activeDrawingMode, setActiveDrawingMode] = useState<DrawingType | null>(null);

  // Drawing Form Inputs
  const [newHorizPrice, setNewHorizPrice] = useState<string>("");
  const [newDrawingLabel, setNewDrawingLabel] = useState<string>("Support Line");
  const [newDrawingColor, setNewDrawingColor] = useState<string>("#06B6D4");

  // Crosshair Hover Inspection State
  const [hoverData, setHoverData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    changePct: number;
  } | null>(null);

  // Chart Canvas Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const ema20SeriesRef = useRef<any>(null);
  const ema50SeriesRef = useRef<any>(null);
  const sma200SeriesRef = useRef<any>(null);
  const bbUpperSeriesRef = useRef<any>(null);
  const bbMiddleSeriesRef = useRef<any>(null);
  const bbLowerSeriesRef = useRef<any>(null);
  const smcPriceLinesRef = useRef<any[]>([]);

  // Maps for managing user drawing objects on chart canvas
  const userPriceLinesMapRef = useRef<Map<string, any>>(new Map());
  const userTrendlineSeriesMapRef = useRef<Map<string, any>>(new Map());

  // Cached raw candles
  const rawCandlesRef = useRef<{ time: number; open: number; high: number; low: number; close: number }[]>([]);

  // Telemetry derived from current pair
  const currentPairProfile = useMemo(() => {
    return SUPPORTED_PAIRS.find((p) => p.pair === activePair) || SUPPORTED_PAIRS[0];
  }, [activePair]);

  const liveData = confluenceRecord?.livePrice;
  const isBull = confluenceRecord?.checks?.[0]?.includes("BULLISH");
  const armorItem = (spreadArmorData?.pairs || []).find((p: any) => p.pair === activePair);
  const activePosition = (capitalStatus?.openPositions || []).find((p: any) => p.pair === activePair);

  // ── 1. Initialize TradingView Lightweight Chart ───────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const width = container.clientWidth || 380;
    const height = isExpanded ? 580 : 420;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#080B10" },
        textColor: "#94A3B8",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.4)", style: LineStyle.Dotted },
        horzLines: { color: "rgba(30, 41, 59, 0.4)", style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#38BDF8",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0284C7",
        },
        horzLine: {
          color: "#38BDF8",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0284C7",
        },
      },
      timeScale: {
        borderColor: "rgba(30, 41, 59, 0.8)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(30, 41, 59, 0.8)",
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
    });

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#F43F5E",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#F43F5E",
    });

    // EMA 20 (Cyan)
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#06B6D4",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "EMA 20",
    });

    // EMA 50 (Amber)
    const ema50Series = chart.addSeries(LineSeries, {
      color: "#F59E0B",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "EMA 50",
    });

    // SMA 200 (Purple)
    const sma200Series = chart.addSeries(LineSeries, {
      color: "#A855F7",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: "SMA 200",
    });

    // Bollinger Bands (Blue / Slate)
    const bbUpper = chart.addSeries(LineSeries, {
      color: "#38BDF8",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "BB Upper",
    });
    const bbMiddle = chart.addSeries(LineSeries, {
      color: "#64748B",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      title: "BB Mid",
    });
    const bbLower = chart.addSeries(LineSeries, {
      color: "#38BDF8",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: "BB Lower",
    });

    // Crosshair inspection listener
    chart.subscribeCrosshairMove((param: any) => {
      if (!param || !param.time || !param.seriesData || !param.seriesData.get(candleSeries)) {
        setHoverData(null);
        return;
      }

      const bar: any = param.seriesData.get(candleSeries);
      if (bar) {
        const change = bar.close - bar.open;
        const changePct = bar.open > 0 ? (change / bar.open) * 100 : 0;
        const dateObj = new Date(Number(param.time) * 1000);
        const timeStr = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, "0")}-${String(dateObj.getUTCDate()).padStart(2, "0")} ${String(dateObj.getUTCHours()).padStart(2, "0")}:${String(dateObj.getUTCMinutes()).padStart(2, "0")} UTC`;

        setHoverData({
          time: timeStr,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          change,
          changePct,
        });
      }
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    sma200SeriesRef.current = sma200Series;
    bbUpperSeriesRef.current = bbUpper;
    bbMiddleSeriesRef.current = bbMiddle;
    bbLowerSeriesRef.current = bbLower;

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
  }, [isExpanded]);

  // ── 2. Fetch Candle Datafeed from /api/candles ─────────────────────────────
  const loadCandles = useCallback(async () => {
    let isCancelled = false;
    setCandlesLoading(true);

    try {
      const tfParam = timeframe === "D1" ? "D1" : timeframe === "H4" ? "H4" : timeframe === "H1" ? "H1" : timeframe === "M1" ? "1min" : "M15";
      const encodedPair = encodeURIComponent(activePair);
      const res = await fetch(`${API_BASE_URL}/api/candles/${encodedPair}/${tfParam}`);
      if (!res.ok) throw new Error("Feed fetch error");
      const data = await res.json();

      if (!isCancelled && Array.isArray(data) && data.length > 0 && candleSeriesRef.current) {
        const formatted = data
          .map((c: any) => ({
            time: Number(c.time),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          }))
          .sort((a, b) => a.time - b.time);

        // Deduplicate
        const unique: any[] = [];
        const seen = new Set();
        for (const item of formatted) {
          if (!seen.has(item.time)) {
            seen.add(item.time);
            unique.push(item);
          }
        }

        rawCandlesRef.current = unique;
        candleSeriesRef.current.setData(unique);
        setCandleCount(unique.length);

        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }

        // Apply Technical Indicators Overlays & Drawings
        updateIndicators(unique);
        renderUserDrawings();
      }
    } catch (err) {
      console.error("[CHART ROOM] Failed to retrieve candlestick datafeed:", err);
    } finally {
      if (!isCancelled) setCandlesLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [activePair, timeframe]);

  // ── 3. Update Indicator Series ─────────────────────────────────────────────
  const updateIndicators = useCallback((candles: any[]) => {
    if (!candles || candles.length === 0) return;

    // EMA 20
    if (ema20SeriesRef.current) {
      if (showEma20) {
        const ema20 = calculateEMA(candles, 20);
        ema20SeriesRef.current.setData(ema20);
      } else {
        ema20SeriesRef.current.setData([]);
      }
    }

    // EMA 50
    if (ema50SeriesRef.current) {
      if (showEma50) {
        const ema50 = calculateEMA(candles, 50);
        ema50SeriesRef.current.setData(ema50);
      } else {
        ema50SeriesRef.current.setData([]);
      }
    }

    // SMA 200
    if (sma200SeriesRef.current) {
      if (showSma200) {
        const sma200 = calculateSMA(candles, 200);
        sma200SeriesRef.current.setData(sma200);
      } else {
        sma200SeriesRef.current.setData([]);
      }
    }

    // Bollinger Bands
    if (bbUpperSeriesRef.current && bbMiddleSeriesRef.current && bbLowerSeriesRef.current) {
      if (showBollinger) {
        const bb = calculateBollingerBands(candles, 20, 2);
        bbUpperSeriesRef.current.setData(bb.upper);
        bbMiddleSeriesRef.current.setData(bb.middle);
        bbLowerSeriesRef.current.setData(bb.lower);
      } else {
        bbUpperSeriesRef.current.setData([]);
        bbMiddleSeriesRef.current.setData([]);
        bbLowerSeriesRef.current.setData([]);
      }
    }

    // Clear previous automated SMC PriceLines
    if (candleSeriesRef.current) {
      for (const line of smcPriceLinesRef.current) {
        try {
          candleSeriesRef.current.removePriceLine(line);
        } catch {
          // ignore cleanup errors
        }
      }
      smcPriceLinesRef.current = [];

      // SMC Order Structure Price Lines
      if (showSmcLevels && confluenceRecord) {
        if (confluenceRecord.entryPrice && confluenceRecord.entryPrice > 0) {
          const l = candleSeriesRef.current.createPriceLine({
            price: confluenceRecord.entryPrice,
            color: "#38BDF8",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "SMC ENTRY",
          });
          smcPriceLinesRef.current.push(l);
        }
        if (confluenceRecord.sl && confluenceRecord.sl > 0) {
          const l = candleSeriesRef.current.createPriceLine({
            price: confluenceRecord.sl,
            color: "#F43F5E",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "STOP LOSS",
          });
          smcPriceLinesRef.current.push(l);
        }
        if (confluenceRecord.tp1 && confluenceRecord.tp1 > 0) {
          const l = candleSeriesRef.current.createPriceLine({
            price: confluenceRecord.tp1,
            color: "#10B981",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "TAKE PROFIT",
          });
          smcPriceLinesRef.current.push(l);
        }
      }

      // 20-Bar Structural Extremes Lines
      if (showExtremes && confluenceRecord) {
        if (confluenceRecord.m15High && confluenceRecord.m15High > 0) {
          const l = candleSeriesRef.current.createPriceLine({
            price: confluenceRecord.m15High,
            color: "#F59E0B",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: "20-BAR HIGH",
          });
          smcPriceLinesRef.current.push(l);
        }
        if (confluenceRecord.m15Low && confluenceRecord.m15Low > 0) {
          const l = candleSeriesRef.current.createPriceLine({
            price: confluenceRecord.m15Low,
            color: "#F59E0B",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: "20-BAR LOW",
          });
          smcPriceLinesRef.current.push(l);
        }
      }
    }
  }, [showEma20, showEma50, showSma200, showBollinger, showSmcLevels, showExtremes, confluenceRecord]);

  // ── 4. Render User Drawing Objects on Canvas ───────────────────────────────
  const renderUserDrawings = useCallback(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;

    // Filter drawings strictly for active instrument
    const visibleDrawings = drawings.filter((d) => d.pair === activePair);
    const visibleDrawingIds = new Set(visibleDrawings.map((d) => d.id));

    // 1. Clean up removed or off-pair horizontal price lines
    userPriceLinesMapRef.current.forEach((priceLine, id) => {
      if (!visibleDrawingIds.has(id)) {
        try {
          candleSeriesRef.current.removePriceLine(priceLine);
        } catch {
          // ignore
        }
        userPriceLinesMapRef.current.delete(id);
      }
    });

    // 2. Clean up removed or off-pair trendline series
    userTrendlineSeriesMapRef.current.forEach((series, id) => {
      if (!visibleDrawingIds.has(id)) {
        try {
          chartRef.current.removeSeries(series);
        } catch {
          // ignore
        }
        userTrendlineSeriesMapRef.current.delete(id);
      }
    });

    // 3. Render visible drawings for the active pair
    for (const d of visibleDrawings) {
      const isSelected = selectedDrawingId === d.id;

      if (d.type === "horizontal" && d.price && d.price > 0) {
        // Re-create or update price line
        if (userPriceLinesMapRef.current.has(d.id)) {
          try {
            candleSeriesRef.current.removePriceLine(userPriceLinesMapRef.current.get(d.id));
          } catch {
            // ignore
          }
        }
        const pl = candleSeriesRef.current.createPriceLine({
          price: d.price,
          color: d.color,
          lineWidth: isSelected ? 3 : 2,
          lineStyle: isSelected ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${d.label.toUpperCase()}${isSelected ? " [ACTIVE]" : ""}`,
        });
        userPriceLinesMapRef.current.set(d.id, pl);
      }

      if (d.type === "trendline" && d.t1 && d.p1 && d.t2 && d.p2) {
        let tlSeries = userTrendlineSeriesMapRef.current.get(d.id);
        if (!tlSeries) {
          tlSeries = chartRef.current.addSeries(LineSeries, {
            color: d.color,
            lineWidth: isSelected ? 3 : 2,
            lineStyle: isSelected ? LineStyle.Solid : LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
            title: d.label,
          });
          userTrendlineSeriesMapRef.current.set(d.id, tlSeries);
        } else {
          tlSeries.applyOptions({
            color: d.color,
            lineWidth: isSelected ? 3 : 2,
            lineStyle: isSelected ? LineStyle.Solid : LineStyle.Dashed,
          });
        }

        // Interpolate across raw candles
        const raw = rawCandlesRef.current;
        const minTime = Math.min(d.t1, d.t2);
        const maxTime = Math.max(d.t1, d.t2);
        const inBetween = raw.filter((c) => c.time >= minTime && c.time <= maxTime);

        if (inBetween.length >= 2) {
          const tStart = inBetween[0].time;
          const tEnd = inBetween[inBetween.length - 1].time;
          const timeSpan = tEnd - tStart || 1;
          const points = inBetween.map((c) => {
            const frac = (c.time - tStart) / timeSpan;
            const price = d.p1! + (d.p2! - d.p1!) * frac;
            return { time: c.time, value: Number(price.toFixed(5)) };
          });
          tlSeries.setData(points);
        } else {
          tlSeries.setData([
            { time: d.t1, value: d.p1 },
            { time: d.t2, value: d.p2 },
          ]);
        }
      }
    }
  }, [drawings, selectedDrawingId, activePair]);

  // Initial and reactive fetch
  useEffect(() => {
    loadCandles();
    const iv = setInterval(loadCandles, 15000);
    return () => clearInterval(iv);
  }, [loadCandles]);

  // Reactive indicator re-rendering
  useEffect(() => {
    if (rawCandlesRef.current.length > 0) {
      updateIndicators(rawCandlesRef.current);
      renderUserDrawings();
    }
  }, [showEma20, showEma50, showSma200, showBollinger, showSmcLevels, showExtremes, drawings, selectedDrawingId, updateIndicators, renderUserDrawings]);

  // ── Drawing Operations ─────────────────────────────────────────────────────

  // Add Horizontal Support/Resistance Line
  const handleAddHorizontalLine = (targetPrice?: number, label = "Key Level") => {
    const p = targetPrice ?? (liveData ? liveData.bid : parseFloat(newHorizPrice));
    if (!p || isNaN(p) || p <= 0) return;

    const newDrawing: ChartDrawing = {
      id: `draw_h_${Date.now()}`,
      pair: activePair,
      type: "horizontal",
      label: newDrawingLabel || label,
      color: newDrawingColor,
      price: p,
      createdAt: Date.now(),
    };

    setDrawings((prev) => {
      const next = [...prev, newDrawing];
      try {
        sessionStorage.setItem("apex_chart_drawings", JSON.stringify(next));
      } catch {}
      return next;
    });
    setSelectedDrawingId(newDrawing.id);
    setNewHorizPrice("");
    setActiveDrawingMode(null);
  };

  // Add Trendline from Recent Swing Structure
  const handleAddInstitutionalTrendline = (bias: "SUPPORT" | "RESISTANCE") => {
    const raw = rawCandlesRef.current;
    if (raw.length < 10) return;

    const recent = raw.slice(-20);
    if (bias === "SUPPORT") {
      // Connect lowest low to second low
      let lowestIdx = 0;
      for (let i = 1; i < recent.length - 2; i++) {
        if (recent[i].low < recent[lowestIdx].low) lowestIdx = i;
      }
      const p1Candle = recent[lowestIdx];
      const p2Candle = recent[recent.length - 1];

      const newDrawing: ChartDrawing = {
        id: `draw_tl_${Date.now()}`,
        pair: activePair,
        type: "trendline",
        label: `Ascending Support Trendline`,
        color: "#10B981",
        t1: p1Candle.time,
        p1: p1Candle.low,
        t2: p2Candle.time,
        p2: p2Candle.low,
        createdAt: Date.now(),
      };
      setDrawings((prev) => {
        const next = [...prev, newDrawing];
        try {
          sessionStorage.setItem("apex_chart_drawings", JSON.stringify(next));
        } catch {}
        return next;
      });
      setSelectedDrawingId(newDrawing.id);
    } else {
      // Connect highest high to recent high
      let highestIdx = 0;
      for (let i = 1; i < recent.length - 2; i++) {
        if (recent[i].high > recent[highestIdx].high) highestIdx = i;
      }
      const p1Candle = recent[highestIdx];
      const p2Candle = recent[recent.length - 1];

      const newDrawing: ChartDrawing = {
        id: `draw_tl_${Date.now()}`,
        pair: activePair,
        type: "trendline",
        label: `Descending Resistance Trendline`,
        color: "#F43F5E",
        t1: p1Candle.time,
        p1: p1Candle.high,
        t2: p2Candle.time,
        p2: p2Candle.high,
        createdAt: Date.now(),
      };
      setDrawings((prev) => {
        const next = [...prev, newDrawing];
        try {
          sessionStorage.setItem("apex_chart_drawings", JSON.stringify(next));
        } catch {}
        return next;
      });
      setSelectedDrawingId(newDrawing.id);
    }
    setActiveDrawingMode(null);
  };

  // Delete Individual Drawing
  const handleDeleteDrawing = (id: string) => {
    setDrawings((prev) => {
      const next = prev.filter((d) => d.id !== id);
      try {
        sessionStorage.setItem("apex_chart_drawings", JSON.stringify(next));
      } catch {}
      return next;
    });
    if (selectedDrawingId === id) setSelectedDrawingId(null);
  };

  // Clear All Drawings
  const handleClearAllDrawings = () => {
    setDrawings((prev) => {
      const next = prev.filter((d) => d.pair !== activePair);
      try {
        sessionStorage.setItem("apex_chart_drawings", JSON.stringify(next));
      } catch {}
      return next;
    });
    setSelectedDrawingId(null);
  };

  // Canvas Actions
  const handleFitContent = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  };

  const selectedDrawing = useMemo(() => {
    return drawings.find((d) => d.id === selectedDrawingId) || null;
  }, [drawings, selectedDrawingId]);

  return (
    <div className="space-y-3 font-mono select-none overflow-x-hidden animate-in fade-in slide-in-from-right-3 duration-200 pb-36">
      {/* ── Top Executive Breadcrumb & Pair Switcher ──────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group shrink-0 whitespace-nowrap"
            title="Return to parent screen"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform shrink-0" />
            <span className="font-semibold whitespace-nowrap">Return</span>
            <span className="text-zinc-600">/</span>
            <span className="text-white font-bold whitespace-nowrap">Chart Room</span>
          </button>

          {/* Quick Instrument Switcher Pills */}
          <div className="flex items-center gap-1 bg-[#0E131A] p-0.5 rounded-xl border border-[#1E2633] shrink-0">
            {SUPPORTED_PAIRS.map((p) => {
              const isActive = p.pair === activePair;
              return (
                <button
                  key={p.pair}
                  onClick={() => {
                    setActivePair(p.pair);
                    setSelectedDrawingId(null);
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                  }`}
                >
                  {p.pair}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Actions: Jump to Intelligence Workstation */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenInstrumentWorkstation && (
            <button
              onClick={() => onOpenInstrumentWorkstation(activePair)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-cyan-400 hover:text-cyan-300 text-xs font-bold transition-all cursor-pointer shrink-0"
              title="Open APEX Intelligence Workstation for this instrument"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>APEX INTELLIGENCE →</span>
            </button>
          )}

          <Badge variant="neutral" size="xs">
            {currentPairProfile.category}
          </Badge>
        </div>
      </div>

      {/* ── Active Instrument Live Quote Bar ──────────────────────────────── */}
      <Card variant="default" padding="sm" className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
              {activePair}
            </h1>
            <span className="text-xs text-zinc-400 font-sans truncate">
              · {currentPairProfile.name}
            </span>

            {activePosition && (
              <Badge variant="success" size="xs">
                OPEN DEAL ON CAPITAL.COM
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap">
            <span>
              Bid: <strong className="text-white font-bold">{liveData ? formatPairPrice(activePair, liveData.bid) : "—"}</strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              Ask: <strong className="text-white font-bold">{liveData ? formatPairPrice(activePair, liveData.ask) : "—"}</strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              Spread: <strong className="text-emerald-400 font-bold">{liveData?.spread_pips != null ? `${liveData.spread_pips}p` : "—"}</strong>
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-0.5 ${
              isBull
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            }`}>
              {isBull ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
              {isBull ? "Bull" : "Bear"}
            </span>
          </div>
        </div>
      </Card>

      {/* ── Chart Control Toolbar: Timeframes, Indicators, Drawing Tools ──── */}
      <div className="bg-[#0E131A] p-2 sm:p-2.5 rounded-2xl border border-[#1E2633] space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Timeframe Selector Pills */}
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {TIMEFRAMES.map((tf) => {
              const active = timeframe === tf.id;
              return (
                <button
                  key={tf.id}
                  onClick={() => setTimeframe(tf.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? "bg-cyan-500 text-zinc-950 shadow-sm font-black"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                  title={`${tf.desc} Candlestick Feed`}
                >
                  {tf.label}
                </button>
              );
            })}

            {/* Unsupported Timeframes Explicit Flag */}
            <span
              className="text-[10px] text-zinc-600 px-1.5 py-1 rounded cursor-not-allowed select-none line-through"
              title="M5 & M30 are currently unmapped in Capital.com backend feed"
            >
              M5/M30
            </span>
          </div>

          {/* Action Buttons: Drawing Layer, Fit & Expand */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowDrawingTools((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showDrawingTools
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:text-white"
              }`}
              title="Toggle Institutional Drawing Layer"
            >
              <PenTool className="w-3.5 h-3.5 text-cyan-400" />
              <span>Drawings {drawings.filter((d) => d.pair === activePair).length > 0 ? `(${drawings.filter((d) => d.pair === activePair).length})` : ""}</span>
            </button>

            <button
              onClick={handleFitContent}
              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer text-xs flex items-center gap-1"
              title="Fit chart content to window"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[10px] font-semibold">Fit</span>
            </button>

            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer text-xs flex items-center gap-1"
              title={isExpanded ? "Collapse height" : "Expand chart height"}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline text-[10px] font-semibold">{isExpanded ? "Compact" : "Expand"}</span>
            </button>

            {candlesLoading && (
              <span className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-950/40 px-2 py-1 rounded-lg border border-cyan-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                Syncing
              </span>
            )}
          </div>
        </div>

        {/* Technical Indicators Toggle Row */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-zinc-800/80 text-xs">
          <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider mr-1">
            Overlays:
          </span>

          <button
            onClick={() => setShowEma20((v) => !v)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              showEma20
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#06B6D4]" />
            EMA 20
          </button>

          <button
            onClick={() => setShowEma50((v) => !v)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              showEma50
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
            EMA 50
          </button>

          <button
            onClick={() => setShowSma200((v) => !v)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              showSma200
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
            SMA 200
          </button>

          <button
            onClick={() => setShowBollinger((v) => !v)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              showBollinger
                ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
            Bollinger (20,2)
          </button>

          <button
            onClick={() => setShowSmcLevels((v) => !v)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              showSmcLevels
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            SMC Plan Lines
          </button>

          <button
            onClick={() => setShowExtremes((v) => !v)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
              showExtremes
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
            20-Bar Extremes
          </button>
        </div>

        {/* ── Advanced Observational Drawing Layer Panel ─────────────────────── */}
        {showDrawingTools && (
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <PenTool className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-zinc-200 font-bold uppercase text-[11px]">
                  Institutional Drawing Layer (Observational)
                </span>
              </div>

              {drawings.filter((d) => d.pair === activePair).length > 0 && (
                <button
                  onClick={handleClearAllDrawings}
                  className="px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear ({drawings.filter((d) => d.pair === activePair).length})</span>
                </button>
              )}
            </div>

            {/* Quick Draw Action Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => handleAddHorizontalLine(undefined, "Live Bid Support")}
                className="px-2.5 py-1 rounded-lg bg-[#111721] hover:bg-[#1A222F] border border-[#1E2633] text-zinc-200 text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
                title="Place horizontal ray at live bid"
              >
                <Plus className="w-3 h-3 text-cyan-400" />
                <span>+ Ray at Live Bid</span>
              </button>

              {hoverData && (
                <button
                  onClick={() => handleAddHorizontalLine(hoverData.close, "Crosshair Level")}
                  className="px-2.5 py-1 rounded-lg bg-[#111721] hover:bg-[#1A222F] border border-[#1E2633] text-zinc-200 text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
                  title="Place horizontal ray at active crosshair price"
                >
                  <Target className="w-3 h-3 text-cyan-400" />
                  <span>+ Ray at Crosshair ({formatPairPrice(activePair, hoverData.close)})</span>
                </button>
              )}

              <button
                onClick={() => handleAddInstitutionalTrendline("SUPPORT")}
                className="px-2.5 py-1 rounded-lg bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
                title="Automatically connects recent 20-bar swing lows"
              >
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span>+ Ascending Support Trendline</span>
              </button>

              <button
                onClick={() => handleAddInstitutionalTrendline("RESISTANCE")}
                className="px-2.5 py-1 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
                title="Automatically connects recent 20-bar swing highs"
              >
                <TrendingDown className="w-3 h-3 text-rose-400" />
                <span>+ Descending Resistance Trendline</span>
              </button>

              <button
                onClick={() => setActiveDrawingMode((m) => (m === "horizontal" ? null : "horizontal"))}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>+ Custom Price Level</span>
              </button>
            </div>

            {/* Custom Price Input Sub-Panel */}
            {activeDrawingMode === "horizontal" && (
              <div className="p-2.5 rounded-lg bg-[#111721] border border-[#1A222F] flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-zinc-400 uppercase font-bold">Price:</span>
                <input
                  type="number"
                  step="any"
                  placeholder={`e.g. ${liveData ? liveData.bid : "1.1000"}`}
                  value={newHorizPrice}
                  onChange={(e) => setNewHorizPrice(e.target.value)}
                  className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-xs w-28 font-mono outline-none focus:border-cyan-500"
                />

                <span className="text-[10px] text-zinc-400 uppercase font-bold">Label:</span>
                <input
                  type="text"
                  placeholder="Support / Resistance"
                  value={newDrawingLabel}
                  onChange={(e) => setNewDrawingLabel(e.target.value)}
                  className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-xs w-36 font-sans outline-none focus:border-cyan-500"
                />

                {/* Color Swatches */}
                <div className="flex items-center gap-1">
                  {DRAWING_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => setNewDrawingColor(c.hex)}
                      className={`w-4 h-4 rounded-full transition-transform ${newDrawingColor === c.hex ? "scale-125 ring-2 ring-white" : ""}`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>

                <button
                  onClick={() => handleAddHorizontalLine()}
                  className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer"
                >
                  Place Level
                </button>
                <button
                  onClick={() => setActiveDrawingMode(null)}
                  className="px-2 py-1 rounded bg-zinc-800 text-zinc-400 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Active Drawing Objects Manager & Selector (Instrument Scoped) */}
            {drawings.filter((d) => d.pair === activePair).length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase font-bold">
                  <span>Active Objects ({activePair}): {drawings.filter((d) => d.pair === activePair).length} on canvas</span>
                  <span className="text-[9px] text-cyan-400/80 font-mono">Instrument-Scoped · Session-Preserved</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                  {drawings.filter((d) => d.pair === activePair).map((d) => {
                    const isSelected = selectedDrawingId === d.id;
                    return (
                      <div
                        key={d.id}
                        onClick={() => setSelectedDrawingId(isSelected ? null : d.id)}
                        className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 text-[11px] ${
                          isSelected
                            ? "bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/30 text-white"
                            : "bg-[#111721] border-[#1A222F] text-zinc-300 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: d.color }}
                          />
                          <span className="text-[10px] uppercase font-bold px-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 shrink-0">
                            {d.type === "horizontal" ? "HORIZ" : "TREND"}
                          </span>
                          <span className="truncate font-semibold">{d.label}</span>
                          {d.price && (
                            <span className="font-mono tabular-nums text-zinc-400 text-[10px]">
                              {formatPairPrice(activePair, d.price)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isSelected && (
                            <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                              Selected
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDrawing(d.id);
                            }}
                            className="p-1 rounded hover:bg-rose-950/50 text-zinc-400 hover:text-rose-400 transition-colors"
                            title="Delete this drawing"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Interactive Crosshair Inspection HUD Bar ──────────────────────── */}
      <div className="bg-[#0B0E14] px-3 py-1.5 rounded-xl border border-zinc-800/80 text-[11px] tabular-nums flex flex-wrap items-center justify-between gap-2 min-h-[32px]">
        {hoverData ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-zinc-400">{hoverData.time}</span>
            <span>O: <strong className="text-white">{formatPairPrice(activePair, hoverData.open)}</strong></span>
            <span>H: <strong className="text-emerald-400">{formatPairPrice(activePair, hoverData.high)}</strong></span>
            <span>L: <strong className="text-rose-400">{formatPairPrice(activePair, hoverData.low)}</strong></span>
            <span>C: <strong className="text-white">{formatPairPrice(activePair, hoverData.close)}</strong></span>
            <span className={hoverData.change >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
              {hoverData.change >= 0 ? "+" : ""}{formatPairPrice(activePair, hoverData.change)} ({hoverData.changePct.toFixed(2)}%)
            </span>
          </div>
        ) : (
          <div className="text-zinc-500 text-[10px] flex items-center gap-2">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>Hover or drag crosshair across candlesticks for inspection</span>
            <span className="text-zinc-600">·</span>
            <span>{candleCount} bars loaded</span>
          </div>
        )}

        <div className="text-[10px] text-zinc-500 hidden sm:block">
          TradingView Lightweight Charts v5.2.1
        </div>
      </div>

      {/* ── Dedicated Full-Width Candlestick Chart Canvas ─────────────────── */}
      <Card variant="default" padding="none" className="overflow-hidden border-[#1E2633] bg-[#080B10]">
        <div
          ref={chartContainerRef}
          className="w-full relative"
          style={{ height: isExpanded ? "580px" : "420px", touchAction: "none" }}
        />
      </Card>

      {/* ── Transparency, Feed Attribution & Institutional Notice ─────────── */}
      <Card variant="default" padding="sm" className="space-y-2 text-xs font-sans text-zinc-400">
        <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-[11px] font-bold">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>FEED ARCHITECTURE &amp; RECONCILIATION</span>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="neutral" size="xs">
              M1 · M15 · H1 · H4 · D1
            </Badge>
            <Badge variant="neutral" size="xs">
              TradingView Lightweight v5.2.1
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold font-mono">
              Market Datafeed Origin
            </span>
            <p>
              Candles stream from Capital.com Demo REST API (endpoint: <code className="text-cyan-400 font-mono text-[10px]">/api/candles/{encodeURIComponent(activePair)}/{timeframe}</code>). Chart candles represent indicative broker pricing for structural chart analysis.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold font-mono">
              Chart Library Governance
            </span>
            <p>
              Chart rendering is powered by TradingView Lightweight Charts v5.2.1. TradingView Advanced Charts (Charting Library) is a proprietary commercial library requiring enterprise NDA licensing and is not distributed in this build.
            </p>
          </div>
        </div>

        <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Observational Workspace:</strong> All drawn lines, trendlines, and indicator curves are strictly visual chart annotations stored in component state. Zero broker order execution controls exist in this view. All order submissions and manual modifications require explicit Level-2 confirmation through the Terminal Command HUD.
          </span>
        </div>
      </Card>
    </div>
  );
};
