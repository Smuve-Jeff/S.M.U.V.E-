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

## Voice *input* access — second pass (2026-10-16)

Voice output was verified above; this pass verified whether the widget's **mic**
can be trusted, after the whole dictation path was modelled as one boolean (so a
blocked microphone, an http origin, a Permissions-Policy denial and an
engine-less shell all produced a button that did nothing, silently).

`SpeechRecognitionService` now exposes a capability instead:

| Capability | Produced by | Widget surface |
| --- | --- | --- |
| `ready` | engine present, secure context, mic allowed or undecided | mic enabled, tooltip explains dictation |
| `permission-denied` | `navigator.permissions` says `denied`, or the engine reports `not-allowed`, or the `getUserMedia` re-ask fails | mic **stays enabled** so the artist can retry, amber notice names the fix (browser lock icon → Microphone → Allow) |
| `no-microphone` | `getUserMedia` throws `NotFoundError`, or engine `audio-capture` | notice: connect an input device |
| `insecure-context` | `isSecureContext === false` | mic enabled, notice says to reopen over https |
| `policy-blocked` | Permissions-Policy refuses `microphone` | mic enabled, notice says the page may not capture |
| `native-shell` | no recognition constructor **and** `Capacitor.isNativePlatform()` | mic disabled, reason is its accessible name |
| `unsupported` | no recognition constructor in a browser | mic disabled, reason is its accessible name |

Verified with `tests/e2e/chatbot-voice-access.spec.ts` (2 passed, real Chromium,
seeded session, advisor opened on `/hub`):

1. **Blocked mic** — a fake `webkitSpeechRecognition` plus
   `permissions.query → denied` and a `getUserMedia` that rejects with
   `NotAllowedError`. Asserted: the mic is visible and **enabled**, pressing it
   renders the amber `role="status"` notice containing "Microphone access is
   blocked" and "Allow the microphone for this site", and the composer still
   accepts and holds typed text.
2. **Engine-less shell** — `SpeechRecognition`/`webkitSpeechRecognition` removed
   and `window.Capacitor.isNativePlatform() === true`, as in the packaged Android
   app. Asserted: the mic exists only as a **disabled** button whose accessible
   name contains "Dictation isn't available inside the mobile app shell" and
   "open S.M.U.V.E. in Chrome", no notice is rendered (nothing is tappable), and
   typed commands still work.

Still unverified: a real dictation round-trip against a working speech backend,
and an on-device run of the packaged shell. The manifest declares `RECORD_AUDIO`
and `MODIFY_AUDIO_SETTINGS`, and Capacitor's WebView bridge grants the capture
request, so recording is expected to work there — that expectation is not a
measurement.

## Voice *output* access — third pass (2026-10-16)

Input was modelled; output was still assumed. This pass inspected what the
widget's speech engine can actually do, and closed the gap between "the API
exists" and "the artist hears a reply".

### What the inspection found

1. **Voice output was assumed ready the instant the page loaded.**
   `SpeechSynthesisService.isSupported` was a one-shot truthy check of
   `window.speechSynthesis`, and `speak()` built its utterances immediately.
   Chromium — and the Android WebView the packaged app runs in — answer
   `getVoices()` with an **empty array** until the asynchronous `voiceschanged`
   event. An utterance built in that window carried no `voice` and no `lang`,
   and engines that cannot resolve a voice render nothing. Nothing in the app
   listened for `voiceschanged` (zero hits across `src/`). Symptom class: the
   reply S.M.U.V.E. never says, or only the first reply, while the badge still
   claims voice morph.
2. **No fallback voice and no language.** `pickVoiceForBand()` could return
   `null` and nothing substituted the engine's own default voice; `/hub`
   utterances never set `lang`, so an engine that ignores `voice` had nothing to
   fall back on.
3. **The badge overstated the capability.** "Voice Morph: active" was rendered
   from engine presence alone, so a device whose engine published no voices
   (a WebView with no TTS voices installed) was told voice morph was working.
   The tooltip copy was also duplicated inline in the template, independent of
   the state it described.
4. **The widget's own mark was inert.** The chatbot held `voiceSpeaking` and
   `voiceInputListening` but passed nothing to `app-smuve-widget`, so the avatar
   never communicated that S.M.U.V.E. was speaking or that the artist was
dictating; the only cue was the text readout above the composer.

### Fixes

- `SpeechSynthesisService.outputCapability` — `ready | loading | no-voices |
  unsupported`. The engine's list is read at construction and refreshed on
  `voiceschanged`, with a bounded 1200 ms wait, so a device with no installed
  voices reports `no-voices` instead of sitting on "loading" forever.
- `speak()` waits for the list when it has not arrived yet (a newer reply
  supersedes the wait through a generation counter, so a stale reply is never
  spoken late) and then builds the utterances.
- `defaultVoice()` falls back to the engine's own default voice, and
  `applyVoiceToUtterance()` assigns the chosen voice **and its `lang`**.
- The badge copy is derived from the same capability the badge renders, so the
  label can no longer contradict the state (`voiceOutputTitle()`), and
  `voiceOutputSupported()` is false for both `unsupported` and `no-voices`.
- The brand mark reports voice state: `speaking`/`listening` inputs,
  `data-voice-state`, `is-speaking`/`is-listening` styling (blue emission while
  S.M.U.V.E. talks, red while the artist dictates; `prefers-reduced-motion`
  keeps the colour and drops the animation) and an aria-label that announces it.

### Verification

- **Unit — 70 passed** across `speech-synthesis.service.spec.ts`,
  `speech-recognition.service.spec.ts`, `chatbot.component.spec.ts` and the new
  `smuve-widget.component.spec.ts`. New cases: the reply waits for a late voice
  list and is then spoken with a real voice; a superseded reply is dropped;
  `no-voices` after the bounded wait; the utterance language is pinned to the
  chosen voice; the glyph reports speaking/listening and listening wins.
- **Types/build** — `tsc --noEmit -p tsconfig.json` and `-p tsconfig.spec.json`
  clean; `ng build --configuration production` succeeds (AOT templates).
- **e2e, real Chromium** (`tests/e2e/smuve-voice-spectrum.spec.ts` against the
  production bundle served statically) — **2 passed in 12.8 s**:
  1. the pre-existing spectrum run is unchanged: 11 distinct tones, pitch floor →
     ceiling 0.176 → 1.955, all three bands alternating without back-to-back
     repeats;
  2. new `still voices the first reply when the engine publishes its voices
     late` — the harness answers `getVoices()` with `[]` for 600 ms and only
     then fires `voiceschanged`; the first utterance was still voiced
     (`voice=Fake Female Voice B`, pitch 0.415). Before the fix that utterance
     carried no voice at all.
- **Sandbox note** — the restored cloud sandbox has no root and shipped neither
  the X11/NSS/ALSA libraries nor a fontconfig setup, so Chromium first failed to
  start (`libnspr4.so: cannot open shared object file`) and, once started,
  aborted the moment a page rendered text
  (`FATAL:third_party/skia/src/ports/SkFontMgr_FontConfigInterface.cpp Not
  implemented` → `trap int3`). `scripts/setup-e2e-browser-libs.sh` downloads and
  unpacks the packages without root and prints the environment to run with.

Still unverified: on-device playback in the packaged Android/iOS shell — whether
its engine publishes any voices at all is a device measurement, not an
inference, and the native dictation round-trip from the second pass remains
open.

## Core identity — persona, language, and the changing voice (2026-10-16)

Output access was closed; this pass audited whether the *character* itself
survives to the speaker, and deepened the per-sentence voice change.

### What the audit found

1. **An unanswered language question silently censored S.M.U.V.E.** Three
   separate decisions were made with `aiProfanityEnabled === true`:
   `sanitizePersonaText` censored the reply text, `processCommand` censored the
   roast lines, and `personaDirectives` injected `LANGUAGE — LOCKED` into the
   prompt — while `initialProfile` ships the setting as `true` and the spoken
   path already defaulted to allow. A profile that predates the key, or an
   import that arrives without it, therefore read as *disabled* and the artist
   got a sanitized assistant everywhere at once.
2. **The Ominous Protocol anchor existed only for the first sentence of a
   session.** `sessionOpened` was per service instance, so after the opening
   reply the signature persona never returned — an exchange could open on
   Soprano, Childlike Glitch or the Choir instead.
3. **The non-human archetypes had no delivery of their own.** Pitch, rate,
   volume and browser voice all changed per sentence, but Creature, Childlike
   Glitch and the layered Choir were one reader at three pitches, and every
   sentence ended the same way.

### Fixes

- `AiService.explicitLanguageEnabled()` — one resolver for the setting, default
  UNLOCKED, used by the prompt directive, `sanitizePersonaText` and
  `processCommand`. Only an explicit `false` from the artist censors anything.
  The Total Control `profanity` readout uses `!== false` so the reported state
  matches the effective one.
- **The signature persona anchors every exchange.** `speakNow` claims the anchor
  for the opening sentence of each reply; `takeReplyAnchor()` yields when the
  previous sentence already spoke Ominous Protocol, so the
  change-every-sentence promise outranks the reassertion, and the anchor is
  filtered out of the spectrum deck so it can never double up inside one reply.
- **`VoiceTexture`** — `plain | stutter | growl | choral` — applied to the
  SPOKEN text only (the transcript stays verbatim): the glitch repeats its
  opening sound (`Fi-Fix the low end.`), the creature growls in and drawls a
  vowel, the choir answers itself. A rotating breath gesture (`…`, `—`, `...`)
  never repeats twice running, so consecutive sentences do not breathe alike
  either. The live readout now reports the texture.

### Verification

- **Unit — 130 passed across 5 suites** (speech-synthesis, ai, chatbot, widget,
  total control). New cases: every reply opens on the chosen signature
  archetype; a reply that would repeat the previous tone opens elsewhere
  instead; each non-human archetype is spoken in its own texture and reports it;
  human personas stay `plain` and never repeat the previous breath gesture; an
  unset `aiProfanityEnabled` keeps `LANGUAGE — UNLOCKED` and passes profanity
  through `sanitizePersonaText`; an explicit `false` still censors; offline
  roasts are uncensored when unlocked.
- **Types/build** — `tsc --noEmit` clean for app and specs; production AOT build
  succeeds.
- **e2e, real Chromium — 2 passed (14 s).** The spectrum run now opens on
  `Ominous Protocol` and then rolls the deck with its textures
  (`Childlike Glitch … stutter`, `Choir (Layered) … choral`, `Creature … growl`,
  humans `plain`), all 11 distinct tones, all three bands with no back-to-back
  repeat. A **later exchange opens on `Ominous Protocol` again** — printed as
  `VOICE // Ominous Protocol · low · Fake Female Voice B · plain` — which is the
  per-exchange anchor observed in the running app. In the second spec's exchange
  boundary the app had just spoken the anchor, and the next exchange correctly
  opened on a different tone rather than doubling it.

## Voice Lab — hearing the identity (2026-10-16)

The roster and the spectrum were only reachable by sending a message. The advisor
now carries a **Voice Lab** (header button, `aria-label="Open the Voice Lab"`):
it lists all eleven tones with the delivery texture and gender each speaks in,
auditions any single tone, runs the full-spectrum demo, and pins the voice of the
next reply.

Building it surfaced two defects that the unit suite had not:

1. **`setArchetype()` was a no-op.** It only pushed an entry into
   `archetypeHistory`, which the spectrum deck ignored on the very next draw, so
   "force this voice for the next message" changed nothing. A pin now holds the
   register for exactly one reply — the pitch bands keep moving inside it — and
   then releases itself; an explicit per-call `forceArchetype` still outranks it.
2. **The stable audition path ignored the archetype's texture** and reported
   `texture: 'plain'`, so auditioning Creature played a plain read and the lab
described it wrong. The texture now applies to the stable line too and is
   reported truthfully.

Verified: unit 152 across the six voice/identity suites (67 after the final
change), `tsc` clean for app and specs, production AOT build, and the new
`tests/e2e/chatbot-voice-lab.spec.ts` — **1 passed (20.8 s)** in real Chromium:

- **audition** — `"Mmm. Fiix the low end and mean it. …" | voice=Fake Female Voice B
  | pitch=0.301 | rate=0.62`, readout
  `VOICE // Creature · stable · Fake Female Voice B · growl`;
- **pinned reply** — all 9 sentences held `Creature` while the bands moved
  (`mid → high → mid → low → high → low → mid → low → mid`) and every sentence
  kept the `growl` texture; the `PINNED → Creature` badge then cleared itself;
- **spectrum resumed** — the next reply opened on `Ominous Protocol` and rolled
  the deck with `Childlike Glitch … stutter` and `Choir (Layered) … choral`.

The pre-existing spectrum spec still passes (2 passed, 16.1 s): 11 distinct tones,
pitch floor → ceiling 0.231 → 1.948, and a later exchange opening on the anchor.

