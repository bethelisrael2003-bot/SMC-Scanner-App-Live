export interface Candle {
  t: string; // ISO or snapshotTime
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface SwingPoint {
  index: number;
  price: number;
  time: string;
}

export interface LiquidityPool {
  level: number;
  side: "BUY" | "SELL";
  source: string;
  time?: string;
}

export interface POI {
  type: string;
  direction: "BUY" | "SELL";
  high: number;
  low: number;
  open?: number;
  close?: number;
  index: number;
  time: string;
  displacement?: number;
  disp_atr?: number;
  strong_bodies?: boolean;
  valid: boolean;
  top?: number;
  bottom?: number;
}

export interface TradePlan {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;
  sl_atr: number;
}

export interface AnalysisResult {
  pair: string;
  price: number;
  checks: string[];
  passed: boolean;
  decision: "BUY" | "SELL" | "WAIT";
  grade: string;
  bonuses: number;
  bonus_list: string[];
  plan: TradePlan | null;
  h1_trend?: string;
  daily_trend?: string;
  weekly_trend?: string;
  zone?: string;
  range_high?: number;
  range_low?: number;
  rsi?: number;
  live?: {
    bid: number;
    ask: number;
    spread: number;
    spread_pips: number;
    mid: number;
    time: string;
  } | null;
}

export interface SessionInfo {
  session: string;
  message: string;
  canTrade: boolean;
  mondayReduced: boolean;
  currentGmt: string;
}

export interface EconomicEvent {
  time: string;
  currency: string;
  event: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  actual?: string;
  forecast?: string;
  previous?: string;
}
