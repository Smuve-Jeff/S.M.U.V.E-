# Missing Streaming Platforms — Implementation Plan

## Baseline

The multi-destination path is now real:

- One `live_streams` row owns the session and share token.
- `live_stream_destinations` stores one row per selected platform.
- Native S.M.U.V.E Live is one destination; Twitch, Kick, and Facebook are
  provider destinations.
- The browser publishes one WHIP stream; the relay starts one ffmpeg process
  with the `tee` muxer and sends the provider subset to every RTMP ingest.
- `BroadcastIngestService.start()` accepts one platform or an array.
- The Go Live pickers select multiple destinations.
- `camera-pip` composites screen + camera into one video track for preview,
  native hosting, and provider pushes.
- Per-output retry inside `tee` is still a follow-up: a process failure closes
  the whole relay session.

## Capability matrix

| Platform    | OAuth          | Broadcast today            | Actual blocker                                                           |
| ----------- | -------------- | -------------------------- | ------------------------------------------------------------------------ |
| Twitch      | Yes            | Yes                        | None                                                                     |
| Kick        | No             | Yes, manual RTMP URL + key | None                                                                     |
| Facebook    | No             | Yes, manual RTMP URL + key | None                                                                     |
| YouTube     | Read-only link | No                         | Grant has no live scopes; no liveBroadcast/liveStream creation           |
| TikTok      | No             | No                         | Public Live API is partner/allowlist only                                |
| Instagram   | No             | No                         | No public live-create API; Live Producer gives a per-stream RTMP URL/key |
| X           | No             | No                         | Live producer API is partner-only; no self-serve RTMP API                |
| Discord     | No             | No                         | Discord Go Live is client WebRTC, not an RTMP ingest                     |
| LinkedIn    | No             | No                         | Live API is partner-only                                                 |
| Custom RTMP | No             | No                         | No generic destination row yet                                           |

Two decisions should stay explicit:

1. **Do not fake a platform.** A platform is a Go Live destination only when
   the server can resolve a real ingest URL, or the host has supplied one.
2. **A manual RTMP destination is a valid first implementation.** It gives
   hosts a working path today and does not claim an integration that the
   platform does not offer.

## Shared work (do this before any provider adapter)

### 1. Provider adapter contract

Add `src/services/streaming-destination-resolver.ts` with one interface:

```ts
export interface StreamingDestinationResolver {
  readonly platform: StreamingPlatform;
  readonly requiresOAuth: boolean;
  resolve(userId: number): Promise<{
    rtmpUrl: string;
    streamKey: string;
    displayName?: string;
  }>;
}
```

`startIngestSession()` should call resolvers through a registry rather than an
if/else on platform names. Twitch moves behind the same interface; Kick and
Facebook become manual resolver implementations. This is the seam that keeps
the relay, API, and client unaware of provider-specific APIs.

### 2. Destination data model

Extend `streaming_destinations` with:

- `provider` (`twitch`, `youtube`, `kick`, `facebook`, `instagram`, `tiktok`,
  `x`, `custom`) — the credential source.
- `label` — what the host sees, e.g. `TikTok (RTMP)`.
- `rtmp_url`, `stream_key_ciphertext` for manual destinations.
- `remote_id` — YouTube liveStream/broadcast id, provider media id, etc.
- `expires_at` — for provider-issued ingest URLs.
- `capabilities` — JSON for provider quirks (supports 1080p, requires a
  scheduled broadcast, etc.).

Keep `live_stream_destinations` as the per-session snapshot: platform, status,
relay id, error. Do not store tokens there.

### 3. Token lifecycle

`StreamingAccount` already seals tokens. Add a single refresh helper used by
all adapters:

- Refresh when `expiresAt - now < 5 minutes`.
- Persist the refreshed grant and update `lastSyncedAt`.
- On `invalid_grant`, delete the account and surface `CONNECT … AGAIN` instead
  of retrying with a dead token.
- Never return a provider token to the browser.

### 4. Relay per-output health

`tee` is one process, so one dead provider currently kills every output. Add:

- Start ffmpeg with `-map 0 -f tee "[f=flv]…|[f=flv]…"` (already fixed).
- Parse ffmpeg stderr for per-output failures where available.
- On a process failure, restart with only the outputs that were healthy for the
  longest window; mark the failed destination `failed` in
  `live_stream_destinations`.
- Keep native S.M.U.V.E Live and the remaining providers live while one
  provider is retried.
- Test with two MediaMTX sinks, one of which is stopped mid-push.

### 5. UI capability model

Drive the pickers from server capabilities, not from a hard-coded list:

- `broadcast: true` → selectable destination.
- `connectable: true` → show Connect; otherwise show the manual RTMP editor.
- `broadcast: false, connectable: true` → account linking only (YouTube today).
- Per-destination status chip: pending, connecting, live, degraded, failed,
  ended.
- A `CUSTOM RTMP` destination with a label, URL, and key is the escape hatch
  for platforms whose API is partner-only.

## Platform plans

### YouTube — medium effort, highest value

Current state: OAuth exists, but the scope is
`https://www.googleapis.com/auth/youtube.readonly`. That cannot create a
broadcast or a stream.

Steps:

1. Change the scope to
   `https://www.googleapis.com/auth/youtube.force-ssl` (and keep `openid email
profile`). This requires Google OAuth app verification; document the review
   evidence and privacy policy.
2. Implement `YoutubeDestinationResolver.resolve(userId)`:
   - Refresh the Google token.
   - `POST https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status`
     with `snippet.title`, `snippet.scheduledStartTime`, and
     `status.privacyStatus`. A broadcast cannot be created without those.
   - `POST https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn`
     with `snippet.title`, `cdn.ingestionType = "rtmp"`, `cdn.resolution`, and
     `cdn.frameRate` (for example `"720p"` and `"30fps"`).
   - Read `cdn.ingestionInfo.ingestionAddress` and
     `cdn.ingestionInfo.streamName`; join them with the existing `pushUrl()`
     helper. Store the liveStream id in `remote_id`.
   - `POST …/liveBroadcasts/bind?id=<broadcastId>&streamId=<streamId>&part=id,contentDetails`.
   - `POST …/liveBroadcasts/transition?broadcastStatus=live&id=<broadcastId>&part=status`
     only after the relay reports egress, or create the broadcast with
     auto-start enabled and let YouTube transition when bytes arrive.
   - On stop, transition to `complete`, then delete the liveStream if it was
     temporary.
3. Handle quota errors (`quotaExceeded`) with a clear message and do not leave
   a half-created broadcast. Create the stream and broadcast in a single
   try/catch and clean up the stream on failure.
4. Add a “YouTube” picker entry only when the grant has the live scope. A
   read-only grant should show “RECONNECT FOR LIVE” rather than a dead
   destination.
5. Test with a dedicated test channel, then a private broadcast, before public.

Risks: Google verification, quota, and the difference between a scheduled
broadcast and an instant one. Start with instant/private broadcasts.

### Instagram — manual RTMP, no public live-create API

Instagram’s Graph API exposes `GET /{ig-user-id}/live_media` for reading live
media, but it does **not** support creating a live broadcast. Live Producer on
instagram.com generates a short-lived RTMP URL and stream key per broadcast,
and those are the only supported third-party ingest path.

Plan:

1. Do not build a fake OAuth live flow. Add `INSTAGRAM (RTMP)` as a manual
   destination with clear copy: “Open Instagram on desktop → Create → Live
   video → copy the URL and key.”
2. Instagram requires a professional account and desktop Live Producer. Show
   that requirement next to the destination.
3. The stream key is per-broadcast and expires when the broadcast ends, so
   never persist it longer than the session; clear it on stop.
4. If Meta later exposes a live-create endpoint, add an adapter behind the
   resolver interface without changing the relay, API, or picker.
5. Test the manual path with a practice broadcast before a public one.

Risks: Live Producer is limited-access and account-dependent; the UI must not
promise universal availability.

### TikTok — large effort, partner access

There is no generally available self-serve RTMP ingest API for third-party
apps. TikTok Live Studio and the Live API are gated behind partner approval.

Plan:

1. Apply for TikTok Live API access with the product's use case and privacy
   documentation. Until approved, do not show TikTok as a one-click
   destination.
2. Ship `TIKTOK (RTMP)` as a manual destination immediately: the host pastes
   the RTMP URL and stream key from TikTok Live Studio. Reuse the Kick/Facebook
   manual resolver and validation.
3. If partner access is granted, implement the provider adapter with the
   approved endpoints and scopes. Keep the manual path as a fallback because
   creator eligibility varies by region and follower count.
4. Test in the partner sandbox; never ship a destination that only works for
   internal accounts.

### X — not self-serve

X’s live producer API is partner-only. Do not promise a native integration.

Plan:

1. Add X to the UI as a manual RTMP destination when the host has a producer
   endpoint.
2. If a partnership is available, implement it as a normal resolver behind the
   same interface; the relay and client need no changes.
3. Otherwise show “X LIVE REQUIRES A PRODUCER ACCOUNT — USE CUSTOM RTMP”.

### Discord — not an RTMP destination

Discord Go Live is a client-side WebRTC screen share, not an ingest URL.
Relaying it would mean running a Discord voice bot, which is a different
product with different permissions and quality characteristics.

Plan:

1. Do not add Discord to the Go Live destination picker.
2. Add a Discord webhook notification (“NOVA IS LIVE — <share link>”) as a
   separate integration if the host wants their server notified.
3. If voice streaming is ever required, scope it as a separate bot project;
   do not mix it into the broadcast relay.

### LinkedIn — partner-only

LinkedIn Live requires partner access. Treat it like X: manual RTMP when the
host has an endpoint, native resolver only after partner approval.

### Custom RTMP — small effort, ship first

This is the highest-leverage missing feature.

1. Add a `custom` destination with `label`, `rtmpUrl`, and `streamKey`.
2. Validate with the relay’s existing `validateDestination()` rules and reject
   tee separators, credentials, and non-RTMP schemes.
3. Store the key sealed; never echo it after save.
4. Show it in both pickers as `CUSTOM RTMP`.
5. Surface it for YouTube/TikTok/X/LinkedIn when the host has a URL but the
   provider API is unavailable.

This gives every partner-gated platform a working path without pretending the
API exists.

## API and client changes

- `GET /api/broadcast/destinations` returns capability + readiness per
  platform, including `label` and `manual`.
- `PUT /api/broadcast/destinations/:platform` accepts `rtmpUrl`, `streamKey`,
  and optional `label` for manual/custom entries.
- `POST /api/broadcast/ingest` keeps `{ platforms }`; add resolved display
  names in the response for the status UI.
- `PATCH /api/users/:userId/live-streams/destinations` validates status values
  and only updates the caller’s active session.
- The client never receives a stream key or provider token.

## Test plan

For each new resolver:

1. Unit test with mocked `fetch`: success, expired token refresh, revoked
   grant, provider 4xx/5xx, missing ingest URL.
2. Contract test for the exact request body and returned URL/key join.
3. Relay fan-out test with two local MediaMTX sinks (already present).
4. Failure test: kill one sink and verify the other keeps receiving while the
   failed destination reports `failed`.
5. Sandbox test with a real provider account; record the account type and
   region because eligibility changes.

## Suggested order

1. Custom RTMP + capability-driven picker (small, unblocks every partner-only
   platform).
2. Relay per-output recovery and status persistence (medium, improves all
   providers).
3. YouTube live scopes and resolver (medium, clear API, highest demand).
4. Instagram manual Live Producer destination (small; no public create API).
5. TikTok partner application; ship manual RTMP while waiting.
6. X/LinkedIn/Discord: document as manual or unsupported unless a partnership
   exists.

## Acceptance criteria

- A host can select native S.M.U.V.E Live + any subset of supported providers
  and start one session.
- Each destination has an independent visible status.
- One provider failing does not stop native hosting or the other providers.
- No stream key or OAuth token reaches the browser.
- Every destination listed as `broadcast: true` has a real, tested ingest path.
- Platforms without a public ingest API are shown as manual or not listed,
  never as a broken one-click button.
