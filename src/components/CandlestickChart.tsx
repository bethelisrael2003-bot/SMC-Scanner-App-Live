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

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
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

    series.setData(data as CandlestickData<Time>[]);
    
    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data as CandlestickData<Time>[]);
    }
  }, [data]);

  useEffect(() => {
    if (seriesRef.current && livePrice && data.length > 0) {
      const lastCandle = data[data.length - 1];
      seriesRef.current.update({
        ...lastCandle,
        close: livePrice,
        high: Math.max(lastCandle.high, livePrice),
        low: Math.min(lastCandle.low, livePrice),
      } as CandlestickData<Time>);
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
