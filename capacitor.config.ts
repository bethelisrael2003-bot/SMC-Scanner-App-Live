import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.omniforge.smcscanner',
  appName: 'SMC Scanner',
  webDir: 'dist',
  server: {
    url: 'https://smc-scanner-backend.onrender.com/?v=2',
    cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
