import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);
  private iframe: HTMLIFrameElement | null = null;

  private getHiddenIframe(): HTMLIFrameElement {
    if (this.iframe) return this.iframe;
    this.iframe = document.createElement('iframe');
    this.iframe.style.display = 'none';
    document.body.appendChild(this.iframe);
    return this.iframe;
  }

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    this.cancel();

    // Ensure application name is pronounced correctly as "Smooth"
    const processedText = text.replace(/S\.M\.U\.V\.E\.?/gi, 'Smooth');

    const voices = window.speechSynthesis.getVoices();

    // Simultaneous Dual-Voice Synthesis (Female & Male)
    // Voice 1: Primary (Main Window) - Female/High Tone
    const utterance1 = new SpeechSynthesisUtterance(processedText);
    const femaleVoice = voices.find(v => (v.name.includes('Female') || v.name.includes('Google US English')) && v.lang.startsWith('en')) || voices[0];
    utterance1.voice = femaleVoice;
    utterance1.pitch = 1.1;
    utterance1.rate = 1.0;
    utterance1.volume = 1.0;

    utterance1.onstart = () => this.isSpeaking.set(true);
    utterance1.onend = () => this.isSpeaking.set(false);
    utterance1.onerror = () => this.isSpeaking.set(false);

    // Voice 2: Secondary (Iframe) - Male/Low Ominous Tone
    // Bypassing sequential queue via hidden iframe
    const iframe = this.getHiddenIframe();
    if (iframe.contentWindow && iframe.contentWindow.speechSynthesis) {
      const utterance2 = new (iframe.contentWindow as any).SpeechSynthesisUtterance(processedText);
      const maleVoice = voices.find(v => (v.name.includes('Male') || v.name.includes('Google UK English Male')) && v.lang.startsWith('en')) || voices[0];
      utterance2.voice = maleVoice;
      utterance2.pitch = 0.7;
      utterance2.rate = 1.0;
      utterance2.volume = 0.8; // Slightly lower for harmony

      window.speechSynthesis.speak(utterance1);
      iframe.contentWindow.speechSynthesis.speak(utterance2);
    } else {
      // Fallback if iframe fails
      window.speechSynthesis.speak(utterance1);
    }
  }

  cancel(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
    if (this.iframe && this.iframe.contentWindow?.speechSynthesis) {
      this.iframe.contentWindow.speechSynthesis.cancel();
    }
  }
}
