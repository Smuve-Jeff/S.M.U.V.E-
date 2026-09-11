#!/usr/bin/env node
/**
 * Probe new web-source candidates for live playability.
 *
 * A candidate is playable when its URL resolves 200..399 without
 * X-Frame-Options / frame-ancestors CSP blocking (inline-capable), or when it
 * is the provider's official player page for an already-established
 * external-only launch contract (gamepix.com/play/...).
 */
'use strict';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CRAZYGAMES = [
  'fireboy-and-watergirl-in-the-light-temple',
  'bubble-trouble',
  'bonkio',
  'moomoo',
  'starblast',
  'mini-royale-2',
  'drednot-io',
  'kour-io',
];

const GAMEPIX = [];

function frameBlocked(res) {
  const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
  const csp = (res.headers.get('content-security-policy') || '').toLowerCase();
  return (
    xfo.includes('deny') ||
    xfo.includes('sameorigin') ||
    (/frame-ancestors/.test(csp) && !/frame-ancestors[^;]*\*/.test(csp))
  );
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
    });
    clearTimeout(timer);
    const blocked = frameBlocked(res);
    return { url, status: res.status, blocked };
  } catch {
    clearTimeout(timer);
    return { url, status: 0, blocked: false };
  }
}

(async () => {
  console.log('== CrazyGames embed candidates ==');
  for (const slug of CRAZYGAMES) {
    const url = `https://games.crazygames.com/en_US/${slug}/index.html`;
    const r = await probe(url);
    console.log(
      `${r.status >= 200 && r.status < 400 && !r.blocked ? 'PLAY' : 'FAIL'} ${slug} status=${r.status} frameBlocked=${r.blocked}`
    );
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log('\n== GamePix player pages (external-only contract) ==');
  for (const slug of GAMEPIX) {
    const url = `https://www.gamepix.com/play/${slug}`;
    const r = await probe(url);
    console.log(
      `${r.status >= 200 && r.status < 400 ? 'OK  ' : 'FAIL'} ${slug} status=${r.status} frameBlocked=${r.blocked}`
    );
    await new Promise((r) => setTimeout(r, 350));
  }
})();
