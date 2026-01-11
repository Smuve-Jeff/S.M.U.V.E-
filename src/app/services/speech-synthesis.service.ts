import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);
  private utterance: SpeechSynthesisUtterance | null = null;

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    this.cancel();

    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.onstart = () => this.isSpeaking.set(true);
    this.utterance.onend = () => this.isSpeaking.set(false);
    this.utterance.onerror = (event) => {
      console.error('Speech synthesis error', event);
      this.isSpeaking.set(false);
    };

    try {
      window.speechSynthesis.speak(this.utterance);
    } catch (error) {
      console.error('Error speaking response:', error);
      this.isSpeaking.set(false);
    }
  }

  cancel(): void {
    if (window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }
}
