#!/usr/bin/env python3
"""
Parameter sweep & structural optimization for Casey Stubbs Ebook strategies
==========================================================================
Investigates if:
1. 2-Hour / 4-Hour timeframe improves Casey's 3/30 EMA or Triple EMA
2. Different stop placement (structural swing vs pre-candle) improves R:R
3. Split target scaling (50% @ 1.0R auto-BE + runner) helps
4. Higher-timeframe pullback entries (pullback to EMA rather than chasing cross) works
"""

import os, sys, json, math, datetime
from backtest_ebook_strategies import all_data, parse_iso, get_last_completed_idx, simulate_trade, analyze_trades, TREND_CORE_PAIRS

def test_casey_pullback_and_timeframes():
    print("\n--- Testing Variations of Casey Stubbs' Personal Trading Plan ---")
    
    # Let's test:
    # A. Timeframe: H4 instead of H1
    # B. Entry: Pullback to 30 EMA in trend direction instead of crossover chase
    # C. Target: 1:1.5 vs 1:2 vs 1:3 vs Split (50% @ 1.0R auto-BE, 50% @ 2.5R)
    
    variations = [
        {"name": "Casey 3/30 H1 (1:1.5 BE@1.0)", "tf": "h1", "fast": 3, "slow": 30, "entry": "cross", "rr": 1.5, "be": 1.0},
        {"name": "Casey 3/30 H1 (1:2 BE@1.0)", "tf": "h1", "fast": 3, "slow": 30, "entry": "cross", "rr": 2.0, "be": 1.0},
        {"name": "Casey 3/30 H1 (1:3 BE@1.0)", "tf": "h1", "fast": 3, "slow": 30, "entry": "cross", "rr": 3.0, "be": 1.0},
        {"name": "Casey 3/30 H1 Pullback (Touch 30 EMA in 4H Trend)", "tf": "h1", "fast": 3, "slow": 30, "entry": "pullback", "rr": 2.0, "be": 1.0},
        {"name": "Triple EMA H1 Pullback (Touch 25 EMA in Trend)", "tf": "h1", "fast": 10, "slow": 50, "entry": "pullback", "rr": 2.0, "be": 1.0},
        {"name": "RSI 4H Extreme (RSI<25 / >75 on 4H)", "tf": "h4", "fast": 14, "slow": 14, "entry": "rsi_extreme", "rr": 2.0, "be": 1.0},
    ]
    
    for v in variations:
        trades = []
        for d in all_data:
            pair = d["pair"]
            if pair not in TREND_CORE_PAIRS:
                continue
            m15 = d["m15"]
            h1 = d["h1"]
            h4 = d["h4"]
            
            if v["entry"] == "cross":
                # Standard crossover
                h1_ema_fast = d["h1_ema3"] if v["fast"] == 3 else d["h1_ema10"]
                h1_ema_slow = d["h1_ema30"] if v["slow"] == 30 else d["h1_ema50"]
                h4_ema20 = d["h4_ema20"]
                h4_ema50 = d["h4_ema50"]
                h1_atr = d["h1_atr"]
                
                last_closed_idx = -1
                for i in range(35, len(h1) - 1):
                    h1_bar = h1[i]
                    t = parse_iso(h1_bar['t'])
                    h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
                    if h4_idx < 1: continue
                    
                    bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
                    bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
                    
                    cross_up = h1_ema_fast[i-1] <= h1_ema_slow[i-1] and h1_ema_fast[i] > h1_ema_slow[i]
                    cross_down = h1_ema_fast[i-1] >= h1_ema_slow[i-1] and h1_ema_fast[i] < h1_ema_slow[i]
                    
                    direction = "BUY" if (cross_up and bull) else ("SELL" if (cross_down and bear) else None)
                    if not direction: continue
                    
                    next_t = t + 3600.0
                    m15_idx = -1
                    for k in range(max(0, last_closed_idx), len(m15)):
                        if parse_iso(m15[k]['t']) >= next_t:
                            m15_idx = k
                            break
                    if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
                    
                    entry_fill = m15[m15_idx]['ao'] if direction == "BUY" else m15[m15_idx]['o']
                    atr = h1_atr[i]
                    sl_dist = max(0.3 * atr, abs(entry_fill - (h1[i-1]['l'] if direction == "BUY" else h1[i-1]['h'])))
                    sl = entry_fill - sl_dist if direction == "BUY" else entry_fill + sl_dist
                    
                    res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model="fixed", tp_fixed_r=v["rr"], be_at_r=v["be"])
                    if res:
                        trades.append(res)
                        last_closed_idx = res["close_idx"]
                        
            elif v["entry"] == "pullback":
                # Pullback: in 4H trend, price pulls back to test 30 EMA on H1 and closes back in trend direction
                h1_ema_slow = d["h1_ema30"] if v["slow"] == 30 else d["h1_ema50"]
                h4_ema20 = d["h4_ema20"]
                h4_ema50 = d["h4_ema50"]
                h1_atr = d["h1_atr"]
                
                last_closed_idx = -1
                for i in range(35, len(h1) - 1):
                    h1_bar = h1[i]
                    t = parse_iso(h1_bar['t'])
                    h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
                    if h4_idx < 1: continue
                    
                    bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
                    bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
                    ema = h1_ema_slow[i]
                    
                    # Pullback condition: low pierces EMA, but close > EMA for BUY
                    buy_pb = bull and h1_bar['l'] <= ema <= h1_bar['c'] and h1_bar['c'] > h1_bar['o']
                    sell_pb = bear and h1_bar['h'] >= ema >= h1_bar['c'] and h1_bar['c'] < h1_bar['o']
                    
                    direction = "BUY" if buy_pb else ("SELL" if sell_pb else None)
                    if not direction: continue
                    
                    next_t = t + 3600.0
                    m15_idx = -1
                    for k in range(max(0, last_closed_idx), len(m15)):
                        if parse_iso(m15[k]['t']) >= next_t:
                            m15_idx = k
                            break
                    if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
                    
                    entry_fill = m15[m15_idx]['ao'] if direction == "BUY" else m15[m15_idx]['o']
                    atr = h1_atr[i]
                    sl_dist = max(0.4 * atr, abs(entry_fill - (h1_bar['l'] if direction == "BUY" else h1_bar['h'])))
                    sl = entry_fill - sl_dist if direction == "BUY" else entry_fill + sl_dist
                    
                    res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model="fixed", tp_fixed_r=v["rr"], be_at_r=v["be"])
                    if res:
                        trades.append(res)
                        last_closed_idx = res["close_idx"]
                        
            elif v["entry"] == "rsi_extreme":
                h4_rsi = d["h4_rsi14"]
                h4_ema20 = d["h4_ema20"]
                h4_ema50 = d["h4_ema50"]
                h4_atr = d["h4_atr"]
                
                last_closed_idx = -1
                for i in range(25, len(h4) - 1):
                    h4_bar = h4[i]
                    t = parse_iso(h4_bar['t'])
                    bull = h4_ema20[i] > h4_ema50[i]
                    bear = h4_ema20[i] < h4_ema50[i]
                    
                    buy_rsi = h4_rsi[i-1] <= 30 and h4_rsi[i] > 30 and bull
                    sell_rsi = h4_rsi[i-1] >= 70 and h4_rsi[i] < 70 and bear
                    
                    direction = "BUY" if buy_rsi else ("SELL" if sell_rsi else None)
                    if not direction: continue
                    
                    next_t = t + 14400.0
                    m15_idx = -1
                    for k in range(max(0, last_closed_idx), len(m15)):
                        if parse_iso(m15[k]['t']) >= next_t:
                            m15_idx = k
                            break
                    if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
                    
                    entry_fill = m15[m15_idx]['ao'] if direction == "BUY" else m15[m15_idx]['o']
                    atr = h4_atr[i]
                    sl_dist = max(0.5 * atr, abs(entry_fill - (h4_bar['l'] if direction == "BUY" else h4_bar['h'])))
                    sl = entry_fill - sl_dist if direction == "BUY" else entry_fill + sl_dist
                    
                    res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model="fixed", tp_fixed_r=v["rr"], be_at_r=v["be"], max_bars=192)
                    if res:
                        trades.append(res)
                        last_closed_idx = res["close_idx"]
                        
        analyze_trades(trades, v["name"])

if __name__ == "__main__":
    test_casey_pullback_and_timeframes()
