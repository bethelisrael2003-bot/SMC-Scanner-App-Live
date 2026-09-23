#!/usr/bin/env python3
"""
strategy_discovery.py — Systematic Strategy Discovery & Performance Optimizer
--------------------------------------------------------------------------------
Iterates through 5 distinct algorithmic trading architectures across 11 pairs
over 92 days of tick-accurate bid/ask data. Finds what genuinely produces
a positive statistical edge.
"""

import os
import sys
import json
import math
import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PAIRS = [
    ("EUR/USD", "EURUSD"), ("GBP/USD", "GBPUSD"), ("USD/JPY", "USDJPY"), ("USD/CHF", "USDCHF"),
    ("USD/CAD", "USDCAD"), ("AUD/USD", "AUDUSD"), ("NZD/USD", "NZDUSD"), ("GBP/JPY", "GBPJPY"),
    ("EUR/JPY", "EURJPY"), ("XAU/USD", "GOLD"), ("XAG/USD", "SILVER")
]

def pip_mult(pair):
    if "XAU" in pair: return 10
    if "XAG" in pair or "JPY" in pair: return 100
    return 10000

def parse_iso(ts):
    s = ts.replace("Z", "").split("+")[0]
    dt = datetime.datetime.fromisoformat(s)
    return dt.replace(tzinfo=datetime.timezone.utc).timestamp()

def compute_atr(bars, period=14):
    if len(bars) < period + 1:
        return [0.0] * len(bars)
    trs = [0.0]
    for i in range(1, len(bars)):
        c = bars[i]
        p = bars[i-1]
        tr = max(c['h'] - c['l'], abs(c['h'] - p['c']), abs(c['l'] - p['c']))
        trs.append(tr)
    atr = [0.0] * len(bars)
    first_sum = sum(trs[1:period+1])
    atr[period] = first_sum / period
    for i in range(period + 1, len(bars)):
        atr[i] = (atr[i-1] * (period - 1) + trs[i]) / period
    return atr

def compute_ema(closes, period):
    if len(closes) < period:
        return [0.0] * len(closes)
    k = 2.0 / (period + 1)
    ema = [0.0] * len(closes)
    ema[period-1] = sum(closes[:period]) / period
    for i in range(period, len(closes)):
        ema[i] = closes[i] * k + ema[i-1] * (1.0 - k)
    return ema

def simulate_trade(m15_bars, entry_idx, direction, entry_fill, sl, tp, max_hold_bars=96, be_at_r=1.0, stale_h=12):
    risk = abs(entry_fill - sl)
    if risk <= 0:
        return None
    
    be_triggered = False
    current_sl = sl
    entry_time = m15_bars[entry_idx]['t']
    t0 = parse_iso(entry_time)
    
    for j in range(entry_idx + 1, min(entry_idx + 1 + max_hold_bars, len(m15_bars))):
        b = m15_bars[j]
        exit_low = b['l'] if direction == "BUY" else b['al']
        exit_high = b['h'] if direction == "BUY" else b['ah']
        exit_close = b['c'] if direction == "BUY" else b['ac']
        
        # Staleness Check (12h by default)
        age_h = (parse_iso(b['t']) - t0) / 3600.0
        if stale_h > 0 and age_h >= stale_h and not be_triggered and risk > 0:
            prog = (exit_close - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_close) / risk
            if prog < 0:
                return {
                    "entry_time": entry_time, "close_time": b['t'],
                    "entry": entry_fill, "sl": sl, "exit": exit_close,
                    "r": round(prog, 2), "reason": "STALE",
                    "close_idx": j, "bars_held": j - entry_idx
                }
        
        # SL Check (conservative: SL checked before TP within bar)
        if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
            r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
            return {
                "entry_time": entry_time, "close_time": b['t'],
                "entry": entry_fill, "sl": sl, "exit": current_sl,
                "r": round(r, 2), "reason": "BE" if be_triggered else "SL",
                "close_idx": j, "bars_held": j - entry_idx
            }
        
        # TP Check
        if (direction == "BUY" and exit_high >= tp) or (direction == "SELL" and exit_low <= tp):
            r = (tp - entry_fill) / risk if direction == "BUY" else (entry_fill - tp) / risk
            return {
                "entry_time": entry_time, "close_time": b['t'],
                "entry": entry_fill, "sl": sl, "exit": tp,
                "r": round(r, 2), "reason": "TP",
                "close_idx": j, "bars_held": j - entry_idx
            }
        
        # BE Trigger
        if be_at_r > 0 and not be_triggered:
            if (direction == "BUY" and exit_high >= entry_fill + be_at_r * risk) or \
               (direction == "SELL" and exit_low <= entry_fill - be_at_r * risk):
                be_triggered = True
                current_sl = entry_fill
                
    last_b = m15_bars[min(entry_idx + max_hold_bars, len(m15_bars) - 1)]
    exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
    r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
    return {
        "entry_time": entry_time, "close_time": last_b['t'],
        "entry": entry_fill, "sl": sl, "exit": exit_c,
        "r": round(r, 2), "reason": "TIME_EXPIRED",
        "close_idx": min(entry_idx + max_hold_bars, len(m15_bars) - 1),
        "bars_held": max_hold_bars
    }

# Load All Pair Data
print("Loading 92 days of historical data for 11 pairs...")
all_data = []
for pair, epic in PAIRS:
    m15 = json.load(open(os.path.join(DATA_DIR, f"{epic}_M15.json")))
    h1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H1.json")))
    h4 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H4.json")))
    d1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_D1.json")))
    
    # Pre-compute indicators
    h1_atr = compute_atr(h1, 14)
    h4_closes = [b['c'] for b in h4]
    h4_ema50 = compute_ema(h4_closes, 50)
    h4_ema200 = compute_ema(h4_closes, 200)
    
    h1_closes = [b['c'] for b in h1]
    h1_ema20 = compute_ema(h1_closes, 20)
    h1_ema50 = compute_ema(h1_closes, 50)
    
    all_data.append({
        "pair": pair, "epic": epic, "mult": pip_mult(pair),
        "m15": m15, "h1": h1, "h4": h4, "d1": d1,
        "h1_atr": h1_atr, "h4_ema50": h4_ema50, "h4_ema200": h4_ema200,
        "h1_ema20": h1_ema20, "h1_ema50": h1_ema50
    })

print(f"Data loaded: {len(all_data)} pairs ready.")

def test_strategy(name, generate_signals_fn):
    """
    Runs a signal generation function across all pairs and simulates executions.
    Ensures:
      - 1 position per pair at a time
      - 30-min (2 bars) cooldown after trade close
      - Spread-aware execution
      - Conservative within-bar exits
    """
    all_trades = []
    
    for pdata in all_data:
        pair = pdata["pair"]
        m15 = pdata["m15"]
        cooldown_until = 0
        
        # Call strategy generator
        signals = generate_signals_fn(pdata)
        
        for sig in signals:
            idx = sig["idx"]
            if idx < cooldown_until or idx >= len(m15) - 10:
                continue
            
            direction = sig["direction"]
            bar = m15[idx]
            
            # Spread check
            spread_pips = (bar['ac'] - bar['c']) * pdata["mult"]
            max_spread = 50 if "XAU" in pair else (15 if "XAG" in pair else 5)
            if spread_pips > max_spread:
                continue
            
            entry_fill = bar['ac'] if direction == "BUY" else bar['c']
            sl = sig["sl"]
            tp = sig["tp"]
            be_at_r = sig.get("be_at_r", 1.0)
            stale_h = sig.get("stale_h", 12)
            max_hold = sig.get("max_hold_bars", 96)
            
            # Entry guard: fill must be between SL and TP
            if direction == "BUY" and not (entry_fill > sl and entry_fill < tp):
                continue
            if direction == "SELL" and not (entry_fill < sl and entry_fill > tp):
                continue
            
            trade = simulate_trade(m15, idx, direction, entry_fill, sl, tp, max_hold, be_at_r, stale_h)
            if trade:
                trade["pair"] = pair
                all_trades.append(trade)
                cooldown_until = trade["close_idx"] + 2
                
    # Calculate performance metrics
    n = len(all_trades)
    if n == 0:
        return {"name": name, "trades": 0, "wr": 0, "r_sum": 0, "pf": 0, "max_dd": 0, "trades_per_week": 0, "avg_r": 0}
    
    wins = [t for t in all_trades if t['r'] > 0]
    losses = [t for t in all_trades if t['r'] <= 0]
    wr = len(wins) / n * 100.0
    r_sum = sum(t['r'] for t in all_trades)
    avg_r = r_sum / n
    trades_per_week = n / (92.0 / 7.0)
    
    # Chronological max drawdown
    eq = 0.0; peak = 0.0; max_dd = 0.0
    for t in sorted(all_trades, key=lambda x: parse_iso(x["entry_time"])):
        eq += t["r"]
        peak = max(peak, eq)
        max_dd = min(max_dd, eq - peak)
        
    pos_r = sum(t['r'] for t in wins)
    neg_r = abs(sum(t['r'] for t in losses))
    pf = (pos_r / neg_r) if neg_r > 0 else (99.0 if pos_r > 0 else 0)
    
    return {
        "name": name,
        "trades": n,
        "trades_per_week": round(trades_per_week, 1),
        "wr": round(wr, 1),
        "r_sum": round(r_sum, 2),
        "avg_r": round(avg_r, 2),
        "pf": round(pf, 2),
        "max_dd": round(max_dd, 1),
        "trades_list": all_trades
    }

print("Running systematic strategy discovery search...")
results = []

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 1: ASIAN RANGE LIQUIDITY SWEEP & RECLAIM (London Killzone Institutional)
# ══════════════════════════════════════════════════════════════════════════════
def make_asian_sweep_strategy(tp_r=1.5, be_r=1.0, buffer_atr_mult=0.15, filter_trend=False):
    def run(pdata):
        m15 = pdata["m15"]
        h1 = pdata["h1"]
        h1_atr = pdata["h1_atr"]
        signals = []
        
        # Track daily Asian range (00:00 - 06:45 UTC)
        # London Killzone = 07:00 - 10:00 UTC
        asian_high = -1
        asian_low = 1e9
        current_day = ""
        in_asian = False
        
        h1_ptr = 0
        for i in range(100, len(m15)):
            t_str = m15[i]['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            day_str = dt.strftime("%Y-%m-%d")
            hour = dt.hour + dt.minute / 60.0
            
            # Align H1 ATR
            t_epoch = parse_iso(t_str)
            while h1_ptr < len(h1) and parse_iso(h1[h1_ptr]['t']) <= t_epoch:
                h1_ptr += 1
            atr_val = h1_atr[min(h1_ptr - 1, len(h1_atr) - 1)] if h1_ptr > 0 else 0
            if atr_val <= 0: continue
            
            # Reset at start of new day (00:00 UTC)
            if day_str != current_day:
                current_day = day_str
                asian_high = -1
                asian_low = 1e9
            
            # Asian Session: 00:00 to 06:45 UTC
            if 0.0 <= hour < 7.0:
                asian_high = max(asian_high, m15[i]['h'])
                asian_low = min(asian_low, m15[i]['l'])
                continue
            
            # London Killzone: 07:00 to 10:00 UTC
            if 7.0 <= hour <= 10.0 and asian_high > 0 and asian_low < 1e9:
                curr = m15[i]
                prev = m15[i-1]
                
                # Check Bullish Sweep: prev or curr wicked below Asian Low, but curr closes back ABOVE
                if (curr['l'] < asian_low or prev['l'] < asian_low) and curr['c'] > asian_low:
                    sweep_low = min(curr['l'], prev['l'])
                    buffer = buffer_atr_mult * atr_val
                    sl = sweep_low - buffer
                    risk = abs(curr['c'] - sl)
                    if risk >= 0.2 * atr_val:
                        tp = curr['c'] + tp_r * risk
                        signals.append({"idx": i, "direction": "BUY", "sl": sl, "tp": tp, "be_at_r": be_r})
                
                # Check Bearish Sweep: prev or curr wicked above Asian High, but curr closes back BELOW
                elif (curr['h'] > asian_high or prev['h'] > asian_high) and curr['c'] < asian_high:
                    sweep_high = max(curr['h'], prev['h'])
                    buffer = buffer_atr_mult * atr_val
                    sl = sweep_high + buffer
                    risk = abs(sl - curr['c'])
                    if risk >= 0.2 * atr_val:
                        tp = curr['c'] - tp_r * risk
                        signals.append({"idx": i, "direction": "SELL", "sl": sl, "tp": tp, "be_at_r": be_r})
        return signals
    return run

# Test Asian Sweep Permutations
for tp in [1.5, 2.0, 2.5]:
    for be in [1.0, 0]:
        results.append(test_strategy(f"Asian_Sweep_TP{tp}R_BE{be}", make_asian_sweep_strategy(tp, be)))

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 2: PREVIOUS DAY HIGH / LOW (PDH/PDL) SWEEP & RECLAIM
# ══════════════════════════════════════════════════════════════════════════════
def make_pdl_sweep_strategy(tp_r=1.5, be_r=1.0):
    def run(pdata):
        m15 = pdata["m15"]
        d1 = pdata["d1"]
        h1 = pdata["h1"]
        h1_atr = pdata["h1_atr"]
        signals = []
        
        # Build map of date -> previous day high & low
        pd_map = {}
        for d_idx in range(1, len(d1)):
            prev_d = d1[d_idx - 1]
            curr_d = d1[d_idx]
            dt = datetime.datetime.fromisoformat(curr_d['t'].replace("Z","").split("+")[0])
            pd_map[dt.strftime("%Y-%m-%d")] = {"pdh": prev_d['h'], "pdl": prev_d['l']}
            
        h1_ptr = 0
        for i in range(100, len(m15)):
            t_str = m15[i]['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            day_str = dt.strftime("%Y-%m-%d")
            hour = dt.hour + dt.minute / 60.0
            
            if day_str not in pd_map: continue
            pdh = pd_map[day_str]["pdh"]
            pdl = pd_map[day_str]["pdl"]
            
            # Active killzones only: London (7-10) or NY (12-16)
            if not ((7.0 <= hour <= 10.0) or (12.0 <= hour <= 16.0)):
                continue
                
            t_epoch = parse_iso(t_str)
            while h1_ptr < len(h1) and parse_iso(h1[h1_ptr]['t']) <= t_epoch:
                h1_ptr += 1
            atr_val = h1_atr[min(h1_ptr - 1, len(h1_atr) - 1)] if h1_ptr > 0 else 0
            if atr_val <= 0: continue
            
            curr = m15[i]
            prev = m15[i-1]
            
            # Sweep PDL & close back above
            if (curr['l'] < pdl or prev['l'] < pdl) and curr['c'] > pdl:
                sweep_low = min(curr['l'], prev['l'])
                buffer = 0.15 * atr_val
                sl = sweep_low - buffer
                risk = abs(curr['c'] - sl)
                if risk >= 0.2 * atr_val:
                    signals.append({"idx": i, "direction": "BUY", "sl": sl, "tp": curr['c'] + tp_r * risk, "be_at_r": be_r})
                    
            # Sweep PDH & close back below
            elif (curr['h'] > pdh or prev['h'] > pdh) and curr['c'] < pdh:
                sweep_high = max(curr['h'], prev['h'])
                buffer = 0.15 * atr_val
                sl = sweep_high + buffer
                risk = abs(sl - curr['c'])
                if risk >= 0.2 * atr_val:
                    signals.append({"idx": i, "direction": "SELL", "sl": sl, "tp": curr['c'] - tp_r * risk, "be_at_r": be_r})
        return signals
    return run

for tp in [1.5, 2.0]:
    for be in [1.0, 0]:
        results.append(test_strategy(f"PDH_PDL_Sweep_TP{tp}R_BE{be}", make_pdl_sweep_strategy(tp, be)))

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 3: H4/H1 TREND + VALUE ZONE RETEST (Dynamic Moving Average Channel)
# ══════════════════════════════════════════════════════════════════════════════
def make_trend_pullback_strategy(tp_r=2.0, be_r=1.0, confirm_ratio=0.55):
    def run(pdata):
        m15 = pdata["m15"]
        h1 = pdata["h1"]
        h4 = pdata["h4"]
        h1_atr = pdata["h1_atr"]
        h4_ema50 = pdata["h4_ema50"]
        h4_ema200 = pdata["h4_ema200"]
        h1_ema20 = pdata["h1_ema20"]
        h1_ema50 = pdata["h1_ema50"]
        signals = []
        
        h1_ptr = 0
        h4_ptr = 0
        
        for i in range(100, len(m15)):
            t_str = m15[i]['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            hour = dt.hour + dt.minute / 60.0
            
            # Active sessions only: 7.0 to 16.0 UTC
            if not (7.0 <= hour <= 16.0): continue
            
            t_epoch = parse_iso(t_str)
            while h1_ptr < len(h1) and parse_iso(h1[h1_ptr]['t']) <= t_epoch:
                h1_ptr += 1
            while h4_ptr < len(h4) and parse_iso(h4[h4_ptr]['t']) <= t_epoch:
                h4_ptr += 1
                
            if h1_ptr < 50 or h4_ptr < 50: continue
            
            atr_val = h1_atr[h1_ptr - 1]
            if atr_val <= 0: continue
            
            # H4 Trend: 50 EMA vs 200 EMA
            h4_c = h4[h4_ptr - 1]['c']
            h4_50 = h4_ema50[h4_ptr - 1]
            h4_200 = h4_ema200[h4_ptr - 1]
            
            # H1 Value Zone: EMA 20 and EMA 50
            h1_c = h1[h1_ptr - 1]['c']
            h1_20 = h1_ema20[h1_ptr - 1]
            h1_50 = h1_ema50[h1_ptr - 1]
            
            curr_m15 = m15[i]
            prev_m15 = m15[i-1]
            body = abs(curr_m15['c'] - curr_m15['o'])
            rng = curr_m15['h'] - curr_m15['l']
            body_ratio = body / rng if rng > 0 else 0
            
            # Bullish Trend: H4 Bullish (50 > 200) + H1 pullback into 20-50 EMA zone
            if h4_c > h4_50 and h4_50 > h4_200:
                if min(h1_20, h1_50) <= curr_m15['l'] <= max(h1_20, h1_50):
                    # M15 Confirmation: Strong Bullish Candle closing in trend direction
                    if curr_m15['c'] > curr_m15['o'] and body_ratio >= confirm_ratio:
                        sl = min(curr_m15['l'], prev_m15['l']) - 0.15 * atr_val
                        risk = abs(curr_m15['c'] - sl)
                        if risk >= 0.25 * atr_val:
                            signals.append({"idx": i, "direction": "BUY", "sl": sl, "tp": curr_m15['c'] + tp_r * risk, "be_at_r": be_r})
                            
            # Bearish Trend: H4 Bearish (50 < 200) + H1 pullback into 20-50 EMA zone
            elif h4_c < h4_50 and h4_50 < h4_200:
                if min(h1_20, h1_50) <= curr_m15['h'] <= max(h1_20, h1_50):
                    # M15 Confirmation: Strong Bearish Candle
                    if curr_m15['c'] < curr_m15['o'] and body_ratio >= confirm_ratio:
                        sl = max(curr_m15['h'], prev_m15['h']) + 0.15 * atr_val
                        risk = abs(sl - curr_m15['c'])
                        if risk >= 0.25 * atr_val:
                            signals.append({"idx": i, "direction": "SELL", "sl": sl, "tp": curr_m15['c'] - tp_r * risk, "be_at_r": be_r})
        return signals
    return run

for tp in [1.5, 2.0, 2.5]:
    for be in [1.0, 0]:
        results.append(test_strategy(f"Trend_Pullback_TP{tp}R_BE{be}", make_trend_pullback_strategy(tp, be)))

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 4: OBJECTIVE 3-BAR FAIR VALUE GAP (FVG) RETEST (Pure ICT)
# ══════════════════════════════════════════════════════════════════════════════
def make_fvg_retest_strategy(tp_r=2.0, be_r=1.0):
    def run(pdata):
        m15 = pdata["m15"]
        h1 = pdata["h1"]
        h1_atr = pdata["h1_atr"]
        signals = []
        
        # Scan for H1 FVGs with displacement
        active_fvgs = []
        h1_ptr = 0
        
        for i in range(100, len(m15)):
            t_str = m15[i]['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            hour = dt.hour + dt.minute / 60.0
            
            if not (7.0 <= hour <= 16.0): continue
            
            t_epoch = parse_iso(t_str)
            while h1_ptr < len(h1) and parse_iso(h1[h1_ptr]['t']) <= t_epoch:
                # New H1 bar closed: check if an FVG was formed (lookback 3 bars)
                k = h1_ptr - 1
                if k >= 3:
                    c1, c2, c3 = h1[k-2], h1[k-1], h1[k]
                    atr_k = h1_atr[k]
                    # Bullish FVG: c1.high < c3.low and displacement candle in middle
                    if c1['h'] < c3['l'] and (c2['c'] - c2['o']) > 0.8 * atr_k:
                        active_fvgs.append({
                            "type": "BUY", "top": c3['l'], "bottom": c1['h'],
                            "created_idx": k, "created_time": c2['t']
                        })
                    # Bearish FVG: c1.low > c3.high and displacement in middle
                    elif c1['l'] > c3['h'] and (c2['o'] - c2['c']) > 0.8 * atr_k:
                        active_fvgs.append({
                            "type": "SELL", "top": c1['l'], "bottom": c3['h'],
                            "created_idx": k, "created_time": c2['t']
                        })
                h1_ptr += 1
                
            atr_val = h1_atr[min(h1_ptr - 1, len(h1_atr) - 1)] if h1_ptr > 0 else 0
            if atr_val <= 0: continue
            
            curr_m15 = m15[i]
            
            # Check retest of recent active FVGs (last 5)
            for fvg in active_fvgs[-6:]:
                if fvg["type"] == "BUY":
                    # Retest: price dips into FVG zone and M15 closes bullish
                    if fvg["bottom"] <= curr_m15['l'] <= fvg["top"] and curr_m15['c'] > curr_m15['o']:
                        sl = fvg["bottom"] - 0.15 * atr_val
                        risk = abs(curr_m15['c'] - sl)
                        if risk >= 0.25 * atr_val:
                            signals.append({"idx": i, "direction": "BUY", "sl": sl, "tp": curr_m15['c'] + tp_r * risk, "be_at_r": be_r})
                            active_fvgs.remove(fvg)
                            break
                else:
                    # Bearish Retest
                    if fvg["bottom"] <= curr_m15['h'] <= fvg["top"] and curr_m15['c'] < curr_m15['o']:
                        sl = fvg["top"] + 0.15 * atr_val
                        risk = abs(sl - curr_m15['c'])
                        if risk >= 0.25 * atr_val:
                            signals.append({"idx": i, "direction": "SELL", "sl": sl, "tp": curr_m15['c'] - tp_r * risk, "be_at_r": be_r})
                            active_fvgs.remove(fvg)
                            break
        return signals
    return run

for tp in [1.5, 2.0]:
    for be in [1.0, 0]:
        results.append(test_strategy(f"FVG_Retest_TP{tp}R_BE{be}", make_fvg_retest_strategy(tp, be)))

# ══════════════════════════════════════════════════════════════════════════════
# COMPILE AND DISPLAY ALL FINDINGS
# ══════════════════════════════════════════════════════════════════════════════
# Filter for positive edge
results.sort(key=lambda x: x["r_sum"], reverse=True)

print("\n" + "="*115)
print(f"{'Strategy Architecture':36s} | {'Trades':>6s} | {'Tr/Wk':>5s} | {'Win %':>6s} | {'Total R':>8s} | {'Avg R':>6s} | {'PF':>5s} | {'Max DD':>7s}")
print("="*115)
for r in results:
    plus = "+" if r['r_sum'] >= 0 else ""
    avg_p = "+" if r['avg_r'] >= 0 else ""
    print(f"{r['name']:36s} | {r['trades']:6d} | {r['trades_per_week']:5.1f} | {r['wr']:5.1f}% | {plus}{r['r_sum']:7.2f}R | {avg_p}{r['avg_r']:5.2f}R | {r['pf']:5.2f} | {r['max_dd']:6.1f}R")
print("="*115)

# Save results
out_file = os.path.join(os.path.dirname(__file__), "discovery_results.json")
with open(out_file, "w") as f:
    json.dump([{k: v for k, v in r.items() if k != "trades_list"} for r in results], f, indent=2)
print(f"\nAll results saved to {out_file}")
