import React, { useMemo } from "react";
import {
  ChevronLeft,
  Calendar,
  Clock,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  Layers,
  Zap,
  Target,
  ExternalLink,
  Flame,
  Globe,
  Radio,
  BarChart3,
  Scale,
  Compass,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  MetricCard,
} from "../ui";
import { CalendarEvent } from "../EconomicRadar";

export interface MacroEventIntelligenceProps {
  event: CalendarEvent | null;
  allEvents: CalendarEvent[];
  onBack: () => void;
  onOpenInstrumentWorkstation?: (pair: string) => void;
}

export function formatEventTimeWAT(dateStr: string): string {
  if (!dateStr) return "Scheduled";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " WAT";
  } catch (e) {
    return dateStr;
  }
}

export function formatEventTimeUTC(dateStr: string): string {
  if (!dateStr) return "Scheduled";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " UTC";
  } catch (e) {
    return dateStr;
  }
}

export function formatEventDateWAT(dateStr: string): string {
  if (!dateStr) return "Date unavailable";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", {
      timeZone: "Africa/Lagos",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
}

interface MacroSignificance {
  category: string;
  measures: string;
  significance: string;
  hawkish: string;
  dovish: string;
}

function getMacroSignificance(title: string, country: string): MacroSignificance {
  const t = (title || "").toLowerCase();

  if (t.includes("cpi") || t.includes("inflation") || t.includes("pce") || t.includes("ppi") || t.includes("rpi")) {
    return {
      category: "Inflation & Price Stability",
      measures: "Rate of change in consumer/producer goods and services prices over monthly and annualized horizons.",
      significance: "Primary mandate benchmark for central banks. Persistent above-target inflation compels policymakers to maintain higher interest rates, strengthening the currency through elevated yield expectations. Subdued inflation permits monetary easing.",
      hawkish: "Above-forecast inflation signals lingering price pressure, increasing odds of rate hikes or delayed cuts (bullish for currency yields).",
      dovish: "Below-forecast inflation signals disinflationary progress, accelerating central bank rate cuts (bearish for currency yields).",
    };
  }

  if (t.includes("rate") || t.includes("fomc") || t.includes("ecb") || t.includes("boe") || t.includes("boj") || t.includes("monetary") || t.includes("speaks")) {
    return {
      category: "Central Bank & Monetary Policy",
      measures: "Benchmark policy interest rates, quantitative balance sheet operations, and macroeconomic forward guidance.",
      significance: "The foremost fundamental driver of currency valuations. Direct shifts in overnight lending rates re-price sovereign yield curves, commercial borrowing costs, and global carry trade flows.",
      hawkish: "Higher policy rates or hawkish rhetoric raises capital yields, incentivizing international inflows into domestic debt instruments.",
      dovish: "Rate cuts or dovish rhetoric lowers domestic yields, encouraging capital reallocation into higher-yielding foreign assets.",
    };
  }

  if (t.includes("payrolls") || t.includes("nfp") || t.includes("unemployment") || t.includes("employment") || t.includes("claimant") || t.includes("jolts") || t.includes("adp")) {
    return {
      category: "Labor Market & Employment",
      measures: "Net job creation, workforce participation, and wage inflation across the public and private sectors.",
      significance: "Health of the labor market dictates domestic consumer spending and wage pressure. Tight labor markets support economic expansion and hawkish policy stances, whereas rising unemployment signals impending demand contraction.",
      hawkish: "Strong job creation and rising wages confirm resilient consumer demand, reinforcing restrictive monetary policy.",
      dovish: "Rising unemployment or falling payrolls warn of economic deceleration, raising pressure on central banks to inject liquidity via rate cuts.",
    };
  }

  if (t.includes("gdp") || t.includes("growth") || t.includes("retail sales") || t.includes("production") || t.includes("pmi") || t.includes("durable")) {
    return {
      category: "Economic Growth & Activity",
      measures: "Aggregate gross economic output, consumer discretionary expenditure, and manufacturing/services sector output.",
      significance: "Provides hard statistical evidence of business cycle expansion or contraction. Robust expansion supports corporate revenues, tax receipts, and currency demand, while negative growth raises recession vulnerability.",
      hawkish: "Sustained output growth indicates economic strength, permitting central banks to prioritize inflation control over stimulus.",
      dovish: "Contracting sales or negative GDP print signals private sector exhaustion, forcing central banks into defensive stimulus cycles.",
    };
  }

  if (t.includes("sentiment") || t.includes("confidence") || t.includes("zew") || t.includes("ifo") || t.includes("survey") || t.includes("sentix")) {
    return {
      category: "Forward Sentiment & Expectations",
      measures: "Surveyed economic outlook of institutional investors, corporate executives, and consumers over the next 3 to 6 months.",
      significance: "Leading indicators that precede hard economic data (GDP, retail sales) by several months. Shifts in institutional sentiment dictate forward capital allocation and risk appetite.",
      hawkish: "Surging confidence indexes signal impending investment and hiring expansion, supporting economic resilience.",
      dovish: "Deteriorating sentiment indicates corporate caution, pre-empting reductions in capital investment and inventory stocking.",
    };
  }

  if (t.includes("trade balance") || t.includes("current account") || t.includes("exports") || t.includes("imports")) {
    return {
      category: "Trade & External Capital Balance",
      measures: "Net difference between the physical value of exported goods and imported foreign merchandise.",
      significance: "Reflects direct currency demand from commercial trade settlement. A persistent trade surplus generates steady underlying demand for domestic currency, whereas a wide deficit requires foreign capital inflows to prevent depreciation.",
      hawkish: "Expanding trade surplus or shrinking deficit increases commercial foreign exchange demand for the domestic currency.",
      dovish: "Widening trade deficit increases net domestic currency outflow to foreign exporters, exerting downward exchange pressure.",
    };
  }

  return {
    category: "Macroeconomic Indicator",
    measures: `Scheduled economic measurement monitored by institutional participants for ${country} capital markets.`,
    significance: "Institutional traders assess release figures against consensus estimates to update quantitative risk models, adjust liquidity exposure, and evaluate monetary policy trajectories.",
    hawkish: "Data outperforming institutional consensus typically reinforces domestic economic strength and interest rate expectations.",
    dovish: "Data underperforming consensus indicates underlying softness, dampening domestic rate expectations.",
  };
}

interface InstrumentExposure {
  pair: string;
  name: string;
  role: string;
  sensitivity: "HIGH" | "EXTREME";
  mechanism: string;
}

function getInstrumentExposure(country: string): InstrumentExposure[] {
  const c = (country || "").toUpperCase();

  if (c === "USD") {
    return [
      {
        pair: "EUR/USD",
        name: "Euro / US Dollar",
        role: "Direct Quote Currency",
        sensitivity: "HIGH",
        mechanism: "US Dollar yield repricing directly alters the EUR/USD exchange parity. Dollar appreciation drives EUR/USD downward; dollar softness permits EUR recovery, subject to ECB policy differentials.",
      },
      {
        pair: "XAU/USD",
        name: "Spot Gold / US Dollar",
        role: "Inverted Real-Yield Commodity",
        sensitivity: "EXTREME",
        mechanism: "Gold holds strong negative correlation to US real interest rates. Surging USD yields increase opportunity cost of non-yielding bullion, sparking swift institutional liquidation. Dollar weakness drives bullion safe-haven allocation.",
      },
      {
        pair: "XAG/USD",
        name: "Spot Silver / US Dollar",
        role: "High-Beta Monetary & Industrial Metal",
        sensitivity: "EXTREME",
        mechanism: "Silver carries dual industrial and monetary demand. Thinner market liquidity creates amplified percentage volatility compared to Gold, generating severe spread widening during USD Tier-1 releases.",
      },
    ];
  }

  if (c === "EUR") {
    return [
      {
        pair: "EUR/USD",
        name: "Euro / US Dollar",
        role: "Direct Base Currency",
        sensitivity: "HIGH",
        mechanism: "European macro data directly re-prices ECB monetary policy expectations and European sovereign bond yields (German Bunds) against US Treasury yields, driving immediate directional repricing in EUR/USD.",
      },
    ];
  }

  if (c === "GBP") {
    return [
      {
        pair: "GBP/JPY",
        name: "British Pound / Japanese Yen",
        role: "Direct Base Currency",
        sensitivity: "EXTREME",
        mechanism: "Bank of England rate expectations and UK economic indicators heavily move the British Pound. As a high-beta cross pair, GBP/JPY frequently demonstrates 100+ pip reactions during UK Tier-1 releases.",
      },
    ];
  }

  if (c === "JPY") {
    return [
      {
        pair: "GBP/JPY",
        name: "British Pound / Japanese Yen",
        role: "Direct Quote Currency & Carry Benchmark",
        sensitivity: "HIGH",
        mechanism: "Bank of Japan policy adjustments, Tokyo CPI, and wage negotiations dictate yen strength. Shifting yield expectations frequently trigger rapid unwinds across Japanese yen carry trades, prompting sharp spikes.",
      },
    ];
  }

  return [
    {
      pair: "EUR/USD",
      name: "Euro / US Dollar",
      role: "Global Risk Benchmark",
      sensitivity: "HIGH",
      mechanism: "Major external economic releases can influence global risk sentiment and dollar liquidity demand.",
    },
    {
      pair: "XAU/USD",
      name: "Spot Gold / US Dollar",
      role: "Global Macro Hedge",
      sensitivity: "HIGH",
      mechanism: "Broad macroeconomic uncertainty drives hedging flows across sovereign debt and precious metals.",
    },
  ];
}

export const MacroEventIntelligenceView: React.FC<MacroEventIntelligenceProps> = ({
  event,
  allEvents,
  onBack,
  onOpenInstrumentWorkstation,
}) => {
  if (!event) {
    return (
      <div className="space-y-4 font-mono select-none animate-in fade-in duration-150">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E131A] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400" />
          <span>Back</span>
        </button>
        <Card variant="default" padding="md" className="text-center py-10 text-zinc-400 text-xs">
          Economic calendar event not found or unavailable in active radar feed.
        </Card>
      </div>
    );
  }

  const isHigh = event.impact === "High";
  const isMed = event.impact === "Medium";
  const isNear = event.isLockoutActive;
  const isUpcoming = event.minutesAway > 0;

  const significance = useMemo(
    () => getMacroSignificance(event.title, event.country),
    [event.title, event.country]
  );

  const exposures = useMemo(
    () => getInstrumentExposure(event.country),
    [event.country]
  );

  // Related events for the same currency from current week
  const relatedEvents = useMemo(() => {
    return allEvents
      .filter((e) => e.country === event.country && e.title !== event.title)
      .slice(0, 3);
  }, [allEvents, event.country, event.title]);

  const formatCountdown = (mins: number) => {
    if (mins < 0) return `${Math.abs(mins)}m ago`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `In ${m}m`;
    return `In ${h}h ${m}m`;
  };

  const timeWAT = formatEventTimeWAT(event.date);
  const timeUTC = formatEventTimeUTC(event.date);
  const dateWAT = formatEventDateWAT(event.date);

  return (
    <div className="space-y-4 font-mono select-none overflow-x-hidden animate-in fade-in slide-in-from-right-3 duration-200 pb-36">
      {/* ── Top Navigation & Breadcrumbs ──── */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0E131A] hover:bg-[#141B24] border border-[#1E2633] text-zinc-300 hover:text-white transition-all cursor-pointer text-xs group shrink-0 whitespace-nowrap"
          title="Return to Economic Radar"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform shrink-0" />
          <span className="font-semibold whitespace-nowrap">Radar</span>
          <span className="text-zinc-600">/</span>
          <span className="text-white font-bold whitespace-nowrap">{event.country}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-300 font-normal truncate max-w-[120px] sm:max-w-[200px]">{event.title}</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={isNear ? "danger" : isHigh ? "warning" : isMed ? "neutral" : "neutral"}
            size="sm"
            dot={isNear || isHigh}
            pulseDot={isNear}
          >
            {isNear ? "LOCKOUT ACTIVE" : isHigh ? "HIGH IMPACT" : isMed ? "MEDIUM" : "LOW IMPACT"}
          </Badge>
          <span className="px-2 py-1 rounded bg-[#111721] border border-[#1E2633] text-white text-xs font-bold font-mono">
            {event.country}
          </span>
        </div>
      </div>

      {/* ── Active News Lockout Banner (Rendered when within lockout window) ── */}
      {isNear && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 space-y-1.5 select-none animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
                Tier-1 Automated News Lockout Active
              </span>
            </div>
            <Badge variant="danger" size="xs">
              Guard 2 Enforced
            </Badge>
          </div>
          <p className="text-[11px] text-rose-200/90 font-sans leading-relaxed">
            New automated entries are frozen across affected instruments. Active positions nearing the release are shielded with Breakeven stop protection or market exits to eliminate slippage gap risk.
          </p>
        </div>
      )}

      {/* ── Section A: Event Identity Hero Card ──────────────────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-white tracking-tight">
                {event.title}
              </h1>
              <Badge variant="neutral" size="xs">
                {significance.category}
              </Badge>
              <Badge variant="neutral" size="xs">
                {event.country} Currency
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans">
              Scheduled Date: <strong className="text-zinc-200">{dateWAT}</strong> · Time: <strong className="text-cyan-400">{timeWAT}</strong> ({timeUTC})
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 uppercase block font-mono">Event Status</span>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded border inline-block mt-0.5 ${
                  isUpcoming
                    ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                    : "bg-zinc-800 text-zinc-300 border-zinc-700"
                }`}
              >
                {isUpcoming ? `Upcoming (${formatCountdown(event.minutesAway)})` : `Released (${formatCountdown(event.minutesAway)})`}
              </span>
            </div>
          </div>
        </div>

        {/* 4-Column Quick Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Consensus Forecast</span>
            <span className="font-bold text-white text-sm mt-0.5 block tabular-nums">
              {event.forecast && event.forecast !== "-" ? event.forecast : "Not specified by feed"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">Market Expectation</span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Previous Value</span>
            <span className="font-bold text-zinc-300 text-sm mt-0.5 block tabular-nums">
              {event.previous && event.previous !== "-" ? event.previous : "Not specified by feed"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">Prior Release Baseline</span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Actual Outcome</span>
            <span className="font-bold text-amber-400 text-sm mt-0.5 block tabular-nums">
              {isUpcoming ? "Pending Release" : "Not reported in feed"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">
              {isUpcoming ? "Awaiting Release Time" : "Weekly schedule feed"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F]">
            <span className="text-[10px] text-zinc-500 uppercase block">Lockout Defense</span>
            <span className={`font-bold text-sm mt-0.5 block ${isNear ? "text-rose-400" : "text-emerald-400"}`}>
              {isNear ? "ACTIVE (-60m/+30m)" : "STANDBY"}
            </span>
            <span className="text-[9px] text-zinc-500 font-sans block mt-0.5">Guard 2 Protocol</span>
          </div>
        </div>
      </Card>

      {/* ── Section B: Economic Release Information & Data Freshness ─────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Economic Release Information &amp; Data Trail
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Forex Factory Tier-1 Feed
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block">Scheduled Release Time</span>
            <div className="font-bold text-white text-sm tabular-nums">
              {timeWAT}
            </div>
            <div className="text-[10px] text-zinc-400 font-sans">
              {timeUTC} · Source ISO: <span className="font-mono text-[9px] text-zinc-500">{event.date || "Not provided"}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block">Revised Previous Result</span>
            <div className="font-bold text-zinc-400 text-sm">
              Not reported by source feed
            </div>
            <div className="text-[10px] text-zinc-500 font-sans">
              Source feed logs unrevised baseline: <strong className="text-zinc-300 font-mono">{event.previous || "—"}</strong>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block">Source &amp; Freshness</span>
            <div className="font-bold text-emerald-400 text-sm">
              Institutional Feed
            </div>
            <div className="text-[10px] text-zinc-400 font-sans">
              Forex Factory Weekly Feed (<span className="text-zinc-300 font-mono">faireconomy.media</span>)
            </div>
          </div>
        </div>

        {/* Data Limitation Notice */}
        <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] text-[11px] text-zinc-400 font-sans flex items-start gap-2">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Data Integrity Standard:</strong> Historical tick outcomes and post-event revisions are not manufactured or simulated. In accordance with APEX data principles, missing values remain visibly unrecorded.
          </span>
        </div>
      </Card>

      {/* ── Section C: Market Significance & Institutional Mechanism ─────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-purple-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Market Significance &amp; Institutional Transmission Mechanism
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Macro Context
          </Badge>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">What This Indicator Measures</span>
            <p className="text-zinc-200 font-sans leading-relaxed text-xs">
              {significance.measures}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase block font-bold">Why Institutional Traders Monitor It</span>
            <p className="text-zinc-200 font-sans leading-relaxed text-xs">
              {significance.significance}
            </p>
          </div>

          {/* Hawkish vs Dovish Scenario Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-xs uppercase">Upside / Hawkish Mechanism</span>
              </div>
              <p className="text-emerald-200/90 font-sans text-[11px] leading-relaxed">
                {significance.hawkish}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1">
              <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                <TrendingDown className="w-3.5 h-3.5" />
                <span className="text-xs uppercase">Downside / Dovish Mechanism</span>
              </div>
              <p className="text-rose-200/90 font-sans text-[11px] leading-relaxed">
                {significance.dovish}
              </p>
            </div>
          </div>

          {/* Context Notice Disclaimer */}
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
            <strong className="text-zinc-300">Analytical Distinction:</strong> Macroeconomic interpretation describes general transmission mechanisms over economic cycles. It does NOT constitute a live directional trade signal, entry recommendation, or guaranteed price outcome.
          </div>
        </div>
      </Card>

      {/* ── Section D: Currency and APEX Instrument Exposure ─────────────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Currency &amp; APEX Instrument Exposure Matrix
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            {exposures.length} Instruments Exposed
          </Badge>
        </div>

        <div className="space-y-2 text-xs">
          {exposures.map((exp) => (
            <div
              key={exp.pair}
              className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-white text-sm whitespace-nowrap">{exp.pair}</span>
                  <span className="text-zinc-400 text-xs font-sans whitespace-nowrap">({exp.name})</span>
                  <Badge variant="neutral" size="xs" className="whitespace-nowrap">
                    {exp.role}
                  </Badge>
                  <Badge
                    variant={exp.sensitivity === "EXTREME" ? "danger" : "warning"}
                    size="xs"
                    className="whitespace-nowrap"
                  >
                    {exp.sensitivity} SENSITIVITY
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-300 font-sans leading-relaxed">
                  {exp.mechanism}
                </p>
              </div>

              {onOpenInstrumentWorkstation && (
                <button
                  onClick={() => onOpenInstrumentWorkstation(exp.pair)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white transition-all cursor-pointer text-xs shrink-0 self-start sm:self-auto group"
                  title={`Open ${exp.pair} Workstation`}
                >
                  <span className="font-bold whitespace-nowrap">Inspect Workstation</span>
                  <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 font-sans">
          <strong className="text-zinc-300">Neutral Volatility Notice:</strong> Instrument exposure indicates volatility and liquidity disruption potential. APEX trading models never assume guaranteed directional movement following a release.
        </div>
      </Card>

      {/* ── Section E: Historical Context & Related Calendar Releases ────── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Historical Context &amp; Related Week Releases
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            {event.country} Weekly Schedule
          </Badge>
        </div>

        <div className="space-y-2 text-xs">
          {/* Baseline Comparison Card */}
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">Recorded Baseline Prior Value</span>
              <p className="text-zinc-300 text-xs font-sans mt-0.5">
                Previous official figure logged in institutional records: <strong className="text-white font-mono">{event.previous || "Not recorded"}</strong>
              </p>
            </div>
            <span className="text-xs text-zinc-400 font-sans italic shrink-0">
              Post-release tick stats not captured in weekly feed
            </span>
          </div>

          {/* Other events for the same currency */}
          {relatedEvents.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] text-zinc-500 uppercase block font-bold">
                Other {event.country} Events This Week ({relatedEvents.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {relatedEvents.map((re, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs truncate">{re.title}</span>
                      <Badge
                        variant={re.impact === "High" ? "danger" : re.impact === "Medium" ? "warning" : "neutral"}
                        size="xs"
                      >
                        {re.impact}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-zinc-400 flex items-center justify-between">
                      <span>Forecast: <strong className="text-zinc-200">{re.forecast || "—"}</strong></span>
                      <span>Prior: <strong className="text-zinc-200">{re.previous || "—"}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Section F: Event Risk Awareness & Capital Defense Protocol ───── */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#1E2633]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Event Risk Awareness &amp; Capital Protection Protocol
            </h3>
          </div>
          <Badge variant="neutral" size="xs">
            Institutional Defense
          </Badge>
        </div>

        <div className="space-y-3 text-xs">
          {/* 5 Risk Factors Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="font-bold text-amber-400 text-xs block">1. Liquidity Evaporation</span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Interbank market makers pull limit orders 60s before release, causing spreads to widen 3x to 10x.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="font-bold text-amber-400 text-xs block">2. Slippage &amp; Fill Drift</span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Market orders fill across multiple price ticks during news spikes, generating adverse entry and stop-loss drift.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="font-bold text-amber-400 text-xs block">3. Reversals &amp; Stop Runs</span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Initial 1-minute algorithmic spikes frequently reverse violently within 3–5 minutes once order books settle.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="font-bold text-amber-400 text-xs block">4. Priced-In Asymmetry</span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Data outperforming consensus can still produce sell-offs if institutional positioning was already heavily skewed.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="font-bold text-amber-400 text-xs block">5. Correlated Asset Gaps</span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Dollar and carry shocks transmit instantaneously into Gold, Silver, and cross-pairs without prior technical warning.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <span className="font-bold text-emerald-400 text-xs block">APEX Cloud Defense</span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Autonomous 60m pre-event entry freeze (Guard 2) &amp; 15m Breakeven shield (Guard 2B) automatically defend trading capital.
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#111721] border border-[#1A222F] text-[10px] text-zinc-400 font-sans">
            <strong className="text-zinc-300">Safety Policy:</strong> This risk awareness briefing is educational and analytical. It does not introduce new trading rules, alter automated execution, or modify existing $25 flat risk parity calculations.
          </div>
        </div>
      </Card>
    </div>
  );
};
