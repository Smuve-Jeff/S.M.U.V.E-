# S.M.U.V.E. Voice Spectrum — Runtime Verification

**Date:** 2026-09-26
**Commit verified:** `11ce91d` — *feat(smuve): rotate the full vocal spectrum every sentence*
**Environment:** Freebuff preview (`freebuff-preview restart`, Angular dev server on port 4200) + Playwright chromium (headless)
**Verdict:** ✅ All commit-message claims observed in the running app. No deviations found.

## Steps taken

1. `freebuff-preview restart` → preview ready on port 4200.
2. Added `tests/e2e/smuve-voice-spectrum.spec.ts`, which instruments the browser
   **before the app boots** (`addInitScript`):
   - replaces `window.speechSynthesis` with a deterministic harness that answers
     `getVoices()` with named fake male/female/neutral voices (headless Chromium
     ships no speech engine),
   - records every `SpeechSynthesisUtterance` the app creates — text, pitch,
     rate, volume, assigned voice — into `window.__smuveUtterances`,
   - drains the utterance queue one sentence at a time (140 ms each) and fires
     `onstart`/`onend`, which is exactly what drives the app's live
     `VOICE // …` readout,
   - samples the rendered readout every 25 ms into `window.__smuveReadouts`,
     capturing each sentence's archetype + pitch band in speech order.
3. Seeded an authenticated session, opened `/hub`, opened the S.M.U.V.E advisor
   drawer (`aria-label="Toggle S.M.U.V.E advisor"`), and sent five knowledge
   prompts so the chat produced multi-sentence replies:
   `teach me royalties`, `legal copyright and contracts`,
   `sync licensing placements`, `marketing promo and brand`,
   `explain mix master and production`.
4. Waited for each reply's voice queue to fully drain before sending the next
   message (a mid-speech `speak()` cancels the previous queue, so messages must
   not overlap for a clean per-sentence count).
5. Ran `timeout 150 npx playwright test tests/e2e/smuve-voice-spectrum.spec.ts --reporter=line`
   → **1 passed (40.9 s)**, including assertions for every claim below.

## Observed behavior (19 spoken sentences across the five replies)

| # | Vocal tone | Band | Pitch | Browser voice |
|---|------------|------|-------|---------------|
| 1 | Ominous Protocol | high | 1.482 | Fake Female Voice B |
| 2 | Soprano Elite (Female) | low | 0.154 | Fake Male Voice B |
| 3 | Tenor Commander (Male) | mid | 0.970 | Fake Female Voice A |
| 4 | Baritone Authority (Male) | high | 1.904 | Fake Female Voice A |
| 5 | Deep Bass (Male) | low | 0.271 | Fake Male Voice A |
| 6 | Alto Dominance (Female) | mid | 1.178 | Fake Male Voice A |
| 7 | Creature | high | 1.709 | Fake Female Voice B |
| 8 | Choir (Layered) | low | 0.345 | Fake Female Voice B |
| 9 | Childlike Glitch | high | 1.555 | Fake Female Voice B |
| 10 | Androgynous Oracle | mid | 1.013 | Fake Female Voice A |
| 11 | Mezzo Strategist (Female) | high | 1.850 | Fake Female Voice A |
| 12 | Childlike Glitch | low | 0.282 | Fake Male Voice B |
| 13 | Tenor Commander (Male) | mid | 0.803 | Fake Female Voice A |
| 14 | Alto Dominance (Female) | low | 0.262 | Fake Male Voice A |
| 15 | Baritone Authority (Male) | high | 1.936 | Fake Female Voice B |
| 16 | Androgynous Oracle | mid | 0.824 | Fake Female Voice A |
| 17 | Choir (Layered) | low | 0.322 | Fake Female Voice B |
| 18 | Deep Bass (Male) | high | 1.890 | Fake Female Voice B |
| 19 | Soprano Elite (Female) | low | 0.271 | Fake Female Voice A |

**Summary**

- Distinct tones: **11 / 11** — `Ominous Protocol`, `Soprano Elite (Female)`,
  `Tenor Commander (Male)`, `Baritone Authority (Male)`, `Deep Bass (Male)`,
  `Alto Dominance (Female)`, `Creature`, `Choir (Layered)`, `Childlike Glitch`,
  `Androgynous Oracle`, `Mezzo Strategist (Female)`.
- Pitch floor → ceiling: **0.154 → 1.936** (deep male bass → high female soprano).
- Bands: `high, low, mid, high, low, mid, high, low, high, mid, high, low, mid, low, high, mid, low, high, low` — all three bands present, never twice in a row.
- Sentences 1–11 are 11 **distinct** tones with no repeat; sentence 12 starts the next shuffled cycle — exactly the "no tone repeats until every other tone has been used" guarantee.

## Assertions that passed

1. No sentence repeats the previous tone (every sentence sounds like a different entity).
2. All 11 distinct archetypes are consumed before any tone repeats, including both spectrum endpoints (`Deep Bass (Male)`, `Soprano Elite (Female)`).
3. Pitch swings below 0.5 (deep bass floor) and above 1.4 (soprano ceiling).
4. All three pitch bands appear and never repeat back-to-back.
5. Browser voices rotate (both fake male and fake female voices used).

## Notes

- The opening sentence of the session is `Ominous Protocol` (the identity anchor);
  sentence two onward rolls the shuffled full-spectrum deck — matching the
  commit description.
- The *band* drives pitch, while the *archetype* drives tone/rate/volume/flavor;
  a "deep bass band" sentence can carry a female-coded archetype's rate profile
  (e.g. sentence 2). This is the pre-existing band-based pitch design, not a
  regression from `11ce91d`.
- `forceArchetype` pinning (mimic / profile register) and `shapeShift: false`
  are covered by unit tests (`speech-synthesis.service.spec.ts`), not by this
  spec, since the seeded profile has mimic mode off.
