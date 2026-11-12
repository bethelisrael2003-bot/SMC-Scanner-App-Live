import React from "react";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  fullWidth = false,
  className = "",
}: SegmentedControlProps<T>) {
  const sizeStyles = {
    sm: "p-0.5 text-[11px]",
    md: "p-1 text-xs",
  };

  const itemPadding = {
    sm: "px-2 py-1",
    md: "px-3 py-1.5",
  };

  return (
    <div
      className={`inline-flex items-center bg-[#0E131A] rounded-xl border border-[#1E2633] font-mono select-none ${
        fullWidth ? "w-full grid" : ""
      } ${sizeStyles[size]} ${className}`}
      style={fullWidth ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap active:scale-[0.98] ${
              itemPadding[size]
            } ${
              active
                ? "bg-[#1E2633] text-white shadow-sm border border-zinc-600/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 border border-transparent"
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.badge != null && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                  active ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
