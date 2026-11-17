# Phase 1: Capital.com Complete System Audit

**Project:** APEX Smart Money Concepts Institutional Trading System  
**Audit Date:** 2026-06-15  
**Auditor:** APEX Migration Engineering Team  
**Scope:** Full architectural audit of Capital.com dependencies across `server.ts`, client views, and data stores.

---

## 1. Executive Summary

APEX currently connects to Capital.com's CFD REST API (`https://demo-api-capital.backend-capital.com/api/v1`) using session token authentication (`CST` and `X-SECURITY-TOKEN`). The system relies on Capital.com for:
- Live bid/ask price feeds and spread checks
- Historical candlestick data (M1, M15, H1, H4, D1)
- Automated demo market order placement with initial Stop Loss and Take Profit
- Active position tracking, automated breakeven stop advancement at +0.75R, runner trailing at +1.25R, and TP sniping
- Account balance and equity reporting
- Ingestion of closed trades into APEX local historical memory

This audit documents every touchpoint, data structure, limitation, and dependency to guarantee a zero-regression, non-destructive migration to Exness.

---

## 2. Authentication & Session Management

### 2.1 Mechanism
- **Endpoint:** `POST https://demo-api-capital.backend-capital.com/api/v1/session`
- **Headers:** `X-CAP-API-KEY: CAPITAL_API_KEY`
- **Body:** `{ "identifier": CAPITAL_EMAIL, "password": CAPITAL_PASSWORD }`
- **Response Headers:**
  - `CST`: Client Session Token
  - `X-SECURITY-TOKEN`: Security Token
- **Session Duration:** ~8–10 minutes before expiration.
- **Persistence:** Cached in memory and persisted to disk at `capital_session.json` (`SESSION_TTL = 8 * 60 * 1000` ms).
- **Retry & Recovery:** Exponential backoff on HTTP 429; on HTTP 401, clears tokens and `capital_session.json` to force immediate re-authentication.
- **Concurrency Guard:** Single shared promise (`authPromise`) prevents concurrent parallel login requests.

---

## 3. Instrument Mapping & Resolutions

### 3.1 Epic Mapping Table (`EPICS`)
| Pair | Capital.com Epic | Exness Symbol Target | Base/Quote | Tick Unit |
| :--- | :--- | :--- | :--- | :--- |
| `EUR/USD` | `EURUSD` | `EURUSD` | EUR / USD | 0.00001 |
| `GBP/USD` | `GBPUSD` | `GBPUSD` | GBP / USD | 0.00001 |
| `USD/JPY` | `USDJPY` | `USDJPY` | USD / JPY | 0.001 |
| `USD/CHF` | `USDCHF` | `USDCHF` | USD / CHF | 0.00001 |
| `USD/CAD` | `USDCAD` | `USDCAD` | USD / CAD | 0.00001 |
| `AUD/USD` | `AUDUSD` | `AUDUSD` | AUD / USD | 0.00001 |
| `NZD/USD` | `NZDUSD` | `NZDUSD` | NZD / USD | 0.00001 |
| `GBP/JPY` | `GBPJPY` | `GBPJPY` | GBP / JPY | 0.001 |
| `EUR/JPY` | `EURJPY` | `EURJPY` | EUR / JPY | 0.001 |
| `XAU/USD` | `GOLD` | `XAUUSD` | XAU / USD | 0.01 |
| `XAG/USD` | `SILVER` | `XAGUSD` | XAG / USD | 0.001 |

### 3.2 Timeframe / Resolution Mapping (`RESOLUTIONS`)
| APEX Timeframe | Capital.com Wire Value | Exness API Equivalent |
| :--- | :--- | :--- |
| `1min` | `MINUTE` | `M1` |
| `15min` / `M15` | `MINUTE_15` | `M15` |
| `1h` / `H1` | `HOUR` | `H1` |
| `4h` / `H4` | `HOUR_4` | `H4` |
| `1day` / `D1` | `DAY` | `D1` |
| `1week` | `WEEK` | `W1` |
| *M5* | *Unsupported by Capital.com feed* | `M5` *(Native on Exness)* |
| *M30* | *Unsupported by Capital.com feed* | `M30` *(Native on Exness)* |

---

## 4. Market Data & Historical Candlesticks

### 4.1 Live Prices (`getLivePrice`)
- **Endpoint:** `GET /prices/${epic}`
- **Parsed Data:** Bid, Ask, Spread, Spread in Pips (`spread_pips`), Midpoint, Timestamp.
- **Pip Multipliers:**
  - Standard FX: `10,000`
  - JPY Pairs: `100`
  - XAU/USD: `10`
  - XAG/USD: `100`
- **Telemetry:** In-memory caching (TTL 4s) tracked by `marketDataTelemetry.livePriceHits` / `livePriceMisses`.

### 4.2 Historical Candles (`getCandles`)
- **Endpoint:** `GET /prices/${epic}?resolution=${resolution}&max=${fetchCount}`
- **Normalized Bar Schema:** `{ t: string, o: number, h: number, l: number, c: number }`
- **Array Sorting:** Sorted strictly ascending by timestamp (`a.t - b.t`) to prevent time-inversion bugs.
- **Caching:** In-memory `candleCache` (TTL 50s) keyed by `${pair}:${timeframe}`.

---

## 5. Order Sizing & Execution Pipeline

### 5.1 Sizing Logic (`calculateFixedDollarDealSize`)
- Flat risk allocation: **$25.00 USD** per setup.
- **EUR/USD & Standard FX:** Sized in whole units:
  $$\text{Units} = \frac{\$25.00}{|\text{Entry} - \text{SL}|}$$
  Rounded to nearest 500 units, bounded between 1,000 and 25,000 units.
- **GBP/JPY:** Sized in whole units using USD/JPY rate approximation:
  $$\text{Units} = \frac{\$25.00 \times 150.0}{|\text{Entry} - \text{SL}|}$$
  Bounded between 1,000 and 20,000 units.
- **XAU/USD (Gold):** Sized in troy ounces (e.g., 1.0 = 1 oz), bounded between 0.5 and 4.0 oz.
- **XAG/USD (Silver):** Sized in troy ounces, bounded between 10 and 120 oz.

### 5.2 Order Placement (`executeCapitalDemoTrade`)
- **Endpoint:** `POST /positions`
- **Payload:**
  ```json
  {
    "epic": "EURUSD",
    "direction": "SELL",
    "size": 18000,
    "stopLevel": 1.10232,
    "profitLevel": 1.10030,
    "guaranteedStop": false
  }
  ```
- **Response:** `{ "dealReference": "deal_..." }`
- **Pre-Execution Guards:**
  - Guard 0A: Weekend lockout (Friday 17:00 UTC cutoff to Sunday 22:00 UTC)
  - Guard 0B: High-impact economic news 60m entry freeze
  - Guard 0C: Sunday reopen spread armor
  - Guard 0D: Daily portfolio drawdown circuit breaker (max 2 losses/day)
  - Guard 1: Concurrency check on same instrument (max 1 position per pair)
  - Guard 1B: Daily pair trade cap (max 1 trade per pair per day)
  - Guard 2: Post-loss 2-hour cooldown / post-win 30-minute cooldown
  - Guard 3: Maximum 2 concurrent positions portfolio-wide
  - Guard 4: Setup hash daily deduplication
  - Guard 5: Minimum broker stop distance floor

---

## 6. Position Management, Breakeven & Trailing Defense

### 6.1 Open Position Polling (`getCapitalOpenPositions`)
- **Endpoint:** `GET /positions`
- **Output:** Array of positions with `dealId`, `level` (entry price), `stopLevel`, `profitLevel`, `upl`, `size`, `createdDateUTC`, `market.epic`, `market.symbol`.

### 6.2 Stop Loss Adjustment (`updateCapitalPositionStop`)
- **Endpoint:** `PUT /positions/${dealId}`
- **Payload:** `{ "stopLevel": newStopLevel, "profitLevel": existingProfitLevel, "guaranteedStop": false }`
- **Trigger Points:**
  - Breakeven Lock: At $+0.75\text{R}$ floating gain, stop is moved to `entryPrice`.
  - Runner Trailing: At $+1.25\text{R}$ floating gain, stop is moved to $+0.50\text{R}$ locked profit.
  - Missing TP Restorer: If an open position lacks a TP, APEX calculates and attaches it automatically.

### 6.3 Position Closing (`closeCapitalPosition`)
- **Endpoint:** `DELETE /positions/${dealId}`
- **Triggers:**
  - TP Sniper: Market price touches/pierces TP target on chart.
  - Weekend Auto-Flatten: Auto-close positions ahead of Friday close if enabled.
  - News Auto-Protect: Auto-close positions 15 minutes ahead of high-impact news.
  - User Action: Manual close triggered from UI modal.

---

## 7. Account Balances & Equity

### 7.1 Balance Retrieval (`getCapitalAccountBalance`)
- **Endpoint:** `GET /accounts`
- **Extracted Fields:**
  - `balance`: Realized account cash
  - `available`: Free margin available for trading
  - `deposit`: Total margin currently deployed
  - `profitLoss`: Total floating unrealized P&L
- **Fallbacks:** Returns `{ balance: 11000, available: 11000, deposit: 11000, profitLoss: 0 }` if broker endpoint fails.

---

## 8. Closed Trade History & Synchronization

### 8.1 Ingestion (`syncClosedBrokerTrades`)
- **Endpoint:** `GET /history/activity?lastPeriod=86400&detailed=true`
- **Filter:** `type === "POSITION"` && `status === "ACCEPTED"` && (`source === "TP"` || `source === "SL"` || `source === "USER"`).
- **Matching & Ingestion:** Compares `dealId` and price against local `tradesMemory`. If not present, creates a `VirtualTrade` entry with computed `rrGained` and appends to `trades.json`.
- **Baseline Stats:** 98 historical closed trades recorded: **46.9% (46W / 52L)**.

---

## 9. UI Components & Frontend Endpoints

### 9.1 Express Endpoints in `server.ts`
- `GET /api/capital/status`: Open positions, account balance, cooldowns, auto-trading flag.
- `POST /api/capital/toggle-auto`: Toggles background auto-trading on/off.
- `POST /api/capital/close-position`: Accepts `{ dealId }`, calls `closeCapitalPosition`.
- `POST /api/capital/update-stop`: Accepts `{ dealId, newStopLevel, profitLevel }`, calls `updateCapitalPositionStop`.

### 9.2 Frontend View Dependencies
- `ApexQuantApp.tsx`: Polls `/api/capital/status`, provides handlers for close, BE adjust, and auto-trade toggle.
- `LivePositionWorkstationView.tsx`: Displays active open position card, broker source badge, and interactive manual close / BE adjust modals.
- `InstrumentWorkstationView.tsx`: Displays active position banner on selected pair.
- `SignalIntelligenceView.tsx`: Displays open position status badge.
- `AdvancedChartRoomView.tsx`: Displays open deal banner and quick action.
- `SettingsDashboard.tsx`: Displays broker configuration, execution toggle, and connection diagnostic.

---

## 10. Audit Conclusions & Migration Guardrails

1. **Active Position Preservation:** There is currently 1 live open trade on Capital.com demo (EUR/USD SELL, 18,000 units, Entry 1.10232, Stop 1.10232 at BE, TP 1.10030, floating positive profit). **This position must NOT be closed during migration.** APEX must retain read-only and close/stop-management capabilities for this position until it naturally closes.
2. **Historical Performance Preservation:** All 98 historical trades in `trades.json` must remain intact with broker tag `"capital"`.
3. **Dual Adapter Pattern:** The transition to Exness should introduce an `ExnessAdapter` as the primary operational broker for new trades and market data, while retaining a legacy `CapitalAdapter` in read-only/cleanup mode.
4. **Endpoint Compatibility:** Keep `/api/capital/status` as a backward-compatible alias or forwarder to unified `/api/broker/status` to prevent any frontend disruption.
