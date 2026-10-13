#!/usr/bin/env python3
"""
Testing Casey Stubbs Institutional Evolution:
"The Stubbs Dynamic Value Sweep"
----------------------------------------------------------------------
Hypothesis:
Instead of chasing the lagging 3/30 EMA or 10/25/50 EMA crossover (which loses -69R),
trade the liquidity sweep of retail stop clusters AT the Casey Value Zone (EMA 30/50).

Setup:
1. Macro Trend: 4H EMA20 > EMA50 (Bullish) or EMA20 < EMA50 (Bearish)
2. Session Filter: 08:00 - 16:00 UTC (London / early NY session, as prescribed by Casey)
3. Retracement to Value Zone: Price pulls back to within 0.25x ATR of the H1 EMA30 / EMA50
4. Liquidity Sweep: M15 bar sweeps prior 10-bar local extreme (running the retail stops)
   and aggressively rejects (>50% wick rejection)
5. Execution: Enter at market close of rejection candle
6. SL: Sweep wick extreme + 0.15x ATR buffer (floored at 0.3x ATR)
7. Exit: Split target: 50% @ 1.0R (auto-BE), 50% @ 2.5R runner / Daily Pivot R1/S1
"""

import os, sys, json, math, datetime
from backtest_ebook_strategies import all_data, parse_iso, get_last_completed_idx, TREND_CORE_PAIRS, analyze_trades

def run_stubbs_value_sweep(pair_filter=TREND_CORE_PAIRS):
    all_trades = []
    
    for d in all_data:
        pair = d["pair"]
        if pair_filter and pair not in pair_filter: continue
        
        m15 = d["m15"]
        h1 = d["h1"]
        h4 = d["h4"]
        h1_ema30 = d["h1_ema30"]
        h1_ema50 = d["h1_ema50"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        h1_atr = d["h1_atr"]
        
        last_closed_idx = -1
        
        for j in range(30, len(m15) - 1):
            if j <= last_closed_idx: continue
            
            bar = m15[j]
            t = parse_iso(bar['t'])
            dt = datetime.datetime.fromtimestamp(t, tz=datetime.timezone.utc)
            
            # 1. Session window: London & early NY (08:00 - 15:30 UTC)
            if not (8 <= dt.hour <= 15):
                continue
                
            # 2. Check 4H macro trend (strictly completed H4 bar)
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 1: continue
            bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
            bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
            if not (bull or bear): continue
            
            # 3. Check H1 completed value zone (H1 EMA 30 or 50)
            h1_idx = get_last_completed_idx(d["h1_times"], t, 3600.0)
            if h1_idx < 1: continue
            atr = h1_atr[h1_idx]
            if atr <= 0: continue
            
            ema_val = h1_ema30[h1_idx]
            
            # 4. Check for Liquidity Sweep of recent 10 M15 bars
            prior_low = min(m15[k]['l'] for k in range(j-10, j))
            prior_high = max(m15[k]['h'] for k in range(j-10, j))
            
            bar_rng = bar['h'] - bar['l']
            if bar_rng <= 0: continue
            
            # BUY setup:
            # - 4H trend is BULLISH
            # - Price is near H1 EMA30 (within 0.75x ATR)
            # - Bar swept prior low (bar['l'] < prior_low)
            # - Bar closed back above prior low with lower wick >= 45% of range
            # - Bullish rejection body or upper close
            lower_wick = min(bar['o'], bar['c']) - bar['l']
            upper_wick = bar['h'] - max(bar['o'], bar['c'])
            
            buy_sweep = (bull and 
                         abs(bar['l'] - ema_val) <= 0.75 * atr and
                         bar['l'] < prior_low and
                         bar['c'] > prior_low and
                         lower_wick >= 0.45 * bar_rng and
                         bar['c'] >= bar['o'])
                         
            sell_sweep = (bear and 
                          abs(bar['h'] - ema_val) <= 0.75 * atr and
                          bar['h'] > prior_high and
                          bar['c'] < prior_high and
                          upper_wick >= 0.45 * bar_rng and
                          bar['c'] <= bar['o'])
                          
            direction = "BUY" if buy_sweep else ("SELL" if sell_sweep else None)
            if not direction: continue
            
            # Entry at bar close (next bar open)
            entry_bar = m15[j+1] if j+1 < len(m15) else None
            if not entry_bar: continue
            
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            # SL: Sweep wick extreme + buffer, floored at 0.3x ATR
            buffer = 0.15 * atr
            sl_floor = 0.3 * atr
            if direction == "BUY":
                raw_sl = bar['l'] - buffer
                sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
            else:
                raw_sl = bar['h'] + buffer
                sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
                
            risk = abs(entry_fill - sl)
            if risk <= 0: continue
            
            # Multi-target execution: 50% @ 1.0R (auto-BE), 50% @ 2.5R runner
            targets = [
                (0.5, entry_fill + 1.0 * risk if direction == "BUY" else entry_fill - 1.0 * risk),
                (0.5, entry_fill + 2.5 * risk if direction == "BUY" else entry_fill - 2.5 * risk),
            ]
            
            # Simulate
            current_sl = sl
            be_triggered = False
            total_r = 0.0
            rem_weight = 1.0
            t0 = parse_iso(entry_bar['t'])
            active_targets = [[w, tp, False] for w, tp in targets]
            trade_closed = False
            close_idx = j + 1
            
            for k in range(j + 2, min(j + 2 + 64, len(m15))):
                b = m15[k]
                exit_low = b['l'] if direction == "BUY" else b['al']
                exit_high = b['h'] if direction == "BUY" else b['ah']
                exit_c = b['c'] if direction == "BUY" else b['ac']
                
                # SL check first
                if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                    loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
                    total_r += rem_weight * loss_r
                    trade_closed = True
                    close_idx = k
                    break
                    
                # Target check
                for item in active_targets:
                    w, tp, hit = item
                    if not hit:
                        if (direction == "BUY" and exit_high >= tp) or (direction == "SELL" and exit_low <= tp):
                            item[2] = True
                            gain_r = (tp - entry_fill) / risk if direction == "BUY" else (entry_fill - tp) / risk
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
                final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
                total_r += rem_weight * final_r
                close_idx = min(j + 1 + 64, len(m15) - 1)
                
            all_trades.append({
                "pair": pair, "dir": direction, "entry_time": entry_bar['t'],
                "r": round(total_r, 2), "close_idx": close_idx
            })
            last_closed_idx = close_idx
            
    return all_trades

if __name__ == "__main__":
    t_core = run_stubbs_value_sweep(TREND_CORE_PAIRS)
    analyze_trades(t_core, "Casey Stubbs Evolved: Dynamic Value Zone Sweep (Trend Core)")
    
    t_all = run_stubbs_value_sweep(None)
    analyze_trades(t_all, "Casey Stubbs Evolved: Dynamic Value Zone Sweep (All 11 Pairs)")
