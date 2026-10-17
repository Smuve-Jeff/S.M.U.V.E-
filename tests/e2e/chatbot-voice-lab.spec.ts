import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Runtime verification for the S.M.U.V.E Voice Lab — the surface that lets the
 * artist hear the identity: audition any tone in the roster, run the full
 * spectrum, and pin the voice of the next reply.
 *
 * Headless Chromium ships no speech engine, so the spec installs a deterministic
 * harness before the app boots. It answers getVoices(), records every utterance
 * the app creates (text, pitch, rate, assigned voice), drains the queue one
 * sentence at a time (500 ms each, long enough to sample the readout), and
 * samples the rendered "VOICE // …" readout so each sentence's tone + texture is
 * captured in speech order.
 */

const HARNESS = String.raw`
(() => {
  const w = window;
  w.__labUtterances = [];
  w.__labReadouts = [];
  w.__labQueueDepth = 0;
  w.__labLastEndAt = 0;

  const VOICES = [
    { name: 'Fake Male Voice A', lang: 'en-US', default: true, localService: true, voiceURI: 'fake-male-a' },
    { name: 'Fake Male Voice B', lang: 'en-GB', default: false, localService: true, voiceURI: 'fake-male-b' },
    { name: 'Fake Female Voice A', lang: 'en-US', default: false, localService: true, voiceURI: 'fake-female-a' },
    { name: 'Fake Female Voice B', lang: 'en-AU', default: false, localService: true, voiceURI: 'fake-female-b' }
  ];

  class FakeUtterance {
    constructor(text) {
      this.text = String(text == null ? '' : text);
      this.lang = 'en-US';
      this.pitch = 1;
      this.rate = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  }
  w.SpeechSynthesisUtterance = FakeUtterance;

  const queue = [];
  let processing = false;
  const PER_SENTENCE_MS = 500;

  function pump() {
    if (processing) return;
    const u = queue.shift();
    if (!u) { w.__labQueueDepth = 0; return; }
    processing = true;
    w.__labQueueDepth = queue.length + 1;
    w.__labUtterances.push({
      text: u.text,
      pitch: u.pitch,
      rate: u.rate,
      volume: u.volume,
      voiceName: u.voice ? u.voice.name : null
    });
    try { u.onstart && u.onstart({ type: 'start', utterance: u }); } catch (err) {}
    setTimeout(() => {
      try { u.onend && u.onend({ type: 'end', utterance: u }); } catch (err) {}
      processing = false;
      w.__labQueueDepth = queue.length;
      w.__labLastEndAt = Date.now();
      pump();
    }, PER_SENTENCE_MS);
  }

  const synth = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => VOICES,
    speak: (u) => { queue.push(u); pump(); },
    cancel: () => { queue.length = 0; processing = false; w.__labQueueDepth = 0; },
    pause: () => {},
    resume: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  };
  try {
    Object.defineProperty(w, 'speechSynthesis', { get: () => synth, configurable: true });
  } catch (err) {
    w.speechSynthesis = synth;
  }

  // Sample the live readout so each spoken sentence is captured in order.
  const seen = w.__labReadouts;
  let last = null;
  setInterval(() => {
    const spans = document.querySelectorAll('span');
    let current = null;
    for (const span of spans) {
      const text = (span.textContent || '').trim();
      if (text.indexOf('VOICE //') === 0) { current = text; break; }
    }
    if (current && current !== last) {
      seen.push(current);
      last = current;
    }
  }, 25);
})();
`;

test.describe('S.M.U.V.E Voice Lab (runtime)', () => {
  test.setTimeout(150_000);

  test('auditions a tone, runs the spectrum, and pins the next reply', async ({
    page,
  }) => {
    await page.addInitScript({ content: HARNESS });
    await seedAuthenticatedSession(page);

    await page.goto('/hub');
    await expect(page.locator('body')).toBeVisible();

    await page
      .locator('button[aria-label="Toggle S.M.U.V.E advisor"]')
      .first()
      .click();

    // ── The lab renders the whole roster ──────────────────────────────
    await page.locator('button[aria-label="Open the Voice Lab"]').click();
    const roster = page.locator('button[aria-label^="Audition "]');
    await expect(roster).toHaveCount(11);
    await expect(page.getByText(/11 tones/)).toBeVisible();

    // ── Auditioning holds ONE tone, in that tone's own register ────────
    await page.locator('button[aria-label^="Audition Creature"]').click();
    await page.waitForFunction(
      () => (window as any).__labUtterances.length > 0,
      undefined,
      { timeout: 30_000 }
    );

    const audition = await page.evaluate(
      () => (window as any).__labUtterances[0]
    );

    console.log('=== VOICE LAB AUDITION — CREATURE ===');
    console.log(
      `  "${audition.text}" | voice=${audition.voiceName} | pitch=${Number(
        audition.pitch.toFixed(3)
      )} | rate=${Number(audition.rate.toFixed(3))}`
    );

    // Creature: pitchRange [0.15, 0.7], rateRange [0.4, 0.75].
    expect(audition.voiceName).toBeTruthy();
    expect(audition.pitch).toBeLessThanOrEqual(0.7);
    expect(audition.rate).toBeLessThanOrEqual(0.8);

    // The readout names the tone and its delivery texture.
    const auditionReadout = await page.waitForFunction(
      () =>
        ((window as any).__labReadouts as string[]).find((line: string) =>
          line.startsWith('VOICE // Creature')
        ) ?? null,
      undefined,
      { timeout: 20_000 }
    );
    const readoutLine = await auditionReadout.jsonValue();
    console.log('  readout: ' + readoutLine);
    expect(readoutLine).toContain('growl');

    // ── Pinning holds the register for exactly one reply ───────────────
    await page
      .locator('button[aria-label="Pin Creature for the next reply"]')
      .click();
    await expect(page.getByText(/PINNED → Creature/)).toBeVisible();

    const beforePin = await page.evaluate(
      () => (window as any).__labReadouts.length as number
    );
    const input = page.locator('input[placeholder^="Command S.M.U.V.E 2.0"]');
    await input.fill('teach me royalties');
    await page.locator('button[aria-label="Send message to S.M.U.V.E"]').click();
    await page.waitForFunction(
      ({ seen }) => {
        const w = window as any;
        return (
          w.__labReadouts.length > seen &&
          w.__labQueueDepth === 0 &&
          Date.now() - w.__labLastEndAt > 600
        );
      },
      { seen: beforePin },
      { timeout: 70_000 }
    );

    const pinnedReply = await page.evaluate(
      (seen) => ((window as any).__labReadouts as string[]).slice(seen),
      beforePin
    );

    console.log('=== VOICE LAB — PINNED REPLY ===');
    pinnedReply.forEach((line, index) => console.log(`  ${index + 1}. ${line}`));

    expect(pinnedReply.length).toBeGreaterThan(0);
    // Every sentence of the pinned reply holds the pinned register...
    pinnedReply.forEach((line, index) => {
      expect(line, `pinned reply sentence ${index + 1}`).toContain(
        'VOICE // Creature'
      );
    });
    // ...the pin is spent, so the badge stops advertising it...
    await expect(page.getByText(/PINNED → Creature/)).toHaveCount(0);

    // ── ...and the spectrum takes the next reply back ─────────────────
    const beforeSpectrum = await page.evaluate(
      () => (window as any).__labReadouts.length as number
    );
    await input.fill('sync licensing placements');
    await page.locator('button[aria-label="Send message to S.M.U.V.E"]').click();
    await page.waitForFunction(
      ({ seen }) => {
        const w = window as any;
        return (
          w.__labReadouts.length > seen &&
          w.__labQueueDepth === 0 &&
          Date.now() - w.__labLastEndAt > 600
        );
      },
      { seen: beforeSpectrum },
      { timeout: 70_000 }
    );

    const spectrum = await page.evaluate(
      (seen) => ((window as any).__labReadouts as string[]).slice(seen),
      beforeSpectrum
    );

    console.log('=== VOICE LAB — SPECTRUM RESUMED ===');
    spectrum.forEach((line, index) => console.log(`  ${index + 1}. ${line}`));

    expect(spectrum.length).toBeGreaterThan(1);
    const tones = spectrum.map(
      (line) => line.replace(/^VOICE \/\/ /, '').split(' · ')[0]
    );
    expect(tones[0]).toBe('Ominous Protocol');
    expect(new Set(tones).size).toBeGreaterThan(1);
  });
});
