# Learnings: Multiplayer and Collaboration Deep Linking

- **Deep Linking in Angular:** Using `ActivatedRoute.queryParamMap.subscribe` in `ngOnInit` is essential for handling parameters that might arrive after the component has initialized or when navigating between routes that use the same component.
- **Clipboard API:** `navigator.clipboard.writeText` provides a standard way to copy URLs to the clipboard, but it requires a secure context (HTTPS or localhost) and user interaction.
- **Backend Error Handling:** Always check for missing function definitions in Node.js when adding new features, as it can lead to runtime crashes even if the syntax is valid.
- **Angular Signal Sync:** When using signals (like `selectedGame`), updating them based on query params ensures that the UI reactively opens the correct views (like the game preview overlay).
- **Authentication Resilience:** Verification that `authGuard` preserves query parameters (`returnUrl`) ensures that deep links work even for unauthenticated users after they log in.

# Learnings: Studio Vocal Capture & Audio Enhancement

- **Monitor vs. capture graphs:** A `MediaRecorder` bound to the raw `getUserMedia` stream silently bypasses every Web Audio insert (mic gain, pitch correction, vocal mastering). Tap the finished chain with a `MediaStreamAudioDestinationNode` instead, so takes capture exactly what the artist hears; fall back to the raw stream when no chain is attached.
- **Guard repeated fan-out taps:** `AudioNode.connect()` sums, so re-attaching the same chain node doubles the signal. Track the currently tapped node (and its AudioContext) and disconnect the previous feed before connecting a new one.
- **Hot-plugged interfaces:** Register a `devicechange` listener and preserve `selectedDeviceId` while it is still present, so unplugging a USB mic falls back cleanly instead of leaving a dead selection. Avoid prompting for permission on service construction; request labels only when the user actually primes the interface.
- **Never swap inputs mid-take:** Re-initializing a `MediaStream` while `MediaRecorder` runs truncates the take, so refuse the switch and expose `canSwitchDevice` to the UI.
- **Non-destructive enhancement:** Render MP3/WAV upgrades through an `OfflineAudioContext` (rumble filter → tone shaping → glue compression → true-peak normalize) into a separate `enhancedBuffer`, and keep the decoded original so "Restore Original" is always available.
- **Keep toggles truthful:** A noise-gate switch that only stores a flag is a lie; wire it into the live graph (gate `GainNode` between mic and capture destination, fast attack / slow release) and reorder the graph build so the very first take is already gated.
