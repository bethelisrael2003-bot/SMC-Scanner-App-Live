#!/usr/bin/env python3
"""
fetch_history.py — pull ~90 days of H1/H4/M15/D1 candles (bid + ask) for all
11 watchlist pairs from Capital.com, for the MPR-vs-Classic replay.

Output: replay/data/{EPIC}_{tf}.json — arrays oldest-first:
  { t: snapshotTime (UTC period-end), o,h,l,c: bid OHLC, ao,ah,al,ac: ask OHLC }

API constraints discovered 2026-09-16:
  - max <= 1000 bars per request
  - `to` must not be in the future
  - M15 from/to range limited (~<= 9 days per window)
Timestamps are UTC, period-end (Friday's last H1 bar stamps 21:00 = market close).
"""
import sys, os, json, time, datetime
from collections import Counter
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from capital_client import CapitalClient
from capital_config import EPICS

BASE = "https://api-capital.backend-capital.com/api/v1"
OUT = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUT, exist_ok=True)

DAYS = 90
# (resolution, window_days, step_days) — window+step overlap by 1 day; dedupe by timestamp
TF_PLANS = {
    "H1":  ("HOUR", 24, 23),
    "H4":  ("HOUR_4", 24, 23),
    "D1":  ("DAY", 24, 23),
    "M15": ("MINUTE_15", 9, 8),
}

def fetch_tf(client, epic, resolution, window_days, step_days):
    now = datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=1)
    start = now - datetime.timedelta(days=DAYS + 2)
    bars = {}
    t = start
    n_req = 0
    while t < now:
        t2 = min(t + datetime.timedelta(days=window_days), now)
        r = requests.get(f"{BASE}/prices/{epic}",
                         params={"resolution": resolution,
                                 "from": t.strftime("%Y-%m-%dT%H:%M:%S"),
                                 "to": t2.strftime("%Y-%m-%dT%H:%M:%S"),
                                 "max": 1000},
                         headers=client._headers(), timeout=30)
        n_req += 1
        if r.status_code != 200:
            print(f"    HTTP {r.status_code} {epic} {resolution} {t:%m-%d}..{t2:%m-%d}: {r.text[:100]}")
            time.sleep(1.5)
        else:
            for p in r.json().get("prices", []):
                st = p.get("snapshotTime", "")
                if not st:
                    continue
                bars[st] = {
                    "t": st,
                    "o": p["openPrice"]["bid"], "h": p["highPrice"]["bid"],
                    "l": p["lowPrice"]["bid"], "c": p["closePrice"]["bid"],
                    "ao": p["openPrice"]["ask"], "ah": p["highPrice"]["ask"],
                    "al": p["lowPrice"]["ask"], "ac": p["closePrice"]["ask"],
                }
        t = t + datetime.timedelta(days=step_days)
        time.sleep(0.25)
    return sorted(bars.values(), key=lambda x: x["t"]), n_req

def main():
    client = CapitalClient()
    client.authenticate()
    total_req = 0
    for pair, epic in EPICS.items():
        for tf, (res, win, step) in TF_PLANS.items():
            bars, n = fetch_tf(client, epic, res, win, step)
            total_req += n
            with open(os.path.join(OUT, f"{epic}_{tf}.json"), "w") as f:
                json.dump(bars, f)
            first = bars[0]["t"][:16] if bars else "-"
            last = bars[-1]["t"][:16] if bars else "-"
            print(f"{pair:9s} {tf:4s}: {len(bars):5d} bars  {first} -> {last}  ({n} req)")
    # Timestamp convention check: Friday's LAST H1 bar should stamp ~21:00 UTC
    with open(os.path.join(OUT, "EURUSD_H1.json")) as f:
        h1 = json.load(f)
    last_friday_hour = None
    for b in h1:
        d = datetime.datetime.fromisoformat(b["t"])
        if d.weekday() == 4:
            last_friday_hour = d.hour  # keep overwriting — last Friday bar wins
    meta = {
        "fetched_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "days": DAYS,
        "eurusd_last_friday_h1_hour_utc": last_friday_hour,
        "stamp_convention": "UTC period-end" if last_friday_hour in (20, 21, 22) else "UNKNOWN — CHECK",
        "requests": total_req,
    }
    with open(os.path.join(OUT, "_meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print("\nmeta:", json.dumps(meta))

if __name__ == "__main__":
    main()
