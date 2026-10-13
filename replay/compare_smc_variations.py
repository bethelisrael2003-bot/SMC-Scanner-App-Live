#!/usr/bin/env python3
"""
Diagnostic & Optimization: Tight vs Institutional Stop Buffer & Trend Gate
"""
import os, sys, json, math, datetime
from run_full_aggressive_backtest import all_pairs_data, TARGET_PAIRS, parse_iso, utc_to_wat, check_wat_session, calculate_lot, get_last_completed_idx, compute_atr

def run_variation(buffer_mult=1.2, h1_trend_gate=True, risk_pct=6.0):
    all_trades = []
    
    for pair, epic, p_size, pip_val, cat in TARGET_PAIRS:
        d = all_pairs_data[pair]
        m15 = d["m15"]
        h1 = d["h1"]
        h4 = d["h4"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        
        # Precompute H1 EMA 10 & 20
        h1_closes = [b['c'] for b in h1]
        k10, k20 = 2/11, 2/21
        e10, e20 = [h1_closes[0]], [h1_closes[0]]
        for c in h1_closes[1:]:
            e10.append(c * k10 + e10[-1] * (1 - k10))
            e20.append(c * k20 + e20[-1] * (1 - k20))
            
        m15_atr = compute_atr(m15, 14)
        last_closed_idx = -1
        
        for j in range(25, len(m15) - 1):
            if j <= last_closed_idx: continue
            bar = m15[j]
            utc_dt = parse_iso(bar['t'])
            t = utc_dt.timestamp()
            wat_dt = utc_to_wat(utc_dt)
            
            is_kz, kz_name = check_wat_session(wat_dt)
            if not is_kz: continue
            
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 15: continue
            
            h4_w = h4[max(0, h4_idx-14):h4_idx+1]
            h4_h = max(b['h'] for b in h4_w)
            h4_l = min(b['l'] for b in h4_w)
            h4_span = h4_h - h4_l
            if h4_span <= 0: continue
            
            rel_pos = (h4[h4_idx]['c'] - h4_l) / h4_span
            if 0.45 <= rel_pos <= 0.55: continue # Mid-range
            
            h1_idx = get_last_completed_idx(d["h1_times"], t, 3600.0)
            if h1_idx < 20: continue
            
            if h1_trend_gate:
                bull = e10[h1_idx] > e20[h1_idx] and h1[h1_idx]['c'] > e10[h1_idx]
                bear = e10[h1_idx] < e20[h1_idx] and h1[h1_idx]['c'] < e10[h1_idx]
            else:
                bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
                bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
                
            if not (bull or bear): continue
            
            prior_20 = m15[j-20:j]
            prior_low = min(b['l'] for b in prior_20)
            prior_high = max(b['h'] for b in prior_20)
            
            rng = bar['h'] - bar['l']
            if rng <= 0: continue
            body = abs(bar['c'] - bar['o'])
            body_ratio = body / rng
            
            buy_setup = (bull and bar['l'] < prior_low and bar['c'] > prior_low and 
                         bar['c'] > bar['o'] and body_ratio >= 0.50)
            sell_setup = (bear and bar['h'] > prior_high and bar['c'] < prior_high and 
                          bar['c'] < bar['o'] and body_ratio >= 0.50)
                          
            direction = "BUY" if buy_setup else ("SELL" if sell_setup else None)
            if not direction: continue
            
            entry_bar = m15[j+1] if j+1 < len(m15) else None
            if not entry_bar: continue
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            cur_atr = m15_atr[j]
            sl_buf = buffer_mult * cur_atr
            sl = entry_fill - (abs(entry_fill - bar['l']) + sl_buf) if direction == "BUY" else entry_fill + (abs(bar['h'] - entry_fill) + sl_buf)
            risk = abs(entry_fill - sl)
            if risk <= 0: continue
            sl_pips = risk / p_size
            
            tp1 = entry_fill + 2.0 * risk if direction == "BUY" else entry_fill - 2.0 * risk
            tp2 = entry_fill + 3.5 * risk if direction == "BUY" else entry_fill - 3.5 * risk
            
            targets = [(0.5, tp1), (0.5, tp2)]
            active_targets = [[w, tp_v, False] for w, tp_v in targets]
            
            current_sl = sl
            be_trig = False
            total_r = 0.0
            rem_w = 1.0
            trade_closed = False
            close_idx = j + 1
            
            for k in range(j + 2, min(j + 2 + 64, len(m15))):
                b = m15[k]
                exit_low = b['l'] if direction == "BUY" else b['al']
                exit_high = b['h'] if direction == "BUY" else b['ah']
                exit_c = b['c'] if direction == "BUY" else b['ac']
                
                if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                    loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
                    total_r += rem_w * loss_r
                    trade_closed = True
                    close_idx = k
                    break
                    
                for item in active_targets:
                    w, tp_v, hit = item
                    if not hit:
                        if (direction == "BUY" and exit_high >= tp_v) or (direction == "SELL" and exit_low <= tp_v):
                            item[2] = True
                            gain_r = (tp_v - entry_fill) / risk if direction == "BUY" else (entry_fill - tp_v) / risk
                            total_r += w * gain_r
                            rem_w -= w
                            current_sl = entry_fill
                            be_trig = True
                            
                if rem_w <= 0.001:
                    trade_closed = True
                    close_idx = k
                    break
                    
            if not trade_closed:
                last_b = m15[min(j + 1 + 64, len(m15) - 1)]
                exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
                final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
                total_r += rem_w * final_r
                close_idx = min(j + 1 + 64, len(m15) - 1)
                
            all_trades.append({
                "pair": pair, "dir": direction, "utc_entry": entry_bar['t'],
                "wat_entry": f"{wat_dt.strftime('%Y-%m-%d')} {wat_dt.strftime('%I:%M %p')} WAT",
                "session": kz_name, "entry_price": entry_fill, "sl_price": sl,
                "sl_pips": round(sl_pips, 1), "pip_val": pip_val, "realized_r": round(total_r, 2),
                "close_idx": close_idx
            })
            last_closed_idx = close_idx
            
    all_trades.sort(key=lambda x: parse_iso(x["utc_entry"]).timestamp())
    equity = 677.0
    for t in all_trades:
        cash_risk = equity * (risk_pct / 100.0)
        lot = calculate_lot(cash_risk, t["sl_pips"], t["pip_val"])
        p_l = cash_risk * t["realized_r"]
        equity += p_l
        t["lot_size"] = lot
        t["cash_risk"] = round(cash_risk, 2)
        t["dollar_pl"] = round(p_l, 2)
        t["balance_after"] = round(equity, 2)
        
    wins = [t for t in all_trades if t["realized_r"] > 0]
    losses = [t for t in all_trades if t["realized_r"] <= 0]
    wr = len(wins)/len(all_trades)*100 if all_trades else 0
    tot_r = sum(t["realized_r"] for t in all_trades)
    print(f"Buffer {buffer_mult}x ATR | H1 Gate {h1_trend_gate}: {len(all_trades)} trades | {len(wins)}W / {len(losses)}L ({wr:.1f}%) | {tot_r:+.2f}R | Final Equity: ${equity:.2f} ({((equity-677)/677)*100:+.1f}%)")
    return all_trades

print("\n--- Testing Stop Buffer & Trend Gate Sensitivity on XAG/USD, GBP/JPY, EUR/USD ---")
run_variation(buffer_mult=0.15, h1_trend_gate=False)
run_variation(buffer_mult=0.5, h1_trend_gate=False)
run_variation(buffer_mult=1.0, h1_trend_gate=True)
run_variation(buffer_mult=1.2, h1_trend_gate=True)
