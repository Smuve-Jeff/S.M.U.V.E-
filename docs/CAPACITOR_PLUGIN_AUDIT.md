# S.M.U.V.E. 2.0 — Capacitor Plugin Audit

The app currently uses **no Capacitor plugins**: every native capability goes
through a web-platform API in `src/app/services/*`. This maps each capability to
what works (and what does not) on each target, and lists the plugins to add
before shipping Android/Electron builds.

## Current web-API usage (source of truth today)

| Capability | Service(s) | Web API today | Android WebView | Electron (Chromium) | Web (PWA) |
| --- | --- | --- | --- | --- | --- |
| Mic capture / WebRTC voice | `microphone.service.ts`, `peer-networking.service.ts`, `social-networking.service.ts` | `getUserMedia` | ✅ (RECORD_AUDIO permission added) | ✅ (system prompt) | ✅ (HTTPS) |
| Audio device enumeration | `hardware.service.ts`, `microphone.service.ts` | `enumerateDevices` | ✅ | ✅ | ✅ |
| MIDI I/O | `hardware.service.ts`, `dj-midi.service.ts` | `navigator.requestMIDIAccess` | ❌ Web MIDI unsupported in WebView | ✅ | Chrome/Edge ✅, Safari ⚠️ |
| Haptics | `haptic.service.ts` | `navigator.vibrate` | ❌ no-op | ❌ no-op | Android Chrome ✅ |
| Permissions | `permission.service.ts` | `navigator.permissions.query` | ⚠️ partial | ✅ | ⚠️ |
| Gamepad | `gamepad.service.ts` | Gamepad API | ❌ not in WebView | ✅ | Chrome ✅ |
| File import | `file-loader.service.ts` | `<input type="file">` | ✅ | ✅ | ✅ |
| Export / download | `export.service.ts` | Blob + `createObjectURL` | ✅ | ✅ | ✅ |
| External links (game cabinets) | `tha-spot.component.ts` | `window.open(url, '_blank')` | ⚠️ unreliable — needs `@capacitor/browser` | ✅ (handled via `shell.openExternal`) | ✅ |

## Recommended plugins (priority order)

None are installed yet; the Electron platform itself is the only Capacitor
package in use.

1. **`@capacitor/splash-screen` + `@capacitor/status-bar`** — already referenced
   in `capacitor.config.ts` (`plugins.SplashScreen`, `plugins.StatusBar`) but not
   installed. Install so the configured splash/status behavior actually applies.
2. **`@capacitor/haptics`** — replace `navigator.vibrate` (a no-op in Android
   WebView). Ships a web fallback, so Electron/PWA degrade gracefully.
3. **`@capacitor/preferences`** — durable key/value storage (WebView `localStorage`
   can be evicted under storage pressure). Web implementation = localStorage.
4. **`@capacitor/filesystem`** — real file read/write on Android (WebView has no
   File System Access API). Web implementation = IndexedDB; Electron can use
   Node `fs` for real paths.
5. **`@capacitor/browser`** — open game cabinets / docs in an in-app tab on
   Android, where `window.open` is unreliable. Desktop/web keep
   `window.open` / `shell.openExternal`.
6. **`@capacitor/app`** — `isNativePlatform()` / `getPlatform()` detection and
   lifecycle hooks shared across Android + Electron.
7. **`@capacitor/local-notifications`** — recording/foreground notifications on
   Android (matches the FOREGROUND_SERVICE permissions already in the manifest).

## Known gaps (no official plugin)

- **MIDI on Android** — Web MIDI is unavailable in Android WebView. Requires a
  community or custom native plugin; desktop and web (Chromium) already work.
- **Gamepad on Android** — the Gamepad API is not exposed in WebView. Desktop and
  Chromium web already work; a native plugin is needed for Android controllers.

## Electron support rule of thumb

`@capacitor-community/electron` runs any plugin that ships an **Electron or web
implementation** (and falls back to the web implementation automatically). The
official plugins above all qualify, so the same API calls work on Android and
Electron with no per-target branching.
