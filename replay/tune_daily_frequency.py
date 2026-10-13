#!/usr/bin/env python3
"""
Diagnostic: Increasing Trade Frequency for Active Daily Trading
==============================================================
Tests how many high-probability trades are generated per month and per day
when we remove the artificial bottlenecks:
1. True SMC rejection wicks (pin bars with wick >= 50% of candle range)
2. Value zone pullback to H1 EMA (without demanding close > EMA at the bottom of a pullback)
3. Intraday session resolution (trades resolve within 4-8 hours)
4. Tracking daily setups across the primary watchlist
"""

import os, sys, json, math, datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data_longterm")

PAIRS = [
    ("XAG/USD", "SILVER", 0.01, 0.08),
    ("GBP/JPY", "GBPJPY", 0.01, 0.09),
    ("EUR/USD", "EURUSD", 0.0001, 0.09),
    ("XAU/USD", "GOLD", 0.10, 0.08),
    ("USD/JPY", "USDJPY", 0.01, 0.09),
    ("GBP/USD", "GBPUSD", 0.0001, 0.09),
]

def parse_iso(ts):
    s = ts.replace("Z", "").split("+")[0]
    dt = datetime.datetime.fromisoformat(s)
    return dt.replace(tzinfo=datetime.timezone.utc)

def compute_atr(candles, period=14):
    if len(candles) < period + 1: return [0.0] * len(candles)
    trs = [0.0]
    for i in range(1, len(candles)):
        c, p = candles[i], candles[i-1]
        trs.append(max(c['h'] - c['l'], abs(c['h'] - p['c']), abs(c['l'] - p['c'])))
    atr = [0.0] * len(candles)
    atr[period] = sum(trs[1:period+1]) / period
    for i in range(period + 1, len(candles)):
        atr[i] = (atr[i-1] * (period - 1) + trs[i]) / period
    return atr

def compute_ema(closes, period):
    if len(closes) < period: return [0.0] * len(closes)
    k = 2.0 / (period + 1)
    ema = [closes[0]]
    for c in closes[1:]:
        ema.append(c * k + ema[-1] * (1.0 - k))
    return ema

def calculate_lot(cash_risk, sl_pips, pip_val):
    if sl_pips <= 0 or pip_val <= 0: return 0.01
    raw_lot = cash_risk / (sl_pips * pip_val) / 100.0
    return max(0.01, math.floor(raw_lot * 100.0) / 100.0)

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

# Load data
pairs_data = {}
for pair, epic, p_size, pip_val in PAIRS:
    m15_p = os.path.join(DATA_DIR, f"{epic}_M15.json")
    h1_p = os.path.join(DATA_DIR, f"{epic}_H1.json")
    if not (os.path.exists(m15_p) and os.path.exists(h1_p)): continue
    m15 = json.load(open(m15_p))
    h1 = json.load(open(h1_p))
    h1_closes = [b['c'] for b in h1]
    pairs_data[pair] = {
        "pair": pair, "p_size": p_size, "pip_val": pip_val,
        "m15": m15, "h1": h1,
        "m15_times": [parse_iso(b['t']).timestamp() for b in m15],
        "h1_times": [parse_iso(b['t']).timestamp() for b in h1],
        "m15_atr": compute_atr(m15, 14),
        "h1_atr": compute_atr(h1, 14),
        "h1_ema10": compute_ema(h1_closes, 10),
        "h1_ema20": compute_ema(h1_closes, 20),
    }

def simulate_daily_active_smc(pair_list, lookback_bars=12, rr_target=1.5, risk_pct=2.0, buffer_mult=1.0):
    """
    Active daily SMC setup:
    - Sweep of 12-bar M15 swing high/low (prior 3 hours)
    - Rejection pin bar (wick >= 45% of candle) OR strong displacement
    - Macro H1 trend direction (EMA10 > EMA20 for BUY, EMA10 < EMA20 for SELL)
    - Active trading hours: 08:00 - 18:00 WAT
    - 1:1.5 or 1:2 R:R intraday quick resolution
    """
    all_trades = []
    
    for pair in pair_list:
        d = pairs_data.get(pair)
        if not d: continue
        m15, h1 = d["m15"], d["h1"]
        e10, e20 = d["h1_ema10"], d["h1_ema20"]
        m15_atr = d["m15_atr"]
        last_c = -1
        
        for j in range(lookback_bars + 5, len(m15) - 1):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            wat_h = (dt.hour + 1) % 24
            wat_m = dt.minute
            mins = wat_h * 60 + wat_m
            
            # Active Day: 08:00 - 18:00 WAT
            if not (8 * 60 <= mins <= 18 * 60): continue
            
            # Completed H1 Trend Gate
            h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
            if h1_idx < 20: continue
            bull = e10[h1_idx] > e20[h1_idx]
            bear = e10[h1_idx] < e20[h1_idx]
            if not (bull or bear): continue
            
            prior = m15[j-lookback_bars:j]
            p_low = min(x['l'] for x in prior)
            p_high = max(x['h'] for x in prior)
            
            rng = b['h'] - b['l']
            if rng <= 0: continue
            
            body = abs(b['c'] - b['o'])
            lower_wick = min(b['o'], b['c']) - b['l']
            upper_wick = b['h'] - max(b['o'], b['c'])
            
            # Rejection definition: either a strong wick (pin bar) OR a strong displacement close
            has_buy_rejection = (lower_wick >= 0.45 * rng) or (body >= 0.50 * rng and b['c'] > b['o'])
            has_sell_rejection = (upper_wick >= 0.45 * rng) or (body >= 0.50 * rng and b['c'] < b['o'])
            
            # Sweep condition: pierce prior extreme and close back inside
            buy_sweep = bull and b['l'] < p_low and b['c'] > p_low and has_buy_rejection
            sell_sweep = bear and b['h'] > p_high and b['c'] < p_high and has_sell_rejection
            
            direction = "BUY" if buy_sweep else ("SELL" if sell_sweep else None)
            if not direction: continue
            
            next_b = m15[j+1]
            entry = next_b['ao'] if direction == "BUY" else next_b['o']
            buf = buffer_mult * m15_atr[j]
            sl = b['l'] - buf if direction == "BUY" else b['h'] + buf
            risk = abs(entry - sl)
            if risk <= 0: continue
            sl_pips = risk / d["p_size"]
            
            # Quick Intraday Target: 1:1.5 or 1:2 R:R (auto-BE at 1.0R)
            tp1 = entry + 1.0 * risk if direction == "BUY" else entry - 1.0 * risk
            tp2 = entry + rr_target * risk if direction == "BUY" else entry - rr_target * risk
            
            targets = [[0.5, tp1, False], [0.5, tp2, False]]
            current_sl = sl
            rem_w = 1.0
            total_r = 0.0
            trade_closed = False
            close_idx = j + 1
            
            for k in range(j + 2, min(j + 2 + 32, len(m15))):
                candle = m15[k]
                exit_low = candle['l'] if direction == "BUY" else candle['al']
                exit_high = candle['h'] if direction == "BUY" else candle['ah']
                exit_c = candle['c'] if direction == "BUY" else candle['ac']
                
                # SL check first
                if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                    loss_r = (current_sl - entry) / risk if direction == "BUY" else (entry - current_sl) / risk
                    total_r += rem_w * loss_r
                    trade_closed = True
                    close_idx = k
                    break
                    
                # TP checks
                for item in targets:
                    w, tp_v, hit = item
                    if not hit:
                        if (direction == "BUY" and exit_high >= tp_v) or (direction == "SELL" and exit_low <= tp_v):
                            item[2] = True
                            gain_r = (tp_v - entry) / risk if direction == "BUY" else (entry - tp_v) / risk
                            total_r += w * gain_r
                            rem_w -= w
                            current_sl = entry # Auto-BE on TP1
                            
                if rem_w <= 0.001:
                    trade_closed = True
                    close_idx = k
                    break
                    
            if not trade_closed:
                last_candle = m15[min(j + 1 + 32, len(m15) - 1)]
                exit_c = last_candle['c'] if direction == "BUY" else last_candle['ac']
                final_r = (exit_c - entry) / risk if direction == "BUY" else (entry - exit_c) / risk
                total_r += rem_w * final_r
                close_idx = min(j + 1 + 32, len(m15) - 1)
                
            all_trades.append({
                "pair": pair,
                "dir": direction,
                "entry_time": next_b['t'],
                "wat_time": f"{wat_h:02d}:{wat_m:02d} WAT",
                "sl_pips": round(sl_pips, 1),
                "pip_val": d["pip_val"],
                "r": round(total_r, 2),
                "close_idx": close_idx
            })
            last_c = close_idx
            
    all_trades.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    
    # Compounding simulation
    equity = 677.0
    peak = 677.0
    max_dd_val = 0.0
    max_dd_pct = 0.0
    
    for t in all_trades:
        cash_risk = equity * (risk_pct / 100.0)
        lot = calculate_lot(cash_risk, t["sl_pips"], t["pip_val"])
        dollar_pl = cash_risk * t["r"]
        equity += dollar_pl
        if equity > peak: peak = equity
        dd = equity - peak
        if dd < max_dd_val:
            max_dd_val = dd
            max_dd_pct = (dd / peak) * 100.0
            
    wins = [t for t in all_trades if t["r"] > 0]
    losses = [t for t in all_trades if t["r"] <= 0]
    wr = (len(wins) / len(all_trades)) * 100.0 if all_trades else 0.0
    tot_r = sum(t["r"] for t in all_trades)
    
    # Calculate daily frequency
    # 180 days is ~126 trading days (excluding weekends)
    trades_per_day = len(all_trades) / 126.0
    trades_per_week = len(all_trades) / 26.0
    
    return {
        "trades": len(all_trades),
        "wins": len(wins),
        "losses": len(losses),
        "wr": wr,
        "tot_r": tot_r,
        "final_equity": equity,
        "net_dollar": equity - 677.0,
        "return_pct": ((equity - 677.0) / 677.0) * 100.0,
        "max_dd_pct": max_dd_pct,
        "trades_per_day": trades_per_day,
        "trades_per_week": trades_per_week
    }

if __name__ == "__main__":
    print("\n" + "="*100)
    print("ACTIVE DAILY TRADING FREQUENCY & EXPECTANCY SWEEP (180 DAYS / 6 MONTHS)")
    print("="*100)
    
    configs = [
        # (name, pairs, lookback, rr, risk, buffer)
        ("Config A: Primary 3 Pairs (12-bar Lookback, 1:2 RR, 3% Risk)", ["XAG/USD", "GBP/JPY", "EUR/USD"], 12, 2.0, 3.0, 1.0),
        ("Config B: Primary 3 Pairs (10-bar Lookback, 1:1.5 RR, 3% Risk)", ["XAG/USD", "GBP/JPY", "EUR/USD"], 10, 1.5, 3.0, 1.0),
        ("Config C: Primary 3 Pairs (8-bar Lookback, 1:1.5 RR, 2% Risk)", ["XAG/USD", "GBP/JPY", "EUR/USD"], 8, 1.5, 2.0, 0.8),
        ("Config D: 6-Pair Active Watchlist (10-bar Lookback, 1:2 RR, 2% Risk)", ["XAG/USD", "GBP/JPY", "EUR/USD", "XAU/USD", "USD/JPY", "GBP/USD"], 10, 2.0, 2.0, 1.0),
        ("Config E: 6-Pair Active Watchlist (8-bar Lookback, 1:1.5 RR, 2% Risk)", ["XAG/USD", "GBP/JPY", "EUR/USD", "XAU/USD", "USD/JPY", "GBP/USD"], 8, 1.5, 2.0, 0.8),
    ]
    
    for name, plist, lb, rr, rk, buf in configs:
        res = simulate_daily_active_smc(plist, lookback_bars=lb, rr_target=rr, risk_pct=rk, buffer_mult=buf)
        print(f"\n>>> {name}:")
        print(f"  Total Trades:       {res['trades']} trades ({res['trades_per_day']:.1f} trades / day | {res['trades_per_week']:.1f} trades / week)")
        print(f"  Exact Record (11a): {res['wins']} Wins / {res['losses']} Losses")
        print(f"  Win Rate:           {res['wr']:.1f}% ({res['wins']}W / {res['losses']}L)")
        print(f"  Total Realized R:   {res['tot_r']:+.2f}R")
        print(f"  Final Capital:      ${res['final_equity']:.2f} USD (Net P&L: {'+' if res['net_dollar']>=0 else ''}${res['net_dollar']:.2f} USD)")
        print(f"  Account Return:     {'+' if res['return_pct']>=0 else ''}{res['return_pct']:.1f}%")
        print(f"  Max Drawdown:       {res['max_dd_pct']:.1f}%")
        print("-" * 100)
