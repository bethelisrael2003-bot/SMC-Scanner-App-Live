#!/usr/bin/env python3
"""
Testing Aggressive 6% Growth using the exact 71.4% Win Rate Trend Sweep Engine
"""

import os, sys, json, math, datetime
from backtest_aggressive_smc import load_pair_data, calculate_lot_size, parse_iso, print_report, get_last_completed_idx

TREND_CORE_PAIRS = [
    ("XAU/USD", "GOLD"),
    ("XAG/USD", "SILVER"),
    ("USD/JPY", "USDJPY"),
    ("GBP/JPY", "GBPJPY"),
    ("EUR/JPY", "EURJPY"),
    ("USD/CHF", "USDCHF")
]

def compute_ema(series, period):
    k = 2.0 / (period + 1)
    ema = [series[0]]
    for c in series[1:]:
        ema.append(c * k + ema[-1] * (1.0 - k))
    return ema

def compute_atr(candles, period=14):
    trs = [0.0]
    for i in range(1, len(candles)):
        c, p = candles[i], candles[i-1]
        trs.append(max(c['h'] - c['l'], abs(c['h'] - p['c']), abs(c['l'] - p['c'])))
    atr = [trs[0]]
    for i in range(1, len(candles)):
        atr.append((atr[-1] * 13 + trs[i]) / 14.0)
    return atr

def run_exact_trend_sweep(pair_info):
    pair = pair_info["pair"]
    p_size = pair_info["pip"]
    m15 = pair_info["m15"]
    h1 = pair_info["h1"]
    
    h1_closes = [b['c'] for b in h1]
    h1_ema10 = compute_ema(h1_closes, 10)
    h1_ema20 = compute_ema(h1_closes, 20)
    
    m15_atr = compute_atr(m15, 14)
    
    trades = []
    last_closed_idx = -1
    
    for j in range(25, len(m15) - 1):
        if j <= last_closed_idx: continue
        
        bar = m15[j]
        utc_dt = parse_iso(bar['t'])
        t = utc_dt.timestamp()
        
        # Session window: 08:00 - 15:00 UTC = 09:00 - 16:00 WAT (Killzones)
        wat_h = (utc_dt.hour + 1) % 24
        wat_m = utc_dt.minute
        if not (8 <= utc_dt.hour < 15):
            continue
            
        # H1 Macro Trend (strictly completed bar <= t - 3600.0)
        h1_idx = get_last_completed_idx(pair_info["h1_times"], t, 3600.0)
        if h1_idx < 20: continue
        
        h1_c = h1[h1_idx]['c']
        e10 = h1_ema10[h1_idx]
        e20 = h1_ema20[h1_idx]
        
        bull = e10 > e20 and h1_c > e10
        bear = e10 < e20 and h1_c < e10
        if not (bull or bear): continue
        
        # 20-bar M15 sweep
        prior_20 = m15[j-20:j]
        prior_low = min(b['l'] for b in prior_20)
        prior_high = max(b['h'] for b in prior_20)
        
        rng = bar['h'] - bar['l']
        if rng <= 0: continue
        body = abs(bar['c'] - bar['o'])
        body_ratio = body / rng
        
        # Trend sweep conditions
        buy_setup = (bull and bar['l'] < prior_low and bar['c'] > prior_low and 
                     bar['c'] > bar['o'] and body_ratio >= 0.50)
                     
        sell_setup = (bear and bar['h'] > prior_high and bar['c'] < prior_high and 
                      bar['c'] < bar['o'] and body_ratio >= 0.50)
                      
        direction = "BUY" if buy_setup else ("SELL" if sell_setup else None)
        if not direction: continue
        
        entry_bar = m15[j+1] if j+1 < len(m15) else None
        if not entry_bar: continue
        
        entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
        
        # SL placed at sweep extreme +/- 1.2x M15 ATR
        cur_atr = m15_atr[j]
        sl_buffer = 1.2 * cur_atr
        
        if direction == "BUY":
            sl = bar['l'] - sl_buffer
        else:
            sl = bar['h'] + sl_buffer
            
        risk = abs(entry_fill - sl)
        if risk <= 0: continue
        sl_pips = risk / p_size
        
        # TP1: 1.00R (50%, auto-BE), TP2: 2.50R (50% runner)
        tp1 = entry_fill + 1.0 * risk if direction == "BUY" else entry_fill - 1.0 * risk
        tp2 = entry_fill + 2.5 * risk if direction == "BUY" else entry_fill - 2.5 * risk
        
        targets = [(0.5, tp1), (0.5, tp2)]
        active_targets = [[w, tp_val, False] for w, tp_val in targets]
        
        current_sl = sl
        be_triggered = False
        total_r = 0.0
        rem_weight = 1.0
        trade_closed = False
        close_idx = j + 1
        
        for k in range(j + 2, min(j + 2 + 32, len(m15))):
            b = m15[k]
            exit_low = b['l'] if direction == "BUY" else b['al']
            exit_high = b['h'] if direction == "BUY" else b['ah']
            exit_c = b['c'] if direction == "BUY" else b['ac']
            
            # SL check
            if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
                total_r += rem_weight * loss_r
                trade_closed = True
                close_idx = k
                break
                
            for item in active_targets:
                w, tp_level, hit = item
                if not hit:
                    if (direction == "BUY" and exit_high >= tp_level) or (direction == "SELL" and exit_low <= tp_level):
                        item[2] = True
                        gain_r = (tp_level - entry_fill) / risk if direction == "BUY" else (entry_fill - tp_level) / risk
                        total_r += w * gain_r
                        rem_weight -= w
                        current_sl = entry_fill
                        be_triggered = True
                        
            if rem_weight <= 0.001:
                trade_closed = True
                close_idx = k
                break
                
        if not trade_closed:
            last_b = m15[min(j + 1 + 32, len(m15) - 1)]
            exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
            final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
            total_r += rem_weight * final_r
            close_idx = min(j + 1 + 32, len(m15) - 1)
            
        session_label = "LONDON_KILLZONE" if wat_h < 13 else "NEWYORK_KILLZONE"
        trades.append({
            "pair": pair,
            "dir": direction,
            "entry_time": entry_bar['t'],
            "close_time": m15[close_idx]['t'],
            "kz": session_label,
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
    for pair, epic in TREND_CORE_PAIRS:
        p_data = load_pair_data(pair, epic)
        if not p_data: continue
        trades.extend(run_exact_trend_sweep(p_data))
        
    trades.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    
    # Simulate Aggressive 6% Risk on $677
    comp_bal = 677.0
    final_trades = []
    for t in trades:
        lot, cash_risk = calculate_lot_size(comp_bal, 6.0, t["sl_pips"], t["pair"])
        p_l = cash_risk * t["realized_r"]
        comp_bal += p_l
        ct = dict(t)
        ct["lot_size"] = lot
        ct["cash_risk"] = round(cash_risk, 2)
        ct["dollar_pl"] = round(p_l, 2)
        ct["balance_after"] = round(comp_bal, 2)
        final_trades.append(ct)
        
    print_report(final_trades, 677.0, comp_bal, "Exact Trend Sweep Core (Aggressive 6% Risk on $677 Cent Account)")
