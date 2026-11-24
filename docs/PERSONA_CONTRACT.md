# S.M.U.V.E. Persona Contract

The character is the product. These are the promises the app makes about it,
where each one is enforced, and the test that fails if it is traded away.
`src/app/services/persona-contract.spec.ts` is the executable copy of this
page — change one, change both.

## 1. The persona is never softened by default

- The character is ominous, arrogant, and profane when the artist has not
  explicitly turned profanity off.
- `AiService.explicitLanguageEnabled()` resolves the setting once, and defaults
  **unlocked**: only an explicit `false` censors.
- The prompt carries `LANGUAGE — UNLOCKED (artist-enabled)` and the offline
  roast lines pass profanity through.
- Turning it off removes the profanity, never the arrogance: the prompt keeps
  `LANGUAGE — LOCKED (artist-disabled)` with the menace intact.

Enforced in `ai.service.ts`; covered by `ai.service.spec.ts`
("an unset `aiProfanityEnabled` keeps LANGUAGE — UNLOCKED", "an explicit false
still censors").

## 2. Every sentence is a different entity

- A reply is split into sentences; each sentence is its own utterance.
- The archetype comes from a shuffled deck of every distinct tone, consumed one
  card per sentence. No tone repeats until every other tone has spoken.
- Pitch stays inside that tone's register, and the registry spans deep bass
  (below 0.5) to soprano (above 1.4).
- Texture belongs to the non-human personas: Childlike Glitch stutters,
  Creature growls, the Choir answers itself. Human personas stay plain.
- The **transcript the artist reads is verbatim**; texture and breath gestures
  are applied to the spoken line only.

Enforced in `speech-synthesis.service.ts`; covered by
`speech-synthesis.service.spec.ts`.

## 3. The voice is human-quality when the device has any

- Novelty and formant voices (Zarvox, Bells, Albert, eSpeak, Festival, …) are
  excluded from the rotation.
- Neural, premium/enhanced and vendor voices are dealt first; every curated
  voice is used before one repeats.
- A device with only novelty voices keeps them — silence is worse than a toy.
- The Voice Lab reports the human voices actually in rotation and the novelty
  voices excluded, so the claim is visible, not just internal.

Enforced in `speech-synthesis.service.ts` (`partitionVoices`,
`buildVoiceDeck`); covered by the "human voice selection" cases and the chatbot
Voice Lab cases.

## 4. The badge never claims more than the device can do

- `unsupported` (no engine) and `no-voices` (engine without voices) never read
  as active voice morph.
- A probe speaks one near-silent syllable: an engine that never starts it is
  reported **silent**, even though voices exist. This is the packaged-WebView
  failure mode that looks healthy.
- The Voice Lab's "Check audio" is the artist-facing version of that probe.

Enforced in `speech-synthesis.service.ts` (`outputCapability`, `audibility`,
`probeAudibility`) and `chatbot.component.ts`; covered by the audibility cases.

## 5. The boundary is the artist's, not the model's

- Full Control, Mimic and Neural Vault access are opt-in settings, read from the
  committed profile.
- Mimic changes the register and vocabulary source, not the identity.
- Turning a boundary off must say what it actually changed.

Enforced across `chatbot.component.ts`, `smuve-total-control.service.ts` and the
settings console; covered by the mimic and full-control specs.
