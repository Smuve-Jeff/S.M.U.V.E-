# S.M.U.V.E. 2.0 — Desktop (Electron) Deployment

Electron target for the S.M.U.V.E. 2.0 web build, using the Capacitor Electron
platform (`@capacitor-community/electron`). The same `Build/browser` output that
feeds the PWA and the Android AAB is wrapped in Chromium for Windows / macOS /
Linux.

## Architecture

- **One web build, three targets**: `ng build` → `Build/browser` → Web/PWA,
  Android (Capacitor), and Electron.
- `electron/` is a generated Capacitor platform project. Keep the root
  `capacitor.config.ts` as the source of truth and re-run `cap copy` / `cap sync`
  after edits — the CLI re-copies the web build and config into `electron/`.
- `electron/app/` holds the copied web build (gitignored). `electron/src/` holds
  the Node main process (`index.ts`), the window/splash/tray setup (`setup.ts`),
  and the preload script.
- Electron bundles Chromium, so Web Audio / AudioWorklet / WASM (ONNX stem
  separation) and Web MIDI behave identically to Chrome — no system-webview drift.

## Prerequisites

- Node 22+ (matches the web build `engines.node`)
- A desktop session (the shell is a GUI app)

## Development

```bash
npm install --legacy-peer-deps             # once (root)
cd electron && npm install                 # once (downloads the Electron binary)
npm run build                              # Angular web bundle -> Build/browser
npm run cap:copy:electron                  # Build/browser -> electron/app
cd electron && npm run electron:start      # launch the shell (tsc + electron)
```

Or use the root convenience script (build + copy + launch):

```bash
npm run electron:start
```

## Packaging & release

From `electron/`:

```bash
npm run electron:pack   # unpacked app in electron/dist/ (electron-builder --dir)
npm run electron:make   # platform installers (NSIS .exe / .dmg)
```

- electron-builder config: `electron/electron-builder.config.json` — appId
  `com.smuve.smuve2`, mac category `public.app-category.music`, GitHub publish
  provider for `electron-updater`.
- `electron-updater` (`autoUpdater.checkForUpdatesAndNotify()`) is wired in
  `electron/src/index.ts`; configure a GitHub release feed before relying on it.
- The template pins Electron v26 via `@capacitor-community/electron@5`; bump
  Electron + `electron-builder` to current releases before the first public build.

## Security notes

- CSP is applied via `setupContentSecurityPolicy()` in `electron/src/setup.ts`.
- External `http(s)` links (Tha Spot game cabinets, docs) are handed to the system
  browser through `shell.openExternal`; the app scheme stays in-app and other
  schemes are denied.

See `docs/CAPACITOR_PLUGIN_AUDIT.md` for the cross-target native capability map.
