# S.M.U.V.E. Live — two-device test plan

Manual verification for host ↔ viewer connection recovery and friend go-live alerts.
Unit tests cover the state machines; only two real devices on two real networks prove
the ICE path, the TURN relay, and the notification fan-out.

## Setup

| Item | Value |
| --- | --- |
| Device A (host) | Desktop or laptop, camera + mic, on Wi-Fi |
| Device B (viewer) | Phone or second laptop, **on cellular** (different network is the point) |
| Accounts | A and B accepted friends (send + accept the request before starting) |
| Third account (C) | Optional, for the offline-notification case |
| Backend | Production or a tunneled local server, with the client pointed at it |

Before starting, check `.env` on the server: `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL`
(or Cloudflare TURN) and confirm `TURN_PUBLIC_FALLBACK` is not `off`. Cellular viewers need a
relay; STUN alone fails behind carrier NAT.

## Scenarios

Run in order. Each row is pass/fail on the stated expectation only.

### 1. Baseline watch (the thing that must never regress)

1. A → Tha Spot → GO LIVE (camera only).
2. Copy the share link, open it on B, tap WATCH.
3. Expect: B's feed plays within ~5s; B appears in A's viewer list; the relay strip on B
   shows a source (`DIRECT`, `RELAY`, or `PUBLIC RELAY FALLBACK`) rather than `NONE`.

### 2. Camera → game switch

1. While B is watching, A taps GAME.
2. Expect: B's video changes to the game screen within ~2s, **without** a reconnect flash
   and without B's viewer count dropping.
3. A taps CAMERA. Expect B returns to the camera.
4. Join late: open the share link on a third browser after A has already switched to GAME.
   Expect the late viewer opens directly on the game screen (source replay), not black.

### 3. Host refresh / sleep (grace window)

1. With B watching, A reloads the page (or locks the phone) for ~10s.
2. Expect: B's banner shows `FEED DROPPED — RECONNECTING…`, the picture recovers on its
   own within ~15s, and B is not dropped from the room.
3. Leave A reloaded for more than 30s. Expect: the room ends and B sees the stream
   finished state rather than an endless spinner.

### 4. Viewer network drop (the reconnect banner)

1. With the feed playing on B, turn on airplane mode for ~10s, then off.
2. Expect in order: `CONNECTION LOST — RECONNECTING…`, then either automatic recovery or
   `FEED DROPPED — RECONNECTING…`, then the picture back.
3. Tap RECONNECT while the banner is up. Expect the feed to come back within ~3s and the
   banner to disappear the moment frames flow.
4. Repeat with B's Wi-Fi→cellular handoff instead of airplane mode (if B is a phone).

### 5. Viewer refresh mid-stream

1. Reload B while watching.
2. Expect B re-joins the same room, the feed plays, and A's viewer list shows one entry
   for B, not two.

### 6. Friend alert, both states

1. Online: with C signed in and idle (not on the NET tab), have A go live. Expect C gets a
   toast and a `FRIEND IS LIVE` card with WATCH/DISMISS; WATCH opens A's feed.
2. Offline: sign C out, have A go live, then sign C back in. Expect a `friend_live`
   notification in the inbox; tapping it opens A's broadcast.

### 7. Card expiry (what this release adds)

1. Keep C's card open (online case), then have A end the broadcast.
2. Expect: the `FRIEND IS LIVE` card disappears from C's screen without a reload, and the
   inbox no longer offers WATCH for that room after C's next sign-in.
3. Leave a `friend_live` notification unopened for a day (or end the stream and re-sync):
   it is retired rather than kept as a dead WATCH button.

### 8. Relay proof

1. On B (cellular), open `chrome://webrtc-internals` (or Safari's WebRTC inspector).
2. Find the selected candidate pair for the inbound peer.
3. Expect at least one `relay` candidate; if the pair is host↔host on two different
   networks, the relay was not needed — re-run with a stricter network (corporate VPN)
   before concluding the TURN path works.

## Where to look when something fails

| Symptom | Check |
| --- | --- |
| B never plays | Server logs for `live_stream_watch`; B's console for `live_stream_watch_failed` (`not_host`, `unknown_token`) |
| B plays but freezes on switch | A's console for `live_stream_source` announcements; B's for the same event |
| Reconnect loops | B's console for repeated `live_stream_watch`; server logs for `live_stream_viewer_left` storms |
| No friend card | Server logs for friend fan-out; confirm the friendship is `accepted`, not `pending` |
| Card will not clear | Server logs for `friend_live_ended`; `Stale live alert prune failed` means the cleanup query did not run |
| Audio only / video only | Candidate pair is `relay` but bandwidth-starved — check `PUBLIC RELAY FALLBACK` is the active source |

## Reporting

Record for each scenario: pass/fail, the relay source shown on B, and the recovery time
(from drop to first frame). Anything that recovers slower than ~15s, or that needs a page
reload, is a regression — the client is supposed to recover without one.
