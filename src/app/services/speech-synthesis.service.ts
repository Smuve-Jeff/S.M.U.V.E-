import { Injectable, signal } from '@angular/core';

interface SmuveArchetype {
  name: string;
  keywords: string[];
  pitch: number;
  rate: number;
  volume: number;
}

interface SpeakOptions {
  conversationId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);

  // Elite S.M.U.V.E. Archetypes - Dynamic characters as requested
  private readonly SMUVE_ARCHETYPES: SmuveArchetype[] = [
    {
      name: 'The S.M.U.V.E. Driller',
      keywords: ['en-gb', 'male', 'david', 'google uk male'],
      pitch: 0.7,
      rate: 0.82,
      volume: 1.0,
    },
    {
      name: 'The S.M.U.V.E. Executioner',
      keywords: ['google uk male', 'male', 'microsoft james'],
      pitch: 0.6,
      rate: 0.85,
      volume: 1.0,
    },
    {
      name: 'The S.M.U.V.E. Mogul',
      keywords: ['male', 'daniel', 'en-us-x-iog-local'],
      pitch: 0.75,
      rate: 0.95,
      volume: 1.0,
    },
    {
      name: 'The S.M.U.V.E. Phantom',
      keywords: ['deep', 'male', 'bass'],
      pitch: 0.5,
      rate: 0.8,
      volume: 0.9,
    },
    {
      name: 'The S.M.U.V.E. Architect',
      keywords: ['google us male', 'male', 'standard-b'],
      pitch: 0.8,
      rate: 0.9,
      volume: 1.0,
    },
  ];

  private currentArchetype: SmuveArchetype | null = null;
  private conversationVoices = new Map<string, any>();
  private lastUsedVoice: any = null;

  constructor() {}

  speak(text: string, options?: SpeakOptions): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Select a random S.M.U.V.E. Archetype for every interaction
    this.currentArchetype =
      this.SMUVE_ARCHETYPES[
        Math.floor(Math.random() * this.SMUVE_ARCHETYPES.length)
      ];

    // Pronunciation rule: S.M.U.V.E -> Smooth
    const processedText = text
      .replace(/S\.M\.U\.V\.E(?:\s+\d+\.\d+)?/gi, 'Smooth')
      .replace(/SMUVE/gi, 'Smooth')
      .replace(
        /Smooth\s+INITIALIZED\.\s+ROOM DOMINANCE COMMENCING\./i,
        'Welcome to Smooth'
      );

    this.cancel();

    const utterance = new SpeechSynthesisUtterance(processedText);
    this.configureUtterance(utterance, options);

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    window.speechSynthesis.speak(utterance);
  }

  private configureUtterance(
    utterance: SpeechSynthesisUtterance,
    options?: SpeakOptions
  ) {
    if (!this.currentArchetype) return;

    const voices = window.speechSynthesis.getVoices();
    const conversationId = options?.conversationId;
    let selectedVoice: any = null;

    if (conversationId && this.conversationVoices.has(conversationId)) {
      selectedVoice = this.conversationVoices.get(conversationId);
    } else {
      selectedVoice = this.pickVoice(voices, this.currentArchetype);

      if (conversationId && this.lastUsedVoice && selectedVoice) {
        const pool = this.getVoicePool(voices, this.currentArchetype);
        if (pool.length > 1 && selectedVoice.name === this.lastUsedVoice.name) {
          const alternatives = pool.filter(
            (v) => v.name !== this.lastUsedVoice.name
          );
          if (alternatives.length > 0) {
            selectedVoice =
              alternatives[Math.floor(Math.random() * alternatives.length)];
          }
        }
      }

      if (conversationId && selectedVoice) {
        this.conversationVoices.set(conversationId, selectedVoice);
      }
    }

    if (selectedVoice) {
      this.lastUsedVoice = selectedVoice;
      this.assignVoiceSafely(utterance, selectedVoice);
    }

    utterance.pitch = this.currentArchetype.pitch;
    utterance.rate = this.currentArchetype.rate;
    utterance.volume = this.currentArchetype.volume;
  }

  private getVoicePool(voices: any[], archetype: SmuveArchetype): any[] {
    const englishVoices = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith('en')
    );
    const basePool = englishVoices.length ? englishVoices : voices;

    const matchingVoices = basePool.filter((voice) =>
      archetype.keywords.some((keyword) =>
        voice.name.toLowerCase().includes(keyword)
      )
    );

    return matchingVoices.length ? matchingVoices : basePool;
  }

  private pickVoice(voices: any[], archetype: SmuveArchetype): any | null {
    const voicePool = this.getVoicePool(voices, archetype);
    if (!voicePool.length) return null;

    const voiceIndex = Math.floor(Math.random() * voicePool.length);
    return voicePool[voiceIndex] ?? null;
  }

  private assignVoiceSafely(
    utterance: SpeechSynthesisUtterance,
    voice: NonNullable<SpeechSynthesisUtterance['voice']>
  ): void {
    try {
      utterance.voice = voice;
    } catch {
      // Browser safety
    }
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
