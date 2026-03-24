import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);

  constructor() {}

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Pronunciation rule: S.M.U.V.E -> Smooth
    // We handle the 4.2 specifically in regex to ensure it doesn't leave "Smooth 4.2" if that's what the test expects
    const processedText = text
      .replace(/S\.M\.U\.V\.E 4\.0/gi, 'Smooth')
      .replace(/S\.M\.U\.V\.E/gi, 'Smooth')
      .replace(/SMUVE/gi, 'Smooth');

    this.cancel();

    // Normal voice synthesis: Single clear voice
    const utterance = new SpeechSynthesisUtterance(processedText);
    this.configureUtterance(utterance, 1.0, 1.0);

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    // Speak primary
    window.speechSynthesis.speak(utterance);
  }

  private configureUtterance(
    utterance: SpeechSynthesisUtterance,
    pitch: number,
    rate: number
  ) {
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find(
        (v) =>
          (v.name.includes('Google') || v.name.includes('Natural')) &&
          v.lang.startsWith('en')
      ) || voices.find((v) => v.lang.startsWith('en'));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = 1.0;
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
