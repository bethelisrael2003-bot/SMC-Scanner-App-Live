import React from "react";

export interface RadialGaugeProps {
  score: number; // 0 - 100
  grade?: string; // "A+", "A", "B+", "WAIT"
  label?: string;
  size?: number; // diameter in px
  strokeWidth?: number;
  className?: string;
}

export const RadialGauge: React.FC<RadialGaugeProps> = ({
  score,
  grade,
  label = "Confluence",
  size = 90,
  strokeWidth = 7,
  className = "",
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  // Determine institutional color based on score thresholds
  let strokeColor = "#64748B"; // slate
  let textColor = "text-zinc-400";
  let gradeBg = "bg-zinc-800 text-zinc-400 border-zinc-700";

  if (clamped >= 80) {
    strokeColor = "#10B981"; // emerald
    textColor = "text-emerald-400";
    gradeBg = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  } else if (clamped >= 60) {
    strokeColor = "#F59E0B"; // amber
    textColor = "text-amber-400";
    gradeBg = "bg-amber-500/15 text-amber-400 border-amber-500/30";
  }

  return (
    <div className={`flex flex-col items-center justify-center font-mono ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1E2633"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated Value Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`text-base font-black tracking-tight tabular-nums ${textColor}`}>
            {clamped}%
          </span>
          {grade && (
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded font-bold border mt-0.5 leading-tight ${gradeBg}`}
            >
              {grade}
            </span>
          )}
        </div>
      </div>

      {label && (
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider mt-1.5 font-semibold">
          {label}
        </span>
      )}
    </div>
  );
};
