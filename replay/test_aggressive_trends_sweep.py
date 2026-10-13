#!/usr/bin/env python3
"""
Testing Aggressive 6% Growth on High-Win-Rate Trend Sweep SMC Mechanics
"""

import os, sys, json, math, datetime
from backtest_aggressive_smc import load_pair_data, calculate_lot_size, parse_iso, is_in_wat_killzone, PRIMARY_PAIRS, print_report, get_last_completed_idx

def compute_ema(closes, period):
    k = 2.0 / (period + 1)
    ema = [closes[0]]
    for c in closes[1:]:
        ema.append(c * k + ema[-1] * (1.0 - k))
    return ema

def run_high_probability_aggressive_smc(pair_info, starting_balance=677.0):
    pair = pair_info["pair"]
    p_size = pair_info["pip"]
    m15 = pair_info["m15"]
    h1 = pair_info["h1"]
    
    # Pre-calculate H1 EMAs for trend direction (EMA10 vs EMA20)
    h1_closes = [b['c'] for b in h1]
    h1_ema10 = compute_ema(h1_closes, 10)
    h1_ema20 = compute_ema(h1_closes, 20)
    
    # Pre-calculate H1 ATR
    trs = [0.0]
    for i in range(1, len(h1)):
        c, p = h1[i], h1[i-1]
        trs.append(max(c['h'] - c['l'], abs(c['h'] - p['c']), abs(c['l'] - p['c'])))
    h1_atr = [trs[0]]
    for i in range(1, len(h1)):
        h1_atr.append((h1_atr[-1] * 13 + trs[i]) / 14.0)
        
    trades = []
    last_closed_idx = -1
    
    for j in range(30, len(m15) - 1):
        if j <= last_closed_idx: continue
        
        bar = m15[j]
        utc_dt = parse_iso(bar['t'])
        t = utc_dt.timestamp()
        
        # 1. Session Timing Filter (WAT Killzones)
        in_kz, kz_name, wat_h, wat_m = is_in_wat_killzone(utc_dt)
        if not in_kz: continue
        
        # 2. Higher Timeframe Trend Bias (Strictly Completed H1 bar)
        h1_idx = get_last_completed_idx(pair_info["h1_times"], t, 3600.0)
        if h1_idx < 20: continue
        
        bull = h1_ema10[h1_idx] > h1_ema20[h1_idx]
        bear = h1_ema10[h1_idx] < h1_ema20[h1_idx]
        if not (bull or bear): continue
        
        # 3. High-Quality 20-bar Liquidity Sweep
        prior_20 = m15[j-20:j]
        prior_low = min(b['l'] for b in prior_20)
        prior_high = max(b['h'] for b in prior_20)
        
        bar_range = bar['h'] - bar['l']
        if bar_range <= 0: continue
        
        lower_wick = min(bar['o'], bar['c']) - bar['l']
        upper_wick = bar['h'] - max(bar['o'], bar['c'])
        
        # Rejection requirements: wick >= 50% of bar range, close back inside prior structure
        buy_sweep = (bull and bar['l'] < prior_low and bar['c'] > prior_low and 
                     lower_wick >= 0.50 * bar_range and bar['c'] >= bar['o'])
                     
        sell_sweep = (bear and bar['h'] > prior_high and bar['c'] < prior_high and 
                      upper_wick >= 0.50 * bar_range and bar['c'] <= bar['o'])
                      
        direction = "BUY" if buy_sweep else ("SELL" if sell_sweep else None)
        if not direction: continue
        
        entry_bar = m15[j+1] if j+1 < len(m15) else None
        if not entry_bar: continue
        
        entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
        
        atr = h1_atr[h1_idx]
        buffer = 0.15 * atr
        sl_floor = 0.30 * atr
        
        if direction == "BUY":
            raw_sl = bar['l'] - buffer
            sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
        else:
            raw_sl = bar['h'] + buffer
            sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
            
        risk_dist = abs(entry_fill - sl)
        if risk_dist <= 0: continue
        sl_pips = risk_dist / p_size
        
        # Execution targets:
        # TP1: 1.0R (50% scale-out + auto-BE)
        # TP2: 2.5R (50% runner)
        tp1 = entry_fill + 1.0 * risk_dist if direction == "BUY" else entry_fill - 1.0 * risk_dist
        tp2 = entry_fill + 2.5 * risk_dist if direction == "BUY" else entry_fill - 2.5 * risk_dist
        
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
            
            # SL check
            if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                loss_r = (current_sl - entry_fill) / risk_dist if direction == "BUY" else (entry_fill - current_sl) / risk_dist
                total_r += rem_weight * loss_r
                trade_closed = True
                close_idx = k
                break
                
            for item in active_targets:
                w, tp_level, hit = item
                if not hit:
                    if (direction == "BUY" and exit_high >= tp_level) or (direction == "SELL" and exit_low <= tp_level):
                        item[2] = True
                        gain_r = (tp_level - entry_fill) / risk_dist if direction == "BUY" else (entry_fill - tp_level) / risk_dist
                        total_r += w * gain_r
                        rem_weight -= w
                        current_sl = entry_fill
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
            
        trades.append({
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
            "realized_r": round(total_r, 2),
            "close_idx": close_idx
        })
        last_closed_idx = close_idx
        
    return trades

if __name__ == "__main__":
    trades = []
    for pair, epic in PRIMARY_PAIRS:
        p_data = load_pair_data(pair, epic)
        if not p_data: continue
        trades.extend(run_high_probability_aggressive_smc(p_data))
        
    trades.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    
    # Simulate both 6% risk and 3% risk on $677
    for risk_pct in [6.0, 3.0, 2.0]:
        comp_bal = 677.0
        final_trades = []
        for t in trades:
            lot, cash_risk = calculate_lot_size(comp_bal, risk_pct, t["sl_pips"], t["pair"])
            p_l = cash_risk * t["realized_r"]
            comp_bal += p_l
            ct = dict(t)
            ct["lot_size"] = lot
            ct["cash_risk"] = round(cash_risk, 2)
            ct["dollar_pl"] = round(p_l, 2)
            ct["balance_after"] = round(comp_bal, 2)
            final_trades.append(ct)
            
        print_report(final_trades, 677.0, comp_bal, f"High-Probability SMC Model (Primary Pairs) [{risk_pct}% Risk per Trade]")
