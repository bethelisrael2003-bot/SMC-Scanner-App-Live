#!/usr/bin/env python3
"""
optimize_classic.py — Deep Dissection & Scaling of the Classic SMC Edge
-----------------------------------------------------------------------
Classic SMC with H4 Sweep + M15 CHOCH + Return to POI was the ONLY
strategy family out of 50+ tested that produced a large positive edge
(+6.95R to +11.21R, 53% to 82% win rate, Profit Factor 2.2 to 9.5).

Now we investigate:
1. Why does it work? (Is it the sweep? The POI? The confirmation? The SL anchor?)
2. Can we scale its frequency without destroying the edge?
   - Test H1 Liquidity Sweeps vs H4 Liquidity Sweeps
   - Test H1 Order Blocks vs H4 Order Blocks
   - Test 1.5R vs 2.0R vs Partial profit (50% at 1.5R, 50% at 2.5R)
   - Test with M15 CHOCH vs M15 BOS vs Both
   - Test with different session filters (London only vs London+NY vs 24h)
"""

import os, sys, json, math, datetime

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
    if len(bars) < period + 1: return [0.0] * len(bars)
    trs = [0.0]
    for i in range(1, len(bars)):
        c, p = bars[i], bars[i-1]
        trs.append(max(c['h'] - c['l'], abs(c['h'] - p['c']), abs(c['l'] - p['c'])))
    atr = [0.0] * len(bars)
    atr[period] = sum(trs[1:period+1]) / period
    for i in range(period + 1, len(bars)):
        atr[i] = (atr[i-1] * (period - 1) + trs[i]) / period
    return atr

def find_swings(bars, lookback=2):
    highs = []
    lows = []
    for i in range(lookback, len(bars) - lookback):
        is_h = True
        is_l = True
        for j in range(i - lookback, i + lookback + 1):
            if j == i: continue
            if bars[i]['h'] < bars[j]['h']: is_h = False
            if bars[i]['l'] > bars[j]['l']: is_l = False
        if is_h: highs.append({"i": i, "p": bars[i]['h'], "t": bars[i]['t']})
        if is_l: lows.append({"i": i, "p": bars[i]['l'], "t": bars[i]['t']})
    return highs, lows

def classify_trend(bars, lookback=2):
    highs, lows = find_swings(bars, lookback)
    if len(highs) < 2 or len(lows) < 2: return "UNCLEAR", highs, lows
    sh = highs[-2:]
    sl = lows[-2:]
    hh = sh[1]['p'] > sh[0]['p']
    hl = sl[1]['p'] > sl[0]['p']
    lh = sh[1]['p'] < sh[0]['p']
    ll = sl[1]['p'] < sl[0]['p']
    if hh and hl: return "BULLISH", highs, lows
    if lh and ll: return "BEARISH", highs, lows
    return "RANGE", highs, lows

def find_pools(bars, tol_pct=0.0015):
    pools = []
    last_c = bars[-1]['c']
    win = bars[-30:]
    highs = [{"i": i, "h": b['h'], "t": b['t']} for i, b in enumerate(win)]
    for i in range(len(highs)):
        for j in range(i + 1, len(highs)):
            if abs(highs[i]['h'] - highs[j]['h']) / highs[i]['h'] < tol_pct:
                lvl = (highs[i]['h'] + highs[j]['h']) / 2.0
                if lvl > last_c:
                    pools.append({"level": lvl, "side": "BUY", "source": "equal_high"})
                    break
    lows = [{"i": i, "l": b['l'], "t": b['t']} for i, b in enumerate(win)]
    for i in range(len(lows)):
        for j in range(i + 1, len(lows)):
            if abs(lows[i]['l'] - lows[j]['l']) / lows[i]['l'] < tol_pct:
                lvl = (lows[i]['l'] + lows[j]['l']) / 2.0
                if lvl < last_c:
                    pools.append({"level": lvl, "side": "SELL", "source": "equal_low"})
                    break
    # Session extremes
    sess = bars[-12:]
    sh = max(b['h'] for b in sess)
    sl = min(b['l'] for b in sess)
    if sh > last_c: pools.append({"level": sh, "side": "BUY", "source": "sess_high"})
    if sl < last_c: pools.append({"level": sl, "side": "SELL", "source": "sess_low"})
    buy_p = sorted([p for p in pools if p['side'] == 'BUY'], key=lambda x: x['level'])[:2]
    sell_p = sorted([p for p in pools if p['side'] == 'SELL'], key=lambda x: -x['level'])[:2]
    return buy_p, sell_p

def detect_sweep_bar(bars, pool, lookback=8):
    lvl = pool['level']
    side = pool['side']
    tol = lvl * 0.0008
    recent = bars[-min(lookback, len(bars)):]
    for i in range(len(recent) - 1, -1, -1):
        c = recent[i]
        if side == "BUY":
            if c['h'] > lvl + tol and c['c'] < lvl:
                return True, c, c['h']
        else:
            if c['l'] < lvl - tol and c['c'] > lvl:
                return True, c, c['l']
    return False, None, 0.0

def find_order_block(bars, trend, atr_val):
    if trend not in ("BULLISH", "BEARISH"): return None
    start = max(0, len(bars) - 40)
    for i in range(len(bars) - 3, start, -1):
        c = bars[i]
        if trend == "BULLISH":
            if c['c'] >= c['o']: continue
            impulse = bars[i+1 : i+4]
            if len(impulse) < 2: continue
            move = sum(x['c'] - x['o'] for x in impulse)
            if move >= 1.5 * atr_val and all(x['c'] > x['o'] for x in impulse):
                return {"type": "BULLISH_OB", "direction": "BUY", "high": c['h'], "low": c['l'], "i": i}
        else:
            if c['c'] <= c['o']: continue
            impulse = bars[i+1 : i+4]
            if len(impulse) < 2: continue
            move = abs(sum(x['c'] - x['o'] for x in impulse))
            if move >= 1.5 * atr_val and all(x['c'] < x['o'] for x in impulse):
                return {"type": "BEARISH_OB", "direction": "SELL", "high": c['h'], "low": c['l'], "i": i}
    return None

def check_confirmation_candle(bars, direction, min_body_ratio=0.55):
    if len(bars) < 2: return False
    curr = bars[-1]
    prev = bars[-2]
    body = abs(curr['c'] - curr['o'])
    rng = curr['h'] - curr['l']
    if rng == 0: return False
    br = body / rng
    if direction == "BUY":
        if curr['c'] <= curr['o']:
            return prev['c'] < prev['o'] and curr['c'] > prev['o'] and curr['o'] < prev['c']
        if br >= min_body_ratio: return True
        return (min(curr['o'], curr['c']) - curr['l']) > 0.45 * rng
    else:
        if curr['c'] >= curr['o']:
            return prev['c'] > prev['o'] and curr['c'] < prev['o'] and curr['o'] > prev['c']
        if br >= min_body_ratio: return True
        return (curr['h'] - max(curr['o'], curr['c'])) > 0.45 * rng

def get_premium_discount(bars, atr_val):
    recent = bars[-min(50, len(bars)):]
    rh = max(b['h'] for b in recent)
    rl = min(b['l'] for b in recent)
    r_size = rh - rl
    last_c = bars[-1]['c']
    if r_size < 1.5 * atr_val: return "COMPRESSED", rh, rl, 0.5
    pos = (last_c - rl) / r_size
    zone = "PREMIUM" if pos >= 0.70 else ("DISCOUNT" if pos <= 0.30 else "EQ")
    return zone, rh, rl, pos

def detect_structure_break(bars, highs, lows, prior_trend):
    if not highs or not lows: return None
    last_sh = highs[-1]['p']
    last_sl = lows[-1]['p']
    recent = bars[-min(5, len(bars)):]
    for c in reversed(recent):
        if prior_trend == "BULLISH":
            if c['c'] < last_sl: return "CHOCH", c, last_sl
            if c['c'] > last_sh: return "BOS", c, last_sh
        elif prior_trend == "BEARISH":
            if c['c'] > last_sh: return "CHOCH", c, last_sh
            if c['c'] < last_sl: return "BOS", c, last_sl
    return None

def simulate_trade_partial(m15_bars, entry_idx, direction, entry_fill, sl, tp1, tp2=None, be_r=1.0, stale_h=12):
    risk = abs(entry_fill - sl)
    if risk <= 0: return None
    be_triggered = False
    current_sl = sl
    entry_time = m15_bars[entry_idx]['t']
    t0 = parse_iso(entry_time)
    
    tp1_hit = False
    realized_r = 0.0
    
    for j in range(entry_idx + 1, min(entry_idx + 1 + 96, len(m15_bars))):
        b = m15_bars[j]
        exit_low = b['l'] if direction == "BUY" else b['al']
        exit_high = b['h'] if direction == "BUY" else b['ah']
        exit_close = b['c'] if direction == "BUY" else b['ac']
        
        age_h = (parse_iso(b['t']) - t0) / 3600.0
        if stale_h > 0 and age_h >= stale_h and not be_triggered and not tp1_hit and risk > 0:
            prog = (exit_close - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_close) / risk
            if prog < 0:
                return {"r": round(prog, 2), "reason": "STALE", "close_idx": j}
                
        # SL check
        if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
            loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
            total_r = realized_r + (0.5 * loss_r if tp1_hit else loss_r)
            return {"r": round(total_r, 2), "reason": "BE" if be_triggered else "SL", "close_idx": j}
            
        # TP1 check
        if not tp1_hit:
            if (direction == "BUY" and exit_high >= tp1) or (direction == "SELL" and exit_low <= tp1):
                if tp2 is None:
                    # Single TP exit
                    r_gain = (tp1 - entry_fill) / risk if direction == "BUY" else (entry_fill - tp1) / risk
                    return {"r": round(r_gain, 2), "reason": "TP1", "close_idx": j}
                else:
                    # Partial exit 50% at TP1, move SL to BE, let 50% run to TP2
                    tp1_hit = True
                    r1 = (tp1 - entry_fill) / risk if direction == "BUY" else (entry_fill - tp1) / risk
                    realized_r += 0.5 * r1
                    current_sl = entry_fill # auto-BE
                    be_triggered = True
                    
        # TP2 check (if runner active)
        if tp1_hit and tp2 is not None:
            if (direction == "BUY" and exit_high >= tp2) or (direction == "SELL" and exit_low <= tp2):
                r2 = (tp2 - entry_fill) / risk if direction == "BUY" else (entry_fill - tp2) / risk
                realized_r += 0.5 * r2
                return {"r": round(realized_r, 2), "reason": "TP2", "close_idx": j}
                
        # BE trigger before TP1
        if be_r > 0 and not be_triggered and not tp1_hit:
            if (direction == "BUY" and exit_high >= entry_fill + be_r * risk) or (direction == "SELL" and exit_low <= entry_fill - be_r * risk):
                be_triggered = True
                current_sl = entry_fill
                
    last_b = m15_bars[min(entry_idx + 96, len(m15_bars) - 1)]
    exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
    final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
    total_r = realized_r + (0.5 * final_r if tp1_hit else final_r)
    return {"r": round(total_r, 2), "reason": "EOD", "close_idx": min(entry_idx + 96, len(m15_bars) - 1)}

# Load prepped data
print("Loading data for Classic SMC scaling experiments...")
all_data = []
for pair, epic in PAIRS:
    m15 = json.load(open(os.path.join(DATA_DIR, f"{epic}_M15.json")))
    h1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H1.json")))
    h4 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H4.json")))
    d1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_D1.json")))
    h1_atr = compute_atr(h1, 14)
    all_data.append({"pair": pair, "epic": epic, "mult": pip_mult(pair), "m15": m15, "h1": h1, "h4": h4, "d1": d1, "h1_atr": h1_atr})

def test_classic_variant(name, sweep_tf="H4", prior_tf="H1", target_r=1.5, partial_tp2=None, be_r=1.0, poi_req="H4", require_sweep=True):
    all_trades = []
    
    for pdata in all_data:
        pair = pdata["pair"]
        m15 = pdata["m15"]
        h1 = pdata["h1"]
        h4 = pdata["h4"]
        d1 = pdata["d1"]
        h1_atr = pdata["h1_atr"]
        mult = pdata["mult"]
        
        cooldown_until = 0
        h1_ptr = 0
        h4_ptr = 0
        d1_ptr = 0
        
        for i in range(400, len(m15)):
            if i < cooldown_until: continue
            
            bar = m15[i]
            t_str = bar['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            hour = dt.hour + dt.minute / 60.0
            dow = dt.weekday()
            
            # Active session: Sunday 21:00 to Friday 21:00 UTC, hour >= 7.0 (London/NY)
            if dow == 5 or (dow == 6 and hour < 21.0) or hour < 7.0: continue
            
            # Spread check
            spread_pips = (bar['ac'] - bar['c']) * mult
            max_spread = 50 if "XAU" in pair else (15 if "XAG" in pair else 5)
            if spread_pips > max_spread: continue
            
            t_epoch = parse_iso(t_str)
            while h1_ptr < len(h1) and parse_iso(h1[h1_ptr]['t']) <= t_epoch: h1_ptr += 1
            while h4_ptr < len(h4) and parse_iso(h4[h4_ptr]['t']) <= t_epoch: h4_ptr += 1
            while d1_ptr < len(d1) and parse_iso(d1[d1_ptr]['t']) <= t_epoch: d1_ptr += 1
            if h1_ptr < 60 or h4_ptr < 60 or d1_ptr < 20: continue
            
            hAtr = h1_atr[min(h1_ptr - 1, len(h1_atr) - 1)]
            if hAtr <= 0: continue
            
            h1_win = h1[max(0, h1_ptr - 120) : h1_ptr]
            h4_win = h4[max(0, h4_ptr - 120) : h4_ptr]
            d1_win = d1[max(0, d1_ptr - 100) : d1_ptr]
            m15_win = m15[max(0, i - 120) : i] # Closed candles only
            
            # HTF Trend & Confluence
            h1_trend, _, _ = classify_trend(h1_win, 2)
            d1_trend, _, _ = classify_trend(d1_win, 2)
            if h1_trend not in ("BULLISH", "BEARISH"): continue
            if d1_trend not in ("RANGE", "UNCLEAR", h1_trend): continue
            
            pd_zone, _, _, pos = get_premium_discount(h1_win, hAtr)
            if pd_zone in ("COMPRESSED", "EQ"): continue
            
            direction = "BUY" if (pd_zone == "DISCOUNT" or pos <= 0.5) else "SELL"
            if h1_trend == "BULLISH" and pd_zone == "PREMIUM": continue
            if h1_trend == "BEARISH" and pd_zone == "DISCOUNT": continue
            
            # POI Selection
            poi = None
            if poi_req == "H4":
                poi = find_order_block(h4_win, h1_trend, compute_atr(h4_win, 14)[-1] or hAtr)
            elif poi_req == "H1":
                poi = find_order_block(h1_win, h1_trend, hAtr)
            elif poi_req == "ANY":
                poi = find_order_block(h4_win, h1_trend, compute_atr(h4_win, 14)[-1] or hAtr) or find_order_block(h1_win, h1_trend, hAtr)
                
            if not poi: continue
            
            # Sweep Check on designated timeframe
            sweep_bars = h4_win if sweep_tf == "H4" else h1_win
            buy_pools, sell_pools = find_pools(sweep_bars)
            target_pools = sell_pools if direction == "BUY" else buy_pools
            
            has_sweep = False
            sweep_extreme = 0.0
            sweep_time = ""
            
            if require_sweep:
                for pool in target_pools:
                    swept, sw_bar, ext = detect_sweep_bar(sweep_bars, pool, lookback=8)
                    if swept:
                        has_sweep = True
                        sweep_extreme = ext
                        sweep_time = sw_bar['t']
                        break
                if not has_sweep: continue
            else:
                has_sweep = True
                sweep_extreme = min(b['l'] for b in m15_win[-16:]) if direction == "BUY" else max(b['h'] for b in m15_win[-16:])
                sweep_time = m15_win[-16]['t']
                
            # M15 Structure Shift after sweep
            m15_highs, m15_lows = find_swings(m15_win, 2)
            prior = h1_trend if prior_tf == "H1" else classify_trend(m15_win, 2)[0]
            if prior in ("RANGE", "UNCLEAR"): continue
            
            s_break = detect_structure_break(m15_win, m15_highs, m15_lows, prior)
            if not s_break: continue
            b_type, b_bar, _ = s_break
            
            # Break must be in direction
            broke_up = b_bar['c'] > b_bar['o']
            if (direction == "BUY") != broke_up: continue
            
            # Break must be AFTER sweep
            if require_sweep and parse_iso(b_bar['t']) <= parse_iso(sweep_time): continue
            
            # Return to POI: current price touches or near POI
            last_m15 = m15_win[-1]
            overlaps = (last_m15['l'] <= poi['high'] and last_m15['h'] >= poi['low'])
            near = (poi['low'] - last_m15['c'] <= 0.25 * hAtr) if direction == "BUY" else (last_m15['c'] - poi['high'] <= 0.25 * hAtr)
            if not (overlaps or near): continue
            
            # M15 Confirmation Candle
            if not check_confirmation_candle(m15_win, direction, min_body_ratio=0.55): continue
            
            # Execute Trade
            entry_fill = bar['ac'] if direction == "BUY" else bar['c']
            buffer = 0.15 * hAtr
            raw_sl = (sweep_extreme - buffer) if direction == "BUY" else (sweep_extreme + buffer)
            risk = abs(entry_fill - raw_sl)
            min_stop = 0.3 * hAtr
            if risk < min_stop:
                risk = min_stop
                raw_sl = (entry_fill - min_stop) if direction == "BUY" else (entry_fill + min_stop)
                
            tp1 = (entry_fill + target_r * risk) if direction == "BUY" else (entry_fill - target_r * risk)
            tp2 = None
            if partial_tp2:
                tp2 = (entry_fill + partial_tp2 * risk) if direction == "BUY" else (entry_fill - partial_tp2 * risk)
                
            # Entry guard
            if direction == "BUY" and not (entry_fill > raw_sl and entry_fill < tp1): continue
            if direction == "SELL" and not (entry_fill < raw_sl and entry_fill > tp1): continue
            
            sim = simulate_trade_partial(m15, i, direction, entry_fill, raw_sl, tp1, tp2, be_r=be_r, stale_h=12)
            if sim:
                all_trades.append({"r": sim["r"], "reason": sim["reason"], "time": bar['t']})
                cooldown_until = sim["close_idx"] + 2
                
    n = len(all_trades)
    if n == 0: return None
    wins = [t for t in all_trades if t['r'] > 0]
    losses = [t for t in all_trades if t['r'] <= 0]
    wr = len(wins) / n * 100.0
    r_sum = sum(t['r'] for t in all_trades)
    avg_r = r_sum / n
    trades_per_week = n / (92.0 / 7.0)
    
    eq = 0.0; peak = 0.0; max_dd = 0.0
    for t in sorted(all_trades, key=lambda x: parse_iso(x["time"])):
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
        "ret_to_dd": round(r_sum / abs(max_dd), 2) if max_dd < 0 else 99.0,
    }

print("\nRunning systematic Classic SMC scaling matrix...")
classic_results = []

# Experiment 1: H4 Sweep vs H1 Sweep
classic_results.append(test_classic_variant("Classic_H4_Sweep_H1_Prior_1.5R_BE1.0", sweep_tf="H4", prior_tf="H1", target_r=1.5, be_r=1.0))
classic_results.append(test_classic_variant("Classic_H4_Sweep_H1_Prior_1.5R_NoBE", sweep_tf="H4", prior_tf="H1", target_r=1.5, be_r=0.0))
classic_results.append(test_classic_variant("Classic_H1_Sweep_H1_Prior_1.5R_BE1.0", sweep_tf="H1", prior_tf="H1", target_r=1.5, be_r=1.0))
classic_results.append(test_classic_variant("Classic_H1_Sweep_H1_Prior_1.5R_NoBE", sweep_tf="H1", prior_tf="H1", target_r=1.5, be_r=0.0))

# Experiment 2: Partial Profit Taking (50% at 1.5R, 50% at 2.5R)
classic_results.append(test_classic_variant("Classic_H4_Sweep_Partial_1.5R_2.5R", sweep_tf="H4", prior_tf="H1", target_r=1.5, partial_tp2=2.5, be_r=1.0))
classic_results.append(test_classic_variant("Classic_H4_Sweep_Partial_1.5R_3.0R", sweep_tf="H4", prior_tf="H1", target_r=1.5, partial_tp2=3.0, be_r=1.0))

# Experiment 3: POI source (H4 vs H1 vs ANY)
classic_results.append(test_classic_variant("Classic_H4_Sweep_H1_OB_1.5R_BE1.0", sweep_tf="H4", prior_tf="H1", target_r=1.5, poi_req="H1", be_r=1.0))
classic_results.append(test_classic_variant("Classic_H4_Sweep_ANY_OB_1.5R_BE1.0", sweep_tf="H4", prior_tf="H1", target_r=1.5, poi_req="ANY", be_r=1.0))

# Experiment 4: M15 Prior with Partial Exits
classic_results.append(test_classic_variant("Classic_M15_Prior_1.5R_NoBE", sweep_tf="H4", prior_tf="M15", target_r=1.5, be_r=0.0))
classic_results.append(test_classic_variant("Classic_M15_Prior_Partial_1.5R_2.5R", sweep_tf="H4", prior_tf="M15", target_r=1.5, partial_tp2=2.5, be_r=1.0))

classic_results = [r for r in classic_results if r is not None]
classic_results.sort(key=lambda x: x["r_sum"], reverse=True)

print("\n" + "="*120)
print(f"{'Strategy Variant':44s} | {'Trades':>6s} | {'Tr/Wk':>5s} | {'Win %':>6s} | {'Total R':>8s} | {'Avg R':>6s} | {'PF':>5s} | {'Max DD':>7s} | {'R/DD':>5s}")
print("="*120)
for r in classic_results:
    plus = "+" if r['r_sum'] >= 0 else ""
    avg_p = "+" if r['avg_r'] >= 0 else ""
    print(f"{r['name']:44s} | {r['trades']:6d} | {r['trades_per_week']:5.1f} | {r['wr']:5.1f}% | {plus}{r['r_sum']:7.2f}R | {avg_p}{r['avg_r']:5.2f}R | {r['pf']:5.2f} | {r['max_dd']:6.1f}R | {r['ret_to_dd']:5.2f}")
print("="*120)

with open(os.path.join(os.path.dirname(__file__), "classic_optimization_results.json"), "w") as f:
    json.dump(classic_results, f, indent=2)
