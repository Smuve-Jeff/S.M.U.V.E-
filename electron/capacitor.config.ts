/**
 * S.M.U.V.E. 2.0 — Capacitor 8 configuration
 *
 * This config is the source of truth for native Android wrapping of the PWA.
 * Capacitor 8 + Angular 21 PWA + Android Gradle Plugin 8.13 / Android 16 (API 36).
 *
 * After running `npx cap add android`, the `android/` directory is generated
 * ONCE and thereafter modified via `cap copy android` (never hand-author).
 *
 * See docs/PLAY_STORE_DEPLOY.md for the deployment checklist.
 *
 * Add to your project root as `capacitor.config.ts` (TypeScript variant).
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smuve.smuve2',
  appName: 'S.M.U.V.E.',
  webDir: 'Build/browser',
  server: {
    // Android scheme. The WebView exposes `capacitor://localhost` as the origin
    // for the bundled app. We mirror the dev server URL during development.
    androidScheme: 'https',
    // Android network inspector — useful in dev. Host the dev server on
    // 10.0.2.2 (AVD default) or your LAN IP from a USB-paired device.
    cleartext: true,
  },
  android: {
    backgroundColor: '#0E1014',
    webContentsDebuggingEnabled: false, // disable in release
    allowMixedContent: false,
    // Permissions live in android/app/src/main/AndroidManifest.xml
    // (Capacitor 8 removed the `android.permissions` config option).
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#0E1014',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#2BA09C',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0E1014',
    },
  },
};

export default config;
