"""
SMC ENGINE — Core Smart Money Concepts Analysis Functions
=========================================================
Implements every rule from LOCKED_SMC_SYSTEM.txt.

These are the building blocks: swing detection, trend classification,
structure breaks, premium/discount, liquidity, POI detection, etc.
"""

import numpy as np


# ============================================================
# SWING DETECTION
# ============================================================
def find_swings(candles, lookback=2):
    """Find swing highs and lows using fractal method.
    A swing high = candle whose high is highest among `lookback` candles each side.
    Returns: (highs, lows) where each is [(index, price, datetime), ...]
    """
    highs, lows = [], []
    for i in range(lookback, len(candles) - lookback):
        # Swing high
        is_high = all(
            candles[i]["h"] >= candles[j]["h"]
            for j in range(i - lookback, i + lookback + 1) if j != i
        )
        if is_high:
            highs.append((i, candles[i]["h"], candles[i]["t"]))
        # Swing low
        is_low = all(
            candles[i]["l"] <= candles[j]["l"]
            for j in range(i - lookback, i + lookback + 1) if j != i
        )
        if is_low:
            lows.append((i, candles[i]["l"], candles[i]["t"]))
    return highs, lows


# ============================================================
# TREND CLASSIFICATION
# ============================================================
def classify_trend(candles, lookback=2):
    """Classify trend as BULLISH / BEARISH / RANGE based on swing structure.
    Uses last 3 swing highs and lows for HH/HL or LH/LL sequences.
    """
    highs, lows = find_swings(candles, lookback)
    if len(highs) < 2 or len(lows) < 2:
        return "UNCLEAR", highs, lows

    # Use last 2-3 swing points
    sh = highs[-2:]  # last 2 swing highs
    sl = lows[-2:]   # last 2 swing lows

    hh = sh[-1][1] > sh[-2][1]  # higher high
    hl = sl[-1][1] > sl[-2][1]  # higher low
    lh = sh[-1][1] < sh[-2][1]  # lower high
    ll = sl[-1][1] < sl[-2][1]  # lower low

    if hh and hl:
        return "BULLISH", highs, lows
    elif lh and ll:
        return "BEARISH", highs, lows
    else:
        return "RANGE", highs, lows


# ============================================================
# STRUCTURE BREAKS (BOS / CHOCH)
# ============================================================
def detect_structure_break(candles, highs, lows, prior_trend):
    """Detect BOS or CHOCH in recent candles.
    BOS = trend continuation confirmed
    CHOCH = potential reversal signal
    Returns: (type, detail) or (None, None)
    """
    if not highs or not lows:
        return None, None

    # Last confirmed swing high and low
    last_sh = highs[-1][1]
    last_sl = lows[-1][1]

    # Check last few candles for closes beyond structure
    check_range = min(5, len(candles))
    for c in candles[-check_range:]:
        if prior_trend == "BULLISH":
            if c["c"] < last_sl:
                return "CHOCH", f"Close {c['c']:.5f} below swing low {last_sl:.5f}"
        elif prior_trend == "BEARISH":
            if c["c"] > last_sh:
                return "CHOCH", f"Close {c['c']:.5f} above swing high {last_sh:.5f}"

        # BOS in either direction
        if c["c"] > last_sh and prior_trend == "BULLISH":
            return "BOS", f"Close {c['c']:.5f} above swing high {last_sh:.5f}"
        if c["c"] < last_sl and prior_trend == "BEARISH":
            return "BOS", f"Close {c['c']:.5f} below swing low {last_sl:.5f}"

    return None, None


# ============================================================
# PREMIUM / DISCOUNT
# ============================================================
def premium_discount(candles, atr_val, lookback=50):
    """Determine if price is in Premium, Discount, or EQ zone.
    Uses the dealing range = recent swing high to swing low.
    """
    recent = candles[-min(lookback, len(candles)):]
    r_high = max(c["h"] for c in recent)
    r_low = min(c["l"] for c in recent)
    r_size = r_high - r_low
    last = candles[-1]["c"]

    if r_size < 1.5 * atr_val:
        return "COMPRESSED", r_high, r_low, 0.5

    pos = (last - r_low) / r_size  # 0.0 = bottom, 1.0 = top

    if pos >= 0.70:
        zone = "PREMIUM"
    elif pos <= 0.30:
        zone = "DISCOUNT"
    else:
        zone = "EQ"

    return zone, r_high, r_low, pos


# ============================================================
# LIQUIDITY POOLS & SWEEP DETECTION
# ============================================================
def find_liquidity_pools(candles, tol_pct=0.0015):
    """Identify liquidity pools: equal highs/lows and recent extremes.
    Returns list of dicts: {level, side ('BUY'/'SELL'), source}
    BUY-side = above price (equal highs, resistance) — swept by wicking up
    SELL-side = below price (equal lows, support) — swept by wicking down
    """
    pools = []
    last = candles[-1]["c"]
    window = candles[-30:]

    # Equal highs: find highs within tolerance of each other
    highs = [(i, c["h"]) for i, c in enumerate(window)]
    for i in range(len(highs)):
        for j in range(i + 1, len(highs)):
            if abs(highs[i][1] - highs[j][1]) / highs[i][1] < tol_pct:
                level = (highs[i][1] + highs[j][1]) / 2
                if level > last:  # above current price
                    pools.append({"level": level, "side": "BUY",
                                  "source": "equal_high", "idx": window[i]["t"]})
                    break

    # Equal lows
    lows = [(i, c["l"]) for i, c in enumerate(window)]
    for i in range(len(lows)):
        for j in range(i + 1, len(lows)):
            if abs(lows[i][1] - lows[j][1]) / lows[i][1] < tol_pct:
                level = (lows[i][1] + lows[j][1]) / 2
                if level < last:
                    pools.append({"level": level, "side": "SELL",
                                  "source": "equal_low", "idx": window[i]["t"]})
                    break

    # Previous day high/low (if multi-day data)
    if len(candles) >= 48:  # H1: ~24 candles/day
        day_ago = candles[-24:-1] if len(candles) >= 25 else candles[:-1]
        pdh = max(c["h"] for c in day_ago)
        pdl = min(c["l"] for c in day_ago)
        if pdh > last:
            pools.append({"level": pdh, "side": "BUY", "source": "prev_day_high"})
        if pdl < last:
            pools.append({"level": pdl, "side": "SELL", "source": "prev_day_low"})

    # Session high/low
    session_window = candles[-12:]  # last ~12 candles
    sh = max(c["h"] for c in session_window)
    sl = min(c["l"] for c in session_window)
    if sh > last:
        pools.append({"level": sh, "side": "BUY", "source": "session_high"})
    if sl < last:
        pools.append({"level": sl, "side": "SELL", "source": "session_low"})

    # Deduplicate (keep nearest to price for each side)
    buy_pools = sorted([p for p in pools if p["side"] == "BUY"],
                       key=lambda p: p["level"] - last)
    sell_pools = sorted([p for p in pools if p["side"] == "SELL"],
                        key=lambda p: last - p["level"])

    return (buy_pools[:2], sell_pools[:2])


def detect_sweep(candles, pool, lookback=5):
    """Check if a liquidity pool was swept recently.
    Sweep = wick beyond pool + close back inside.
    Returns: (swept: bool, candle: dict or None, detail: str)
    """
    level = pool["level"]
    side = pool["side"]
    tol = abs(level) * 0.0008  # 0.08% tolerance for "beyond"

    for c in candles[-min(lookback, len(candles)):]:
        if side == "BUY":  # pool is above, looking for wick above + close below
            if c["h"] > level + tol and c["c"] < level:
                return True, c, f"Wicked to {c['h']:.5f}, closed {c['c']:.5f} below pool {level:.5f}"
        else:  # SELL side, pool below, wick below + close above
            if c["l"] < level - tol and c["c"] > level:
                return True, c, f"Wicked to {c['l']:.5f}, closed {c['c']:.5f} above pool {level:.5f}"

    return False, None, ""


# ============================================================
# ORDER BLOCK DETECTION + DISPLACEMENT VALIDATION
# ============================================================
def find_order_block(candles, trend, atr_val):
    """Find the most recent valid Order Block.
    Bullish OB = last bearish candle before bullish displacement.
    Bearish OB = last bullish candle before bearish displacement.
    Requires displacement ≥ 1.5x ATR with strong bodies.
    """
    if trend not in ("BULLISH", "BEARISH") or not atr_val:
        return None

    search_start = max(0, len(candles) - 40)

    for i in range(len(candles) - 3, search_start, -1):
        c = candles[i]

        if trend == "BULLISH":
            # Looking for bearish candle (the OB)
            if c["c"] >= c["o"]:
                continue
            # Check displacement after
            impulse = candles[i + 1:i + 4]
            if len(impulse) < 2:
                continue
            move = sum(x["c"] - x["o"] for x in impulse)
            disp_atr = move / atr_val
            all_bull = all(x["c"] > x["o"] for x in impulse)
            strong_bodies = all(
                (x["c"] - x["o"]) / max(x["h"] - x["l"], 1e-10) > 0.6
                for x in impulse
            )

            if move >= 1.5 * atr_val and all_bull:
                return {
                    "type": "BULLISH_OB", "direction": "BUY",
                    "high": c["h"], "low": c["l"], "open": c["o"], "close": c["c"],
                    "index": i, "time": c["t"],
                    "displacement": move, "disp_atr": round(disp_atr, 2),
                    "strong_bodies": strong_bodies,
                    "valid": disp_atr >= 1.5,
                }

        elif trend == "BEARISH":
            if c["c"] <= c["o"]:
                continue
            impulse = candles[i + 1:i + 4]
            if len(impulse) < 2:
                continue
            move = abs(sum(x["c"] - x["o"] for x in impulse))
            disp_atr = move / atr_val
            all_bear = all(x["c"] < x["o"] for x in impulse)
            strong_bodies = all(
                abs(x["c"] - x["o"]) / max(x["h"] - x["l"], 1e-10) > 0.6
                for x in impulse
            )

            if move >= 1.5 * atr_val and all_bear:
                return {
                    "type": "BEARISH_OB", "direction": "SELL",
                    "high": c["h"], "low": c["l"], "open": c["o"], "close": c["c"],
                    "index": i, "time": c["t"],
                    "displacement": move, "disp_atr": round(disp_atr, 2),
                    "strong_bodies": strong_bodies,
                    "valid": disp_atr >= 1.5,
                }

    return None


def find_fvg(candles, trend):
    """Find Fair Value Gaps (imbalances).
    Bullish FVG: candle[i-1].low > candle[i+1].high (gap up)
    Bearish FVG: candle[i-1].high < candle[i+1].low (gap down)
    Returns list of most recent FVGs.
    """
    fvgs = []
    for i in range(1, len(candles) - 1):
        if trend != "BEARISH" and candles[i - 1]["l"] > candles[i + 1]["h"]:
            gap_top = candles[i - 1]["l"]
            gap_bot = candles[i + 1]["h"]
            if gap_top - gap_bot > 0:
                fvgs.append({
                    "type": "BULLISH_FVG", "direction": "BUY",
                    "top": gap_top, "bottom": gap_bot,
                    "index": i, "time": candles[i]["t"],
                })
        if trend != "BULLISH" and candles[i - 1]["h"] < candles[i + 1]["l"]:
            gap_top = candles[i + 1]["l"]
            gap_bot = candles[i - 1]["h"]
            if gap_top - gap_bot > 0:
                fvgs.append({
                    "type": "BEARISH_FVG", "direction": "SELL",
                    "top": gap_top, "bottom": gap_bot,
                    "index": i, "time": candles[i]["t"],
                })
    return fvgs[-3:] if fvgs else []


def check_poi_freshness(candles, poi):
    """Check POI freshness: FRESH / USED / DEAD.
    FRESH = price never returned since creation
    USED  = price returned once, held, moved away
    DEAD  = price traded through the body
    """
    idx = poi["index"] + 1
    poi_high, poi_low = poi["high"], poi["low"]
    touches = 0

    for c in candles[idx:]:
        if c["l"] <= poi_high and c["h"] >= poi_low:
            touches += 1
            # Traded through?
            if poi["direction"] == "BUY" and c["c"] < poi_low:
                return "DEAD"
            if poi["direction"] == "SELL" and c["c"] > poi_high:
                return "DEAD"
            if touches > 1:
                return "DEAD"

    return "FRESH" if touches == 0 else "USED"


# ============================================================
# ENTRY CANDLE CONFIRMATION
# ============================================================
def check_entry_candle(candles, direction):
    """Validate the last candle as an entry trigger.
    Checks: strong body, engulfing, or wick rejection.
    Returns: (valid: bool, reason: str)
    """
    if len(candles) < 2:
        return False, "Insufficient data"
    curr = candles[-1]
    prev = candles[-2]

    body = abs(curr["c"] - curr["o"])
    rng = curr["h"] - curr["l"]
    if rng == 0:
        return False, "Zero-range candle (indecision)"
    body_ratio = body / rng

    if direction == "BUY":
        # Must be bullish direction
        if curr["c"] <= curr["o"]:
            # Check engulfing
            if (prev["c"] < prev["o"] and curr["c"] > prev["o"]
                    and curr["o"] < prev["c"]):
                return True, f"Bullish engulfing (body {body_ratio*100:.0f}%)"
            return False, f"Bearish close in BUY setup (body {body_ratio*100:.0f}%)"

        if body_ratio >= 0.6:
            return True, f"Strong bullish body ({body_ratio*100:.0f}% of range)"

        lower_wick = min(curr["o"], curr["c"]) - curr["l"]
        if lower_wick > 0.5 * rng:
            return True, f"Lower wick rejection ({lower_wick/rng*100:.0f}% of range)"

        return False, f"Weak bullish candle (body {body_ratio*100:.0f}%, no rejection)"

    else:  # SELL
        if curr["c"] >= curr["o"]:
            if (prev["c"] > prev["o"] and curr["c"] < prev["o"]
                    and curr["o"] > prev["c"]):
                return True, f"Bearish engulfing (body {body_ratio*100:.0f}%)"
            return False, f"Bullish close in SELL setup (body {body_ratio*100:.0f}%)"

        if body_ratio >= 0.6:
            return True, f"Strong bearish body ({body_ratio*100:.0f}% of range)"

        upper_wick = curr["h"] - max(curr["o"], curr["c"])
        if upper_wick > 0.5 * rng:
            return True, f"Upper wick rejection ({upper_wick/rng*100:.0f}% of range)"

        return False, f"Weak bearish candle (body {body_ratio*100:.0f}%, no rejection)"


def check_momentum(candles, direction, atr_val, lookback=4):
    """Check momentum: 3+ strong candles, cumulative > 1x ATR.
    Returns: (valid: bool, detail: str)
    """
    recent = candles[-min(lookback, len(candles)):]
    if len(recent) < 3:
        return False, "Not enough candles for momentum"

    strong_count = 0
    cumulative = 0.0

    for c in recent:
        body = abs(c["c"] - c["o"])
        rng = c["h"] - c["l"]
        ratio = body / max(rng, 1e-10)

        if direction == "BUY" and c["c"] > c["o"]:
            cumulative += c["c"] - c["o"]
            if ratio > 0.5:
                strong_count += 1
        elif direction == "SELL" and c["c"] < c["o"]:
            cumulative += c["o"] - c["c"]
            if ratio > 0.5:
                strong_count += 1

    cum_atr = cumulative / max(atr_val, 1e-10)
    strong = strong_count >= 3
    enough_move = cumulative >= atr_val

    detail = f"{strong_count} strong candles, {cum_atr:.1f}x ATR cumulative"
    return (strong or enough_move), detail


# ============================================================
# INDICATORS
# ============================================================
def ema(closes, n):
    if len(closes) < n:
        return None
    a = 2 / (n + 1)
    seed = float(np.mean(closes[:n]))
    for p in closes[n:]:
        seed = p * a + seed * (1 - a)
    return seed


def rsi(closes, n=14):
    if len(closes) < n + 1:
        return None
    d = np.diff(closes)
    g = np.where(d > 0, d, 0.0)
    l = np.where(d < 0, -d, 0.0)
    ag, al = np.mean(g[-n:]), np.mean(l[-n:])
    return 100.0 if al == 0 else float(100 - 100 / (1 + ag / al))


def atr(candles, n=14):
    if len(candles) < n + 1:
        return None
    trs = []
    for i in range(1, len(candles)):
        h, l, pc = candles[i]["h"], candles[i]["l"], candles[i - 1]["c"]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    return float(np.mean(trs[-n:]))


def sma(closes, n):
    return float(np.mean(closes[-n:])) if len(closes) >= n else None
