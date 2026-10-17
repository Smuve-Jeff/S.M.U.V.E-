'use strict';

/**
 * Render web service entry point.
 *
 * The cinema engine is a browser library, so this service exposes what a
 * deployment can usefully serve: a health check, the engine's effect/filter
 * catalogues and a page that confirms which commit is live.
 */

const http = require('node:http');
const pkg = require('./cinema-engine/package.json');

const PORT = Number(process.env.PORT) || 10000;
const HOST = '0.0.0.0';
const COMMIT = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '';
const BRANCH = process.env.RENDER_GIT_BRANCH || '';
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || '';

let engine = null;
let engineError = null;

try {
  engine = require('./cinema-engine/dist');
} catch (err) {
  engineError = err && err.message ? err.message : String(err);
}

/** Read a catalogue that the classes keep on `this` at runtime. */
function catalogue(key, ClassRef) {
  if (typeof ClassRef !== 'function') return [];
  try {
    const instance = new ClassRef();
    const value = instance[key];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function capabilities() {
  if (!engine) {
    const err = new Error(`cinema-engine could not be loaded: ${engineError}`);
    err.statusCode = 503;
    throw err;
  }

  return {
    name: pkg.name,
    version: pkg.version,
    effects: catalogue('effects', engine.SpecialEffects),
    filters: catalogue('filters', engine.Filters),
    transitions: catalogue('transitions', engine.Transitions),
    exports: Object.keys(engine).sort(),
  };
}

function buildInfo() {
  return {
    commit: COMMIT || null,
    branch: BRANCH || null,
    url: EXTERNAL_URL || null,
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

function health() {
  const body = {
    status: engine ? 'ok' : 'degraded',
    engine: engine ? 'loaded' : 'failed',
    ...buildInfo(),
  };
  if (!engine) body.error = engineError;
  return body;
}

function page(info, caps) {
  const list = (items) =>
    items.length
      ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      : '<li class="muted">unavailable</li>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cinema Engine</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 3rem 1.5rem; background: #0b0d12; color: #e7ebf3;
         font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 780px; margin: 0 auto; }
  h1 { margin: 0 0 .25rem; font-size: 2rem; letter-spacing: -.02em; }
  .sub { color: #8b94a7; margin: 0 0 2rem; }
  .badge { display: inline-block; padding: .15rem .6rem; border-radius: 999px;
           background: ${engine ? '#14361f' : '#3a1a1a'}; color: ${engine ? '#5ddb8f' : '#ff9a9a'};
           font-size: .8rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  section { border: 1px solid #1e2330; border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1rem; }
  h2 { margin: 0 0 .75rem; font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; color: #8b94a7; }
  ul { display: flex; flex-wrap: wrap; gap: .4rem; list-style: none; padding: 0; margin: 0; }
  li { background: #151a25; border-radius: 6px; padding: .1rem .5rem; font-size: .85rem; font-family: ui-monospace, monospace; }
  li.muted { background: none; color: #8b94a7; }
  code { font-family: ui-monospace, monospace; background: #151a25; padding: .1rem .35rem; border-radius: 4px; }
  a { color: #7aa2ff; }
</style>
</head>
<body>
<main>
  <h1>Cinema Engine <span class="badge">${engine ? 'live' : 'degraded'}</span></h1>
  <p class="sub">${escapeHtml(pkg.description)}</p>

  <section>
    <h2>Build</h2>
    <p>v${escapeHtml(pkg.version)} · branch <code>${escapeHtml(info.branch || 'unknown')}</code>
       · commit <code>${escapeHtml((info.commit || 'unknown').slice(0, 7))}</code>
       · Node ${escapeHtml(info.node)}</p>
    ${engine ? '' : `<p><strong>Engine failed to load:</strong> <code>${escapeHtml(engineError || '')}</code></p>`}
  </section>

  <section><h2>Effects (${caps ? caps.effects.length : 0})</h2><ul>${list(caps ? caps.effects : [])}</ul></section>
  <section><h2>Filters (${caps ? caps.filters.length : 0})</h2><ul>${list(caps ? caps.filters : [])}</ul></section>
  <section><h2>Transitions (${caps ? caps.transitions.length : 0})</h2><ul>${list(caps ? caps.transitions : [])}</ul></section>

  <section>
    <h2>Endpoints</h2>
    <p><a href="/health">/health</a> · <a href="/api/capabilities">/api/capabilities</a> · <a href="/api">/api</a></p>
    <p class="muted">Browser-side video analysis, sprite sheets and uploads live in the
       <code>cinema-engine</code> package, not in this service.</p>
  </section>
</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'method not allowed', method: req.method }, { allow: 'GET, HEAD' });
  }

  if (route === '/health') {
    const body = health();
    return sendJson(res, engine ? 200 : 503, body);
  }

  if (route === '/api' || route === '/api/') {
    return sendJson(res, 200, {
      name: pkg.name,
      description: pkg.description,
      endpoints: ['/health', '/api/capabilities', '/'],
      ...buildInfo(),
    });
  }

  if (route === '/api/capabilities') {
    try {
      return sendJson(res, 200, capabilities());
    } catch (err) {
      return sendJson(res, err.statusCode || 500, { error: err.message });
    }
  }

  if (route === '/') {
    let caps = null;
    try {
      caps = capabilities();
    } catch {
      caps = null;
    }
    const html = page(buildInfo(), caps);
    res.writeHead(engine ? 200 : 503, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(html),
      'cache-control': 'no-store',
    });
    return res.end(req.method === 'HEAD' ? undefined : html);
  }

  return sendJson(res, 404, { error: 'not found', path: url.pathname });
});

server.listen(PORT, HOST, () => {
  console.log(`cinema-engine service listening on http://${HOST}:${PORT} (commit ${COMMIT || 'unknown'})`);
  if (!engine) console.error(`cinema-engine failed to load: ${engineError}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, closing server`);
    server.close(() => process.exit(0));
  });
}
