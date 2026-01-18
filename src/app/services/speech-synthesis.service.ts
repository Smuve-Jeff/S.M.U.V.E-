import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);
  private queue: SpeechSynthesisUtterance[] = [];

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    this.cancel();
    this.glitchSpeak(text);
  }

  private glitchSpeak(text: string): void {
    const words = text.split(' ');
    const chunks: string[] = [];

    // Group words into chunks of 1-3
    for (let i = 0; i < words.length; i += Math.floor(Math.random() * 3) + 1) {
      chunks.push(words.slice(i, i + 3).join(' '));
    }

    this.queue = chunks.map((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);

      // Randomly change pitch drastically mid-sentence
      // High pitch (1.5 - 2.0) or Low pitch (0.1 - 0.5)
      utterance.pitch = Math.random() > 0.5
        ? 1.5 + Math.random() * 0.5
        : 0.1 + Math.random() * 0.4;

      // Randomize rate slightly for more "glitch" feel
      utterance.rate = 0.8 + Math.random() * 0.4;

      if (index === 0) {
        utterance.onstart = () => this.isSpeaking.set(true);
      }

      if (index === chunks.length - 1) {
        utterance.onend = () => {
          this.isSpeaking.set(false);
          this.queue = [];
        };
      }

      return utterance;
    });

    this.queue.forEach(u => window.speechSynthesis.speak(u));
  }

  cancel(): void {
    if (window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
