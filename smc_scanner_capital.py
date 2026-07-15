"""
SMC SCANNER — Capital.com Edition
==================================
Full Smart Money Concepts analysis using Capital.com live data.
- Real bid/ask spreads (automates Spread Check rule)
- 10 requests/SECOND (instant scans, no throttling)
- All timeframes: Weekly, Daily, H4, H1, M15

Usage: python smc_scanner_capital.py
"""

import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, ".")
from capital_config import SCAN_PAIRS
from capital_client import get_client
from smc_engine import (
    classify_trend, detect_structure_break,
    premium_discount, find_liquidity_pools, detect_sweep,
    find_order_block, find_fvg, check_poi_freshness,
    check_entry_candle, check_momentum, ema, rsi, atr,
)


# ============================================================
# SESSION CHECK
# ============================================================
def check_session():
    now = datetime.now(timezone.utc)
    dow = now.weekday()
    hour = now.hour + now.minute / 60.0

    if dow == 5:
        return "WEEKEND", "Saturday - market closed", False, False
    if dow == 6 and hour < 21:
        return "WEEKEND", "Sunday - market closed until ~21:00 GMT", False, False

    monday_reduced = (dow == 0 and hour < 4)

    if hour < 7:
        return "ASIAN", "Asian session (00:00-07:00 GMT) - WAIT", False, False
    if 7 <= hour < 10:
        return "LONDON_KZ", "London Kill Zone (07:00-10:00 GMT) - HIGH PRIORITY", True, monday_reduced
    if 10 <= hour < 12:
        return "MIDDAY", "Between London KZ and NY KZ - reduced priority", True, monday_reduced
    if 12 <= hour < 16:
        return "NY_OVERLAP", "London/NY Overlap (12:00-16:00 GMT) - BEST SESSION", True, monday_reduced
    if 16 <= hour < 21:
        return "LATE_NY", "Late NY - reduced priority", True, monday_reduced
    return "OFF_HOURS", "Outside active sessions", False, False


# ============================================================
# SPREAD CHECK (Now Automated!)
# ============================================================
def check_spread(pair, spread_pips):
    """Rule 3: Spread check using REAL broker spread."""
    if spread_pips is None:
        return "UNKNOWN", "Spread data unavailable"
    # Gold naturally has wider spreads - use higher threshold
    if "XAU" in pair or pair == "GOLD":
        if spread_pips > 50:
            return "FAIL", f"Spread {spread_pips} pips (>50 - too wide for Gold)"
        if spread_pips > 30:
            return "WARN", f"Spread {spread_pips} pips (>30 - reduce size)"
        return "PASS", f"Spread {spread_pips} pips (normal for Gold)"
    if "XAG" in pair or pair == "SILVER":
        if spread_pips > 15:
            return "FAIL", f"Spread {spread_pips} pips (>15 - too wide for Silver)"
        if spread_pips > 8:
            return "WARN", f"Spread {spread_pips} pips (>8 - reduce size)"
        return "PASS", f"Spread {spread_pips} pips (normal for Silver)"
    # Standard FX
    if spread_pips > 5:
        return "FAIL", f"Spread {spread_pips} pips (>5 - too wide)"
    if spread_pips > 3:
        return "WARN", f"Spread {spread_pips} pips (>3 - reduce size)"
    return "PASS", f"Spread {spread_pips} pips (normal)"


# ============================================================
# FULL SMC ANALYSIS (Single Pair)
# ============================================================
def analyze_pair(client, pair):
    """Run complete SMC analysis on one pair across all timeframes."""
    result = {
        "pair": pair,
        "checks": [],
        "passed": False,
        "decision": "WAIT",
        "grade": "-",
        "bonuses": 0,
        "bonus_list": [],
        "plan": None,
    }

    # Fetch all timeframes (Capital.com: instant, no throttle)
    weekly = client.get_candles_oldest_first(pair, "1week", 30)
    daily = client.get_candles_oldest_first(pair, "1day", 100)
    h4 = client.get_candles_oldest_first(pair, "4h", 120)
    h1 = client.get_candles_oldest_first(pair, "1h", 120)
    m15 = client.get_candles_oldest_first(pair, "15min", 120)

    if not h1 or len(h1) < 20:
        result["checks"].append("Insufficient data")
        return result

    # Live price + spread
    live = client.get_price(pair)
    last = live["mid"] if live else h1[-1]["c"]
    result["price"] = last
    result["live"] = live

    h_atr = atr(h1, 14)
    d_atr = atr(daily, 14) if daily else h_atr

    # ============ SPREAD CHECK ============
    if live:
        spread_status, spread_msg = check_spread(pair, live["spread_pips"])
        icon = {"PASS": "OK", "WARN": "!", "FAIL": "X"}[spread_status]
        result["checks"].append(f"[{icon}] Spread: {live['spread_pips']} pips")
        if spread_status == "FAIL":
            result["checks"].append(f"    -> WAIT (spread too wide)")
            return result

    # ============ GATE 1: H1 TREND ============
    h1_trend, h1_highs, h1_lows = classify_trend(h1, 2)
    result["h1_trend"] = h1_trend
    if h1_trend in ("RANGE", "UNCLEAR"):
        result["checks"].append(f"[X] H1 Trend: {h1_trend} (unclear structure)")
        return result
    result["checks"].append(f"[OK] H1 Trend: {h1_trend}")

    # ============ GATE 2: DAILY ALIGNMENT ============
    d_trend = "RANGE"
    if daily and len(daily) >= 20:
        d_trend, _, _ = classify_trend(daily, 2)
    result["daily_trend"] = d_trend
    if d_trend not in ("RANGE", "UNCLEAR") and d_trend != h1_trend:
        result["checks"].append(f"[X] Daily {d_trend} vs H1 {h1_trend} - CONFLICT")
        return result
    result["checks"].append(f"[OK] Daily: {d_trend} aligned")

    # ============ GATE 3: PREMIUM/DISCOUNT ============
    zone, r_high, r_low, pos = premium_discount(h1, h_atr)
    result["zone"] = zone
    result["range_high"] = r_high
    result["range_low"] = r_low

    if zone == "COMPRESSED":
        result["checks"].append(f"[X] Range compressed (<1.5x ATR)")
        return result
    if zone == "EQ":
        result["checks"].append(f"[X] Location: EQ ({pos*100:.0f}%) - no trade zone")
        return result

    direction = "BUY" if zone == "DISCOUNT" else "SELL"
    if h1_trend == "BULLISH" and zone == "PREMIUM":
        result["checks"].append(f"[X] Bullish trend but in Premium")
        return result
    if h1_trend == "BEARISH" and zone == "DISCOUNT":
        result["checks"].append(f"[X] Bearish trend but in Discount")
        return result

    result["direction"] = direction
    result["checks"].append(f"[OK] Location: {zone} ({pos*100:.0f}%) - {direction} zone")

    # ============ LIQUIDITY SWEEP (H4) ============
    h4_swept = False
    h4_sweep_detail = ""
    if h4:
        buy_pools, sell_pools = find_liquidity_pools(h4)
        # SYNCED to match server.ts: for BUY, check sell_pools first (lows swept),
        # for SELL, check buy_pools first (highs swept) — this is the SMC-correct order
        pools = sell_pools if direction == "BUY" else buy_pools
        if not pools:
            pools = buy_pools if direction == "BUY" else sell_pools
        for pool in pools:
            swept, candle, detail = detect_sweep(h4, pool, 8)
            if swept:
                h4_swept = True
                h4_sweep_detail = f"{pool['source']} @ {pool['level']:.5f}"
                break

    if h4_swept:
        result["checks"].append(f"[OK] H4 Liquidity sweep: {h4_sweep_detail}")
    else:
        result["checks"].append(f"[ ] No H4 sweep yet (setup building)")

    # ============ POI DETECTION ============
    poi = None
    poi_source = ""
    poi_candles = h4 if h4 else h1

    if h4 and len(h4) >= 20:
        poi = find_order_block(h4, h1_trend, atr(h4, 14))
        poi_source = "H4"

    if not poi or not poi.get("valid"):
        poi = find_order_block(m15, h1_trend, atr(m15, 14) if m15 else h_atr)
        poi_source = "M15"

    if not poi or not poi.get("valid"):
        # Try FVG
        fvgs = find_fvg(h4, h1_trend) if h4 else []
        if fvgs:
            poi = fvgs[-1]
            poi["direction"] = direction
            poi_source = "H4_FVG"

    if not poi or not poi.get("valid"):
        result["checks"].append(f"[X] No valid POI (OB/FVG)")
        return result

    freshness = check_poi_freshness(poi_candles, poi)
    if freshness == "DEAD":
        result["checks"].append(f"[X] POI dead (traded through)")
        return result

    poi_high = poi.get("high", poi.get("top", 0))
    poi_low = poi.get("low", poi.get("bottom", 0))
    disp = poi.get("disp_atr", 0)
    result["checks"].append(
        f"[OK] POI: {poi['type']} {poi_low:.5f}-{poi_high:.5f} | {poi_source} | {freshness} | disp {disp}x ATR"
    )

    # ============ M15 ENTRY CONFIRMATION ============
    if not m15 or len(m15) < 10:
        result["checks"].append(f"[X] M15 data insufficient")
        return result

    # M15 sweep
    m15_swept = False
    m_buy, m_sell = find_liquidity_pools(m15)
    m_pools = m_sell if direction == "BUY" else m_buy
    if not m_pools:
        m_pools = m_buy if direction == "BUY" else m_sell
    for pool in m_pools:
        swept, _, _ = detect_sweep(m15, pool, 6)
        if swept:
            m15_swept = True
            break

    # M15 structure break
    m15_trend, m15_highs, m15_lows = classify_trend(m15, 2)
    m15_struct, m15_detail = detect_structure_break(m15, m15_highs, m15_lows, h1_trend)

    # Entry candle
    entry_ok, entry_reason = check_entry_candle(m15, direction)

    if not entry_ok:
        result["checks"].append(f"[X] M15 entry candle: {entry_reason}")
        return result

    result["checks"].append(f"[OK] M15 entry candle: {entry_reason}")
    if m15_struct:
        result["checks"].append(f"[OK] M15 {m15_struct}")
    if m15_swept:
        result["checks"].append(f"[OK] M15 liquidity sweep")
    else:
        result["checks"].append(f"[ ] No M15 sweep (H4 sweep may suffice)")

    # Momentum
    mom_ok, mom_detail = check_momentum(m15, direction, atr(m15, 14))
    result["checks"].append(f"[{'OK' if mom_ok else ' '}] Momentum: {mom_detail}")

    # ============ CONFLUENCE SCORING ============
    bonuses = 0

    # Weekly alignment
    w_trend = "RANGE"
    if weekly and len(weekly) >= 5:
        w_trend, _, _ = classify_trend(weekly, 2)
    result["weekly_trend"] = w_trend
    if w_trend not in ("RANGE", "UNCLEAR") and w_trend == h1_trend:
        bonuses += 1
        result["bonus_list"].append("Weekly+Daily+H1 aligned")

    # Fresh POI
    if freshness == "FRESH":
        bonuses += 1
        result["bonus_list"].append("Fresh POI")

    # H4 POI
    if poi_source.startswith("H4"):
        bonuses += 1
        result["bonus_list"].append(f"Higher TF POI ({poi_source})")

    # Strong displacement
    if disp >= 2.0:
        bonuses += 1
        result["bonus_list"].append(f"Strong displacement ({disp}x ATR)")

    # Kill zone
    session_type, _, _, _ = check_session()
    if session_type in ("LONDON_KZ", "NY_OVERLAP"):
        bonuses += 1
        result["bonus_list"].append(f"In Kill Zone")

    # RSI extreme
    r_val = rsi([c["c"] for c in m15], 14)
    result["rsi"] = r_val
    if r_val is not None:
        if direction == "BUY" and r_val <= 35:
            bonuses += 1
            result["bonus_list"].append(f"RSI oversold ({r_val:.0f})")
        elif direction == "SELL" and r_val >= 65:
            bonuses += 1
            result["bonus_list"].append(f"RSI overbought ({r_val:.0f})")

    # EMA confirmation
    m15_closes = [c["c"] for c in m15]
    e20, e50 = ema(m15_closes, 20), ema(m15_closes, 50)
    if e20 and e50:
        if (direction == "BUY" and e20 > e50) or (direction == "SELL" and e20 < e50):
            bonuses += 1
            result["bonus_list"].append("EMA20>EMA50 confirms")

    result["bonuses"] = bonuses

    # Grade
    if bonuses >= 5:
        grade = "A+"
    elif bonuses >= 3:
        grade = "A"
    elif bonuses >= 1:
        grade = "B"
    else:
        grade = "C"
    result["grade"] = grade

    # ============ TRADE PLAN ============
    entry = last
    if direction == "BUY":
        sl = min(poi_low, entry - 1.5 * h_atr) - h_atr * 0.1
        tp1 = entry + 2 * abs(entry - sl)
        tp2 = entry + 3 * abs(entry - sl)
        tp3 = r_high
    else:
        sl = max(poi_high, entry + 1.5 * h_atr) + h_atr * 0.1
        tp1 = entry - 2 * abs(sl - entry)
        tp2 = entry - 3 * abs(sl - entry)
        tp3 = r_low

    sl_dist = abs(entry - sl)
    rr = abs(tp1 - entry) / sl_dist if sl_dist else 0
    sl_atr = sl_dist / h_atr if h_atr else 0

    result["plan"] = {
        "entry": round(entry, 5),
        "sl": round(sl, 5),
        "tp1": round(tp1, 5),
        "tp2": round(tp2, 5),
        "tp3": round(tp3, 5),
        "rr": round(rr, 2),
        "sl_atr": round(sl_atr, 2),
    }

    if rr < 2.0:
        result["checks"].append(f"[X] RR 1:{rr:.1f} < 1:2 minimum")
        return result
    result["checks"].append(f"[OK] RR 1:{rr:.1f}")

    if sl_atr > 1.5:
        result["checks"].append(f"[!] SL {sl_atr}x ATR (>1.5x)")

    # PASSED!
    result["passed"] = True
    result["decision"] = direction
    return result


# ============================================================
# CORRELATION CHECK
# ============================================================
def check_correlation(signals):
    conflicts = []
    for i, s1 in enumerate(signals):
        for s2 in signals[i + 1:]:
            shared = set(s1["pair"].split("/")) & set(s2["pair"].split("/"))
            if shared and s1["decision"] != s2["decision"]:
                conflicts.append((s1["pair"], s2["pair"], list(shared)[0]))
    return conflicts


# ============================================================
# MAIN
# ============================================================
def main():
    lagos = timezone(timedelta(hours=1))
    now = datetime.now(lagos)

    print("=" * 66)
    print("  SMC SCANNER - Capital.com Edition")
    print(f"  {now.strftime('%A %Y-%m-%d %H:%M')} (Lagos)")
    print("=" * 66)

    session_type, session_msg, can_trade, monday_reduced = check_session()
    gmt = datetime.now(timezone.utc)
    print(f"\n  Session: {session_msg}")
    print(f"  GMT: {gmt.strftime('%H:%M')} | Kill Zone: {'YES' if can_trade else 'NO'}")
    if monday_reduced:
        print("  Monday first 4h - reduced size")

    # Connect to Capital.com
    print(f"\n  Connecting to Capital.com...")
    client = get_client()
    print(f"  Authenticated. Fetching data for {len(SCAN_PAIRS)} pairs...\n")

    # Analyze all pairs
    results = []
    for pair in SCAN_PAIRS:
        r = analyze_pair(client, pair)
        results.append(r)

        if r["passed"]:
            print(f"  >>> {pair:10s} {r['decision']:5s}  Grade {r['grade']}  "
                  f"RR 1:{r['plan']['rr']}  ({r['bonuses']}/7)")
        else:
            # Show first failing check
            fail = next((c for c in r["checks"] if c.startswith("[X]")), r["checks"][0] if r["checks"] else "?")
            print(f"      {pair:10s} WAIT   - {fail}")

    # Sort: passed first, then by bonuses
    results.sort(key=lambda x: (x["passed"], x["bonuses"]), reverse=True)

    # Correlation check
    trade_signals = [r for r in results if r["passed"]]
    conflicts = check_correlation(trade_signals)

    # Summary
    print("\n" + "=" * 66)
    buys = [r for r in trade_signals if r["decision"] == "BUY"]
    sells = [r for r in trade_signals if r["decision"] == "SELL"]
    waits = len(results) - len(trade_signals)
    print(f"  RESULT: {len(buys)} BUY | {len(sells)} SELL | {waits} WAIT")

    if trade_signals:
        best = trade_signals[0]
        p = best["plan"]
        print(f"\n  *** BEST SETUP: {best['pair']} ({best['decision']}) Grade {best['grade']} ***")
        print(f"      Entry: {p['entry']}  |  SL: {p['sl']}  ({p['sl_atr']}x ATR)")
        print(f"      TP1: {p['tp1']} (1:{p['rr']})  |  TP2: {p['tp2']}  |  TP3: {p['tp3']}")
        print(f"      Confluences ({best['bonuses']}/7):")
        for b in best["bonus_list"]:
            print(f"        + {b}")

    if conflicts:
        print(f"\n  ! CORRELATION CONFLICTS:")
        for c1, c2, cur in conflicts:
            print(f"      {c1} vs {c2} - shared {cur}")

    print("\n" + "=" * 66)
    print("  This is analysis, not financial advice.")
    print("  The edge is in the discipline of WAITING.")
    print("=" * 66)

    return results


if __name__ == "__main__":
    main()
