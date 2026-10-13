#!/usr/bin/env python3
"""
Long-Term Institutional Backtest: 180 Days (6 Months / April to October 2026)
Dataset: Over 85,000 M15 bars with real Bid/Ask broker quotes from Capital.com
"""

import os, sys, json, math, datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data_longterm")

TREND_CORE_PAIRS = [
    ("XAU/USD", "GOLD", 0.10, 0.08, "Metals"),
    ("XAG/USD", "SILVER", 0.01, 0.08, "Metals"),
    ("USD/JPY", "USDJPY", 0.01, 0.09, "Forex Major"),
    ("GBP/JPY", "GBPJPY", 0.01, 0.09, "Forex Cross"),
    ("EUR/JPY", "EURJPY", 0.01, 0.09, "Forex Cross"),
    ("USD/CHF", "USDCHF", 0.0001, 0.09, "Forex Major"),
]

PRIMARY_PAIRS = [
    ("XAG/USD", "SILVER", 0.01, 0.08, "Metals"),
    ("GBP/JPY", "GBPJPY", 0.01, 0.09, "Forex Cross"),
    ("EUR/USD", "EURUSD", 0.0001, 0.09, "Forex Major"),
]

def parse_iso(ts):
    s = ts.replace("Z", "").split("+")[0]
    dt = datetime.datetime.fromisoformat(s)
    return dt.replace(tzinfo=datetime.timezone.utc)

def utc_to_wat(utc_dt):
    return utc_dt + datetime.timedelta(hours=1)

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

def run_simulation(pairs_to_test, start_balance=677.0, risk_pct=6.0):
    all_raw_trades = []
    
    for pair, epic, p_size, pip_val, cat in pairs_to_test:
        m15_path = os.path.join(DATA_DIR, f"{epic}_M15.json")
        h1_path = os.path.join(DATA_DIR, f"{epic}_H1.json")
        if not (os.path.exists(m15_path) and os.path.exists(h1_path)): continue
        
        m15 = json.load(open(m15_path))
        h1 = json.load(open(h1_path))
        
        h1_times = [parse_iso(b['t']).timestamp() for b in h1]
        h1_closes = [b['c'] for b in h1]
        h1_ema10 = compute_ema(h1_closes, 10)
        h1_ema20 = compute_ema(h1_closes, 20)
        m15_atr = compute_atr(m15, 14)
        
        last_closed_idx = -1
        
        for j in range(25, len(m15) - 1):
            if j <= last_closed_idx: continue
            
            bar = m15[j]
            utc_dt = parse_iso(bar['t'])
            t = utc_dt.timestamp()
            wat_dt = utc_to_wat(utc_dt)
            mins = wat_dt.hour * 60 + wat_dt.minute
            
            # Active Session Window: 09:00 - 17:00 WAT (London + Pre-Market + NY Open)
            if not (9 * 60 <= mins <= 17 * 60): continue
            
            # Adjustment 1: Strictly Completed H1 Macro Trend Alignment
            h1_idx = get_last_completed_idx(h1_times, t, 3600.0)
            if h1_idx < 20: continue
            
            h1_c = h1[h1_idx]['c']
            e10 = h1_ema10[h1_idx]
            e20 = h1_ema20[h1_idx]
            
            bull = (e10 > e20) and (h1_c > e10)
            bear = (e10 < e20) and (h1_c < e10)
            if not (bull or bear): continue
            
            # M15 20-bar Liquidity Sweep
            prior_20 = m15[j-20:j]
            prior_low = min(b['l'] for b in prior_20)
            prior_high = max(b['h'] for b in prior_20)
            
            rng = bar['h'] - bar['l']
            if rng <= 0: continue
            body_ratio = abs(bar['c'] - bar['o']) / rng
            
            buy_setup = (bull and bar['l'] < prior_low and bar['c'] > prior_low and bar['c'] > bar['o'] and body_ratio >= 0.50)
            sell_setup = (bear and bar['h'] > prior_high and bar['c'] < prior_high and bar['c'] < bar['o'] and body_ratio >= 0.50)
            
            direction = "BUY" if buy_setup else ("SELL" if sell_setup else None)
            if not direction: continue
            
            entry_bar = m15[j+1] if j+1 < len(m15) else None
            if not entry_bar: continue
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            # Adjustment 2: Spread-Protection Stop Buffer (1.2x M15 ATR)
            sl_buffer = 1.2 * m15_atr[j]
            sl = bar['l'] - sl_buffer if direction == "BUY" else bar['h'] + sl_buffer
            risk = abs(entry_fill - sl)
            if risk <= 0: continue
            sl_pips = risk / p_size
            
            tp1 = entry_fill + 1.0 * risk if direction == "BUY" else entry_fill - 1.0 * risk
            tp2 = entry_fill + 2.5 * risk if direction == "BUY" else entry_fill - 2.5 * risk
            
            # Intrabar Execution Simulation (SL checked first)
            targets = [[0.5, tp1, False], [0.5, tp2, False]]
            current_sl = sl
            rem_w = 1.0
            total_r = 0.0
            trade_closed = False
            close_idx = j + 1
            
            for k in range(j + 2, min(j + 2 + 32, len(m15))):
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
                last_b = m15[min(j + 1 + 32, len(m15) - 1)]
                exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
                final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
                total_r += rem_w * final_r
                close_idx = min(j + 1 + 32, len(m15) - 1)
                
            all_raw_trades.append({
                "pair": pair, "dir": direction, "utc_entry": entry_bar['t'],
                "wat_entry": f"{wat_dt.strftime('%Y-%m-%d %I:%M %p')} WAT",
                "entry_price": entry_fill, "sl_price": sl, "sl_pips": round(sl_pips, 1),
                "pip_val": pip_val, "realized_r": round(total_r, 2)
            })
            last_closed_idx = close_idx
            
    # Chronological sort across portfolio
    all_raw_trades.sort(key=lambda x: parse_iso(x["utc_entry"]).timestamp())
    
    equity = start_balance
    peak_equity = start_balance
    max_dd_val = 0.0
    max_dd_pct = 0.0
    compounded_trades = []
    
    for t in all_raw_trades:
        cash_risk = equity * (risk_pct / 100.0)
        lot = calculate_lot(cash_risk, t["sl_pips"], t["pip_val"])
        dollar_pl = cash_risk * t["realized_r"]
        equity += dollar_pl
        
        if equity > peak_equity: peak_equity = equity
        dd = equity - peak_equity
        if dd < max_dd_val:
            max_dd_val = dd
            max_dd_pct = (dd / peak_equity) * 100.0
            
        t["lot_size"] = lot
        t["dollar_pl"] = round(dollar_pl, 2)
        t["balance_after"] = round(equity, 2)
        compounded_trades.append(t)
        
    wins = [t for t in compounded_trades if t["realized_r"] > 0]
    losses = [t for t in compounded_trades if t["realized_r"] <= 0]
    wr = (len(wins) / len(compounded_trades)) * 100.0 if compounded_trades else 0.0
    tot_r = sum(t["realized_r"] for t in compounded_trades)
    avg_r = tot_r / len(compounded_trades) if compounded_trades else 0.0
    
    gross_win = sum(t["dollar_pl"] for t in wins)
    gross_loss = abs(sum(t["dollar_pl"] for t in losses))
    pf = (gross_win / gross_loss) if gross_loss > 0 else 99.9
    
    return {
        "trades": compounded_trades,
        "tot": len(compounded_trades),
        "wins": len(wins),
        "losses": len(losses),
        "wr": wr,
        "tot_r": tot_r,
        "avg_r": avg_r,
        "start": start_balance,
        "final": equity,
        "pf": pf,
        "max_dd_val": max_dd_val,
        "max_dd_pct": max_dd_pct
    }

if __name__ == "__main__":
    print("\n" + "="*95)
    print("180-DAY (6 MONTHS) COMPREHENSIVE LONG-TERM BACKTEST AUDIT")
    print("Window: April 14, 2026 to October 13, 2026 (~85,000 M15 Candles, Spread-Aware)")
    print("="*95)
    
    # 1. Primary Basket (XAG/USD Silver, GBP/JPY, EUR/USD)
    res_primary = run_simulation(PRIMARY_PAIRS, 677.0, 6.0)
    print(f"\n>>> 1. PRIMARY 3 PAIRS (XAG/USD, GBP/JPY, EUR/USD):")
    print(f"  Initial Equity:         ${res_primary['start']:.2f} USD (67,700 Cents)")
    print(f"  Final Equity:           ${res_primary['final']:.2f} USD ({res_primary['final']*100:.0f} Cents)")
    print(f"  Net Capital Return:     {((res_primary['final'] - 677.0)/677.0)*100.0:+.1f}% (+${res_primary['final'] - 677.0:+.2f} USD)")
    print(f"  Total Trades:           {res_primary['tot']} trades (~1.1 trades / week)")
    print(f"  Exact Record (11a):     {res_primary['wins']} Wins / {res_primary['losses']} Losses")
    print(f"  Win Rate:               {res_primary['wr']:.1f}% ({res_primary['wins']}W / {res_primary['losses']}L)")
    print(f"  Total Realized R:       {res_primary['tot_r']:+.2f}R")
    print(f"  Profit Factor:          {res_primary['pf']:.2f}")
    print(f"  Max Drawdown:           ${res_primary['max_dd_val']:.2f} ({res_primary['max_dd_pct']:.1f}%)")
    
    # 2. Full Trend Core Universe (6 Pairs)
    res_core = run_simulation(TREND_CORE_PAIRS, 677.0, 6.0)
    print(f"\n>>> 2. FULL TREND CORE UNIVERSE (6 PAIRS: GOLD, SILVER, USD/JPY, GBP/JPY, EUR/JPY, USD/CHF):")
    print(f"  Initial Equity:         ${res_core['start']:.2f} USD (67,700 Cents)")
    print(f"  Final Equity:           ${res_core['final']:.2f} USD ({res_core['final']*100:.0f} Cents)")
    print(f"  Net Capital Return:     {((res_core['final'] - 677.0)/677.0)*100.0:+.1f}% (+${res_core['final'] - 677.0:+.2f} USD)")
    print(f"  Total Trades:           {res_core['tot']} trades (~1.6 trades / week)")
    print(f"  Exact Record (11a):     {res_core['wins']} Wins / {res_core['losses']} Losses")
    print(f"  Win Rate:               {res_core['wr']:.1f}% ({res_core['wins']}W / {res_core['losses']}L)")
    print(f"  Total Realized R:       {res_core['tot_r']:+.2f}R")
    print(f"  Profit Factor:          {res_core['pf']:.2f}")
    print(f"  Max Drawdown:           ${res_core['max_dd_val']:.2f} ({res_core['max_dd_pct']:.1f}%)")
    print("="*95)
