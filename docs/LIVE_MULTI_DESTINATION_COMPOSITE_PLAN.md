# Simultaneous Live Destinations + Camera/Screen Composite

## Goal

Allow one host session to broadcast the same show to:

- S.M.U.V.E Live (native WebRTC room)
- Twitch
- Kick
- Facebook Live
- future providers with an RTMP ingest or a supported OAuth/API

At the same time, allow the host to show the camera and the shared screen in one
picture, with the screen as the primary frame and the camera as a movable
picture-in-picture (PiP) inset. Audio remains the existing mic + system-audio
mix.

This document is an implementation plan, not a description of current
behaviour.

## Current constraints

The current path is intentionally single-destination and single-source:

- `live_streams` has one active row per host. `startLiveStream()` ends every
  other active row before issuing a new one.
- The client has one `LiveStreamService.currentStream()`, one platform value,
  one share token, and one presence platform.
- `BroadcastIngestService` owns one `relayId`, one `WhipPublisher`, one WHIP
  peer connection, and one relay session.
- The native S.M.U.V.E WebRTC mesh has one video track. It reserves both
  `camera` and `game` m-lines, but the unused slot is a disabled clone, not a
  second picture.
- `SocialNetworkingService.videoSource()` is either `camera` or `screen`.
  Switching sources replaces the video track.
- Audio already supports multiple tracks: mic and system audio are separate
  roles and are mixed for the WHIP/RTMP push.

## Target model

### One broadcast session, many destinations

Keep one share link and one viewer-facing broadcast identity. Destinations are
children of that session.

```text
live_streams
  id
  share_token          <- one viewer link
  host_id
  host_display_name
  game_id
  lobby_id
  payload
  active
  started_at
  ended_at
  viewer_joins
  primary_platform     <- for old clients / display fallback

live_stream_destinations
  id
  live_stream_id
  platform             <- smuve | twitch | kick | facebook | youtube | ...
  transport            <- native | oauth | manual
  status               <- pending | connecting | live | degraded | ended | failed
  relay_id             <- nullable; one relay output, not the whole session
  display_name
  error
  started_at
  ended_at
```

`live_stream_destinations` is preferable to a JSON blob because each
destination needs independent retry, status, errors, and shutdown.

Backwards compatibility:

- A single-platform request creates one destination row.
- `live_streams.platform` remains populated with the primary destination so
  old clients and existing DB rows keep working.
- The wire response adds `destinations: [...]` and `platforms: [...]`, while
  retaining `platform` for one release.
- `getCurrentLiveStream()` returns the session with its destination array.

### API changes

```text
POST /api/users/:userId/live-streams
{
  "destinations": [
    { "platform": "smuve" },
    { "platform": "twitch" },
    { "platform": "kick" },
    { "platform": "facebook" }
  ],
  "gameId": "...",
  "lobbyId": "...",
  "payload": { ... }
}
```

The server validates every destination before issuing the session:

- `smuve`: always available.
- `twitch`: linked Twitch account and a usable stream key.
- `kick` / `facebook`: a saved manual RTMP URL and sealed stream key.
- Unsupported or unconfigured destinations fail with a destination-specific
  error; they do not silently disappear.

Additional routes:

```text
POST /api/users/:userId/live-streams/:streamId/destinations/:platform/retry
POST /api/users/:userId/live-streams/:streamId/destinations/:platform/end
POST /api/users/:userId/live-streams/:streamId/end
GET  /api/users/:userId/live-streams/:streamId/status
```

Ending the whole session ends every destination. Ending one destination leaves
the session and share link active while another destination is still live.

Presence and directory:

- Keep one `liveShareToken` and one host entry.
- Add `livePlatforms: string[]`; keep `livePlatform` as the primary destination
  for existing viewers.
- The viewer room remains the same native S.M.U.V.E room; provider-only
  sessions still use the native share page as the lobby/landing page.

## Transport architecture

### Preferred: one browser upload, relay fan-out

The browser should publish one WHIP stream to the media relay. The relay opens
one RTMP output per provider destination.

```text
Browser capture
  -> one WHIP publish
  -> relay ingress
       -> ffmpeg output: Twitch RTMP
       -> ffmpeg output: Kick RTMP
       -> ffmpeg output: Facebook RTMP
       -> optional recording
```

Why:

- One encode/upload from the browser.
- One `WhipPublisher` and one relay session lifecycle.
- Independent RTMP outputs can fail and restart without touching the browser.
- The relay already owns the stream keys and provider destinations, so keys
  never reach the browser.

Relay contract:

```text
POST /sessions
{
  "destinations": [
    { "platform": "twitch",  "rtmpUrl": "...", "streamKey": "..." },
    { "platform": "kick",    "rtmpUrl": "...", "streamKey": "..." },
    { "platform": "facebook","rtmpUrl": "...", "streamKey": "..." }
  ]
}
-> { "id": "...", "whipUrl": "..." }

GET /sessions/:id
-> {
     "running": true,
     "destinations": [
       { "platform": "twitch", "running": true, "bytesOut": 123, "stalled": false },
       { "platform": "kick", "running": false, "error": "..." }
     ]
   }
```

The relay must restart only the failed output. A single failed provider must
not tear down the WHIP ingress, the recording, or the other outputs.

If relay fan-out cannot be delivered in one release, the fallback is one WHIP
session per provider. That is explicitly a temporary fallback: it multiplies
browser encoding/upload and makes independent failure handling harder.

### Native S.M.U.V.E Live alongside provider outputs

The native room does not use the relay. The same capture is sent through the
existing host WebRTC mesh while the relay receives the WHIP publish.

```text
capture
  -> native host peers (WebRTC)
  -> relay WHIP (Twitch/Kick/Facebook)
```

This requires no media duplication in the browser, only one session and one
destination-state coordinator.

## Camera + screen composite

### Capture model

Introduce a `LiveCaptureCompositor` service owned by the app shell (not by a
single component). It owns the raw tracks and produces one stable output
stream.

```text
raw screen video  ─┐
raw camera video  ─┼─> canvas render loop ─> composite video track
raw mic audio     ─┤
raw system audio  ─┘─> passed through unchanged
```

The output `MediaStream` contains:

- one composite video track (screen + camera PiP)
- the existing mic audio track(s)
- the existing system audio track(s)

### Layout

Add a host layout signal:

```ts
type LiveVideoLayout = 'camera' | 'screen' | 'camera-pip';
```

- `camera`: existing camera-only path.
- `screen`: existing screen-only path.
- `camera-pip`: screen fills the frame, camera is drawn in a user-selectable
  inset.

Initial PiP controls:

- corner: top-left, top-right, bottom-left, bottom-right
- size: 20%, 28%, 36% of frame width
- mirrored camera: on/off
- safe-area padding for platform UI

Do not add a full scene editor in the first release.

### Rendering

Use a dedicated canvas at the selected stream resolution:

- default 1280x720 at 30 fps
- optional 1920x1080 at 30 fps where the device can sustain it
- draw screen video with `object-fit: cover` or `contain` according to the
  selected output aspect ratio
- draw camera as a clipped rounded rectangle with a border/shadow
- draw only when both source tracks are ready; show the existing preview error
  state while waiting
- stop the render loop when the stream ends or the page is hidden
- release raw tracks, canvas, and `captureStream` tracks on teardown

Use `canvas.captureStream(30)` for the composite track. Keep the raw tracks
alive while the layout can switch back; stop them only when leaving the
broadcast or changing source.

### Integration with existing services

`SocialNetworkingService` should expose:

- `videoLayout` signal
- `setVideoLayout(layout)`
- `localStream()` returning the composite stream when `camera-pip` is active
- source switches that rebuild the composite without re-prompting for
  permissions when both raw tracks are already available

`LiveVideoService` host slots:

- Send the composite video track in the `camera` slot.
- Keep the `game` slot silent, or send the same composite track if the viewer
  UI needs both m-lines populated.
- Keep `mic` and `system` audio slots unchanged.
- Announce `videoLayout: 'camera-pip'` in the host source metadata so viewer
  controls can hide CAM/GAME switching while the composite is active.

`WhipPublisher` receives the same composite `MediaStream`; it does not need to
know how many source tracks were combined. Its existing audio mixing remains
unchanged.

## Client session coordinator

Replace the single-destination assumptions in `LiveStreamService` with a
`LiveBroadcastSession` shape:

```ts
interface LiveDestinationState {
  platform: GoLivePlatform;
  status: 'pending' | 'connecting' | 'live' | 'degraded' | 'failed' | 'ended';
  relayId?: string;
  error?: string;
}

interface LiveBroadcastSession {
  stream: LiveStreamRecord;
  destinations: LiveDestinationState[];
}
```

`golive()` sequence:

1. Validate the selected destination set before touching capture.
2. Prime the audio context from the click.
3. Issue one server session with all destinations.
4. Start or reuse the preview capture.
5. Start native hosting if `smuve` is selected.
6. Start one relay publish if any provider destination is selected.
7. Mark each destination live as its transport reports ready.
8. Copy the single share link.

Failure rules:

- No destination starts: roll back the row, stop capture, release relay, show
  an actionable error.
- Native starts but a provider fails: keep the native room and successful
  providers live; mark only the failed destination failed.
- Provider starts but native fails: keep provider outputs and the share link;
  show a native-room warning.
- One provider stops: leave the session and other destinations running.
- Master STOP: stop native, WHIP, relay outputs, capture, and mark the row
  ended once.

`resumeBroadcastHere()` and reload recovery must restore every destination,
not just the first one.

## UI

Tha Spot and the Lab should share the same destination model:

- A multi-select destination picker, not a single platform chip.
- Per-destination status rows: `CONNECTED`, `LIVE`, `RETRYING`, `FAILED`,
  `ENDED`.
- A retry control per failed destination.
- A single `END BROADCAST` control.
- A share link that remains valid while any destination is live.
- Manual RTMP forms for Kick and Facebook in Broadcast Push.
- A layout control in preview: `CAMERA`, `SCREEN`, `CAM + SCREEN`.
- A small PiP position/size control in the preview panel.

The existing `StreamingPlatformsService` list should remain the account-level
inventory. Broadcast destinations and linked accounts are related but not the
same thing; do not make a manual RTMP destination look like an OAuth connection.

## Persistence and migration

Add a migration that:

1. Creates `live_stream_destinations` with a foreign key to `live_streams`.
2. Backfills one destination row for every existing row:
   `platform = live_streams.platform`, `transport = native` for `smuve`,
   `oauth` for `twitch`, `manual` for `kick`/`facebook`, `status = ended` for
   inactive rows and `live` for active rows.
3. Adds `primary_platform` to `live_streams` or keeps `platform` as the
   compatibility field.
4. Adds indexes on `(live_stream_id, status)` and `(relay_id)`.
5. Does not delete or rewrite existing stream tokens or viewer joins.

No migration is needed for the Facebook manual destination itself: the existing
`streaming_destinations` table uses a varchar platform column. Add `facebook`
to the validation union and destination API.

## Relay work

The relay needs a new internal destination interface:

- `POST /sessions` accepts an array of destinations.
- It starts one ffmpeg process per destination.
- It reports per-destination egress bytes, stalls, restarts, and final errors.
- It keeps one recording per session, not one per destination.
- It closes all child processes when the session is deleted.
- It enforces a small maximum destination count (for example 4) and per-account
  rate limits.
- It never logs stream keys or full RTMP URLs.

The API server remains the only component that resolves provider credentials.
The relay receives only the resolved RTMP URL/key over the private relay
connection.

## Testing plan

### Unit tests

- One session with four destinations creates four destination rows.
- Unsupported destination rejects the whole request before capture.
- A manual destination with a malformed URL/key fails only that destination.
- Ending one destination leaves the others and the share token active.
- Master end closes all destinations and marks the session ended.
- Reload/resume restores every destination and does not start duplicate pushes.
- Native + provider start failure combinations follow the failure matrix above.

### Composite tests

- `camera-pip` output has one video track and the expected audio tracks.
- Layout changes do not re-prompt for already-held tracks.
- Screen and camera raw tracks stop on teardown.
- Missing camera or screen leaves a visible warning and does not silently fall
  back to a black frame.
- PiP placement respects all four corners and safe areas at 720p/1080p.
- Screen-only and camera-only remain unchanged.

### Integration / e2e

- Twitch + Kick + Facebook + S.M.U.V.E starts from one session.
- One relay output is killed; the other outputs and native room survive.
- One provider retry restores only that provider.
- Viewer opens the single share link and receives the native room.
- Camera + screen preview then GO LIVE uses the composite without a second
  permission prompt.
- End broadcast releases camera, screen, mic, WHIP, relay, and native peers.

## Rollout phases

### Phase 1 — session and destination state

- Add destination table and migration.
- Add multi-destination API and compatibility response.
- Update client session coordinator and UI.
- Keep the relay single-output for now; allow multiple rows but only one
  provider output.
- Ship behind a feature flag if desired.

### Phase 2 — relay fan-out

- Add multi-destination relay contract.
- Add per-destination watchdog and retry.
- Enable Twitch + Kick + Facebook simultaneously.
- Add native + provider simultaneous path.

### Phase 3 — composite capture

- Add `LiveCaptureCompositor`.
- Add `camera-pip` layout and preview controls.
- Send the composite through native and provider paths.
- Add device-performance guards and mobile fallback.

### Phase 4 — hardening

- Reconnect matrix, tab visibility, network changes, token expiry.
- Per-destination analytics and error reporting.
- Load tests with four destinations and eight native viewers.
- Document provider policy limits and account requirements.

## Acceptance criteria

- One host session can be live on S.M.U.V.E, Twitch, Kick, and Facebook at the
  same time, with one share link.
- A failure on one destination does not stop the others.
- Camera + screen appear in one composite frame with mic and system audio.
- The host can switch layouts without re-prompting for permissions.
- Stopping the session releases every media and relay resource.
- Existing single-platform sessions and share links continue to work.

## Open decisions

- Whether relay fan-out is implemented in the existing relay or a separate
  egress worker.
- Whether native S.M.U.V.E is always included when a provider is selected, or
  opt-in per session.
- Whether PiP layout is persisted per host or per broadcast.
- Maximum destinations and maximum native viewers per host.
- Mobile support for simultaneous camera + screen capture and composite
  encoding.
