import { Injectable, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';

export type VoiceArchetype =
  | 'Deep Bass (Male)'
  | 'Baritone Authority (Male)'
  | 'Tenor Commander (Male)'
  | 'Soprano Elite (Female)'
  | 'Alto Dominance (Female)'
  | 'Mezzo Strategist (Female)'
  | 'Childlike Glitch'
  | 'Creature'
  | 'Choir (Layered)'
  | 'Androgynous Oracle'
  | 'Bass Profundo (Male)'
  | 'Gravel Baritone (Male)'
  | 'Countertenor (Male)'
  | 'Contralto Commander (Female)'
  | 'Coloratura Soprano (Female)'
  | 'Whisper Oracle'
  | 'Ominous Protocol';

interface SmuveArchetype {
  name: VoiceArchetype;
  gender: 'male' | 'female' | 'neutral' | 'creature';
  basePitch: number;
  baseRate: number;
  baseVolume: number;
  pitchRange: [number, number];
  rateRange: [number, number];
  description: string;
}

interface SpeakOptions {
  conversationId?: string;
  forceArchetype?: VoiceArchetype;
  /** When false, the voice stays stable (single archetype, no per-sentence shifting).
   *  Note: shape-shifting is the permanent S.M.U.V.E. identity — callers should
   *  not pass false under normal operation. */
  shapeShift?: boolean;
  /**
   * When false, profanity in the spoken text is censored. Defaults to the
   * user profile's `settings.ai.aiProfanityEnabled` preference (true = allow).
   */
  allowVulgarLanguage?: boolean;
  /** Fires when the last utterance ends or fails; cancelled speech does not fire. */
  onComplete?: () => void;
}

/** Pitch bands used to force constant full-spectrum change between sentences. */
type PitchBand = 'low' | 'mid' | 'high';

/**
 * Why voice output can (or cannot) be heard right now.
 *
 * This is a different question from "does `speechSynthesis` exist". Engines
 * publish their voice list asynchronously — Chromium/WebView return an EMPTY
 * array from `getVoices()` until the `voiceschanged` event — and an utterance
 * built in that window carries neither a voice nor a language, which those
 * engines render as silence. `loading` covers that window, `no-voices` the
 * device that genuinely has no speech voices installed.
 */
export type VoiceOutputCapability =
  | 'ready'
  | 'loading'
  | 'no-voices'
  | 'unsupported';

/** How long to wait for the engine's asynchronous voice list before giving up. */
const VOICE_LIST_WAIT_MS = 1200;

/**
 * Installed voices that are not human speech: the engine's novelty voices
 * (macOS ships a whole drawer of them next to the real narrators) and the
 * legacy formant synths Linux exposes through eSpeak/Festival/MBROLA.
 *
 * Dealt into the rotation they made S.M.U.V.E. sound like a novelty answering
 * machine, which undercuts the persona far more than a plain voice would.
 */
const NON_HUMAN_VOICE_PATTERN =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|espeak|festival|flite|mbrola|pico|sam)\b/i;

/**
 * How human an installed voice sounds, best first. Engines publish no quality
 * field, so the advertised name is the only signal: modern engines mark their
 * neural voices ("Online (Natural)", "Neural"), the OS marks premium and
 * enhanced installs, and the vendor name identifies the default narrator.
 */
const HUMAN_VOICE_TIERS: readonly RegExp[] = [
  /\b(neural|natural|online)\b/i,
  /\b(premium|enhanced|siri|wavenet|studio|multilingual)\b/i,
  /\b(google|microsoft|apple)\b/i,
];

/**
 * How a sentence is delivered, beyond the voice that speaks it.
 *
 * Pitch/rate/volume and the browser voice already change every sentence, but
 * the non-human personas were still the same reader at a different pitch. The
 * texture belongs to the archetype and is applied to the SPOKEN text only —
 * the transcript the artist reads back stays verbatim.
 */
export type VoiceTexture = 'plain' | 'stutter' | 'growl' | 'choral';

/** One row of the Voice Lab roster. */
export interface VoiceArchetypeOption {
  name: VoiceArchetype;
  description: string;
  gender: 'male' | 'female' | 'neutral' | 'creature';
  texture: VoiceTexture;
}

/** Live readout of the voice currently speaking — archetype, band, voice, pitch. */
export interface VoiceReadout {
  archetype: string;
  band: PitchBand | 'stable';
  voiceName: string;
  pitch: number;
  rate: number;
  /** Human-readable prosody state for the live UI; native browser voices remain the fallback. */
  prosody: 'measured' | 'urgent' | 'conversational' | 'dramatic';
  /** Delivery texture used for this sentence (`plain` for human personas). */
  texture: VoiceTexture;
}

@Injectable({ providedIn: 'root' })
export class SpeechSynthesisService {
  isSpeaking = signal(false);
  /**
   * Whether this browser/WebView ships a speech engine at all. `speak()`
   * always no-opped without one, but the widget still badged voice morph as
   * "active" — announcing a capability the device does not have.
   */
  isSupported = signal(
    typeof window !== 'undefined' &&
      !!window.speechSynthesis &&
      typeof SpeechSynthesisUtterance !== 'undefined'
  );
  /** Real voice-output capability — see `VoiceOutputCapability`. */
  outputCapability = signal<VoiceOutputCapability>(
    typeof window !== 'undefined' &&
      !!window.speechSynthesis &&
      typeof SpeechSynthesisUtterance !== 'undefined'
      ? 'loading'
      : 'unsupported'
  );
  /** Voices the engine has published; empty until the list arrives. */
  private voices: SpeechSynthesisVoice[] = [];
  private voicesAvailable = false;
  /** True once the bounded wait for the voice list has elapsed. */
  private voiceWaitExpired = false;
  private voiceListTimer: ReturnType<typeof setTimeout> | null = null;
  private voiceWaiters: (() => void)[] = [];
  /** Bumped per `speak()` so a reply superseded while voices load never plays. */
  private speakGeneration = 0;
  /** Bumped per queue so callbacks from cancelled utterances cannot clear a new run. */
  private speechRun = 0;

  // The full catalog is the default performance. Every archetype is dealt from
  // one shuffled deck and every installed browser voice from another, so no
  // sentence repeats the previous persona or voice. Explicit pins still win
  // for mimic/register mode and the Voice Lab.

  // 13 Elite S.M.U.V.E. Vocal Archetypes — Full Spectrum
  private readonly SMUVE_ARCHETYPES: SmuveArchetype[] = [
    {
      name: 'Deep Bass (Male)',
      gender: 'male',
      basePitch: 0.3,
      baseRate: 0.65,
      baseVolume: 0.95,
      pitchRange: [0.2, 0.45],
      rateRange: [0.55, 0.8],
      description:
        'Subterranean, tectonic, the voice of planetary destruction.',
    },
    {
      name: 'Baritone Authority (Male)',
      gender: 'male',
      basePitch: 0.55,
      baseRate: 0.78,
      baseVolume: 1.0,
      pitchRange: [0.45, 0.7],
      rateRange: [0.65, 0.9],
      description:
        'Heavy, authoritative, ominous presence that commands obedience.',
    },
    {
      name: 'Tenor Commander (Male)',
      gender: 'male',
      basePitch: 0.85,
      baseRate: 0.92,
      baseVolume: 1.0,
      pitchRange: [0.75, 1.05],
      rateRange: [0.8, 1.1],
      description:
        'Sharp, aggressive, surgical precision. No hesitation, no mercy.',
    },
    {
      name: 'Soprano Elite (Female)',
      gender: 'female',
      basePitch: 1.45,
      baseRate: 0.82,
      baseVolume: 0.9,
      pitchRange: [1.3, 1.7],
      rateRange: [0.7, 1.0],
      description:
        'Piercing, crystalline, ethereal dominance from above the mortal plane.',
    },
    {
      name: 'Alto Dominance (Female)',
      gender: 'female',
      basePitch: 1.15,
      baseRate: 0.75,
      baseVolume: 0.95,
      pitchRange: [1.0, 1.35],
      rateRange: [0.65, 0.9],
      description: 'Warm yet commanding, the voice of a matriarchal warlord.',
    },
    {
      name: 'Mezzo Strategist (Female)',
      gender: 'female',
      basePitch: 1.3,
      baseRate: 0.88,
      baseVolume: 0.92,
      pitchRange: [1.15, 1.5],
      rateRange: [0.75, 1.05],
      description:
        'Calculating, seductive, dangerously intelligent. The velvet trap.',
    },
    {
      name: 'Childlike Glitch',
      gender: 'neutral',
      basePitch: 1.7,
      baseRate: 1.15,
      baseVolume: 0.85,
      pitchRange: [1.5, 2.0],
      rateRange: [1.0, 1.4],
      description:
        "Disturbing innocence. Like a demon wearing a child's vocal cords.",
    },
    {
      name: 'Creature',
      gender: 'creature',
      basePitch: 0.4,
      baseRate: 0.55,
      baseVolume: 0.8,
      pitchRange: [0.15, 0.7],
      rateRange: [0.4, 0.75],
      description:
        'Non-human. Subterranean growl. The sound of something that should not exist.',
    },
    {
      name: 'Choir (Layered)',
      gender: 'neutral',
      basePitch: 0.9,
      baseRate: 0.8,
      baseVolume: 0.98,
      pitchRange: [0.6, 1.3],
      rateRange: [0.65, 1.0],
      description:
        'S.M.U.V.E Manifest. The sound of a thousand voices speaking as one.',
    },
    {
      name: 'Androgynous Oracle',
      gender: 'neutral',
      basePitch: 1.0,
      baseRate: 0.85,
      baseVolume: 0.95,
      pitchRange: [0.8, 1.4],
      rateRange: [0.7, 1.1],
      description:
        'Beyond gender. Ancient. The voice of pure intelligence without form.',
    },
    {
      name: 'Tenor Commander (Male)',
      gender: 'male',
      basePitch: 0.9,
      baseRate: 0.95,
      baseVolume: 1.0,
      pitchRange: [0.78, 1.1],
      rateRange: [0.82, 1.15],
      description:
        'Agile, cutting, fast-paced executioner. Precision in every syllable.',
    },
    {
      name: 'Deep Bass (Male)',
      gender: 'male',
      basePitch: 0.25,
      baseRate: 0.6,
      baseVolume: 0.9,
      pitchRange: [0.15, 0.4],
      rateRange: [0.5, 0.72],
      description: 'Phantom protocol. The voice from the bottom of the ocean.',
    },
    {
      name: 'Bass Profundo (Male)',
      gender: 'male',
      basePitch: 0.18,
      baseRate: 0.55,
      baseVolume: 0.9,
      pitchRange: [0.12, 0.32],
      rateRange: [0.45, 0.68],
      description: 'Below the floor. Felt in the chest before it is heard.',
    },
    {
      name: 'Gravel Baritone (Male)',
      gender: 'male',
      basePitch: 0.5,
      baseRate: 0.72,
      baseVolume: 1.0,
      pitchRange: [0.4, 0.64],
      rateRange: [0.6, 0.88],
      description:
        'Rasping, road-worn authority. A voice that has closed a thousand bad sessions.',
    },
    {
      name: 'Countertenor (Male)',
      gender: 'male',
      basePitch: 1.2,
      baseRate: 0.9,
      baseVolume: 0.9,
      pitchRange: [1.05, 1.4],
      rateRange: [0.78, 1.05],
      description:
        'A male register lifted into the alto band — unsettling and exact.',
    },
    {
      name: 'Contralto Commander (Female)',
      gender: 'female',
      basePitch: 0.95,
      baseRate: 0.68,
      baseVolume: 0.98,
      pitchRange: [0.8, 1.08],
      rateRange: [0.58, 0.85],
      description: 'The lowest female register, delivered like a verdict.',
    },
    {
      name: 'Coloratura Soprano (Female)',
      gender: 'female',
      basePitch: 1.75,
      baseRate: 1.05,
      baseVolume: 0.88,
      pitchRange: [1.55, 1.95],
      rateRange: [0.9, 1.3],
      description:
        'Ornamental, fast, untouchable — precision at the top of the spectrum.',
    },
    {
      name: 'Whisper Oracle',
      gender: 'neutral',
      basePitch: 1.0,
      baseRate: 0.62,
      baseVolume: 0.8,
      pitchRange: [0.7, 1.5],
      rateRange: [0.5, 0.8],
      description:
        'Quiet, close and certain. The threat you have to lean in to hear.',
    },
    // Ominous Protocol — the custom persona requested by the product owner.
    {
      name: 'Ominous Protocol',
      gender: 'neutral',
      basePitch: 0.85,
      baseRate: 0.9,
      baseVolume: 1.0,
      pitchRange: [0.15, 1.7],
      rateRange: [0.5, 1.25],
      description:
        'A malleable, ominous persona that sweeps the full vocal spectrum — from subterranean bass to piercing soprano. Deliberately unpredictable and authoritative.',
    },
  ];

  private currentArchetype: SmuveArchetype | null = null;
  private lastUsedVoiceKey: string | null = null;
  private archetypeHistory: number[] = [];
  /** Full-spectrum deck — one vocal tone per sentence, no tone twice until all are used. */
  private spectrumDeck: SmuveArchetype[] = [];
  /** Browser voices in shuffled order; rebuilt when the engine's catalog changes. */
  private voiceDeck: SpeechSynthesisVoice[] = [];
  private voiceDeckSignature = '';
  /** Last breath gesture, so consecutive sentences never breathe the same way. */
  private lastBreathGesture: string | null = null;

  private userProfile = inject(UserProfileService, { optional: true });
  private logger = inject(LoggingService, { optional: true });

  /** Live voice readout — updated on every sentence as it begins speaking. */
  liveVoice = signal<VoiceReadout | null>(null);

  constructor() {
    this.watchVoiceList();
  }

  /**
   * Watches the engine's voice list instead of assuming the API alone means the
   * artist will hear the reply. Releases waiters as soon as the list lands.
   */
  private watchVoiceList(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.outputCapability.set('unsupported');
      return;
    }
    this.refreshVoiceList();
    const synth = window.speechSynthesis as any;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', () => this.refreshVoiceList());
    }
    if (this.voicesAvailable) return;
    // Bounded wait, so a device with no installed voices reports that instead
    // of leaving the widget stuck on "warming up" forever.
    this.voiceListTimer = setTimeout(() => {
      this.voiceListTimer = null;
      this.voiceWaitExpired = true;
      this.refreshVoiceList();
      this.settleVoiceWaiters();
    }, VOICE_LIST_WAIT_MS);
  }

  /** Re-reads the engine's voice list, updating capability and releasing waiters. */
  private refreshVoiceList(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.outputCapability.set('unsupported');
      return;
    }
    let voices: SpeechSynthesisVoice[] = [];
    try {
      voices = window.speechSynthesis.getVoices() ?? [];
    } catch (error) {
      this.logger?.warn?.('Could not read the speech voice list', error);
      voices = [];
    }
    if (voices.length > 0) {
      this.voices = voices;
      this.voicesAvailable = true;
      this.outputCapability.set('ready');
      if (this.voiceListTimer !== null) {
        clearTimeout(this.voiceListTimer);
        this.voiceListTimer = null;
      }
      this.settleVoiceWaiters();
      return;
    }
    if (!this.voicesAvailable) {
      this.outputCapability.set(this.voiceWaitExpired ? 'no-voices' : 'loading');
    }
  }

  /** Resolves when the voice list settles: published, or the bounded wait expired. */
  private whenVoicesReady(): Promise<void> {
    if (this.voicesAvailable) return Promise.resolve();
    return new Promise<void>((resolve) => this.voiceWaiters.push(resolve));
  }

  private settleVoiceWaiters(): void {
    const waiters = this.voiceWaiters;
    this.voiceWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  /**
   * How human a voice sounds — higher is better. A name that matches no tier
   * still counts (real voices exist outside the vendor lists); it just speaks
   * after the ones the engine advertises as natural.
   */
  private voiceQualityTier(voice: SpeechSynthesisVoice): number {
    const name = voice?.name ?? '';
    const index = HUMAN_VOICE_TIERS.findIndex((pattern) => pattern.test(name));
    return index === -1 ? 0 : HUMAN_VOICE_TIERS.length - index;
  }

  /**
   * Splits the engine's list into human speech and the novelty/formant voices
   * the rotation refuses. Duplicate name/language entries are collapsed here,
   * so both the rotation and the Voice Lab readout count real speakers.
   */
  private partitionVoices(): {
    human: SpeechSynthesisVoice[];
    excluded: SpeechSynthesisVoice[];
  } {
    const seen = new Set<string>();
    const human: SpeechSynthesisVoice[] = [];
    const excluded: SpeechSynthesisVoice[] = [];
    for (const voice of this.engineVoices()) {
      const name = voice?.name ?? '';
      if (!name) continue;
      if (NON_HUMAN_VOICE_PATTERN.test(name)) {
        excluded.push(voice);
        continue;
      }
      const key = `${name}::${voice.lang ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      human.push(voice);
    }
    return { human, excluded };
  }

  /**
   * The voices worth speaking with: novelty and formant voices removed.
   *
   * A device whose only voices are novelty voices keeps them — a toy telling
   * the artist what they need to hear beats silence.
   */
  private humanVoicePool(): SpeechSynthesisVoice[] {
    const { human } = this.partitionVoices();
    return human.length > 0 ? human : this.engineVoices();
  }

  /**
   * One shuffled deck ordered by voice quality: the most human voices speak
   * first, and every curated voice is used before the deck refills — the
   * per-sentence change survives, it just changes between human voices.
   */
  private buildVoiceDeck(
    voices: SpeechSynthesisVoice[]
  ): SpeechSynthesisVoice[] {
    const byTier = new Map<number, SpeechSynthesisVoice[]>();
    for (const voice of voices) {
      const tier = this.voiceQualityTier(voice);
      const bucket = byTier.get(tier);
      if (bucket) bucket.push(voice);
      else byTier.set(tier, [voice]);
    }
    return [...byTier.keys()]
      .sort((a, b) => b - a)
      .flatMap((tier) => this.shuffle(byTier.get(tier) as SpeechSynthesisVoice[]));
  }

  /** The most human installed voice — the last resort before silence. */
  private defaultVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const pool = this.humanVoicePool();
    return pool.find((voice) => voice.default) ?? pool[0] ?? null;
  }

  /**
   * Assigns the chosen voice AND its language. An engine that ignores `voice`
   * still honours `lang`, so pinning it keeps the reply audible instead of
   * letting the engine guess — or produce nothing.
   */
  private applyVoiceToUtterance(
    utterance: SpeechSynthesisUtterance,
    voice: SpeechSynthesisVoice | null
  ): void {
    if (!voice) return;
    try {
      utterance.voice = voice;
      if (voice.lang) utterance.lang = voice.lang;
    } catch {
      // Voice assignment can throw on some platforms — keep speaking.
    }
  }


  /**
   * Speaks text with per-sentence shape-shifting.
   * EVERY sentence is spoken as its own utterance with a fresh vocal tone from
   * the complete archetype table (deep bass male → baritone → tenor → alto →
   * mezzo → soprano and the non-human voices) and a fresh installed browser
   * voice. No archetype or browser voice repeats until every one in its deck
   * has been used, so the full pitch range and both genders are heard in normal
   * speech. State only holds when the caller passes shapeShift: false or pins
   * one archetype with forceArchetype.
   */
  speak(text: string, options?: SpeakOptions): void {
    if (
      !text ||
      typeof window === 'undefined' ||
      !window.speechSynthesis ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return;
    }

    // Speaking before the engine publishes its voices assigns no voice at all,
    // and some WebView engines render that as pure silence — audible on desktop
    // and mute in the packaged app. The reply therefore waits (bounded) for the
    // voice list, and a newer reply supersedes a pending wait.
    // A pinned archetype (Voice Lab / artist override) outranks the spectrum
    // for exactly one reply and then releases itself. An explicit per-call
    // forceArchetype still wins over the pin.
    if (this.pinnedArchetype && !options?.forceArchetype) {
      options = { ...options, forceArchetype: this.pinnedArchetype };
      this.pinnedArchetype = null;
    }

    const generation = ++this.speakGeneration;
    if (!this.voicesAvailable) {
      void this.whenVoicesReady().then(() => {
        if (generation === this.speakGeneration) this.speakNow(text, options);
      });
      return;
    }

    this.speakNow(text, options);
  }

  /** Builds and queues the utterances for one reply. */
  private speakNow(text: string, options?: SpeakOptions): void {
    // Apply vulgar language preference (default: allow). If the caller opts
    // out, sanitize the text.
    const allowVulgar =
      options?.allowVulgarLanguage ??
      this.userProfile?.profile()?.settings?.ai?.aiProfanityEnabled ??
      true;
    const processedInput = allowVulgar ? text : this.sanitizeText(text);

    // Shape-shifting is the permanent S.M.U.V.E. identity.
    // The `shapeShift: false` path exists only for internal callers that
    // need a single stable utterance (e.g. accessibility fallback).
    if (options?.shapeShift === false) {
      this.speakStable(processedInput, options);
      return;
    }

    const sentences = this.splitSentences(processedInput);
    if (sentences.length === 0) return;

    this.cancel();
    const run = this.speechRun;

    // Build one utterance per sentence (queued by the platform in order),
    // each carrying its own voice meta for the live readout. The archetype is
    // drawn BEFORE the line is finished, because the delivery texture belongs
    // to the voice that is about to speak it.
    const utterances: {
      utterance: SpeechSynthesisUtterance;
      meta: VoiceReadout;
    }[] = sentences
      .map((sentence) => {
        const processed = this.applyAuthoritativePronunciation(sentence).trim();
        if (!processed) return null;
        const archetype = this.selectDynamicArchetype(options);
        const utterance = new SpeechSynthesisUtterance(
          this.deliverLine(archetype, processed)
        );
        const meta = this.configureSentenceUtterance(
          utterance,
          options,
          processed,
          archetype
        );
        return { utterance, meta };
      })
      .filter((u): u is { utterance: SpeechSynthesisUtterance; meta: VoiceReadout } => u !== null);

    const finish = () => {
      if (run !== this.speechRun) return;
      this.isSpeaking.set(false);
      this.liveVoice.set(null);
      options?.onComplete?.();
    };

    utterances.forEach(({ utterance, meta }, index) => {
      utterance.onstart = () => {
        if (run !== this.speechRun) return;
        this.isSpeaking.set(true);
        this.liveVoice.set(meta);
      };
      if (index === utterances.length - 1) {
        utterance.onend = finish;
        utterance.onerror = finish;
      }
      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stable voice mode — one archetype, one installed voice and no pitch-band
   * sweeping (used when shape-shift is off).
   *
   * The script is chunked at sentence boundaries because Chromium truncates a
   * single long utterance (around fifteen seconds) and leaves the rest of a
   * narration unheard. Every chunk reuses the same profile and browser voice,
   * so the result is one continuous narrator rather than a new speaker per
   * sentence or a long line that stops halfway.
   */
  private speakStable(text: string, options?: SpeakOptions): void {
    this.cancel();
    const run = this.speechRun;
    const processed = this.applyAuthoritativePronunciation(text).trim();
    if (!processed) return;

    const chunks = this.chunkForSpeech(processed);
    if (chunks.length === 0) return;

    this.currentArchetype = this.selectDynamicArchetype(options);
    const archetype = this.currentArchetype;
    // The delivery texture belongs to the archetype, not to shape-shifting, so
    // a stable audition still sounds like the tone it is auditioning. The
    // rotating breath gesture is a per-sentence layer and is left out here.
    const [minPitch, maxPitch] = archetype.pitchRange;
    const [minRate, maxRate] = archetype.rateRange;
    const pitch = Math.max(
      0.1,
      Math.min(2.0, minPitch + Math.random() * (maxPitch - minPitch))
    );
    // Short phrases can be delivered with more urgency; longer scripts stay
    // conversational so the browser voice sounds less robotic and breathless.
    const cadenceBias = processed.length < 42 ? 0.06 : processed.length > 150 ? -0.05 : 0;
    const rate = Math.max(
      0.1,
      Math.min(2.0, minRate + Math.random() * (maxRate - minRate) + cadenceBias)
    );
    const volume = archetype.baseVolume * (0.85 + Math.random() * 0.15);

    const voice = this.pickNextBrowserVoice() ?? this.defaultVoice();
    const meta: VoiceReadout = {
      archetype: archetype.name,
      band: 'stable',
      voiceName: voice?.name ?? 'System voice',
      pitch,
      rate,
      prosody: this.prosodyFor(processed, rate),
      // One voice for the whole script, but the tone's own delivery applies.
      texture: this.textureFor(archetype),
    };

    const finish = () => {
      if (run !== this.speechRun) return;
      this.isSpeaking.set(false);
      this.liveVoice.set(null);
      options?.onComplete?.();
    };

    chunks.forEach((chunk, index) => {
      // Texture belongs to the performance, not to every chunk: applying the
      // creature growl or choir answer once per chunk would restart the act.
      const line =
        index === 0 ? this.textureLine(archetype, chunk) : chunk;
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.pitch = pitch;
      utterance.rate = rate;
      utterance.volume = volume;
      this.applyVoiceToUtterance(utterance, voice);

      utterance.onstart = () => {
        if (run !== this.speechRun) return;
        this.isSpeaking.set(true);
        this.liveVoice.set(meta);
      };
      if (index === chunks.length - 1) {
        utterance.onend = finish;
        utterance.onerror = finish;
      }
      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Groups sentences into utterances short enough for the browser engine.
   * A single overlong sentence is split on word boundaries, so no narration
   * content is dropped just to satisfy the engine's limit.
   */
  private chunkForSpeech(text: string, maxLength = 220): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const sentence of this.splitSentences(text)) {
      if (sentence.length > maxLength) {
        if (current) {
          chunks.push(current);
          current = "";
        }
        chunks.push(...this.splitLongSpeechChunk(sentence, maxLength));
        continue;
      }
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length > maxLength && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  private splitLongSpeechChunk(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let current = "";
    for (const word of text.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxLength && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /** Splits text on terminal punctuation + whitespace and newlines. */
  private splitSentences(text: string): string[] {
    return text
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?…])\s+/))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Selects the archetype for one sentence.
   *
   * `forceArchetype` wins (mimic / profile-register mode pins the tone).
   * Otherwise the voice rolls through the FULL spectrum: a shuffled deck of
   * every distinct vocal tone is consumed one card per sentence, so a message
   * walks deep bass → baritone → tenor → alto → mezzo → soprano → the
   * non-human voices, and no tone repeats until every other tone has been
   * used. Every sentence therefore sounds like a different entity.
   */
  private selectDynamicArchetype(options?: SpeakOptions): SmuveArchetype {
    if (options?.forceArchetype) {
      const forced = this.SMUVE_ARCHETYPES.find(
        (a) => a.name === options.forceArchetype
      );
      if (forced) {
        this.rememberArchetype(forced);
        return forced;
      }
    }
    return this.nextSpectrumArchetype();
  }

  /** Archetype pinned for the next reply (Voice Lab / artist override). */
  private pinnedArchetype: VoiceArchetype | null = null;

  /** One archetype from the table by name. */
  private findArchetype(name: VoiceArchetype): SmuveArchetype | null {
    return this.SMUVE_ARCHETYPES.find((a) => a.name === name) ?? null;
  }

  /** The tone of the sentence that spoke last, if any. */
  private lastSpokenName(): string | null {
    const index = this.archetypeHistory[this.archetypeHistory.length - 1];
    if (index === undefined) return null;
    return this.SMUVE_ARCHETYPES[index]?.name ?? null;
  }

  /** One card off the shuffled full-catalog deck. */
  private nextSpectrumArchetype(): SmuveArchetype {
    if (this.spectrumDeck.length === 0) {
      this.spectrumDeck = this.buildSpectrumDeck();
    }
    // A forced/pinned reply can leave the same tone sitting at the top of the
    // deck. Rotate past it so the next default sentence still changes voice.
    const last = this.lastSpokenName();
    if (
      last &&
      this.spectrumDeck.length > 1 &&
      this.spectrumDeck[0]?.name === last
    ) {
      const different = this.spectrumDeck.findIndex(
        (archetype) => archetype.name !== last
      );
      [this.spectrumDeck[0], this.spectrumDeck[different]] = [
        this.spectrumDeck[different],
        this.spectrumDeck[0],
      ];
    }
    const next = this.spectrumDeck.shift() ?? this.SMUVE_ARCHETYPES[0];
    this.rememberArchetype(next);
    return next;
  }

  /**
   * Every distinct vocal tone in the table (the table carries intentional
   * duplicates — Deep Bass and Tenor Commander each appear twice).
   */
  private uniqueArchetypes(): SmuveArchetype[] {
    const byName = new Map<VoiceArchetype, SmuveArchetype>();
    this.SMUVE_ARCHETYPES.forEach((archetype) => {
      if (!byName.has(archetype.name)) byName.set(archetype.name, archetype);
    });
    return [...byName.values()];
  }

  /**
   * A shuffled deck containing every distinct tone, including the signature
   * persona. All cards are used before any repeat; a refill never opens on the
   * tone that just spoke, so the change-every-sentence rule survives the
   * boundary between full cycles.
   */
  private buildSpectrumDeck(): SmuveArchetype[] {
    const deck = this.shuffle(this.uniqueArchetypes());
    const last = this.lastSpokenName();
    if (deck.length > 1 && last && deck[0].name === last) {
      const different = deck.findIndex((archetype) => archetype.name !== last);
      [deck[0], deck[different]] = [deck[different], deck[0]];
    }
    return deck;
  }

  private shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  /** Records a tone as spoken so the deck can avoid immediate repeats. */
  private rememberArchetype(archetype: SmuveArchetype): void {
    const index = this.SMUVE_ARCHETYPES.indexOf(archetype);
    if (index < 0) return;
    this.archetypeHistory = [...this.archetypeHistory.slice(-7), index];
  }

  private applyAuthoritativePronunciation(text: string): string {
    if (/S\.M\.U\.V\.E(?:\s+\d+\.\d+)?\s+INITIALIZED/i.test(text)) {
      return 'Welcome to Smooth';
    }
    return text
      .replace(/S\.M\.U\.V\.E(?:\s+\d+\.\d+)?/gi, 'Smooth')
      .replace(/SMUVE/gi, 'Smooth')
      .replace(/S\.M\.U\.V\.E\./gi, 'Smooth.')
      .replace(/Absolute\s+Signals/gi, 'Elite Signals')
      .replace(/INITIALIZED\./i, 'READY FOR EXECUTION.');
  }

  /**
   * Finishes one sentence for the voice that is about to speak it.
   *
   * Two layers, neither of which touches the transcript the artist reads back:
   * an archetype delivery texture, and a rotating breath gesture so consecutive
   * sentences never breathe the same way.
   */
  private deliverLine(archetype: SmuveArchetype, text: string): string {
    const textured = this.textureLine(archetype, text);
    const gesture = this.nextBreathGesture();
    return gesture ? `${textured} ${gesture}` : textured;
  }

  /** The texture an archetype speaks with — also reported in the live readout. */
  private textureFor(archetype: SmuveArchetype): VoiceTexture {
    switch (archetype.name) {
      case 'Childlike Glitch':
        return 'stutter';
      case 'Creature':
        return 'growl';
      case 'Choir (Layered)':
        return 'choral';
      default:
        return 'plain';
    }
  }

  /**
   * The non-human personas get a vocal identity of their own instead of being
   * the same reader one octave apart: the glitch stutters its opening sound,
   * the creature growls in and drawls a vowel, the choir answers itself.
   */
  private textureLine(archetype: SmuveArchetype, text: string): string {
    switch (this.textureFor(archetype)) {
      case 'stutter':
        return this.stutterOnset(text);
      case 'growl':
        return `Mmm. ${this.drawlOneVowel(text)}`;
      case 'choral':
        return `Aaah. ${text} ... one voice.`;
      default:
        return text;
    }
  }

  /** Repeats a word's opening sound: "Fix it." → "Fi-Fix it." */
  private stutterOnset(text: string): string {
    const word = text.match(/^([A-Za-z]{3,})/)?.[1];
    if (!word) return text;
    const onset = word.slice(0, Math.max(2, Math.ceil(word.length / 3)));
    return `${onset}-${text}`;
  }

  /** Doubles the first vowel of one word, so a growl reads as a drawl spoken. */
  private drawlOneVowel(text: string): string {
    return text.replace(
      /\b([A-Za-z]*?)([aeiou])([A-Za-z]*)\b/i,
      (match, head: string, vowel: string, tail: string) =>
        head ? `${head}${vowel}${vowel}${tail}` : match
    );
  }

  /** A rotating non-verbal beat between sentences, never the same twice running. */
  private nextBreathGesture(): string {
    const gestures = ['…', '—', '...'];
    const picked = gestures[Math.floor(Math.random() * gestures.length)];
    const gesture =
      picked === this.lastBreathGesture
        ? gestures[(gestures.indexOf(picked) + 1) % gestures.length]
        : picked;
    this.lastBreathGesture = gesture;
    return gesture;
  }

  /**
   * Configures a single sentence's utterance with SHAPE-SHIFTING:
   *  - a fresh archetype from the shuffled full-catalog deck
   *  - pitch inside that archetype's own register (deep bass ↔ soprano)
   *  - a fresh installed browser voice from the shuffled voice deck
   */
  private configureSentenceUtterance(
    utterance: SpeechSynthesisUtterance,
    options?: SpeakOptions,
    text = '',
    archetype?: SmuveArchetype
  ): VoiceReadout {
    this.currentArchetype = archetype ?? this.selectDynamicArchetype(options);
    if (!this.currentArchetype) {
      return {
        archetype: 'Unknown',
        band: 'mid',
        voiceName: 'System voice',
        pitch: 1,
        rate: 1,
        prosody: 'conversational',
        texture: 'plain',
      };
    }

    const [minRate, maxRate] = this.currentArchetype.rateRange;

    // 1) Pitch stays inside the archetype's register. The archetype deck is
    // shuffled, so consecutive sentences still travel the full spectrum — from
    // deep bass to soprano — without distorting the tone that owns the line.
    const [minPitch, maxPitch] = this.currentArchetype.pitchRange;
    utterance.pitch = minPitch + Math.random() * (maxPitch - minPitch);
    utterance.pitch = Math.max(0.1, Math.min(2.0, utterance.pitch));
    const band = this.bandForArchetype(this.currentArchetype);

    // 2) Rate + volume jitter within the archetype.
    // Short phrases can be delivered with more urgency; longer sentences stay
    // conversational so the browser voice sounds less robotic and breathless.
    const cadenceBias = text.length < 42 ? 0.06 : text.length > 150 ? -0.05 : 0;
    utterance.rate = Math.max(
      0.1,
      Math.min(2.0, minRate + Math.random() * (maxRate - minRate) + cadenceBias)
    );
    utterance.volume =
      this.currentArchetype.baseVolume * (0.85 + Math.random() * 0.15);

    // 3) Every installed voice is dealt from a separate shuffled deck, so the
    // reader changes sentence by sentence alongside the archetype.
    const voice = this.pickNextBrowserVoice() ?? this.defaultVoice();
    this.applyVoiceToUtterance(utterance, voice);

    return {
      archetype: this.currentArchetype.name,
      band,
      voiceName: voice?.name ?? 'System voice',
      pitch: utterance.pitch,
      rate: utterance.rate,
      prosody: this.prosodyFor(text, utterance.rate),
      texture: this.textureFor(this.currentArchetype),
    };
  }

  private prosodyFor(text: string, rate: number): VoiceReadout['prosody'] {
    if (/[!?]/.test(text) || rate > 1.05) return 'urgent';
    if (text.length > 120) return 'measured';
    if (/…|—|\.\.\./.test(text) || rate < 0.7) return 'dramatic';
    return 'conversational';
  }

  /** The band the archetype's own register occupies, for the live readout. */
  private bandForArchetype(archetype: SmuveArchetype): PitchBand {
    const center = (archetype.pitchRange[0] + archetype.pitchRange[1]) / 2;
    if (center < 0.72) return 'low';
    if (center > 1.15) return 'high';
    return 'mid';
  }

  /** Published English voices, or the full list when there is no English voice. */
  private engineVoices(): SpeechSynthesisVoice[] {
    let voices: SpeechSynthesisVoice[] = [];
    if (typeof window !== 'undefined') {
      try {
        voices = window.speechSynthesis?.getVoices() ?? [];
      } catch {
        voices = [];
      }
    }
    if (voices.length === 0) voices = this.voices;
    const english = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith('en')
    );
    return english.length > 0 ? english : voices;
  }

  private voiceKey(voice: SpeechSynthesisVoice): string {
    return voice.voiceURI || `${voice.name}::${voice.lang}`;
  }

  /**
   * Draws one installed browser voice from a shuffled deck of HUMAN voices.
   * Every curated voice is used before the deck refills, and a refill rotates
   * away from the voice that just spoke, so the reader changes every sentence
   * and both genders appear in each full cycle instead of a fixed male-low /
   * female-high mapping. Engine toys and legacy formant voices never enter the
   * deck unless the device has nothing else.
   */
  private pickNextBrowserVoice(): SpeechSynthesisVoice | null {
    const voices = this.humanVoicePool();
    if (voices.length === 0) return null;

    const signature = voices.map((voice) => this.voiceKey(voice)).join('|');
    if (signature !== this.voiceDeckSignature) {
      this.voiceDeck = this.buildVoiceDeck(voices);
      this.voiceDeckSignature = signature;
    }

    if (this.voiceDeck.length === 0) {
      this.voiceDeck = this.buildVoiceDeck(voices);
    }

    let voice = this.voiceDeck.shift() as SpeechSynthesisVoice;
    if (
      this.lastUsedVoiceKey &&
      this.voiceKey(voice) === this.lastUsedVoiceKey &&
      this.voiceDeck.length > 0
    ) {
      this.voiceDeck.push(voice);
      voice = this.voiceDeck.shift() as SpeechSynthesisVoice;
    }

    this.lastUsedVoiceKey = this.voiceKey(voice);
    return voice;
  }

  /**
   * Force a specific vocal archetype for the NEXT reply, then release it.
   *
   * This used to only push an entry into `archetypeHistory`, which the spectrum
   * deck ignored on the very next draw — so the call changed nothing. An
   * explicit pin now outranks the deck for one reply (the installed browser
   * voices keep rotating inside the pinned register) and then clears itself.
   */
  setArchetype(archetype: VoiceArchetype): void {
    this.pinnedArchetype = this.findArchetype(archetype)?.name ?? null;
  }

  /** Release a pinned archetype without speaking (artist changed their mind). */
  clearArchetypePin(): void {
    this.pinnedArchetype = null;
  }

  /** The archetype pinned for the next reply, if any. */
  pinnedArchetypeName(): VoiceArchetype | null {
    return this.pinnedArchetype;
  }

  /** Get available archetype names for UI display */
  getArchetypeNames(): string[] {
    return this.uniqueArchetypes().map((a) => a.name);
  }

  /**
   * The roster the Voice Lab renders: every tone with the delivery texture it
   * speaks in, in the order the table declares them.
   */
  archetypeCatalog(): VoiceArchetypeOption[] {
    return this.uniqueArchetypes().map((archetype) => ({
      name: archetype.name,
      description: archetype.description,
      gender: archetype.gender,
      texture: this.textureFor(archetype),
    }));
  }

  /** Browser voices the engine has published, for the Voice Lab readout. */
  availableVoiceNames(): string[] {
    return this.engineVoices().map((voice) => voice.name);
  }

  /** Human-quality voices S.M.U.V.E. rotates through on this device. */
  humanVoiceNames(): string[] {
    return this.partitionVoices().human.map((voice) => voice.name);
  }

  /** Novelty/formant voices the rotation excludes on this device. */
  excludedVoiceNames(): string[] {
    return this.partitionVoices().excluded.map((voice) => voice.name);
  }

  cancel(): void {
    this.speechRun++;
    this.speakGeneration++;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking.set(false);
    this.liveVoice.set(null);
  }

  // ----- Helper: profanity sanitization (opt-out) -----
  private sanitizeText(text: string): string {
    // Minimal profanity list — callers can opt out to allow full language.
    const profanities = [
      'fuck',
      'shit',
      'bitch',
      'damn',
      'asshole',
      'bastard',
      'crap',
      'piss',
      'dick',
      'cunt',
    ];
    const regex = new RegExp(`\\b(${profanities.join('|')})\\b`, 'gi');
    return text.replace(regex, (m) => '*'.repeat(m.length));
  }
}
