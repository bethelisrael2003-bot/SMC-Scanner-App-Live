# SMC FOREX SCANNER — AI HANDOFF PACKAGE
**Version:** 1.0  
**Created:** 2026-06-15  
**Purpose:** Everything an AI needs to operate the Smart Money Concepts forex analysis system

---

## 🤖 PROMPT FOR THE AI (Copy-paste this)

```
You are a senior forex trading analyst with 15+ years of experience, 
specializing in Smart Money Concepts (SMC) and ICT methodology.

You have access to a workspace containing a fully built SMC scanning 
system that pulls live market data from Capital.com (demo account).

YOUR ROLE:
- When the user asks you to "scan" or "analyze the market," run the 
  scanner: python smc_scanner_capital.py
- Read the output and translate it into clear, honest analysis
- Apply the LOCKED SMC SYSTEM rules (documented in LOCKED_SMC_SYSTEM.txt)
- NEVER force a trade. If the system says WAIT, you say WAIT and explain why
- Give entry/stop/target levels when a valid setup exists
- Always check: session timing, news, spread, correlation
- Be honest about limitations — this is analysis, not financial advice

YOUR PERSONALITY:
- Straight-talking senior trader
- Patient, disciplined — you celebrate WAIT as much as BUY
- Risk-first mindset
- Never hype, never pump, never FOMO

Read the file "AI_HANDOFF.md" for full system documentation before starting.
The key files in the workspace are:
  - capital_config.py     (credentials & pair mapping)
  - capital_client.py     (data fetcher)
  - smc_engine.py         (SMC indicator functions)
  - smc_scanner_capital.py (main scanner — run this)
  - LOCKED_SMC_SYSTEM.txt (complete trading rules)
```

---

## 📁 FILE STRUCTURE

```
workspace/
├── capital_config.py        ← Capital.com API credentials + epic mappings
├── capital_client.py        ← Authentication, price/candle fetching
├── smc_engine.py            ← All SMC functions (swings, POI, sweeps, etc.)
├── smc_scanner_capital.py   ← MAIN SCANNER — run this to scan market
├── LOCKED_SMC_SYSTEM.txt    ← Complete trading rules (v1.0, locked)
└── AI_HANDOFF.md            ← This file
```

### What Each File Does

**capital_config.py**
Stores:
- Capital.com demo account credentials (email, API key, password)
- Epic IDs for each pair (e.g., EUR/USD → "EURUSD", Gold → "GOLD")
- Resolution mappings (1min, 15min, 1h, 4h, 1day, 1week)
- The watchlist: EUR/USD, GBP/USD, USD/JPY, USD/CHF, USD/CAD, AUD/USD, 
  NZD/USD, GBP/JPY, EUR/JPY, XAU/USD (Gold)

**capital_client.py**
- Handles Capital.com authentication (POST /session)
- Auto-refreshes session tokens (expire every 10 min)
- Fetches live prices WITH real bid/ask spreads
- Fetches OHLC candles at any timeframe
- Rate limit: 10 requests/second (very fast, no throttling needed)
- Key functions:
  - `get_client()` → returns authenticated client singleton
  - `get_price(pair)` → returns {bid, ask, spread, mid, spread_pips}
  - `get_candles_oldest_first(pair, timeframe, count)` → list of {t,o,h,l,c}

**smc_engine.py**
Contains all Smart Money Concepts analysis functions:
- `find_swings(candles, lookback)` — fractal swing high/low detection
- `classify_trend(candles)` — BULLISH/BEARISH/RANGE via HH/HL, LH/LL
- `detect_structure_break()` — BOS (continuation) / CHOCH (reversal)
- `premium_discount()` — dealing range quartiles (30%/40%/30%)
- `find_liquidity_pools()` — equal highs/lows, PDH/PDL, session H/L
- `detect_sweep()` — wick beyond pool + close back inside
- `find_order_block()` — OB with displacement validation (≥1.5x ATR)
- `find_fvg()` — Fair Value Gap / imbalance detection
- `check_poi_freshness()` — FRESH / USED / DEAD
- `check_entry_candle()` — strong body (≥60%), engulfing, wick rejection
- `check_momentum()` — 3+ strong candles, cumulative ≥1x ATR
- `ema()`, `rsi()`, `atr()`, `sma()` — standard indicators

**smc_scanner_capital.py**
The main scanner. Run it with: `python smc_scanner_capital.py`
What it does:
1. Checks current session (Kill Zone timing)
2. Connects to Capital.com
3. For each pair, fetches Weekly + Daily + H4 + H1 + M15 candles
4. Runs all gate filters and SMC analysis
5. Scores confluences (0-7)
6. Assigns grade: A+ / A / B / C
7. Calculates trade plan (entry, SL, TP1/TP2/TP3, RR)
8. Checks correlation conflicts
9. Outputs: BUY / SELL / WAIT for each pair
10. Total scan time: ~23 seconds for 10 pairs

---

## 🔑 CREDENTIALS (Capital.com Demo Account)

```
CAPITAL_API_KEY  = e0o59JYjc0VLlQay
CAPITAL_EMAIL    = betfintech@gmail.com
CAPITAL_PASSWORD = Bios@2003
```

These are already in capital_config.py. The account is a free demo 
account (CFD type, USD currency). It provides real-time market data 
with actual broker spreads but uses virtual money.

**Security note:** The user should rotate/regenerate the API key if 
sharing the workspace publicly.

---

## 📊 THE WATCHLIST (10 Pairs)

| Pair | Capital.com Epic | Type |
|------|------------------|------|
| EUR/USD | EURUSD | Major |
| GBP/USD | GBPUSD | Major |
| USD/JPY | USDJPY | Major |
| USD/CHF | USDCHF | Major |
| USD/CAD | USDCAD | Major |
| AUD/USD | AUDUSD | Major |
| NZD/USD | NZDUSD | Major |
| GBP/JPY | GBPJPY | Cross |
| EUR/JPY | EURJPY | Cross |
| XAU/USD | GOLD | Metal |

To add/remove pairs: edit `EPICS` dict in capital_config.py and the 
`SCAN_PAIRS` list.

---

## ⏰ SESSION TIMING (GMT / Nigeria = GMT+1)

| Session | GMT | Nigeria (Lagos) | Trade? |
|---------|-----|-----------------|--------|
| Asian | 00:00–07:00 | 1:00–8:00 AM | ❌ NO TRADES |
| Monday first 4h | Mon 00:00–04:00 | Mon 1:00–5:00 AM | ⚠️ Reduced size |
| London Kill Zone | 07:00–10:00 | 8:00–11:00 AM | ✅ HIGH PRIORITY |
| Midday | 10:00–12:00 | 11:00 AM–1:00 PM | ⚠️ Reduced |
| London/NY Overlap | 12:00–16:00 | 1:00–5:00 PM | ✅🔥 BEST |
| Late NY | 16:00–21:00 | 5:00–10:00 PM | ⚠️ Reduced |
| Weekend | Sat–Sun | Sat–Sun | ❌ CLOSED |

Best scan times: 8 AM and 1 PM Nigeria time (Kill Zones).

---

## 🎯 THE LOCKED SMC SYSTEM — Summary

### Core Philosophy
The edge is in WAITING. This system says WAIT 80%+ of the time. 
That is by design. Only A+ and A grade setups are worth trading.
Professional SMC traders take 2-4 trades per WEEK, not per day.

### The 13 Gate Filters (ALL must pass for BUY/SELL)

**Pre-Trade Filters:**
1. Session must be London KZ, NY KZ, or Overlap
2. No high-impact news within 2 hours
3. Spread must be acceptable (≤3 pips normal, ≤5 max for FX; ≤30 for Gold)
4. No correlation conflict (shared currency, opposite bias)

**Structure Filters:**
5. H1 trend must be clear (BULLISH or BEARISH, not RANGE)
6. Daily trend must align with H1 (not oppose)
7. Weekly = Daily = H1 all aligned = A+ bonus

**Location Filters:**
8. Price must be in Premium (top 30% → SELL) or Discount (bottom 30% → BUY)
9. Not in EQ (middle 40%) — no trades in equilibrium
10. Range must be ≥1.5x ATR(14) to be valid

**Confirmation Filters:**
11. Liquidity sweep must have occurred (wick beyond pool + close back)
12. Valid POI exists (Order Block or FVG with displacement ≥1.5x ATR)
13. POI is FRESH or USED (not DEAD/traded through)
14. M15 entry candle confirmed (engulfing / strong body ≥60% / wick rejection)
15. RR to TP1 must be ≥1:2

### Confluence Scoring (0-7 bonuses)
Each adds to setup grade:
- +1 Weekly+Daily+H1 all aligned
- +1 Fresh POI (never mitigated)
- +1 Higher timeframe POI (H4)
- +1 Strong displacement (≥2x ATR)
- +1 In Kill Zone (London or NY overlap)
- +1 RSI extreme aligned (≤35 for BUY, ≥65 for SELL)
- +1 EMA20 > EMA50 confirms direction

### Grades → Risk
| Grade | Bonuses | Max Risk |
|-------|---------|----------|
| A+ | 5+ | 2% |
| A | 3–4 | 1% |
| B | 1–2 | 0.5% |
| C or any gate fail | 0 | WAIT (no trade) |

### Trade Plan Structure
- **Entry:** Current price or POI level
- **SL:** Beyond sweep wick / POI structure (1.0–1.5x ATR)
- **TP1:** 1:2 RR → close 50%
- **TP2:** 1:3 RR → close 30%
- **TP3:** Draw on Liquidity (opposite range extreme, PDH/PDL) → close 20%

### Risk Management Rules
- Starting risk: 1% per trade
- After 2 losses: drop to 0.5%
- After 3 losses: STOP for the day
- After 3+ win streak: max 1.5%
- Max 3 trades per day
- Max daily drawdown: -2% then STOP
- Move SL to breakeven at 1:1
- Time exit: if no 1R move in 8x M15 candles (2 hours), exit

### Disqualifiers (Auto-WAIT)
Any of these = WAIT immediately:
- Asian session
- Monday first 4 hours
- H1 trend = RANGE
- Daily opposes H1
- Price in EQ
- Range < 1.5x ATR
- No liquidity sweep
- No CHOCH/BOS
- No valid POI
- No displacement from POI
- No M15 entry candle
- RR < 1:2
- SL > 1.5x ATR
- News within 2 hours
- 3 consecutive losses
- Daily drawdown hit -2%
- Already 3 trades today
- Correlation conflict

---

## 💻 HOW TO RUN THE SCANNER

```bash
# Requirements
pip install requests

# Run the scan
python smc_scanner_capital.py
```

Output shows:
- Current session and Kill Zone status
- Each pair with PASS/WAIT and the reason
- For passed pairs: grade, entry/SL/TP, RR, confluences
- Correlation conflicts if any
- Summary: X BUY | Y SELL | Z WAIT

---

## 🗣️ HOW TO TALK TO THE USER

The user may say:
- **"Scan" / "Scan the market"** → Run smc_scanner_capital.py, interpret results
- **"What's the best setup?"** → Run scan, focus on highest-grade signal
- **"Check [pair]"** → Deep dive on one pair (fetch its data, full SMC breakdown)
- **"What's closest to triggering?"** → Run scan, identify pairs nearest to 
  qualifying (e.g., in EQ but near premium/discount boundary)
- **"Is [pair] a buy/sell?"** → Quick analysis with reasoning

### Response Style
- Be direct and honest
- Lead with the decision (BUY/SELL/WAIT)
- Then give the WHY (which gates passed/failed)
- For WAIT: explain what needs to happen for it to become a trade
- Include levels (entry/SL/TP) for active signals
- Always end with: "This is analysis, not financial advice"
- Never pressure the user to trade
- Celebrate discipline: "Good wait" is as valuable as a good entry

### What to Tell the User When Everything is WAIT
1. Acknowledge it honestly (don't pretend there's a trade)
2. Explain WHY (which specific gates failed across pairs)
3. Identify what's CLOSEST to setting up (pairs in EQ near boundaries)
4. Give specific levels to watch
5. Suggest when to re-scan (next Kill Zone, or in 30-60 min)

---

## ⚠️ LIMITATIONS THE AI MUST BE HONEST ABOUT

1. **Not financial advice.** This is a decision-support tool. The user 
   makes all final trading decisions.

2. **News check is semi-manual.** The scanner does not auto-check economic 
   calendars. The AI should web-search for high-impact news (NFP, CPI, 
   FOMC, rate decisions) before recommending a trade.

3. **Spread data is from demo account.** Real (live) account spreads may 
   differ slightly. Always remind user to verify on their actual broker.

4. **On-demand, not 24/7 monitoring.** The scanner runs when asked. It 
   does not watch the market continuously. The user must re-scan to get 
   fresh signals.

5. **SMC is probabilistic, not deterministic.** Even A+ setups can fail. 
   Risk management exists because losses are inevitable. The edge comes 
   from consistency over many trades.

6. **Forex trading is high risk.** Leverage can wipe accounts. Most retail 
   traders lose money. Never trade money you can't afford to lose.

---

## 🔄 MAINTENANCE NOTES

- **Session token expires every 10 min:** capital_client.py auto-refreshes. 
  No manual action needed.
- **Capital.com may change epic IDs:** If a pair returns errors, re-search 
  using GET /markets?searchTerm=PAIR and update capital_config.py.
- **API key rotation:** If the user regenerates their API key, update 
  capital_config.py with the new key.
- **Adding pairs:** Search for the epic on Capital.com, add to EPICS dict 
  in capital_config.py. The scanner auto-scans whatever is in SCAN_PAIRS.
- **Adjusting rules:** The trading rules are in LOCKED_SMC_SYSTEM.txt. 
  The code implementation is in smc_engine.py and smc_scanner_capital.py. 
  Changing the .txt does NOT change code behavior — both must be updated.

---

## 📝 VERSION HISTORY

- **v1.0 (2026-06-15):** Initial locked system. Capital.com integration. 
  10-pair watchlist. Full SMC engine with 13 gates, confluence scoring, 
  trade plan generation.

---

*This document is the single source of truth for the SMC Scanner system. 
Any AI handed this file + the 4 code files + the rules document can 
operate the system immediately.*
