import { LoggingService } from './logging.service';
import { Injectable, signal, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechRecognitionService {
  private logger = inject(LoggingService);
  isListening = signal(false);
  isSupported = signal(false);
  private speechRecognition: SpeechRecognition | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      this.logger.warn('Speech recognition is unavailable in this browser.');
      return;
    }

    try {
      const speechRecognition = new SpeechRecognitionConstructor() as SpeechRecognition;
      speechRecognition.continuous = false;
      speechRecognition.interimResults = false;
      this.speechRecognition = speechRecognition;
      this.isSupported.set(true);
    } catch (error) {
      this.logger.error('Could not initialize speech recognition', error);
    }
  }

  startListening(onResult: (text: string) => void): void {
    if (this.speechRecognition && this.isSupported() && !this.isListening()) {
      this.speechRecognition.onresult = (event: {
        results: SpeechRecognitionResultList;
      }) => {
        try {
          const result = event.results[event.results.length - 1];
          const transcript = result?.[0]?.transcript?.trim() ?? '';
          if (transcript) onResult(transcript);
        } catch (error) {
          this.logger.error('Could not read speech transcript', error);
        } finally {
          this.isListening.set(false);
        }
      };
      this.speechRecognition.onend = () => this.isListening.set(false);
      this.speechRecognition.onerror = (event: { error: string }) => {
        this.logger.error('Speech recognition error', event);
        this.isListening.set(false);
      };
      try {
        this.speechRecognition.start();
        this.isListening.set(true);
      } catch (error) {
        this.logger.error('Could not start speech recognition', error);
        this.isListening.set(false);
      }
    }
  }

  stopListening(): void {
    if (this.speechRecognition && this.isListening()) {
      try {
        this.speechRecognition.stop();
      } catch (error) {
        this.logger.error('Could not stop speech recognition', error);
      } finally {
        this.isListening.set(false);
      }
    }
  }
}
