"""
Capital.com Data Client
=======================
Handles authentication, session management, and data fetching.
Auto-reconnects when session expires. Provides candle data in the
same format the SMC engine expects: {t, o, h, l, c}
Plus real bid/ask spread data for spread checking.
"""

import requests
import time
import sys

sys.path.insert(0, ".")
from capital_config import (
    CAPITAL_API_KEY, CAPITAL_EMAIL, CAPITAL_PASSWORD,
    CAPITAL_REST_URL, EPICS, RESOLUTIONS,
)


class CapitalClient:
    def __init__(self):
        self.cst = None
        self.xsec = None
        self.last_auth = 0
        self.session_ttl = 480  # re-auth every 8 min (before 10 min expiry)

    def authenticate(self):
        """Login and get session tokens."""
        r = requests.post(f"{CAPITAL_REST_URL}/session", json={
            "identifier": CAPITAL_EMAIL,
            "password": CAPITAL_PASSWORD,
        }, headers={
            "X-CAP-API-KEY": CAPITAL_API_KEY,
            "Accept": "application/json",
        }, timeout=15)
        if r.status_code != 200:
            raise Exception(f"Auth failed: {r.status_code} {r.text[:200]}")
        self.cst = r.headers.get("CST", "")
        self.xsec = r.headers.get("X-SECURITY-TOKEN", "")
        self.last_auth = time.time()
        return True

    def _ensure_session(self):
        """Re-authenticate if session is near expiry."""
        if not self.cst or (time.time() - self.last_auth > self.session_ttl):
            self.authenticate()

    def _headers(self):
        self._ensure_session()
        return {
            "X-CAP-API-KEY": CAPITAL_API_KEY,
            "CST": self.cst,
            "X-SECURITY-TOKEN": self.xsec,
            "Accept": "application/json",
        }

    def get_price(self, pair):
        """Get live price with real bid/ask spread.
        Returns dict: {bid, ask, spread, mid, time}
        """
        epic = EPICS.get(pair)
        if not epic:
            return None
        r = requests.get(f"{CAPITAL_REST_URL}/prices/{epic}",
                         headers=self._headers(), timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        if not data.get("prices"):
            return None
        p = data["prices"][-1]
        bid = p["closePrice"]["bid"]
        ask = p["closePrice"]["ask"]
        raw_spread = ask - bid

        # Pip calculation varies by instrument:
        # Standard FX (EUR/USD etc): 1 pip = 0.0001 -> multiply by 10000
        # JPY pairs (USD/JPY etc):   1 pip = 0.01   -> multiply by 10
        # Gold (XAU/USD):            1 pip = 0.1    -> multiply by 10
        if "XAU" in pair or pair == "GOLD":
            pip_mult = 10
        elif "XAG" in pair or pair == "SILVER":
            pip_mult = 100
        elif "JPY" in pair:
            pip_mult = 100
        else:
            pip_mult = 10000

        return {
            "bid": bid, "ask": ask,
            "spread": round(raw_spread, 5),
            "spread_pips": round(raw_spread * pip_mult, 1),
            "mid": round((bid + ask) / 2, 5),
            "time": p.get("snapshotTime", ""),
        }

    def _request_with_retry(self, method, url, max_retries=3, **kwargs):
        """Make an API request with retry on timeout/error."""
        kwargs.setdefault("timeout", 15)
        for attempt in range(max_retries):
            try:
                r = requests.request(method, url, headers=self._headers(), **kwargs)
                return r
            except (requests.exceptions.ReadTimeout,
                    requests.exceptions.ConnectionError) as e:
                if attempt < max_retries - 1:
                    time.sleep(2 * (attempt + 1))  # 2s, 4s, 6s backoff
                    continue
                raise
        return None

    def get_candles(self, pair, timeframe="1h", count=120):
        """Fetch OHLC candles. Returns list newest-first, converted to {t,o,h,l,c}.
        Uses bid price for close calculations.
        """
        epic = EPICS.get(pair)
        res = RESOLUTIONS.get(timeframe)
        if not epic or not res:
            return None

        try:
            r = self._request_with_retry("GET",
                f"{CAPITAL_REST_URL}/prices/{epic}",
                params={"resolution": res, "max": count})
        except Exception:
            return None

        if r is None or r.status_code != 200:
            return None

        data = r.json()
        if not data.get("prices"):
            return None

        candles = []
        for p in data["prices"]:
            # Use bid for OHLC (consistent with sell-side analysis)
            # Some entries may be incomplete during current candle formation
            try:
                c = {
                    "t": p.get("snapshotTime", ""),
                    "o": p["openPrice"]["bid"],
                    "h": p["highPrice"]["bid"],
                    "l": p["lowPrice"]["bid"],
                    "c": p["closePrice"]["bid"],
                }
                candles.append(c)
            except (KeyError, TypeError):
                continue

        # Newest first (consistent with old format)
        return candles

    def get_candles_oldest_first(self, pair, timeframe="1h", count=120):
        """Fetch candles oldest-first (for indicator calculations)."""
        candles = self.get_candles(pair, timeframe, count)
        if candles:
            return candles[::-1]  # reverse to oldest-first
        return None

    def get_all_prices(self):
        """Fetch live prices for all watchlist pairs at once.
        Uses single requests but fast (10/sec limit).
        Returns dict: {pair: {bid, ask, spread, ...}}
        """
        results = {}
        for pair in EPICS:
            results[pair] = self.get_price(pair)
        return results

    def get_spreads(self):
        """Quick spread check for all pairs. Returns {pair: spread_in_pips}."""
        spreads = {}
        for pair in EPICS:
            p = self.get_price(pair)
            if p:
                spreads[pair] = p["spread_pips"]
        return spreads


# Singleton for easy import
_client = None

def get_client():
    global _client
    if _client is None:
        _client = CapitalClient()
        _client.authenticate()
    return _client
