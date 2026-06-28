"""
Capital.com API Configuration
==============================
Demo account — real-time data with actual broker spreads.
Rate limit: 10 requests/SECOND (vs Twelve Data's 8/min).
Session expires after 10 min of inactivity (handled automatically).
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Account credentials (demo account)
CAPITAL_API_KEY = os.getenv("CAPITAL_API_KEY", "e0o59JYjc0VLlQay")
CAPITAL_EMAIL = os.getenv("CAPITAL_EMAIL", "betfintech@gmail.com")
CAPITAL_PASSWORD = os.getenv("CAPITAL_PASSWORD", "Bios@2003")

# API base URLs
CAPITAL_REST_URL = "https://api-capital.backend-capital.com/api/v1"
CAPITAL_WS_URL = "wss://api-streaming-capital.backend-capital.com/"

# Epic mapping: pair -> Capital.com epic ID
EPICS = {
    "EUR/USD": "EURUSD",
    "GBP/USD": "GBPUSD",
    "USD/JPY": "USDJPY",
    "USD/CHF": "USDCHF",
    "USD/CAD": "USDCAD",
    "AUD/USD": "AUDUSD",
    "NZD/USD": "NZDUSD",
    "GBP/JPY": "GBPJPY",
    "EUR/JPY": "EURJPY",
    "XAU/USD": "GOLD",
    "XAG/USD": "SILVER",
}

# Timeframe resolution mapping
RESOLUTIONS = {
    "1min":  "MINUTE",
    "15min": "MINUTE_15",
    "1h":    "HOUR",
    "4h":    "HOUR_4",
    "1day":  "DAY",
    "1week": "WEEK",
}

# Watchlist (same pairs as before)
SCAN_PAIRS = list(EPICS.keys())
