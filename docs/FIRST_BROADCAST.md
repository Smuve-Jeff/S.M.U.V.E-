# First live broadcast: fresh host → relay self-test → a real Twitch channel

This is the run that proves the broadcast path for real. Everything here has
been unit-tested, but the chain has never run against Docker, MediaMTX, ffmpeg
and Twitch together, so the steps are ordered to make each failure land on one
layer at a time.

```text
browser ──WHIP (WebRTC)──▶ MediaMTX ──RTSP──▶ ffmpeg ──RTMP(S)──▶ Twitch / Kick
```

Do not announce a show until step 8 passes. Steps 1–7 are setup, 8–9 prove the
media path without touching a channel, 10–12 are the real thing.

## 0. What this host needs

| Piece | Requirement |
| --- | --- |
| Relay host | Docker with compose v2 (`docker compose version`), public DNS name, TLS on 443, **UDP `8189` reachable from the internet** |
| API host | Node 22, PostgreSQL, the env vars from `.env.example` |
| Twitch app | Client ID + secret, callback registered (step 6) |
| Browser | The app served over **HTTPS** — browsers only expose WHIP publishing on a secure origin |
| Credentials | A Twitch channel you can stream to. Kick is optional (step 11) |

TLS is not decoration: on a plain `http://` origin the browser refuses to
publish, and the self-test will fail in step 8 with no useful error.

## 1. Publish the right ports on the relay host

| Port | What | Exposure |
| --- | --- | --- |
| `8889/tcp` | MediaMTX WHIP — where the browser publishes | Behind TLS on 443 |
| `8189/udp` | WebRTC media | **Public**; nothing works without it |
| `8080/tcp` | Relay control API — what the S.M.U.V.E API calls | Private network or TLS, never open to the world |
| `9997/tcp` | MediaMTX config API | **Never published** — it accepts arbitrary path creation |
| `8554/tcp`, `1935/tcp` | RTSP and the local self-test RTMP sink | Compose network only |

Check: `ss -lunp | grep 8189` on the host once the stack is up (step 2), and
confirm the DNS name resolves to it from a machine outside the network.

## 2. Start the relay

```bash
cd relay
export PUBLIC_RELAY_URL=https://relay.example.com     # https origin that fronts :8889
export RELAY_TOKEN=$(openssl rand -hex 32)            # must equal MEDIA_RELAY_TOKEN on the API
export RELAY_STATE_KEY=$(openssl rand -hex 32)        # enables restart recovery
docker compose up --build -d
docker compose logs -f relay
```

Expect four lines before anything else happens:

```text
[relay] control API on :8080
[relay] publishing under https://relay.example.com/<session>/whip
[relay] self-test sink: rtmp://mediamtx:1935/selftest
[relay] restored 0 session(s) from /var/lib/relay/sessions.json
```

Checks:

- `curl -s http://127.0.0.1:8080/health` → `{"status":"ok","sessions":0,"mediamtx":"reachable",...}`.
- **`503` / `"mediamtx":"unreachable"`** → MediaMTX is not answering. Look at
  `docker compose ps` and `docker compose logs mediamtx`; confirm `api: yes` is
  still in `mediamtx.yml`. This is exactly the condition the API's boot check
  refuses to start on, so fix it now rather than at step 4.
- **Compose refuses to start** → it prints `set PUBLIC_RELAY_URL` or
  `set RELAY_TOKEN`; both are required in `docker-compose.yml`.
- **`restored 0 session(s)` is not logged** → `RELAY_STATE_KEY` was empty, so
  persistence is off. Relaunch with the key, or accept that a relay restart ends
  the push (step 13).
- **ffmpeg present:** `docker compose exec relay ffmpeg -hide_banner -version | head -1`.

## 3. Put TLS in front of WHIP

Terminate TLS in front of `:8889` (Caddy, nginx, a Cloudflare tunnel) and set
`PUBLIC_RELAY_URL` to that path-free origin. WebSocket-style upgrades must pass
through, so do not buffer the response.

Then set `webrtcAdditionalHosts` in `relay/mediamtx.yml` to the relay's public
hostname and `docker compose restart mediamtx`, so the browser gets a candidate
that actually works.

Check from **outside** the relay network:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://relay.example.com/anything/whip
```

`404` or `405` is healthy — MediaMTX is answering and refusing the bare
request. A TLS error, a timeout, or a blank reply means the proxy is not passing
`:8889` through, and step 8 will report `THE RELAY RECEIVED NO MEDIA`.

## 4. Point the API at the relay

On the API host:

```bash
API_PUBLIC_URL=https://api.example.com            # used to build OAuth callbacks and validate requests
MEDIA_RELAY_URL=https://relay-control.example.com  # reaches the relay's :8080
MEDIA_RELAY_TOKEN=<the RELAY_TOKEN from step 2>
MEDIA_RELAY_PROBE_TIMEOUT_MS=3000
TWITCH_RTMP_URL=rtmp://live.twitch.tv/app
```

Start the API (`npm run dev:server` for a host run, or
`npm run build:server && npm run start:server`). The boot check runs once and
decides whether the process lives:

| Boot output | Meaning | Action |
| --- | --- | --- |
| `[stream-accounts] OAuth ready for Twitch, YouTube.` | Providers configured, relay answered | Continue |
| `The broadcast relay is up but cannot reach MediaMTX, so every push would fail. Fix MEDIAMTX_API_URL ...` | Relay answered **degraded** (503): it cannot reach MediaMTX | Fix MediaMTX, not the relay |
| `The broadcast relay at <url> did not answer its health probe. Start it, or clear MEDIA_RELAY_URL ...` | Unreachable, timed out, wrong URL, or a token the relay rejected | `curl -s $MEDIA_RELAY_URL/health`; compare `MEDIA_RELAY_TOKEN` with `RELAY_TOKEN` |
| `The streaming_accounts table is missing. Run \`npm run mg:run\` ...` | Migrations not applied | Step 5 |

The process exits non-zero on any of those, so a deployment that gets past boot
has already proven the relay hop. Check `curl -s $API_PUBLIC_URL/api/health`.

## 5. Apply the migrations

```bash
npm run mg:run
```

Two tables must exist: `streaming_accounts` and `streaming_destinations`.
Verify with `psql "$DATABASE_URL" -c '\d streaming_accounts'`. The boot check
detects a missing table by error code and names it; it does not migrate for you.

To prove that gate without a database of your own:

```bash
npm run verify:streaming-schema
```

It starts a throwaway PostgreSQL in `node_modules/.pgverify`, boots the compiled
API twice and checks both answers: with nothing applied the boot must refuse with
"The streaming_accounts table is missing", and after the migrations it must log
`OAuth ready for twitch` and answer `/api/health` with 200. It also compares every
entity's table against the migrated schema and fails on a missing table, a
missing or extra column, or a nullability change — ignoring column lengths,
default expressions and constraint names, which differ cosmetically and would
otherwise bury a real gap. The provider credentials it passes are dummy strings,
and the data directory is deleted when it finishes.

## 6. Register the Twitch application

In the Twitch developer console create (or open) the app and set:

| Field | Value |
| --- | --- |
| OAuth redirect URL | `<API_PUBLIC_URL>/api/stream-accounts/twitch/callback` |
| Scopes the app requests | `channel:read:stream_key channel:manage:broadcast` |
| Client ID / secret | into `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` |

`channel:read:stream_key` is the one that makes the push possible: the relay
needs the channel's key, and Twitch hands it out over Helix rather than in a
dashboard the host copies from. `channel:manage:broadcast` covers the rest of
the channel link. The connect flow sends `force_verify=true`, so Twitch asks
which account even when a browser session already exists.

YouTube is optional and read-only (`youtube.readonly openid email profile`) —
it links the account but does **not** receive an RTMP push; only Twitch and Kick
are ingest targets. Callback:
`<API_PUBLIC_URL>/api/stream-accounts/youtube/callback`.

Optional: set `OAUTH_TOKEN_KEY` (32-byte hex/base64) so stored tokens are sealed
with their own key instead of one derived from `JWT_SECRET`.

## 7. Connect the channel in the app

1. Open **Tha Spot** → **STREAMING ACCOUNTS**.
2. Press **CONNECT** next to TWITCH, approve on Twitch, and wait for the row to
   show the channel name instead of `NOT CONNECTED`.
3. Scroll to **BROADCAST PUSH** and press **CHECK**.

Checks:

- The header reads `RELAY READY`. `NO RELAY CONFIGURED` means `MEDIA_RELAY_URL`
  is missing on the API, and every push will answer 503.
- The TWITCH row reads `TWITCH — <your channel>` and **PUSH** is enabled. An
  empty row with `NOT READY` means the account is not linked.
- A 401/403 sentence about reconnecting Twitch means the stored token was
  revoked or the app's client id changed — press **RECONNECT**.

## 8. Self-test — prove the media path without a provider

Press **SELF-TEST**. It publishes a generated colour-bar pattern through the
same WHIP publisher a real host uses, waits six seconds, and asks the relay what
arrived.

Pass looks like:

```text
MEDIA CONFIRMED — 412 KB, 2 TRACKS · AUDIO AAC
```

That byte count is the whole point: it separates "the URL was accepted" from
"media reached the RTMP side". The audio suffix is the second half of it: the
pattern carries a tone, the relay re-encodes that Opus to AAC, and — when the sink
is the stack's own MediaMTX — the relay reads back what the *ingest* received and
says which codec arrived. An encode that silently produced no audio track reads
`MEDIA CONFIRMED — … · VIDEO REACHED THE INGEST BUT AUDIO DID NOT` instead of
looking healthy. With a provider sink there is no API to ask, so the suffix is
simply absent. No camera, no game and no stream key are
involved, and the sink is the stack's own `rtmp://mediamtx:1935/selftest`, so
this cannot appear on your channel.

Failures, in the order they usually happen:

| Message | Cause | Fix |
| --- | --- | --- |
| `THE RELAY RECEIVED NO MEDIA — CHECK THE WHIP URL, TLS AND UDP` | Browser connected nothing: TLS proxy not passing `:8889`, or `8189/udp` blocked | Step 3; check `webrtcAdditionalHosts` |
| `THE RELAY RETURNED NO TEST SESSION` | Relay answered without a session | Read the relay logs; check 8080 reachability from the API |
| `The relay refused the self-test (SELFTEST_RTMP_URL is not configured on this relay).` | Sink unset | Set `SELFTEST_RTMP_URL` (compose defaults it to the local sink) |
| `THIS BROWSER CANNOT GENERATE A TEST PATTERN` | No `canvas.captureStream` (very old browser) | Use a current Chrome/Firefox/Safari |
| `MEDIA CONFIRMED — … · VIDEO REACHED THE INGEST BUT AUDIO DID NOT` | The re-encode produced no audio track at the sink | Check `EGRESS_AUDIO_BITRATE` / `EGRESS_AUDIO_CHANNELS`; the relay logged `[relay] selftest ingest:` with what it saw |
| 429 | More than 20 push attempts in a minute for this account | Wait a minute |

Cross-check on the relay without the app:

```bash
curl -s -H "Authorization: Bearer $RELAY_TOKEN" \
  "http://127.0.0.1:8080/sessions/<id>"
```

`ready: true` with `bytesReceived` above zero and a non-empty `tracks` array is
the same evidence the panel shows about what the browser sent. The same response
carries `ingest` — what the sink received — including `ingest.audio.codec` and a
`problem` string when the audio did not arrive, and the relay logs
`[relay] selftest ingest: H264 + MPEG-4 Audio (AAC), <n> KB` once per self-test.

## 9. Prove egress to Twitch with the bandwidth test

The self-test can push at Twitch instead of the local sink. Twitch's
`bandwidthtest` flag accepts the stream without showing it on your channel:

```bash
cd relay
export SELFTEST_RTMP_URL='rtmp://live.twitch.tv/app?bandwidthtest=true'
export SELFTEST_STREAM_KEY='live_...'    # your channel's key
docker compose up -d relay
docker compose logs -f relay             # "[relay] self-test sink: rtmp://live.twitch.tv/app?bandwidthtest=true"
```

The relay appends the session key as the path segment and keeps the flag after
it (`.../app/live_...?bandwidthtest=true`), which is the shape Twitch expects.

Press **SELF-TEST** again. Expect `MEDIA CONFIRMED`. If the local sink passed but
this fails, the relay cannot reach Twitch over RTMP outbound — check egress
firewall rules for `:1935` and the key itself.

Afterwards, unset `SELFTEST_RTMP_URL` (or set it back to the local sink) and
restart the relay, so a stray self-test can never touch the channel.

## 10. Real broadcast to Twitch

1. Turn the camera on (or switch to **SCREEN**) in the broadcast panel.
2. Press **PUSH** on the TWITCH row. Expect `PUSHING TO TWITCH` and the row
   switching to **STOP**.

Checks, in order:

- Twitch Creator Dashboard → **Stream Manager** shows a video preview and
  `Excellent`/`Good` stream health.
- The public channel page plays the stream after a few seconds.
- `docker compose logs -f relay` shows the session opening and ffmpeg running;
  `docker compose logs --tail 30 mediamtx` shows the WHIP path being published
  and, once bytes flow, the RTSP reader ffmpeg opened.
- Switching camera ↔ game keeps the feed alive (the video track is replaced in
  place rather than republishing).
- The relay's startup log announced
  `[relay] egress watchdog: 15s of silence, restarting ffmpeg after 45s`; during
  the push, nothing should say `[relay] ALERT session …`. If it does, the browser is still uploading but the
  provider has stopped receiving — check outbound RTMP from the relay host, then
  stop and re-push. The panel says
  `PROVIDER SILENT FOR <n>S — THE RELAY IS STILL RECEIVING, SO CHECK ITS RTMP EGRESS`
  within a few seconds of the relay alerting, and
  `curl -s http://127.0.0.1:8080/health` showing `"stalled": 1` is the same
  signal.
- The panel also carries a live quality line, e.g.
  `EGRESS 3,140 KBPS · NO DROPS`. A rate near zero means the provider is
  receiving nothing even if the panel has not flagged a stall yet; any drop
  count above zero means the push already went silent once and recovered.
- A stall that lasts past 45 s is fixed by the relay, not by you: the panel says
  `RELAY IS RECONNECTING THE PUSH — THE PROVIDER MAY SHOW A SHORT GAP`, then the
  quality line gains `· 1 RECONNECT`. If it instead says
  `THE RELAY COULD NOT RECONNECT — STOP AND PUSH AGAIN`, the push is beyond what
  a restart can fix.

Stop with **STOP**; the snackbar reads `BROADCAST PUSH STOPPED`, Twitch reports
the stream offline within ~10 seconds, and the relay session is deleted. Ending
the stream in the app also ends the push.

## 11. Kick (optional)

Kick has no public key API, so the host pastes it once:

1. In Kick's creator dashboard copy the ingest URL
   (`rtmps://<channel-id>.global-contribute.live-video.net:443/app`) and the
   stream key.
2. Paste both into **KICK URL + KEY** and press **SAVE**. The key is sealed at
   rest and never echoed back; the row then reads `KICK — <ingest host>`.
3. Press **PUSH** on the KICK row and confirm the channel goes live.

Validation is deliberate: the URL must start `rtmp://` or `rtmps://` and the key
must be 8–200 characters of letters, digits, `_` or `-`. A rejection here is a
copy-paste error, not a server problem.

One platform at a time: while a push is live the panel shows **STOP** instead of
**PUSH**, so stop the current push before switching channels.

## 12. Where the broadcast is recorded

Every broadcast is recorded on the relay as `<RECORDING_DIR>/<session>.mp4`
(fragmented MP4, H.264 + Opus), written by MediaMTX from the browser's own
publish and kept for `RECORDING_RETENTION_HOURS` (default 24; `0` keeps
everything). Self-tests are never recorded.

Check one exists after a broadcast:

```bash
docker compose exec mediamtx ls -lh /recordings
```

The relay logs `recording <id> into /recordings (kept 24h)` when a session opens
and `recording retention: deleted N recording(s)` when the sweeper clears
expired files. If `RECORDING_DIR` is unset, recording is off and the startup log
says so.

Hosts do not have to reach the relay to get a show back: the app lists them
under **BROADCAST PUSH → RECORDINGS**, with PLAY and DOWNLOAD per file. The list
comes from `GET /api/broadcast/recordings`, which joins the relay's files to the
push sessions this account opened; downloads come from
`GET /api/broadcast/recordings/:relayId/download`, streamed through the API so
the relay's token never reaches the browser. A host only ever sees their own
recordings, and a show drops off the list when retention deletes it.

The app warns before the sweeper takes something: a show with under six hours
left gets an amber `IN 4H` badge, and a line above the list counts them. The
deadline is computed from the relay's own window (now included in
`GET /recordings`) and any pin, so the warning matches what the sweeper will
actually do. Picking 7D, 30D or 90D clears the warning. The badge re-reads a clock that ticks
once a minute, so a panel left open still shows a show crossing into its last
hours. When a deadline actually passes, the row is dropped and the list is
reconciled with the relay once, so a swept show does not sit there looking
playable until someone presses REFRESH. Changing the selector re-reads the list
too, so the deadline shown is always the relay's own answer. Because the relay
sweeps on its own minute, a reload can still list a show this panel watched
expire; it stays hidden until the relay stops listing it, rather than blinking
back for a tick.

Retention is a default, not a rule: each row has a **DEFAULT / 7D / 30D / 90D**
selector. Picking longer asks the API to pin the show (`PUT
/api/broadcast/recordings/:relayId/retention`), the relay stores that promise
beside the file, and the sweeper keeps it past the default window until the pin
runs out — restarting either process does not lose it. Putting the row back on
DEFAULT drops the pin, and a show that is already older than the window goes on
the next sweep.

DELETE removes a show immediately — the file and its still — instead of waiting
for retention to do it. It asks once in the row itself (CONFIRM/KEEP), and a
show retention already removed counts as deleted, so pressing it late is not an
error.

Each row also carries the length of the show and a still frame. The length is
read out of the recording's own header, and the frame is a 320 px JPEG the relay
takes one second in and caches beside the file, so the first list of a new show
is the only time anything has to work it out.

PLAY does not put the host's JWT in a media URL. The app asks for a short-lived
signed link (`POST /api/broadcast/recordings/:relayId/playback`), which names
one user, one session and one file and expires after two hours; the player loads
that from `GET /api/broadcast/recordings/:relayId/stream`. The stream answers
byte ranges end to end, so seeking works without re-downloading the show. If the
link expires mid-show, press PLAY again.

Do not shorten retention below the length of a show: the sweeper only deletes
files whose last write is older than the window, so a live recording is safe,
but a very short window deletes completed recordings almost immediately.

## 13. Restart the relay mid-broadcast

With `RELAY_STATE_FILE` and `RELAY_STATE_KEY` set (step 2), an in-flight push
survives a relay restart because MediaMTX and the browser's publish keep
running:

```bash
docker compose restart relay
docker compose logs relay | grep restored     # "[relay] restored 1 session(s) ..."
```

The provider feed continues without the host republishing, because the session
id — and therefore the WHIP URL — is unchanged. If the log instead says
`dropping stored session ...: its publisher is gone`, the browser had already
stopped publishing and there was nothing to re-attach.

## Proving the browser hop

Every automated check publishes from software: the media-path test uses werift and
the second-client check uses ffmpeg's `whip` muxer. Neither is a browser. Camera
permissions, secure-context rules, ICE through a real NAT, codec selection and tab
throttling have therefore never run, and they fail in ways the server never sees.
Do this once on the real origin, before a show, with the browser you will actually
broadcast from.

**The codec is the highest-risk item.** The relay copies video and re-encodes
audio (`-c:v copy -c:a aac`): FLV can carry H.264 but not Opus, and a single
`-c copy` made the muxer refuse to write a header at all, so a host with a
microphone reached the provider with nothing. The AAC encode is tuned with
`EGRESS_AUDIO_BITRATE` (default `128k`) and `EGRESS_AUDIO_CHANNELS` (default `2`);
if the provider reports poor audio, change those rather than the browser. The publisher therefore restricts the
video transceiver to H.264 with `setCodecPreferences`, and refuses the push
outright when the browser has no H.264 encoder. That preference is still advisory
per spec, and browsers too old to implement it are left alone, so check the codec
rather than trusting the code.

1. **Secure context.** On the real origin, `window.isSecureContext` in the console
   is `true` and `navigator.mediaDevices` exists. On a plain `http://` origin
   neither holds and PUSH fails without ever asking for the camera.
2. **Permission.** Press **PUSH** and allow the camera. Deny it once as well: PUSH
   stops before the publisher with `NO CAPTURE YET — SWITCH THE CAMERA ON FIRST`,
   rather than sitting on `CONNECTING`. A browser that has remembered the denial
   needs its site settings cleared before it will ask again.
3. **The WHIP request.** DevTools → Network, filter `whip`. Expect exactly one
   `POST https://relay.example.com/<session>/whip` returning `201`, request
   `Content-Type: application/sdp`, response `Location: …/<session>/whip/<resource>`
   and an SDP body starting `v=0`. One POST per push — the publisher gathers ICE
   before sending, so there is no trickle stream. A `404` is the session or path,
   a TLS error is the proxy in front of `:8889`; the panel shows the same failure
   as `WHIP HTTP <status>`.
4. **ICE.** In `chrome://webrtc-internals`, pick the connection created at that
   moment: `iceConnectionState` reaches `connected` (or `completed`), and the
   selected candidate pair is the browser's srflx candidate against
   `relay.example.com:8189/udp`. `checking` → `failed` means UDP `8189` is not
   arriving, or MediaMTX advertised a host the browser cannot reach (step 3).
   There is no TURN server: on a network that blocks UDP or is symmetrically
   NATed, this is where it stops, and that is a known limit rather than a
   misconfiguration.
5. **Codec.** In the same panel, `outbound-rtp` video should read `H264`. Then
   confirm it server-side, which is what the relay actually sees:

   ```bash
   curl -s -H "Authorization: Bearer $MEDIA_RELAY_TOKEN" \
     "$MEDIA_RELAY_URL/sessions/<session-id>" | jq '{ready, tracks, bytesReceived}'
   ```

   `tracks` must contain `H264`. With the microphone on it reads
   `["H264", "Opus"]`, which is expected: the relay re-encodes that Opus to AAC on
   the way out. If video reads `VP8`, `VP9` or `AV1`, this browser ignored the
   publisher's preference (or predates `setCodecPreferences`): the media reaches
   MediaMTX but cannot be copied into FLV, and `session.error` on the same response
   carries ffmpeg's complaint (`Could not write header`, or a codec tag error).
   Record what your browser negotiated — that is the finding this checklist exists
   for.
6. **Bytes on both sides.** `bytesReceived` climbs in the response above, the
   panel shows `EGRESS <n> KBPS · NO DROPS`, and `docker compose logs mediamtx`
   shows the WHIP session gaining an RTSP reader. `bytesReceived` rising with no
   reader means the relay never pulled; a reader with flat `ingest-bytes` in a
   media-path log means egress.
7. **Camera ↔ game switch.** Switch source mid-push. Network shows **no second
   POST** and `bytesSent` carries on without dropping to zero — that is
   `replaceTrack` doing its job. A new POST means the app republished, which
   renegotiates mid-broadcast.
8. **Background tab.** Switch tabs for 30 s, then back. `bytesSent` plateauing is
   expected: browsers throttle encoders they stop rendering. If the relay logs
   `[relay] ALERT session … has sent nothing to the provider …` and restarts
   ffmpeg, the throttle was severe enough to look like a stall — keep the tab
   visible during a show.
9. **Stop.** The panel returns to **PUSH**, Network shows `DELETE` on the
   `Location` URL, `GET /sessions/<id>` 404s, and the channel goes offline.
10. **Network change.** Toggle Wi-Fi, or sleep the laptop, mid-push. The connection
    goes `disconnected` → `failed` and does not recover: the publisher opens no
    ICE restart. STOP then PUSH is the correct recovery, which is what the panel
    tells the host.

| What you saw | Which layer |
| --- | --- |
| No `POST …/whip` in Network | App or browser: insecure origin, permission, JS error |
| `POST` with a 4xx/5xx, or a TLS error | URL, proxy, TLS in front of `:8889` |
| `201` but `bytesReceived` stays 0 | ICE: UDP `8189`, or an unreachable advertised host |
| `bytesReceived` climbs, ingest flat | Relay pull or RTMP egress to the provider |
| `tracks` is not `H264` | Codec negotiation, browser side |
| Quality collapses only when the tab is hidden | Browser throttling, not a stall |

## Reading a failed media-path check

The media path has a check that runs without any provider account: a Node WHIP
publisher pushes into MediaMTX, the relay's ffmpeg pulls that and pushes RTMP
into a local ingest, and the run stalls the relay on purpose and expects it to
recover. It runs on every push and pull request that touches the relay.

When it goes red, the job prints each log file in its own group and uploads them
together as the `relay-e2e-logs` artifact. To get the same files locally:

```bash
RELAY_E2E_LOGS_DIR=/tmp/relay-run npm run test:relay:e2e:setup
```

| File | Answers |
| --- | --- |
| `mediamtx.log` | Did the WHIP publish reach the media server at all? |
| `relay.log` | Did the relay open the session, retry, flag a stall, recover? |
| `session.json` | Last status: `ready`, `pid`, `restarts`, byte counts, ffmpeg's error |
| `alerts.json` | The stall and recovery events, in order |
| `ingest-bytes.txt` | What the ingest actually received |

Read them in the order the media takes: no publish in `mediamtx.log` means the
browser or WHIP layer; a publish but no `bytesOut` in `session.json` means the
relay's ffmpeg or its pull; bytes out but a low `ingest-bytes.txt` means egress
to the provider. If the run fails saying the diagnostics themselves could not be
written, the media path may well have passed — fix the log directory first.

Three failures are worth recognising on sight:

| Symptom | What it means | What to do |
| --- | --- | --- |
| The job dies in "Provision ffmpeg, MediaMTX, werift" before any test output | A download was blocked: ffmpeg-static's postinstall or the pinned MediaMTX tarball | Re-run once; if it repeats, install the tools on that machine and point `RELAY_FFMPEG_PATH` and `MEDIAMTX_PATH` at them |
| `timed out waiting for MediaMTX`, or for the WHIP publish right after it starts | Something else owns those ports — a media server left running from an earlier attempt is the usual culprit, and it answers the API while the new one cannot bind | Find the owner with `ss -ltnp` and stop that pid; `mediamtx.log` stays empty because this run's server never started |
| `WebRTC never connected (state failed)` | ICE could not pair: UDP on loopback is blocked, or the client gathered only a candidate family the server does not answer on | Check `mediamtx.log` for a created session with no bytes behind it; fix the network, not the test |

## Sign-off checklist

- [ ] `/health` answers `200` with `"mediamtx":"reachable"`
- [ ] API boot log shows OAuth ready and no relay problem
- [ ] Migrations applied (`streaming_accounts`, `streaming_destinations`)
- [ ] Twitch row shows the channel; `RELAY READY`
- [ ] SELF-TEST → `MEDIA CONFIRMED — n KB, n TRACKS`
- [ ] SELF-TEST against `?bandwidthtest=true` also confirms media
- [ ] Real PUSH shows video on the public channel
- [ ] STOP returns the channel to offline
- [ ] Relay restart mid-push keeps the feed alive
- [ ] Browser hop checked once on the real origin: `tracks` contains `H264`, ICE
      `connected`, one `POST …/whip` and one `DELETE` per push
- [ ] Audio reaches the provider (the relay re-encodes Opus to AAC; a video-only
      push is not evidence for this)

The last item that has never been exercised is a full show over a real network
for an hour: watch the relay's ffmpeg for reconnects and the app for the viewer
stall watchdog while it runs.
