import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    this.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Attempt to find a natural-sounding voice
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

    // Set standard human-like parameters
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => {
      this.isSpeaking.set(false);
    };
    utterance.onerror = () => {
      this.isSpeaking.set(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
