/**
 * audit-playability.cjs — "are all games actually playable?" sweep.
 *
 * For every row in the canonical JSON feed:
 *   1. Verifies the launch target resolves to a real cabinet:
 *      - local `/assets/...` targets must exist under `src/assets/`.
 *      - remote https targets are probed (HEAD, then GET fallback) and the
 *        HTTP status recorded.
 *   2. Verifies cover-art files that are supposed to be real (under
 *      `assets/games/`) exist on disk.
 *
 * Results persist to /tmp/playability.json and the run RESUMES across
 * invocations (already-probed rows are skipped), so the remote sweep can be
 * executed in several bounded foreground chunks:
 *     node scripts/audit-playability.cjs --local     # file checks only
 *     node scripts/audit-playability.cjs --remote    # probe until complete
 *     node scripts/audit-playability.cjs --summary   # print problem rows
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_FEED = path.join(ROOT, 'src', 'assets', 'data', 'tha-spot-feed.json');
const OUT = '/tmp/playability.json';
const LOCAL_ASSET_ROOT = path.join(ROOT, 'src', 'assets');
const CONCURRENCY = 14;
const TIMEOUT_MS = 7000;
// Several premium hosts (Cloudflare-fronted .io sites, rocketleague.com,
// epicgames.com, garticphone.com, ...) return 403 to non-browser user agents
// while serving real players fine. Probe with a realistic Chrome UA so the
// sweep only flags genuinely dead targets.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const feed = JSON.parse(fs.readFileSync(JSON_FEED, 'utf8'));
const games = feed.games || [];

function toLocalPath(url) {
  const clean = String(url).replace(/^\.?\//, '');
  if (!clean.startsWith('assets/')) return null;
  return path.join(LOCAL_ASSET_ROOT, clean.slice('assets/'.length));
}

const classify = (url) =>
  !url ? 'none' : /^https?:\/\//i.test(url) ? 'remote' : 'local';

let results = [];
if (fs.existsSync(OUT)) {
  try {
    results = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    results = [];
  }
}
const byId = new Map(results.map((r) => [r.id, r]));

for (const game of games) {
  if (byId.has(game.id)) continue;
  const target =
    game.launchConfig?.approvedEmbedUrl ||
    game.launchConfig?.approvedExternalUrl ||
    game.url ||
    '';
  const row = {
    id: game.id,
    name: game.name,
    target,
    kind: classify(target),
    ok: null,
    note: '',
  };
  const image = game.image || '';
  if (image.startsWith('assets/games/')) {
    const art = toLocalPath(image);
    row.artOk = !!art && fs.existsSync(art);
    if (!row.artOk) row.note += `ART-MISSING ${art}`;
  }
  if (row.kind === 'local') {
    const file = toLocalPath(target);
    row.ok = !!file && fs.existsSync(file);
    row.note += row.ok ? '' : `MISSING ${file}`;
    row.note = row.note || 'file-present';
  } else if (row.kind === 'none') {
    row.ok = false;
    row.note = 'NO-LAUNCH-TARGET';
  }
  byId.set(game.id, row);
}
results = [...byId.values()];

function flush() {
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
}

async function probeOne(url) {
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers:
          method === 'GET'
            ? {
                range: 'bytes=0-0',
                'user-agent': BROWSER_UA,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.9',
              }
            : {
                'user-agent': BROWSER_UA,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.9',
              },
      });
      clearTimeout(timer);
      return { status: res.status, finalUrl: res.url };
    } catch {
      clearTimeout(timer);
      return null;
    }
  };
  const head = await attempt('HEAD');
  if (head && head.status < 500) return head;
  const get = await attempt('GET');
  return get || { status: 0, finalUrl: '' };
}

async function main() {
  const mode = process.argv.includes('--local')
    ? 'local'
    : process.argv.includes('--remote')
      ? 'remote'
      : 'summary';

  if (mode === 'local' || mode === 'remote') {
    const targetsToProbe = new Set(
      results
        .filter((r) => (mode === 'remote' ? r.kind === 'remote' : false))
        .map((r) => r.target)
    );
    let done = 0;
    const queue = [...targetsToProbe];

    // Re-probe rows whose status is unknown only; anything else already done.
    const pending = new Set(
      results.filter((r) => r.ok === null).map((r) => r.target)
    );
    const slice = queue.filter((u) => pending.has(u));

    if (mode === 'local') {
      // Nothing left to do in local mode (already evaluated above).
      console.log(`local sweep done: ${results.length} games evaluated`);
      return;
    }

    const worker = async () => {
      while (slice.length) {
        const url = slice.shift();
        const { status, finalUrl } = await probeOne(url);
        const ok = status >= 200 && status < 400;
        for (const r of results) {
          if (r.target !== url) continue;
          r.ok = ok;
          r.status = status;
          r.finalUrl = finalUrl;
          r.note = status === 0 ? 'UNREACHABLE/TIMEOUT' : `http ${status}`;
        }
        done += 1;
        if (done % 20 === 0) flush();
      }
    };
    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
    flush();
    const remaining = results.filter((r) => r.ok === null);
    console.log(
      `remote chunk done: ${done} probed, ${remaining.length} still pending (${slice.length + remaining.length})`
    );
    return;
  }

  // Summary mode
  const bad = results.filter((r) => r.ok !== true || r.artOk === false);
  const remote = results.filter((r) => r.kind === 'remote');
  const remoteDone = remote.filter((r) => r.ok !== null);
  console.log(
    `total ${results.length} games | remote ${remote.length} (${remoteDone.length} probed) | problems ${bad.length}`
  );
  bad.forEach((r) =>
    console.log('  !', r.id, '|', r.note, '|', (r.target || '').slice(0, 90))
  );
}

main().catch((err) => {
  console.error('audit-playability failed:', err);
  process.exit(1);
});
