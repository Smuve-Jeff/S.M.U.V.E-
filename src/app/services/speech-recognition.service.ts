import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechRecognitionService {
  isListening = signal(false);
  private speechRecognition: SpeechRecognition | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = false;
    } else {
      console.error('Speech recognition not supported in this browser.');
    }
  }

  startListening(onResult: (text: string) => void): void {
    if (this.speechRecognition && !this.isListening()) {
      this.speechRecognition.onresult = (event: {
        results: SpeechRecognitionResultList;
      }) => {
        const transcript =
          event.results[event.results.length - 1][0].transcript.trim();
        onResult(transcript);
        this.isListening.set(false);
      };
      this.speechRecognition.onend = () => this.isListening.set(false);
      this.speechRecognition.onerror = (event: { error: string }) => {
        console.error('Speech recognition error', event);
        this.isListening.set(false);
      };
      try {
        this.speechRecognition.start();
        this.isListening.set(true);
      } catch (error) {
        console.error('Could not start speech recognition', error);
        this.isListening.set(false);
      }
    }
  }

  stopListening(): void {
    if (this.speechRecognition && this.isListening()) {
      this.speechRecognition.stop();
      this.isListening.set(false);
    }
  }
}
