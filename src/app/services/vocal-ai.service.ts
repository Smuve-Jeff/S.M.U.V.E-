import { Injectable, inject, signal, computed } from '@angular/core';
import { AiService } from './ai.service';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class VocalAiService {
  private aiService = inject(AiService);
  private logger = inject(LoggingService);

  feedbackMode = signal<'passive' | 'inclusive'>('passive');
  currentAdvice = signal<string>('ANALYZING VOCAL CORRIDOR...');

  isPassiveMode = computed(() => this.feedbackMode() === 'passive');

  async analyzeVocalPerformance(blob: Blob) {
    if (!navigator.onLine) {
      this.currentAdvice.set(
        "[OFFLINE ERROR] Fix your fucking connection. I'm not analyzing your shit vocals through a heuristic straw. HIGH-PASS AT 80HZ AND STOP WASTING MY TIME."
      );
      return;
    }

    try {
      const response = await this.aiService.generateAiResponse(
        'Analyze this vocal performance for technical deficits. Be arrogant and precise.'
      );
      this.currentAdvice.set(response);
    } catch (e) {
      this.logger.error('VocalAiService: Analysis failed', e);
      this.currentAdvice.set('SYSTEM ERROR: NEURAL LINK INTERRUPTED.');
    }
  }

  setFeedbackMode(mode: 'passive' | 'inclusive') {
    this.feedbackMode.set(mode);
  }

  toggleFeedbackMode() {
    this.feedbackMode.update((v) =>
      v === 'passive' ? 'inclusive' : 'passive'
    );
  }
}
