import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { spawn } from "child_process";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Gemini API Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Capital.com Configuration
const CAPITAL_API_KEY = process.env.CAPITAL_API_KEY || "e0o59JYjc0VLlQay";
const CAPITAL_EMAIL = process.env.CAPITAL_EMAIL || "betfintech@gmail.com";
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD || "Bios@2003";
const CAPITAL_REST_URL = "https://api-capital.backend-capital.com/api/v1";

const EPICS: Record<string, string> = {
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
};

// ... existing code ...
