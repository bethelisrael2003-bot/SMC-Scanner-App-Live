/**
 * aggressiveSmc.test.ts
 * Unit tests for Professional SMC & Price Action Analyst (Aggressive Growth Mode)
 */

import {
  convertToWat,
  calculateCentLotSize,
  analyzeSmcChart,
  getPipSize,
  getPipValuePer001Lot
} from "./aggressiveSmcEngine.js";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  PASS: ${msg}`);
}

console.log("\n=== Testing Aggressive SMC Engine & MM Protocol ===");

// 1. Session Timing Filter (WAT)
console.log("\n1. Session Timing & WAT Conversion Tests:");
{
  // 08:30 UTC -> 09:30 WAT (London Open)
  const london = convertToWat("2026-10-13T08:30:00Z");
  assert(london.watHour === 9 && london.watMinute === 30, "08:30 UTC converts to 09:30 WAT");
  assert(london.isKillZone === true, "09:30 WAT is within London Open Kill Zone");
  assert(london.sessionName.includes("London Open"), "Session identified as London Open");

  // 15:00 UTC -> 16:00 WAT (New York Open)
  const ny = convertToWat("2026-10-13T15:00:00Z");
  assert(ny.watHour === 16 && ny.watMinute === 0, "15:00 UTC converts to 16:00 WAT");
  assert(ny.isKillZone === true, "16:00 WAT is within New York Open Kill Zone");
  assert(ny.sessionName.includes("New York Open"), "Session identified as New York Open");

  // 03:00 UTC -> 04:00 WAT (Asian Dead Zone)
  const asian = convertToWat("2026-10-13T03:00:00Z");
  assert(asian.isKillZone === false, "04:00 WAT is outside Kill Zones (Asian Dead Zone)");
  assert(asian.sessionName.includes("Asian Session"), "Session identified as Asian Dead Zone");

  // 11:30 UTC -> 12:30 WAT (Lunch Hour Dead Zone)
  const lunch = convertToWat("2026-10-13T11:30:00Z");
  assert(lunch.isKillZone === false, "12:30 WAT is in Lunch Hour Dead Zone");
  assert(lunch.sessionName.includes("Lunch Hour"), "Session identified as Lunch Hour Dead Zone");
}

// 2. RoboForex Cent Account Money Management Calculations
console.log("\n2. RoboForex Cent Account Lot Size & Risk Calculations:");
{
  const balance = 677.0; // $677 USD
  const riskPct = 6.0;   // 6% fixed aggressive risk

  // Test EUR/USD: 20 pips SL
  // Cash Risk = 677 * 0.06 = $40.62
  // Pip value per 0.01 lot = $0.09
  // Raw Lot = 40.62 / (20 * 0.09) / 100 = 40.62 / 1.8 / 100 = 0.2256 -> 0.22 Lots
  const fxRes = calculateCentLotSize(balance, riskPct, 20.0, "EUR/USD");
  assert(Math.abs(fxRes.cashRisk - 40.62) < 0.01, `Cash risk is exactly $40.62 (got ${fxRes.cashRisk})`);
  assert(fxRes.lotSize === 0.22, `EUR/USD lot size rounds down to 0.22 lots (got ${fxRes.lotSize})`);

  // Test XAG/USD (Silver): 45 pips SL (45 cents)
  // Pip value per 0.01 lot = $0.08
  // Raw Lot = 40.62 / (45 * 0.08) / 100 = 40.62 / 3.6 / 100 = 0.1128 -> 0.11 Lots
  const silverRes = calculateCentLotSize(balance, riskPct, 45.0, "XAG/USD");
  assert(silverRes.lotSize === 0.11, `XAG/USD lot size rounds down to 0.11 lots (got ${silverRes.lotSize})`);

  // Test GBP/JPY: 35 pips SL
  // Raw Lot = 40.62 / (35 * 0.09) / 100 = 40.62 / 3.15 / 100 = 0.1289 -> 0.12 Lots
  const jpyRes = calculateCentLotSize(balance, riskPct, 35.0, "GBP/JPY");
  assert(jpyRes.lotSize === 0.12, `GBP/JPY lot size rounds down to 0.12 lots (got ${jpyRes.lotSize})`);
}

// 3. Pipeline Tests: Dead Zone Rejection -> WAIT
console.log("\n3. Pipeline Test: Dead Zone Rejection (Rule 3):");
{
  const result = analyzeSmcChart({
    pair: "XAG/USD",
    currentPrice: 32.50,
    currentTimeIso: "2026-10-13T04:00:00Z", // 05:00 WAT (Asian Dead Zone)
    h4Bars: [],
    h1Bars: [],
    m15Bars: []
  });
  assert(result.decision.verdict === "WAIT", "Dead zone outputs WAIT");
  assert(result.decision.reasoning.includes("Dead Zone"), "Reasoning explicitly mentions Dead Zone");
  assert(result.executionPlan === null, "No execution plan emitted during Dead Zone");
}

// 4. Pipeline Tests: No Sweep / No Displacement -> WAIT
console.log("\n4. Pipeline Test: No Sweep + No Displacement = WAIT (Rule 2):");
{
  // 10:00 WAT (in London kill zone), but flat consolidating bars without sweep
  const flatBars = Array(25).fill(0).map((_, i) => ({
    time: `2026-10-13T09:${String(i).padStart(2, "0")}:00Z`,
    open: 1.1500,
    high: 1.1510,
    low: 1.1490,
    close: 1.1502
  }));

  const result = analyzeSmcChart({
    pair: "EUR/USD",
    currentPrice: 1.1502,
    currentTimeIso: "2026-10-13T09:15:00Z", // 10:15 WAT
    h4Bars: Array(15).fill(0).map(() => ({ time: "", open: 1.1400, high: 1.1600, low: 1.1350, close: 1.1580 })),
    h1Bars: [],
    m15Bars: flatBars
  });
  assert(result.decision.verdict === "WAIT", "Flat consolidation without sweep outputs WAIT");
  assert(result.decision.reasoning.includes("No sweep + No displacement = NO TRADE"), "Reasoning enforces Rule 2");
}

// 5. Pipeline Test: Valid High-Probability BUY on Silver (XAG/USD)
console.log("\n5. Pipeline Test: Valid Bullish Setup on XAG/USD during London Kill Zone:");
{
  const h4Bars = Array(15).fill(0).map((_, i) => ({
    time: "",
    open: 30.0 + i * 0.1,
    high: 32.0 + i * 0.1,
    low: 29.5 + i * 0.1,
    close: 30.5 + i * 0.1 // in Discount (< 50% of range [29.5, 33.5])
  }));

  // Create 20 prior M15 bars with lowest low at 30.50
  const m15Bars = Array(20).fill(0).map((_, i) => ({
    time: "",
    open: 30.80,
    high: 31.00,
    low: 30.50,
    close: 30.70
  }));

  // Current bar sweeps 30.50 down to 30.30 and strongly displaces back up to 30.75
  m15Bars.push({
    time: "2026-10-13T09:15:00Z",
    open: 30.55,
    high: 30.80,
    low: 30.30,   // sweeps 30.50
    close: 30.75  // closes back above with strong rejection
  });

  const result = analyzeSmcChart({
    pair: "XAG/USD",
    currentPrice: 30.75,
    currentTimeIso: "2026-10-13T09:15:00Z", // 10:15 WAT (London Kill Zone)
    h4Bars,
    h1Bars: [],
    m15Bars,
    accountBalanceUsd: 677.0,
    customRiskPct: 6.0
  });

  assert(result.decision.verdict === "BUY", "Valid liquidity sweep + displacement in discount outputs BUY");
  assert(result.executionPlan !== null, "Execution plan is populated");
  assert(result.moneyManagement !== null, "Money management is populated");
  assert(result.moneyManagement?.recommendedLotSize! > 0, "Recommended lot size calculated");
  assert(result.formattedOutput.includes("**1. MARKET ANALYSIS**"), "Formatted output contains Section 1");
  assert(result.formattedOutput.includes("**2. DECISION**"), "Formatted output contains Section 2");
  assert(result.formattedOutput.includes("**3. EXECUTION PLAN**"), "Formatted output contains Section 3");
  assert(result.formattedOutput.includes("**4. 💸 AGGRESSIVE MM CALCULATION**"), "Formatted output contains Section 4");
}

console.log("\n=== ALL AGGRESSIVE SMC ENGINE TESTS PASSED! ===");
