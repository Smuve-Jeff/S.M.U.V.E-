import { Injectable, signal } from '@angular/core';

interface VoiceStyleProfile {
  keywords: string[];
  pitchRange: [number, number];
  rateRange: [number, number];
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
      keywords: ['google', 'serena', 'ava', 'alloy'],
      pitchRange: [0.95, 1.2],
      rateRange: [0.92, 1.08],
    },
  ];
  private lastProfileIndex: number | null = null;
  private lastVoiceName: string | null = null;

  constructor() {}

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Pronunciation rule: S.M.U.V.E -> Smooth
    const processedText = text
      .replace(/S\.M\.U\.V\.E(?:\s+4\.\d+)?/gi, 'Smooth')
      .replace(/SMUVE/gi, 'Smooth');

    this.cancel();

    const utterance = new SpeechSynthesisUtterance(processedText);
    this.configureUtterance(utterance);

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    // Speak primary
    window.speechSynthesis.speak(utterance);
  }

  private configureUtterance(utterance: SpeechSynthesisUtterance) {
    const voices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
    const profileIndex = this.pickRandomIndex(
      this.voiceProfiles.length,
      this.lastProfileIndex
    );
    const profile = this.voiceProfiles[profileIndex];
    const matchingVoices = voices.filter((voice) =>
      profile.keywords.some((keyword) =>
        voice.name.toLowerCase().includes(keyword)
      )
    );
    const voicePool = matchingVoices.length ? matchingVoices : voices;

    if (voicePool.length) {
      const voiceIndex = this.pickRandomIndex(
        voicePool.length,
        voicePool.findIndex((voice) => voice.name === this.lastVoiceName)
      );
      const selectedVoice = voicePool[voiceIndex];
      this.assignVoiceSafely(utterance, selectedVoice);
      this.lastVoiceName = selectedVoice.name;
    }

    utterance.pitch = this.randomInRange(profile.pitchRange);
    utterance.rate = this.randomInRange(profile.rateRange);
    utterance.volume = 1.0;
    this.lastProfileIndex = profileIndex;
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
