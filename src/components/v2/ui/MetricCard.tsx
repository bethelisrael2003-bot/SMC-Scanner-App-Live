import React from "react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  status?: "positive" | "negative" | "neutral" | "warning";
  icon?: React.ReactNode;
  hint?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  status = "neutral",
  icon,
  hint,
  className = "",
}) => {
  const statusColors = {
    positive: "text-emerald-400",
    negative: "text-rose-400",
    warning: "text-amber-400",
    neutral: "text-zinc-400",
  };

  const statusBadgeBg = {
    positive: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    negative: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    neutral: "text-zinc-400 bg-zinc-800/40 border-zinc-700/40",
  };

  return (
    <div
      className={`p-3.5 sm:p-4 rounded-2xl bg-[#0E131A] border border-[#1E2633] flex flex-col justify-between font-mono select-none ${className}`}
    >
      <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400 uppercase tracking-wider mb-1">
        <span className="truncate">{label}</span>
        {icon && <span className="text-zinc-500 shrink-0">{icon}</span>}
      </div>

      <div className="my-0.5">
        <span className="text-lg sm:text-xl font-bold text-white tracking-tight tabular-nums block whitespace-nowrap">
          {value}
        </span>
      </div>

      {subValue && (
        <div className="mt-1.5 flex flex-col gap-1 text-[10px]">
          <div>
            <span
              className={`px-1.5 py-0.5 rounded font-semibold border inline-block whitespace-nowrap ${statusBadgeBg[status]}`}
            >
              {subValue}
            </span>
          </div>
          {hint && <span className="text-zinc-500 text-[10px] truncate block">{hint}</span>}
        </div>
      )}
    </div>
  );
};
