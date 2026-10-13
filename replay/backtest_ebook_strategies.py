#!/usr/bin/env python3
"""
Quantitative Backtest Engine for Casey Stubbs' "Forex Strategies Ebook"
======================================================================
Tests all 6 strategies from the ebook on the 92-day 11-pair institutional dataset:
  1. Personal Trading Plan: 3/30 EMA Momentum + 4H Trend + MACD Exit
  2. Triple EMA Trend: 10 / 25 / 50 EMA Crossover + 4H Trend
  3. Stochastic System: Stoch(14,3,3) 80/20 Reversal + 4H Trend
  4. MACD Momentum: MACD(12,26,9) Line Crossover + 4H Trend
  5. Parabolic SAR System: PSAR(0.02, 0.20) Flip + MACD Exit + 4H Trend
  6. RSI Reversal System: RSI(14) 70/30 Pullback + 4H Trend

Adheres strictly to:
  - ZERO lookahead bias (strictly completed bars)
  - Spread-aware execution (BUY fills at Ask, exits at Bid; SELL fills at Bid, exits at Ask)
  - Sub-pip stop loss floor guard (0.3x ATR minimum)
  - Standing Rule 11a: Exact win/loss counts with all win rates
"""

import os, sys, json, math, datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

PAIRS = [
    ("EUR/USD", "EURUSD"), ("GBP/USD", "GBPUSD"), ("USD/JPY", "USDJPY"), ("USD/CHF", "USDCHF"),
    ("USD/CAD", "USDCAD"), ("AUD/USD", "AUDUSD"), ("NZD/USD", "NZDUSD"), ("GBP/JPY", "GBPJPY"),
    ("EUR/JPY", "EURJPY"), ("XAU/USD", "GOLD"), ("XAG/USD", "SILVER")
]

TREND_CORE_PAIRS = ["XAU/USD", "XAG/USD", "USD/JPY", "GBP/JPY", "EUR/JPY", "USD/CHF"]

def pip_multiplier(pair):
    if "XAU" in pair: return 10
    if "XAG" in pair or "JPY" in pair: return 100
    return 10000

def parse_iso(ts):
    s = ts.replace("Z", "").split("+")[0]
    dt = datetime.datetime.fromisoformat(s)
    return dt.replace(tzinfo=datetime.timezone.utc).timestamp()

# ── Technical Indicators ─────────────────────────────────────────────────────

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

def compute_rsi(closes, period=14):
    if len(closes) < period + 1: return [50.0] * len(closes)
    gains, losses = [0.0], [0.0]
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i-1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    rsi = [50.0] * len(closes)
    avg_gain = sum(gains[1:period+1]) / period
    avg_loss = sum(losses[1:period+1]) / period
    rsi[period] = 100.0 if avg_loss == 0 else 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
    for i in range(period + 1, len(closes)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        rsi[i] = 100.0 if avg_loss == 0 else 100.0 - (100.0 / (1.0 + avg_gain / avg_loss))
    return rsi

def compute_stoch(highs, lows, closes, k_period=14, d_period=3, slowing=3):
    n = len(closes)
    raw_k = [50.0] * n
    for i in range(k_period - 1, n):
        hh = max(highs[i-k_period+1:i+1])
        ll = min(lows[i-k_period+1:i+1])
        raw_k[i] = 50.0 if hh == ll else ((closes[i] - ll) / (hh - ll)) * 100.0
    slow_k = [50.0] * n
    for i in range(k_period - 1 + slowing - 1, n):
        slow_k[i] = sum(raw_k[i-slowing+1:i+1]) / slowing
    d_vals = [50.0] * n
    start_d = k_period - 1 + slowing - 1 + d_period - 1
    for i in range(start_d, n):
        d_vals[i] = sum(slow_k[i-d_period+1:i+1]) / d_period
    return slow_k, d_vals

def compute_macd(closes, fast=12, slow=26, signal=9):
    fast_ema = compute_ema(closes, fast)
    slow_ema = compute_ema(closes, slow)
    macd_line = [f - s for f, s in zip(fast_ema, slow_ema)]
    signal_line = compute_ema(macd_line, signal)
    return macd_line, signal_line

def compute_psar(highs, lows, af_start=0.02, af_step=0.02, af_max=0.2):
    n = len(highs)
    if n < 2: return [0.0] * n, [1] * n
    psar = [0.0] * n
    direction = [1] * n
    bull = highs[1] >= highs[0]
    direction[0] = 1 if bull else -1
    direction[1] = 1 if bull else -1
    af = af_start
    ep = highs[0] if bull else lows[0]
    sar = lows[0] if bull else highs[0]
    psar[0] = sar
    psar[1] = sar
    for i in range(2, n):
        prev_sar = sar
        if bull:
            sar = prev_sar + af * (ep - prev_sar)
            sar = min(sar, lows[i-1], lows[i-2])
            if lows[i] < sar:
                bull = False
                sar = ep
                ep = lows[i]
                af = af_start
            else:
                if highs[i] > ep:
                    ep = highs[i]
                    af = min(af + af_step, af_max)
        else:
            sar = prev_sar + af * (ep - prev_sar)
            sar = max(sar, highs[i-1], highs[i-2])
            if highs[i] > sar:
                bull = True
                sar = ep
                ep = highs[i]
                af = af_start
            else:
                if lows[i] < ep:
                    ep = lows[i]
                    af = min(af + af_step, af_max)
        psar[i] = sar
        direction[i] = 1 if bull else -1
    return psar, direction

# ── Trade Simulator ──────────────────────────────────────────────────────────

def simulate_trade(m15_bars, entry_idx, direction, entry_fill, sl, tp_model="1:2", tp_fixed_r=2.0, exit_signal_func=None, max_bars=96, be_at_r=1.0, stale_h=12):
    risk = abs(entry_fill - sl)
    if risk <= 0: return None
    
    tp_price = entry_fill + tp_fixed_r * risk if direction == "BUY" else entry_fill - tp_fixed_r * risk
    be_triggered = False
    current_sl = sl
    entry_time = m15_bars[entry_idx]['t']
    t0 = parse_iso(entry_time)
    
    for j in range(entry_idx + 1, min(entry_idx + 1 + max_bars, len(m15_bars))):
        b = m15_bars[j]
        exit_low = b['l'] if direction == "BUY" else b['al']
        exit_high = b['h'] if direction == "BUY" else b['ah']
        exit_close = b['c'] if direction == "BUY" else b['ac']
        
        age_h = (parse_iso(b['t']) - t0) / 3600.0
        
        # Staleness check
        if stale_h > 0 and age_h >= stale_h and not be_triggered and risk > 0:
            prog = (exit_close - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_close) / risk
            if prog < 0:
                return {"entry_time": entry_time, "close_time": b['t'], "entry": entry_fill, "sl": sl, "exit": exit_close, "r": round(prog, 2), "reason": "STALE", "close_idx": j}
                
        # SL Check (Always checked first within candle)
        if (direction == "BUY" and exit_low <= current_sl) or (direction == "SELL" and exit_high >= current_sl):
            r = (current_sl - entry_fill) / risk if direction == "BUY" else (entry_fill - current_sl) / risk
            return {"entry_time": entry_time, "close_time": b['t'], "entry": entry_fill, "sl": sl, "exit": current_sl, "r": round(r, 2), "reason": "BE" if be_triggered else "SL", "close_idx": j}
            
        # Indicator-based Exit Signal (e.g. MACD cross or MA cross)
        if exit_signal_func and exit_signal_func(j, direction):
            r = (exit_close - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_close) / risk
            return {"entry_time": entry_time, "close_time": b['t'], "entry": entry_fill, "sl": sl, "exit": exit_close, "r": round(r, 2), "reason": "SIGNAL_EXIT", "close_idx": j}
            
        # Fixed R Target Check
        if tp_model in ["1:2", "1:3", "fixed"]:
            if (direction == "BUY" and exit_high >= tp_price) or (direction == "SELL" and exit_low <= tp_price):
                r = tp_fixed_r
                return {"entry_time": entry_time, "close_time": b['t'], "entry": entry_fill, "sl": sl, "exit": tp_price, "r": round(r, 2), "reason": "TP", "close_idx": j}
                
        # Auto Breakeven trigger
        if be_at_r > 0 and not be_triggered:
            if (direction == "BUY" and exit_high >= entry_fill + be_at_r * risk) or (direction == "SELL" and exit_low <= entry_fill - be_at_r * risk):
                be_triggered = True
                current_sl = entry_fill
                
    last_b = m15_bars[min(entry_idx + max_bars, len(m15_bars) - 1)]
    exit_c = last_b['c'] if direction == "BUY" else last_b['ac']
    r = (exit_c - entry_fill) / risk if direction == "BUY" else (entry_fill - exit_c) / risk
    return {"entry_time": entry_time, "close_time": last_b['t'], "entry": entry_fill, "sl": sl, "exit": exit_c, "r": round(r, 2), "reason": "TIME_EXPIRED", "close_idx": min(entry_idx + max_bars, len(m15_bars) - 1)}

# ── Load Market Data ─────────────────────────────────────────────────────────

print("Loading dataset across 11 pairs...")
all_data = []
for pair, epic in PAIRS:
    m15_file = os.path.join(DATA_DIR, f"{epic}_M15.json")
    h1_file = os.path.join(DATA_DIR, f"{epic}_H1.json")
    h4_file = os.path.join(DATA_DIR, f"{epic}_H4.json")
    d1_file = os.path.join(DATA_DIR, f"{epic}_D1.json")
    
    if not (os.path.exists(m15_file) and os.path.exists(h1_file)):
        continue
        
    m15 = json.load(open(m15_file))
    h1 = json.load(open(h1_file))
    h4 = json.load(open(h4_file)) if os.path.exists(h4_file) else []
    
    h1_closes = [b['c'] for b in h1]
    h1_highs = [b['h'] for b in h1]
    h1_lows = [b['l'] for b in h1]
    
    h4_closes = [b['c'] for b in h4]
    h4_highs = [b['h'] for b in h4]
    h4_lows = [b['l'] for b in h4]
    
    # H4 Indicators
    h4_ema20 = compute_ema(h4_closes, 20)
    h4_ema50 = compute_ema(h4_closes, 50)
    h4_rsi14 = compute_rsi(h4_closes, 14)
    h4_atr = compute_atr(h4, 14)
    
    # H1 Indicators
    h1_ema3 = compute_ema(h1_closes, 3)
    h1_ema10 = compute_ema(h1_closes, 10)
    h1_ema20 = compute_ema(h1_closes, 20)
    h1_ema25 = compute_ema(h1_closes, 25)
    h1_ema30 = compute_ema(h1_closes, 30)
    h1_ema50 = compute_ema(h1_closes, 50)
    
    h1_macd_line, h1_macd_sig = compute_macd(h1_closes, 12, 26, 9)
    h1_stoch_k, h1_stoch_d = compute_stoch(h1_highs, h1_lows, h1_closes, 14, 3, 3)
    h1_psar, h1_psar_dir = compute_psar(h1_highs, h1_lows, 0.02, 0.02, 0.20)
    h1_rsi14 = compute_rsi(h1_closes, 14)
    h1_atr = compute_atr(h1, 14)
    
    # Pre-index M15 to H1 and H4 strictly completed bars (zero lookahead)
    h1_times = [parse_iso(b['t']) for b in h1]
    h4_times = [parse_iso(b['t']) for b in h4]
    
    all_data.append({
        "pair": pair, "epic": epic, "mult": pip_multiplier(pair),
        "m15": m15, "h1": h1, "h4": h4,
        "h1_times": h1_times, "h4_times": h4_times,
        "h4_ema20": h4_ema20, "h4_ema50": h4_ema50, "h4_rsi14": h4_rsi14, "h4_atr": h4_atr,
        "h1_ema3": h1_ema3, "h1_ema10": h1_ema10, "h1_ema20": h1_ema20, "h1_ema25": h1_ema25,
        "h1_ema30": h1_ema30, "h1_ema50": h1_ema50,
        "h1_macd_line": h1_macd_line, "h1_macd_sig": h1_macd_sig,
        "h1_stoch_k": h1_stoch_k, "h1_stoch_d": h1_stoch_d,
        "h1_psar": h1_psar, "h1_psar_dir": h1_psar_dir,
        "h1_rsi14": h1_rsi14, "h1_atr": h1_atr
    })

print(f"Loaded {len(all_data)} pairs successfully.")

def get_last_completed_idx(times, t, bar_duration=3600.0):
    cutoff = t - bar_duration
    l, r, ans = 0, len(times) - 1, -1
    while l <= r:
        mid = (l + r) // 2
        if times[mid] <= cutoff:
            ans = mid
            l = mid + 1
        else:
            r = mid - 1
    return ans


# ══════════════════════════════════════════════════════════════════════════════
# STRATEGY 1: CASEY STUBBS PERSONAL TRADING PLAN (Chapters 2 & 3)
# ══════════════════════════════════════════════════════════════════════════════
# - 4H Trend: EMA20 > EMA50 for BUY, EMA20 < EMA50 for SELL
# - Fast EMA 3 crosses EMA 30 on H1
# - Session: London/NY 08:00 - 16:00 UTC (or unconstrained)
# - SL: Extreme of pre-entry candle, floored at 0.3x ATR
# - Exit: 1 to 3 R:R ratio, or MACD crossover
# ══════════════════════════════════════════════════════════════════════════════
def run_strategy_1_casey_personal(pair_filter=None, session_filter=True, tp_model="1:3"):
    all_trades = []
    for d in all_data:
        pair = d["pair"]
        if pair_filter and pair not in pair_filter:
            continue
            
        m15 = d["m15"]
        h1 = d["h1"]
        h1_ema3 = d["h1_ema3"]
        h1_ema30 = d["h1_ema30"]
        h1_macd_line = d["h1_macd_line"]
        h1_macd_sig = d["h1_macd_sig"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        h1_atr = d["h1_atr"]
        
        last_closed_idx = -1
        
        # We step through H1 bars
        for i in range(35, len(h1) - 1):
            h1_bar = h1[i]
            t = parse_iso(h1_bar['t'])
            
            # Map to H1 completed index
            # Check 4H Trend
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 1: continue
            
            trend_bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
            trend_bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
            
            # Time filter (London / NY window 08:00 - 16:00 UTC)
            dt = datetime.datetime.fromtimestamp(t, tz=datetime.timezone.utc)
            if session_filter and not (8 <= dt.hour <= 16):
                continue
                
            # EMA 3 / 30 crossover on completed H1 bar i
            cross_up = h1_ema3[i-1] <= h1_ema30[i-1] and h1_ema3[i] > h1_ema30[i]
            cross_down = h1_ema3[i-1] >= h1_ema30[i-1] and h1_ema3[i] < h1_ema30[i]
            
            direction = None
            if cross_up and trend_bull:
                direction = "BUY"
            elif cross_down and trend_bear:
                direction = "SELL"
            else:
                continue
                
            # Entry on next bar open (which corresponds to an M15 bar)
            next_t = t + 3600.0
            # Find M15 bar at next_t
            m15_idx = -1
            for k in range(max(0, last_closed_idx), len(m15)):
                if parse_iso(m15[k]['t']) >= next_t:
                    m15_idx = k
                    break
            if m15_idx == -1 or m15_idx >= len(m15) - 1:
                continue
                
            entry_bar = m15[m15_idx]
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            # Stop loss: Pre-entry candle extreme (bar i-1 high/low)
            pre_bar = h1[i-1]
            atr = h1_atr[i]
            sl_floor = 0.3 * atr
            
            if direction == "BUY":
                raw_sl = pre_bar['l']
                if entry_fill - raw_sl < sl_floor:
                    sl = entry_fill - sl_floor
                else:
                    sl = raw_sl
            else:
                raw_sl = pre_bar['h']
                if raw_sl - entry_fill < sl_floor:
                    sl = entry_fill + sl_floor
                else:
                    sl = raw_sl
                    
            # MACD exit function
            def macd_exit(m_idx, dir_trade):
                cur_t = parse_iso(m15[m_idx]['t'])
                c_h1 = get_last_completed_idx(d["h1_times"], cur_t, 3600.0)
                if c_h1 < 1: return False
                if dir_trade == "BUY":
                    # Exit when MACD crosses below signal
                    return h1_macd_line[c_h1] < h1_macd_sig[c_h1] and h1_macd_line[c_h1-1] >= h1_macd_sig[c_h1-1]
                else:
                    return h1_macd_line[c_h1] > h1_macd_sig[c_h1] and h1_macd_line[c_h1-1] <= h1_macd_sig[c_h1-1]
            
            exit_func = macd_exit if tp_model == "macd" else None
            fixed_r = 3.0 if tp_model == "1:3" else 2.0
            res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model=tp_model, tp_fixed_r=fixed_r, exit_signal_func=exit_func)
            if res:
                res["pair"] = pair
                res["dir"] = direction
                all_trades.append(res)
                last_closed_idx = res["close_idx"]
                
    return all_trades

# ══════════════════════════════════════════════════════════════════════════════
# STRATEGY 2: TRIPLE EMA CROSSOVER (Chapter 4)
# ══════════════════════════════════════════════════════════════════════════════
# - 10 EMA crosses 25 EMA and continues through 50 EMA
# - Price bar closes on opposite side of 50 EMA
# - Exit when 10 EMA crosses 25 EMA again (or 1:2 R:R)
# ══════════════════════════════════════════════════════════════════════════════
def run_strategy_2_triple_ema(pair_filter=None, tp_model="1:2"):
    all_trades = []
    for d in all_data:
        pair = d["pair"]
        if pair_filter and pair not in pair_filter: continue
        
        m15 = d["m15"]
        h1 = d["h1"]
        h1_ema10 = d["h1_ema10"]
        h1_ema25 = d["h1_ema25"]
        h1_ema50 = d["h1_ema50"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        h1_atr = d["h1_atr"]
        
        last_closed_idx = -1
        
        for i in range(55, len(h1) - 1):
            h1_bar = h1[i]
            t = parse_iso(h1_bar['t'])
            
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 1: continue
            
            trend_bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
            trend_bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
            
            # Check 10 EMA crossing 50 EMA, with 10 > 25 > 50 and close > 50 EMA
            buy_signal = (h1_ema10[i-1] <= h1_ema50[i-1] and h1_ema10[i] > h1_ema50[i] and 
                          h1_ema10[i] > h1_ema25[i] and h1_bar['c'] > h1_ema50[i] and trend_bull)
                          
            sell_signal = (h1_ema10[i-1] >= h1_ema50[i-1] and h1_ema10[i] < h1_ema50[i] and 
                           h1_ema10[i] < h1_ema25[i] and h1_bar['c'] < h1_ema50[i] and trend_bear)
                           
            direction = None
            if buy_signal: direction = "BUY"
            elif sell_signal: direction = "SELL"
            else: continue
            
            next_t = t + 3600.0
            m15_idx = -1
            for k in range(max(0, last_closed_idx), len(m15)):
                if parse_iso(m15[k]['t']) >= next_t:
                    m15_idx = k
                    break
            if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
            
            entry_bar = m15[m15_idx]
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            # SL: Recent swing extreme (5 bars) or 50 EMA, floored at 0.3x ATR
            atr = h1_atr[i]
            sl_floor = 0.3 * atr
            if direction == "BUY":
                raw_sl = min(b['l'] for b in h1[i-4:i+1])
                sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
            else:
                raw_sl = max(b['h'] for b in h1[i-4:i+1])
                sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
                
            def ma_exit(m_idx, dir_trade):
                cur_t = parse_iso(m15[m_idx]['t'])
                c_h1 = get_last_completed_idx(d["h1_times"], cur_t, 3600.0)
                if c_h1 < 1: return False
                if dir_trade == "BUY":
                    return h1_ema10[c_h1] < h1_ema25[c_h1]
                else:
                    return h1_ema10[c_h1] > h1_ema25[c_h1]
                    
            exit_func = ma_exit if tp_model == "ma_cross" else None
            res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model=tp_model, tp_fixed_r=2.0, exit_signal_func=exit_func)
            if res:
                res["pair"] = pair
                res["dir"] = direction
                all_trades.append(res)
                last_closed_idx = res["close_idx"]
                
    return all_trades

# ══════════════════════════════════════════════════════════════════════════════
# STRATEGY 3: STOCHASTIC STRATEGY (Chapter 5)
# ══════════════════════════════════════════════════════════════════════════════
# - Stochastic %K(14,3,3) crosses back below 80 (SELL) or above 20 (BUY)
# - In direction of 4H trend
# - Exit on opposite 20/80 or 1:2 R:R
# ══════════════════════════════════════════════════════════════════════════════
def run_strategy_3_stochastic(pair_filter=None, tp_model="1:2"):
    all_trades = []
    for d in all_data:
        pair = d["pair"]
        if pair_filter and pair not in pair_filter: continue
        
        m15 = d["m15"]
        h1 = d["h1"]
        h1_stoch_k = d["h1_stoch_k"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        h1_atr = d["h1_atr"]
        
        last_closed_idx = -1
        
        for i in range(20, len(h1) - 1):
            h1_bar = h1[i]
            t = parse_iso(h1_bar['t'])
            
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 1: continue
            
            trend_bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
            trend_bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
            
            # Stochastic cross back through 20 / 80
            buy_signal = (h1_stoch_k[i-1] <= 20 and h1_stoch_k[i] > 20 and trend_bull)
            sell_signal = (h1_stoch_k[i-1] >= 80 and h1_stoch_k[i] < 80 and trend_bear)
            
            direction = None
            if buy_signal: direction = "BUY"
            elif sell_signal: direction = "SELL"
            else: continue
            
            next_t = t + 3600.0
            m15_idx = -1
            for k in range(max(0, last_closed_idx), len(m15)):
                if parse_iso(m15[k]['t']) >= next_t:
                    m15_idx = k
                    break
            if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
            
            entry_bar = m15[m15_idx]
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            atr = h1_atr[i]
            sl_floor = 0.3 * atr
            if direction == "BUY":
                raw_sl = min(b['l'] for b in h1[i-3:i+1])
                sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
            else:
                raw_sl = max(b['h'] for b in h1[i-3:i+1])
                sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
                
            def stoch_exit(m_idx, dir_trade):
                cur_t = parse_iso(m15[m_idx]['t'])
                c_h1 = get_last_completed_idx(d["h1_times"], cur_t, 3600.0)
                if c_h1 < 1: return False
                if dir_trade == "BUY":
                    return h1_stoch_k[c_h1] >= 80
                else:
                    return h1_stoch_k[c_h1] <= 20
                    
            exit_func = stoch_exit if tp_model == "stoch_exit" else None
            res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model=tp_model, tp_fixed_r=2.0, exit_signal_func=exit_func)
            if res:
                res["pair"] = pair
                res["dir"] = direction
                all_trades.append(res)
                last_closed_idx = res["close_idx"]
                
    return all_trades

# ══════════════════════════════════════════════════════════════════════════════
# STRATEGY 4: MACD MOMENTUM CROSSOVER (Chapter 6)
# ══════════════════════════════════════════════════════════════════════════════
def run_strategy_4_macd(pair_filter=None, tp_model="1:2"):
    all_trades = []
    for d in all_data:
        pair = d["pair"]
        if pair_filter and pair not in pair_filter: continue
        
        m15 = d["m15"]
        h1 = d["h1"]
        h1_macd_line = d["h1_macd_line"]
        h1_macd_sig = d["h1_macd_sig"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        h1_atr = d["h1_atr"]
        
        last_closed_idx = -1
        
        for i in range(30, len(h1) - 1):
            h1_bar = h1[i]
            t = parse_iso(h1_bar['t'])
            
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 1: continue
            
            trend_bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
            trend_bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
            
            buy_signal = (h1_macd_line[i-1] <= h1_macd_sig[i-1] and h1_macd_line[i] > h1_macd_sig[i] and trend_bull)
            sell_signal = (h1_macd_line[i-1] >= h1_macd_sig[i-1] and h1_macd_line[i] < h1_macd_sig[i] and trend_bear)
            
            direction = None
            if buy_signal: direction = "BUY"
            elif sell_signal: direction = "SELL"
            else: continue
            
            next_t = t + 3600.0
            m15_idx = -1
            for k in range(max(0, last_closed_idx), len(m15)):
                if parse_iso(m15[k]['t']) >= next_t:
                    m15_idx = k
                    break
            if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
            
            entry_bar = m15[m15_idx]
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            atr = h1_atr[i]
            sl_floor = 0.3 * atr
            if direction == "BUY":
                raw_sl = min(b['l'] for b in h1[i-3:i+1])
                sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
            else:
                raw_sl = max(b['h'] for b in h1[i-3:i+1])
                sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
                
            def macd_reverse_exit(m_idx, dir_trade):
                cur_t = parse_iso(m15[m_idx]['t'])
                c_h1 = get_last_completed_idx(d["h1_times"], cur_t, 3600.0)
                if c_h1 < 1: return False
                if dir_trade == "BUY":
                    return h1_macd_line[c_h1] < h1_macd_sig[c_h1]
                else:
                    return h1_macd_line[c_h1] > h1_macd_sig[c_h1]
                    
            exit_func = macd_reverse_exit if tp_model == "macd_exit" else None
            res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model=tp_model, tp_fixed_r=2.0, exit_signal_func=exit_func)
            if res:
                res["pair"] = pair
                res["dir"] = direction
                all_trades.append(res)
                last_closed_idx = res["close_idx"]
                
    return all_trades

# ══════════════════════════════════════════════════════════════════════════════
# STRATEGY 5: PARABOLIC SAR + MACD EXIT (Chapter 7)
# ══════════════════════════════════════════════════════════════════════════════
def run_strategy_5_psar(pair_filter=None, tp_model="macd_exit"):
    all_trades = []
    for d in all_data:
        pair = d["pair"]
        if pair_filter and pair not in pair_filter: continue
        
        m15 = d["m15"]
        h1 = d["h1"]
        h1_psar = d["h1_psar"]
        h1_psar_dir = d["h1_psar_dir"]
        h1_macd_line = d["h1_macd_line"]
        h1_macd_sig = d["h1_macd_sig"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        h1_atr = d["h1_atr"]
        
        last_closed_idx = -1
        
        for i in range(25, len(h1) - 1):
            h1_bar = h1[i]
            t = parse_iso(h1_bar['t'])
            
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 1: continue
            
            trend_bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
            trend_bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
            
            # PSAR dot flips: dir changes from -1 to 1 (BUY) or 1 to -1 (SELL)
            buy_signal = (h1_psar_dir[i-1] == -1 and h1_psar_dir[i] == 1 and trend_bull)
            sell_signal = (h1_psar_dir[i-1] == 1 and h1_psar_dir[i] == -1 and trend_bear)
            
            direction = None
            if buy_signal: direction = "BUY"
            elif sell_signal: direction = "SELL"
            else: continue
            
            next_t = t + 3600.0
            m15_idx = -1
            for k in range(max(0, last_closed_idx), len(m15)):
                if parse_iso(m15[k]['t']) >= next_t:
                    m15_idx = k
                    break
            if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
            
            entry_bar = m15[m15_idx]
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            # Stop loss at PSAR dot value
            raw_sl = h1_psar[i]
            atr = h1_atr[i]
            sl_floor = 0.3 * atr
            
            if direction == "BUY":
                sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
            else:
                sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
                
            def macd_exit(m_idx, dir_trade):
                cur_t = parse_iso(m15[m_idx]['t'])
                c_h1 = get_last_completed_idx(d["h1_times"], cur_t, 3600.0)
                if c_h1 < 1: return False
                if dir_trade == "BUY":
                    return h1_macd_line[c_h1] < h1_macd_sig[c_h1]
                else:
                    return h1_macd_line[c_h1] > h1_macd_sig[c_h1]
                    
            exit_func = macd_exit if tp_model == "macd_exit" else None
            res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model=tp_model, tp_fixed_r=2.0, exit_signal_func=exit_func)
            if res:
                res["pair"] = pair
                res["dir"] = direction
                all_trades.append(res)
                last_closed_idx = res["close_idx"]
                
    return all_trades

# ══════════════════════════════════════════════════════════════════════════════
# STRATEGY 6: RSI OVERBOUGHT / OVERSOLD (Chapter 8)
# ══════════════════════════════════════════════════════════════════════════════
def run_strategy_6_rsi(pair_filter=None, tp_model="1:2"):
    all_trades = []
    for d in all_data:
        pair = d["pair"]
        if pair_filter and pair not in pair_filter: continue
        
        m15 = d["m15"]
        h1 = d["h1"]
        h1_rsi14 = d["h1_rsi14"]
        h4_ema20 = d["h4_ema20"]
        h4_ema50 = d["h4_ema50"]
        h1_atr = d["h1_atr"]
        
        last_closed_idx = -1
        
        for i in range(25, len(h1) - 1):
            h1_bar = h1[i]
            t = parse_iso(h1_bar['t'])
            
            h4_idx = get_last_completed_idx(d["h4_times"], t, 14400.0)
            if h4_idx < 1: continue
            
            trend_bull = h4_ema20[h4_idx] > h4_ema50[h4_idx]
            trend_bear = h4_ema20[h4_idx] < h4_ema50[h4_idx]
            
            # Cross above 30 from below (oversold bounce in uptrend)
            buy_signal = (h1_rsi14[i-1] <= 30 and h1_rsi14[i] > 30 and trend_bull)
            # Cross below 70 from above (overbought reversal in downtrend)
            sell_signal = (h1_rsi14[i-1] >= 70 and h1_rsi14[i] < 70 and trend_bear)
            
            direction = None
            if buy_signal: direction = "BUY"
            elif sell_signal: direction = "SELL"
            else: continue
            
            next_t = t + 3600.0
            m15_idx = -1
            for k in range(max(0, last_closed_idx), len(m15)):
                if parse_iso(m15[k]['t']) >= next_t:
                    m15_idx = k
                    break
            if m15_idx == -1 or m15_idx >= len(m15) - 1: continue
            
            entry_bar = m15[m15_idx]
            entry_fill = entry_bar['ao'] if direction == "BUY" else entry_bar['o']
            
            atr = h1_atr[i]
            sl_floor = 0.3 * atr
            if direction == "BUY":
                raw_sl = min(b['l'] for b in h1[i-3:i+1])
                sl = entry_fill - max(sl_floor, entry_fill - raw_sl)
            else:
                raw_sl = max(b['h'] for b in h1[i-3:i+1])
                sl = entry_fill + max(sl_floor, raw_sl - entry_fill)
                
            def rsi_exit(m_idx, dir_trade):
                cur_t = parse_iso(m15[m_idx]['t'])
                c_h1 = get_last_completed_idx(d["h1_times"], cur_t, 3600.0)
                if c_h1 < 1: return False
                if dir_trade == "BUY":
                    return h1_rsi14[c_h1] >= 70
                else:
                    return h1_rsi14[c_h1] <= 30
                    
            exit_func = rsi_exit if tp_model == "rsi_exit" else None
            res = simulate_trade(m15, m15_idx, direction, entry_fill, sl, tp_model=tp_model, tp_fixed_r=2.0, exit_signal_func=exit_func)
            if res:
                res["pair"] = pair
                res["dir"] = direction
                all_trades.append(res)
                last_closed_idx = res["close_idx"]
                
    return all_trades

# ── Summary Evaluation Function (Enforces Rule 11a) ──────────────────────────

def analyze_trades(trades, label=""):
    if not trades:
        print(f"{label}: 0 trades (0W / 0L), Win Rate: 0.0%, Total R: +0.00R, PF: 0.00, MaxDD: 0.0R")
        return {"trades": 0, "w": 0, "l": 0, "wr": 0.0, "r": 0.0, "pf": 0.0, "dd": 0.0}
        
    wins = [t for t in trades if t["r"] > 0]
    losses = [t for t in trades if t["r"] <= 0]
    w_count = len(wins)
    l_count = len(losses)
    total_trades = len(trades)
    wr = (w_count / total_trades) * 100.0
    
    total_r = sum(t["r"] for t in trades)
    avg_r = total_r / total_trades
    gross_win = sum(t["r"] for t in wins)
    gross_loss = abs(sum(t["r"] for t in losses))
    pf = (gross_win / gross_loss) if gross_loss > 0 else (99.9 if gross_win > 0 else 0.0)
    
    # Calculate Max Drawdown
    equity = 0.0
    peak = 0.0
    max_dd = 0.0
    for t in sorted(trades, key=lambda x: parse_iso(x["entry_time"])):
        equity += t["r"]
        if equity > peak:
            peak = equity
        dd = equity - peak
        if dd < max_dd:
            max_dd = dd
            
    print(f"\n{'='*75}")
    print(f"STRATEGY REPORT: {label}")
    print(f"{'='*75}")
    print(f"  Total Trades:        {total_trades}")
    print(f"  Exact Record:        {w_count} Wins / {l_count} Losses (Rule 11a Compliant)")
    print(f"  Win Rate:            {wr:.1f}% ({w_count}W / {l_count}L)")
    print(f"  Net Realized R:      {total_r:+.2f}R")
    print(f"  Avg R per Trade:     {avg_r:+.2f}R")
    print(f"  Profit Factor:       {pf:.2f}")
    print(f"  Max Drawdown:        {max_dd:.2f}R")
    print(f"{'='*75}")
    
    return {
        "trades": total_trades, "w": w_count, "l": l_count, "wr": wr,
        "r": total_r, "pf": pf, "dd": max_dd
    }

if __name__ == "__main__":
    print("\n" + "="*80)
    print("RUNNING INSTITUTIONAL BACKTEST ON 'FOREX STRATEGIES EBOOK' (CASEY STUBBS)")
    print("="*80)
    
    results = {}
    
    # 1. Casey Personal Plan
    t1_all = run_strategy_1_casey_personal(pair_filter=None, session_filter=True, tp_model="1:3")
    results["S1_Casey_All_1to3"] = analyze_trades(t1_all, "1. Casey 3/30 EMA Plan (1:3 TP, All 11 Pairs)")
    
    t1_core = run_strategy_1_casey_personal(pair_filter=TREND_CORE_PAIRS, session_filter=True, tp_model="1:3")
    results["S1_Casey_Core_1to3"] = analyze_trades(t1_core, "1. Casey 3/30 EMA Plan (1:3 TP, Trend Core Pairs)")

    t1_macd = run_strategy_1_casey_personal(pair_filter=TREND_CORE_PAIRS, session_filter=True, tp_model="macd")
    results["S1_Casey_Core_MACD"] = analyze_trades(t1_macd, "1. Casey 3/30 EMA Plan (MACD Exit, Trend Core Pairs)")

    # 2. Triple EMA (10/25/50)
    t2_all = run_strategy_2_triple_ema(pair_filter=None, tp_model="1:2")
    results["S2_TripleEMA_All_1to2"] = analyze_trades(t2_all, "2. Triple EMA 10/25/50 (1:2 TP, All 11 Pairs)")
    
    t2_core = run_strategy_2_triple_ema(pair_filter=TREND_CORE_PAIRS, tp_model="1:2")
    results["S2_TripleEMA_Core_1to2"] = analyze_trades(t2_core, "2. Triple EMA 10/25/50 (1:2 TP, Trend Core Pairs)")

    t2_ma = run_strategy_2_triple_ema(pair_filter=TREND_CORE_PAIRS, tp_model="ma_cross")
    results["S2_TripleEMA_Core_Cross"] = analyze_trades(t2_ma, "2. Triple EMA 10/25/50 (MA Cross Exit, Trend Core)")

    # 3. Stochastic 80/20
    t3_all = run_strategy_3_stochastic(pair_filter=None, tp_model="1:2")
    results["S3_Stoch_All_1to2"] = analyze_trades(t3_all, "3. Stochastic 80/20 Reversal (1:2 TP, All 11 Pairs)")
    
    t3_core = run_strategy_3_stochastic(pair_filter=TREND_CORE_PAIRS, tp_model="1:2")
    results["S3_Stoch_Core_1to2"] = analyze_trades(t3_core, "3. Stochastic 80/20 Reversal (1:2 TP, Trend Core)")

    # 4. MACD Momentum
    t4_all = run_strategy_4_macd(pair_filter=None, tp_model="1:2")
    results["S4_MACD_All_1to2"] = analyze_trades(t4_all, "4. MACD Crossover (1:2 TP, All 11 Pairs)")
    
    t4_core = run_strategy_4_macd(pair_filter=TREND_CORE_PAIRS, tp_model="1:2")
    results["S4_MACD_Core_1to2"] = analyze_trades(t4_core, "4. MACD Crossover (1:2 TP, Trend Core)")

    # 5. Parabolic SAR
    t5_all = run_strategy_5_psar(pair_filter=None, tp_model="macd_exit")
    results["S5_PSAR_All_MACD"] = analyze_trades(t5_all, "5. Parabolic SAR + MACD Exit (All 11 Pairs)")
    
    t5_core = run_strategy_5_psar(pair_filter=TREND_CORE_PAIRS, tp_model="macd_exit")
    results["S5_PSAR_Core_MACD"] = analyze_trades(t5_core, "5. Parabolic SAR + MACD Exit (Trend Core)")

    # 6. RSI 70/30
    t6_all = run_strategy_6_rsi(pair_filter=None, tp_model="1:2")
    results["S6_RSI_All_1to2"] = analyze_trades(t6_all, "6. RSI 70/30 Reversal (All 11 Pairs)")
    
    t6_core = run_strategy_6_rsi(pair_filter=TREND_CORE_PAIRS, tp_model="1:2")
    results["S6_RSI_Core_1to2"] = analyze_trades(t6_core, "6. RSI 70/30 Reversal (Trend Core)")

    with open(os.path.join(os.path.dirname(__file__), "ebook_results.json"), "w") as f:
        json.dump(results, f, indent=2)

