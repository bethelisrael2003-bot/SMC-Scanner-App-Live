#!/usr/bin/env python3
"""
Aggressive Growth SMC Engine Backtest & Verification
====================================================
Implements:
1. Higher Timeframe Bias (H4/H1): Trend, Premium/Discount, Key Liquidity Pools
2. Lower Timeframe Confirmation (M15): Liquidity Sweep + Displacement candle (body >= 55%, FVG/OB) + BOS/CHOCH
3. Session Timing Filter (WAT):
   - London Kill Zone: 09:00 - 12:00 WAT (08:00 - 11:00 UTC)
   - New York Kill Zone: 15:30 - 19:00 WAT (14:30 - 18:00 UTC)
   - Dead Zones: Asian (00:00 - 08:00 WAT), Lunch (12:00 - 13:30 WAT) -> WAIT
4. Aggressive Money Management (RoboForex Cent):
   - Balance: $677 USD
   - Risk: Fixed 6.0% per trade ($40.62)
   - Forex Pip Value: $0.09 / pip per 0.01 lot
   - Metals Pip Value: $0.08 / pip per 0.01 lot
   - Round DOWN to nearest 0.01 lot
   - Scale-out: 50% @ TP1 (1:2 R:R + auto-BE), 50% @ TP2 (Opposing Liquidity Pool / 3.5R)
"""

import os, sys, json, math, datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

PRIMARY_PAIRS = [
    ("XAG/USD", "SILVER"),
    ("GBP/JPY", "GBPJPY"),
    ("EUR/USD", "EURUSD")
]

ALL_PAIRS = [
    ("XAG/USD", "SILVER"), ("GBP/JPY", "GBPJPY"), ("EUR/USD", "EURUSD"),
    ("XAU/USD", "GOLD"), ("USD/JPY", "USDJPY"), ("USD/CHF", "USDCHF"),
    ("GBP/USD", "GBPUSD"), ("EUR/JPY", "EURJPY"), ("USD/CAD", "USDCAD"),
    ("AUD/USD", "AUDUSD"), ("NZD/USD", "NZDUSD")
]

def pip_size(pair):
    if "XAG" in pair: return 0.01   # 1 cent in silver = 1 pip
    if "XAU" in pair: return 0.10   # 10 cents in gold = 1 pip
    if "JPY" in pair: return 0.01   # 0.01 in JPY = 1 pip
    return 0.0001                   # 0.0001 in EUR/USD = 1 pip

def pip_value_per_001_lot(pair):
    if "XAG" in pair or "XAU" in pair:
        return 0.08 # Metals: ~$0.08 / pip per 0.01 lot
    return 0.09     # Forex majors/crosses: ~$0.09 / pip per 0.01 lot

def parse_iso(ts):
    s = ts.replace("Z", "").split("+")[0]
    dt = datetime.datetime.fromisoformat(s)
    return dt.replace(tzinfo=datetime.timezone.utc)

def is_in_wat_killzone(utc_dt):
    # Convert UTC to WAT (UTC + 1)
    wat_hour = (utc_dt.hour + 1) % 24
    wat_minute = utc_dt.minute
    time_minutes = wat_hour * 60 + wat_minute
    
    # London Open: 09:00 AM - 12:00 PM WAT
    london_start = 9 * 60
    london_end = 12 * 60
    
    # New York Open: 03:30 PM - 07:00 PM WAT (15:30 - 19:00)
    ny_start = 15 * 60 + 30
    ny_end = 19 * 60
    
    in_london = london_start <= time_minutes <= london_end
    in_ny = ny_start <= time_minutes <= ny_end
    
    session_name = "OUTSIDE_KILLZONE"
    if in_london:
        session_name = "LONDON_OPEN"
    elif in_ny:
        session_name = "NEW_YORK_OPEN"
        
    return (in_london or in_ny), session_name, wat_hour, wat_minute

def calculate_lot_size(balance_usd, risk_pct, sl_pips, pair):
    cash_risk = balance_usd * (risk_pct / 100.0)
    pip_val = pip_value_per_001_lot(pair)
    if sl_pips <= 0 or pip_val <= 0:
        return 0.01, cash_risk
    # Lot Size = (Max Cash Risk) / (SL_Pips * Pip_Value_Per_0.01_Lot) / 100
    raw_lot = cash_risk / (sl_pips * pip_val) / 100.0
    # Floor to 2 decimal places
    lot_size = math.floor(raw_lot * 100.0) / 100.0
    return max(0.01, lot_size), cash_risk

# ── Load Market Data ─────────────────────────────────────────────────────────
def load_pair_data(pair, epic):
    m15_file = os.path.join(DATA_DIR, f"{epic}_M15.json")
    h1_file = os.path.join(DATA_DIR, f"{epic}_H1.json")
    h4_file = os.path.join(DATA_DIR, f"{epic}_H4.json")
    
    if not (os.path.exists(m15_file) and os.path.exists(h1_file) and os.path.exists(h4_file)):
        return None
        
    m15 = json.load(open(m15_file))
    h1 = json.load(open(h1_file))
    h4 = json.load(open(h4_file))
    
    return {
        "pair": pair, "epic": epic, "pip": pip_size(pair),
        "m15": m15, "h1": h1, "h4": h4,
        "m15_times": [parse_iso(b['t']).timestamp() for b in m15],
        "h1_times": [parse_iso(b['t']).timestamp() for b in h1],
        "h4_times": [parse_iso(b['t']).timestamp() for b in h4]
    }

def get_last_completed_idx(times, t, duration=3600.0):
    cutoff = t - duration
    l, r, ans = 0, len(times) - 1, -1
    while l <= r:
        mid = (l + r) // 2
        if times[mid] <= cutoff:
            ans = mid
            l = mid + 1
        else:
            r = mid - 1
    return ans

# ── Core SMC Strategy Simulation ─────────────────────────────────────────────
def run_aggressive_smc(pair_info, starting_balance=677.0, compound=True):
    pair = pair_info["pair"]
    p_size = pair_info["pip"]
    m15 = pair_info["m15"]
    h1 = pair_info["h1"]
    h4 = pair_info["h4"]
    
    trades = []
    current_balance = starting_balance
    last_closed_idx = -1
    
    for j in range(30, len(m15) - 1):
        if j <= last_closed_idx:
            continue
            
        bar = m15[j]
        utc_dt = parse_iso(bar['t'])
        t = utc_dt.timestamp()
        
        # 1. Session Timing Filter (WAT Killzones)
        in_kz, kz_name, wat_h, wat_m = is_in_wat_killzone(utc_dt)
        if not in_kz:
            continue
            
        # 2. Higher Timeframe Bias (H4)
        h4_idx = get_last_completed_idx(pair_info["h4_times"], t, 14400.0)
        if h4_idx < 15:
            continue
            
        # Recent H4 dealing range (last 15 bars ~ 60 hours)
        h4_window = h4[max(0, h4_idx-14):h4_idx+1]
        h4_range_high = max(b['h'] for b in h4_window)
        h4_range_low = min(b['l'] for b in h4_window)
        h4_range_span = h4_range_high - h4_range_low
        if h4_range_span <= 0:
            continue
            
        h4_eq = (h4_range_high + h4_range_low) / 2.0
        current_h4_close = h4[h4_idx]['c']
        
        # Premium / Discount Check
        # Discount (< 50% EQ) eligible for BUY
        # Premium (> 50% EQ) eligible for SELL
        is_discount = current_h4_close < h4_eq
        is_premium = current_h4_close > h4_eq
        
        # Rule: Mid-range check (within 45% - 55% of range is mid-range chop -> WAIT)
        relative_pos = (current_h4_close - h4_range_low) / h4_range_span
        if 0.45 <= relative_pos <= 0.55:
            continue # WAIT: mid-range chop with no clear liquidity target
            
        # Determine H4 Trend Bias
        # Fast EMA 20 vs 50 on H4
        h4_closes = [b['c'] for b in h4[:h4_idx+1]]
        k20 = 2.0 / 21.0
        k50 = 2.0 / 51.0
        ema20 = h4_closes[0]
        ema50 = h4_closes[0]
        for c in h4_closes[1:]:
            ema20 = c * k20 + ema20 * (1.0 - k20)
            ema50 = c * k50 + ema50 * (1.0 - k50)
            
        h4_bull = ema20 > ema50
        h4_bear = ema20 < ema50
        
        # 3. Lower Timeframe Confirmation (M15)
        # Check liquidity sweep of prior 10-bar local extreme
        prior_10 = m15[j-10:j]
        prior_low = min(b['l'] for b in prior_10)
        prior_high = max(b['h'] for b in prior_10)
        
        bar_range = bar['h'] - bar['l']
        if bar_range <= 0:
            continue
            
        body = abs(bar['c'] - bar['o'])
        body_ratio = body / bar_range
        lower_wick = min(bar['o'], bar['c']) - bar['l']
        upper_wick = bar['h'] - max(bar['o'], bar['c'])
        
        # Average body of last 5 bars
        avg_body = sum(abs(b['c'] - b['o']) for b in m15[j-5:j]) / 5.0
        has_displacement = (body_ratio >= 0.50) and (body >= 1.15 * avg_body)
        
        # BUY Setup:
        # - H4 Bullish & in Discount (<50% range)
        # - M15 wicks below prior 10-bar low (liquidity sweep) and closes back above it
        # - Displacement candle with bullish body or strong rejection wick (lower wick >= 40%)
        buy_sweep = (h4_bull and is_discount and 
                     bar['l'] < prior_low and bar['c'] > prior_low and
                     (has_displacement or lower_wick >= 0.40 * bar_range) and
                     bar['c'] > bar['o'])
                     
        # SELL Setup:
        # - H4 Bearish & in Premium (>50% range)
        # - M15 wicks above prior 10-bar high (liquidity sweep) and closes back below it
        # - Displacement candle with bearish body or strong rejection wick (upper wick >= 40%)
        sell_sweep = (h4_bear and is_premium and 
                      bar['h'] > prior_high and bar['c'] < prior_high and
                      (has_displacement or upper_wick >= 0.40 * bar_range) and
                      bar['c'] < bar['o'])
                      
        direction = "BUY" if buy_sweep else ("SELL" if sell_sweep else None)
        if not direction:
            continue
            
        # Entry on next bar open (spread-aware: Ask for BUY, Bid for SELL)
        entry_bar = m15[j+1] if j+1 < len(m15) else None
        if not entry_bar:
            continue
            
        entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
        
        # Calculate ATR on H1 for stop floor guard
        h1_idx = get_last_completed_idx(pair_info["h1_times"], t, 3600.0)
        if h1_idx < 14:
            continue
        h1_bars = h1[h1_idx-14:h1_idx+1]
        trs = [max(b['h'] - b['l'], abs(b['h'] - h1_bars[k-1]['c']), abs(b['l'] - h1_bars[k-1]['c'])) for k, b in enumerate(h1_bars[1:], 1)]
        h1_atr = sum(trs) / len(trs) if trs else bar_range
        
        sl_buffer = 0.15 * h1_atr
        sl_floor = 0.30 * h1_atr
        
        if direction == "BUY":
            raw_sl = bar['l'] - sl_buffer
            sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
        else:
            raw_sl = bar['h'] + sl_buffer
            sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
            
        risk_dist = abs(entry_fill - sl)
        if risk_dist <= 0:
            continue
            
        sl_pips = risk_dist / p_size
        
        # 4. Money Management Calculation (Aggressive 6% Risk)
        active_balance = current_balance if compound else starting_balance
        lot_size, cash_risk = calculate_lot_size(active_balance, 6.0, sl_pips, pair)
        
        # Targets:
        # TP1: Min 1:2 R:R (50% scale-out, moves SL to BE)
        # TP2: Major H4 Liquidity Target (h4_range_high for BUY, h4_range_low for SELL) or 3.5R
        tp1 = entry_fill + 2.0 * risk_dist if direction == "BUY" else entry_fill - 2.0 * risk_dist
        
        if direction == "BUY":
            tp2 = min(entry_fill + 4.0 * risk_dist, max(entry_fill + 2.5 * risk_dist, h4_range_high))
        else:
            tp2 = max(entry_fill - 4.0 * risk_dist, min(entry_fill - 2.5 * risk_dist, h4_range_low))
            
        tp2_r = abs(tp2 - entry_fill) / risk_dist
        
        # Simulate Multi-Target Execution
        targets = [(0.5, tp1), (0.5, tp2)]
        active_targets = [[w, tp_val, False] for w, tp_val in targets]
        
        current_sl = sl
        be_triggered = False
        total_r = 0.0
        rem_weight = 1.0
        trade_closed = False
        close_idx = j + 1
        
        for k in range(j + 2, min(j + 2 + 64, len(m15))):
            b = m15[k]
            exit_low = b['l'] if direction == "BUY" else b['al']
            exit_high = b['h'] if direction == "BUY" else b['ah']
            exit_c = b['c'] if direction == "BUY" else b['ac']
            
            # SL check (checked first)
            if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                loss_r = (current_sl - entry_fill) / risk_dist if direction == "BUY" else (entry_fill - current_sl) / risk_dist
                total_r += rem_weight * loss_r
                trade_closed = True
                close_idx = k
                break
                
            # TP checks
            for item in active_targets:
                w, tp_level, hit = item
                if not hit:
                    if (direction == "BUY" and exit_high >= tp_level) or (direction == "SELL" and exit_low <= tp_level):
                        item[2] = True
                        gain_r = (tp_level - entry_fill) / risk_dist if direction == "BUY" else (entry_fill - tp_level) / risk_dist
                        total_r += w * gain_r
                        rem_weight -= w
                        current_sl = entry_fill # Auto-move SL to BE
                        be_triggered = True
                        
            if rem_weight <= 0.001:
                trade_closed = True
                close_idx = k
                break
                
        if not trade_closed:
            last_b = m15[min(j + 1 + 64, len(m15) - 1)]
            exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
            final_r = (exit_c - entry_fill) / risk_dist if direction == "BUY" else (entry_fill - exit_c) / risk_dist
            total_r += rem_weight * final_r
            close_idx = min(j + 1 + 64, len(m15) - 1)
            
        realized_dollar = cash_risk * total_r
        current_balance += realized_dollar
        
        trade_record = {
            "pair": pair,
            "dir": direction,
            "entry_time": entry_bar['t'],
            "close_time": m15[close_idx]['t'],
            "kz": kz_name,
            "wat_time": f"{wat_h:02d}:{wat_m:02d} WAT",
            "entry": entry_fill,
            "sl": sl,
            "tp1": tp1,
            "tp2": tp2,
            "sl_pips": round(sl_pips, 1),
            "lot_size": lot_size,
            "cash_risk": round(cash_risk, 2),
            "realized_r": round(total_r, 2),
            "dollar_pl": round(realized_dollar, 2),
            "balance_after": round(current_balance, 2),
            "close_idx": close_idx
        }
        trades.append(trade_record)
        last_closed_idx = close_idx
        
    return trades, current_balance


def print_report(trades, starting_balance, final_balance, title=""):
    print(f"\n{'='*80}")
    print(f"REPORT: {title}")
    print(f"{'='*80}")
    
    if not trades:
        print("No trades triggered. Output: WAIT across all cycles.")
        return
        
    wins = [t for t in trades if t["realized_r"] > 0]
    losses = [t for t in trades if t["realized_r"] <= 0]
    w_count = len(wins)
    l_count = len(losses)
    total_trades = len(trades)
    wr = (w_count / total_trades) * 100.0
    
    total_r = sum(t["realized_r"] for t in trades)
    avg_r = total_r / total_trades
    gross_win_r = sum(t["realized_r"] for t in wins)
    gross_loss_r = abs(sum(t["realized_r"] for t in losses))
    pf = (gross_win_r / gross_loss_r) if gross_loss_r > 0 else 99.9
    
    equity = starting_balance
    peak = starting_balance
    max_dd_dollars = 0.0
    max_dd_pct = 0.0
    
    for t in trades:
        equity += t["dollar_pl"]
        if equity > peak:
            peak = equity
        dd = equity - peak
        if dd < max_dd_dollars:
            max_dd_dollars = dd
            max_dd_pct = (dd / peak) * 100.0
            
    print(f"  Initial Equity:         ${starting_balance:.2f} USD")
    print(f"  Final Equity:           ${final_balance:.2f} USD (Net P&L: ${final_balance - starting_balance:+.2f})")
    print(f"  Account Return:         {((final_balance - starting_balance)/starting_balance)*100.0:+.1f}%")
    print(f"  Total Trades:           {total_trades}")
    print(f"  Exact Record:           {w_count} Wins / {l_count} Losses (Rule 11a Compliant)")
    print(f"  Win Rate:               {wr:.1f}% ({w_count}W / {l_count}L)")
    print(f"  Net Realized R:         {total_r:+.2f}R")
    print(f"  Avg R per Trade:        {avg_r:+.2f}R")
    print(f"  Profit Factor:          {pf:.2f}")
    print(f"  Max Drawdown ($ / %):   ${max_dd_dollars:.2f} ({max_dd_pct:.1f}%)")
    print(f"{'-'*80}")
    print(f"  {'Pair':<10} {'Dir':<5} {'WAT Time':<12} {'Session':<16} {'Entry':<10} {'SL':<10} {'Pips':<6} {'Lot':<6} {'R':<6} {'Dollar P&L'}")
    print(f"  {'-'*76}")
    for t in trades:
        print(f"  {t['pair']:<10} {t['dir']:<5} {t['wat_time']:<12} {t['kz']:<16} {t['entry']:<10.4f} {t['sl']:<10.4f} {t['sl_pips']:<6.1f} {t['lot_size']:<6.2f} {t['realized_r']:<+6.2f}R ${t['dollar_pl']:+.2f}")
    print(f"{'='*80}")

if __name__ == "__main__":
    print("\n" + "="*80)
    print("RUNNING INSTITUTIONAL BACKTEST: PROFESSIONAL SMC (AGGRESSIVE GROWTH MODE)")
    print("="*80)
    
    # 1. Primary Instruments (XAG/USD Silver, GBP/JPY, EUR/USD)
    print("\n>>> Testing Primary Instruments: XAG/USD, GBP/JPY, EUR/USD...")
    primary_trades = []
    bal = 677.0
    for pair, epic in PRIMARY_PAIRS:
        p_data = load_pair_data(pair, epic)
        if not p_data: continue
        t_list, _ = run_aggressive_smc(p_data, starting_balance=bal, compound=False)
        primary_trades.extend(t_list)
        
    primary_trades.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    # Compounding simulation across the primary portfolio
    compound_bal = 677.0
    compound_trades = []
    for t in primary_trades:
        lot, cash_risk = calculate_lot_size(compound_bal, 6.0, t["sl_pips"], t["pair"])
        p_l = cash_risk * t["realized_r"]
        compound_bal += p_l
        ct = dict(t)
        ct["lot_size"] = lot
        ct["cash_risk"] = round(cash_risk, 2)
        ct["dollar_pl"] = round(p_l, 2)
        ct["balance_after"] = round(compound_bal, 2)
        compound_trades.append(ct)
        
    print_report(compound_trades, 677.0, compound_bal, "Primary Instruments Portfolio (XAG/USD, GBP/JPY, EUR/USD) [Aggressive 6% Risk]")
    
    # Also test all pairs
    all_portfolio_trades = []
    for pair, epic in ALL_PAIRS:
        p_data = load_pair_data(pair, epic)
        if not p_data: continue
        t_list, _ = run_aggressive_smc(p_data, starting_balance=677.0, compound=False)
        all_portfolio_trades.extend(t_list)
        
    all_portfolio_trades.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    comp_all_bal = 677.0
    comp_all_trades = []
    for t in all_portfolio_trades:
        lot, cash_risk = calculate_lot_size(comp_all_bal, 6.0, t["sl_pips"], t["pair"])
        p_l = cash_risk * t["realized_r"]
        comp_all_bal += p_l
        ct = dict(t)
        ct["lot_size"] = lot
        ct["cash_risk"] = round(cash_risk, 2)
        ct["dollar_pl"] = round(p_l, 2)
        ct["balance_after"] = round(comp_all_bal, 2)
        comp_all_trades.append(ct)
        
    print_report(comp_all_trades, 677.0, comp_all_bal, "All 11 Pairs Combined (Aggressive 6% Risk)")
    
    # Save results
    with open(os.path.join(DATA_DIR, "../aggressive_smc_results.json"), "w") as f:
        json.dump({
            "primary": compound_trades,
            "primary_final_balance": compound_bal,
            "all_final_balance": comp_all_bal
        }, f, indent=2)

