import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.omniforge.smcscanner',
  appName: 'SMC Scanner',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: 'https://smc-scanner-backend.onrender.com'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
