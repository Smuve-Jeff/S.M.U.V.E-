import { Injectable, signal, computed, effect } from '@angular/core';

interface Track {
  name: string;
  url: string;
  albumArtUrl?: string;
}

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  volume: number;
  audioElement?: HTMLAudioElement;
}

@Injectable({
  providedIn: 'root'
})
export class DeckService {
  private audioContext: AudioContext;
  private deckAGain: GainNode;
  private deckBGain: GainNode;

  deckA = signal<DeckState>({ track: null, isPlaying: false, volume: 1 });
  deckB = signal<DeckState>({ track: null, isPlaying: false, volume: 1 });
  crossfade = signal(0); // -1 (A) to 1 (B)

  constructor() {
    this.audioContext = new AudioContext();
    this.deckAGain = this.audioContext.createGain();
    this.deckBGain = this.audioContext.createGain();

    this.deckAGain.connect(this.audioContext.destination);
    this.deckBGain.connect(this.audioContext.destination);

    effect(() => {
      const fade = this.crossfade();
      this.deckAGain.gain.setTargetAtTime(Math.cos((fade + 1) * 0.25 * Math.PI), this.audioContext.currentTime, 0.01);
      this.deckBGain.gain.setTargetAtTime(Math.cos((1 - fade) * 0.25 * Math.PI), this.audioContext.currentTime, 0.01);
    });
  }

  loadTrack(deck: 'A' | 'B', track: Track) {
    const deckState = deck === 'A' ? this.deckA : this.deckB;
    const gainNode = deck === 'A' ? this.deckAGain : this.deckBGain;

    deckState.update(d => {
      if (d.audioElement) {
        d.audioElement.src = track.url;
        d.audioElement.load();
      } else {
        const audio = new Audio(track.url);
        audio.crossOrigin = 'anonymous';
        const source = this.audioContext.createMediaElementSource(audio);
        source.connect(gainNode);
        d.audioElement = audio;
      }
      return { ...d, track };
    });
  }

  togglePlay(deck: 'A' | 'B') {
    const deckState = deck === 'A' ? this.deckA : this.deckB;
    deckState.update(d => {
      if (d.audioElement) {
        if (d.isPlaying) {
          d.audioElement.pause();
        } else {
          d.audioElement.play();
        }
        return { ...d, isPlaying: !d.isPlaying };
      }
      return d;
    });
  }
}
