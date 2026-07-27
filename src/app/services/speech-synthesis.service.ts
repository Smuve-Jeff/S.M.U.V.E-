import { Injectable, signal } from '@angular/core';

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
  | 'Androgynous Oracle';

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
}

@Injectable({ providedIn: 'root' })
export class SpeechSynthesisService {
  isSpeaking = signal(false);

  // 12 Elite S.M.U.V.E. Vocal Archetypes — Full Spectrum
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
  ];

  private currentArchetype: SmuveArchetype | null = null;
  private conversationVoices = new Map<string, SpeechSynthesisVoice>();
  private lastUsedVoice: SpeechSynthesisVoice | null = null;
  private archetypeHistory: number[] = [];
  private modulationCount = 0;

  constructor() {}

  /**
   * Speaks text using a dynamically shifting S.M.U.V.E vocal profile.
   * Every message can change gender, pitch, rate — from deep male bass
   * to high female soprano — ensuring the voice NEVER sounds the same.
   */
  speak(text: string, options?: SpeakOptions): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis)
      return;

    // Step 1: Select a dynamically changing archetype — shifts gender/pitch every call
    this.currentArchetype = this.selectDynamicArchetype(options);

    // Step 2: Apply pronunciation rules
    const processedText = this.applyAuthoritativePronunciation(text);

    // Step 3: Create utterance with max modulation
    this.cancel();
    const utterance = new SpeechSynthesisUtterance(processedText);
    this.configureUltraWideUtterance(utterance, options);

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    window.speechSynthesis.speak(utterance);
    this.modulationCount++;
  }

  /**
   * Selects archetype with full spectrum rotation.
   * Cycles through male deep/female high every 2-4 calls for constant variety.
   */
  private selectDynamicArchetype(options?: SpeakOptions): SmuveArchetype {
    if (options?.forceArchetype) {
      const forced = this.SMUVE_ARCHETYPES.find(
        (a) => a.name === options.forceArchetype
      );
      if (forced) return forced;
    }

    // Rotate across the full spectrum: 0-2 male, 3-5 female, 6-11 neutral/creature
    const genderWeights =
      this.archetypeHistory.length > 3
        ? this.getUnderrepresentedGender()
        : null;

    let pool: SmuveArchetype[];
    if (genderWeights === 'female' && Math.random() < 0.7) {
      pool = this.SMUVE_ARCHETYPES.filter((a) => a.gender === 'female');
    } else if (genderWeights === 'male' && Math.random() < 0.7) {
      pool = this.SMUVE_ARCHETYPES.filter((a) => a.gender === 'male');
    } else {
      pool = this.SMUVE_ARCHETYPES;
    }

    const selected = pool[Math.floor(Math.random() * pool.length)];
    this.archetypeHistory = [
      ...this.archetypeHistory.slice(-5),
      this.SMUVE_ARCHETYPES.indexOf(selected),
    ];
    return selected;
  }

  private getUnderrepresentedGender(): 'male' | 'female' | null {
    const recent = this.archetypeHistory
      .slice(-5)
      .map((i) => this.SMUVE_ARCHETYPES[i]?.gender);
    const maleCount = recent.filter((g) => g === 'male').length;
    const femaleCount = recent.filter((g) => g === 'female').length;
    if (femaleCount === 0 && maleCount >= 2) return 'female';
    if (maleCount === 0 && femaleCount >= 2) return 'male';
    return null;
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
   * Configures utterance with WIDE SPECTRUM modulation.
   * Randomly shifts pitch and rate within the archetype's range,
   * creating a unique voice nearly every call.
   */
  private configureUltraWideUtterance(
    utterance: SpeechSynthesisUtterance,
    options?: SpeakOptions
  ) {
    if (!this.currentArchetype) return;

    const voices = window.speechSynthesis.getVoices();
    const conversationId = options?.conversationId;
    let selectedVoice: SpeechSynthesisVoice | null = null;

    // Voice selection with full gender spectrum support
    if (conversationId && this.conversationVoices.has(conversationId)) {
      selectedVoice = this.conversationVoices.get(conversationId)!;
    }

    if (!selectedVoice) {
      const englishVoices = voices.filter((v) =>
        v.lang?.toLowerCase().startsWith('en')
      );
      const preferred = this.findVoiceByGender(
        englishVoices,
        this.currentArchetype.gender
      );
      if (preferred) {
        selectedVoice = preferred;
      } else if (englishVoices.length > 0) {
        // Rotate through available voices
        const index = this.conversationVoices.size % englishVoices.length;
        selectedVoice = englishVoices[index];
      }
    }

    if (selectedVoice) {
      this.lastUsedVoice = selectedVoice;
      if (conversationId && !this.conversationVoices.has(conversationId)) {
        this.conversationVoices.set(conversationId, selectedVoice);
      }
      try {
        utterance.voice = selectedVoice;
      } catch {}
    }

    // WIDE SPECTRUM modulation: full range jitter within archetype bounds
    const [minPitch, maxPitch] = this.currentArchetype.pitchRange;
    const [minRate, maxRate] = this.currentArchetype.rateRange;

    // Every 3-5 calls, jump to opposite end of the spectrum for maximum variety
    const jumpMod = this.modulationCount % 4 === 0 ? 1 : 0;
    const pitchJump = jumpMod === 1 ? (Math.random() > 0.5 ? 0.15 : -0.15) : 0;

    utterance.pitch = Math.max(
      0.1,
      Math.min(
        2.0,
        minPitch + Math.random() * (maxPitch - minPitch) + pitchJump
      )
    );

    utterance.rate = Math.max(
      0.1,
      Math.min(2.0, minRate + Math.random() * (maxRate - minRate))
    );

    utterance.volume =
      this.currentArchetype.baseVolume * (0.85 + Math.random() * 0.15);
  }

  private findVoiceByGender(
    voices: SpeechSynthesisVoice[],
    gender: string
  ): SpeechSynthesisVoice | null {
    if (gender === 'male') {
      return (
        voices.find(
          (v) =>
            v.name.toLowerCase().includes('male') ||
            v.name.toLowerCase().includes('guy') ||
            v.name.toLowerCase().includes('david') ||
            v.name.toLowerCase().includes('james') ||
            v.name.toLowerCase().includes('daniel')
        ) || null
      );
    }
    if (gender === 'female') {
      return (
        voices.find(
          (v) =>
            v.name.toLowerCase().includes('female') ||
            v.name.toLowerCase().includes('girl') ||
            v.name.toLowerCase().includes('woman') ||
            v.name.toLowerCase().includes('samantha') ||
            v.name.toLowerCase().includes('zoe')
        ) || null
      );
    }
    return null;
  }

  /** Force a specific vocal archetype for the next message */
  setArchetype(archetype: VoiceArchetype): void {
    const found = this.SMUVE_ARCHETYPES.find((a) => a.name === archetype);
    if (found) this.archetypeHistory = [this.SMUVE_ARCHETYPES.indexOf(found)];
  }

  /** Get available archetype names for UI display */
  getArchetypeNames(): string[] {
    return [...new Set(this.SMUVE_ARCHETYPES.map((a) => a.name))];
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
