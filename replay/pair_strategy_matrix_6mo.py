#!/usr/bin/env python3
"""
Pair-Specific Strategy Optimization: 6-Month Comprehensive Matrix
================================================================
Evaluates all strategy engines individually on:
  1. XAG/USD (Silver)
  2. GBP/JPY
  3. EUR/USD

Determines:
  - Grade A Dedicated Strategy for each pair
  - Grade B Alternative Strategy
  - Grade C Strategy
  - Confluence matrix (A+ Signal when Grade A agrees with Grade B/C; B+ when B and C agree)
"""

import os, sys, json, math, datetime
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "data_longterm")

PAIRS = [
    ("XAG/USD", "SILVER", 0.01, 0.08),
    ("GBP/JPY", "GBPJPY", 0.01, 0.09),
    ("EUR/USD", "EURUSD", 0.0001, 0.09),
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
data_store = {}
for pair, epic, p_size, pip_val in PAIRS:
    m15_p = os.path.join(DATA_DIR, f"{epic}_M15.json")
    h1_p = os.path.join(DATA_DIR, f"{epic}_H1.json")
    h4_p = os.path.join(DATA_DIR, f"{epic}_H4.json")
    if not (os.path.exists(m15_p) and os.path.exists(h1_p)): continue
    
    m15 = json.load(open(m15_p))
    h1 = json.load(open(h1_p))
    h4 = json.load(open(h4_p)) if os.path.exists(h4_p) else []
    
    h1_closes = [b['c'] for b in h1]
    h4_closes = [b['c'] for b in h4] if h4 else []
    
    data_store[pair] = {
        "pair": pair, "p_size": p_size, "pip_val": pip_val,
        "m15": m15, "h1": h1, "h4": h4,
        "m15_times": [parse_iso(b['t']).timestamp() for b in m15],
        "h1_times": [parse_iso(b['t']).timestamp() for b in h1],
        "h4_times": [parse_iso(b['t']).timestamp() for b in h4] if h4 else [],
        "m15_atr": compute_atr(m15, 14),
        "h1_atr": compute_atr(h1, 14),
        "h4_atr": compute_atr(h4, 14) if h4 else [],
        "h1_ema10": compute_ema(h1_closes, 10),
        "h1_ema20": compute_ema(h1_closes, 20),
        "h1_ema50": compute_ema(h1_closes, 50),
        "h1_ema200": compute_ema(h1_closes, 200),
        "h4_ema20": compute_ema(h4_closes, 20) if h4 else [],
        "h4_ema50": compute_ema(h4_closes, 50) if h4 else [],
    }

# Simulation helper
def sim_trade(m15, entry_idx, direction, entry_fill, sl, targets, p_size, pip_val, stale_h=12):
    risk = abs(entry_fill - sl)
    if risk <= 0: return None
    sl_pips = risk / p_size
    current_sl = sl
    rem_w = 1.0
    total_r = 0.0
    active_targets = [[w, tp, False] for w, tp in targets]
    t0 = parse_iso(m15[entry_idx]['t']).timestamp()
    close_idx = entry_idx
    
    for k in range(entry_idx + 1, min(entry_idx + 1 + 96, len(m15))):
        b = m15[k]
        exit_low = b['l'] if direction == "BUY" else b['al']
        exit_high = b['h'] if direction == "BUY" else b['ah']
        exit_c = b['c'] if direction == "BUY" else b['ac']
        
        age_h = (parse_iso(b['t']).timestamp() - t0) / 3600.0
        if stale_h > 0 and age_h >= stale_h and rem_w == 1.0:
            prog = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
            if prog < 0:
                total_r = prog
                close_idx = k
                break
                
        # SL check first
        if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
            loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
            total_r += rem_w * loss_r
            close_idx = k
            break
            
        for item in active_targets:
            w, tp, hit = item
            if not hit:
                if (direction == "BUY" and exit_high >= tp) or (direction == "SELL" and exit_low <= tp):
                    item[2] = True
                    gain_r = (tp - entry_fill) / risk if direction == "BUY" else (entry_fill - tp) / risk
                    total_r += w * gain_r
                    rem_w -= w
                    current_sl = entry_fill # Auto-BE
                    
        if rem_w <= 0.001:
            close_idx = k
            break
            
    if close_idx == entry_idx:
        last_b = m15[min(entry_idx + 96, len(m15) - 1)]
        exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
        final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
        total_r += rem_w * final_r
        close_idx = min(entry_idx + 96, len(m15) - 1)
        
    return {
        "r": round(total_r, 2),
        "sl_pips": round(sl_pips, 1),
        "pip_val": pip_val,
        "entry_time": m15[entry_idx]['t'],
        "close_idx": close_idx,
        "dir": direction
    }

# ── STRATEGY EVALUATORS PER PAIR ─────────────────────────────────────────────

def eval_trend_sweep(pair):
    d = data_store[pair]
    m15, h1 = d["m15"], d["h1"]
    e10, e20 = d["h1_ema10"], d["h1_ema20"]
    m15_atr = d["m15_atr"]
    trades = []
    last_c = -1
    
    for j in range(25, len(m15) - 1):
        if j <= last_c: continue
        b = m15[j]
        dt = parse_iso(b['t'])
        wat_h = (dt.hour + 1) % 24
        mins = wat_h * 60 + dt.minute
        if not (9 * 60 <= mins <= 17 * 60): continue
        
        h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
        if h1_idx < 20: continue
        bull = e10[h1_idx] > e20[h1_idx] and h1[h1_idx]['c'] > e10[h1_idx]
        bear = e10[h1_idx] < e20[h1_idx] and h1[h1_idx]['c'] < e10[h1_idx]
        if not (bull or bear): continue
        
        prior_20 = m15[j-20:j]
        p_low = min(x['l'] for x in prior_20)
        p_high = max(x['h'] for x in prior_20)
        rng = b['h'] - b['l']
        if rng <= 0: continue
        body_ratio = abs(b['c'] - b['o']) / rng
        
        buy = bull and b['l'] < p_low and b['c'] > p_low and b['c'] > b['o'] and body_ratio >= 0.50
        sell = bear and b['h'] > p_high and b['c'] < p_high and b['c'] < b['o'] and body_ratio >= 0.50
        direction = "BUY" if buy else ("SELL" if sell else None)
        if not direction: continue
        
        next_b = m15[j+1]
        entry = next_b['ao'] if direction == "BUY" else next_b['o']
        buf = 1.2 * m15_atr[j]
        sl = b['l'] - buf if direction == "BUY" else b['h'] + buf
        risk = abs(entry - sl)
        if risk <= 0: continue
        
        targets = [(0.5, entry + 1.0 * risk if direction == "BUY" else entry - 1.0 * risk),
                   (0.5, entry + 2.5 * risk if direction == "BUY" else entry - 2.5 * risk)]
        res = sim_trade(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
        if res:
            trades.append(res)
            last_c = res["close_idx"]
    return trades

def eval_asian_breakout(pair):
    d = data_store[pair]
    m15, h1 = d["m15"], d["h1"]
    h1_atr = d["h1_atr"]
    trades = []
    last_c = -1
    
    # Track Asian Range (00:00 - 07:00 UTC)
    days = {}
    for b in m15:
        dt = parse_iso(b['t'])
        k = dt.strftime("%Y-%m-%d")
        if 0 <= dt.hour < 7:
            if k not in days: days[k] = []
            days[k].append(b)
            
    asian_ranges = {}
    for k, bl in days.items():
        if len(bl) >= 20:
            ah, al = max(x['h'] for x in bl), min(x['l'] for x in bl)
            asian_ranges[k] = {"h": ah, "l": al, "rng": ah - al}
            
    for j in range(25, len(m15) - 1):
        if j <= last_c: continue
        b = m15[j]
        dt = parse_iso(b['t'])
        mins = dt.hour * 60 + dt.minute
        if not (7 * 60 <= mins <= 10 * 60 + 30): continue
        ar = asian_ranges.get(dt.strftime("%Y-%m-%d"))
        if not ar: continue
        
        h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
        if h1_idx < 14: continue
        atr = h1_atr[h1_idx]
        if not (0.36 * atr <= ar["rng"] <= 1.35 * atr): continue
        
        buy = b['c'] > ar["h"] + 0.06 * atr and (b['h'] - b['l']) >= 0.36 * ar["rng"]
        sell = b['c'] < ar["l"] - 0.06 * atr and (b['h'] - b['l']) >= 0.36 * ar["rng"]
        direction = "BUY" if buy else ("SELL" if sell else None)
        if not direction: continue
        
        next_b = m15[j+1]
        entry = next_b['ao'] if direction == "BUY" else next_b['o']
        sl = ar["l"] - 0.08 * ar["rng"] if direction == "BUY" else ar["h"] + 0.08 * ar["rng"]
        risk = abs(entry - sl)
        if risk <= 0: continue
        
        targets = [(0.35, entry + 1.5 * risk if direction == "BUY" else entry - 1.5 * risk),
                   (0.65, entry + 4.0 * risk if direction == "BUY" else entry - 4.0 * risk)]
        res = sim_trade(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"], stale_h=7)
        if res:
            trades.append(res)
            last_c = res["close_idx"]
    return trades

def eval_asian_fade(pair):
    d = data_store[pair]
    m15, h1 = d["m15"], d["h1"]
    h1_atr = d["h1_atr"]
    e50, e200 = d["h1_ema50"], d["h1_ema200"]
    trades = []
    last_c = -1
    
    days = {}
    for b in m15:
        dt = parse_iso(b['t'])
        k = dt.strftime("%Y-%m-%d")
        if 0 <= dt.hour < 7:
            if k not in days: days[k] = []
            days[k].append(b)
            
    asian_ranges = {}
    for k, bl in days.items():
        if len(bl) >= 20:
            ah, al = max(x['h'] for x in bl), min(x['l'] for x in bl)
            asian_ranges[k] = {"h": ah, "l": al, "mid": (ah + al) / 2.0, "rng": ah - al}
            
    for j in range(25, len(m15) - 1):
        if j <= last_c: continue
        b = m15[j]
        dt = parse_iso(b['t'])
        if not (7 <= dt.hour < 12): continue
        ar = asian_ranges.get(dt.strftime("%Y-%m-%d"))
        if not ar: continue
        
        h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
        if h1_idx < 20: continue
        atr = h1_atr[h1_idx]
        if not (0.5 * atr <= ar["rng"] <= 1.5 * atr): continue
        
        bull_macro = e50[h1_idx] > e200[h1_idx]
        bear_macro = e50[h1_idx] < e200[h1_idx]
        
        buy = b['l'] < ar["l"] - 0.10 * atr and b['c'] > ar["l"] and bull_macro
        sell = b['h'] > ar["h"] + 0.10 * atr and b['c'] < ar["h"] and bear_macro
        direction = "BUY" if buy else ("SELL" if sell else None)
        if not direction: continue
        
        next_b = m15[j+1]
        entry = next_b['ao'] if direction == "BUY" else next_b['o']
        buf = 0.20 * atr
        sl = b['l'] - buf if direction == "BUY" else b['h'] + buf
        risk = abs(entry - sl)
        if risk <= 0: continue
        
        targets = [(0.5, ar["mid"]), (0.5, entry + 2.5 * ar["rng"] if direction == "BUY" else entry - 2.5 * ar["rng"])]
        res = sim_trade(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
        if res:
            trades.append(res)
            last_c = res["close_idx"]
    return trades

def eval_mpr(pair):
    d = data_store[pair]
    m15, h1 = d["m15"], d["h1"]
    h1_atr = d["h1_atr"]
    trades = []
    last_c = -1
    
    for j in range(25, len(m15) - 2):
        if j <= last_c: continue
        b = m15[j]
        dt = parse_iso(b['t'])
        if not (8 <= dt.hour <= 16): continue
        h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
        if h1_idx < 14: continue
        atr = h1_atr[h1_idx]
        
        body = abs(b['c'] - b['o'])
        rng = b['h'] - b['l']
        if rng <= 0 or body < 0.60 * rng: continue
        
        pause = m15[j+1]
        pause_rng = pause['h'] - pause['l']
        if pause_rng > 0.50 * rng or pause_rng > 0.50 * atr: continue
        
        direction = "BUY" if b['c'] > b['o'] else "SELL"
        retest = m15[j+2]
        entry = retest['ao'] if direction == "BUY" else retest['o']
        buf = 0.15 * atr
        raw_sl = pause['l'] - buf if direction == "BUY" else pause['h'] + buf
        sl_dist = max(0.30 * atr, abs(entry - raw_sl))
        sl = entry - sl_dist if direction == "BUY" else entry + sl_dist
        risk = abs(entry - sl)
        if risk <= 0: continue
        
        targets = [(0.5, entry + 1.5 * risk if direction == "BUY" else entry - 1.5 * risk),
                   (0.5, entry + 2.5 * risk if direction == "BUY" else entry - 2.5 * risk)]
        res = sim_trade(m15, j+2, direction, entry, sl, targets, d["p_size"], d["pip_val"])
        if res:
            trades.append(res)
            last_c = res["close_idx"]
    return trades

def eval_session_momentum(pair):
    """
    Round the Clock / Session Momentum Expansion:
    Trades the London-NY overlap expansion (12:00 - 16:00 UTC / 13:00 - 17:00 WAT)
    when price breaks London morning extreme with H1 EMA alignment.
    """
    d = data_store[pair]
    m15, h1 = d["m15"], d["h1"]
    e10, e20 = d["h1_ema10"], d["h1_ema20"]
    h1_atr = d["h1_atr"]
    trades = []
    last_c = -1
    
    # Track London Morning Range (08:00 - 11:30 UTC)
    days = {}
    for b in m15:
        dt = parse_iso(b['t'])
        k = dt.strftime("%Y-%m-%d")
        if 8 <= dt.hour < 12:
            if k not in days: days[k] = []
            days[k].append(b)
            
    lon_ranges = {}
    for k, bl in days.items():
        if len(bl) >= 12:
            lon_ranges[k] = {"h": max(x['h'] for x in bl), "l": min(x['l'] for x in bl)}
            
    for j in range(25, len(m15) - 1):
        if j <= last_c: continue
        b = m15[j]
        dt = parse_iso(b['t'])
        if not (12 <= dt.hour <= 16): continue
        lr = lon_ranges.get(dt.strftime("%Y-%m-%d"))
        if not lr: continue
        
        h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
        if h1_idx < 20: continue
        bull = e10[h1_idx] > e20[h1_idx]
        bear = e10[h1_idx] < e20[h1_idx]
        atr = h1_atr[h1_idx]
        
        buy = bull and b['c'] > lr["h"] + 0.05 * atr
        sell = bear and b['c'] < lr["l"] - 0.05 * atr
        direction = "BUY" if buy else ("SELL" if sell else None)
        if not direction: continue
        
        next_b = m15[j+1]
        entry = next_b['ao'] if direction == "BUY" else next_b['o']
        sl = lr["h"] - 0.5 * atr if direction == "BUY" else lr["l"] + 0.5 * atr
        risk = abs(entry - sl)
        if risk <= 0: continue
        
        targets = [(0.5, entry + 1.5 * risk if direction == "BUY" else entry - 1.5 * risk),
                   (0.5, entry + 3.0 * risk if direction == "BUY" else entry - 3.0 * risk)]
        res = sim_trade(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
        if res:
            trades.append(res)
            last_c = res["close_idx"]
    return trades

def compute_metrics(trades, start_bal=677.0, risk_pct=6.0):
    if not trades:
        return {"trades": 0, "wins": 0, "losses": 0, "wr": 0.0, "r": 0.0, "net_dollar": 0.0, "return_pct": 0.0, "pf": 0.0, "max_dd_pct": 0.0}
    
    trades.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    equity = start_bal
    peak = start_bal
    max_dd = 0.0
    wins = [t for t in trades if t["r"] > 0]
    losses = [t for t in trades if t["r"] <= 0]
    
    for t in trades:
        cash_risk = equity * (risk_pct / 100.0)
        dollar_pl = cash_risk * t["r"]
        equity += dollar_pl
        if equity > peak: peak = equity
        dd = (equity - peak) / peak * 100.0
        if dd < max_dd: max_dd = dd
        
    tot_r = sum(t["r"] for t in trades)
    gross_w = sum(t["r"] for t in wins)
    gross_l = abs(sum(t["r"] for t in losses))
    pf = (gross_w / gross_l) if gross_l > 0 else 99.9
    net_d = equity - start_bal
    ret_pct = (net_d / start_bal) * 100.0
    wr = (len(wins) / len(trades)) * 100.0
    
    return {
        "trades": len(trades), "wins": len(wins), "losses": len(losses),
        "wr": wr, "r": tot_r, "net_dollar": net_d, "return_pct": ret_pct,
        "pf": pf, "max_dd_pct": max_dd, "final": equity
    }

if __name__ == "__main__":
    matrix = {}
    strategies = [
        ("Trend Sweep (🌊)", eval_trend_sweep),
        ("Asian Breakout (🚀)", eval_asian_breakout),
        ("Asian Fade (🎯)", eval_asian_fade),
        ("Core MPR (⚡)", eval_mpr),
        ("Session Momentum (⏰)", eval_session_momentum),
    ]
    
    print("\n" + "="*115)
    print("6-MONTH STRATEGY PERFORMANCE MATRIX FOR EACH INDIVIDUAL PAIR ($677 STARTING CAPITAL)")
    print("="*115)
    
    for pair, _, _, _ in PAIRS:
        print(f"\n───────────────────────────────────────────────────────────────────────────────────────────────────")
        print(f"ASSET: {pair}")
        print(f"───────────────────────────────────────────────────────────────────────────────────────────────────")
        header = f"{'Candidate Strategy':<25} {'Trades':<8} {'W / L (11a)':<16} {'Win Rate':<10} {'Total R':<10} {'Net Profit ($)':<16} {'Return %':<10} {'Profit Factor':<14} {'Max DD'}"
        print(header)
        print("-" * 115)
        
        pair_results = []
        for name, func in strategies:
            t_list = func(pair)
            m = compute_metrics(t_list, 677.0, 6.0)
            m["name"] = name
            pair_results.append(m)
            
            wl_str = f"{m['wins']}W / {m['losses']}L"
            net_str = f"{'+' if m['net_dollar']>=0 else ''}${m['net_dollar']:.2f}"
            ret_str = f"{'+' if m['return_pct']>=0 else ''}{m['return_pct']:.1f}%"
            r_str = f"{'+' if m['r']>=0 else ''}{m['r']:.2f}R"
            dd_str = f"{m['max_dd_pct']:.1f}%"
            
            print(f"{name:<25} {m['trades']:<8} {wl_str:<16} {m['wr']:<5.1f}%     {r_str:<10} {net_str:<16} {ret_str:<10} {m['pf']:<14.2f} {dd_str}")
            
        # Rank by net return and win rate
        pair_results.sort(key=lambda x: (x["net_dollar"], x["wr"]), reverse=True)
        matrix[pair] = pair_results
        
    print("\n" + "="*115)
    print("OPTIMAL STRATEGY ASSIGNMENT (GRADE A DEDICATED MODELS)")
    print("="*115)
    for pair, results in matrix.items():
        grade_a = results[0]
        grade_b = results[1]
        grade_c = results[2]
        print(f"\n>>> {pair}:")
        print(f"    ⭐ GRADE A (Dedicated): {grade_a['name']} — {grade_a['wr']:.1f}% WR ({grade_a['wins']}W / {grade_a['losses']}L) | {grade_a['r']:+.2f}R | Net: {'+' if grade_a['net_dollar']>=0 else ''}${grade_a['net_dollar']:.2f} ({grade_a['return_pct']:+.1f}%) | Max DD: {grade_a['max_dd_pct']:.1f}%")
        print(f"    🥈 GRADE B (Alternative): {grade_b['name']} — {grade_b['wr']:.1f}% WR ({grade_b['wins']}W / {grade_b['losses']}L) | {grade_b['r']:+.2f}R | Net: {'+' if grade_b['net_dollar']>=0 else ''}${grade_b['net_dollar']:.2f} ({grade_b['return_pct']:+.1f}%)")
        print(f"    🥉 GRADE C (Confluence):  {grade_c['name']} — {grade_c['wr']:.1f}% WR ({grade_c['wins']}W / {grade_c['losses']}L) | {grade_c['r']:+.2f}R | Net: {'+' if grade_c['net_dollar']>=0 else ''}${grade_c['net_dollar']:.2f} ({grade_c['return_pct']:+.1f}%)")
    print("="*115)
