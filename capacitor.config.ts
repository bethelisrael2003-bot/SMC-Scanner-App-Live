import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.omniforge.smcscanner',
  appName: 'SMC Scanner',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
