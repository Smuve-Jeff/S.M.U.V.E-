/* eslint-disable no-console */
/**
 * Live-site smoke test for the S.M.U.V.E. production API (www.smuvejeffpresents.com).
 *
 * Exercises the social/matchmaking feature areas shipped across f26ae4a, 05d0e79,
 * 2f70a37 and b6f693d:
 *   1. Player blocklist REST (block / list / self-block / cross-user 403 / unblock)
 *   2. Persisted room chat (socket send + REST history)
 *   3. Challenge dedupe (double-submit returns same row; re-challenge after decline)
 *   4. Authoritative lobby_list directory broadcast
 *   5. Socket rate limiting + mutual block enforcement (DMs & challenges silently dropped)
 *   6. Multi-socket presence retention (user stays online while any socket lives)
 *   7. Resolved-match lobby provisioning: challenge ACCEPT and queue pairing create
 *      ONE shared lobby both players join (challenge_lobby_ready / match_found.partyId)
 *   8. In-match relays: game_state_update + lobby_chat_message flow between the pair,
 *      the sender is never echoed, and leaving/disconnecting ends the lobby (party_ended)
 *
 * Run from repo root:  node scripts/qa-prod-smoke.cjs
 * Creates two throwaway users, cleans up everything at the end.
 */
"use strict";

const { io } = require("socket.io-client");

const BASE = "https://www.smuvejeffpresents.com";
const API = `${BASE}/api`;
const TS = Date.now();
const EMAIL_A = `qa-a-${TS}@smoke-test.invalid`;
const EMAIL_B = `qa-b-${TS}@smoke-test.invalid`;
const PASSWORD = "QaPassw0rd!2026";
const ROOM_ID = `qa-room-${TS}`;
const GAME_ID = `qa-dupe-game-${TS}`;

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    failures.push(`${name} ${detail}`);
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function api(method, path, { token, body } = {}, retries = 5) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Render runs several instances, each with its OWN in-memory rate-limit
    // counter; a capped instance returns 429 while peers accept traffic.
    // Retrying lands on a healthy instance, so treat 429 as transient.
    if (res.status !== 429 || attempt >= retries) {
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* no body */
      }
      return { status: res.status, json };
    }
    await sleep(800 + attempt * 400);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll a condition for up to `ms` (default 8s) before giving up. */
async function waitFor(fn, ms = 8000, label = "condition") {
  const start = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - start > ms) {
      throw new Error(`waitFor timed out: ${label}`);
    }
    await sleep(150);
  }
}

/** Open a socket; resolves with { socket, events } once connected. */
function openSocket(token) {
  return new Promise((resolve, reject) => {
    const events = {}; // event name -> array of payloads
    // Eagerly create each bucket so `.length` reads never hit undefined.
    for (const ev of [
      "users_online",
      "lobby_list",
      "room_message",
      "room_history",
      "private_message",
      "incoming_challenge",
      "challenge_persisted",
      "party_created",
      "user_joined_party",
      "user_left_party",
      "challenge_lobby_ready",
      "party_ended",
      "game_state_update",
      "lobby_chat_message",
      "match_found",
    ]) {
      events[ev] = [];
    }
    const capture = (name) => (payload) => {
      events[name].push(payload);
    };
    const socket = io(BASE, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 15000,
    });
    for (const ev of [
      "users_online",
      "lobby_list",
      "room_message",
      "room_history",
      "private_message",
      "incoming_challenge",
      "challenge_persisted",
      "party_created",
      "user_joined_party",
      "user_left_party",
      "challenge_lobby_ready",
      "party_ended",
      "game_state_update",
      "lobby_chat_message",
      "match_found",
    ]) {
      socket.on(ev, capture(ev));
    }
    socket.on("connect", () => resolve({ socket, events }));
    socket.on("connect_error", (err) => reject(new Error(`connect_error: ${err.message}`)));
    setTimeout(() => reject(new Error("socket connect timeout")), 20000);
  });
}

const emit = (socket, ev, payload) => socket.emit(ev, payload);

// Module-scope volatile state so the error-path cleanup can reach it.
let tokenA, tokenB, idA, idB;
let sockA1, sockA2, sockB;

/** Best-effort removal of the throwaway QA users (never throws). */
async function cleanupUsers() {
  try {
    for (const s of [sockA1, sockA2, sockB]) {
      if (s?.socket) s.socket.disconnect();
    }
  } catch {
    /* best-effort */
  }
  try {
    if (tokenA && idA) await api("DELETE", `/user/${idA}`, { token: tokenA });
  } catch {
    /* best-effort */
  }
  try {
    if (tokenB && idB) await api("DELETE", `/user/${idB}`, { token: tokenB });
  } catch {
    /* best-effort */
  }
  tokenA = tokenB = idA = idB = null;
}

async function main() {
  try {
  // ── Phase 1: REST ───────────────────────────────────────────────────────────
  console.log("\n== Phase 1: REST ==");

  {
    const rA = await api("POST", "/auth/register", { body: { name: "QA Player A", email: EMAIL_A, password: PASSWORD } });
    const rB = await api("POST", "/auth/register", { body: { name: "QA Player B", email: EMAIL_B, password: PASSWORD } });
    ok("register user A (201 + token)", rA.status === 201 && !!rA.json?.token, `status=${rA.status} ${JSON.stringify(rA.json)}`);
    ok("register user B (201 + token)", rB.status === 201 && !!rB.json?.token, `status=${rB.status} ${JSON.stringify(rB.json)}`);
    tokenA = rA.json.token;
    tokenB = rB.json.token;
    idA = rA.json.user.id;
    idB = rB.json.user.id;
  }

  // Unauthenticated guard
  {
    const r = await api("GET", `/users/${idA}/blocks`);
    ok("blocklist requires auth (401)", r.status === 401, `status=${r.status}`);
    const rRoom = await api("GET", `/rooms/${ROOM_ID}/messages`);
    ok("room history requires auth (401)", rRoom.status === 401, `status=${rRoom.status}`);
  }

  // Blocklist happy path + authz
  {
    const empty = await api("GET", `/users/${idA}/blocks`, { token: tokenA });
    ok("initial blocklist empty", empty.status === 200 && Array.isArray(empty.json) && empty.json.length === 0, JSON.stringify(empty.json).slice(0, 120));

    const block = await api("PUT", `/users/${idA}/blocks/${idB}`, { token: tokenA });
    ok("PUT block A→B (200)", block.status === 200 && block.json.success === true, `status=${block.status} ${JSON.stringify(block.json)}`);

    const listed = await api("GET", `/users/${idA}/blocks`, { token: tokenA });
    ok("blocked user appears in list", listed.json?.some((u) => String(u.userId) === String(idB)), JSON.stringify(listed.json).slice(0, 120));

    const selfBlock = await api("PUT", `/users/${idA}/blocks/${idA}`, { token: tokenA });
    ok("self-block rejected (400)", selfBlock.status === 400, `status=${selfBlock.status}`);

    const cross = await api("GET", `/users/${idA}/blocks`, { token: tokenB });
    ok("cross-user blocklist access denied (403)", cross.status === 403, `status=${cross.status} ${JSON.stringify(cross.json)}`);

    const unblock = await api("DELETE", `/users/${idA}/blocks/${idB}`, { token: tokenA });
    ok("DELETE unblock (200)", unblock.status === 200 && unblock.json.success === true, `status=${unblock.status}`);

    const after = await api("GET", `/users/${idA}/blocks`, { token: tokenA });
    ok("blocklist empty after unblock", after.json?.length === 0, JSON.stringify(after.json).slice(0, 120));
  }

  // Challenge dedupe
  let challengeId1, challengeId2;
  {
    const c1 = await api("POST", `/users/${idA}/challenges`, {
      token: tokenA,
      body: { toUserId: String(idB), gameId: GAME_ID, gameName: "QA Dupe Game" },
    });
    ok("create challenge (201)", c1.status === 201 && c1.json?.id, `status=${c1.status} ${JSON.stringify(c1.json).slice(0, 160)}`);
    challengeId1 = c1.json?.id;

    await sleep(300);
    const c2 = await api("POST", `/users/${idA}/challenges`, {
      token: tokenA,
      body: { toUserId: String(idB), gameId: GAME_ID, gameName: "QA Dupe Game" },
    });
    ok("duplicate challenge returns SAME id (dedupe)", c2.status === 201 && c2.json?.id === challengeId1, `status=${c2.status} id1=${challengeId1} id2=${c2.json?.id}`);

    const pending = await api("GET", `/users/${idA}/challenges?status=pending`, { token: tokenA });
    ok("pending challenge list is an array (200)", pending.status === 200 && Array.isArray(pending.json), `status=${pending.status} body=${JSON.stringify(pending.json).slice(0, 160)}`);
    const sameGame = Array.isArray(pending.json)
      ? pending.json.filter((c) => c.gameId === GAME_ID && c.status === "pending")
      : [];
    ok("exactly ONE pending challenge row for game+pair", sameGame.length === 1, JSON.stringify(sameGame).slice(0, 160));

    // Recipient responds on their OWN route (matches challenge-inbox.service.ts).
    const respond = await api("POST", `/users/${idB}/challenges/${challengeId1}/respond`, { token: tokenB, body: { status: "declined" } });
    ok("recipient can decline (200, status=declined)", respond.status === 200 && respond.json?.status === "declined", `status=${respond.status} ${JSON.stringify(respond.json)}`);

    const wrongResponder = await api("POST", `/users/${idA}/challenges/${challengeId1}/respond`, { token: tokenA, body: { status: "accepted" } });
    ok("non-recipient cannot respond (403)", wrongResponder.status === 403, `status=${wrongResponder.status}`);

    const c3 = await api("POST", `/users/${idA}/challenges`, {
      token: tokenA,
      body: { toUserId: String(idB), gameId: GAME_ID, gameName: "QA Dupe Game" },
    });
    ok("re-challenge after decline allowed (new id)", c3.status === 201 && c3.json?.id !== challengeId1, `status=${c3.status} id1=${challengeId1} id3=${c3.json?.id}`);
    challengeId2 = c3.json?.id;
    const d2 = await api("POST", `/users/${idB}/challenges/${challengeId2}/respond`, { token: tokenB, body: { status: "declined" } });
    ok("recipient decline #2 (200)", d2.status === 200 && d2.json?.status === "declined", `status=${d2.status} ${JSON.stringify(d2.json)}`);
  }

  // Friends add/accept/remove (exercises the upsertFriend property-key fix)
  {
    const add = await api("POST", `/users/${idA}/friends/${idB}`, { token: tokenA });
    ok("add friend (200)", add.status === 200 && add.json?.success === true, `status=${add.status} ${JSON.stringify(add.json)}`);

    // Responder acts on their OWN route (matches social-networking.service.ts).
    const accept = await api("PATCH", `/users/${idB}/friends/${idA}`, { token: tokenB, body: { status: "accepted" } });
    ok("accept friend request (200)", accept.status === 200 && accept.json?.success === true, `status=${accept.status} ${JSON.stringify(accept.json)}`);

    const fr = await api("GET", `/users/${idA}/friends`, { token: tokenA });
    ok("friend listed with status accepted", (fr.json ?? []).some((f) => String(f.userId) === String(idB) && f.status === "accepted"), JSON.stringify(fr.json).slice(0, 140));

    const rm = await api("DELETE", `/users/${idA}/friends/${idB}`, { token: tokenA });
    ok("remove friend (200)", rm.status === 200 && rm.json?.success === true, `status=${rm.status} ${JSON.stringify(rm.json)}`);
  }

  // Room history REST (empty at this point)
  {
    const r = await api("GET", `/rooms/${ROOM_ID}/messages`, { token: tokenA });
    ok("room history returns array (empty)", r.status === 200 && Array.isArray(r.json) && r.json.length === 0, `status=${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  }

  // ── Phase 2: Sockets ────────────────────────────────────────────────────────
  console.log("\n== Phase 2: Sockets ==");

  sockA1 = await openSocket(tokenA);
  sockA2 = await openSocket(tokenA); // second socket for presence retention
  sockB = await openSocket(tokenB);
  console.log("  connected: A(1), A(2), B");

  // Presence
  emit(sockA1.socket, "register_presence", {
    metadata: { artistName: "QA Artist A", primaryGenre: "Neo Soul", location: "Metaverse", profileSetupCompleted: true },
  });
  emit(sockB.socket, "register_presence", {
    metadata: { artistName: "QA Artist B", primaryGenre: "Hip Hop" },
  });
  await sleep(1200);
  {
    const onlineA = sockB.events.users_online.at(-1) ?? [];
    const me = (id) => onlineA.find((u) => String(u.userId) === String(id));
    ok("both users appear online", !!me(idA) && !!me(idB), JSON.stringify(onlineA.map((u) => u.userId)).slice(0, 120));
    ok("presence metadata rides along", me(idA)?.artistName === "QA Artist A", JSON.stringify(me(idA)).slice(0, 120));
  }

  // Multi-socket presence retention: kill A's social socket, A stays online via sockA2
  sockA1.socket.disconnect();
  await sleep(1200);
  {
    const online = sockB.events.users_online.at(-1) ?? [];
    ok("user A still online after ONE socket dies (multi-socket retention)", online.some((u) => String(u.userId) === String(idA)), JSON.stringify(online.map((u) => u.userId)).slice(0, 140));
    ok("user B still online", online.some((u) => String(u.userId) === String(idB)), JSON.stringify(online.map((u) => u.userId)).slice(0, 140));
  }
  // Kill A's last socket -> A drops offline
  sockA2.socket.disconnect();
  await sleep(1200);
  {
    const online = sockB.events.users_online.at(-1) ?? [];
    ok("user A offline after ALL sockets die", !online.some((u) => String(u.userId) === String(idA)), JSON.stringify(online.map((u) => u.userId)).slice(0, 140));
  }

  // Reopen A's socket for the rest of the flows
  sockA1 = await openSocket(tokenA);
  emit(sockA1.socket, "register_presence", { metadata: { artistName: "QA Artist A" } });
  await sleep(800);

  // Authoritative lobby_list: create → join → leave → leader-leave
  {
    emit(sockA1.socket, "create_party", { gameId: "qa-lobby-game" });
    await sleep(600);
    let lobbies = sockB.events.lobby_list.at(-1) ?? [];
    ok("lobby_list broadcast on create_party", lobbies.some((l) => l.leaderId === String(idA) && l.memberCount === 1), JSON.stringify(lobbies).slice(0, 160));

    emit(sockB.socket, "join_party", { partyId: lobbies.find((l) => l.leaderId === String(idA))?.partyId });
    await sleep(600);
    lobbies = sockB.events.lobby_list.at(-1) ?? [];
    ok("lobby_list reflects join (memberCount=2)", lobbies.some((l) => l.leaderId === String(idA) && l.memberCount === 2), JSON.stringify(lobbies).slice(0, 160));

    emit(sockB.socket, "leave_party", { partyId: lobbies.find((l) => l.leaderId === String(idA))?.partyId });
    await sleep(600);
    lobbies = sockB.events.lobby_list.at(-1) ?? [];
    ok("lobby_list reflects leave (memberCount=1)", lobbies.some((l) => l.leaderId === String(idA) && l.memberCount === 1), JSON.stringify(lobbies).slice(0, 160));

    const partyId = lobbies.find((l) => l.leaderId === String(idA))?.partyId;
    emit(sockA1.socket, "leave_party", { partyId });
    await sleep(600);
    lobbies = sockB.events.lobby_list.at(-1) ?? [];
    ok("no ghost lobby after leader leaves (authoritative replace)", !lobbies.some((l) => l.leaderId === String(idA)), JSON.stringify(lobbies.map((l) => l.leaderId)).slice(0, 160));
  }

  // Persisted room chat
  {
    emit(sockA1.socket, "join_room", ROOM_ID);
    emit(sockB.socket, "join_room", ROOM_ID);
    await sleep(800);

    const before = sockB.events.room_message.length;
    emit(sockA1.socket, "send_room_message", { roomId: ROOM_ID, message: "hello from qa", fromUserName: "QA Artist A" });
    await sleep(1000);

    const received = sockB.events.room_message.filter((m) => m.roomId === ROOM_ID && m.message === "hello from qa");
    ok("room message broadcast to members", received.length >= 1 && sockB.events.room_message.length === before + 1, `before=${before} now=${sockB.events.room_message.length}`);

    emit(sockB.socket, "request_room_history", { roomId: ROOM_ID });
    await sleep(1000);
    const hist = sockB.events.room_history.at(-1);
    ok("room_history delivered with persisted message", hist?.roomId === ROOM_ID && (hist.messages ?? []).some((m) => m.message === "hello from qa"), JSON.stringify(hist).slice(0, 200));

    const rest = await api("GET", `/rooms/${ROOM_ID}/messages`, { token: tokenB });
    ok("REST history contains socket-sent message", rest.json?.some((m) => m.message === "hello from qa" && String(m.userId) === String(idA)), JSON.stringify(rest.json).slice(0, 200));
  }

  // Rate limiting on send_room_message (max 10 / 5s)
  {
    await sleep(5600); // clear the window used by the previous message
    const beforeCount = sockB.events.room_message.filter((m) => m.message?.startsWith("rate-msg-")).length;
    for (let i = 0; i < 15; i++) emit(sockA1.socket, "send_room_message", { roomId: ROOM_ID, message: `rate-msg-${i}`, fromUserName: "QA Artist A" });
    await sleep(1500);
    const received = sockB.events.room_message.filter((m) => m.message?.startsWith("rate-msg-")).length - beforeCount;
    ok(`rate limiter caps burst at 10 (got ${received})`, received === 10, `received=${received}`);
    const rest = await api("GET", `/rooms/${ROOM_ID}/messages`, { token: tokenB });
    const persistedBurst = (rest.json ?? []).filter((m) => m.message?.startsWith("rate-msg-")).length;
    ok(`only rate-limited set persisted (${persistedBurst})`, persistedBurst === 10, `persisted=${persistedBurst}`);
  }

  // Mutual block enforcement over sockets — block A→B, then both DM directions must be silent
  {
    await api("PUT", `/users/${idA}/blocks/${idB}`, { token: tokenA });
    await sleep(400); // block cache invalidated server-side

    const dmBefore = sockB.events.private_message.length;
    emit(sockA1.socket, "send_message", { toUserId: String(idB), message: "should be blocked" });
    const dmBeforeA = sockA1.events.private_message.length;
    emit(sockB.socket, "send_message", { toUserId: String(idA), message: "should be blocked too" });
    await sleep(1200);
    ok("DM A→B silently dropped (block)", sockB.events.private_message.length === dmBefore, `bReceived=${sockB.events.private_message.length - dmBefore}`);
    ok("DM B→A silently dropped (mutual block)", sockA1.events.private_message.length === dmBeforeA, `aReceived=${sockA1.events.private_message.length - dmBeforeA}`);

    const challengerInbox = sockA1.events.challenge_persisted.length;
    const recipientInbox = sockB.events.incoming_challenge.length;
    emit(sockA1.socket, "challenge_player", { toUserId: String(idB), gameId: "qa-blocked-game", gameName: "Blocked Game" });
    await sleep(1000);
    ok("socket challenge blocked (no emit either side)", sockA1.events.challenge_persisted.length === challengerInbox && sockB.events.incoming_challenge.length === recipientInbox, `a=${sockA1.events.challenge_persisted.length - challengerInbox} b=${sockB.events.incoming_challenge.length - recipientInbox}`);

    const restChallenge = await api("POST", `/users/${idA}/challenges`, { token: tokenA, body: { toUserId: String(idB), gameId: "qa-blocked-game", gameName: "Blocked Game" } });
    ok("REST challenge against blocked user rejected (403)", restChallenge.status === 403, `status=${restChallenge.status} ${JSON.stringify(restChallenge.json)}`);

    await api("DELETE", `/users/${idA}/blocks/${idB}`, { token: tokenA });
  }

  // Socket challenge → notification persistence → REST mark-read (exercises
  // the markNotificationRead isRead property-key fix)
  {
    emit(sockA1.socket, "challenge_player", { toUserId: String(idB), gameId: "qa-notif-game", gameName: "QA Notif Game" });
    await sleep(1200);
    const notifs = await api("GET", `/users/${idB}/notifications`, { token: tokenB });
    const incoming = Array.isArray(notifs.json)
      ? notifs.json.find((n) => n.type === "challenge_incoming" && n.payload?.challengeId)
      : null;
    ok("socket challenge persisted an incoming notification", !!incoming, JSON.stringify(notifs.json ?? notifs).slice(0, 200));
    if (incoming) {
      const mark = await api("POST", `/users/${idB}/notifications/${incoming.id}/read`, { token: tokenB });
      ok("mark notification read (200)", mark.status === 200 && mark.json?.success === true, `status=${mark.status} ${JSON.stringify(mark.json)}`);
      const after = await api("GET", `/users/${idB}/notifications?unreadOnly=true`, { token: tokenB });
      ok("notification no longer unread after read", !(after.json ?? []).some((n) => n.id === incoming.id), JSON.stringify(after.json).slice(0, 160));
      // Cleanup: decline the leftover pending challenge (recipient route).
      await api("POST", `/users/${idB}/challenges/${incoming.payload.challengeId}/respond`, { token: tokenB, body: { status: "declined" } });
    }
  }

  // ── Phase 2.5: Resolved-match lobbies + in-match relays ────────────────────
  console.log("\n== Phase 2.5: Resolved-match lobbies + relays ==");

  // Challenge ACCEPT provisions ONE shared lobby both players join.
  {
    const ACCEPT_GAME = `qa-accept-game-${TS}`;
    const c1 = await api("POST", `/users/${idA}/challenges`, {
      token: tokenA,
      body: { toUserId: String(idB), gameId: ACCEPT_GAME, gameName: "QA Accept Game" },
    });
    ok("challenge created for accept flow (201)", c1.status === 201 && c1.json?.id, `status=${c1.status} ${JSON.stringify(c1.json).slice(0, 140)}`);
    const acceptGameId = c1.json?.id;

    // Recipient ACCEPTS via their own REST route — the server must provision
    // a real lobby room and tell BOTH sides (challenge_lobby_ready).
    const a1 = await api("POST", `/users/${idB}/challenges/${acceptGameId}/respond`, {
      token: tokenB,
      body: { status: "accepted" },
    });
    ok("recipient accepts (200, status=accepted)", a1.status === 200 && a1.json?.status === "accepted", `status=${a1.status} ${JSON.stringify(a1.json)}`);

    await waitFor(
      () =>
        sockA1.events.challenge_lobby_ready.length >= 1 &&
        sockB.events.challenge_lobby_ready.length >= 1,
      10000,
      "challenge_lobby_ready on both sides"
    );
    const readyA = sockA1.events.challenge_lobby_ready.at(-1);
    const readyB = sockB.events.challenge_lobby_ready.at(-1);
    ok("challenge_lobby_ready delivered to BOTH players", !!readyA && !!readyB, JSON.stringify({ readyA, readyB }).slice(0, 200));
    ok("both sides get the SAME partyId", readyA?.partyId === readyB?.partyId && !!readyA?.partyId, JSON.stringify({ a: readyA?.partyId, b: readyB?.partyId }));
    ok("challenger/opponent ids match the pair", String(readyA?.challengerId) === String(idA) && String(readyA?.opponentId) === String(idB), JSON.stringify({ c: readyA?.challengerId, o: readyA?.opponentId }));
    const acceptPartyId = readyA?.partyId;

    // Both players join the provisioned room the way the client does.
    emit(sockA1.socket, "join_party", { partyId: acceptPartyId });
    emit(sockB.socket, "join_party", { partyId: acceptPartyId });
    await waitFor(() => {
      const list = sockB.events.lobby_list.at(-1) ?? [];
      return list.some((l) => l.partyId === acceptPartyId && l.memberCount === 2);
    }, 10000, "lobby_list advertises the resolved pair");
    ok("lobby_list advertises accepted match (memberCount=2)", true, acceptPartyId);

    // In-match relays: game_state_update + lobby_chat_message reach the peer.
    const statesBeforeB = sockB.events.game_state_update.length;
    const statesBeforeA = sockA1.events.game_state_update.length;
    const chatBeforeB = sockB.events.lobby_chat_message.length;
    emit(sockA1.socket, "game_state_update", { lobbyId: acceptPartyId, score: 7, progress: 20 });
    emit(sockA1.socket, "lobby_chat_message", { lobbyId: acceptPartyId, text: "lets go", id: `qa-c-${TS}`, timestamp: Date.now() });
    await waitFor(
      () => sockB.events.game_state_update.length > statesBeforeB && sockB.events.lobby_chat_message.length > chatBeforeB,
      10000,
      "relays reach the peer"
    );
    {
      const st = sockB.events.game_state_update.at(-1);
      const chat = sockB.events.lobby_chat_message.at(-1);
      ok("game_state_update relayed with score + sender", st?.score === 7 && String(st?.fromUserId) === String(idA), JSON.stringify(st).slice(0, 160));
      ok("lobby_chat_message relayed with text + sender", chat?.text === "lets go" && String(chat?.fromUserId) === String(idA), JSON.stringify(chat).slice(0, 160));
      ok("sender never receives its own relay echo", sockA1.events.game_state_update.length === statesBeforeA, `aGot=${sockA1.events.game_state_update.length - statesBeforeA}`);
    }

    // Leaving the resolved lobby ends the WHOLE match for the survivor.
    emit(sockB.socket, "leave_party", { partyId: acceptPartyId });
    await waitFor(() => sockA1.events.party_ended.length >= 1, 10000, "party_ended on survivor");
    {
      const ended = sockA1.events.party_ended.at(-1);
      ok("party_ended delivered to the survivor", ended?.partyId === acceptPartyId && ended?.reason === "player_left", JSON.stringify(ended));
      await waitFor(() => {
        const list = sockA1.events.lobby_list.at(-1) ?? [];
        return !list.some((l) => l.partyId === acceptPartyId);
      }, 8000, "resolved lobby removed from directory");
      ok("resolved lobby removed from directory after end", true, "");
    }
  }

  // Matchmaking queue pairing also provisions ONE shared lobby (match_found.partyId).
  {
    const QUEUE_GAME = `qa-queue-game-${TS}`;
    emit(sockA1.socket, "queue_for_match", { gameId: QUEUE_GAME });
    emit(sockB.socket, "queue_for_match", { gameId: QUEUE_GAME });
    await waitFor(
      () => sockA1.events.match_found.length >= 1 && sockB.events.match_found.length >= 1,
      12000,
      "match_found on both sides"
    );
    const mfA = sockA1.events.match_found.at(-1);
    const mfB = sockB.events.match_found.at(-1);
    ok("match_found carries opponent ids", String(mfA?.opponentId) === String(idB) && String(mfB?.opponentId) === String(idA), JSON.stringify({ a: mfA, b: mfB }).slice(0, 180));
    ok("match_found carries a shared partyId", !!mfA?.partyId && mfA?.partyId === mfB?.partyId, JSON.stringify({ a: mfA?.partyId, b: mfB?.partyId }));
    const queuePartyId = mfA?.partyId;
    emit(sockA1.socket, "join_party", { partyId: queuePartyId });
    emit(sockB.socket, "join_party", { partyId: queuePartyId });
    await waitFor(() => {
      const list = sockB.events.lobby_list.at(-1) ?? [];
      return list.some((l) => l.partyId === queuePartyId && l.memberCount === 2);
    }, 10000, "queue match appears in lobby directory");
    ok("queue match appears in lobby directory (memberCount=2)", true, queuePartyId);

    const endedBeforeQueue = sockB.events.party_ended.length;
    emit(sockA1.socket, "leave_party", { partyId: queuePartyId });
    await waitFor(
      () => sockB.events.party_ended.length > endedBeforeQueue,
      10000,
      "party_ended after queue match leaves"
    );
    {
      const ended = sockB.events.party_ended.slice(endedBeforeQueue).at(-1);
      ok("queue match ends for the other player too", ended?.partyId === queuePartyId, JSON.stringify(ended));
    }
    emit(sockB.socket, "cancel_match", { gameId: QUEUE_GAME });
  }

  // ── Phase 3: Cleanup ────────────────────────────────────────────────────────
  console.log("\n== Cleanup ==");
  sockA1.socket.disconnect();
  sockB.socket.disconnect();
  await sleep(500);

  const delA = await api("DELETE", `/user/${idA}`, { token: tokenA });
  const delB = await api("DELETE", `/user/${idB}`, { token: tokenB });
  ok("test user A deleted (204)", delA.status === 204, `status=${delA.status}`);
  ok("test user B deleted (204)", delB.status === 204, `status=${delB.status}`);
  tokenA = tokenB = idA = idB = null;
  } finally {
    await cleanupUsers(); // no-op after a clean Phase 3, rescues on mid-run errors
  }
}

main()
  .catch((err) => {
    fail += 1;
    failures.push(`uncaught: ${err.stack || err.message}`);
    console.error("\n❌ ERROR:", err.message);
  })
  .finally(async () => {
    // Belt-and-braces: never leak throwaway users, even on uncaught errors.
    await cleanupUsers();
    console.log(`\n===== SMOKE SUMMARY: ${pass} passed, ${fail} failed =====`);
    if (failures.length) console.log(failures.join("\n"));
    process.exit(fail ? 1 : 0);
  });