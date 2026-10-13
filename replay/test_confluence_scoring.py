#!/usr/bin/env python3
"""
Test Confluence Scoring (A+ / Grade A / B+ / Grade B)
===================================================
1. XAG/USD: Grade A = Trend Sweep (🌊), Grade B = Session Momentum (⏰)
2. GBP/JPY: Grade A = Trend Sweep (🌊), Grade B = Asian Fade (🎯)
3. EUR/USD: Grade A = Asian Breakout (🚀), Grade B = Trend Sweep (🌊), Grade C = Core MPR (⚡)
"""

from pair_strategy_matrix_6mo import (
    eval_trend_sweep, eval_asian_breakout, eval_asian_fade,
    eval_mpr, eval_session_momentum, parse_iso, calculate_lot, PAIRS
)

# Pull raw signals from all evaluators
xag_a = eval_trend_sweep("XAG/USD")
xag_b = eval_session_momentum("XAG/USD")

gbp_a = eval_trend_sweep("GBP/JPY")
gbp_b = eval_asian_fade("GBP/JPY")

eur_a = eval_asian_breakout("EUR/USD")
eur_b = eval_trend_sweep("EUR/USD")
eur_c = eval_mpr("EUR/USD")

# Confluence matcher
def find_confluence(primary_list, secondary_list, window_h=2.0):
    scored = []
    for t_a in primary_list:
        t_a_time = parse_iso(t_a["entry_time"]).timestamp()
        has_agreement = False
        for t_b in secondary_list:
            t_b_time = parse_iso(t_b["entry_time"]).timestamp()
            if abs(t_a_time - t_b_time) <= window_h * 3600.0:
                if t_a["dir"] == t_b["dir"]:
                    has_agreement = True
                    break
        grade = "A+" if has_agreement else "A"
        item = dict(t_a)
        item["grade"] = grade
        scored.append(item)
    return scored

xag_scored = find_confluence(xag_a, xag_b)
gbp_scored = find_confluence(gbp_a, gbp_b)
eur_scored = find_confluence(eur_a, eur_b)

all_grade_a = xag_scored + gbp_scored + eur_scored
all_grade_a.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())

# Compounding capital
equity = 677.0
for t in all_grade_a:
    # A+ signals get full 6% risk; Grade A gets 4% risk
    risk_pct = 6.0 if t["grade"] == "A+" else 4.0
    cash_risk = equity * (risk_pct / 100.0)
    lot = calculate_lot(cash_risk, t["sl_pips"], t["pip_val"])
    dollar_pl = cash_risk * t["r"]
    equity += dollar_pl
    t["dollar_pl"] = round(dollar_pl, 2)
    t["balance_after"] = round(equity, 2)

wins = [t for t in all_grade_a if t["r"] > 0]
losses = [t for t in all_grade_a if t["r"] <= 0]
wr = len(wins) / len(all_grade_a) * 100 if all_grade_a else 0
tot_r = sum(t["r"] for t in all_grade_a)

a_plus = [t for t in all_grade_a if t["grade"] == "A+"]
ap_w = len([t for t in a_plus if t["r"] > 0])
ap_l = len([t for t in a_plus if t["r"] <= 0])
ap_wr = (ap_w / len(a_plus) * 100) if a_plus else 0

print("\n" + "="*85)
print("GRADE A DEDICATED PORTFOLIO WITH A+ CONFLUENCE SCORING")
print("="*85)
print(f"Total Dedicated Trades:     {len(all_grade_a)} trades across 6 months")
print(f"Overall Grade A Record:     {len(wins)} Wins / {len(losses)} Losses ({wr:.1f}% WR)")
print(f"Total Realized R:           {tot_r:+.2f}R")
print(f"Initial Capital:            $677.00 USD")
print(f"Final Capital:              ${equity:.2f} USD (+{((equity-677)/677)*100:.1f}% Net Return)")
print(f"Net Profit:                 +${equity - 677.0:.2f} USD")
print("-" * 85)
print(f"A+ CONFLUENCE SIGNALS ONLY: {len(a_plus)} trades | {ap_w}W / {ap_l}L ({ap_wr:.1f}% Win Rate!)")
print("="*85)
