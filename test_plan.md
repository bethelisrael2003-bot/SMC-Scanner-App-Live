# Plan Outline
1. Set up capacitor.config.ts with appId, appName, and server.url pointing to https://smc-scanner-backend.onrender.com.
2. Setup App.tsx or main.tsx to request push permissions, register device, and POST to /api/device/register.
3. Save google-services.json to android/app/google-services.json.
4. Update server.ts with /api/device/register endpoint, initialize firebase-admin SDK, and send push notifications in recordSignalIfNeeded().
5. Run Android APK release build as a verification step.
