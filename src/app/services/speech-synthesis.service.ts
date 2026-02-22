import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);
  private iframe: HTMLIFrameElement | null = null;

  constructor() {
    this.initIframe();
  }

  private initIframe() {
    if (typeof document !== 'undefined') {
      this.iframe = document.createElement('iframe');
      this.iframe.style.display = 'none';
      document.body.appendChild(this.iframe);
    }
  }

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Pronunciation rule: S.M.U.V.E -> Smooth
    const processedText = text.replace(/S\.M\.U\.V\.E/gi, 'Smooth').replace(/SMUVE/gi, 'Smooth');

    this.cancel();

    // Dual voice synthesis: Ominous, harmonized tone
    // Primary Voice (Female) - Higher Pitch
    const femaleUtterance = new SpeechSynthesisUtterance(processedText);
    this.configureUtterance(femaleUtterance, 1.1, 0.9);

    // Secondary Voice (Male) - Lower Pitch, via Iframe to bypass queue
    const maleUtterance = new SpeechSynthesisUtterance(processedText);
    this.configureUtterance(maleUtterance, 0.7, 0.85);

    femaleUtterance.onstart = () => this.isSpeaking.set(true);
    femaleUtterance.onend = () => this.isSpeaking.set(false);
    femaleUtterance.onerror = () => this.isSpeaking.set(false);

    // Speak primary
    window.speechSynthesis.speak(femaleUtterance);

    // Speak secondary via iframe's synthesis if available, otherwise just use main
    if (this.iframe && this.iframe.contentWindow && (this.iframe.contentWindow as any).speechSynthesis) {
        (this.iframe.contentWindow as any).speechSynthesis.speak(maleUtterance);
    } else {
        // Fallback or skip secondary if iframe not ready
        console.warn('SpeechSynthesis: Secondary voice (iframe) not available.');
    }
  }

  private configureUtterance(utterance: SpeechSynthesisUtterance, pitch: number, rate: number) {
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
        (v.name.includes('Google') || v.name.includes('Natural')) && v.lang.startsWith('en')
    ) || voices.find(v => v.lang.startsWith('en'));

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
      if (this.iframe && this.iframe.contentWindow && (this.iframe.contentWindow as any).speechSynthesis) {
        (this.iframe.contentWindow as any).speechSynthesis.cancel();
      }
      this.isSpeaking.set(false);
    }
  }
}
