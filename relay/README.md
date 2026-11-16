# S.M.U.V.E broadcast relay

Twitch and Kick accept RTMP(S). A browser cannot send it. This relay is the
missing hop:

```
browser ──WHIP (WebRTC)──▶ MediaMTX ──RTSP──▶ ffmpeg ──RTMP(S)──▶ Twitch / Kick
```

The S.M.U.V.E API decides the destination (Twitch's stream key over Helix, or
the Kick URL + key the host saved) and asks this relay to open a session. The
browser only ever receives a single-purpose WHIP URL; stream keys never leave
the server side.

## Control API

The API server's `MEDIA_RELAY_URL` points at this service. Contract:

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/sessions` | `{ rtmpUrl, streamKey }` | `201 { id, whipUrl }` |
| `DELETE` | `/sessions/:id` | — | `204` |
| `GET` | `/recordings` | — | `200 { retentionHours, recordings: [{ name, bytes, modifiedAt, durationSeconds, keepHours, keepUntil }] }`; `durationSeconds` comes from the file's own `mvhd`, so listing spawns nothing; `retentionHours` lets a caller say when an unpinned show goes; `503` when `RECORDING_DIR` is unset |
| `PUT` | `/recordings/:name/retention` | `{ "hours": 168 }` | keeps the file past the window for that many hours (max 2160, `0` clears it); answers `{ keepHours, keepUntil }` |
| `GET` | `/recordings/:name/thumbnail` | — | a 320 px JPEG frame from one second in, generated once and cached beside the recording as `<name>.jpg`; `404` without ffmpeg or for a file it cannot frame |
| `DELETE` | `/recordings/:name` | — | `204` after removing the file and its cached frame; `204` too when it was already gone, so a second press is harmless |
| `GET` | `/recordings/:name` | `Range: bytes=…` | the `video/mp4` file as an attachment; answers `206` with `Content-Range` for a byte range, `416` for one past the end; `404` for anything that is not a file in the volume |
| `GET` | `/health` | — | `200 { status: ok, mediamtx, sessions, stalled, recordingEnabled, recordingRetentionHours }`, or `503 { status: degraded }` when MediaMTX is unreachable; `recordingEnabled` says whether `RECORDING_DIR` is set at all, and `recordingRetentionHours` lets a caller notice a window change without listing every file |
| `GET` | `/sessions/:id` | — | `200 { ready, bytesReceived, tracks, bytesOut, bitrateKbps, drops, silentMs, recoveries, recovering, stalled, stalledForMs, recording, … }` |

Every route except `/health` requires `Authorization: Bearer $RELAY_TOKEN`.

`/health` probes MediaMTX rather than just reporting liveness: a relay that can
accept sessions but cannot reach its media server fails every publish, so it
answers `503` with `mediamtx: unreachable` instead of claiming to be fine. The
S.M.U.V.E API calls this at boot and refuses to start when a configured relay is
down or degraded, which is what catches the problem before a host goes live.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PUBLIC_RELAY_URL` | — (required) | Public https origin the browser publishes to, e.g. `https://relay.example.com` |
| `RELAY_TOKEN` | — | Bearer token for the control API; set the same value as the app's `MEDIA_RELAY_TOKEN` |
| `RELAY_PORT` | `8080` | Control API port |
| `MEDIAMTX_API_URL` | `http://127.0.0.1:9997` | MediaMTX control API |
| `MEDIAMTX_RTSP_URL` | `rtsp://127.0.0.1:8554` | Where ffmpeg pulls each session from |
| `FFMPEG_PATH` | `ffmpeg` | ffmpeg binary |
| `FFMPEG_MAX_RESTARTS` | `5` | Retries for an ffmpeg that exits before the publisher connects |
| `SESSION_TTL_MINUTES` | `360` | Age at which a session is closed |
| `SELFTEST_RTMP_URL` | — | RTMP sink the self-test pushes to; unset disables `/selftest` |
| `SELFTEST_STREAM_KEY` | `selftest` | Key/id used for the self-test sink |
| `SELFTEST_TTL_SECONDS` | `180` | How long a self-test session may stay open |
| `RELAY_STATE_FILE` | — | Where to keep session records for restart recovery; unset disables it |
| `RELAY_STATE_KEY` | — | Key that encrypts that file (required with `RELAY_STATE_FILE`) |
| `EGRESS_STALL_SECONDS` | `15` | Silence to the provider before a live session is alerted; `0` disables |
| `EGRESS_RECOVER_AFTER_SECONDS` | `45` | Silence after which the relay restarts ffmpeg itself; `0` keeps it report-only |
| `EGRESS_MAX_RECOVERIES` | `2` | Restart attempts per session before the relay gives up and just reports |
| `EGRESS_AUDIO_BITRATE` | `128k` | Bitrate of the Opus → AAC re-encode; must look like `96k` (32k or more) |
| `EGRESS_AUDIO_CHANNELS` | `2` | Channel count of that re-encode: `1` or `2` |
| `ALERT_WEBHOOK_URL` | — | If set, stall, reconnect and give-up alerts are POSTed here as JSON |
| `RECORDING_DIR` | — | Directory (a mounted volume) MediaMTX records broadcasts into; unset disables recording |
| `RECORDING_RETENTION_HOURS` | `24` | Hours a recording is kept before MediaMTX deletes it; `0` keeps everything |

## Run it

For the end-to-end procedure on a fresh host, including the checks at each
step, see [`docs/FIRST_BROADCAST.md`](../docs/FIRST_BROADCAST.md).

```bash
PUBLIC_RELAY_URL=https://relay.example.com RELAY_TOKEN=change-me \
  docker compose up --build
```

Then, in the S.M.U.V.E API environment:

```bash
MEDIA_RELAY_URL=https://relay.example.com   # or http://relay-host:8080 behind TLS
MEDIA_RELAY_TOKEN=change-me
```

The app's boot check reports the relay: a malformed URL stops the deploy, an
absent one warns that PUSH answers 503, and a missing token warns that the relay
is open.

## Watching a live push

Video is copied through unchanged; audio is re-encoded from Opus to AAC, because
FLV cannot carry Opus at all — with a single `-c copy` the muxer refuses to write a
header and the push never leaves the relay. `EGRESS_AUDIO_BITRATE` and
`EGRESS_AUDIO_CHANNELS` tune that encode; both are refused at startup if malformed,
rather than producing audio the provider silently will not take.

MediaMTX's `bytesReceived` proves the browser is still sending; it says nothing
about the provider, because ffmpeg can stay connected and write nothing after
the RTMP side dies. That is the failure with no visible symptom until the show
is over, so ffmpeg is started with `-progress pipe:1` and the relay watches its
`total_size`:

- A session that has reported bytes and then sends nothing for
  `EGRESS_STALL_SECONDS` (default 15) is flagged once, logged as
  `[relay] ALERT session <id> has sent nothing to the provider for <n>s`, and
  reported by `GET /sessions/:id` (`stalled`, `stalledForMs`, `bytesOut`) and by
  `GET /health` (`stalled` count).
- If the silence outlasts `EGRESS_RECOVER_AFTER_SECONDS` (default 45), the relay
  restarts that session's ffmpeg itself, up to `EGRESS_MAX_RECOVERIES` times
  (`session.recovering`, then `session.reconnected` on the first bytes back).
  The restart is a `SIGKILL`: the process is stalled by definition, and a
  graceful stop that a wedged ffmpeg never processes is the failure being
  fixed. `GET /sessions/:id` reports the ffmpeg `pid` so an operator can look at
  the process the relay is talking about.
  The MediaMTX path and the WHIP URL are untouched, so the browser keeps
  publishing and only the RTMP half reconnects — the provider sees a gap of
  roughly the grace period plus one second. After the attempt cap the session
  stays up and flagged (`session.recovery-failed`) instead of restarting in a
  loop, because a provider that keeps dropping us is not a bug a loop can fix.
- When bytes move again the flag clears and `session.recovered` is emitted.
- The same progress stream gives a quality readout: `bitrateKbps` is the
  smoothed rate of ffmpeg's byte deltas (samples closer than 250 ms are treated
  as buffered chunks, not a spike), and each completed stall is kept as a drop
  (`drops`, `silentMs`, `lastDropAt`, last 20 per session). A push that hiccuped
  twice is a different story from one that has been clean.
- A session that has never reported bytes is left alone — it is still connecting
  and ffmpeg's own retry loop already owns that case.

With `ALERT_WEBHOOK_URL` set, both events are POSTed there:

```json
{
  "event": "session.stalled",
  "sessionId": "…",
  "kind": "broadcast",
  "bytesOut": 412345,
  "stalledForMs": 16012,
  "at": "2026-11-15T20:14:03.001Z"
}
```

Events are `session.stalled`, `session.recovering`, `session.reconnected`,
`session.recovery-failed` and `session.recovered` (bytes resumed without a
restart). Any endpoint that accepts JSON works (a Slack/Discord webhook, a
monitoring collector). A webhook that is down never affects the stream: failures
are logged and the relay carries on.

## Surviving a relay restart

MediaMTX is a separate process, so when the relay restarts the browser's WHIP
publish is usually still live and only the RTSP→RTMP half is missing. With
`RELAY_STATE_FILE` and `RELAY_STATE_KEY` set, every session is written to that
file (encrypted, 0600) and re-attached on boot: the same session id means the
same WHIP URL keeps working, and ffmpeg is restarted against the path that is
still publishing. A stored session whose MediaMTX path is gone has no publisher
and is dropped, so the store never resurrects a finished broadcast.

The file holds push URLs, which include provider stream keys — that is why it is
encrypted and why persistence stays off unless a key is provided. If you would
rather lose in-flight pushes than keep keys on disk, leave `RELAY_STATE_FILE`
unset; nothing else changes.

## Self-test

`POST /selftest` opens a session aimed at `SELFTEST_RTMP_URL` — never at a
provider key — and `GET /sessions/:id` reports what MediaMTX actually received
(`ready`, `bytesReceived`, `tracks`). The app uses that pair from the BROADCAST
PUSH panel: pressing **SELF-TEST** publishes a generated colour-bar pattern with
the same WHIP publisher a real host uses, waits six seconds, and shows
`MEDIA CONFIRMED — <n> KB, <n> TRACKS` or the reason it failed.

When the sink is this relay's own MediaMTX, `GET /sessions/:id` also carries
`ingest`: the sink's `tracks`, its `bytesReceived`, the audio codec that actually
arrived (`MPEG-4 Audio` is AAC) and a `problem` string when audio did not reach it.
The relay logs the same once per self-test —
`[relay] selftest ingest: H264 + MPEG-4 Audio (AAC), 3160 KB` — so a broken audio
encode is visible from the log without watching the channel. A provider sink has no
such API, so `ingest` is null rather than a guess.

That exercises the whole path — browser encode → WHIP → MediaMTX → ffmpeg →
RTMP — without a camera, a game or a provider stream key. By default the push
target is this compose stack's own RTMP listener (`rtmp://mediamtx:1935/selftest`),
so the result cannot appear on the host's channel.

To prove egress to Twitch as well, point the sink at the channel's ingest with
the bandwidth-test flag, which makes Twitch accept the stream without showing it
publicly:

```bash
SELFTEST_RTMP_URL='rtmp://live.twitch.tv/app?bandwidthtest=true' \
SELFTEST_STREAM_KEY='live_...' \
  docker compose up --build
```

Kick has no equivalent flag, so leave the self-test on the local sink there and
verify a real Kick push in the dashboard.

## Recordings

Broadcasts are recorded on the relay and stay there; nothing is uploaded. When
the relay opens a broadcast's path it also tells MediaMTX to record it, so the
file is written from the browser's own publish — before any relay egress — and
it survives the session ending.

| | |
| --- | --- |
| Where | `RECORDING_DIR/<session id>.mp4` |
| Format | fragmented MP4, H.264 + Opus, exactly what the browser sent |
| Segments | hourly, so a show longer than an hour continues in the next file |
| Retention | `RECORDING_RETENTION_HOURS` (default 24), swept by the relay every minute; `0` keeps everything |
| Self-tests | never recorded: they prove the path, they should not fill the volume |

Unset `RECORDING_DIR` and nothing is recorded. In the compose file the volume is
`recordings`, mounted at `/recordings` in **both** containers: MediaMTX writes
there, and the relay needs write access there to delete expired files.

Retention is the relay's own (`src/recording-store.mjs`), not MediaMTX's
`recordDeleteAfter`, for two reasons found while building this:

- MediaMTX counts its window against the segment still being written, so a
  window shorter than the show deletes a live recording;
- the relay deletes a session's path when its ffmpeg exits, which stops the
  recorder — and MediaMTX's deletion with it — exactly when the file becomes
  eligible.

The sweeper only removes files whose last write is older than the window, so it
cannot take a file a broadcast is still writing. If a recording is missing,
check `docker compose logs relay` for `recording <id> into …` and for
`recording retention: …` lines.

A host can also keep one show past the window: the API asks the relay to pin it
for a number of hours (up to 90 days), the relay writes the promise beside the
file as `<name>.retention.json`, and the sweeper honours it even after the
default window has passed. The pin is swept by the recording's fate, not by its
own age, and it goes with the file when either the pin expires or the host
deletes the show.

The relay also serves them: `GET /recordings` lists the volume and
`GET /recordings/:name` hands a file back as an attachment, honouring byte
ranges so a player can seek. The S.M.U.V.E API is the only caller — it joins
those files to the sessions each host opened, so the app's RECORDINGS list only
ever shows a host their own shows, and it mints a short-lived signed playback
URL for the `<video>` element rather than exposing the relay token.

The e2e suite proves the recording itself: `relay/test/e2e-recording.test.mjs`
publishes over WHIP, asserts the file appears with H.264 and Opus, keeps growing
while the show runs, survives a sweep inside the window, and is deleted once the
window passes.

## Deploying for real

- **TLS is not optional.** Browsers only expose WHIP publishing on an HTTPS
  origin (or localhost). Terminate TLS in front of `:8889` (Caddy, nginx, a
  Cloudflare tunnel) and point `PUBLIC_RELAY_URL` at that https origin. MediaMTX
  can also serve TLS itself via `webrtcEncryption`, `webrtcServerKey` and
  `webrtcServerCert`.
- **UDP must reach the relay.** Publish `8189/udp` (or whatever
  `webrtcLocalUDPAddress` is) and set `webrtcAdditionalHosts` to the relay's
  public hostname so the browser has a candidate that works.
- **Keep `:8080` private.** Anyone who can call the control API with the token
  can open sessions; the token is the only thing between them and a provider
  ingest. `:9997` (MediaMTX config API) must stay unpublished — it accepts
  arbitrary path creation.
- **Keys are visible on this host.** The destination (including the stream key)
  is an ffmpeg argument, so it appears in `ps` and in MediaMTX's session list to
  anyone with shell access. That is the cost of RTMP egress; scope the host
  accordingly.

## Tests

The decision-level suite needs neither ffmpeg nor a media server:

```bash
npm run test:relay        # or: node --test "relay/test/**/*.test.mjs"
```

The end-to-end suite runs real processes along the path a host takes: a WHIP
publisher (Node + [werift](https://github.com/shinyoshiaki/werift-webrtc),
sending real H.264 RTP) → MediaMTX → the relay's ffmpeg → an RTMP ingest. It
proves the three states this relay exists to handle: bytes flowing, bytes
stopping while the process stays alive, and bytes resuming after the relay
restarted ffmpeg itself — with the browser-side publish left connected
throughout, which is what makes a relay restart invisible upstream.

The same endpoint is also driven by a second, independent client:
`relay/test/e2e-whip-muxer.test.mjs` publishes with ffmpeg's own `whip` muxer.
One publisher is one set of SDP, ICE and DTLS choices, so this makes the
endpoint's compatibility a property of the server rather than of werift. The
`ffmpeg-static` build has no `whip` muxer (`Unknown format 'whip'`), so this test
needs `RELAY_WHIP_FFMPEG_PATH` and skips without it.

It skips when the binaries (or werift) are absent, so the normal suite never
needs them. A tool that is set but does not run fails instead of skipping, and so
does a run with `RELAY_E2E_REQUIRE_TOOLS=1` — CI sets that, because it has just
provisioned all three, so a skip there would mean the provisioning did not take. To fetch what it needs and run it in one command:

```bash
npm run test:relay:e2e:setup
```

That installs `ffmpeg-static` and `werift` at the versions pinned in the script,
downloads the pinned MediaMTX release and a WHIP-capable ffmpeg build (~150 MB on
linux-x64, of which only the binary is kept) into `node_modules/.e2e` (gitignored).
The ffmpeg build is pinned by dated autobuild tag *and* version-named asset, so a
cold cache fetches the exact binary the test was written against rather than a
moving `latest`; `E2E_WHIP_FFMPEG_TAG` and `E2E_WHIP_FFMPEG_ASSET` move both.
then runs the suite. Already provisioned tools are reused, and anything whose
version does not match the pins is replaced rather than trusted; `-- --force`
re-fetches, and `-- --provision-only` stops after fetching. CI caches that
directory keyed on the script, so changing a pin invalidates the cache. If you already have them, point the suite at your own:

```bash
RELAY_FFMPEG_PATH=/path/to/ffmpeg \
MEDIAMTX_PATH=/path/to/mediamtx \
RELAY_WERIFT_PATH=/path/to/node_modules/werift \
RELAY_WHIP_FFMPEG_PATH=/path/to/whip-capable/ffmpeg \
  npm run test:relay:e2e
```

Set `RELAY_E2E_LOGS_DIR` to keep the MediaMTX log, the relay's own log, the last
session state, the alerts and the ingest byte count for that run — CI does this
and prints them when the job fails. If that directory cannot be written, the run
fails on purpose: a red job with no logs is worse than one that says why.

The files use separate ports — 18554/18889/18189/19355/19997 for the full
path, 18754/18655/18290/19455/19998 for the second client,
18764/18855/18390/19545/19990 for the audio re-encode and
18652/18658/18293/19453/19995 for recordings — so they run at the same time. Each cleans up after itself. The ingest it pushes to is that local
MediaMTX, never a provider; the WHIP hop is a real WebRTC connection, but not a
real browser.
