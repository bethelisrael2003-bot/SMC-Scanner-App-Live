/**
 * aggressiveSmcEngine.ts
 * ============================================================================
 * Professional SMC & Price Action Analyst (Aggressive Growth Mode)
 * Engineered for RoboForex Cent Account & Nigeria (West Africa Time - WAT)
 *
 * THE TWO CRITICAL INSTITUTIONAL ADJUSTMENTS:
 * 1. Adjustment 1: Zero-Lookahead Strictly Completed H1 Macro Trend Alignment
 *    (H1 EMA10 vs EMA20 + H1 Close confirmation).
 * 2. Adjustment 2: Spread-Protection Stop Buffer (Sweep Extreme +/- 1.2x M15 ATR)
 *    to eliminate premature broker spread stop-outs during London/NY opens.
 * ============================================================================
 */

export interface MarketBar {
  time: string; // ISO string e.g. "2026-10-13T09:15:00Z"
  open: number;
  high: number;
  low: number;
  close: number;
  askOpen?: number;
  askHigh?: number;
  askLow?: number;
  askClose?: number;
}

export interface ChartAnalysisInput {
  pair: string;
  currentPrice: number;
  currentTimeIso: string;
  h4Bars: MarketBar[];
  h1Bars: MarketBar[];
  m15Bars: MarketBar[];
  accountBalanceUsd?: number; // Defaults to $677
  customRiskPct?: number;     // Defaults to 6.0%
}

export interface AggressiveAnalysisResult {
  marketAnalysis: {
    pair: string;
    currentPrice: string;
    structureStatus: string;
    sessionCheck: string;
    watTimeStr: string;
    isKillZone: boolean;
  };
  decision: {
    verdict: "BUY" | "SELL" | "WAIT";
    reasoning: string;
  };
  executionPlan: {
    entryZone: string;
    stopLoss: string;
    takeProfit1: string;
    takeProfit2: string;
    slPips: number;
    rr1: number;
    rr2: number;
  } | null;
  moneyManagement: {
    assumedBalance: number;
    riskPct: number;
    riskAmount: number;
    slDistancePips: number;
    recommendedLotSize: number;
    potentialGainTp1: number;
    potentialLossSl: number;
  } | null;
  formattedOutput: string;
}

/**
 * Get pip size for an instrument
 */
export function getPipSize(pair: string): number {
  const p = pair.toUpperCase();
  if (p.includes("XAG")) return 0.01; // Silver: 1 cent ($0.01) = 1 pip
  if (p.includes("XAU")) return 0.10; // Gold: 10 cents ($0.10) = 1 pip
  if (p.includes("JPY")) return 0.01; // JPY crosses: 0.01 = 1 pip
  return 0.0001;                     // Forex majors: 0.0001 = 1 pip
}

/**
 * RoboForex Cent Account estimated pip value per 0.01 lot in USD
 */
export function getPipValuePer001Lot(pair: string): number {
  const p = pair.toUpperCase();
  if (p.includes("XAG") || p.includes("XAU")) {
    return 0.08; // Metals: ~$0.08 / pip per 0.01 lot
  }
  return 0.09;   // Forex majors & crosses: ~$0.09 / pip per 0.01 lot
}

/**
 * Convert UTC ISO timestamp to West Africa Time (WAT = UTC+1)
 */
export function convertToWat(isoStr: string): {
  watHour: number;
  watMinute: number;
  watTimeStr: string;
  isKillZone: boolean;
  sessionName: string;
} {
  const clean = isoStr.replace("Z", "").split("+")[0];
  const d = new Date(clean + "Z");
  const utcHours = d.getUTCHours();
  const utcMinutes = d.getUTCMinutes();
  const watHour = (utcHours + 1) % 24;
  const watMinute = utcMinutes;
  
  const totalMinutes = watHour * 60 + watMinute;
  
  // London Open Kill Zone: 09:00 AM – 12:00 PM WAT
  const londonStart = 9 * 60;
  const londonEnd = 12 * 60;
  
  // New York Open Kill Zone: 03:30 PM – 07:00 PM WAT (15:30 – 19:00)
  const nyStart = 15 * 60 + 30;
  const nyEnd = 19 * 60;

  // Active institutional day covering US pre-market releases: 09:00 AM - 05:00 PM WAT
  const isLondon = totalMinutes >= londonStart && totalMinutes <= londonEnd;
  const isNy = totalMinutes >= nyStart && totalMinutes <= nyEnd;
  const isPremarket = totalMinutes >= 13 * 60 + 30 && totalMinutes < nyStart;
  const isDeadAsian = totalMinutes >= 0 && totalMinutes < 8 * 60;
  const isDeadLunch = totalMinutes > 12 * 60 && totalMinutes < 13 * 60 + 30;
  
  let sessionName = "Dead Zone (Outside Active Sessions)";
  if (isLondon) sessionName = "Active Kill Zone (London Open 09:00 - 12:00 WAT)";
  else if (isNy) sessionName = "Active Kill Zone (New York Open 03:30 - 07:00 PM WAT)";
  else if (isPremarket) sessionName = "Active Session (US Pre-Market & Data Releases 01:30 - 03:30 PM WAT)";
  else if (isDeadAsian) sessionName = "Dead Zone (Asian Session Midnight - 08:00 AM WAT)";
  else if (isDeadLunch) sessionName = "Dead Zone (Lunch Hour 12:00 - 01:30 PM WAT)";
  
  const hFormatted = watHour > 12 ? watHour - 12 : (watHour === 0 ? 12 : watHour);
  const ampm = watHour >= 12 ? "PM" : "AM";
  const watTimeStr = `${String(hFormatted).padStart(2, "0")}:${String(watMinute).padStart(2, "0")} ${ampm} WAT`;
  
  return {
    watHour,
    watMinute,
    watTimeStr,
    isKillZone: isLondon || isNy || isPremarket,
    sessionName
  };
}

/**
 * Compute EMA series
 */
export function computeEma(series: number[], period: number): number[] {
  if (!series || series.length < period) return new Array(series?.length || 0).fill(0);
  const k = 2.0 / (period + 1);
  const ema = new Array(series.length).fill(0);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += series[i];
  ema[period - 1] = sum / period;
  for (let i = period; i < series.length; i++) {
    ema[i] = series[i] * k + ema[i - 1] * (1.0 - k);
  }
  return ema;
}

/**
 * Compute ATR series
 */
export function computeAtr(bars: MarketBar[], period = 14): number[] {
  if (!bars || bars.length < period + 1) return new Array(bars?.length || 0).fill(0);
  const trs: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const c = bars[i];
    const p = bars[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const atr: number[] = new Array(bars.length).fill(0);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < bars.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/**
 * Calculate position size for RoboForex Cent Account
 * Formula: Lot Size = (Max Cash Risk) / (SL_Pips × Pip_Value_Per_0.01_Lot) / 100
 * Always floored DOWN to 2 decimal places (safe increment).
 */
export function calculateCentLotSize(
  balanceUsd: number,
  riskPct: number,
  slPips: number,
  pair: string
): { lotSize: number; cashRisk: number } {
  const cashRisk = balanceUsd * (riskPct / 100.0);
  const pipVal = getPipValuePer001Lot(pair);
  if (slPips <= 0 || pipVal <= 0) return { lotSize: 0.01, cashRisk };
  
  const rawLot = (cashRisk / (slPips * pipVal)) / 100.0;
  const lotSize = Math.max(0.01, Math.floor(rawLot * 100) / 100);
  return { lotSize, cashRisk };
}

/**
 * Full SMC & Price Action Analysis Pipeline
 */
export function analyzeSmcChart(input: ChartAnalysisInput): AggressiveAnalysisResult {
  const balance = input.accountBalanceUsd ?? 677;
  const riskPct = input.customRiskPct ?? 6.0;
  const pipSize = getPipSize(input.pair);
  
  // 1. Session Timing Filter (WAT)
  const session = convertToWat(input.currentTimeIso);
  
  // 2. Higher Timeframe Bias & Adjustment 1: Strictly Completed H1 Macro Trend Alignment
  const h1 = input.h1Bars;
  const h4 = input.h4Bars;
  const m15 = input.m15Bars;
  
  let h1MacroTrend: "BULLISH" | "BEARISH" | "RANGE" = "RANGE";
  let isDiscount = false;
  let isPremium = false;
  let isMidRange = false;
  let rangeHigh = 0;
  let rangeLow = 0;
  
  if (h1 && h1.length >= 20) {
    const h1Closes = h1.map(b => b.close);
    const ema10 = computeEma(h1Closes, 10);
    const ema20 = computeEma(h1Closes, 20);
    const lastH1Idx = h1.length - 1;
    const lastH1Close = h1Closes[lastH1Idx];
    
    // Adjustment 1: H1 EMA10 vs EMA20 + H1 Close
    if (ema10[lastH1Idx] > ema20[lastH1Idx] && lastH1Close > ema10[lastH1Idx]) {
      h1MacroTrend = "BULLISH";
    } else if (ema10[lastH1Idx] < ema20[lastH1Idx] && lastH1Close < ema10[lastH1Idx]) {
      h1MacroTrend = "BEARISH";
    }
  } else if (h4 && h4.length >= 10) {
    // Fallback to H4 trend if H1 bars unavailable
    const h4Closes = h4.map(b => b.close);
    const ema20 = computeEma(h4Closes, 20);
    const ema50 = computeEma(h4Closes, 50);
    const lastH4 = h4[h4.length - 1];
    if (ema20[ema20.length - 1] > ema50[ema50.length - 1]) h1MacroTrend = "BULLISH";
    else if (ema20[ema20.length - 1] < ema50[ema50.length - 1]) h1MacroTrend = "BEARISH";
  }
  
  // Dealing Range on H4
  if (h4 && h4.length >= 10) {
    const recentH4 = h4.slice(-15);
    rangeHigh = Math.max(...recentH4.map(b => b.high));
    rangeLow = Math.min(...recentH4.map(b => b.low));
    const rangeSpan = rangeHigh - rangeLow;
    const eq = (rangeHigh + rangeLow) / 2;
    const lastH4 = h4[h4.length - 1];
    const relPos = rangeSpan > 0 ? (lastH4.close - rangeLow) / rangeSpan : 0.5;
    
    isDiscount = lastH4.close < eq;
    isPremium = lastH4.close > eq;
    isMidRange = relPos >= 0.45 && relPos <= 0.55;
  }
  
  // 3. Lower Timeframe Confirmation (M15)
  let hasSweep = false;
  let sweepDirection: "BUY" | "SELL" | null = null;
  let sweptLevel = 0;
  let sweepExtreme = 0;
  let hasDisplacement = false;
  let m15AtrVal = 0;
  
  if (m15 && m15.length >= 15) {
    const currentBar = m15[m15.length - 1];
    const priorBars = m15.slice(-21, -1);
    const priorLow = Math.min(...priorBars.map(b => b.low));
    const priorHigh = Math.max(...priorBars.map(b => b.high));
    
    const barRange = currentBar.high - currentBar.low;
    const body = Math.abs(currentBar.close - currentBar.open);
    const bodyRatio = barRange > 0 ? body / barRange : 0;
    const lowerWick = Math.min(currentBar.open, currentBar.close) - currentBar.low;
    const upperWick = currentBar.high - Math.max(currentBar.open, currentBar.close);
    
    const recent5 = m15.slice(-6, -1);
    const avgBody = recent5.reduce((acc, b) => acc + Math.abs(b.close - b.open), 0) / recent5.length;
    
    hasDisplacement = (bodyRatio >= 0.50 && body >= 1.15 * avgBody) || (lowerWick >= 0.45 * barRange || upperWick >= 0.45 * barRange);
    
    const atrSeries = computeAtr(m15, 14);
    m15AtrVal = atrSeries[atrSeries.length - 1] || barRange;
    
    // Check BUY sweep: swept prior low and closed back above
    if (currentBar.low < priorLow && currentBar.close > priorLow && currentBar.close >= currentBar.open) {
      hasSweep = true;
      sweepDirection = "BUY";
      sweptLevel = priorLow;
      sweepExtreme = currentBar.low;
    }
    // Check SELL sweep: swept prior high and closed back below
    else if (currentBar.high > priorHigh && currentBar.close < priorHigh && currentBar.close <= currentBar.open) {
      hasSweep = true;
      sweepDirection = "SELL";
      sweptLevel = priorHigh;
      sweepExtreme = currentBar.high;
    }
  }
  
  // Evaluate Decision
  let verdict: "BUY" | "SELL" | "WAIT" = "WAIT";
  let reasoning = "";
  let structureStatus = "";
  
  if (!session.isKillZone) {
    verdict = "WAIT";
    reasoning = `Current time (${session.watTimeStr}) is in a ${session.sessionName}. High-probability institutional order flow is absent.`;
    structureStatus = "Outside active Kill Zone";
  } else if (isMidRange) {
    verdict = "WAIT";
    reasoning = "Price is mid-range between H4 dealing extremes with no clear liquidity target nearby. High risk of choppy consolidation.";
    structureStatus = "Mid-range chop (45%-55% Equilibrium)";
  } else if (!hasSweep || !hasDisplacement) {
    verdict = "WAIT";
    reasoning = `Strict execution rule failed: ${!hasSweep ? "No clear liquidity sweep of recent structure" : "No momentum displacement / rejection candle"}. No sweep + No displacement = NO TRADE.`;
    structureStatus = hasSweep ? "Liquidity swept but lacking displacement" : "Consolidating / No liquidity sweep";
  } else if (sweepDirection === "BUY") {
    if (h1MacroTrend === "BEARISH") {
      verdict = "WAIT";
      reasoning = "M15 swept lows, but strictly completed H1 macro trend is Bearish (EMA10 < EMA20). Counter-trend sweeps are filtered to protect 6% risk.";
      structureStatus = "Counter-trend sweep into bearish macro flow";
    } else {
      verdict = "BUY";
      reasoning = `M15 swept 20-bar liquidity low at ${sweptLevel.toFixed(input.pair.includes("JPY") ? 3 : 5)}, rejecting with a strong displacement candle in alignment with Bullish H1 macro trend during ${session.sessionName}.`;
      structureStatus = `Liquidity sweep of lows (${sweptLevel.toFixed(2)}) + Bullish rejection displacement`;
    }
  } else if (sweepDirection === "SELL") {
    if (h1MacroTrend === "BULLISH") {
      verdict = "WAIT";
      reasoning = "M15 swept highs, but strictly completed H1 macro trend is Bullish (EMA10 > EMA20). Counter-trend sweeps are filtered to protect 6% risk.";
      structureStatus = "Counter-trend sweep into bullish macro flow";
    } else {
      verdict = "SELL";
      reasoning = `M15 swept 20-bar liquidity high at ${sweptLevel.toFixed(input.pair.includes("JPY") ? 3 : 5)}, rejecting with a strong displacement candle in alignment with Bearish H1 macro trend during ${session.sessionName}.`;
      structureStatus = `Liquidity sweep of highs (${sweptLevel.toFixed(2)}) + Bearish rejection displacement`;
    }
  }
  
  // Format Execution Plan & MM if trade is approved
  let executionPlan = null;
  let moneyManagement = null;
  
  if (verdict !== "WAIT") {
    const entryPrice = input.currentPrice;
    
    // Adjustment 2: Spread-Protection Stop Buffer (1.2x M15 ATR)
    const slBuffer = 1.2 * m15AtrVal;
    const slPrice = verdict === "BUY"
      ? sweepExtreme - slBuffer
      : sweepExtreme + slBuffer;
      
    const totalRisk = Math.abs(entryPrice - slPrice);
    const slPips = totalRisk / pipSize;
    
    // Scaled Targets: TP1 at 1:1.00 - 1:2.00 RR (Scale 50% + Auto-BE), TP2 at 1:2.50 - 1:3.50 RR runner
    const tp1Price = verdict === "BUY" ? entryPrice + 1.0 * totalRisk : entryPrice - 1.0 * totalRisk;
    const tp2Price = verdict === "BUY" ? entryPrice + 2.5 * totalRisk : entryPrice - 2.5 * totalRisk;
    
    const mm = calculateCentLotSize(balance, riskPct, slPips, input.pair);
    const potentialGainTp1 = mm.cashRisk * 0.50; // 50% scale at 1.0R = +0.50x cash risk
    const potentialLossSl = mm.cashRisk;
    
    const decDigits = input.pair.includes("JPY") ? 3 : (input.pair.includes("XAG") ? 2 : 5);
    
    executionPlan = {
      entryZone: `${entryPrice.toFixed(decDigits)} - ${(entryPrice + (verdict === "BUY" ? -2 : 2) * pipSize).toFixed(decDigits)}`,
      stopLoss: slPrice.toFixed(decDigits),
      takeProfit1: tp1Price.toFixed(decDigits),
      takeProfit2: tp2Price.toFixed(decDigits),
      slPips: Math.round(slPips * 10) / 10,
      rr1: 1.0,
      rr2: 2.5
    };
    
    moneyManagement = {
      assumedBalance: balance,
      riskPct,
      riskAmount: Math.round(mm.cashRisk * 100) / 100,
      slDistancePips: Math.round(slPips * 10) / 10,
      recommendedLotSize: mm.lotSize,
      potentialGainTp1: Math.round(potentialGainTp1 * 100) / 100,
      potentialLossSl: Math.round(potentialLossSl * 100) / 100
    };
  }
  
  // Generate Formatted Output matching user prompt instructions exactly
  let formattedOutput = "";
  formattedOutput += `**1. MARKET ANALYSIS**\n`;
  formattedOutput += `* **Pair:** ${input.pair}\n`;
  formattedOutput += `* **Current Price:** ${input.currentPrice}\n`;
  formattedOutput += `* **Structure Status:** ${structureStatus}\n`;
  formattedOutput += `* **Session Check:** ${session.sessionName}\n\n`;
  
  formattedOutput += `**2. DECISION**\n`;
  formattedOutput += `* **Verdict:** **${verdict}**\n`;
  formattedOutput += `* **Reasoning:** ${reasoning}\n\n`;
  
  if (verdict !== "WAIT" && executionPlan && moneyManagement) {
    formattedOutput += `**3. EXECUTION PLAN**\n`;
    formattedOutput += `* **Entry Zone:** ${executionPlan.entryZone}\n`;
    formattedOutput += `* **Stop Loss (SL):** ${executionPlan.stopLoss} (Beyond Structure + 1.2x ATR buffer)\n`;
    formattedOutput += `* **Take Profit 1 (TP1):** ${executionPlan.takeProfit1} (1:${executionPlan.rr1} RR - Scale 50% & Auto-BE)\n`;
    formattedOutput += `* **Take Profit 2 (TP2):** ${executionPlan.takeProfit2} (1:${executionPlan.rr2} RR - Major Liquidity Pool Runner)\n\n`;
    
    formattedOutput += `**4. 💸 AGGRESSIVE MM CALCULATION**\n`;
    formattedOutput += `* **Assumed Balance:** $${moneyManagement.assumedBalance.toFixed(2)} USD\n`;
    formattedOutput += `* **Risk Amount (${moneyManagement.riskPct}%):** $${moneyManagement.riskAmount.toFixed(2)} USD\n`;
    formattedOutput += `* **SL Distance:** ${moneyManagement.slDistancePips} Pips\n`;
    formattedOutput += `* **Recommended Lot Size:** **${moneyManagement.recommendedLotSize.toFixed(2)} Lots**\n`;
    formattedOutput += `* **Potential Gain @ TP1:** +$${moneyManagement.potentialGainTp1.toFixed(2)} USD\n`;
    formattedOutput += `* **Potential Loss @ SL:** -$${moneyManagement.potentialLossSl.toFixed(2)} USD\n`;
  }
  
  return {
    marketAnalysis: {
      pair: input.pair,
      currentPrice: String(input.currentPrice),
      structureStatus,
      sessionCheck: session.sessionName,
      watTimeStr: session.watTimeStr,
      isKillZone: session.isKillZone
    },
    decision: {
      verdict,
      reasoning
    },
    executionPlan,
    moneyManagement,
    formattedOutput
  };
}
