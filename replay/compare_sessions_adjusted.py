#!/usr/bin/env python3
import os, sys, json, math, datetime
from backtest_adjusted_two_things import PRIMARY_PAIRS, TREND_CORE_PAIRS, load_pair_data, parse_iso, utc_to_wat, calculate_lot, get_last_completed_idx

def run_session_comparison(pair_list, allow_us_premarket=True, title=""):
    all_raw_trades = []
    
    for pair, epic, p_size, pip_val, cat in pair_list:
        d = load_pair_data(pair, epic, p_size, pip_val, cat)
        if not d: continue
        
        m15 = d["m15"]
        h1 = d["h1"]
        h1_ema10 = d["h1_ema10"]
        h1_ema20 = d["h1_ema20"]
        m15_atr = d["m15_atr"]
        
        last_closed_idx = -1
        
        for j in range(25, len(m15) - 1):
            if j <= last_closed_idx: continue
            
            bar = m15[j]
            utc_dt = parse_iso(bar['t'])
            t = utc_dt.timestamp()
            wat_dt = utc_to_wat(utc_dt)
            mins = wat_dt.hour * 60 + wat_dt.minute
            
            # Session check
            if allow_us_premarket:
                # 09:00 - 17:00 WAT (continuous active institutional day)
                is_active = (9 * 60 <= mins <= 17 * 60)
                kz_name = "ACTIVE_DAY (09:00-17:00 WAT)"
            else:
                # Strict split: London (09:00-12:00) & NY (15:30-19:00)
                is_london = (9 * 60 <= mins <= 12 * 60)
                is_ny = (15 * 60 + 30 <= mins <= 19 * 60)
                is_active = is_london or is_ny
                kz_name = "LONDON_OPEN" if is_london else "NEW_YORK_OPEN"
                
            if not is_active: continue
            
            # H1 Trend Gate
            h1_idx = get_last_completed_idx(d["h1_times"], t, 3600.0)
            if h1_idx < 20: continue
            h1_c = h1[h1_idx]['c']
            e10 = h1_ema10[h1_idx]
            e20 = h1_ema20[h1_idx]
            
            bull = (e10 > e20) and (h1_c > e10)
            bear = (e10 < e20) and (h1_c < e10)
            if not (bull or bear): continue
            
            # 20-bar M15 sweep
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
            sl_buffer = 1.2 * cur_atr
            sl = bar['l'] - sl_buffer if direction == "BUY" else bar['h'] + sl_buffer
            risk = abs(entry_fill - sl)
            if risk <= 0: continue
            sl_pips = risk / p_size
            
            # Scaled targets: 50% @ 1.0R (auto-BE), 50% @ 2.5R runner
            tp1 = entry_fill + 1.0 * risk if direction == "BUY" else entry_fill - 1.0 * risk
            tp2 = entry_fill + 2.5 * risk if direction == "BUY" else entry_fill - 2.5 * risk
            
            targets = [(0.5, tp1), (0.5, tp2)]
            active_targets = [[w, tp_v, False] for w, tp_v in targets]
            
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
                
            all_raw_trades.append({
                "pair": pair, "dir": direction, "utc_entry": entry_bar['t'],
                "wat_entry": f"{wat_dt.strftime('%Y-%m-%d')} {wat_dt.strftime('%I:%M %p')} WAT",
                "session": kz_name, "entry_price": entry_fill, "sl_price": sl,
                "sl_pips": round(sl_pips, 1), "pip_val": pip_val, "p_size": p_size,
                "realized_r": round(total_r, 2), "close_idx": close_idx
            })
            last_closed_idx = close_idx
            
    all_raw_trades.sort(key=lambda x: parse_iso(x["utc_entry"]).timestamp())
    
    equity = 677.0
    compounded_trades = []
    peak_equity = 677.0
    max_dd_val = 0.0
    max_dd_pct = 0.0
    
    for t in all_raw_trades:
        cash_risk = equity * 0.06
        lot = calculate_lot(cash_risk, t["sl_pips"], t["pip_val"])
        dollar_pl = cash_risk * t["realized_r"]
        equity += dollar_pl
        
        if equity > peak_equity: peak_equity = equity
        dd = equity - peak_equity
        if dd < max_dd_val:
            max_dd_val = dd
            max_dd_pct = (dd / peak_equity) * 100.0
            
        ct = dict(t)
        ct["cash_risk"] = round(cash_risk, 2)
        ct["lot_size"] = lot
        ct["dollar_pl"] = round(dollar_pl, 2)
        ct["balance_after"] = round(equity, 2)
        compounded_trades.append(ct)
        
    wins = [t for t in compounded_trades if t["realized_r"] > 0]
    losses = [t for t in compounded_trades if t["realized_r"] <= 0]
    w_count = len(wins)
    l_count = len(losses)
    tot = len(compounded_trades)
    wr = (w_count / tot) * 100.0 if tot > 0 else 0.0
    tot_r = sum(t["realized_r"] for t in compounded_trades)
    avg_r = tot_r / tot if tot > 0 else 0.0
    gross_win = sum(t["dollar_pl"] for t in wins)
    gross_loss = abs(sum(t["dollar_pl"] for t in losses))
    pf = (gross_win / gross_loss) if gross_loss > 0 else 99.9
    
    print("\n" + "="*105)
    print(f"REPORT: {title}")
    print("="*105)
    print(f"  Initial Equity:         $677.00 USD (67,700 Cents)")
    print(f"  Final Equity:           ${equity:.2f} USD ({equity*100.0:.0f} Cents)")
    print(f"  Net Profit / Return:    ${equity - 677.0:+.2f} USD ({((equity - 677.0)/677.0)*100.0:+.1f}%)")
    print(f"  Total Trades:           {tot} trades")
    print(f"  Exact Record (Rule 11a):{w_count} Wins / {l_count} Losses")
    print(f"  Win Rate:               {wr:.1f}% ({w_count}W / {l_count}L)")
    print(f"  Net Realized R:         {tot_r:+.2f}R")
    print(f"  Profit Factor:          {pf:.2f}")
    print(f"  Max Drawdown ($ / %):   ${max_dd_val:.2f} ({max_dd_pct:.1f}%)")
    print("-"*105)
    
    print(f"  {'#':<3} {'Pair':<9} {'Dir':<5} {'WAT Timestamp':<23} {'Entry':<10} {'SL':<10} {'Pips':<6} {'Lot':<6} {'R-Out':<7} {'P&L ($)':<9} {'Balance'}")
    print("  " + "-"*100)
    for idx, t in enumerate(compounded_trades, 1):
        dec = 2 if "XAG" in t["pair"] or "XAU" in t["pair"] else (3 if "JPY" in t["pair"] else 5)
        entry_str = f"{t['entry_price']:.{dec}f}"
        sl_str = f"{t['sl_price']:.{dec}f}"
        print(f"  {idx:<3} {t['pair']:<9} {t['dir']:<5} {t['wat_entry']:<23} {entry_str:<10} {sl_str:<10} {t['sl_pips']:<6.1f} {t['lot_size']:<6.2f} {t['realized_r']:>+5.2f}R ${t['dollar_pl']:>+7.2f} ${t['balance_after']:.2f}")
    print("="*105)

if __name__ == "__main__":
    # Case 1: Primary 3 Pairs (XAG/USD, GBP/JPY, EUR/USD) with US Pre-Market allowed (09:00 - 17:00 WAT)
    run_session_comparison(PRIMARY_PAIRS, allow_us_premarket=True, title="Primary 3 Pairs (XAG/USD, GBP/JPY, EUR/USD) [09:00 - 17:00 WAT Active Day]")
    
    # Case 2: Full Trend Core (6 Pairs) with US Pre-Market allowed (09:00 - 17:00 WAT)
    run_session_comparison(TREND_CORE_PAIRS, allow_us_premarket=True, title="Trend Core 6 Pairs [09:00 - 17:00 WAT Active Day]")
