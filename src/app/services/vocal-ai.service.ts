import { Injectable, signal, inject, effect } from '@angular/core';
import { AiService } from './ai.service';
import { MicrophoneService } from './microphone.service';
import { VocalMasteringService } from './vocal-mastering.service';

export interface VocalIntel {
  message: string;
  type: 'strategy' | 'technical' | 'market';
  priority: 'low' | 'medium' | 'high';
}

@Injectable({
  providedIn: 'root',
})
export class VocalAiService {
  private aiService = inject(AiService);
  private micService = inject(MicrophoneService);
  private mastering = inject(VocalMasteringService);

  vocalIntel = signal<VocalIntel[]>([]);
  isPassiveMode = signal(true);

  constructor() {
    // Monitor recording state and levels for passive feedback
    setInterval(() => {
      this.analyzeVocalSession();
    }, 5000);
  }

  private analyzeVocalSession() {
    if (!this.micService.isInitialized()) return;

    const intel: VocalIntel[] = [];

    // Technical Analysis
    if (this.micService.isRecording()) {
       intel.push({
         message: "SIGNAL CAPTURE IN PROGRESS. MAINTAIN CONSISTENT DISTANCE FROM DIAPHRAGM.",
         type: 'technical',
         priority: 'medium'
       });
    }

    // Mastering Analysis
    const p = this.mastering.params();
    if (p.exciter.amount > 0.8) {
       intel.push({
         message: "HARMONIC SATURATION EXCEEDS ELITE THRESHOLDS. REDUCE EXCITER TO PRESERVE SONIC PURITY.",
         type: 'technical',
         priority: 'high'
       });
    }

    if (p.limiter.ceiling > -0.5) {
       intel.push({
         message: "LIMITER CEILING IS AGGRESSIVE. LEAVE HEADROOM FOR STREAMING NORMALIZATION.",
         type: 'market',
         priority: 'medium'
       });
    }

    if (!this.isPassiveMode() || intel.length > 0) {
        this.vocalIntel.set(intel);
    }
  }

  async getDirectGuidance(prompt: string): Promise<string> {
    const context = `VOCAL SUITE CONTEXT: Recording: ${this.micService.isRecording()}. Mastering: ${JSON.stringify(this.mastering.params())}.`;
    return await this.aiService.processCommand(`${context} USER REQUEST: ${prompt}`);
  }
}
