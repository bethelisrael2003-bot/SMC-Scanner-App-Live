import React, { useState, useMemo } from "react";
import {
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronRight,
  Info,
  Lock,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Card, Badge, Button, BottomSheet, SegmentedControl } from "./ui";

export interface CalendarEvent {
  title: string;
  country: string;
  impact: string; // "High", "Medium", "Low", "Holiday"
  date: string;
  minutesAway: number;
  isLockoutActive: boolean;
  forecast?: string;
  previous?: string;
}

export interface EconomicRadarProps {
  eventsData: {
    activeLockoutsCount?: number;
    isSystemLocked?: boolean;
    highImpactCount?: number;
    nextHighImpact?: CalendarEvent | null;
    events?: CalendarEvent[];
  } | null;
}

export const EconomicRadar: React.FC<EconomicRadarProps> = ({ eventsData }) => {
  const [selectedCurrency, setSelectedCurrency] = useState<string>("ALL");
  const [selectedImpact, setSelectedImpact] = useState<string>("ALL");
  const [inspectingEvent, setInspectingEvent] = useState<CalendarEvent | null>(null);

  const currencyOptions = [
    { value: "ALL", label: "All Currencies" },
    { value: "USD", label: "USD" },
    { value: "EUR", label: "EUR" },
    { value: "GBP", label: "GBP" },
    { value: "JPY", label: "JPY" },
  ];

  const impactOptions = [
    { value: "ALL", label: "All Impacts" },
    { value: "HIGH", label: "High Only" },
    { value: "MEDIUM", label: "Med/High" },
  ];

  // Filter events
  const filteredEvents = useMemo(() => {
    const list = eventsData?.events || [];
    return list.filter((e) => {
      // Currency filter
      if (selectedCurrency !== "ALL" && e.country !== selectedCurrency) {
        return false;
      }
      // Impact filter
      if (selectedImpact === "HIGH" && e.impact !== "High") {
        return false;
      }
      if (selectedImpact === "MEDIUM" && e.impact !== "High" && e.impact !== "Medium") {
        return false;
      }
      return true;
    });
  }, [eventsData?.events, selectedCurrency, selectedImpact]);

  // Group events by date category: "Today", "Tomorrow", "Later This Week"
  const groupedEvents = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const groups: { [key: string]: CalendarEvent[] } = {
      "Today's Macro Releases": [],
      "Tomorrow's Releases": [],
      "Later This Week": [],
    };

    filteredEvents.forEach((e) => {
      if (!e.date) return;
      const eventDay = e.date.slice(0, 10);
      if (eventDay === todayStr) {
        groups["Today's Macro Releases"].push(e);
      } else if (eventDay === tomorrowStr) {
        groups["Tomorrow's Releases"].push(e);
      } else {
        groups["Later This Week"].push(e);
      }
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredEvents]);

  const isLocked = eventsData?.isSystemLocked || (eventsData?.activeLockoutsCount ?? 0) > 0;
  const nextEvent = eventsData?.nextHighImpact;

  // Format countdown string e.g. "In 2h 15m" or "Lockout in 1h 15m"
  const formatCountdown = (mins: number) => {
    if (mins < 0) return `${Math.abs(mins)}m ago`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `In ${m}m`;
    return `In ${h}h ${m}m`;
  };

  return (
    <div className="space-y-4 font-mono">
      {/* ── Top News Gate Status Hero Card ── */}
      <Card
        variant={isLocked ? "highlight" : "default"}
        padding="md"
        className={`space-y-3 ${isLocked ? "border-rose-500/50 bg-rose-950/20" : ""}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2633]">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-4 h-4 ${isLocked ? "text-rose-400" : "text-emerald-400"}`} />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Economic News Radar &amp; Lockout Guard
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-sans">
              Automated 60m pre-event entry freeze &amp; 15m open-trade defense protects capital against Tier-1 news slippage gaps.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={isLocked ? "danger" : "success"}
              size="md"
              dot
              pulseDot={isLocked}
            >
              {isLocked ? "LOCKOUT ACTIVE (ENTRIES FROZEN)" : "ALL SYSTEMS CLEAR (SAFE)"}
            </Badge>
          </div>
        </div>

        {/* Impending Event Countdown Banner */}
        {nextEvent && (
          <div className="p-3 rounded-xl bg-[#111721] border border-[#1A222F] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-zinc-400">Next Tier-1 Event:</span>
              <strong className="text-white">{nextEvent.title} ({nextEvent.country})</strong>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold">{formatCountdown(nextEvent.minutesAway)}</span>
              <span className="text-[10px] text-zinc-500">
                (Lockout begins 60m prior)
              </span>
            </div>
          </div>
        )}

        {/* Currency & Impact Segmented Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
          <SegmentedControl
            options={currencyOptions}
            value={selectedCurrency}
            onChange={setSelectedCurrency}
            size="sm"
          />

          <SegmentedControl
            options={impactOptions}
            value={selectedImpact}
            onChange={setSelectedImpact}
            size="sm"
          />
        </div>
      </Card>

      {/* ── Grouped Calendar Events List ── */}
      <div className="space-y-4">
        {groupedEvents.length === 0 ? (
          <Card variant="default" padding="md" className="text-center text-zinc-500 text-xs py-8">
            No economic events match the selected currency or impact filters.
          </Card>
        ) : (
          groupedEvents.map(([groupTitle, events]) => (
            <div key={groupTitle} className="space-y-2">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-[11px] uppercase text-zinc-400 font-semibold tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  {groupTitle}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {events.length} Event{events.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-1.5">
                {events.map((e, idx) => {
                  const isHigh = e.impact === "High";
                  const isMed = e.impact === "Medium";
                  const isNear = e.isLockoutActive;

                  return (
                    <div
                      key={idx}
                      onClick={() => setInspectingEvent(e)}
                      className={`group p-3 rounded-xl border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none active:scale-[0.99] ${
                        isNear
                          ? "bg-rose-950/25 border-rose-500/50 hover:border-rose-400"
                          : "bg-[#0E131A] hover:bg-[#141B24] border-[#1E2633] hover:border-zinc-700"
                      }`}
                    >
                      {/* Left: Currency, Impact Dot, Title */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border shrink-0 ${
                            isHigh
                              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                              : isMed
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {e.country}
                        </span>

                        <div className="min-w-0">
                          <div className="font-bold text-white text-xs truncate group-hover:text-cyan-300 transition-colors">
                            {e.title}
                          </div>
                          <div className="text-[10px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            <span>{e.date ? e.date.substring(11, 16) + " UTC" : "Scheduled"}</span>
                            <span>·</span>
                            <span className={e.minutesAway > 0 ? "text-zinc-300" : "text-zinc-500"}>
                              {formatCountdown(e.minutesAway)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Metrics & Lockout Pill */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 text-xs shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#1E2633]">
                        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                          <span>
                            Forecast: <strong className="text-zinc-200">{e.forecast || "—"}</strong>
                          </span>
                          <span>
                            Prior: <strong className="text-zinc-200">{e.previous || "—"}</strong>
                          </span>
                        </div>

                        <Badge
                          variant={isNear ? "danger" : isHigh ? "warning" : "neutral"}
                          size="xs"
                          dot={isNear || isHigh}
                          pulseDot={isNear}
                        >
                          {isNear ? "LOCKOUT ACTIVE" : isHigh ? "HIGH IMPACT" : "NORMAL"}
                        </Badge>

                        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Event Detail Bottom Sheet */}
      <BottomSheet
        isOpen={!!inspectingEvent}
        onClose={() => setInspectingEvent(null)}
        title={inspectingEvent ? `${inspectingEvent.country} — ${inspectingEvent.title}` : "Macro Event"}
        subtitle="Tier-1 calendar audit, release forecasts, and risk protocol"
      >
        {inspectingEvent && (
          <div className="space-y-4 font-mono text-xs">
            {/* Impact Banner */}
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Impact Level</span>
                <span className={`text-sm font-bold ${
                  inspectingEvent.impact === "High" ? "text-rose-400" : "text-amber-400"
                }`}>
                  {inspectingEvent.impact.toUpperCase()} IMPACT
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-zinc-500 uppercase block">Timing</span>
                <span className="text-xs font-bold text-white">
                  {formatCountdown(inspectingEvent.minutesAway)}
                </span>
              </div>
            </div>

            {/* Forecast vs Previous Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Consensus Forecast</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {inspectingEvent.forecast || "None"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase block">Previous Value</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {inspectingEvent.previous || "None"}
                </span>
              </div>
            </div>

            {/* Protection Protocol Explanatory Card */}
            <div className="p-3.5 rounded-xl bg-[#111721] border border-[#1A222F] space-y-2">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Automated Protection Protocol</span>
              </div>
              <p className="text-zinc-300 leading-relaxed font-sans text-xs">
                During {inspectingEvent.country} Tier-1 releases, institutional liquidity vanishes and spreads widen significantly. APEX automatically halts new entries 60 minutes before the release. Open positions approaching the news within 15 minutes have their stops locked to Breakeven or are closed at market to prevent slippage gaps.
              </p>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
};
