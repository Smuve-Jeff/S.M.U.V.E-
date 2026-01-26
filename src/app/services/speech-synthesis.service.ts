import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpeechSynthesisService {
  isSpeaking = signal(false);
  private maleIframe: HTMLIFrameElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.maleIframe = document.createElement('iframe');
      this.maleIframe.style.display = 'none';
      document.body.appendChild(this.maleIframe);
    }
  }

  speak(text: string): void {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    this.cancel();

    // Ensure 'S.M.U.V.E' is pronounced as 'Smooth'
    let processedText = text.replace(/S\.M\.U\.V\.E/gi, 'Smooth');
    processedText = processedText.replace(/SMUVE/gi, 'Smooth');

    const voices = window.speechSynthesis.getVoices();

    // Select a professional female voice for main window
    const femaleVoice = voices.find(v =>
      v.lang.startsWith('en') &&
      (v.name.includes('Female') || v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Zira'))
    );

    // Select a professional male voice for iframe
    const maleVoice = voices.find(v =>
      v.lang.startsWith('en') &&
      (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Alex') || v.name.includes('Google UK English Male'))
    ) || voices.find(v => v.lang.startsWith('en') && v !== femaleVoice);

    const femaleUtterance = new SpeechSynthesisUtterance(processedText);
    if (femaleVoice) femaleUtterance.voice = femaleVoice;
    femaleUtterance.pitch = 1.1;
    femaleUtterance.rate = 0.9;
    femaleUtterance.volume = 0.8;

    let voicesFinished = 0;
    const onEnd = () => {
      voicesFinished++;
      if (voicesFinished >= 2) {
        this.isSpeaking.set(false);
      }
    };

    femaleUtterance.onstart = () => this.isSpeaking.set(true);
    femaleUtterance.onend = onEnd;
    femaleUtterance.onerror = onEnd;

    // Trigger female voice in main window
    window.speechSynthesis.speak(femaleUtterance);

    // Trigger male voice in iframe to achieve simultaneity
    if (this.maleIframe?.contentWindow) {
      const maleUtterance = new (this.maleIframe.contentWindow as any).SpeechSynthesisUtterance(processedText);
      if (maleVoice) maleUtterance.voice = maleVoice;
      maleUtterance.pitch = 0.7; // Lower for male
      maleUtterance.rate = 0.9;
      maleUtterance.volume = 0.8;
      maleUtterance.onend = onEnd;
      maleUtterance.onerror = onEnd;
      (this.maleIframe.contentWindow as any).speechSynthesis.speak(maleUtterance);
    } else {
      // Fallback if iframe fails
      onEnd();
    }
  }

  cancel(): void {
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
      if (this.maleIframe?.contentWindow) {
        (this.maleIframe.contentWindow as any).speechSynthesis?.cancel();
      }
      this.isSpeaking.set(false);
    }
  }
}
