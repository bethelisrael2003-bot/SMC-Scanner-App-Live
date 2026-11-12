import React from "react";

export type BadgeVariant =
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "neutral"
  | "buy"
  | "sell"
  | "gradeA"
  | "gradeB"
  | "wait";

export type BadgeSize = "xs" | "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulseDot?: boolean;
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  danger: "bg-rose-500/10 text-rose-400 border-rose-500/25",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  info: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  neutral: "bg-zinc-800/60 text-zinc-300 border-zinc-700/50",
  buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold",
  sell: "bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold",
  gradeA: "bg-emerald-500/15 text-emerald-400 border-emerald-500/35 font-bold",
  gradeB: "bg-amber-500/15 text-amber-400 border-amber-500/35 font-bold",
  wait: "bg-zinc-900/80 text-zinc-400 border-zinc-800 font-semibold",
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  success: "bg-emerald-400",
  danger: "bg-rose-400",
  warning: "bg-amber-400",
  info: "bg-sky-400",
  neutral: "bg-zinc-400",
  buy: "bg-emerald-400",
  sell: "bg-rose-400",
  gradeA: "bg-emerald-400",
  gradeB: "bg-amber-400",
  wait: "bg-zinc-500",
};

const SIZE_STYLES: Record<BadgeSize, string> = {
  xs: "text-[10px] px-1.5 py-0.5 tracking-tight font-mono",
  sm: "text-[11px] px-2 py-0.5 tracking-tight font-mono",
  md: "text-xs px-2.5 py-1 tracking-tight font-mono",
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  size = "sm",
  dot = false,
  pulseDot = false,
  className = "",
  children,
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border font-medium select-none whitespace-nowrap ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLORS[variant]} ${
            pulseDot ? "animate-pulse" : ""
          }`}
        />
      )}
      {children}
    </span>
  );
};
