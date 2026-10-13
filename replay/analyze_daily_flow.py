#!/usr/bin/env python3
"""
Analyze True Daily Signal Frequency Across the Entire 8-Engine Terminal
======================================================================
"""
from audit_all_8_tabs_longterm import (
    run_aggressive_cent, run_trend_sweep, run_asian_fade,
    run_asian_breakout, run_smc_institutional, run_classic_smc,
    run_precision_intraday, run_core_mpr, parse_iso
)
from collections import defaultdict
import datetime

tabs = [
    ("Aggressive Cent (⚡)", run_aggressive_cent()),
    ("Trend Sweep (🌊)", run_trend_sweep()),
    ("Asian Fade (🎯)", run_asian_fade()),
    ("Asian Breakout (🚀)", run_asian_breakout()),
    ("Core SMC / MPR (⚡)", run_core_mpr()),
    ("SMC Institutional (💎)", run_smc_institutional()),
    ("Classic SMC (🏛)", run_classic_smc()),
    ("Precision Intraday (📐)", run_precision_intraday()),
]

# Track by calendar day
daily_trades = defaultdict(list)
all_combined = []

for tab_name, t_list in tabs:
    for t in t_list:
        dt = parse_iso(t["entry_time"])
        day_str = dt.strftime("%Y-%m-%d")
        daily_trades[day_str].append({
            "tab": tab_name,
            "time": dt.strftime("%H:%M UTC"),
            "r": t["r"]
        })
        all_combined.append(t)

trading_days = len(daily_trades)
total_events = len(all_combined)

print("\n" + "="*85)
print("TERMINAL DAILY SIGNAL FREQUENCY AUDIT (180 DAYS / 6 MONTHS)")
print("="*85)
print(f"Total Calendar Window:       180 Days (~126 Business Trading Days)")
print(f"Active Days with Setups:     {trading_days} out of 126 trading days ({trading_days/126.0*100:.1f}%)")
print(f"Total Signals Across Tabs:   {total_events} signals across 6 months")
print(f"Average Signals Per Day:     {total_events/126.0:.1f} signals / day")
print(f"Average Signals Per Week:    {total_events/26.0:.1f} signals / week")
print("="*85)

# Breakdown of the 3 High-Expectancy Live Engines (Aggressive, Trend Sweep, Asian Breakout)
proven_tabs = [tabs[0], tabs[1], tabs[2], tabs[3]]
proven_daily = defaultdict(list)
for tab_name, t_list in proven_tabs:
    for t in t_list:
        dt = parse_iso(t["entry_time"])
        proven_daily[dt.strftime("%Y-%m-%d")].append(t)

print("\nHIGH-EXPECTANCY PORTFOLIO (Aggressive Cent + Trend Sweep + Asian Breakout + Fade):")
print(f"Total Signals:               {sum(len(t[1]) for t in proven_tabs)} signals in 180 days")
print(f"Weekly Signal Frequency:     {sum(len(t[1]) for t in proven_tabs)/26.0:.1f} trades / week")
print(f"Active Trading Days:         {len(proven_daily)} days with actionable trades")
print("="*85)
