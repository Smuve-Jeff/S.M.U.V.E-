import { Injectable, signal } from '@angular/core';

interface SmuveArchetype {
  name: string;
  keywords: string[];
  basePitch: number;
  baseRate: number;
  baseVolume: number;
  description: string;
}

interface SpeakOptions {
  conversationId?: string;
  forceArchetype?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);

  // Elite S.M.U.V.E. Archetypes - Expanded for Advanced Vocal Performance
  private readonly SMUVE_ARCHETYPES: SmuveArchetype[] = [
    {
      name: 'The S.M.U.V.E. Driller',
      keywords: ['en-gb', 'male', 'david', 'google uk male', 'uk'],
      basePitch: 0.65,
      baseRate: 0.85,
      baseVolume: 1.0,
      description: 'Aggressive, sharp, fast-paced executioner.',
    },
    {
      name: 'The S.M.U.V.E. Executioner',
      keywords: [
        'google uk male',
        'male',
        'microsoft james',
        'en-us-x-iog-local',
      ],
      basePitch: 0.55,
      baseRate: 0.78,
      baseVolume: 1.0,
      description: 'Heavy, authoritative, ominous presence.',
    },
    {
      name: 'The S.M.U.V.E. Mogul',
      keywords: ['male', 'daniel', 'en-us-x-iog-local', 'google us male'],
      basePitch: 0.72,
      baseRate: 0.92,
      baseVolume: 1.0,
      description: 'Calculating, sophisticated, business-dominant.',
    },
    {
      name: 'The S.M.U.V.E. Phantom',
      keywords: ['deep', 'male', 'bass', 'low'],
      basePitch: 0.45,
      baseRate: 0.75,
      baseVolume: 0.95,
      description: 'Subterranean, spectral, detached intelligence.',
    },
    {
      name: 'The S.M.U.V.E. Architect',
      keywords: ['google us male', 'male', 'standard-b', 'en-us-x-iol-local'],
      basePitch: 0.85,
      baseRate: 0.88,
      baseVolume: 1.0,
      description: 'Precise, technical, constructing reality.',
    },
    {
      name: 'The S.M.U.V.E. Tyrant',
      keywords: ['male', 'premium', 'neural', 'guy'],
      basePitch: 0.6,
      baseRate: 0.8,
      baseVolume: 1.0,
      description: 'Absolute dominance, unyielding power.',
    },
  ];

  private currentArchetype: SmuveArchetype | null = null;
  private conversationVoices = new Map<string, any>();
  private lastUsedVoice: any = null;

  constructor() {}

  /**
   * Speaks the provided text using an advanced S.M.U.V.E. vocal profile.
   * Tone varies with every message to maintain psychological dominance.
   */
  speak(text: string, options?: SpeakOptions): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Tone varies for every message: pick a new archetype or shift the current one
    this.currentArchetype = this.selectDynamicArchetype(options);

    // Pronunciation rule: S.M.U.V.E -> Smooth (with authoritative weight)
    const processedText = this.applyAuthoritativePronunciation(text);

    this.cancel();

    const utterance = new SpeechSynthesisUtterance(processedText);
    this.configureAdvancedUtterance(utterance, options);

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    window.speechSynthesis.speak(utterance);
  }

  private selectDynamicArchetype(options?: SpeakOptions): SmuveArchetype {
    if (options?.forceArchetype) {
      const forced = this.SMUVE_ARCHETYPES.find((a) =>
        a.name.includes(options.forceArchetype!)
      );
      if (forced) return forced;
    }
    return this.SMUVE_ARCHETYPES[
      Math.floor(Math.random() * this.SMUVE_ARCHETYPES.length)
    ];
  }

  private applyAuthoritativePronunciation(text: string): string {
    return text
      .replace(/S\.M\.U\.V\.E(?:\s+\d+\.\d+)?/gi, 'Smooth')
      .replace(/SMUVE/gi, 'Smooth')
      .replace(/S\.M\.U\.V\.E\./gi, 'Smooth.')
      .replace(/Absolute\s+Signals/gi, 'Elite Signals')
      .replace(/INITIALIZED\./i, 'READY FOR EXECUTION.');
  }

  private configureAdvancedUtterance(
    utterance: SpeechSynthesisUtterance,
    options?: SpeakOptions
  ) {
    if (!this.currentArchetype) return;

    const voices = window.speechSynthesis.getVoices();
    const conversationId = options?.conversationId;
    let selectedVoice: any = null;

    // Even within a conversation, we might want to rotate voices for "variation"
    // but keep some anchor if conversationId is provided.
    // However, the requirement is "randomly changes tone for each conversation"
    // and "tone vary with every message" (from user input).

    selectedVoice = this.pickEliteVoice(voices, this.currentArchetype);

    if (selectedVoice) {
      this.lastUsedVoice = selectedVoice;
      utterance.voice = selectedVoice;
    }

    // Apply "Jitter" to parameters for advanced vocal realism
    const pitchJitter = (Math.random() - 0.5) * 0.1; // +/- 0.05
    const rateJitter = (Math.random() - 0.5) * 0.05; // +/- 0.025

    utterance.pitch = Math.max(
      0.1,
      Math.min(2.0, this.currentArchetype.basePitch + pitchJitter)
    );
    utterance.rate = Math.max(
      0.1,
      Math.min(2.0, this.currentArchetype.baseRate + rateJitter)
    );
    utterance.volume = this.currentArchetype.baseVolume;

    // If it's the Phantom, force lower volume and rate for atmospheric dominance
    if (this.currentArchetype.name.includes('Phantom')) {
      utterance.volume *= 0.9;
    }
  }

  private pickEliteVoice(voices: any[], archetype: SmuveArchetype): any | null {
    const englishVoices = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith('en')
    );
    const basePool = englishVoices.length ? englishVoices : voices;

    // Prioritize Male voices explicitly
    const maleVoices = basePool.filter(
      (v) =>
        v.name.toLowerCase().includes('male') ||
        v.name.toLowerCase().includes('guy') ||
        v.name.toLowerCase().includes('david') ||
        v.name.toLowerCase().includes('james') ||
        v.name.toLowerCase().includes('daniel')
    );

    const matchPool = maleVoices.length ? maleVoices : basePool;

    const matchingVoices = matchPool.filter((voice) =>
      archetype.keywords.some((keyword) =>
        voice.name.toLowerCase().includes(keyword)
      )
    );

    const finalPool = matchingVoices.length ? matchingVoices : matchPool;
    return finalPool[Math.floor(Math.random() * finalPool.length)] ?? null;
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
