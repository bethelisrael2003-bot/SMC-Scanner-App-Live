/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APEX EXNESS TRADING API BROKER ADAPTER (TypeScript)
 * ═══════════════════════════════════════════════════════════════════════════
 * Authoritative Direct Integration with Exness Trading API v1.0.2
 * https://www.exness-api.com/
 *
 * Core Features:
 *  - Native Ed25519 Request Signing with SHA-256 Body Hash & EXN-* Headers
 *  - Automatic Access Point Discovery & Caching via DNS Gateway
 *  - High-Resolution Candlesticks (including native M5 and M30)
 *  - Direct Market Order Placement with attached SL/TP
 *  - Asynchronous ACK & Operation Correlation
 *  - Position SL/TP Modification (Breakeven & Trailing stops)
 *  - Deals and Orders Historical Ingestion
 *  - High-Fidelity Simulation Fallback for Zero-Credential Sandbox / Demo Testing
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from "node:crypto";

export interface ExnessCredentials {
  apiKey: string;
  privateKey: string;
  accountId: string;
  discoveryBaseUrl: string;
  isDemo?: boolean;
}

export interface ExnessAccount {
  accountId: string;
  currency: string;
  leverage: string;
  accountName: string;
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  tradeMode: string;
  marginCallLevel?: string;
  stopoutLevel?: string;
}

export interface ExnessCandle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface ExnessPosition {
  positionId: string;
  instrument: string;
  direction: "buy" | "sell";
  volume: number;
  openPrice: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  sltpOrderId?: string;
  upl?: number;
  createTime: string;
  comment?: string;
}

export interface ExnessOrder {
  orderId: string;
  positionId?: string;
  orderType: string; // "market" | "stop" | "limit" | "sltp"
  state: string; // "placed" | "filled" | "cancelled" | "rejected"
  direction?: "buy" | "sell";
  instrument?: string;
  price?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  volume?: number;
  createTime?: string;
  updateTime?: string;
}

export interface ExnessDeal {
  dealId: string;
  positionId: string;
  instrument: string;
  direction: "buy" | "sell";
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  eventTime: string;
}

export interface ExnessInstrumentCondition {
  instrument: string;
  pointDigits: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  marginPercent?: number;
  swapLong?: number;
  swapShort?: number;
}

export interface ExnessAckResponse {
  operationId: string;
  clientRequestId: string;
  status: string;
}

// Standard Exness Instrument Specifications
export const EXNESS_INSTRUMENT_SPECS: Record<string, ExnessInstrumentCondition> = {
  EURUSD: {
    instrument: "EURUSD",
    pointDigits: 5,
    contractSize: 100000,
    volumeMin: 0.01,
    volumeMax: 200,
    volumeStep: 0.01,
    marginPercent: 1.0,
  },
  GBPJPY: {
    instrument: "GBPJPY",
    pointDigits: 3,
    contractSize: 100000,
    volumeMin: 0.01,
    volumeMax: 200,
    volumeStep: 0.01,
    marginPercent: 1.0,
  },
  XAUUSD: {
    instrument: "XAUUSD",
    pointDigits: 2,
    contractSize: 100, // 100 oz per 1 lot
    volumeMin: 0.01,
    volumeMax: 50,
    volumeStep: 0.01,
    marginPercent: 1.0,
  },
  XAGUSD: {
    instrument: "XAGUSD",
    pointDigits: 3,
    contractSize: 5000, // 5,000 oz per 1 lot
    volumeMin: 0.01,
    volumeMax: 20,
    volumeStep: 0.01,
    marginPercent: 1.0,
  },
};

// Instrument mapping between APEX format and Exness API format
export const APEX_TO_EXNESS_MAP: Record<string, string> = {
  "EUR/USD": "EURUSD",
  "GBP/JPY": "GBPJPY",
  "XAU/USD": "XAUUSD",
  "XAG/USD": "XAGUSD",
  "GBP/USD": "GBPUSD",
  "USD/JPY": "USDJPY",
  "USD/CHF": "USDCHF",
  "USD/CAD": "USDCAD",
  "AUD/USD": "AUDUSD",
  "NZD/USD": "NZDUSD",
  "EUR/JPY": "EURJPY",
};

export const EXNESS_TO_APEX_MAP: Record<string, string> = {
  EURUSD: "EUR/USD",
  GBPJPY: "GBP/JPY",
  XAUUSD: "XAU/USD",
  XAGUSD: "XAG/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
  USDCHF: "USD/CHF",
  USDCAD: "USD/CAD",
  AUDUSD: "AUD/USD",
  NZDUSD: "NZD/USD",
  EURJPY: "EUR/JPY",
};

// Timeframe mapping
export const APEX_TO_EXNESS_TIMEFRAMES: Record<string, string> = {
  "1min": "M1",
  M1: "M1",
  M5: "M5",
  "15min": "M15",
  M15: "M15",
  M30: "M30",
  "1h": "H1",
  H1: "H1",
  "4h": "H4",
  H4: "H4",
  "1day": "D1",
  D1: "D1",
  "1week": "W1",
  W1: "W1",
};

/**
 * Loads and validates an Ed25519 signing key from either a 128-hex character string
 * or a PKCS#8 PEM string.
 */
export function loadSigningKey(text: string): KeyObject {
  const input = text.trim();
  let key: KeyObject;

  if (input.startsWith("-----BEGIN PRIVATE KEY-----")) {
    key = createPrivateKey(input);
  } else {
    if (!/^[0-9a-fA-F]{128}$/.test(input)) {
      throw new Error("Expected 128 hex characters or unencrypted PKCS#8 PEM");
    }
    const raw = Buffer.from(input, "hex");
    // RFC 8410 PKCS#8 DER wrapper for a 32-byte Ed25519 seed.
    key = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        raw.subarray(0, 32),
      ]),
      format: "der",
      type: "pkcs8",
    });

    const publicJwk = createPublicKey(key).export({ format: "jwk" });
    if (!Buffer.from(publicJwk.x ?? "", "base64url").equals(raw.subarray(32))) {
      throw new Error("Private key public half does not match its seed");
    }
  }

  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Expected an Ed25519 private key");
  }

  return key;
}

/**
 * Verifies that the internal Ed25519 signing implementation exactly reproduces
 * the official RFC 8032 test vector from the Exness Developer Portal.
 */
export function verifySigningImplementation(): boolean {
  const testHex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
  const key = loadSigningKey(testHex);
  const timestamp = 1773656070123;
  const apiKey = "exnsk-synthetic-example";
  const path = "/v1/trading/access-point?account_id=123456";
  const method = "GET";
  const idempotencyKey = "";

  const headers = generateSignedHeaders({
    apiKey,
    privateKey: key,
    method,
    pathWithQuery: path,
    timestamp,
    idempotencyKey,
  });

  const expectedData = "eyJhcGlfa2V5IjoiZXhuc2stc3ludGhldGljLWV4YW1wbGUiLCJpZGVtcG90ZW5jeV9rZXkiOiIiLCJ0aW1lc3RhbXAiOjE3NzM2NTYwNzAxMjMsInNpZ25fdmVyc2lvbiI6MSwibWV0aG9kIjoiR0VUIiwicGF0aCI6Ii92MS90cmFkaW5nL2FjY2Vzcy1wb2ludD9hY2NvdW50X2lkPTEyMzQ1NiIsImJvZHlfaGFzaCI6IjQ3REVRcGo4SEJTYS1fVEltVy01SkNldVFlUmttNU5NcEpXWkczaFN1RlUifQ";
  const expectedSign = "l-H_Acia8YoTjKFMg-3fon3NOEX8TalNVA7c01DQ9dHb7pVBJC4y06qC-DbpETzh1KToiOprqEV6uzN3t69ICQ";

  const matchesData = headers["EXN-DATA"] === expectedData;
  const matchesSign = headers["EXN-SIGN"] === expectedSign;

  return matchesData && matchesSign;
}

/**
 * Generates signed EXN-* request headers according to the Exness specification.
 */
export function generateSignedHeaders(options: {
  apiKey: string;
  privateKey: KeyObject;
  method: string;
  pathWithQuery: string;
  bodyJsonStr?: string;
  idempotencyKey?: string;
  timestamp?: number;
}): Record<string, string> {
  const ts = options.timestamp ?? Date.now();
  const method = options.method.toUpperCase();
  const idempotencyKey = method === "GET" ? "" : (options.idempotencyKey || `apex-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

  // Body hash: SHA-256 base64url without '=' padding
  let bodyHash: string;
  if (!options.bodyJsonStr || options.bodyJsonStr.length === 0) {
    // Empty body constant hash
    bodyHash = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
  } else {
    bodyHash = createHash("sha256").update(Buffer.from(options.bodyJsonStr, "utf8")).digest("base64url");
  }

  const payloadObj = {
    api_key: options.apiKey,
    idempotency_key: idempotencyKey,
    timestamp: ts,
    sign_version: 1,
    method,
    path: options.pathWithQuery,
    body_hash: bodyHash,
  };

  const payloadBytes = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const exnData = payloadBytes.toString("base64url");
  const exnSign = sign(null, payloadBytes, options.privateKey).toString("base64url");

  return {
    "EXN-API-KEY": options.apiKey,
    "EXN-IDEMPOTENCY-KEY": idempotencyKey,
    "EXN-TIMESTAMP": String(ts),
    "EXN-SIGN-VERSION": "1",
    "EXN-DATA": exnData,
    "EXN-SIGN": exnSign,
  };
}

/**
 * Comprehensive risk evaluation result for Exness position sizing.
 */
export interface ExnessRiskEvaluation {
  pair: string;
  cleanInstrument: string;
  entryPrice: number;
  slPrice: number;
  stopDistance: number;
  contractSize: number;
  targetRiskUsd: number;
  volumeStep: number;
  volumeMin: number;
  volumeMax: number;
  riskPerLotUsd: number;
  spreadCostPerLotUsd: number;
  commissionPerLotUsd: number;
  totalCostPerLotUsd: number;
  rawTheoreticalLots: number;
  permittedLots: number; // Strictly floored so that estimatedAllInRiskUsd <= targetRiskUsd
  theoreticalStopRiskUsd: number; // Exact USD risk if stopped out at SL
  estimatedSpreadCostUsd: number;
  estimatedCommissionUsd: number;
  estimatedAllInRiskUsd: number; // Stop risk + spread cost + commission (strictly <= targetRiskUsd)
  permittedLotsStopLossOnly: number; // Sizing considering theoretical stop-loss alone
  theoreticalStopOnlyRiskUsd: number;
  isRejected: boolean;
  rejectionReason?: string;
}

/**
 * Authoritative default spreads in price units for Exness Standard account.
 */
export const EXNESS_DEFAULT_SPREADS: Record<string, number> = {
  EURUSD: 0.00010, // 1.0 pip
  GBPJPY: 0.015,   // 1.5 pips
  XAUUSD: 0.20,    // $0.20 / oz ($20.00 / lot)
  XAGUSD: 0.015,   // $0.015 / oz ($75.00 / lot)
};

/**
 * Evaluates trade risk against Exness trading specifications, enforcing:
 * 1. Authoritative instrument contract size and base/quote currency.
 * 2. Exchange rate conversion (e.g. JPY cross via USD/JPY).
 * 3. Minimum lot size and volume step increment (0.01).
 * 4. Strict flooring (never rounding upward) so monetary risk never exceeds targetRiskUsd.
 * 5. Distinct reporting of theoretical stop-loss risk vs estimated all-in trading cost (spread + commission).
 * 6. Strict ceiling: Total estimated trade risk (stop risk + spread + commission) <= $25.00.
 * 7. Trade rejection when minimum permitted volume would exceed target risk ceiling.
 */
export function evaluateExnessRisk(
  pair: string,
  entryPrice: number,
  slPrice: number,
  targetRiskUsd = 25.0,
  liveUsdJpy = 155.0,
  customSpreadPrice?: number,
  commissionPerLot = 0.0
): ExnessRiskEvaluation {
  const stopDist = Math.abs(entryPrice - slPrice);
  const cleanInstrument = APEX_TO_EXNESS_MAP[pair] || pair.replace("/", "");
  const spec = EXNESS_INSTRUMENT_SPECS[cleanInstrument] || {
    contractSize: 100000,
    volumeMin: 0.01,
    volumeMax: 200,
    volumeStep: 0.01,
  };

  const spreadPrice = customSpreadPrice ?? (EXNESS_DEFAULT_SPREADS[cleanInstrument] || 0.00010);

  if (!stopDist || stopDist <= 0) {
    return {
      pair,
      cleanInstrument,
      entryPrice,
      slPrice,
      stopDistance: 0,
      contractSize: spec.contractSize,
      targetRiskUsd,
      volumeStep: spec.volumeStep,
      volumeMin: spec.volumeMin,
      volumeMax: spec.volumeMax,
      riskPerLotUsd: 0,
      spreadCostPerLotUsd: 0,
      commissionPerLotUsd: commissionPerLot,
      totalCostPerLotUsd: 0,
      rawTheoreticalLots: 0,
      permittedLots: 0,
      theoreticalStopRiskUsd: 0,
      estimatedSpreadCostUsd: 0,
      estimatedCommissionUsd: 0,
      estimatedAllInRiskUsd: 0,
      permittedLotsStopLossOnly: 0,
      theoreticalStopOnlyRiskUsd: 0,
      isRejected: true,
      rejectionReason: "Invalid stop distance: Entry and Stop Loss prices are identical or invalid",
    };
  }

  // 1. Calculate Risk per 1.00 standard lot in USD
  let riskPerLotUsd = 0;
  let spreadCostPerLotUsd = 0;

  if (cleanInstrument === "XAUUSD") {
    // 1 standard lot = 100 oz
    riskPerLotUsd = stopDist * spec.contractSize;
    spreadCostPerLotUsd = spreadPrice * spec.contractSize;
  } else if (cleanInstrument === "XAGUSD") {
    // 1 standard lot = 5,000 oz
    riskPerLotUsd = stopDist * spec.contractSize;
    spreadCostPerLotUsd = spreadPrice * spec.contractSize;
  } else if (cleanInstrument.endsWith("JPY") || pair.includes("JPY")) {
    // JPY quote currency: convert to USD using live USD/JPY rate
    riskPerLotUsd = (stopDist * spec.contractSize) / liveUsdJpy;
    spreadCostPerLotUsd = (spreadPrice * spec.contractSize) / liveUsdJpy;
  } else {
    // USD quote currency (EUR/USD, GBP/USD, etc.)
    riskPerLotUsd = stopDist * spec.contractSize;
    spreadCostPerLotUsd = spreadPrice * spec.contractSize;
  }

  const totalCostPerLotUsd = riskPerLotUsd + spreadCostPerLotUsd + commissionPerLot;

  // Minimum tradable risk at volumeMin (0.01 lots) including spread & commission
  const minVolAllInRiskUsd = Number((spec.volumeMin * totalCostPerLotUsd).toFixed(2));

  // Requirement 1 & 8: Reject trades when minimum permitted volume would exceed risk limit ($25.00)
  if (minVolAllInRiskUsd > targetRiskUsd) {
    return {
      pair,
      cleanInstrument,
      entryPrice,
      slPrice,
      stopDistance: stopDist,
      contractSize: spec.contractSize,
      targetRiskUsd,
      volumeStep: spec.volumeStep,
      volumeMin: spec.volumeMin,
      volumeMax: spec.volumeMax,
      riskPerLotUsd: Number(riskPerLotUsd.toFixed(2)),
      spreadCostPerLotUsd: Number(spreadCostPerLotUsd.toFixed(2)),
      commissionPerLotUsd: commissionPerLot,
      totalCostPerLotUsd: Number(totalCostPerLotUsd.toFixed(2)),
      rawTheoreticalLots: targetRiskUsd / totalCostPerLotUsd,
      permittedLots: 0,
      theoreticalStopRiskUsd: 0,
      estimatedSpreadCostUsd: 0,
      estimatedCommissionUsd: 0,
      estimatedAllInRiskUsd: 0,
      permittedLotsStopLossOnly: 0,
      theoreticalStopOnlyRiskUsd: 0,
      isRejected: true,
      rejectionReason: `Trade rejected: Minimum tradable volume (${spec.volumeMin} lots) all-in risk is $${minVolAllInRiskUsd.toFixed(2)} USD, which exceeds maximum target risk limit of $${targetRiskUsd.toFixed(2)} USD`,
    };
  }

  // 2. Strict All-In Sizing: Floored to volumeStep (0.01) ensuring All-In Risk <= targetRiskUsd
  const rawAllInLots = targetRiskUsd / totalCostPerLotUsd;
  const flooredAllInLots = Math.floor(rawAllInLots / spec.volumeStep) * spec.volumeStep;
  const permittedLots = Number(Math.min(spec.volumeMax, Math.max(0, flooredAllInLots)).toFixed(2));

  const theoreticalStopRiskUsd = Number((permittedLots * riskPerLotUsd).toFixed(2));
  const estimatedSpreadCostUsd = Number((permittedLots * spreadCostPerLotUsd).toFixed(2));
  const estimatedCommissionUsd = Number((permittedLots * commissionPerLot).toFixed(2));
  const estimatedAllInRiskUsd = Number((theoreticalStopRiskUsd + estimatedSpreadCostUsd + estimatedCommissionUsd).toFixed(2));

  // 3. Stop-Loss Only Sizing for Reference
  const rawStopOnlyLots = targetRiskUsd / riskPerLotUsd;
  const flooredStopOnlyLots = Math.floor(rawStopOnlyLots / spec.volumeStep) * spec.volumeStep;
  const permittedLotsStopLossOnly = Number(Math.min(spec.volumeMax, Math.max(0, flooredStopOnlyLots)).toFixed(2));
  const theoreticalStopOnlyRiskUsd = Number((permittedLotsStopLossOnly * riskPerLotUsd).toFixed(2));

  return {
    pair,
    cleanInstrument,
    entryPrice,
    slPrice,
    stopDistance: stopDist,
    contractSize: spec.contractSize,
    targetRiskUsd,
    volumeStep: spec.volumeStep,
    volumeMin: spec.volumeMin,
    volumeMax: spec.volumeMax,
    riskPerLotUsd: Number(riskPerLotUsd.toFixed(2)),
    spreadCostPerLotUsd: Number(spreadCostPerLotUsd.toFixed(2)),
    commissionPerLotUsd: commissionPerLot,
    totalCostPerLotUsd: Number(totalCostPerLotUsd.toFixed(2)),
    rawTheoreticalLots: rawAllInLots,
    permittedLots,
    theoreticalStopRiskUsd,
    estimatedSpreadCostUsd,
    estimatedCommissionUsd,
    estimatedAllInRiskUsd,
    permittedLotsStopLossOnly,
    theoreticalStopOnlyRiskUsd,
    isRejected: false,
  };
}

/**
 * Calculates standard lot deal size for Exness ensuring strict $25 flat risk parity
 * inclusive of stop loss risk, spread friction, and commission.
 * Never rounds upward. Returns 0 if trade is rejected by risk rules.
 */
export function calculateExnessLots(
  pair: string,
  entryPrice: number,
  slPrice: number,
  targetRiskUsd = 25.0,
  liveUsdJpy = 155.0,
  stopLossOnly = false
): number {
  const evalResult = evaluateExnessRisk(pair, entryPrice, slPrice, targetRiskUsd, liveUsdJpy);
  if (evalResult.isRejected) {
    return 0;
  }
  return stopLossOnly ? evalResult.permittedLotsStopLossOnly : evalResult.permittedLots;
}

/**
 * Main Exness Adapter Class
 */
export class ExnessBrokerAdapter {
  private config: ExnessCredentials;
  private privateKeyObj: KeyObject | null = null;
  private cachedAccessPoint: string | null = null;
  private accessPointCachedAt = 0;
  private isSimulationMode = false;

  // Simulation state for sandbox / demo fallback
  private simBalance = 10898.64;
  private simPositions: ExnessPosition[] = [];
  private simOrders: ExnessOrder[] = [];
  private simDeals: ExnessDeal[] = [];

  constructor(config?: Partial<ExnessCredentials>) {
    this.config = {
      apiKey: config?.apiKey || process.env.EXN_API_KEY || "",
      privateKey: config?.privateKey || process.env.EXN_PRIVATE_KEY || "",
      accountId: config?.accountId || process.env.EXN_ACCOUNT_ID || "",
      discoveryBaseUrl: config?.discoveryBaseUrl || process.env.EXN_DISCOVERY_BASE_URL || "https://gateway.exness.com",
      isDemo: config?.isDemo ?? (process.env.EXN_IS_DEMO !== "false"),
    };

    if (this.config.apiKey && this.config.privateKey && this.config.accountId) {
      try {
        this.privateKeyObj = loadSigningKey(this.config.privateKey);
        this.isSimulationMode = false;
      } catch (err) {
        console.warn("[EXNESS ADAPTER] Warning loading private key, running in simulation mode:", err);
        this.isSimulationMode = true;
      }
    } else {
      this.isSimulationMode = true;
    }
  }

  public getIsSimulationMode(): boolean {
    return this.isSimulationMode;
  }

  public setSimulationMode(enabled: boolean): void {
    this.isSimulationMode = enabled;
  }

  public getCredentialsStatus(): {
    configured: boolean;
    hasApiKey: boolean;
    hasPrivateKey: boolean;
    hasAccountId: boolean;
    isDemo: boolean;
    discoveryBaseUrl: string;
    isSimulationMode: boolean;
  } {
    const hasApiKey = Boolean(this.config.apiKey && this.config.apiKey.length > 5);
    const hasPrivateKey = Boolean(this.privateKeyObj);
    const hasAccountId = Boolean(this.config.accountId && this.config.accountId.length > 2);
    return {
      configured: hasApiKey && hasPrivateKey && hasAccountId,
      hasApiKey,
      hasPrivateKey,
      hasAccountId,
      isDemo: Boolean(this.config.isDemo),
      discoveryBaseUrl: this.config.discoveryBaseUrl || "https://gateway.exness.com",
      isSimulationMode: this.isSimulationMode,
    };
  }

  /**
   * Resolves and caches the account Access Point from the Gateway.
   */
  public async resolveAccessPoint(forceRefresh = false): Promise<string> {
    if (this.isSimulationMode) {
      return "https://ap-simulated.exness.com";
    }

    const now = Date.now();
    // Cache Access Point for 60 minutes
    if (!forceRefresh && this.cachedAccessPoint && now - this.accessPointCachedAt < 60 * 60 * 1000) {
      return this.cachedAccessPoint;
    }

    if (!this.privateKeyObj) {
      throw new Error("Private key not loaded for Exness Access Point discovery");
    }

    const path = `/v1/trading/access-point?account_id=${this.config.accountId}`;
    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj,
      method: "GET",
      pathWithQuery: path,
    });

    const url = `${this.config.discoveryBaseUrl}${path}`;
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Exness Access Point discovery failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { access_point?: string };
    if (!data.access_point) {
      throw new Error("Exness discovery response missing access_point URL");
    }

    this.cachedAccessPoint = data.access_point;
    this.accessPointCachedAt = now;
    return this.cachedAccessPoint;
  }

  /**
   * Fetches account details and balances.
   */
  public async getAccount(): Promise<ExnessAccount> {
    if (this.isSimulationMode) {
      const usedMargin = this.simPositions.reduce((acc, p) => acc + (p.volume * 1000), 0);
      return {
        accountId: this.config.accountId || "152706877",
        currency: "USD",
        leverage: "1:2000",
        accountName: this.config.isDemo ? "Standard Demo" : "Standard",
        balance: this.simBalance,
        equity: this.simBalance + this.simPositions.reduce((acc, p) => acc + (p.upl || 0), 0),
        usedMargin,
        freeMargin: this.simBalance - usedMargin,
        tradeMode: "trading_enabled",
        marginCallLevel: "60",
        stopoutLevel: "0",
      };
    }

    const accessPoint = await this.resolveAccessPoint();
    const snapshotPath = `/v1/trading/accounts/${this.config.accountId}/snapshot`;
    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj!,
      method: "GET",
      pathWithQuery: snapshotPath,
    });

    const res = await fetch(`${accessPoint}${snapshotPath}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Exness snapshot failed: HTTP ${res.status}`);
    }

    const snapshot = (await res.json()) as any;
    const accState = snapshot.account_state || {};
    const balance = parseFloat(accState.balance || "0");
    const equity = parseFloat(accState.equity || "0");
    const usedMargin = parseFloat(accState.used_margin || "0");

    return {
      accountId: this.config.accountId,
      currency: "USD",
      leverage: "1:2000",
      accountName: "Exness Account",
      balance,
      equity,
      usedMargin,
      freeMargin: equity - usedMargin,
      tradeMode: "trading_enabled",
    };
  }

  /**
   * Fetches official trading conditions and specifications for an instrument.
   */
  public async getInstrumentConditions(pairOrInstrument: string): Promise<ExnessInstrumentCondition> {
    const cleanInstrument = APEX_TO_EXNESS_MAP[pairOrInstrument] || pairOrInstrument.replace("/", "");
    if (this.isSimulationMode) {
      return EXNESS_INSTRUMENT_SPECS[cleanInstrument] || {
        instrument: cleanInstrument,
        pointDigits: 5,
        contractSize: 100000,
        volumeMin: 0.01,
        volumeMax: 200,
        volumeStep: 0.01,
      };
    }

    const accessPoint = await this.resolveAccessPoint();
    const path = `/v1/configuration/accounts/${this.config.accountId}/instruments/${cleanInstrument}/conditions`;
    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj!,
      method: "GET",
      pathWithQuery: path,
    });

    const res = await fetch(`${accessPoint}${path}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Exness getInstrumentConditions failed for ${cleanInstrument}: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    return {
      instrument: data.instrument || cleanInstrument,
      pointDigits: data.point_digits ?? 5,
      contractSize: parseFloat(data.contract_size || "100000"),
      volumeMin: parseFloat(data.volume_min || "0.01"),
      volumeMax: parseFloat(data.volume_max || "200"),
      volumeStep: parseFloat(data.volume_step || "0.01"),
      marginPercent: data.margin_percent ? parseFloat(data.margin_percent) : 1.0,
      swapLong: data.swap_long ? parseFloat(data.swap_long) : undefined,
      swapShort: data.swap_short ? parseFloat(data.swap_short) : undefined,
    };
  }

  /**
   * Fetches current snapshot containing open positions, pending orders, and monetary state.
   */
  public async getSnapshot(): Promise<{
    accountState: { balance: number; equity: number; usedMargin: number; freeMargin: number };
    positions: ExnessPosition[];
    orders: ExnessOrder[];
  }> {
    if (this.isSimulationMode) {
      const usedMargin = this.simPositions.reduce((acc, p) => acc + (p.volume * 1000), 0);
      const uplTotal = this.simPositions.reduce((acc, p) => acc + (p.upl || 0), 0);
      return {
        accountState: {
          balance: this.simBalance,
          equity: this.simBalance + uplTotal,
          usedMargin,
          freeMargin: this.simBalance - usedMargin,
        },
        positions: [...this.simPositions],
        orders: [...this.simOrders],
      };
    }

    const accessPoint = await this.resolveAccessPoint();
    const path = `/v1/trading/accounts/${this.config.accountId}/snapshot`;
    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj!,
      method: "GET",
      pathWithQuery: path,
    });

    const res = await fetch(`${accessPoint}${path}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Exness snapshot retrieval failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const accState = data.account_state || {};
    const balance = parseFloat(accState.balance || "0");
    const equity = parseFloat(accState.equity || "0");
    const usedMargin = parseFloat(accState.used_margin || "0");

    const rawOrders: any[] = data.orders || [];
    const orders: ExnessOrder[] = rawOrders.map((o) => ({
      orderId: String(o.order_id),
      positionId: o.position_id ? String(o.position_id) : undefined,
      orderType: o.order_type,
      state: o.state,
      direction: o.direction,
      instrument: o.instrument,
      price: o.price ? parseFloat(o.price) : undefined,
      stopLossPrice: o.stop_loss_price ? parseFloat(o.stop_loss_price) : undefined,
      takeProfitPrice: o.take_profit_price ? parseFloat(o.take_profit_price) : undefined,
      volume: o.volume ? parseFloat(o.volume) : undefined,
      createTime: o.create_time,
      updateTime: o.update_time,
    }));

    // Find attached sltp orders linked to positions
    const sltpOrdersByPosId = new Map<string, ExnessOrder>();
    for (const ord of orders) {
      if (ord.orderType === "sltp" && ord.positionId) {
        sltpOrdersByPosId.set(ord.positionId, ord);
      }
    }

    const rawPositions: any[] = data.positions || [];
    const positions: ExnessPosition[] = rawPositions.map((p) => {
      const posId = String(p.position_id);
      const linkedOrder = sltpOrdersByPosId.get(posId);
      return {
        positionId: posId,
        instrument: p.instrument,
        direction: p.direction,
        volume: parseFloat(p.volume || "0"),
        openPrice: parseFloat(p.open_price || "0"),
        stopLossPrice: linkedOrder?.stopLossPrice,
        takeProfitPrice: linkedOrder?.takeProfitPrice,
        sltpOrderId: linkedOrder?.orderId,
        upl: p.upl ? parseFloat(p.upl) : undefined,
        createTime: p.create_time,
      };
    });

    return {
      accountState: {
        balance,
        equity,
        usedMargin,
        freeMargin: equity - usedMargin,
      },
      positions,
      orders,
    };
  }

  /**
   * Fetches historical candlestick data from Exness Market Data API.
   */
  public async getCandles(
    pair: string,
    timeframe: string,
    count = 120
  ): Promise<ExnessCandle[]> {
    const cleanInstrument = APEX_TO_EXNESS_MAP[pair] || pair.replace("/", "");
    const exnTimeframe = APEX_TO_EXNESS_TIMEFRAMES[timeframe] || "H1";

    if (this.isSimulationMode) {
      // Return high-fidelity synthetic candlesticks based on real baseline levels
      return this.generateSimulatedCandles(cleanInstrument, exnTimeframe, count);
    }

    const accessPoint = await this.resolveAccessPoint();
    // Exness endpoint: GET /v1/market-data/accounts/{account_id}/candles?instrument=EURUSD&timeframe=H1&from=...&count=120
    const nowIso = new Date().toISOString();
    const pathWithQuery = `/v1/market-data/accounts/${this.config.accountId}/candles?instrument=${cleanInstrument}&timeframe=${exnTimeframe}&from=${encodeURIComponent(nowIso)}&count=${-Math.abs(count)}&price_type=bid`;

    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj!,
      method: "GET",
      pathWithQuery,
    });

    const res = await fetch(`${accessPoint}${pathWithQuery}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Exness candle fetch failed for ${pair}: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { candles?: any[] };
    const rawCandles = data.candles || [];

    const candles: ExnessCandle[] = rawCandles.map((c: any) => ({
      t: c.time,
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
      v: c.volume,
    }));

    // Ensure strictly oldest-first ordering
    candles.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

    return candles;
  }

  /**
   * Opens an immediate market position on Exness with optional Stop Loss and Take Profit.
   */
  public async openMarketPosition(params: {
    instrument: string;
    side: "buy" | "sell";
    volume: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    comment?: string;
  }): Promise<ExnessAckResponse> {
    const cleanInstrument = APEX_TO_EXNESS_MAP[params.instrument] || params.instrument.replace("/", "");
    const spec = EXNESS_INSTRUMENT_SPECS[cleanInstrument] || { pointDigits: 5 };
    const volumeStr = params.volume.toFixed(2);

    const idempotencyKey = `apex-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    if (this.isSimulationMode) {
      const mockOpId = `op_${Date.now()}`;
      const newPos: ExnessPosition = {
        positionId: `pos_${Date.now()}`,
        instrument: cleanInstrument,
        direction: params.side,
        volume: params.volume,
        openPrice: cleanInstrument === "EURUSD" ? 1.10250 : cleanInstrument === "GBPJPY" ? 210.500 : 2400.0,
        stopLossPrice: params.stopLossPrice,
        takeProfitPrice: params.takeProfitPrice,
        createTime: new Date().toISOString(),
        comment: params.comment,
        upl: 0,
      };
      this.simPositions.push(newPos);
      return {
        operationId: mockOpId,
        clientRequestId: idempotencyKey,
        status: "accepted",
      };
    }

    const accessPoint = await this.resolveAccessPoint();
    const path = `/v1/trading/accounts/${this.config.accountId}/positions`;

    const bodyObj: any = {
      instrument: cleanInstrument,
      side: params.side,
      volume: volumeStr,
    };

    if (params.stopLossPrice) {
      bodyObj.stop_loss_price = params.stopLossPrice.toFixed(spec.pointDigits);
    }
    if (params.takeProfitPrice) {
      bodyObj.take_profit_price = params.takeProfitPrice.toFixed(spec.pointDigits);
    }
    if (params.comment) {
      bodyObj.comment = params.comment;
    }

    const bodyJsonStr = JSON.stringify(bodyObj);

    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj!,
      method: "POST",
      pathWithQuery: path,
      bodyJsonStr,
      idempotencyKey,
    });

    const res = await fetch(`${accessPoint}${path}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: bodyJsonStr,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Exness open position failed: HTTP ${res.status} - ${errText}`);
    }

    const ack = (await res.json()) as any;
    return {
      operationId: String(ack.operation_id || ""),
      clientRequestId: String(ack.client_request_id || idempotencyKey),
      status: ack.status || "accepted",
    };
  }

  /**
   * Modifies an attached Stop Loss or Take Profit order on an open position.
   */
  public async updatePositionStop(params: {
    positionId: string;
    sltpOrderId?: string;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    instrument?: string;
  }): Promise<boolean> {
    const cleanInstrument = params.instrument ? (APEX_TO_EXNESS_MAP[params.instrument] || params.instrument.replace("/", "")) : "EURUSD";
    const spec = EXNESS_INSTRUMENT_SPECS[cleanInstrument] || { pointDigits: 5 };

    if (this.isSimulationMode) {
      const pos = this.simPositions.find((p) => p.positionId === params.positionId);
      if (pos) {
        if (params.stopLossPrice !== undefined) pos.stopLossPrice = params.stopLossPrice;
        if (params.takeProfitPrice !== undefined) pos.takeProfitPrice = params.takeProfitPrice;
        return true;
      }
      return false;
    }

    const accessPoint = await this.resolveAccessPoint();

    // If an SLTP order exists, modify it via PATCH /orders/{order_id}
    if (params.sltpOrderId) {
      const path = `/v1/trading/accounts/${this.config.accountId}/orders/${params.sltpOrderId}`;
      const bodyObj: any = {};
      if (params.stopLossPrice !== undefined) {
        bodyObj.stop_loss_price = params.stopLossPrice ? params.stopLossPrice.toFixed(spec.pointDigits) : null;
      }
      if (params.takeProfitPrice !== undefined) {
        bodyObj.take_profit_price = params.takeProfitPrice ? params.takeProfitPrice.toFixed(spec.pointDigits) : null;
      }

      const bodyJsonStr = JSON.stringify(bodyObj);
      const idempotencyKey = `apex-mod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const headers = generateSignedHeaders({
        apiKey: this.config.apiKey,
        privateKey: this.privateKeyObj!,
        method: "PATCH",
        pathWithQuery: path,
        bodyJsonStr,
        idempotencyKey,
      });

      const res = await fetch(`${accessPoint}${path}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: bodyJsonStr,
        signal: AbortSignal.timeout(15000),
      });

      return res.ok;
    } else {
      // Attach new SLTP order via POST /orders
      const path = `/v1/trading/accounts/${this.config.accountId}/orders`;
      const bodyObj: any = {
        type: "sltp",
        position_id: params.positionId,
      };
      if (params.stopLossPrice) {
        bodyObj.stop_loss_price = params.stopLossPrice.toFixed(spec.pointDigits);
      }
      if (params.takeProfitPrice) {
        bodyObj.take_profit_price = params.takeProfitPrice.toFixed(spec.pointDigits);
      }

      const bodyJsonStr = JSON.stringify(bodyObj);
      const idempotencyKey = `apex-sltp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const headers = generateSignedHeaders({
        apiKey: this.config.apiKey,
        privateKey: this.privateKeyObj!,
        method: "POST",
        pathWithQuery: path,
        bodyJsonStr,
        idempotencyKey,
      });

      const res = await fetch(`${accessPoint}${path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: bodyJsonStr,
        signal: AbortSignal.timeout(15000),
      });

      return res.ok;
    }
  }

  /**
   * Closes an open position at market.
   */
  public async closePosition(positionId: string, volume?: number): Promise<boolean> {
    if (this.isSimulationMode) {
      const idx = this.simPositions.findIndex((p) => p.positionId === positionId);
      if (idx >= 0) {
        const closed = this.simPositions.splice(idx, 1)[0];
        this.simDeals.push({
          dealId: `deal_${Date.now()}`,
          positionId: closed.positionId,
          instrument: closed.instrument,
          direction: closed.direction,
          volume: closed.volume,
          price: closed.openPrice,
          profit: closed.upl || 0,
          commission: 0,
          swap: 0,
          eventTime: new Date().toISOString(),
        });
        return true;
      }
      return false;
    }

    const accessPoint = await this.resolveAccessPoint();
    let path = `/v1/trading/accounts/${this.config.accountId}/positions/${positionId}`;
    if (volume !== undefined && volume > 0) {
      path += `?volume=${volume.toFixed(2)}`;
    }

    const idempotencyKey = `apex-close-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj!,
      method: "DELETE",
      pathWithQuery: path,
      idempotencyKey,
    });

    const res = await fetch(`${accessPoint}${path}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    return res.ok;
  }

  /**
   * Fetches historical closed deals for reconciliation.
   */
  public async getDealsHistory(limit = 50): Promise<ExnessDeal[]> {
    if (this.isSimulationMode) {
      return [...this.simDeals].slice(-limit);
    }

    const accessPoint = await this.resolveAccessPoint();
    const pathWithQuery = `/v1/history/accounts/${this.config.accountId}/deals?limit=${limit}`;

    const headers = generateSignedHeaders({
      apiKey: this.config.apiKey,
      privateKey: this.privateKeyObj!,
      method: "GET",
      pathWithQuery,
    });

    const res = await fetch(`${accessPoint}${pathWithQuery}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { deals?: any[] };
    const rawDeals = data.deals || [];

    return rawDeals.map((d: any) => ({
      dealId: String(d.deal?.deal_id || d.deal_id),
      positionId: String(d.deal?.position_id || d.position_id),
      instrument: d.deal?.instrument || d.instrument,
      direction: d.deal?.direction || d.direction,
      volume: parseFloat(d.deal?.volume || d.volume || "0"),
      price: parseFloat(d.deal?.price || d.price || "0"),
      profit: parseFloat(d.deal?.profit || d.profit || "0"),
      commission: parseFloat(d.deal?.commission || d.commission || "0"),
      swap: parseFloat(d.deal?.swap || d.swap || "0"),
      eventTime: d.event_time || new Date().toISOString(),
    }));
  }

  /**
   * Generates realistic simulated candles for sandbox testing without network calls.
   */
  private generateSimulatedCandles(instrument: string, timeframe: string, count: number): ExnessCandle[] {
    const candles: ExnessCandle[] = [];
    const basePrice = instrument === "EURUSD" ? 1.10250 : instrument === "GBPJPY" ? 210.500 : instrument === "XAUUSD" ? 2400.00 : 31.500;
    const tfMinutes = timeframe === "M1" ? 1 : timeframe === "M5" ? 5 : timeframe === "M15" ? 15 : timeframe === "M30" ? 30 : timeframe === "H1" ? 60 : timeframe === "H4" ? 240 : 1440;

    let curPrice = basePrice;
    const nowMs = Date.now();

    for (let i = count; i >= 1; i--) {
      const candleTime = new Date(nowMs - i * tfMinutes * 60 * 1000).toISOString();
      const drift = (Math.sin(i * 0.15) * 0.001) + ((Math.random() - 0.49) * 0.0005);
      const open = curPrice;
      const close = curPrice + drift;
      const high = Math.max(open, close) + Math.random() * 0.0004;
      const low = Math.min(open, close) - Math.random() * 0.0004;
      curPrice = close;

      const dec = instrument.includes("JPY") ? 3 : instrument.includes("XAU") ? 2 : instrument.includes("XAG") ? 3 : 5;
      candles.push({
        t: candleTime,
        o: Number(open.toFixed(dec)),
        h: Number(high.toFixed(dec)),
        l: Number(low.toFixed(dec)),
        c: Number(close.toFixed(dec)),
        v: Math.round(100 + Math.random() * 500),
      });
    }

    return candles;
  }
}
