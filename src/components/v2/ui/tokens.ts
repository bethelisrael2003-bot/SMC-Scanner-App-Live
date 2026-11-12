/**
 * APEX Design System Tokens & Formatting Utilities
 * Standardized constants for institutional trading terminal UI
 */

export const THEME = {
  colors: {
    canvas: "#080B10",
    surface: "#0E131A",
    surfaceElevated: "#141B24",
    surfaceCard: "#111721",
    surfaceHighlight: "#182230",
    border: "#1E2633",
    borderSubtle: "#171F2C",
    borderFocus: "#38BDF8",

    textPrimary: "#F4F6F8",
    textSecondary: "#9BA3AF",
    textMuted: "#5D6778",

    emerald: "#10B981",
    emeraldDim: "rgba(16, 185, 129, 0.12)",
    emeraldBorder: "rgba(16, 185, 129, 0.3)",

    rose: "#F43F5E",
    roseDim: "rgba(244, 63, 94, 0.12)",
    roseBorder: "rgba(244, 63, 94, 0.3)",

    amber: "#F59E0B",
    amberDim: "rgba(245, 158, 11, 0.12)",
    amberBorder: "rgba(245, 158, 11, 0.3)",

    cyan: "#38BDF8",
    cyanDim: "rgba(56, 189, 248, 0.12)",
    cyanBorder: "rgba(56, 189, 248, 0.3)",
  },
  transitions: {
    fast: "transition-all duration-150 ease-out",
    normal: "transition-all duration-200 ease-in-out",
    spring: "transition-transform duration-200 cubic-bezier(0.16, 1, 0.3, 1)",
  },
} as const;

/** Format a number as USD with 2 decimal places */
export function formatUSD(val: number | string | null | undefined): string {
  if (val == null || val === "") return "$0.00";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Format R-multiple with explicit + or - sign */
export function formatR(val: number | string | null | undefined): string {
  if (val == null || val === "") return "0.00R";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0.00R";
  const prefix = num > 0 ? "+" : "";
  return `${prefix}${num.toFixed(2)}R`;
}

/** Format percentage with 1 decimal place */
export function formatPercent(val: number | string | null | undefined): string {
  if (val == null || val === "") return "0.0%";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0.0%";
  return `${num.toFixed(1)}%`;
}

/** Format pips */
export function formatPips(val: number | string | null | undefined): string {
  if (val == null || val === "") return "0.0p";
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0.0p";
  return `${num.toFixed(1)}p`;
}

/** Format price according to pair convention */
export function formatPairPrice(pair: string, price: number | null | undefined): string {
  if (price == null || isNaN(price)) return "—";
  if (pair.includes("JPY")) return price.toFixed(3);
  if (pair.includes("XAG") || pair.includes("XAU")) return price.toFixed(2);
  return price.toFixed(5);
}

/** Format short timestamp e.g. "14:22:05 UTC" or "10-20 12:45" */
export function formatShortDate(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${min} UTC`;
  } catch {
    return isoString;
  }
}
