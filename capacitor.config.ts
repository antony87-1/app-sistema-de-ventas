import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pe.kankachosvaleriano.app',
  appName: 'Kankachos Valeriano',
  webDir: 'dist/kankachos-valeriano/browser',
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
      },
    },
  },
};

export default config;
