import { test, expect } from '@playwright/test';
import { seedAuthenticatedSession } from './helpers';

/**
 * Runtime verification for the S.M.U.V.E per-sentence voice spectrum
 * (commit 11ce91d "feat(smuve): rotate the full vocal spectrum every sentence").
 *
 * Headless Chromium ships no speech engine, so the spec installs a
 * deterministic speech-synthesis harness before the app boots. The harness:
 *   - answers getVoices() with named male / female / neutral voices,
 *   - records every SpeechSynthesisUtterance the app creates
 *     (text, pitch, rate, volume, assigned voice),
 *   - drains its queue one utterance at a time and fires onstart / onend,
 *     which is what drives the app's live "VOICE // …" readout,
 *   - samples the rendered readout so each sentence's archetype + band is
 *     captured in the exact order the app speaks them.
 *
 * The assertions mirror the commit contract: no sentence repeats the previous
 * tone, the whole archetype table is consumed before any tone repeats, pitch
 * spans deep male bass (<0.5) to high female soprano (>1.4), and the three
 * pitch bands alternate without back-to-back repeats.
 */

const HARNESS = String.raw`
(() => {
  const w = window;
  w.__smuveUtterances = [];
  w.__smuveReadouts = [];
  w.__smuveQueueDepth = 0;
  w.__smuveLastEndAt = 0;

  const VOICES = [
    { name: 'Fake Male Voice A', lang: 'en-US', default: true, localService: true, voiceURI: 'fake-male-a' },
    { name: 'Fake Male Voice B', lang: 'en-GB', default: false, localService: true, voiceURI: 'fake-male-b' },
    { name: 'Fake Female Voice A', lang: 'en-US', default: false, localService: true, voiceURI: 'fake-female-a' },
    { name: 'Fake Female Voice B', lang: 'en-AU', default: false, localService: true, voiceURI: 'fake-female-b' },
    { name: 'Fake Neutral Voice', lang: 'en-CA', default: false, localService: true, voiceURI: 'fake-neutral' }
  ];

  class FakeUtterance {
    constructor(text) {
      this.text = typeof text === 'string' ? text : String(text == null ? '' : text);
      this.lang = 'en-US';
      this.pitch = 1;
      this.rate = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onboundary = null;
      this.onmark = null;
      this.onpause = null;
      this.onresume = null;
    }
  }
  w.SpeechSynthesisUtterance = FakeUtterance;

  const queue = [];
  let processing = false;
  const PER_SENTENCE_MS = 140;

  function pump() {
    if (processing) return;
    const u = queue.shift();
    if (!u) {
      w.__smuveQueueDepth = 0;
      return;
    }
    processing = true;
    w.__smuveQueueDepth = queue.length + 1;
    w.__smuveUtterances.push({
      text: u.text,
      pitch: u.pitch,
      rate: u.rate,
      volume: u.volume,
      voiceName: u.voice ? u.voice.name : null,
      at: Date.now()
    });
    try { u.onstart && u.onstart({ type: 'start', utterance: u }); } catch (err) {}
    setTimeout(() => {
      try { u.onend && u.onend({ type: 'end', utterance: u }); } catch (err) {}
      processing = false;
      w.__smuveQueueDepth = queue.length;
      w.__smuveLastEndAt = Date.now();
      pump();
    }, PER_SENTENCE_MS);
  }

  const synth = {
    paused: false,
    pending: false,
    speaking: false,
    getVoices: () => VOICES,
    speak: (u) => { queue.push(u); pump(); },
    cancel: () => { queue.length = 0; processing = false; w.__smuveQueueDepth = 0; },
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

  // Capture the live readout in speech order (25ms sampling vs 140ms/sentence).
  const seen = w.__smuveReadouts;
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

/** Knowledge/AI-fallback prompts that return multi-sentence local replies. */
const PROMPTS = [
  'teach me royalties',
  'legal copyright and contracts',
  'sync licensing placements',
  'marketing promo and brand',
  'explain mix master and production',
];

test.describe('S.M.U.V.E voice spectrum (runtime)', () => {
  test.setTimeout(150_000);

  test('changes vocal tone every sentence and covers the full spectrum', async ({
    page,
  }) => {
    await page.addInitScript({ content: HARNESS });
    await seedAuthenticatedSession(page);

    await page.goto('/hub');
    await expect(page.locator('body')).toBeVisible();

    // Open the S.M.U.V.E advisor drawer.
    await page
      .locator('button[aria-label="Toggle S.M.U.V.E advisor"]')
      .first()
      .click();
    const input = page.locator('input[placeholder^="Command S.M.U.V.E 2.0"]');
    await expect(input).toBeVisible();
    const send = page.locator('button[aria-label="Send message to S.M.U.V.E"]');

    for (const prompt of PROMPTS) {
      if ((await page.evaluate(() => (window as any).__smuveReadouts.length)) >= 14)
        break;
      const before = await page.evaluate(
        () => (window as any).__smuveUtterances.length
      );
      await input.fill(prompt);
      await send.click();
      // Wait until this reply has produced new sentences and the whole voice
      // queue has drained (speech finished before the next message cancels it).
      await page.waitForFunction(
        ({ seen }) => {
          const w = window as any;
          return (
            w.__smuveUtterances.length > seen &&
            w.__smuveQueueDepth === 0 &&
            Date.now() - w.__smuveLastEndAt > 400
          );
        },
        { seen: before },
        { timeout: 70_000 }
      );
    }

    const data = await page.evaluate(() => ({
      utterances: (window as any).__smuveUtterances as Array<{
        text: string;
        pitch: number;
        rate: number;
        voiceName: string | null;
      }>,
      readouts: (window as any).__smuveReadouts as string[],
    }));

    const parts = data.readouts.map((line) =>
      line
        .replace(/^VOICE \/\/ /, '')
        .split(' · ')
        .map((piece) => piece.trim())
    );
    const archetypes = parts.map((p) => p[0] ?? '');
    const bands = parts.map((p) => p[1] ?? '');

    const report = archetypes.map((archetype, index) => {
      const u = data.utterances[index];
      return {
        sentence: index + 1,
        archetype,
        band: bands[index],
        pitch: u ? Number(u.pitch.toFixed(3)) : null,
        voice: u ? u.voiceName : null,
      };
    });
    const distinctTones = [...new Set(archetypes)];
    const pitches = data.utterances.map((u) => u.pitch);

    console.log('=== S.M.U.V.E VOICE SPECTRUM — OBSERVED ===');
    report.forEach((row) =>
      console.log(
        `  ${String(row.sentence).padStart(2)}. ${row.archetype} | band=${row.band} | pitch=${row.pitch} | ${row.voice}`
      )
    );
    console.log('  distinct tones:', distinctTones.length, JSON.stringify(distinctTones));
    console.log(
      '  pitch floor → ceiling:',
      Math.min(...pitches).toFixed(3),
      '→',
      Math.max(...pitches).toFixed(3)
    );
    console.log('  bands:', JSON.stringify(bands));

    expect(data.utterances.length).toBeGreaterThanOrEqual(11);

    // Every sentence changes tone — never the same tone twice in a row.
    for (let i = 1; i < archetypes.length; i++) {
      expect(
        archetypes[i],
        `sentence ${i + 1} repeated the previous tone (${archetypes[i]})`
      ).not.toBe(archetypes[i - 1]);
    }

    // The whole archetype table is consumed — all 11 distinct vocal tones.
    expect(distinctTones.length).toBe(11);
    expect(distinctTones).toContain('Deep Bass (Male)');
    expect(distinctTones).toContain('Soprano Elite (Female)');

    // Deep bass floor to soprano ceiling inside the run.
    expect(Math.min(...pitches)).toBeLessThan(0.5);
    expect(Math.max(...pitches)).toBeGreaterThan(1.4);

    // Pitch bands sweep low/mid/high, never twice in a row.
    expect(new Set(bands)).toEqual(new Set(['low', 'mid', 'high']));
    for (let i = 1; i < bands.length; i++) {
      expect(
        bands[i],
        `sentence ${i + 1} repeated the previous pitch band (${bands[i]})`
      ).not.toBe(bands[i - 1]);
    }

    // Browser voices rotate as well.
    expect(new Set(data.utterances.map((u) => u.voiceName)).size).toBeGreaterThan(
      1
    );
  });
});
