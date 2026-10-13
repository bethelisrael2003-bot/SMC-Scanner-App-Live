#!/usr/bin/env python3
"""
Backtest: Professional SMC (Aggressive Growth Mode) with the Two Critical Adjustments:
=====================================================================================
Adjustment 1: Strictly Completed H1 Macro Trend Alignment (H1 EMA10 vs EMA20 + H1 Close)
Adjustment 2: Stop Loss Buffer = Sweep Extreme +/- 1.2x M15 ATR(14) (Spread Spike Protection)

Parameters:
- Account: RoboForex Cent Account
- Starting Balance: $677.00 USD (67,700 Cents)
- Risk: Fixed 6.0% per trade ($40.62 initial cash risk)
- Lot Size: (Cash Risk) / (SL_Pips * Pip_Val) / 100, floored down to nearest 0.01 lot
- Timezone: West Africa Time (WAT = UTC+1)
- Sessions: London Kill Zone (09:00 - 12:00 WAT), NY Kill Zone (15:30 - 19:00 WAT)
- Targets: 50% @ TP1 (1:2.0 RR + Auto-BE), 50% @ TP2 (3.5R Runner / Major Liquidity)
"""

import os, sys, json, math, datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

PRIMARY_PAIRS = [
    ("XAG/USD", "SILVER", 0.01, 0.08, "Metals"),
    ("GBP/JPY", "GBPJPY", 0.01, 0.09, "Forex Cross"),
    ("EUR/USD", "EURUSD", 0.0001, 0.09, "Forex Major")
]

TREND_CORE_PAIRS = [
    ("XAU/USD", "GOLD", 0.10, 0.08, "Metals"),
    ("XAG/USD", "SILVER", 0.01, 0.08, "Metals"),
    ("USD/JPY", "USDJPY", 0.01, 0.09, "Forex Major"),
    ("GBP/JPY", "GBPJPY", 0.01, 0.09, "Forex Cross"),
    ("EUR/JPY", "EURJPY", 0.01, 0.09, "Forex Cross"),
    ("USD/CHF", "USDCHF", 0.0001, 0.09, "Forex Major")
]

def parse_iso(ts):
    s = ts.replace("Z", "").split("+")[0]
    dt = datetime.datetime.fromisoformat(s)
    return dt.replace(tzinfo=datetime.timezone.utc)

def utc_to_wat(utc_dt):
    return utc_dt + datetime.timedelta(hours=1)

def check_wat_session(wat_dt):
    mins = wat_dt.hour * 60 + wat_dt.minute
    london_start = 9 * 60
    london_end = 12 * 60
    ny_start = 15 * 60 + 30
    ny_end = 19 * 60
    
    if london_start <= mins <= london_end:
        return True, "LONDON_OPEN"
    elif ny_start <= mins <= ny_end:
        return True, "NEW_YORK_OPEN"
    else:
        return False, "OUTSIDE_KILLZONE"

def calculate_lot(cash_risk, sl_pips, pip_val):
    if sl_pips <= 0 or pip_val <= 0: return 0.01
    raw_lot = cash_risk / (sl_pips * pip_val) / 100.0
    lot = math.floor(raw_lot * 100.0) / 100.0
    return max(0.01, lot)

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

def load_pair_data(pair, epic, p_size, pip_val, cat):
    m15_file = os.path.join(DATA_DIR, f"{epic}_M15.json")
    h1_file = os.path.join(DATA_DIR, f"{epic}_H1.json")
    h4_file = os.path.join(DATA_DIR, f"{epic}_H4.json")
    
    if not (os.path.exists(m15_file) and os.path.exists(h1_file)):
        return None
        
    m15 = json.load(open(m15_file))
    h1 = json.load(open(h1_file))
    h4 = json.load(open(h4_file)) if os.path.exists(h4_file) else []
    
    h1_closes = [b['c'] for b in h1]
    
    return {
        "pair": pair, "epic": epic, "p_size": p_size, "pip_val": pip_val, "category": cat,
        "m15": m15, "h1": h1, "h4": h4,
        "m15_times": [parse_iso(b['t']).timestamp() for b in m15],
        "h1_times": [parse_iso(b['t']).timestamp() for b in h1],
        "h4_times": [parse_iso(b['t']).timestamp() for b in h4],
        "m15_atr": compute_atr(m15, 14),
        "h1_atr": compute_atr(h1, 14),
        "h1_ema10": compute_ema(h1_closes, 10),
        "h1_ema20": compute_ema(h1_closes, 20),
    }

def run_backtest_for_universe(pair_list, title=""):
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
            
            # Step 1: Session Timing (WAT Kill Zones)
            is_kz, kz_name = check_wat_session(wat_dt)
            if not is_kz: continue
            
            # ── ADJUSTMENT 1: Strictly Completed H1 Macro Trend Alignment ──────
            # Uses strictly completed H1 bar (start <= t - 3600.0)
            h1_idx = get_last_completed_idx(d["h1_times"], t, 3600.0)
            if h1_idx < 20: continue
            
            h1_c = h1[h1_idx]['c']
            e10 = h1_ema10[h1_idx]
            e20 = h1_ema20[h1_idx]
            
            bull = (e10 > e20) and (h1_c > e10)
            bear = (e10 < e20) and (h1_c < e10)
            if not (bull or bear): continue
            
            # Step 2: M15 Liquidity Sweep & Displacement
            prior_20 = m15[j-20:j]
            prior_low = min(b['l'] for b in prior_20)
            prior_high = max(b['h'] for b in prior_20)
            
            rng = bar['h'] - bar['l']
            if rng <= 0: continue
            body = abs(bar['c'] - bar['o'])
            body_ratio = body / rng
            
            # BUY: M15 sweeps prior 20-bar low and closes back above it with bullish body >= 50%
            buy_setup = (bull and bar['l'] < prior_low and bar['c'] > prior_low and 
                         bar['c'] > bar['o'] and body_ratio >= 0.50)
                         
            # SELL: M15 sweeps prior 20-bar high and closes back below it with bearish body >= 50%
            sell_setup = (bear and bar['h'] > prior_high and bar['c'] < prior_high and 
                          bar['c'] < bar['o'] and body_ratio >= 0.50)
                          
            direction = "BUY" if buy_setup else ("SELL" if sell_setup else None)
            if not direction: continue
            
            # Entry on next bar open (spread-aware)
            entry_bar = m15[j+1] if j+1 < len(m15) else None
            if not entry_bar: continue
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            # ── ADJUSTMENT 2: Stop Loss Buffer = Sweep Extreme +/- 1.2x M15 ATR ──
            # Prevents spread spike stops on market opens
            cur_atr = m15_atr[j]
            sl_buffer = 1.2 * cur_atr
            
            if direction == "BUY":
                sl = bar['l'] - sl_buffer
            else:
                sl = bar['h'] + sl_buffer
                
            risk = abs(entry_fill - sl)
            if risk <= 0: continue
            sl_pips = risk / p_size
            
            # Targets:
            # TP1: 1:2.00 RR (50% scale-out + auto-BE)
            # TP2: 3.50 RR (50% runner)
            tp1 = entry_fill + 2.0 * risk if direction == "BUY" else entry_fill - 2.0 * risk
            tp2 = entry_fill + 3.5 * risk if direction == "BUY" else entry_fill - 3.5 * risk
            
            targets = [(0.5, tp1), (0.5, tp2)]
            active_targets = [[w, tp_v, False] for w, tp_v in targets]
            
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
                
                # SL check (SL evaluated first)
                if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
                    loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
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
                            gain_r = (tp_level - entry_fill) / risk if direction == "BUY" else (entry_fill - tp_level) / risk
                            total_r += w * gain_r
                            rem_weight -= w
                            current_sl = entry_fill # Auto-BE on TP1
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
                
            all_raw_trades.append({
                "pair": pair,
                "dir": direction,
                "utc_entry": entry_bar['t'],
                "wat_entry": f"{wat_dt.strftime('%Y-%m-%d')} {wat_dt.strftime('%I:%M %p')} WAT",
                "session": kz_name,
                "entry_price": entry_fill,
                "sl_price": sl,
                "tp1_price": tp1,
                "tp2_price": tp2,
                "sl_pips": round(sl_pips, 1),
                "pip_val": pip_val,
                "p_size": p_size,
                "realized_r": round(total_r, 2),
                "close_idx": close_idx
            })
            last_closed_idx = close_idx
            
    # Sort chronologically across the portfolio
    all_raw_trades.sort(key=lambda x: parse_iso(x["utc_entry"]).timestamp())
    
    # Simulate Account Equity Compounding ($677.00 USD @ 6.0% Risk)
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
        
        if equity > peak_equity:
            peak_equity = equity
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
    print(f"ADJUSTED BACKTEST REPORT: {title}")
    print("="*105)
    print(f"  Initial Cent Balance:   $677.00 USD (67,700 Cents)")
    print(f"  Final Balance:          ${equity:.2f} USD ({equity*100.0:.0f} Cents)")
    print(f"  Net Profit / Return:    ${equity - 677.0:+.2f} USD ({((equity - 677.0)/677.0)*100.0:+.1f}%)")
    print(f"  Total Trades:           {tot} trades")
    print(f"  Exact Record (Rule 11a):{w_count} Wins / {l_count} Losses")
    print(f"  Win Rate:               {wr:.1f}% ({w_count}W / {l_count}L)")
    print(f"  Net Realized R:         {tot_r:+.2f}R")
    print(f"  Average R per Trade:    {avg_r:+.2f}R")
    print(f"  Profit Factor:          {pf:.2f}")
    print(f"  Max Drawdown ($ / %):   ${max_dd_val:.2f} ({max_dd_pct:.1f}%)")
    print("-"*105)
    
    # Granular trade log
    print(f"  {'#':<3} {'Pair':<9} {'Dir':<5} {'WAT Timestamp':<23} {'Session':<15} {'Entry':<10} {'SL':<10} {'Pips':<6} {'Lot':<6} {'R-Out':<7} {'P&L ($)':<9} {'Balance'}")
    print("  " + "-"*100)
    for idx, t in enumerate(compounded_trades, 1):
        dec = 2 if "XAG" in t["pair"] or "XAU" in t["pair"] else (3 if "JPY" in t["pair"] else 5)
        entry_str = f"{t['entry_price']:.{dec}f}"
        sl_str = f"{t['sl_price']:.{dec}f}"
        print(f"  {idx:<3} {t['pair']:<9} {t['dir']:<5} {t['wat_entry']:<23} {t['session']:<15} {entry_str:<10} {sl_str:<10} {t['sl_pips']:<6.1f} {t['lot_size']:<6.2f} {t['realized_r']:>+5.2f}R ${t['dollar_pl']:>+7.2f} ${t['balance_after']:.2f}")
    print("="*105)
    
    return compounded_trades, equity

if __name__ == "__main__":
    print("\n" + "#"*105)
    print("RUNNING INSTITUTIONAL BACKTEST WITH THE TWO CRITICAL ADJUSTMENTS")
    print("Adjustment 1: Strictly Completed H1 Macro Trend Alignment (H1 EMA10 vs EMA20 + Close)")
    print("Adjustment 2: Stop Loss Buffer = Sweep Extreme +/- 1.2x M15 ATR(14)")
    print("#"*105)
    
    # 1. Backtest on Primary Pairs (XAG/USD, GBP/JPY, EUR/USD)
    run_backtest_for_universe(PRIMARY_PAIRS, "Primary 3 Instruments (XAG/USD, GBP/JPY, EUR/USD)")
    
    # 2. Backtest on Trend Core Universe (XAG/USD, GBP/JPY, USD/JPY, EUR/JPY, USD/CHF, XAU/USD)
    run_backtest_for_universe(TREND_CORE_PAIRS, "Full Trend Core Universe (6 Pairs including XAG/USD & GBP/JPY)")
