# Staged Limit-Order Engine for MPR — DESIGN DRAFT

**Status: NOT DEPLOYED. Not approved. This document exists for review.**
Per user direction 2026-09-16: draft required BEFORE anything beyond classic
shadow mode is considered.

---

## 1. Problem

The MPR plan prices the entry at the pause-candle midpoint (the retest level),
but live execution enters AT MARKET the moment the scan passes — wherever
price happens to be (up to 0.75× ATR from the midpoint, per the staleness
gate). The fill drift is systematic:

- **Replay evidence (90 days, corrected data):** at-market fills averaged
  −0.13 ATR drift against median 0.49 ATR stops. Winners realized
  `[0.23, 0.25, 0.29, 0.35, 0.57, 0.58, 0.70, 0.88, 1.95]R` — median ~0.5R
  against a 1.5R plan. Every winner pays an execution tax; every loser still
  pays full −1R.
- **Live telemetry:** `fillDriftAtr` is recorded on every new trade and
  `sample.fillDriftAvgAtr` accumulates in /api/performance/stats.

## 2. Proposal

Replace instant at-market entry with a pending-order lifecycle:

1. **Create:** MPR passes all gates → create a PENDING order:
   limit = `mpr.entry` (pause midpoint), SL/TP from the module,
   expiry = 4 hours (finally gives `SIGNAL_EXPIRY_HOURS` mechanical meaning).
2. **Each 60s cycle, per pending:**
   - **FILL** when price touches the limit: BUY fills when ask ≤ limit,
     SELL when bid ≥ limit. Paper fill at the limit price.
   - **CANCEL** if price crosses the SL before filling (BUY: bid ≤ sl) —
     the retest thesis is structurally broken.
   - **EXPIRE** unfilled after 4h.
3. **On fill** → trade opens with entryPrice = limit, normal lineage
   (signalId, outcome stamp), `fillDriftAtr ≈ 0` by construction, entry
   guard trivially satisfied. Trade management unchanged (BE at 1:1,
   staleness 12h/0R, EOD volatility close, SL/TP).
4. **One pending per pair.** A new MPR signal while a pending exists →
   cancel-and-replace. A filled trade occupies the pair slot as today
   (plus the 30-min post-close cooldown).
5. **State & observability:** pendingOrders in memory + a Mongo collection
   (same pattern as trades/signals); funnel counters
   (`pendingCreated / filled / expired / cancelledSL`) in the persisted gate
   stats; exposed in /api/health; optional second push notification on fill.

## 3. Replay evidence — at-market vs staged limit (same 90-day window)

| Metric | At-market (current) | Staged limit (proposed) |
|---|---|---|
| MPR fires processed | 68 | 68 |
| Pendings created | — | 30 |
| **Trades** | **26** | **12** (40% fill rate) |
| Filled / expired / cancelled | — | 12 / 13 / 5 |
| Win rate | 34.6% | 25.0% |
| R sum | −11.2R | −3.5R |
| Avg R / trade | −0.43R | −0.29R |
| Winner R values | 0.23 – 1.95 (median ~0.5) | **1.50, 1.50, 1.50** |
| Max drawdown | −11.8R | −4.0R |
| Median SL | 0.49 ATR | 0.36 ATR |

## 3b. VARIANT RUN (2026-09-16): confirmation-fill — touch + M15 close back
##      beyond the midpoint, market entry at that confirming close

| Metric | At-market | Touch-fill | Confirm-fill |
|---|---|---|---|
| Pendings | — | 30 | 29 |
| Trades | 26 | 12 (40%) | **7 (24%)** |
| Filled / expired / cancelledSL / guardBlocked | — | 12 / 13 / 5 / 0 | 7 / 13 / 9 / 0 |
| Win rate | 34.6% | 25.0% | **42.9%** |
| R sum | −11.20R | −3.50R | **−2.58R** |
| Avg R / trade | −0.43R | **−0.29R** | −0.37R |
| Winner R values | 0.23–1.95 (med ~0.5) | 1.50 × 3 | 0.36 / 0.40 / 0.66 |
| Fill drift | −0.13 ATR | 0 (at the limit) | −0.20 ATR (the bounce is paid for) |
| Max drawdown | −11.8R | −4.0R | **−2.58R** |

Mechanism (verified trade-by-trade): the confirmation filter kept all 3
touch-fill winners (same three trades) and removed exactly 5 of the 9
touch-fill losers — it is a falling-knife filter. But entering at the
confirming close re-applies the drift tax through a different door
(−0.20 ATR average fill drift), shrinking winners from 1.5R to 0.36–0.66R.
n = 7: the WR movement is directionally real, statistically unproven.

## 4. What the numbers say — honest reading

- **The mechanics work as designed:** limit fills restore winners to the
  full planned 1.5R, tighten effective stops (0.49 → 0.36 ATR), and cut both
  the total loss and the drawdown roughly by two-thirds in this window.
- **The cost is frequency:** 60% of pendings never fill (13 expired — the
  retest never came; 5 cancelled — price broke the structure first).
  Trade count halves.
- **The win rate drops (34.6% → 25%)** — this is the important subtlety:
  the two books are NOT the same trades executed differently. At-market
  entries self-select for setups where price has already left the zone
  (momentum under way); limit fills catch every retest, including the ones
  that continue straight through the midpoint into the stop. Different
  populations, different character.
- **Both books were negative in this window** — MPR's *selection* was
  negative here, and execution changes do not fix selection. The limit
  engine is an execution-quality improvement, not an edge.
- **Sample sizes (12 vs 26) are directional evidence only.** The live
  `fillDriftAtr` telemetry is the second, independent measurement — the
  decision should use both.

## 5. Config knobs (proposed defaults)

- `LIMIT_EXPIRY_HOURS` = 4 (env-overridable)
- Cancel-on-SL-cross before fill: ON
- Cancel-and-replace on newer signal: ON
- Fill semantics: touch = fill at limit (paper standard)
- Pending orders visible in /api/health (count + age) — UI display later

## 6. Risks and open questions

1. **Frequency halves.** At ~2 trades/week at-market, the staged version
   implies ~1/week — the 15-20 trade sample timeline roughly doubles.
2. **The falling-knife population.** Variant worth testing in a future
   replay: fill only after the limit is touched AND an M15 candle closes
   back in the setup direction (confirmation at the level). Costs some
   fills, may lift the 25% WR.
3. **Push UX:** the signal push (setup found) and the fill push (position
   opened) become separate events — the user should expect the second.
4. **Session/EOD boundaries:** pendings expiring overnight; EOD close
   applies to filled trades only. No new logic needed, but behavior to
   document.
5. **Paper-fill optimism:** touch = fill assumes no queue/latency. For a
   paper system this is the standard convention; flag it for any future
   live-broker translation.

## 7. Decision requested

The fill-with-confirmation variant has been run (§3b). Remaining options:
approve one of the three execution models (at-market status quo /
touch-fill / confirm-fill — changes MPR ENTRY MECHANICS; the clean sample
restarts at that deploy), reject all, or request further variants
(e.g. touch-fill + N-bar confirmation deadline, tighter pending
invalidation). Note: all three books were negative in this window — the
binding problem in this sample is MPR selection, not execution.
