# S.M.U.V.E. 2.0 — Sprint 0 Deployment Guide

End-to-end checklist for shipping the **S.M.U.V.E. 2.0** PWA as a native **Android
AAB** to the Google Play Store, plus the documentation needed for IAP, telemetry,
and AudioWorklet behavior under WebView.

This guide is intentionally exhaustive — it is the **single source of truth**
for the Android packaging pipeline. Follow it top-down.

---

## 0. Prerequisites

| Tool | Min version | Purpose |
| ---- | ----------- | ------- |
| Node | 22.12 (matches `engines.node` in package.json) | Build pipeline |
| npm | 10 | Package manager |
| JDK | 17 (Temurin / Zulu) | Android Gradle Plugin 8.x |
| Android SDK | API 34 (Android 14) | Target SDK |
| Android Build-Tools | 34.0.0 | aapt2, d8, zipalign |
| Gradle | 8.5 (Bundled — don't override) | Build orchestration |
| Ruby | 3.x (Optional) | fastlane (Play upload) |
| Docker | 24+ | Reproducible Emscripten builds (Sprint 3) |

Install Android cmdline-tools:

```bash
sdkmanager "platform-tools" "platforms;android-34" \
           "build-tools;34.0.0" "extras;google-play-services"
```

---

## 1. Capacitor scaffold (this PR)

```
npm install --legacy-peer-deps \
  @capacitor/core@^6 \
  @capacitor/android@^6 \
  onnxruntime-web@^1.19 \
  --save
npm install --save-dev @capacitor/cli@^6
```

`package.json` (this PR adds):

| Field | Value |
| ----- | ----- |
| `dependencies."@capacitor/core"` | `^6.0.0` |
| `dependencies."@capacitor/android"` | `^6.0.0` |
| `dependencies."onnxruntime-web"` | `^1.19.0` |
| `devDependencies."@capacitor/cli"` | `^6.0.0` |

`scripts`:

| Script | Command |
| ------ | ------- |
| `cap:init` | `cap init "S.M.U.V.E." com.smuve.smuve2 --web-dir=Build/browser` |
| `cap:add:android` | `cap add android` |
| `cap:sync` | `cap sync android` |
| `cap:open:android` | `cap open android` |
| `cap:copy:android` | `cap copy android` |
| `build:wasm` | `bash scripts/build-wasm.sh` |

## 2. Initialize the Capacitor project (one-time)

```
npm install --legacy-peer-deps
npm run cap:init
npm run cap:add:android
```

`cap add android` generates the entire `android/` tree (~80 files) using the
official Capacitor 6 template including AGP 8.x and Gradle 8.5. **Do not
hand-author** anything inside `android/` once generated; modify via
`capacitor.config.ts` and `MainActivity.java` overrides instead.

## 3. Required Android permissions (DAW-audited list)

A digital audio workstation on Android **must** request these at install-time
(`<uses-permission>`) or runtime (`requestPermissions`). They are catalogued here
because the PWA install prompt cannot grant them — Capacitor is required.

| Permission | Why a DAW needs it |
| ---------- | ------------------ |
| `android.permission.RECORD_AUDIO` | Studio recording engine, comp takes, vocal suite |
| `android.permission.MODIFY_AUDIO_SETTINGS` | Sample-rate negotiation, low-latency route |
| `android.permission.READ_MEDIA_AUDIO` | Sample imports on Android 13+ |
| `android.permission.READ_EXTERNAL_STORAGE` (maxSdk=28) | Legacy media access |
| `android.permission.WAKE_LOCK` | Keep audio engine alive across screen-off |
| `android.permission.FOREGROUND_SERVICE` | Recording background safety |
| `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Android 14 media-playback foreground type |
| `android.permission.POST_NOTIFICATIONS` (33+) | Persistent recording notifications |
| `android.permission.BLUETOOTH_CONNECT` (31+) | BLE MIDI controllers & audio interfaces |
| `com.google.android.gms.permission.AD_ID` | Crashlytics / RevenueCat attribution |

After `cap add android`, edit `android/app/src/main/AndroidManifest.xml` and add
the `<uses-permission>` lines above inside the existing `<manifest>` block.

## 4. Asset Links for Trusted Web Activity fallback

Users who first arrive from Play Store and *do not* have the WebView install can
fallback to PWA-TWA. Create
`android/app/src/main/assets/.well-known/assetlinks.json` with your SHA-256
fingerprint after the first signed build:

```bash
keytool -list -v -keystore release.keystore | grep SHA256
```

See **§8** for signing.

## 5. Play Console listing

Play Store metadata is curated in `docs/PLAY_STORE_LISTING.md`. The current hero
demo: 8-bar trap beat → 6-stem isolation → AI mix → master at -14 LUFS in under
60 seconds.

## 6. In-app purchase (Play Billing v6)

Add `cordova-plugin-purchase` or Capacitor's `@capacitor-community/purchase`
plugin. For the visual-led subscription model (monthly Pro tier + lifetime + sound
pack add-ons), Play Billing is mandatory on Play Store and **Apple will reject**
your app if you funnel through alternate payment rails on iOS — so plan ahead for
the Capacitor 7 iOS port.

Subscription ids:

| SKU | Tier |
| --- | ---- |
| `smuve_pro_monthly` | Monthly Pro |
| `smuve_pro_annual` | Annual Pro (12x monthly equivalent, 2 months free) |
| `smuve_pro_lifetime` | One-time lifetime |
| `smuve_pack_titanium_drums` | Sound pack SKU |

## 7. Crash telemetry

`npm install --save @sentry/capacitor @sentry/angular` then:

```ts
// app.config.ts APP_INITIALIZER
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: `com.smuve.smuve2@${VERSION}`,
  tracesSampleRate: 0.2,
});
```

Web Audio context failures, AudioWorklet load rejections, OfflineAudioContext
startRendering rejections → all auto-ingest.

## 8. Signing

Generate upload keystore ONCE and back it up. **Losing this key = losing your
Play Store identity.**

```
keytool -genkey -v -keystore upload.keystore \
  -alias smuve2_upload -keyalg RSA -keysize 2048 -validity 10000
```

Configure `~/.gradle/gradle.properties` with the keystore credentials, then
`gradlew bundleRelease` produces `Build/android/app-release.aab` ready for
Play Console upload.

## 9. COOP/COEP for in-WebView ONNX inference

When running inside Capacitor's WebView, **SharedArrayBuffer is available
without COOP/COEP**. The restrictions only apply when serving over HTTP (e.g. dev
preview). Document this for the S.M.U.V.E.-as-PWA case.

## 10. Push-to-Play checklist

```
[ ] npm run build
[ ] npm run cap:sync
[ ] cd android && ./gradlew bundleRelease
[ ] upload .aab via Play Console (automatic via fastlane recommended)
[ ] verify listing, expand first 5 store-locale screenshots
[ ] sighted smoke test: open listing, tap install, run through Studio
[ ] verify RECORD_AUDIO runtime grant flow
```

That's the entire Sprint 0 path — first Play Store install starts here.
