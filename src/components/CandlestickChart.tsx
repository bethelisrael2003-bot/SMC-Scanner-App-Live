import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';

interface ChartProps {
  data: CandlestickData[];
  pair: string;
  livePrice?: number;
}

export const CandlestickChart: React.FC<ChartProps> = ({ data, pair, livePrice }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'>>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart: any;
    try {
      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#d1d4dc',
        },
        grid: {
          vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
          horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
        },
        width: chartContainerRef.current.clientWidth || 300,
        height: 300,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const series = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      if (Array.isArray(data) && data.length > 0) {
        // Ensure data is sorted by time and no duplicates
        const uniqueData = Array.from(new Map(data.map(item => [item.time, item])).values())
          .sort((a, b) => (a.time as number) - (b.time as number));
        series.setData(uniqueData as CandlestickData<Time>[]);
      }
      
      chartRef.current = chart;
      seriesRef.current = series;
    } catch (err) {
      console.error("Chart initialization error:", err);
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      if (seriesRef.current && Array.isArray(data) && data.length > 0) {
        const uniqueData = Array.from(new Map(data.map(item => [item.time, item])).values())
          .sort((a, b) => (a.time as number) - (b.time as number));
        seriesRef.current.setData(uniqueData as CandlestickData<Time>[]);
      }
    } catch (err) {
      console.error("Error updating chart data:", err);
    }
  }, [data]);

  useEffect(() => {
    try {
      if (seriesRef.current && livePrice && Array.isArray(data) && data.length > 0) {
        const lastCandle = data[data.length - 1];
        if (lastCandle) {
            seriesRef.current.update({
              ...lastCandle,
              close: livePrice,
              high: Math.max(lastCandle.high, livePrice),
              low: Math.min(lastCandle.low, livePrice),
            } as CandlestickData<Time>);
        }
      }
    } catch (err) {
      console.error("Error updating live price on chart:", err);
    }
  }, [livePrice]);

  return (
    <div className="w-full bg-zinc-900/40 rounded-xl border border-zinc-800/80 overflow-hidden mt-4">
        <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">{pair} Live Chart</span>
            <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">LIVE</span>
            </div>
        </div>
        <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};
