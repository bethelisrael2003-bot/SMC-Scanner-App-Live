import { useEffect } from "react";
import { ApexQuantApp } from "./components/v2/ApexQuantApp";
import { PushNotifications } from "@capacitor/push-notifications";

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://smc-scanner-backend.onrender.com";

// ── Native Push & Notification Channel Setup ─────────────────────────────────
async function setupPush() {
  try {
    const isNative = typeof window !== "undefined" && (window as any).Capacitor && typeof (window as any).Capacitor.isNativePlatform === "function" && (window as any).Capacitor.isNativePlatform();
    if (!isNative) return;

    // Create high-importance Android channel for signals
    try {
      await PushNotifications.createChannel({
        id: "signals",
        name: "Trading Signals & Alerts",
        description: "Real-time Apex SMC trading signals, break-even alerts, and execution orders",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
        lights: true,
      });
    } catch (e) {
      console.warn("Channel creation error:", e);
    }

    // Attach listeners BEFORE registering to avoid race conditions
    await PushNotifications.removeAllListeners();

    PushNotifications.addListener("registration", (token) => {
      console.log("[PUSH] Native device token registered:", token.value);
      fetch(`${API_BASE_URL}/api/device/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.value }),
      }).catch((err) => console.error("[PUSH] Failed to register token with server:", err));
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("[PUSH] Registration failed:", err);
    });

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (err) {
    console.error("Push error:", err);
  }
}

export default function App() {
  useEffect(() => {
    setupPush();
    // Enforce Apex Institutional Pro mode in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("smc_ui_version", "v2");
    }
  }, []);

  return <ApexQuantApp onSwitchToClassic={() => {}} />;
}
