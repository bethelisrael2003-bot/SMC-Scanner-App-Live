#!/usr/bin/env python3
"""
Multi-Tab 180-Day Capital Simulation Audit
=============================================================================
Simulates starting with $677.00 USD Capital for EACH of the 8 Strategy Tabs
over the 180-Day (6-Month) Real-Broker Capital.com Dataset (April - Oct 2026).
"""

import os, sys, json, math, datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data_longterm")

PAIRS = [
    ("EUR/USD", "EURUSD", 0.0001, 0.09),
    ("GBP/USD", "GBPUSD", 0.0001, 0.09),
    ("USD/CAD", "USDCAD", 0.0001, 0.09),
    ("USD/JPY", "USDJPY", 0.01, 0.09),
    ("GBP/JPY", "GBPJPY", 0.01, 0.09),
    ("EUR/JPY", "EURJPY", 0.01, 0.09),
    ("USD/CHF", "USDCHF", 0.0001, 0.09),
    ("XAU/USD", "GOLD", 0.10, 0.08),
    ("XAG/USD", "SILVER", 0.01, 0.08),
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

# Load all long-term data into memory
market_data = {}
print("Loading 180-day long-term market data...")
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
    
    market_data[pair] = {
        "pair": pair, "epic": epic, "p_size": p_size, "pip_val": pip_val,
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

print(f"Loaded {len(market_data)} pairs successfully.")

# Simulation helper for multi-target trades
def simulate_execution(m15, entry_idx, direction, entry_fill, sl, targets, p_size, pip_val, stale_h=12):
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
        
        # Staleness
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
            
        # TP checks
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
        "close_idx": close_idx
    }

# ── 1. Aggressive Cent Engine ────────────────────────────────────────────────
def run_aggressive_cent():
    target_pairs = ["XAG/USD", "GBP/JPY", "EUR/USD", "XAU/USD", "EUR/JPY", "USD/CHF"]
    trades = []
    for pair in target_pairs:
        d = market_data.get(pair)
        if not d: continue
        m15, h1 = d["m15"], d["h1"]
        e10, e20 = d["h1_ema10"], d["h1_ema20"]
        m15_atr = d["m15_atr"]
        last_c = -1
        
        for j in range(25, len(m15) - 1):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            wat_h = (dt.hour + 1) % 24
            wat_m = dt.minute
            mins = wat_h * 60 + wat_m
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
            res = simulate_execution(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
            if res:
                trades.append(res)
                last_c = res["close_idx"]
    return trades

# ── 2. Trend Sweep Engine ────────────────────────────────────────────────────
def run_trend_sweep():
    return run_aggressive_cent() # Identical parameters & pair universe

# ── 3. Asian Fade Engine ─────────────────────────────────────────────────────
def run_asian_fade():
    target_pairs = ["EUR/USD", "GBP/USD", "USD/CAD"]
    trades = []
    for pair in target_pairs:
        d = market_data.get(pair)
        if not d: continue
        m15, h1 = d["m15"], d["h1"]
        h1_atr = d["h1_atr"]
        e50, e200 = d["h1_ema50"], d["h1_ema200"]
        last_c = -1
        
        # Track Asian Range (00:00 - 07:00 UTC)
        days = {}
        for b in m15:
            dt = parse_iso(b['t'])
            day_key = dt.strftime("%Y-%m-%d")
            if 0 <= dt.hour < 7:
                if day_key not in days: days[day_key] = []
                days[day_key].append(b)
                
        asian_ranges = {}
        for k, b_list in days.items():
            if len(b_list) >= 20:
                ah = max(x['h'] for x in b_list)
                al = min(x['l'] for x in b_list)
                asian_ranges[k] = {"h": ah, "l": al, "mid": (ah + al) / 2.0, "rng": ah - al}
                
        for j in range(25, len(m15) - 1):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            # London 07:00 - 12:00 UTC
            if not (7 <= dt.hour < 12): continue
            day_key = dt.strftime("%Y-%m-%d")
            ar = asian_ranges.get(day_key)
            if not ar: continue
            
            h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
            if h1_idx < 20: continue
            atr = h1_atr[h1_idx]
            if not (0.5 * atr <= ar["rng"] <= 1.5 * atr): continue
            
            # Trend filter: counter to H1 EMA50/200
            bull_macro = e50[h1_idx] > e200[h1_idx]
            bear_macro = e50[h1_idx] < e200[h1_idx]
            
            # Fade conditions: False breakout of Asian range
            buy_fade = b['l'] < ar["l"] - 0.10 * atr and b['c'] > ar["l"] and bull_macro
            sell_fade = b['h'] > ar["h"] + 0.10 * atr and b['c'] < ar["h"] and bear_macro
            direction = "BUY" if buy_fade else ("SELL" if sell_fade else None)
            if not direction: continue
            
            next_b = m15[j+1]
            entry = next_b['ao'] if direction == "BUY" else next_b['o']
            buf = 0.20 * atr
            sl = b['l'] - buf if direction == "BUY" else b['h'] + buf
            risk = abs(entry - sl)
            if risk <= 0: continue
            
            targets = [(0.5, ar["mid"]), (0.5, entry + 2.5 * ar["rng"] if direction == "BUY" else entry - 2.5 * ar["rng"])]
            res = simulate_execution(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
            if res:
                trades.append(res)
                last_c = res["close_idx"]
    return trades

# ── 4. Asian Breakout Engine ─────────────────────────────────────────────────
def run_asian_breakout():
    target_pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "GBP/JPY"]
    trades = []
    for pair in target_pairs:
        d = market_data.get(pair)
        if not d: continue
        m15, h1 = d["m15"], d["h1"]
        h1_atr = d["h1_atr"]
        last_c = -1
        
        days = {}
        for b in m15:
            dt = parse_iso(b['t'])
            day_key = dt.strftime("%Y-%m-%d")
            if 0 <= dt.hour < 7:
                if day_key not in days: days[day_key] = []
                days[day_key].append(b)
                
        asian_ranges = {}
        for k, b_list in days.items():
            if len(b_list) >= 20:
                ah = max(x['h'] for x in b_list)
                al = min(x['l'] for x in b_list)
                asian_ranges[k] = {"h": ah, "l": al, "rng": ah - al}
                
        for j in range(25, len(m15) - 1):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            # London Open 07:00 - 10:30 UTC
            mins_utc = dt.hour * 60 + dt.minute
            if not (7 * 60 <= mins_utc <= 10 * 60 + 30): continue
            day_key = dt.strftime("%Y-%m-%d")
            ar = asian_ranges.get(day_key)
            if not ar: continue
            
            h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
            if h1_idx < 14: continue
            atr = h1_atr[h1_idx]
            if not (0.36 * atr <= ar["rng"] <= 1.35 * atr): continue
            
            # Momentum Breakout past range
            buy_bo = b['c'] > ar["h"] + 0.06 * atr and (b['h'] - b['l']) >= 0.36 * ar["rng"]
            sell_bo = b['c'] < ar["l"] - 0.06 * atr and (b['h'] - b['l']) >= 0.36 * ar["rng"]
            direction = "BUY" if buy_bo else ("SELL" if sell_bo else None)
            if not direction: continue
            
            next_b = m15[j+1]
            entry = next_b['ao'] if direction == "BUY" else next_b['o']
            sl = ar["l"] - 0.08 * ar["rng"] if direction == "BUY" else ar["h"] + 0.08 * ar["rng"]
            risk = abs(entry - sl)
            if risk <= 0: continue
            
            targets = [(0.35, entry + 1.5 * risk if direction == "BUY" else entry - 1.5 * risk),
                       (0.65, entry + 4.0 * risk if direction == "BUY" else entry - 4.0 * risk)]
            res = simulate_execution(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"], stale_h=7)
            if res:
                trades.append(res)
                last_c = res["close_idx"]
    return trades

# ── 5. SMC Institutional Engine ──────────────────────────────────────────────
def run_smc_institutional():
    target_pairs = ["GBP/JPY", "USD/CAD", "USD/JPY", "EUR/USD", "EUR/JPY"]
    trades = []
    for pair in target_pairs:
        d = market_data.get(pair)
        if not d or not d["h4"]: continue
        m15, h1, h4 = d["m15"], d["h1"], d["h4"]
        h1_atr = d["h1_atr"]
        last_c = -1
        
        for j in range(30, len(m15) - 1):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            if not (7 <= dt.hour <= 18): continue
            
            h4_idx = get_last_completed_idx(d["h4_times"], dt.timestamp(), 14400.0)
            if h4_idx < 15: continue
            
            h4_high = max(x['h'] for x in h4[h4_idx-10:h4_idx+1])
            h4_low = min(x['l'] for x in h4[h4_idx-10:h4_idx+1])
            h4_span = h4_high - h4_low
            if h4_span <= 0: continue
            pos = (h4[h4_idx]['c'] - h4_low) / h4_span
            
            # Sweep on M15
            prior_20 = m15[j-20:j]
            p_low = min(x['l'] for x in prior_20)
            p_high = max(x['h'] for x in prior_20)
            
            buy = pos <= 0.35 and b['l'] < p_low and b['c'] > p_low and b['c'] > b['o']
            sell = pos >= 0.65 and b['h'] > p_high and b['c'] < p_high and b['c'] < b['o']
            direction = "BUY" if buy else ("SELL" if sell else None)
            if not direction: continue
            
            next_b = m15[j+1]
            entry = next_b['ao'] if direction == "BUY" else next_b['o']
            h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
            atr = h1_atr[h1_idx] if h1_idx >= 0 else (b['h'] - b['l'])
            sl = b['l'] - 0.20 * atr if direction == "BUY" else b['h'] + 0.20 * atr
            risk = abs(entry - sl)
            if risk <= 0: continue
            
            # Split target: 50% @ 1.5R (auto-BE), 50% @ opposing H4 extreme
            tp2 = h4_high if direction == "BUY" else h4_low
            targets = [(0.5, entry + 1.5 * risk if direction == "BUY" else entry - 1.5 * risk), (0.5, tp2)]
            res = simulate_execution(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
            if res:
                trades.append(res)
                last_c = res["close_idx"]
    return trades

# ── 6. Classic SMC Engine ────────────────────────────────────────────────────
def run_classic_smc():
    target_pairs = ["GBP/JPY", "USD/JPY", "EUR/USD", "USD/CAD"]
    trades = []
    for pair in target_pairs:
        d = market_data.get(pair)
        if not d: continue
        m15 = d["m15"]
        last_c = -1
        
        for j in range(25, len(m15) - 1):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            if not (7 <= dt.hour <= 17): continue
            
            prior_20 = m15[j-20:j]
            p_low = min(x['l'] for x in prior_20)
            p_high = max(x['h'] for x in prior_20)
            
            buy = b['l'] < p_low and b['c'] > p_low and b['c'] > b['o']
            sell = b['h'] > p_high and b['c'] < p_high and b['c'] < b['o']
            direction = "BUY" if buy else ("SELL" if sell else None)
            if not direction: continue
            
            next_b = m15[j+1]
            entry = next_b['ao'] if direction == "BUY" else next_b['o']
            sl = b['l'] if direction == "BUY" else b['h']
            risk = abs(entry - sl)
            if risk <= 0: continue
            
            targets = [(1.0, entry + 1.5 * risk if direction == "BUY" else entry - 1.5 * risk)]
            res = simulate_execution(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
            if res:
                trades.append(res)
                last_c = res["close_idx"]
    return trades

# ── 7. Precision Intraday Engine ─────────────────────────────────────────────
def run_precision_intraday():
    target_pairs = ["XAU/USD", "EUR/JPY", "XAG/USD", "GBP/JPY", "EUR/USD"]
    trades = []
    for pair in target_pairs:
        d = market_data.get(pair)
        if not d: continue
        m15 = d["m15"]
        h1_atr = d["h1_atr"]
        last_c = -1
        
        for j in range(25, len(m15) - 1):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            if not (8 <= dt.hour <= 16): continue
            
            h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
            if h1_idx < 14: continue
            atr = h1_atr[h1_idx]
            
            prior_15 = m15[j-15:j]
            p_low = min(x['l'] for x in prior_15)
            p_high = max(x['h'] for x in prior_15)
            
            buy = b['l'] < p_low and b['c'] > p_low and b['c'] > b['o'] and (b['h'] - b['l']) >= 0.5 * atr
            sell = b['h'] > p_high and b['c'] < p_high and b['c'] < b['o'] and (b['h'] - b['l']) >= 0.5 * atr
            direction = "BUY" if buy else ("SELL" if sell else None)
            if not direction: continue
            
            next_b = m15[j+1]
            entry = next_b['ao'] if direction == "BUY" else next_b['o']
            sl = entry - max(0.3 * atr, abs(entry - b['l'])) if direction == "BUY" else entry + max(0.3 * atr, abs(b['h'] - entry))
            risk = abs(entry - sl)
            if risk <= 0: continue
            
            targets = [(0.5, entry + 1.5 * risk if direction == "BUY" else entry - 1.5 * risk),
                       (0.5, entry + 3.0 * risk if direction == "BUY" else entry - 3.0 * risk)]
            res = simulate_execution(m15, j+1, direction, entry, sl, targets, d["p_size"], d["pip_val"])
            if res:
                trades.append(res)
                last_c = res["close_idx"]
    return trades

# ── 8. Core SMC / MPR Engine ─────────────────────────────────────────────────
def run_core_mpr():
    target_pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY", "XAU/USD"]
    trades = []
    for pair in target_pairs:
        d = market_data.get(pair)
        if not d: continue
        m15 = d["m15"]
        h1_atr = d["h1_atr"]
        last_c = -1
        
        for j in range(25, len(m15) - 2):
            if j <= last_c: continue
            b = m15[j]
            dt = parse_iso(b['t'])
            if not (8 <= dt.hour <= 16): continue
            
            h1_idx = get_last_completed_idx(d["h1_times"], dt.timestamp(), 3600.0)
            if h1_idx < 14: continue
            atr = h1_atr[h1_idx]
            
            # Momentum + pause pattern
            body = abs(b['c'] - b['o'])
            rng = b['h'] - b['l']
            if rng <= 0 or body < 0.60 * rng: continue
            
            pause = m15[j+1]
            pause_rng = pause['h'] - pause['l']
            if pause_rng > 0.50 * rng or pause_rng > 0.50 * atr: continue
            
            direction = "BUY" if b['c'] > b['o'] else "SELL"
            midpoint = (pause['h'] + pause['l']) / 2.0
            
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
            res = simulate_execution(m15, j+2, direction, entry, sl, targets, d["p_size"], d["pip_val"])
            if res:
                trades.append(res)
                last_c = res["close_idx"]
    return trades

# ── Evaluate Tab with $677 Capital ──────────────────────────────────────────
def evaluate_tab(name, trade_list, start_bal=677.0, risk_pct=6.0):
    if not trade_list:
        return {
            "name": name, "trades": 0, "wins": 0, "losses": 0, "wr": 0.0,
            "r_sum": 0.0, "start": start_bal, "final": start_bal,
            "net_dollar": 0.0, "return_pct": 0.0, "max_dd_val": 0.0, "max_dd_pct": 0.0
        }
    trade_list.sort(key=lambda x: parse_iso(x["entry_time"]).timestamp())
    equity = start_bal
    peak = start_bal
    max_dd_val = 0.0
    max_dd_pct = 0.0
    
    for t in trade_list:
        cash_risk = equity * (risk_pct / 100.0)
        lot = calculate_lot(cash_risk, t["sl_pips"], t["pip_val"])
        dollar_pl = cash_risk * t["r"]
        equity += dollar_pl
        if equity > peak: peak = equity
        dd = equity - peak
        if dd < max_dd_val:
            max_dd_val = dd
            max_dd_pct = (dd / peak) * 100.0
            
    wins = [t for t in trade_list if t["r"] > 0]
    losses = [t for t in trade_list if t["r"] <= 0]
    wr = (len(wins) / len(trade_list)) * 100.0
    r_sum = sum(t["r"] for t in trade_list)
    net_dollar = equity - start_bal
    return_pct = (net_dollar / start_bal) * 100.0
    
    return {
        "name": name,
        "trades": len(trade_list),
        "wins": len(wins),
        "losses": len(losses),
        "wr": wr,
        "r_sum": r_sum,
        "start": start_bal,
        "final": equity,
        "net_dollar": net_dollar,
        "return_pct": return_pct,
        "max_dd_val": max_dd_val,
        "max_dd_pct": max_dd_pct
    }

if __name__ == "__main__":
    tabs = [
        ("Aggressive Cent (⚡)", run_aggressive_cent()),
        ("Trend Sweep (🌊)", run_trend_sweep()),
        ("Asian Fade (🎯)", run_asian_fade()),
        ("Asian Breakout (🚀)", run_asian_breakout()),
        ("SMC Institutional (💎)", run_smc_institutional()),
        ("Classic SMC (🏛)", run_classic_smc()),
        ("Precision Intraday (📐)", run_precision_intraday()),
        ("Core SMC / MPR (⚡)", run_core_mpr()),
    ]
    
    reports = [evaluate_tab(name, t_list, 677.0, 6.0) for name, t_list in tabs]
    
    print("\n" + "="*125)
    print("180-DAY (6-MONTH) MULTI-TAB CAPITAL AUDIT: $677.00 CAPITAL ALLOCATED PER STRATEGY")
    print("Dataset: April 14, 2026 to October 13, 2026 (Real Broker Bid/Ask Quotes, Capital.com)")
    print("="*125)
    header = f"{'Strategy Tab':<26} {'Trades':<8} {'W / L (Rule 11a)':<18} {'Win Rate':<10} {'Total R':<10} {'Start $':<10} {'Final $':<12} {'Net Profit ($)':<16} {'Return %':<10} {'Max DD'}"
    print(header)
    print("-" * 125)
    
    tot_start = 0.0
    tot_final = 0.0
    tot_trades = 0
    tot_wins = 0
    tot_losses = 0
    tot_r = 0.0
    
    for r in reports:
        tot_start += r["start"]
        tot_final += r["final"]
        tot_trades += r["trades"]
        tot_wins += r["wins"]
        tot_losses += r["losses"]
        tot_r += r["r_sum"]
        
        wl_str = f"{r['wins']}W / {r['losses']}L"
        net_str = f"{'+' if r['net_dollar']>=0 else ''}${r['net_dollar']:.2f}"
        ret_str = f"{'+' if r['return_pct']>=0 else ''}{r['return_pct']:.1f}%"
        r_str = f"{'+' if r['r_sum']>=0 else ''}{r['r_sum']:.2f}R"
        dd_str = f"{r['max_dd_pct']:.1f}%"
        
        print(f"{r['name']:<26} {r['trades']:<8} {wl_str:<18} {r['wr']:<5.1f}%     {r_str:<10} ${r['start']:<9.2f} ${r['final']:<11.2f} {net_str:<16} {ret_str:<10} {dd_str}")
        
    print("="*125)
    tot_net = tot_final - tot_start
    tot_ret = (tot_net / tot_start) * 100.0
    tot_wr = (tot_wins / tot_trades) * 100.0 if tot_trades > 0 else 0.0
    print(f"COMBINED PORTFOLIO TOTAL:")
    print(f"  Total Capital Allocated:  ${tot_start:.2f} USD across 8 Strategy Tabs ($677.00 each)")
    print(f"  Final Combined Capital:   ${tot_final:.2f} USD ({tot_final*100.0:.0f} Cents)")
    print(f"  Net Portfolio Profit:     {'+' if tot_net>=0 else ''}${tot_net:.2f} USD ({'+' if tot_ret>=0 else ''}{tot_ret:.1f}% Growth)")
    print(f"  Total Trades Across Tabs: {tot_trades} trades")
    print(f"  Combined Record (11a):    {tot_wins} Wins / {tot_losses} Losses")
    print(f"  Combined Win Rate:        {tot_wr:.1f}% ({tot_wins}W / {tot_losses}L)")
    print(f"  Total Realized R Sum:     {tot_r:+.2f}R")
    print("="*125)
