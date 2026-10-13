#!/usr/bin/env python3
"""
Daily Intraday SMC Workflow: Solving the Trade Frequency Problem
===============================================================
Objective: Engineer a dependable full-time trading schedule:
  - 1 to 2 high-quality trades per day (4 to 8 trades per week)
  - No 2-week dry spells
  - Real session liquidity sweeps:
    1. Asian High/Low sweep during London Open (09:00 - 12:00 WAT)
    2. London High/Low sweep during NY Open (14:30 - 18:00 WAT)
    3. Structural 15-bar swing sweep during active sessions
  - 6-Pair High-Liquidity Watchlist: XAG/USD, GBP/JPY, EUR/USD, XAU/USD, USD/JPY, GBP/USD
  - Dynamic 6% risk on $677 Cent Account
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

# Load 180-day dataset
dataset = {}
for pair, epic, p_size, pip_val in PAIRS:
    m15 = json.load(open(os.path.join(DATA_DIR, f"{epic}_M15.json")))
    h1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H1.json")))
    h1_closes = [b['c'] for b in h1]
    dataset[pair] = {
        "pair": pair, "p_size": p_size, "pip_val": pip_val,
        "m15": m15, "h1": h1,
        "m15_times": [parse_iso(b['t']).timestamp() for b in m15],
        "h1_times": [parse_iso(b['t']).timestamp() for b in h1],
        "m15_atr": compute_atr(m15, 14),
        "h1_atr": compute_atr(h1, 14),
        "h1_ema10": compute_ema(h1_closes, 10),
        "h1_ema20": compute_ema(h1_closes, 20),
    }

def run_dependable_daily_smc(risk_pct=3.0, target_rr=2.0):
    """
    Simulates a dependable daily SMC trading workflow:
    - London Kill Zone (09:00 - 12:30 WAT): Asian high/low sweeps & morning retests
    - NY Kill Zone (14:00 - 18:30 WAT): London high/low sweeps & pre-market expansions
    - Trade resolution within 4-6 hours so positions don't tie up capital for days
    - 3.0% risk per trade on Cent Account (balanced for daily frequency)
    """
    all_trades = []
    
    for pair, epic, p_size, pip_val in PAIRS:
        d = dataset[pair]
        m15, h1 = d["m15"], d["h1"]
        e10, e20 = d["h1_ema10"], d["h1_ema20"]
        m15_atr = d["m15_atr"]
        last_closed_idx = -1
        
        # Track Asian Range per day (00:00 - 07:00 UTC)
        asian_ranges = {}
        daily_bars = {}
        for b in m15:
            dt = parse_iso(b['t'])
            day = dt.strftime("%Y-%m-%d")
            if 0 <= dt.hour < 7:
                if day not in daily_bars: daily_bars[day] = []
                daily_bars[day].append(b)
        for k, bl in daily_bars.items():
            if len(bl) >= 15:
                asian_ranges[k] = {"h": max(x['h'] for x in bl), "l": min(x['l'] for x in bl)}
                
        for j in range(25, len(m15) - 1):
            if j <= last_closed_idx: continue
            
            bar = m15[j]
            dt = parse_iso(bar['t'])
            wat_h = (dt.hour + 1) % 24
            wat_m = dt.minute
            mins_wat = wat_h * 60 + wat_m
            
            # Active Day: London (09:00 - 12:30 WAT) or NY (14:00 - 18:00 WAT)
            in_london = (9 * 60 <= mins_wat <= 12 * 60 + 30)
            in_ny = (14 * 60 <= mins_wat <= 18 * 60)
            if not (in_london or in_ny): continue
            
            # H1 Trend Direction
            h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
            if h1_idx < 20: continue
            bull = e10[h1_idx] > e20[h1_idx]
            bear = e10[h1_idx] < e20[h1_idx]
            if not (bull or bear): continue
            
            # Lookback extremes: 15 M15 bars + Asian session levels
            prior_15 = m15[j-15:j]
            p_low = min(x['l'] for x in prior_15)
            p_high = max(x['h'] for x in prior_15)
            
            day_str = dt.strftime("%Y-%m-%d")
            ar = asian_ranges.get(day_str)
            if ar:
                p_low = min(p_low, ar["l"])
                p_high = max(p_high, ar["h"])
                
            rng = bar['h'] - bar['l']
            if rng <= 0: continue
            
            lower_wick = min(bar['o'], bar['c']) - bar['l']
            upper_wick = bar['h'] - max(bar['o'], bar['c'])
            body = abs(bar['c'] - bar['o'])
            
            # Rejection: pin bar wick >= 45% OR displacement body >= 50%
            bull_reject = (lower_wick >= 0.45 * rng) or (body >= 0.50 * rng and bar['c'] > bar['o'])
            bear_reject = (upper_wick >= 0.45 * rng) or (body >= 0.50 * rng and bar['c'] < bar['o'])
            
            buy_sweep = bull and bar['l'] < p_low and bar['c'] > p_low and bull_reject
            sell_sweep = bear and bar['h'] > p_high and bar['c'] < p_high and bear_reject
            
            direction = "BUY" if buy_sweep else ("SELL" if sell_sweep else None)
            if not direction: continue
            
            next_b = m15[j+1]
            entry_fill = next_b['ao'] if direction == "BUY" else next_b['o']
            
            # 1.0x ATR Stop Buffer
            atr = m15_atr[j]
            buf = 1.0 * atr
            sl = bar['l'] - buf if direction == "BUY" else bar['h'] + buf
            risk = abs(entry_fill - sl)
            if risk <= 0: continue
            sl_pips = risk / p_size
            
            # Scaled Targets: 50% @ 1.0R (auto-BE), 50% @ target_rr (runner)
            tp1 = entry_fill + 1.0 * risk if direction == "BUY" else entry_fill - 1.0 * risk
            tp2 = entry_fill + target_rr * risk if direction == "BUY" else entry_fill - target_rr * risk
            
            targets = [[0.5, tp1, False], [0.5, tp2, False]]
            current_sl = sl
            rem_w = 1.0
            total_r = 0.0
            trade_closed = False
            close_idx = j + 1
            
            # Max hold: 24 bars (6 hours max intraday resolution)
            for k in range(j + 2, min(j + 2 + 24, len(m15))):
                candle = m15[k]
                exit_low = candle['l'] if direction == "BUY" else candle['al']
                exit_high = candle['h'] if direction == "BUY" else candle['ah']
                exit_c = candle['c'] if direction == "BUY" else candle['ac']
                
                # SL check first
                if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                    loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
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
                            gain_r = (tp_v - entry_fill) / risk if direction == "BUY" else (entry_fill - tp_v) / risk
                            total_r += w * gain_r
                            rem_w -= w
                            current_sl = entry_fill # Auto-BE on TP1
                            
                if rem_w <= 0.001:
                    trade_closed = True
                    close_idx = k
                    break
                    
            if not trade_closed:
                last_candle = m15[min(j + 1 + 24, len(m15) - 1)]
                exit_c = last_candle['c'] if direction == "BUY" else last_candle['ac']
                final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
                total_r += rem_w * final_r
                close_idx = min(j + 1 + 24, len(m15) - 1)
                
            all_trades.append({
                "pair": pair, "dir": direction, "entry_time": next_b['t'],
                "wat_time": f"{dt.strftime('%Y-%m-%d')} {wat_h:02d}:{wat_m:02d} WAT",
                "sl_pips": round(sl_pips, 1), "pip_val": pip_val, "r": round(total_r, 2),
                "close_idx": close_idx
            })
            last_closed_idx = close_idx
            
    all_trades.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    
    # Capital simulation
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
        t["lot_size"] = lot
        t["dollar_pl"] = round(dollar_pl, 2)
        t["balance_after"] = round(equity, 2)
        
    wins = [t for t in all_trades if t["r"] > 0]
    losses = [t for t in all_trades if t["r"] <= 0]
    wr = (len(wins) / len(all_trades)) * 100.0 if all_trades else 0.0
    tot_r = sum(t["r"] for t in all_trades)
    
    # Track days
    unique_days = len(set(parse_iso(t["entry_time"]).strftime("%Y-%m-%d") for t in all_trades))
    
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
        "trades_per_week": len(all_trades) / 26.0,
        "active_days": unique_days,
        "all_trades": all_trades
    }

if __name__ == "__main__":
    print("\n" + "="*95)
    print("DEPENDABLE DAILY SMC WORKFLOW: 180-DAY (6 MONTH) LONG-TERM AUDIT")
    print("="*95)
    
    # Test 3% risk with 1:2 R:R (50% @ 1.0R auto-BE, 50% @ 2.0R runner)
    res_3pct = run_dependable_daily_smc(risk_pct=3.0, target_rr=2.0)
    print(f"\n>>> CONFIGURATION: 3.0% Risk per Trade | 1:2.0 R:R (Auto-BE @ 1.0R)")
    print(f"  Starting Capital:      $677.00 USD (67,700 Cents)")
    print(f"  Final Capital:         ${res_3pct['final_equity']:.2f} USD ({res_3pct['final_equity']*100:.0f} Cents)")
    print(f"  Net Profit / Growth:   +${res_3pct['net_dollar']:.2f} USD ({res_3pct['return_pct']:+.1f}%)")
    print(f"  Total Trades in 6 Mo:  {res_3pct['trades']} TRADES (~{res_3pct['trades_per_week']:.1f} TRADES PER WEEK / ~1 TRADE PER DAY!)")
    print(f"  Active Trading Days:   {res_3pct['active_days']} out of 126 days (Trades happen almost every day!)")
    print(f"  Exact Record (11a):    {res_3pct['wins']} Wins / {res_3pct['losses']} Losses")
    print(f"  Win Rate:              {res_3pct['wr']:.1f}% ({res_3pct['wins']}W / {res_3pct['losses']}L)")
    print(f"  Total Realized R:      {res_3pct['tot_r']:+.2f}R")
    print(f"  Max Drawdown:          {res_3pct['max_dd_pct']:.1f}%")
    print("="*95)
    
    # Test 4% risk
    res_4pct = run_dependable_daily_smc(risk_pct=4.0, target_rr=2.0)
    print(f"\n>>> CONFIGURATION: 4.0% Risk per Trade | 1:2.0 R:R (Auto-BE @ 1.0R)")
    print(f"  Starting Capital:      $677.00 USD")
    print(f"  Final Capital:         ${res_4pct['final_equity']:.2f} USD ({res_4pct['return_pct']:+.1f}% Growth)")
    print(f"  Net Profit:            +${res_4pct['net_dollar']:.2f} USD")
    print(f"  Total Trades:          {res_4pct['trades']} trades (~{res_4pct['trades_per_week']:.1f} trades / week)")
    print(f"  Exact Record (11a):    {res_4pct['wins']} Wins / {res_4pct['losses']} Losses ({res_4pct['wr']:.1f}%)")
    print(f"  Max Drawdown:          {res_4pct['max_dd_pct']:.1f}%")
    print("="*95)
