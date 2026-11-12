import React from "react";

export type CardVariant = "default" | "elevated" | "nested" | "highlight" | "glass";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
  header?: React.ReactNode;
  rightAction?: React.ReactNode;
}

const VARIANT_STYLES: Record<CardVariant, string> = {
  default: "bg-[#0E131A] border-[#1E2633]",
  elevated: "bg-[#141B24] border-[#222C3B] shadow-lg shadow-black/40",
  nested: "bg-[#111721] border-[#1A222F]",
  highlight: "bg-[#0E131A] border-emerald-500/30 shadow-md shadow-emerald-950/20",
  glass: "bg-[#0E131A]/90 backdrop-blur-md border-[#1E2633]",
};

const PADDING_STYLES: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export const Card: React.FC<CardProps> = ({
  variant = "default",
  padding = "md",
  interactive = false,
  header,
  rightAction,
  className = "",
  children,
  onClick,
  ...props
}) => {
  const isClickable = interactive || !!onClick;

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border transition-all duration-150 ${VARIANT_STYLES[variant]} ${PADDING_STYLES[padding]} ${
        isClickable
          ? "cursor-pointer hover:border-zinc-600 active:scale-[0.99]"
          : ""
      } ${className}`}
      {...props}
    >
      {(header || rightAction) && (
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1E2633]">
          {header && <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">{header}</div>}
          {rightAction && <div>{rightAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
