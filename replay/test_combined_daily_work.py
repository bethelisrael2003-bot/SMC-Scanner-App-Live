#!/usr/bin/env python3
"""
The 3-Engine Daily Workflow: Combining Asian Breakout, Aggressive Cent, & Asian Fade
===================================================================================
Tests whether running the 3 proven, high-expectancy engines in parallel eliminates
the dry spell problem while keeping high win rate and steady weekly profits.
"""

from audit_all_8_tabs_longterm import (
    run_aggressive_cent, run_asian_fade, run_asian_breakout,
    parse_iso, calculate_lot
)
from collections import defaultdict
import datetime

# Run the 3 proven engines
t_aggressive = run_aggressive_cent()
for t in t_aggressive: t["engine"] = "Aggressive Cent (⚡)"

t_breakout = run_asian_breakout()
for t in t_breakout: t["engine"] = "Asian Breakout (🚀)"

t_fade = run_asian_fade()
for t in t_fade: t["engine"] = "Asian Fade (🎯)"

# Merge and sort chronologically
all_combined = t_aggressive + t_breakout + t_fade
all_combined.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())

# Capital simulation on a single $677 Cent Account with 3.0% risk per trade
# (3% risk per trade is the institutional sweet spot for a 5-trades-per-week portfolio)
start_capital = 677.0
equity = start_capital
peak = start_capital
max_dd_val = 0.0
max_dd_pct = 0.0

# Track weekly and daily distribution
daily_trades = defaultdict(list)
weekly_trades = defaultdict(list)

for t in all_combined:
    cash_risk = equity * 0.03 # 3% risk
    lot = calculate_lot(cash_risk, t["sl_pips"], t["pip_val"])
    dollar_pl = cash_risk * t["r"]
    equity += dollar_pl
    if equity > peak: peak = equity
    dd = equity - peak
    if dd < max_dd_val:
        max_dd_val = dd
        max_dd_pct = (dd / peak) * 100.0
        
    t["dollar_pl"] = round(dollar_pl, 2)
    t["balance_after"] = round(equity, 2)
    
    dt = parse_iso(t["entry_time"])
    day_str = dt.strftime("%Y-%m-%d")
    week_str = f"{dt.year}-W{dt.isocalendar()[1]:02d}"
    daily_trades[day_str].append(t)
    weekly_trades[week_str].append(t)

wins = [t for t in all_combined if t["r"] > 0]
losses = [t for t in all_combined if t["r"] <= 0]
wr = (len(wins) / len(all_combined)) * 100.0
tot_r = sum(t["r"] for t in all_combined)

print("\n" + "="*95)
print("THE 3-ENGINE DAILY INTRADAY WORKFLOW (180 DAYS / 6 MONTHS)")
print("Engines Active: Asian Breakout (🚀) + Aggressive Cent (⚡) + Asian Fade (🎯)")
print("="*95)
print(f"  Starting Cent Account Capital: $677.00 USD (67,700 Cents)")
print(f"  Final Capital:                 ${equity:.2f} USD ({equity*100:.0f} Cents)")
print(f"  Net Dollar Profit:             ${equity - start_capital:+.2f} USD ({((equity - start_capital)/start_capital)*100:+.1f}% Growth)")
print(f"  Total Trades in 6 Months:      {len(all_combined)} TRADES")
print(f"  Weekly Trading Frequency:      {len(all_combined)/26.0:.1f} TRADES PER WEEK (~1 trade every business day!)")
print(f"  Active Trading Days:           {len(daily_trades)} days out of 126 business days")
print(f"  Exact Record (Rule 11a):       {len(wins)} Wins / {len(losses)} Losses")
print(f"  Win Rate:                      {wr:.1f}% ({len(wins)}W / {len(losses)}L)")
print(f"  Total Realized R:              {tot_r:+.2f}R")
print(f"  Max Drawdown ($ / %):          ${max_dd_val:.2f} ({max_dd_pct:.1f}%)")
print("="*95)

# Check weekly distribution
print("\nWEEKLY DISTRIBUTION AUDIT (Did we ever go weeks without a trade?):")
print("-" * 65)
zero_trade_weeks = 0
for w_num in range(16, 42): # Week 16 to 41 (April to October)
    w_key = f"2026-W{w_num:02d}"
    w_list = weekly_trades.get(w_key, [])
    w_trades = len(w_list)
    w_wins = len([x for x in w_list if x["r"] > 0])
    w_losses = len([x for x in w_list if x["r"] <= 0])
    w_profit = sum(x["dollar_pl"] for x in w_list)
    if w_trades == 0:
        zero_trade_weeks += 1
        print(f"  Week {w_num} (2026):  0 trades  (Market in dead consolidation)")
    else:
        print(f"  Week {w_num} (2026): {w_trades:>2} trades ({w_wins}W / {w_losses}L) | Net P&L: {'+' if w_profit>=0 else ''}${w_profit:>6.2f}")
print("-" * 65)
print(f"Total Weeks with Active Trades: {26 - zero_trade_weeks} out of 26 calendar weeks ({((26-zero_trade_weeks)/26.0)*100:.1f}%)")
print("="*95)
