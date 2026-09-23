#!/usr/bin/env python3
"""
super_edge_discovery.py — Advanced Quantitative & Structural Edge Discovery
----------------------------------------------------------------------------
Explores advanced institutional edges:
1. ICT Model 2022: H4 Sweep -> M15 MSS with Displacement FVG -> Retest of FVG
2. Draw-On-Liquidity (DOL) Targeting: Target opposite H4 pool instead of fixed R
3. Multi-Tier Scaling: 1/3 at 1.5R, 1/3 at 2.5R, 1/3 runner to 4.0R / Opposing Pool
4. Silver Bullet Killzones: High-volatility execution windows (London 07-09:30, NY 12:30-15:00)
5. Sweep Depth & Strong Wick Rejection Filters
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
    highs, lows = [], []
    for i in range(lookback, len(bars) - lookback):
        is_h, is_l = True, True
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
    sh, sl = highs[-2:], lows[-2:]
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
                penetration = c['h'] - lvl
                return True, c, c['h'], penetration
        else:
            if c['l'] < lvl - tol and c['c'] > lvl:
                penetration = lvl - c['l']
                return True, c, c['l'], penetration
    return False, None, 0.0, 0.0

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
    curr, prev = bars[-1], bars[-2]
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

def find_m15_fvg(bars, direction):
    if len(bars) < 3: return None
    for k in range(len(bars)-2, max(0, len(bars)-6), -1):
        b1, b2, b3 = bars[k-1], bars[k], bars[k+1]
        if direction == "BUY":
            if b3['l'] > b1['h']:
                return {"top": b3['l'], "bottom": b1['h'], "mid": (b3['l'] + b1['h'])/2.0}
        else:
            if b1['l'] > b3['h']:
                return {"top": b1['l'], "bottom": b3['h'], "mid": (b1['l'] + b3['h'])/2.0}
    return None

def simulate_trade_multitarget(m15_bars, entry_idx, direction, entry_fill, sl, targets, be_trigger_r=1.0, stale_h=12):
    risk = abs(entry_fill - sl)
    if risk <= 0: return None
    be_triggered = False
    current_sl = sl
    entry_time = m15_bars[entry_idx]['t']
    t0 = parse_iso(entry_time)
    
    total_r = 0.0
    remaining_weight = 1.0
    active_targets = [[w, tp, False] for w, tp in targets]
    
    for j in range(entry_idx + 1, min(entry_idx + 1 + 96, len(m15_bars))):
        b = m15_bars[j]
        exit_low = b['l'] if direction == "BUY" else b['al']
        exit_high = b['h'] if direction == "BUY" else b['ah']
        exit_close = b['c'] if direction == "BUY" else b['ac']
        
        age_h = (parse_iso(b['t']) - t0) / 3600.0
        if stale_h > 0 and age_h >= stale_h and not be_triggered and remaining_weight == 1.0 and risk > 0:
            prog = (exit_close - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_close) / risk
            if prog < 0:
                return {"r": round(prog, 2), "reason": "STALE", "close_idx": j, "bars": j - entry_idx}
                
        if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
            loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
            total_r += remaining_weight * loss_r
            return {"r": round(total_r, 2), "reason": "BE" if be_triggered else "SL", "close_idx": j, "bars": j - entry_idx}
            
        for item in active_targets:
            w, tp, hit = item
            if not hit:
                if (direction == "BUY" and exit_high >= tp) or (direction == "SELL" and exit_low <= tp):
                    item[2] = True
                    r_gain = (tp - entry_fill) / risk if direction == "BUY" else (entry_fill - tp) / risk
                    total_r += w * r_gain
                    remaining_weight -= w
                    current_sl = entry_fill
                    be_triggered = True
                    
        if remaining_weight <= 0.001:
            return {"r": round(total_r, 2), "reason": "ALL_TP", "close_idx": j, "bars": j - entry_idx}
            
        if be_trigger_r > 0 and not be_triggered:
            if (direction == "BUY" and exit_high >= entry_fill + be_trigger_r * risk) or \
               (direction == "SELL" and exit_low <= entry_fill - be_trigger_r * risk):
                be_triggered = True
                current_sl = entry_fill
                
    last_b = m15_bars[min(entry_idx + 96, len(m15_bars) - 1)]
    exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
    final_r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
    total_r += remaining_weight * final_r
    return {"r": round(total_r, 2), "reason": "EOD", "close_idx": min(entry_idx + 96, len(m15_bars) - 1), "bars": 96}

# Load prepped data
print("Loading data for super edge discovery...")
all_data = []
for pair, epic in PAIRS:
    m15 = json.load(open(os.path.join(DATA_DIR, f"{epic}_M15.json")))
    h1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H1.json")))
    h4 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H4.json")))
    d1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_D1.json")))
    h1_atr = compute_atr(h1, 14)
    all_data.append({"pair": pair, "epic": epic, "mult": pip_mult(pair), "m15": m15, "h1": h1, "h4": h4, "d1": d1, "h1_atr": h1_atr})

experiments = []

def run_experiment(name, logic_fn):
    all_trades = []
    for pdata in all_data:
        m15 = pdata["m15"]
        cooldown_until = 0
        trades = logic_fn(pdata)
        for t in trades:
            if t["idx"] >= cooldown_until:
                all_trades.append(t)
                cooldown_until = t["close_idx"] + 2
                
    n = len(all_trades)
    if n == 0: return None
    wins = [t for t in all_trades if t['r'] > 0]
    losses = [t for t in all_trades if t['r'] <= 0]
    wr = len(wins) / n * 100.0
    r_sum = sum(t['r'] for t in all_trades)
    avg_r = r_sum / n
    trades_per_week = n / (92.0 / 7.0)
    
    eq, peak, max_dd = 0.0, 0.0, 0.0
    for t in sorted(all_trades, key=lambda x: parse_iso(x["time"])):
        eq += t["r"]
        peak = max(peak, eq)
        max_dd = min(max_dd, eq - peak)
        
    pos_r = sum(t['r'] for t in wins)
    neg_r = abs(sum(t['r'] for t in losses))
    pf = (pos_r / neg_r) if neg_r > 0 else (99.0 if pos_r > 0 else 0)
    
    return {
        "name": name, "trades": n, "trades_per_week": round(trades_per_week, 1),
        "wr": round(wr, 1), "r_sum": round(r_sum, 2), "avg_r": round(avg_r, 2),
        "pf": round(pf, 2), "max_dd": round(max_dd, 1),
        "ret_to_dd": round(r_sum / abs(max_dd), 2) if max_dd < 0 else 99.0,
        "trades_list": all_trades
    }

# ══════════════════════════════════════════════════════════════════════════════
# MODEL ARCHITECTURE: DUAL OB SCALING WITH ADVANCED TARGETS
# ══════════════════════════════════════════════════════════════════════════════
def make_dual_ob_experiment(targets_config, be_r=1.0, killzone_filter=False, dol_targeting=False):
    def logic(pdata):
        m15, h1, h4, d1 = pdata["m15"], pdata["h1"], pdata["h4"], pdata["d1"]
        h1_atr, mult, pair = pdata["h1_atr"], pdata["mult"], pdata["pair"]
        trades = []
        h1_p, h4_p, d1_p = 0, 0, 0
        
        for i in range(400, len(m15)):
            bar = m15[i]
            t_str = bar['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            hour = dt.hour + dt.minute / 60.0
            dow = dt.weekday()
            if dow == 5 or (dow == 6 and hour < 21.0) or hour < 7.0: continue
            
            # Optional Killzone: London open (07-10) or NY open (12-16)
            if killzone_filter:
                if not ((7.0 <= hour <= 10.0) or (12.0 <= hour <= 16.0)): continue
            
            spread_pips = (bar['ac'] - bar['c']) * mult
            if spread_pips > (50 if "XAU" in pair else (15 if "XAG" in pair else 5)): continue
            
            t_epoch = parse_iso(t_str)
            while h1_p < len(h1) and parse_iso(h1[h1_p]['t']) <= t_epoch: h1_p += 1
            while h4_p < len(h4) and parse_iso(h4[h4_p]['t']) <= t_epoch: h4_p += 1
            while d1_p < len(d1) and parse_iso(d1[d1_p]['t']) <= t_epoch: d1_p += 1
            if h1_p < 60 or h4_p < 60 or d1_p < 20: continue
            
            hAtr = h1_atr[min(h1_p - 1, len(h1_atr) - 1)]
            if hAtr <= 0: continue
            
            h1_win = h1[max(0, h1_p - 120) : h1_p]
            h4_win = h4[max(0, h4_p - 120) : h4_p]
            d1_win = d1[max(0, d1_p - 100) : d1_p]
            m15_win = m15[max(0, i - 120) : i]
            
            h1_trend, _, _ = classify_trend(h1_win, 2)
            d1_trend, _, _ = classify_trend(d1_win, 2)
            if h1_trend not in ("BULLISH", "BEARISH"): continue
            if d1_trend not in ("RANGE", "UNCLEAR", h1_trend): continue
            
            pd_zone, rh, rl, pos = get_premium_discount(h1_win, hAtr)
            if pd_zone in ("COMPRESSED", "EQ"): continue
            direction = "BUY" if (pd_zone == "DISCOUNT" or pos <= 0.5) else "SELL"
            if h1_trend == "BULLISH" and pd_zone == "PREMIUM": continue
            if h1_trend == "BEARISH" and pd_zone == "DISCOUNT": continue
            
            # Dual OB: Check H4 OB first, then H1 OB
            poi = find_order_block(h4_win, h1_trend, compute_atr(h4_win, 14)[-1] or hAtr) or find_order_block(h1_win, h1_trend, hAtr)
            if not poi: continue
            
            buy_p, sell_p = find_pools(h4_win)
            t_pools = sell_p if direction == "BUY" else buy_p
            has_sw, sw_bar, sw_ext, pen = False, None, 0.0, 0.0
            for pool in t_pools:
                sw, b, ext, p = detect_sweep_bar(h4_win, pool, lookback=8)
                if sw: has_sw, sw_bar, sw_ext, pen = True, b, ext, p; break
            if not has_sw: continue
            
            m15_highs, m15_lows = find_swings(m15_win, 2)
            s_break = detect_structure_break(m15_win, m15_highs, m15_lows, h1_trend)
            if not s_break: continue
            b_type, b_bar, _ = s_break
            if (direction == "BUY") != (b_bar['c'] > b_bar['o']): continue
            if parse_iso(b_bar['t']) <= parse_iso(sw_bar['t']): continue
            
            last_m15 = m15_win[-1]
            overlaps = (last_m15['l'] <= poi['high'] and last_m15['h'] >= poi['low'])
            near = (poi['low'] - last_m15['c'] <= 0.25 * hAtr) if direction == "BUY" else (last_m15['c'] - poi['high'] <= 0.25 * hAtr)
            if not (overlaps or near): continue
            
            if not check_confirmation_candle(m15_win, direction, min_body_ratio=0.55): continue
            
            entry_fill = bar['ac'] if direction == "BUY" else bar['c']
            buffer = 0.15 * hAtr
            raw_sl = sw_ext - buffer if direction == "BUY" else sw_ext + buffer
            risk = abs(entry_fill - raw_sl)
            min_stop = 0.3 * hAtr
            if risk < min_stop:
                risk = min_stop
                raw_sl = entry_fill - min_stop if direction == "BUY" else entry_fill + min_stop
                
            # Build targets
            t_prices = []
            if dol_targeting:
                # Target 1 = 1.5R (secure profit), Target 2 = Draw On Liquidity (Opposing H4 pool or Range extreme)
                dol_level = rh if direction == "BUY" else rl
                if buy_p and direction == "BUY": dol_level = max(p['level'] for p in buy_p)
                if sell_p and direction == "SELL": dol_level = min(p['level'] for p in sell_p)
                t1 = entry_fill + 1.5 * risk if direction == "BUY" else entry_fill - 1.5 * risk
                t_prices = [(0.5, t1), (0.5, dol_level)]
            else:
                for weight, mult_r in targets_config:
                    tp_val = entry_fill + mult_r * risk if direction == "BUY" else entry_fill - mult_r * risk
                    t_prices.append((weight, tp_val))
                    
            first_tp = t_prices[0][1]
            if direction == "BUY" and not (entry_fill > raw_sl and entry_fill < first_tp): continue
            if direction == "SELL" and not (entry_fill < raw_sl and entry_fill > first_tp): continue
            
            sim = simulate_trade_multitarget(m15, i, direction, entry_fill, raw_sl, t_prices, be_trigger_r=be_r)
            if sim:
                trades.append({"idx": i, "close_idx": sim["close_idx"], "r": sim["r"], "time": bar['t']})
        return trades
    return logic

print("Testing permutations...")
# 1. Dual OB + 1.5R single target + BE
experiments.append(run_experiment("Dual_OB_Fixed_1.5R_BE1.0", make_dual_ob_experiment([(1.0, 1.5)], be_r=1.0)))
# 2. Dual OB + 1.5R single target + NO BE
experiments.append(run_experiment("Dual_OB_Fixed_1.5R_NoBE", make_dual_ob_experiment([(1.0, 1.5)], be_r=0.0)))
# 3. Dual OB + Split 50% @ 1.5R, 50% @ 2.5R + BE
experiments.append(run_experiment("Dual_OB_Split_1.5R_2.5R", make_dual_ob_experiment([(0.5, 1.5), (0.5, 2.5)], be_r=1.0)))
# 4. Dual OB + Split 50% @ 1.5R, 50% @ 3.0R + BE
experiments.append(run_experiment("Dual_OB_Split_1.5R_3.0R", make_dual_ob_experiment([(0.5, 1.5), (0.5, 3.0)], be_r=1.0)))
# 5. Dual OB + Split 50% @ 1.5R, 50% @ 3.5R + BE
experiments.append(run_experiment("Dual_OB_Split_1.5R_3.5R", make_dual_ob_experiment([(0.5, 1.5), (0.5, 3.5)], be_r=1.0)))
# 6. Dual OB + 3-Tier: 40% @ 1.5R, 30% @ 2.5R, 30% @ 4.0R
experiments.append(run_experiment("Dual_OB_3Tier_1.5R_2.5R_4.0R", make_dual_ob_experiment([(0.4, 1.5), (0.3, 2.5), (0.3, 4.0)], be_r=1.0)))
# 7. Dual OB + Draw On Liquidity (DOL) Targeting (50% @ 1.5R, 50% @ Opposing Pool)
experiments.append(run_experiment("Dual_OB_DOL_Targeting", make_dual_ob_experiment([], be_r=1.0, dol_targeting=True)))
# 8. Dual OB + Killzone only (London 07-10, NY 12-16) + 1.5R
experiments.append(run_experiment("Dual_OB_Killzone_1.5R_BE1.0", make_dual_ob_experiment([(1.0, 1.5)], be_r=1.0, killzone_filter=True)))
# 9. Dual OB + Killzone only + Split 1.5R / 3.0R
experiments.append(run_experiment("Dual_OB_Killzone_Split_1.5R_3.0R", make_dual_ob_experiment([(0.5, 1.5), (0.5, 3.0)], be_r=1.0, killzone_filter=True)))

valid_exps = [e for e in experiments if e is not None]
valid_exps.sort(key=lambda x: x["r_sum"], reverse=True)

print("\n" + "="*125)
print(f"{'Strategy Architecture':46s} | {'Trades':>6s} | {'Tr/Wk':>5s} | {'Win %':>6s} | {'Total R':>8s} | {'Avg R':>6s} | {'PF':>5s} | {'Max DD':>7s} | {'R/DD':>5s}")
print("="*125)
for r in valid_exps:
    plus = "+" if r['r_sum'] >= 0 else ""
    avg_p = "+" if r['avg_r'] >= 0 else ""
    print(f"{r['name']:46s} | {r['trades']:6d} | {r['trades_per_week']:5.1f} | {r['wr']:5.1f}% | {plus}{r['r_sum']:7.2f}R | {avg_p}{r['avg_r']:5.2f}R | {r['pf']:5.2f} | {r['max_dd']:6.1f}R | {r['ret_to_dd']:5.2f}")
print("="*125)

out_file = os.path.join(os.path.dirname(__file__), "super_edge_results.json")
with open(out_file, "w") as f:
    json.dump([{k: v for k, v in r.items() if k != "trades_list"} for r in valid_exps], f, indent=2)
print(f"Results saved to {out_file}")
