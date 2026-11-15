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
| `GET` | `/health` | — | `200 { status, sessions }` |

Every route except `/health` requires `Authorization: Bearer $RELAY_TOKEN`.

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

## Run it

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

No media server or ffmpeg is needed:

```bash
node --test test
```
