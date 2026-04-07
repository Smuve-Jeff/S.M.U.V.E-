import { Injectable, signal } from '@angular/core';

interface VoiceStyleProfile {
  keywords: string[];
  pitchRange: [number, number];
  rateRange: [number, number];
}

interface SpeakOptions {
  /**
   * Supply a unique identifier to lock a voice to the lifetime of a conversation.
   * When the identifier changes, a new voice and style are forced.
   */
  conversationId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);
  private readonly voiceProfiles: VoiceStyleProfile[] = [
    {
      keywords: ['male', 'david', 'daniel', 'bass', 'deep', 'guy'],
      pitchRange: [0.7, 0.95],
      rateRange: [0.82, 0.98],
    },
    {
      keywords: ['natural', 'aria', 'samantha', 'female', 'woman', 'zira'],
      pitchRange: [1.15, 1.45],
      rateRange: [0.98, 1.16],
    },
    {
      keywords: ['google', 'serena', 'ava', 'alloy', 'standard'],
      pitchRange: [0.95, 1.2],
      rateRange: [0.92, 1.08],
    },
    {
      keywords: ['baritone', 'tenor', 'neutral', 'english', 'narrator'],
      pitchRange: [0.85, 1.05],
      rateRange: [0.9, 1.05],
    },
    {
      keywords: ['alto', 'bright', 'youth', 'soprano', 'light'],
      pitchRange: [1.3, 1.6],
      rateRange: [1.05, 1.25],
    },
    {
      keywords: ['robot', 'ai', 'assistant', 'synthetic', 'neural'],
      pitchRange: [0.95, 1.35],
      rateRange: [1.0, 1.3],
    },
  ];
  private lastProfileIndex: number | null = null;
  private lastVoiceName: string | null = null;
  private lastConversationId: string | null = null;
  private conversationVoiceName: string | null = null;
  private conversationProfileIndex: number | null = null;
  private conversationPitch: number | null = null;
  private conversationRate: number | null = null;

  constructor() {}

  speak(text: string, options?: SpeakOptions): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    const conversationId = options?.conversationId ?? null;
    const conversationChanged = conversationId
      ? conversationId !== this.lastConversationId
      : true;

    if (conversationChanged) {
      this.resetConversationState();
      this.lastConversationId = conversationId;
    }

    // Pronunciation rule: S.M.U.V.E -> Smooth
    const processedText = text
      .replace(/S\.M\.U\.V\.E(?:\s+4\.\d+)?/gi, 'Smooth')
      .replace(/SMUVE/gi, 'Smooth');

    this.cancel();

    const utterance = new SpeechSynthesisUtterance(processedText);
    this.configureUtterance(utterance, conversationChanged);

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    window.speechSynthesis.speak(utterance);
  }

  private resetConversationState(): void {
    this.conversationVoiceName = null;
    this.conversationProfileIndex = null;
    this.conversationPitch = null;
    this.conversationRate = null;
  }

  private configureUtterance(
    utterance: SpeechSynthesisUtterance,
    forceVoiceChange: boolean
  ) {
    const voices = window.speechSynthesis.getVoices();
    const profileIndex = this.getConversationProfileIndex(forceVoiceChange);
    const profile = this.voiceProfiles[profileIndex];
    const selectedVoice = this.pickConversationVoice(
      voices,
      profile,
      forceVoiceChange
    );

    if (selectedVoice) {
      this.assignVoiceSafely(utterance, selectedVoice);
      this.conversationVoiceName = selectedVoice.name;
      this.lastVoiceName = selectedVoice.name;
    }

    const pitch = this.getConversationPitch(profile, forceVoiceChange);
    const rate = this.getConversationRate(profile, forceVoiceChange);

    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = 1.0;
    this.lastProfileIndex = profileIndex;
  }

  private getConversationProfileIndex(forceChange: boolean): number {
    if (!forceChange && this.conversationProfileIndex !== null) {
      return this.conversationProfileIndex;
    }

    const previousIndex =
      forceChange && this.lastProfileIndex !== null
        ? this.lastProfileIndex
        : (this.conversationProfileIndex ?? this.lastProfileIndex);

    const index = this.pickRandomIndex(
      this.voiceProfiles.length,
      previousIndex
    );
    this.conversationProfileIndex = index;
    return index;
  }

  private pickConversationVoice(
    voices: SpeechSynthesisVoice[],
    profile: VoiceStyleProfile,
    forceChange: boolean
  ): SpeechSynthesisVoice | null {
    const englishVoices = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith('en')
    );
    const basePool = englishVoices.length ? englishVoices : voices;
    const matchingVoices = basePool.filter((voice) =>
      profile.keywords.some((keyword) =>
        voice.name.toLowerCase().includes(keyword)
      )
    );
    const voicePool = matchingVoices.length ? matchingVoices : basePool;
    if (!voicePool.length) {
      return null;
    }

    if (!forceChange && this.conversationVoiceName) {
      const lockedVoice = voicePool.find(
        (voice) => voice.name === this.conversationVoiceName
      );
      if (lockedVoice) {
        return lockedVoice;
      }
    }

    const avoidName = forceChange ? this.lastVoiceName : null;
    const availablePool =
      avoidName && voicePool.length > 1
        ? voicePool.filter((voice) => voice.name !== avoidName)
        : voicePool;

    const previousIndex =
      availablePool.length > 1 && avoidName
        ? availablePool.findIndex((voice) => voice.name === this.lastVoiceName)
        : null;
    const voiceIndex = this.pickRandomIndex(
      availablePool.length,
      previousIndex !== -1 ? previousIndex : null
    );
    return availablePool[voiceIndex] ?? null;
  }

  private getConversationPitch(
    profile: VoiceStyleProfile,
    forceChange: boolean
  ): number {
    if (!forceChange && this.conversationPitch !== null) {
      return this.conversationPitch;
    }
    const value = this.randomInRange(profile.pitchRange);
    this.conversationPitch = value;
    return value;
  }

  private getConversationRate(
    profile: VoiceStyleProfile,
    forceChange: boolean
  ): number {
    if (!forceChange && this.conversationRate !== null) {
      return this.conversationRate;
    }
    const value = this.randomInRange(profile.rateRange);
    this.conversationRate = value;
    return value;
  }

  private pickRandomIndex(
    length: number,
    previousIndex: number | null
  ): number {
    if (length <= 1 || previousIndex === null || previousIndex < 0) {
      return Math.floor(Math.random() * length);
    }

    const index = Math.floor(Math.random() * (length - 1));
    return index >= previousIndex ? index + 1 : index;
  }

  private randomInRange([min, max]: [number, number]): number {
    return Math.round((min + Math.random() * (max - min)) * 100) / 100;
  }

  private assignVoiceSafely(
    utterance: SpeechSynthesisUtterance,
    voice: NonNullable<SpeechSynthesisUtterance['voice']>
  ): void {
    try {
      utterance.voice = voice;
    } catch {
      // Some browsers expose voice-like objects that cannot be assigned directly.
    }
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
