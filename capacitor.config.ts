/**
 * S.M.U.V.E. 2.0 — Capacitor 6 configuration
 *
 * This config is the source of truth for native Android wrapping of the PWA.
 * Capacitor 6 + Angular 21 PWA + Android Gradle Plugin 8 / Android 14 (API 34).
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
  bundledWebRuntime: false,
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

    // ── Permissions block ────────────────────────────────────────
    // These translate to <uses-permission> lines in AndroidManifest.xml.
    // Final set is curated by docs/PLAY_STORE_DEPLOY.md §3.
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.BLUETOOTH_CONNECT',
      'com.google.android.gms.permission.AD_ID',
    ],
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
