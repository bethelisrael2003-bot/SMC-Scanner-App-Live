# Phase 2: Exness Trading API Technical Audit

**Project:** APEX Smart Money Concepts Institutional Trading System  
**Audit Date:** 2026-06-15  
**Official Portal Reference:** `https://www.exness-api.com/`  
**OpenAPI Specification:** Version 1.0.2 (`https://www.exness-api.com/openapi/trading.public.yaml`)  
**Scope:** Complete technical specification of Exness Trading API for direct integration into APEX backend.

---

## 1. Executive Summary & Architecture Overview

The Exness Trading API is a modern, high-performance institutional trading interface featuring:
- **Direct REST & WebSocket Communication:** Eliminates the need for MT4/MT5 Expert Advisors or terminal bridges.
- **Asymmetric Cryptographic Security:** Request authentication via Ed25519 signatures, timestamp bounds, and SHA-256 body hashing.
- **Dynamic Access Point Resolution:** Gateway discovery routes account traffic to designated high-availability access points.
- **Clean Domain Model:**
  - `Order`: Trading instruction (limit, stop, sltp, market execution).
  - `Position`: Open market exposure.
  - `Trading Snapshot`: Authoritative current state of account balances, positions, and active orders.
  - `Market Data`: High-resolution tick streams and historical OHLCV candles (including native M5 and M30).
  - `History`: Historical closed orders and deals.

---

## 2. Authentication, Ed25519 Request Signing, & Security Protocol

### 2.1 Request Signing Specification
Every request must include the following headers:

| Header | Required | Purpose / Specification |
| :--- | :--- | :--- |
| `EXN-API-KEY` | Yes | Public API key string identifier (e.g. `exnsk-...`). |
| `EXN-IDEMPOTENCY-KEY` | Yes | Non-empty unique string (5–128 chars) for mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`); empty string for `GET`. |
| `EXN-TIMESTAMP` | Yes | Unix timestamp in milliseconds (`Date.now()`). Server enforces tight timestamp freshness. |
| `EXN-SIGN-VERSION` | Yes | Signature version protocol. Fixed value: `1`. |
| `EXN-DATA` | Yes | Base64url-encoded JSON payload (without `=` padding). |
| `EXN-SIGN` | Yes | Ed25519 signature of the raw UTF-8 bytes of decoded `EXN-DATA`, base64url-encoded without `=` padding. |

### 2.2 Decoded `EXN-DATA` Schema
```json
{
  "api_key": "exnsk-...",
  "idempotency_key": "",
  "timestamp": 1773656070123,
  "sign_version": 1,
  "method": "GET",
  "path": "/v1/configuration/accounts/123456/account",
  "body_hash": "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"
}
```

### 2.3 Cryptographic Rules
1. **Body Hash:** SHA-256 hash of the exact request body bytes, base64url-encoded without padding. For requests with no body (e.g. `GET`), the SHA-256 hash of the empty byte sequence is strictly:
   `47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU`
2. **Path Integrity:** `path` must include the leading slash, path parameters, and query string exactly as transmitted. Duplicate query parameters are rejected.
3. **Private Key Formats Supported:**
   - 128-character hexadecimal string (32-byte seed + 32-byte public key) wrapped in RFC 8410 PKCS#8 DER.
   - Standard PKCS#8 PEM string (`-----BEGIN PRIVATE KEY-----`).
4. **Validation Test Vector Verification:** The APEX Node.js implementation has been verified against the official Exness RFC 8032 Test Vector with bit-for-bit exact match on both `EXN-DATA` and `EXN-SIGN`.

---

## 3. Gateway Discovery & Access Point Resolution

### 3.1 Resolution Flow
Exness isolates accounts onto dedicated high-speed access points. APEX must discover the access point once upon startup and cache it:

1. **Discovery Request:**
   - `GET /v1/trading/access-point?account_id={account_id}` sent to Gateway Base URL (e.g., `https://gateway.exness.com` or configured DNS widget URL).
   - Signed with `method="GET"`, `idempotency_key=""`, empty body hash.
2. **Discovery Response:**
   ```json
   {
     "access_point": "https://ap-4decef67.exness.com",
     "account_id": "12345678"
   }
   ```
3. **Caching:** The returned `access_point` base URL is cached in memory. All subsequent account operations (REST and WebSocket) connect directly to this Access Point.

---

## 4. Account Discovery & Information Models

### 4.1 Account Configuration
- **Endpoint:** `GET /v1/configuration/accounts/{account_id}/account`
- **Response Schema (`AccountDetailsResponse`):**
  - `account_id`: string
  - `account_name`: e.g. `"Standard"` or `"Pro"`
  - `settings.currency`: Account base currency (e.g. `"USD"`)
  - `settings.leverage`: Leverage ratio (e.g. `"1:2000"` or `"1:500"`)
  - `settings.margin_call_level`: Decimal string (e.g. `"60"`)
  - `settings.stopout_level`: Decimal string (e.g. `"0"`)
  - `settings.trade_mode`: `"trading_enabled"` | `"trading_disabled"` | `"close_only"`

### 4.2 Account Trading Snapshot
- **Endpoint:** `GET /v1/trading/accounts/{account_id}/snapshot`
- **Response Schema (`TradingStateSnapshot`):**
  - `account_state.balance`: Realized account cash balance as decimal string.
  - `account_state.equity`: Total account equity ($E = \text{balance} + \text{unrealized\_PNL}$).
  - `account_state.used_margin`: Margin currently utilized by open positions.
  - `free_margin`: Derived in APEX as $\text{equity} - \text{used\_margin}$.
  - `positions`: Array of currently open `Position` objects.
  - `orders`: Array of currently active `Order` objects (including attached SL/TP orders).

---

## 5. Market Data & Candlestick History

### 5.1 Candle History Endpoint
- **Endpoint:** `GET /v1/market-data/accounts/{account_id}/candles`
- **Query Parameters:**
  - `instrument` (Required): e.g. `"EURUSD"`, `"GBPJPY"`, `"XAUUSD"`, `"XAGUSD"`
  - `timeframe` (Required): `"S1"`, `"S5"`, `"S15"`, `"M1"`, `"M3"`, `"M5"`, `"M10"`, `"M15"`, `"M30"`, `"H1"`, `"H2"`, `"H4"`, `"D1"`, `"W1"`, `"MN"`
  - `price_type` (Optional): `"bid"` (default), `"ask"`, or `"both"`
  - `from` (Required): ISO 8601 UTC timestamp
  - `to` (Optional): ISO 8601 UTC timestamp
  - `count` (Optional): Integer (positive or negative count)
- **Candle Schema:**
  ```json
  {
    "time": "2026-06-15T10:00:00Z",
    "open": 1.10232,
    "high": 1.10310,
    "low": 1.10210,
    "close": 1.10280,
    "volume": 412.5
  }
  ```
- **Key Advantage over Capital.com:** Exness provides **native M5 and M30 candles**, unlocking multi-timeframe structural granularity previously flagged as unavailable.

---

## 6. Instrument Specifications & Conditions

### 6.1 Instrument Condition Endpoint
- **Endpoint:** `GET /v1/configuration/accounts/{account_id}/instruments/{instrument}/conditions`
- **Parameters & Fields:**
  - `point_digits`: Number of decimal digits allowed after the decimal point (e.g. 5 for EURUSD, 3 for GBPJPY, 2 for XAUUSD, 3 for XAGUSD). Minimum price increment is $10^{-\text{point\_digits}}$.
  - `contract_size`: Decimal string (e.g. `"100000"` for FX, `"100"` for XAUUSD, `"5000"` for XAGUSD).
  - `volume_min`: Minimum allowed tradable volume (e.g. `"0.01"` standard lots).
  - `volume_max`: Maximum allowed tradable volume (e.g. `"200"` lots).
  - `volume_step`: Volume increment step (e.g. `"0.01"` lots).
  - `calc_mode`: Margin calculation mode (`forex`, `cfd_leverage`, `cfd_index`, etc.).
  - `exec_mode`: Order execution mode (`market` or `instant`).
  - `trade_mode`: Trade availability (`full_access`, `close_only`, `disabled`).

---

## 7. Asynchronous Order Execution & Idempotency Pipeline

### 7.1 Immediate Market Execution
- **Endpoint:** `POST /v1/trading/accounts/{account_id}/positions`
- **Headers:** `EXN-IDEMPOTENCY-KEY: {unique_idempotency_key}`
- **Payload Schema (`OpenPositionRequest`):**
  ```json
  {
    "instrument": "EURUSD",
    "side": "sell",
    "volume": "0.17",
    "stop_loss_price": "1.10400",
    "take_profit_price": "1.10000",
    "comment": "APEX SMC Trend Sweep"
  }
  ```
- **Asynchronous ACK Response:**
  ```json
  {
    "operation_id": "98765432",
    "client_request_id": "apex-order-20260615-001",
    "status": "accepted"
  }
  ```
- **Execution Lifecycle:**
  1. REST endpoint returns immediate ACK with `operation_id` and echoes `client_request_id`.
  2. The trade is routed to the Exness matching engine.
  3. Execution result is broadcast via WebSocket as `transaction_event` or retrievable via `GET /v1/trading/accounts/{account_id}/operations/{operation_id}`.
  4. Local state updates upon confirmed execution.

---

## 8. Position Management, SL/TP Orders, Breakeven & Trailing Stops

### 8.1 Position Closing
- **Endpoint:** `DELETE /v1/trading/accounts/{account_id}/positions/{position_id}`
- **Query Parameters:**
  - `volume`: Optional decimal string to execute partial close. If omitted, closes full remaining volume.
- **ACK Response:** `{ "operation_id": "...", "client_request_id": "...", "status": "accepted" }`.

### 8.2 Attached SL/TP Order Modification
In Exness, Stop Loss and Take Profit attached to positions are modeled as linked `sltp` orders:
1. **Modifying Existing SL/TP:**
   - **Endpoint:** `PATCH /v1/trading/accounts/{account_id}/orders/{order_id}`
   - **Payload (`ModifyOrderRequest`):**
     ```json
     {
       "stop_loss_price": "1.10232",
       "take_profit_price": "1.10030"
     }
     ```
   - Omitted fields remain unchanged. Passing `null` removes the SL or TP.
2. **Attaching SL/TP if none existed:**
   - **Endpoint:** `POST /v1/trading/accounts/{account_id}/orders`
   - **Payload (`NewSltpOrderRequest`):**
     ```json
     {
       "type": "sltp",
       "position_id": "12345678",
       "stop_loss_price": "1.10232",
       "take_profit_price": "1.10030"
     }
     ```

---

## 9. History Ingestion & Reconciliation

### 9.1 Closed Deals History
- **Endpoint:** `GET /v1/history/accounts/{account_id}/deals`
- **Query Parameters:** `from`, `to`, `limit`, `instrument`, `deal_type`.
- **Deal Schema:**
  - `deal_id`: Unique execution identifier
  - `position_id`: Related position identifier
  - `instrument`: e.g. `"EURUSD"`
  - `direction`: `"buy"` | `"sell"`
  - `volume`: Traded volume
  - `price`: Executed price
  - `profit`: Realized net P&L in account currency
  - `commission`: Charged commission
  - `swap`: Charged swap
  - `event_time`: UTC ISO 8601 execution time

---

## 10. Rate Limits, Error Codes & Resiliency

### 10.1 Synchronous HTTP Status Codes
- `400`: Invalid request payload or parameter format.
- `401`: `AUTH_INVALID_API_KEY` or `AUTH_INVALID_SIGNATURE`.
- `403`: `AUTH_PERMISSION_DENIED` (IP restriction or scope mismatch).
- `404`: `ACCOUNT_NOT_FOUND`.
- `429`: Rate limit exceeded. Header `Retry-After` provides required backoff seconds.
- `503`: Service temporarily busy. Exponential backoff retry applied.

### 10.2 Asynchronous Trading Result Codes (in `transaction_event`)
- `TRADING_RULE_VOLUME_TOO_SMALL`: Volume < `volume_min`.
- `TRADING_RULE_INVALID_VOLUME_STEP`: Volume not aligned to `volume_step`.
- `TRADING_RULE_INVALID_PRICE_LEVELS`: SL/TP price violates stop distance or point precision.
- `TRADING_RULE_INSUFFICIENT_MARGIN`: Insufficient free margin to support order.
- `MARKET_TRADE_DISABLED`: Instrument or account trade mode inactive.
- `MARKET_SESSION_CLOSED`: Attempted execution outside instrument trading hours.
- `EXECUTION_REQUOTE` / `EXECUTION_REJECTED`: Price slipped past allowed deviation.
