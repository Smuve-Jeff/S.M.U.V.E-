"use strict";
/* Cleans up leaked QA users left behind by crashed runs of qa-prod-smoke.cjs.
 *
 * 1) Users whose JWT was persisted to /tmp/qa-creds.txt (run #1 of the smoke).
 * 2) Users from a run whose credentials were never persisted, recovered via a
 *    login sweep over the deterministic email budget:
 *        qa-<a|b>-<Date.now()>@smoke-test.invalid
 *    and the shared QaPassw0rd!2026 password.
 *
 * Run from repo root:  node scripts/qa-cleanup-prod.cjs
 * Never prints token values.
 */
const fs = require("fs");

const BASE = "https://www.smuvejeffpresents.com";
const API = `${BASE}/api`;
const PASSWORD = "QaPassw0rd!2026";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

(async () => {
  // 1) Recoverable pair (run #1): creds saved in /tmp/qa-creds.txt
  const raw = fs.readFileSync("/tmp/qa-creds.txt", "utf8");
  const grab = (k) => {
    const m = raw.match(new RegExp(`${k}=([^\\s]+)`));
    return m ? m[1] : null;
  };
  const credsPairs = [
    [grab("TOKEN_A"), grab("IDA")],
    [grab("TOKEN_B"), grab("IDB")],
  ].filter(([tok, id]) => tok && id);
  for (const [tok, id] of credsPairs) {
    const r = await api("DELETE", `/user/${id}`, { token: tok });
    console.log(`creds-run user ${id}: DELETE -> ${r.status}`);
  }

  // 2) Sweep un-persisted runs. Container clock is UTC, so Date.now() at each
  //    script start maps directly to the email suffix. Windows cover:
  //      run #0: users 4-5, first crash (~22:19-22:25)
  //      run #2: crashed pair after deploy trigger (~22:41-22:55)
  const windows = [
    [1788301100, 1788301500], // run #0
    [1788301660, 1788302100], // run #2 (extended)
  ];
  let swept = 0;
  for (const [start, end] of windows) {
    for (let ts = start; ts <= end; ts += 5) {
      for (const letter of ["a", "b"]) {
      const email = `qa-${letter}-${ts}@smoke-test.invalid`;
      const login = await api("POST", "/auth/login", { body: { email, password: PASSWORD } });
      swept += 1;
      if (login.status === 200 && login.json?.token) {
        const id = login.json.user?.id;
        const del = await api("DELETE", `/user/${id}`, { token: login.json.token });
        console.log(`sweep hit ${email} id=${id} DELETE -> ${del.status}`);
      } else if (login.status === 429) {
        console.log(`rate-limited at ts=${ts} letter=${letter}; backing off 5s`);
        await sleep(5000);
      }
      await sleep(120);
      }
    }
  }
  console.log(`sweep complete: ${swept} login attempts`);
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});