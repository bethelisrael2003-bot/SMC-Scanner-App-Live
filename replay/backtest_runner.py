#!/usr/bin/env python3
"""
SMC / Quantitative Backtest Kit & Simulation Engine
====================================================
Self-contained, zero-dependency Python script. Runs against the 92-day
dataset (11 pairs, ~69,000 candle bars).

Used to test and optimize new trading strategies with full institutional
parity (spread-aware fills, session hours, re-entry cooldown, 1 slot per pair,
SL checked before TP within bar, honest R accounting).

USAGE:
  python3 backtest_runner.py

HOW TO USE WITH AN AI:
  1. Upload the zip containing this script and the 'data/' folder to ChatGPT / Claude.
  2. Ask the AI to write a new strategy inside the `my_custom_strategy()` function.
  3. Tell the AI to run `python3 backtest_runner.py` in its code environment to see
     the exact trade list, win rate, total R, profit factor, and drawdown!
"""

import os
import sys
import json
import math
import datetime

# Directory containing the candle files
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

PAIRS = [
    ("EUR/USD", "EURUSD"), ("GBP/USD", "GBPUSD"), ("USD/JPY", "USDJPY"), ("USD/CHF", "USDCHF"),
    ("USD/CAD", "USDCAD"), ("AUD/USD", "AUDUSD"), ("NZD/USD", "NZDUSD"), ("GBP/JPY", "GBPJPY"),
    ("EUR/JPY", "EURJPY"), ("XAU/USD", "GOLD"), ("XAG/USD", "SILVER")
]

def pip_multiplier(pair):
    if "XAU" in pair: return 10
    if "XAG" in pair or "JPY" in pair: return 100
    return 10000

def parse_iso(ts):
    s = ts.replace("Z", "").split("+")[0]
    dt = datetime.datetime.fromisoformat(s)
    return dt.replace(tzinfo=datetime.timezone.utc).timestamp()

# ── Technical Indicator Helpers (Pure Standard Library) ──────────────────────
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

# ── Simulation Engine ────────────────────────────────────────────────────────
def simulate_trade_multitarget(m15_bars, entry_idx, direction, entry_fill, sl, targets, be_trigger_r=1.0, stale_h=12):
    """
    Simulates real execution:
      - targets: list of (weight, target_price) e.g. [(0.5, tp1), (0.5, tp2)]
      - SL checked before TP within candle (conservative worst-case fill)
      - BUY exits at bid, SELL exits at ask
      - Moves SL to Breakeven once Target 1 is hit
      - Closes stale trades at market if open >= 12h and R < 0.0
    """
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
        # Staleness check
        if stale_h > 0 and age_h >= stale_h and not be_triggered and remaining_weight == 1.0 and risk > 0:
            prog = (exit_close - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_close) / risk
            if prog < 0:
                return {"r": round(prog, 2), "reason": "STALE", "close_idx": j, "bars": j - entry_idx}
                
        # SL Check
        if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
            loss_r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
            total_r += remaining_weight * loss_r
            return {"r": round(total_r, 2), "reason": "BE" if be_triggered else "SL", "close_idx": j, "bars": j - entry_idx}
            
        # Target Checks
        for item in active_targets:
            w, tp, hit = item
            if not hit:
                if (direction == "BUY" and exit_high >= tp) or (direction == "SELL" and exit_low <= tp):
                    item[2] = True
                    r_gain = (tp - entry_fill) / risk if direction == "BUY" else (entry_fill - tp) / risk
                    total_r += w * r_gain
                    remaining_weight -= w
                    current_sl = entry_fill # Auto-move SL to breakeven
                    be_triggered = True
                    
        if remaining_weight <= 0.001:
            return {"r": round(total_r, 2), "reason": "ALL_TP", "close_idx": j, "bars": j - entry_idx}
            
        # Breakeven trigger before target
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


# ── Load Market Data ─────────────────────────────────────────────────────────
def load_all_market_data():
    all_data = []
    for pair, epic in PAIRS:
        m15_path = os.path.join(DATA_DIR, f"{epic}_M15.json")
        h1_path = os.path.join(DATA_DIR, f"{epic}_H1.json")
        h4_path = os.path.join(DATA_DIR, f"{epic}_H4.json")
        d1_path = os.path.join(DATA_DIR, f"{epic}_D1.json")
        
        if not (os.path.exists(m15_path) and os.path.exists(h1_path)):
            continue
            
        m15 = json.load(open(m15_path))
        h1 = json.load(open(h1_path))
        h4 = json.load(open(h4_path)) if os.path.exists(h4_path) else []
        d1 = json.load(open(d1_path)) if os.path.exists(d1_path) else []
        
        all_data.append({
            "pair": pair, "epic": epic, "mult": pip_multiplier(pair),
            "m15": m15, "h1": h1, "h4": h4, "d1": d1,
            "h1_atr": compute_atr(h1, 14),
            "h4_atr": compute_atr(h4, 14) if h4 else [],
        })
    return all_data


# ══════════════════════════════════════════════════════════════════════════════
# WRITE YOUR CUSTOM STRATEGY HERE
# ══════════════════════════════════════════════════════════════════════════════
def my_custom_strategy(pair_data):
    from collections import defaultdict
    import datetime
    
    signals = []
    pair = pair_data["pair"]
    if pair not in ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "XAU/USD", "GBP/JPY"]:
        return signals
    
    m15 = pair_data["m15"]
    h1 = pair_data["h1"]
    h1_atr = pair_data["h1_atr"]
    
    h1_time_to_atr = {b["t"]: h1_atr[i] if i < len(h1_atr) else 0 for i, b in enumerate(h1)}
    
    daily_asian = defaultdict(lambda: {"high": -1e9, "low": 1e9})
    for i, bar in enumerate(m15):
        dt = datetime.datetime.fromisoformat(bar["t"].replace("Z","").split("+")[0])
        day = dt.date()
        hour = dt.hour + dt.minute / 60.0
        if 0 <= hour < 7.0:
            daily_asian[day]["high"] = max(daily_asian[day]["high"], bar["h"])
            daily_asian[day]["low"] = min(daily_asian[day]["low"], bar["l"])
    
    taken_days = set()
    
    for i in range(20, len(m15) - 5):
        bar = m15[i]
        dt = datetime.datetime.fromisoformat(bar["t"].replace("Z","").split("+")[0])
        day = dt.date()
        hour = dt.hour + dt.minute / 60.0
        if not (7.0 <= hour < 10.5): continue
        if day in taken_days: continue
        if day not in daily_asian: continue
        asian = daily_asian[day]
        a_high = asian["high"]
        a_low = asian["low"]
        range_size = a_high - a_low
        if range_size <= 0: continue
        
        atr_val = 0
        for j in range(i, max(0, i-20), -1):
            ht = m15[j]["t"][:13] + ":00:00"
            if ht in h1_time_to_atr:
                atr_val = h1_time_to_atr[ht]
                break
        if atr_val <= 0: atr_val = range_size * 2
        
        if range_size < 0.36 * atr_val or range_size > 1.35 * atr_val: continue
        
        bar_range = bar["h"] - bar["l"]
        if bar_range < 0.36 * range_size: continue
        
        if bar["c"] > a_high and bar["o"] < a_high and (bar["c"] - a_high) > 0.06 * atr_val:
            sl = a_low - 0.08 * range_size
            entry_approx = bar["c"]
            risk = entry_approx - sl
            if risk <= 0: continue
            signals.append({
                "idx": i,
                "direction": "BUY",
                "sl": sl,
                "targets": [(0.35, entry_approx + 1.5*risk), (0.65, entry_approx + 4.0*risk)],
                "be_r": 0.8,
                "stale_h": 7
            })
            taken_days.add(day)
        elif bar["c"] < a_low and bar["o"] > a_low and (a_low - bar["c"]) > 0.06 * atr_val:
            sl = a_high + 0.08 * range_size
            entry_approx = bar["c"]
            risk = sl - entry_approx
            if risk <= 0: continue
            signals.append({
                "idx": i,
                "direction": "SELL",
                "sl": sl,
                "targets": [(0.35, entry_approx - 1.5*risk), (0.65, entry_approx - 4.0*risk)],
                "be_r": 0.8,
                "stale_h": 7
            })
            taken_days.add(day)
    
    return signals


# ── Full Engine Evaluation ───────────────────────────────────────────────────
def evaluate_strategy_on_dataset(strategy_fn, name="Strategy"):
    data = load_all_market_data()
    all_trades = []
    
    for pdata in data:
        pair = pdata["pair"]
        m15 = pdata["m15"]
        mult = pdata["mult"]
        cooldown_until = 0
        
        signals = strategy_fn(pdata)
        
        for sig in signals:
            idx = sig["idx"]
            if idx < cooldown_until or idx >= len(m15) - 5: continue
            
            bar = m15[idx]
            dt = datetime.datetime.fromisoformat(bar['t'].replace("Z","").split("+")[0])
            hour = dt.hour + dt.minute / 60.0
            dow = dt.weekday()
            
            # Trading sessions filter: active weekday hours (07:00 to 16:00 UTC)
            if dow == 5 or (dow == 6 and hour < 21.0) or hour < 7.0: continue
            
            # Spread check
            spread_pips = (bar['ac'] - bar['c']) * mult
            max_spread = 50 if "XAU" in pair else (15 if "XAG" in pair else 5)
            if spread_pips > max_spread: continue
            
            direction = sig["direction"]
            entry_fill = bar['ac'] if direction == "BUY" else bar['c']
            sl = sig["sl"]
            targets = sig.get("targets", [])
            if not targets:
                tp_single = sig.get("tp", 0)
                targets = [(1.0, tp_single)]
                
            first_tp = targets[0][1]
            # Entry guard
            if direction == "BUY" and not (entry_fill > sl and entry_fill < first_tp): continue
            if direction == "SELL" and not (entry_fill < sl and entry_fill > first_tp): continue
            
            sim = simulate_trade_multitarget(
                m15, idx, direction, entry_fill, sl, targets,
                be_trigger_r=sig.get("be_r", 1.0),
                stale_h=sig.get("stale_h", 12)
            )
            
            if sim:
                sim["pair"] = pair
                sim["time"] = bar['t']
                all_trades.append(sim)
                cooldown_until = sim["close_idx"] + 2
                
    n = len(all_trades)
    if n == 0:
        print(f"\n[{name}] No trades executed. Check entry rules.\n")
        return None
        
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
    pf = (pos_r / neg_r) if neg_r > 0 else 99.0
    
    print("\n" + "="*85)
    print(f"BACKTEST RESULTS: {name}")
    print("="*85)
    print(f"  Total Trades:        {n} trades (~{trades_per_week:.1f} per week)")
    print(f"  Win Rate:            {wr:.1f}% ({len(wins)} Wins / {len(losses)} Losses)")
    print(f"  Total Realized R:    {'+' if r_sum >= 0 else ''}{r_sum:.2f}R")
    print(f"  Average R / Trade:   {'+' if avg_r >= 0 else ''}{avg_r:.2f}R")
    print(f"  Profit Factor:       {pf:.2f}")
    print(f"  Max Drawdown:        {max_dd:.1f}R")
    print(f"  Return / DD Ratio:   {(r_sum / abs(max_dd)):.2f}" if max_dd < 0 else "N/A")
    print("="*85 + "\n")
    
    return all_trades


if __name__ == "__main__":
    print(f"Loaded Backtest Kit. Dataset directory: {DATA_DIR}")
    # Run user custom strategy
    evaluate_strategy_on_dataset(my_custom_strategy, name="My Custom Strategy")
