#!/usr/bin/env python3
"""
fetch_longterm_dataset.py — Pull 180 Days (6 Months) of institutional
M15 / H1 / H4 candles (Bid + Ask) directly from Capital.com API.
"""

import sys, os, json, time, datetime
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from capital_client import CapitalClient
from capital_config import EPICS

BASE = "https://api-capital.backend-capital.com/api/v1"
OUT = os.path.join(os.path.dirname(__file__), "data_longterm")
os.makedirs(OUT, exist_ok=True)

DAYS = 180 # 6 Full Months

TARGET_PAIRS = [
    ("XAG/USD", "SILVER"),
    ("GBP/JPY", "GBPJPY"),
    ("EUR/USD", "EURUSD"),
    ("XAU/USD", "GOLD")
]

TF_PLANS = {
    "H1":  ("HOUR", 24, 23),
    "H4":  ("HOUR_4", 24, 23),
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
        try:
            r = requests.get(f"{BASE}/prices/{epic}",
                             params={"resolution": resolution,
                                     "from": t.strftime("%Y-%m-%dT%H:%M:%S"),
                                     "to": t2.strftime("%Y-%m-%dT%H:%M:%S"),
                                     "max": 1000},
                             headers=client._headers(), timeout=30)
            n_req += 1
            if r.status_code != 200:
                time.sleep(1.0)
            else:
                for p in r.json().get("prices", []):
                    st = p.get("snapshotTime", "")
                    if not st: continue
                    bars[st] = {
                        "t": st,
                        "o": p["openPrice"]["bid"], "h": p["highPrice"]["bid"],
                        "l": p["lowPrice"]["bid"], "c": p["closePrice"]["bid"],
                        "ao": p["openPrice"]["ask"], "ah": p["highPrice"]["ask"],
                        "al": p["lowPrice"]["ask"], "ac": p["closePrice"]["ask"],
                    }
        except Exception as e:
            time.sleep(1.0)
            
        t = t + datetime.timedelta(days=step_days)
        time.sleep(0.15)
    return sorted(bars.values(), key=lambda x: x["t"]), n_req

def main():
    print(f"Connecting to Capital.com API to fetch {DAYS}-Day Long-Term Dataset...")
    client = CapitalClient()
    client.authenticate()
    print("Authenticated successfully. Pulling M15, H1, H4 candles with real Bid/Ask quotes...")
    
    total_req = 0
    for pair, epic in TARGET_PAIRS:
        print(f"\n>>> Fetching {pair} ({epic})...")
        for tf, (res, win, step) in TF_PLANS.items():
            t0 = time.time()
            bars, n = fetch_tf(client, epic, res, win, step)
            total_req += n
            filepath = os.path.join(OUT, f"{epic}_{tf}.json")
            with open(filepath, "w") as f:
                json.dump(bars, f)
            first = bars[0]["t"][:16] if bars else "-"
            last = bars[-1]["t"][:16] if bars else "-"
            print(f"    {tf:4s}: {len(bars):5d} bars | {first} -> {last} ({n} reqs, {time.time()-t0:.1f}s)")
            
    print(f"\nCompleted! Total requests made: {total_req}. Saved to {OUT}/")

if __name__ == "__main__":
    main()
