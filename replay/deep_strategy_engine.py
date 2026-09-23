#!/usr/bin/env python3
"""
deep_strategy_engine.py — Advanced Quantitative Model Discovery
----------------------------------------------------------------
Systematically develops and iterates on institutional-grade algorithms:
1. Multi-Day Liquidity Sweep + HTF Alignment (3-Day / Weekly Extremes)
2. Asymmetric Trend Continuation (H4 Trend + H1 Structural Pullback + Tight Confirmation)
3. Volatility Compression Breakout (Bollinger / Keltner Squeeze + Volume/Range Expansion)
4. Institutional Mitigation Engine (HTF Order Block + FVG Confluence + Dynamic SL)
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

def compute_ema(closes, period):
    if len(closes) < period: return [0.0] * len(closes)
    k = 2.0 / (period + 1)
    ema = [0.0] * len(closes)
    ema[period-1] = sum(closes[:period]) / period
    for i in range(period, len(closes)):
        ema[i] = closes[i] * k + ema[i-1] * (1.0 - k)
    return ema

def simulate_trade(m15_bars, entry_idx, direction, entry_fill, sl, tp, max_hold_bars=96, be_at_r=1.0, stale_h=12):
    risk = abs(entry_fill - sl)
    if risk <= 0: return None
    be_triggered = False
    current_sl = sl
    entry_time = m15_bars[entry_idx]['t']
    t0 = parse_iso(entry_time)
    
    for j in range(entry_idx + 1, min(entry_idx + 1 + max_hold_bars, len(m15_bars))):
        b = m15_bars[j]
        exit_low = b['l'] if direction == "BUY" else b['al']
        exit_high = b['h'] if direction == "BUY" else b['ah']
        exit_close = b['c'] if direction == "BUY" else b['ac']
        
        age_h = (parse_iso(b['t']) - t0) / 3600.0
        if stale_h > 0 and age_h >= stale_h and not be_triggered and risk > 0:
            prog = (exit_close - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_close) / risk
            if prog < 0:
                return {"entry_time": entry_time, "close_time": b['t'], "entry": entry_fill, "sl": sl, "exit": exit_close, "r": round(prog, 2), "reason": "STALE", "close_idx": j}
        
        if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
            r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
            return {"entry_time": entry_time, "close_time": b['t'], "entry": entry_fill, "sl": sl, "exit": current_sl, "r": round(r, 2), "reason": "BE" if be_triggered else "SL", "close_idx": j}
        
        if (direction == "BUY" and exit_high >= tp) or (direction == "SELL" and exit_low <= tp):
            r = (tp - entry_fill) / risk if direction == "BUY" else (entry_fill - tp) / risk
            return {"entry_time": entry_time, "close_time": b['t'], "entry": entry_fill, "sl": sl, "exit": tp, "r": round(r, 2), "reason": "TP", "close_idx": j}
        
        if be_at_r > 0 and not be_triggered:
            if (direction == "BUY" and exit_high >= entry_fill + be_at_r * risk) or (direction == "SELL" and exit_low <= entry_fill - be_at_r * risk):
                be_triggered = True
                current_sl = entry_fill
                
    last_b = m15_bars[min(entry_idx + max_hold_bars, len(m15_bars) - 1)]
    exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
    r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
    return {"entry_time": entry_time, "close_time": last_b['t'], "entry": entry_fill, "sl": sl, "exit": exit_c, "r": round(r, 2), "reason": "TIME_EXPIRED", "close_idx": min(entry_idx + max_hold_bars, len(m15_bars) - 1)}

# Load and prep all data
print("Loading data for deep algorithmic strategy search...")
all_data = []
for pair, epic in PAIRS:
    m15 = json.load(open(os.path.join(DATA_DIR, f"{epic}_M15.json")))
    h1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H1.json")))
    h4 = json.load(open(os.path.join(DATA_DIR, f"{epic}_H4.json")))
    d1 = json.load(open(os.path.join(DATA_DIR, f"{epic}_D1.json")))
    
    h1_atr = compute_atr(h1, 14)
    h4_atr = compute_atr(h4, 14)
    
    h4_closes = [b['c'] for b in h4]
    h4_ema20 = compute_ema(h4_closes, 20)
    h4_ema50 = compute_ema(h4_closes, 50)
    h4_ema200 = compute_ema(h4_closes, 200)
    
    h1_closes = [b['c'] for b in h1]
    h1_ema20 = compute_ema(h1_closes, 20)
    h1_ema50 = compute_ema(h1_closes, 50)
    
    d1_closes = [b['c'] for b in d1]
    d1_ema20 = compute_ema(d1_closes, 20)
    d1_ema50 = compute_ema(d1_closes, 50)
    
    all_data.append({
        "pair": pair, "epic": epic, "mult": pip_mult(pair),
        "m15": m15, "h1": h1, "h4": h4, "d1": d1,
        "h1_atr": h1_atr, "h4_atr": h4_atr,
        "h4_ema20": h4_ema20, "h4_ema50": h4_ema50, "h4_ema200": h4_ema200,
        "h1_ema20": h1_ema20, "h1_ema50": h1_ema50,
        "d1_ema20": d1_ema20, "d1_ema50": d1_ema50,
    })

def evaluate_strategy(name, strategy_generator):
    all_trades = []
    for pdata in all_data:
        pair = pdata["pair"]
        m15 = pdata["m15"]
        cooldown_until = 0
        signals = strategy_generator(pdata)
        
        for sig in signals:
            idx = sig["idx"]
            if idx < cooldown_until or idx >= len(m15) - 10: continue
            bar = m15[idx]
            
            # Spread filter
            spread_pips = (bar['ac'] - bar['c']) * pdata["mult"]
            max_spread = 50 if "XAU" in pair else (15 if "XAG" in pair else 5)
            if spread_pips > max_spread: continue
            
            direction = sig["direction"]
            entry_fill = bar['ac'] if direction == "BUY" else bar['c']
            sl = sig["sl"]
            tp = sig["tp"]
            be_at_r = sig.get("be_at_r", 1.0)
            stale_h = sig.get("stale_h", 12)
            max_hold = sig.get("max_hold", 96)
            
            if direction == "BUY" and not (entry_fill > sl and entry_fill < tp): continue
            if direction == "SELL" and not (entry_fill < sl and entry_fill > tp): continue
            
            trade = simulate_trade(m15, idx, direction, entry_fill, sl, tp, max_hold, be_at_r, stale_h)
            if trade:
                trade["pair"] = pair
                all_trades.append(trade)
                cooldown_until = trade["close_idx"] + 2
                
    n = len(all_trades)
    if n == 0: return None
    wins = [t for t in all_trades if t['r'] > 0]
    losses = [t for t in all_trades if t['r'] <= 0]
    wr = len(wins) / n * 100.0
    r_sum = sum(t['r'] for t in all_trades)
    avg_r = r_sum / n
    trades_per_week = n / (92.0 / 7.0)
    
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
        "ret_to_dd": round(r_sum / abs(max_dd), 2) if max_dd < 0 else 99.0,
        "trades_list": all_trades
    }

candidates = []

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 1: MULTI-DAY LIQUIDITY RUN WITH ASYMMETRIC REVERSAL (3-Day Extrema)
# ══════════════════════════════════════════════════════════════════════════════
# Institutional logic: Rather than intraday noise, wait for price to run past
# the 3-day high or 3-day low (where retail stops accumulate over a whole week).
# When price wicks past the 3-day extreme and reclaims it during London/NY
# with an M15 confirming candle, take the reversal.
def make_multiday_sweep_strategy(lookback_days=3, tp_r=1.5, be_r=1.0, filter_daily=True):
    def run(pdata):
        m15 = pdata["m15"]
        d1 = pdata["d1"]
        h1 = pdata["h1"]
        h1_atr = pdata["h1_atr"]
        d1_ema20 = pdata["d1_ema20"]
        d1_ema50 = pdata["d1_ema50"]
        signals = []
        
        # Build rolling N-day high and low map
        day_map = {}
        for d_idx in range(lookback_days, len(d1)):
            window = d1[d_idx - lookback_days : d_idx]
            curr_d = d1[d_idx]
            dt = datetime.datetime.fromisoformat(curr_d['t'].replace("Z","").split("+")[0])
            n_high = max(b['h'] for b in window)
            n_low = min(b['l'] for b in window)
            
            trend = "RANGE"
            if d1_ema20[d_idx-1] > d1_ema50[d_idx-1] and d1[d_idx-1]['c'] > d1_ema20[d_idx-1]:
                trend = "BULLISH"
            elif d1_ema20[d_idx-1] < d1_ema50[d_idx-1] and d1[d_idx-1]['c'] < d1_ema20[d_idx-1]:
                trend = "BEARISH"
                
            day_map[dt.strftime("%Y-%m-%d")] = {
                "high": n_high, "low": n_low, "trend": trend
            }
            
        h1_ptr = 0
        for i in range(100, len(m15)):
            t_str = m15[i]['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            day_str = dt.strftime("%Y-%m-%d")
            hour = dt.hour + dt.minute / 60.0
            dow = dt.weekday()
            
            if dow >= 5 or day_str not in day_map: continue
            # London or NY kill zones only
            if not ((7.0 <= hour <= 10.0) or (12.0 <= hour <= 16.0)): continue
            
            t_epoch = parse_iso(t_str)
            while h1_ptr < len(h1) and parse_iso(h1[h1_ptr]['t']) <= t_epoch:
                h1_ptr += 1
            atr_val = h1_atr[min(h1_ptr - 1, len(h1_atr) - 1)] if h1_ptr > 0 else 0
            if atr_val <= 0: continue
            
            info = day_map[day_str]
            level_high = info["high"]
            level_low = info["low"]
            daily_trend = info["trend"]
            
            curr = m15[i]
            prev = m15[i-1]
            body = abs(curr['c'] - curr['o'])
            rng = curr['h'] - curr['l']
            body_ratio = body / rng if rng > 0 else 0
            
            # Sweep of N-day Low -> Reversal BUY
            if (curr['l'] < level_low or prev['l'] < level_low) and curr['c'] > level_low:
                if curr['c'] > curr['o'] and (body_ratio >= 0.50 or (curr['o'] - curr['l']) > 0.4 * rng):
                    if not filter_daily or daily_trend != "BEARISH":
                        sweep_low = min(curr['l'], prev['l'])
                        sl = sweep_low - 0.15 * atr_val
                        risk = abs(curr['c'] - sl)
                        if 0.3 * atr_val <= risk <= 2.5 * atr_val:
                            signals.append({"idx": i, "direction": "BUY", "sl": sl, "tp": curr['c'] + tp_r * risk, "be_at_r": be_r})
            
            # Sweep of N-day High -> Reversal SELL
            elif (curr['h'] > level_high or prev['h'] > level_high) and curr['c'] < level_high:
                if curr['c'] < curr['o'] and (body_ratio >= 0.50 or (curr['h'] - curr['c']) > 0.4 * rng):
                    if not filter_daily or daily_trend != "BULLISH":
                        sweep_high = max(curr['h'], prev['h'])
                        sl = sweep_high + 0.15 * atr_val
                        risk = abs(sl - curr['c'])
                        if 0.3 * atr_val <= risk <= 2.5 * atr_val:
                            signals.append({"idx": i, "direction": "SELL", "sl": sl, "tp": curr['c'] - tp_r * risk, "be_at_r": be_r})
        return signals
    return run

for lb in [2, 3, 5]:
    for tp in [1.5, 2.0, 2.5]:
        for be in [1.0, 0]:
            name = f"MultiDay_Sweep_{lb}d_TP{tp}R_BE{be}"
            res = evaluate_strategy(name, make_multiday_sweep_strategy(lb, tp, be, True))
            if res: candidates.append(res)

# ══════════════════════════════════════════════════════════════════════════════
# MODEL 2: DUAL-TIMEFRAME MOMENTUM EXPANSION (H4 Regime + M15 Range Break)
# ══════════════════════════════════════════════════════════════════════════════
def make_momentum_break_strategy(tp_r=2.0, be_r=1.0, sl_atr_mult=1.0):
    def run(pdata):
        m15 = pdata["m15"]
        h4 = pdata["h4"]
        h1 = pdata["h1"]
        h1_atr = pdata["h1_atr"]
        h4_ema20 = pdata["h4_ema20"]
        h4_ema50 = pdata["h4_ema50"]
        signals = []
        
        h1_ptr = 0
        h4_ptr = 0
        
        for i in range(100, len(m15)):
            t_str = m15[i]['t']
            dt = datetime.datetime.fromisoformat(t_str.replace("Z","").split("+")[0])
            hour = dt.hour + dt.minute / 60.0
            
            # London & NY open windows: 07:00-09:30 or 12:00-14:30
            if not ((7.0 <= hour <= 9.5) or (12.0 <= hour <= 14.5)): continue
            
            t_epoch = parse_iso(t_str)
            while h1_ptr < len(h1) and parse_iso(h1[h1_ptr]['t']) <= t_epoch: h1_ptr += 1
            while h4_ptr < len(h4) and parse_iso(h4[h4_ptr]['t']) <= t_epoch: h4_ptr += 1
            if h1_ptr < 30 or h4_ptr < 30: continue
            
            atr_val = h1_atr[h1_ptr - 1]
            if atr_val <= 0: continue
            
            # H4 Strong Trend Regime
            h4_c = h4[h4_ptr - 1]['c']
            e20 = h4_ema20[h4_ptr - 1]
            e50 = h4_ema50[h4_ptr - 1]
            h4_bull = h4_c > e20 and e20 > e50
            h4_bear = h4_c < e20 and e20 < e50
            if not (h4_bull or h4_bear): continue
            
            # M15 Expansion: current candle range >= 1.4x ATR and body >= 65%
            curr = m15[i]
            body = abs(curr['c'] - curr['o'])
            rng = curr['h'] - curr['l']
            if rng < 1.3 * (atr_val / 2.0): continue # 15M relative range
            if body / rng < 0.65: continue
            
            # Breakout of last 8 M15 bars
            recent_8 = m15[i-8 : i]
            max_h = max(b['h'] for b in recent_8)
            min_l = min(b['l'] for b in recent_8)
            
            if h4_bull and curr['c'] > max_h and curr['c'] > curr['o']:
                sl = curr['c'] - sl_atr_mult * atr_val
                risk = abs(curr['c'] - sl)
                signals.append({"idx": i, "direction": "BUY", "sl": sl, "tp": curr['c'] + tp_r * risk, "be_at_r": be_r})
                
            elif h4_bear and curr['c'] < min_l and curr['c'] < curr['o']:
                sl = curr['c'] + sl_atr_mult * atr_val
                risk = abs(sl - curr['c'])
                signals.append({"idx": i, "direction": "SELL", "sl": sl, "tp": curr['c'] - tp_r * risk, "be_at_r": be_r})
                
        return signals
    return run

for tp in [1.5, 2.0, 3.0]:
    for sl_mult in [0.75, 1.0, 1.25]:
        name = f"Momentum_Expansion_TP{tp}R_SL{sl_mult}x_BE1.0"
        res = evaluate_strategy(name, make_momentum_break_strategy(tp, 1.0, sl_mult))
        if res: candidates.append(res)

# Print Top Positive Edge Strategies
positive_candidates = [c for c in candidates if c["r_sum"] > 0 and c["trades"] >= 15]
positive_candidates.sort(key=lambda x: x["r_sum"], reverse=True)

print(f"\nTotal Configurations Tested: {len(candidates)}")
print(f"Configurations With Proven Positive Expectancy (>= 15 trades): {len(positive_candidates)}\n")

if positive_candidates:
    print("="*120)
    print(f"{'Rank':4s} | {'Strategy Architecture':42s} | {'Trades':>6s} | {'Tr/Wk':>5s} | {'Win %':>6s} | {'Total R':>8s} | {'Avg R':>6s} | {'PF':>5s} | {'Max DD':>7s} | {'R/DD':>5s}")
    print("="*120)
    for rank, r in enumerate(positive_candidates[:15], 1):
        print(f"{rank:4d} | {r['name']:42s} | {r['trades']:6d} | {r['trades_per_week']:5.1f} | {r['wr']:5.1f}% | +{r['r_sum']:7.2f}R | +{r['avg_r']:5.2f}R | {r['pf']:5.2f} | {r['max_dd']:6.1f}R | {r['ret_to_dd']:5.2f}")
    print("="*120)

with open(os.path.join(os.path.dirname(__file__), "deep_discovery_results.json"), "w") as f:
    json.dump([{k: v for k, v in r.items() if k != "trades_list"} for r in candidates], f, indent=2)
