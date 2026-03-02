import { Injectable, signal, effect } from '@angular/core';
import { AudioEngineService } from './audio-engine.service';
import { Stems } from './stem-separation.service';
import { DeckState, initialDeckState } from './user-context.service';

@Injectable({
  providedIn: 'root',
})
export class DeckService {
  deckA = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  deckB = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  crossfade = signal(0);
  xfCurve = signal<'linear' | 'power' | 'exp' | 'cut'>('linear');
  hamster = signal(false);

  constructor(private engine: AudioEngineService) {
    effect(() => {
      this.engine.setCrossfader(
        this.crossfade(),
        this.xfCurve(),
        this.hamster()
      );
    });
    effect(() => {
      this.engine.setDeckRate('A', this.deckA().playbackRate);
    });
    effect(() => {
      this.engine.setDeckRate('B', this.deckB().playbackRate);
    });
  }

  togglePlay(deck: 'A' | 'B') {
    const state = deck === 'A' ? this.deckA() : this.deckB();
    if (state.isPlaying) {
      this.engine.pauseDeck(deck);
    } else {
      this.engine.playDeck(deck);
    }
    if (deck === 'A')
      this.deckA.update((d) => ({ ...d, isPlaying: !state.isPlaying }));
    else this.deckB.update((d) => ({ ...d, isPlaying: !state.isPlaying }));
  }

  onStemGainChange(deck: 'A' | 'B', event: { stem: string; gain: number }) {
    this.engine.setStemGain(deck, event.stem as keyof Stems, event.gain);
  }

  loadDeckBuffer(deck: 'A' | 'B', buffer: AudioBuffer, fileName: string) {
    this.engine.loadDeckBuffer(deck, buffer);
    if (deck === 'A') {
      this.deckA.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        progress: 0
      }));
    } else {
      this.deckB.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        progress: 0
      }));
    }
  }

  setHotCue(deck: 'A' | 'B', slot: number) {
    this.engine.setHotCue(deck, slot);
    const pos = this.engine.getDeckProgress(deck).position;
    if (deck === 'A') {
      this.deckA.update(d => {
        const cues = [...d.hotCues];
        cues[slot] = pos;
        return { ...d, hotCues: cues };
      });
    } else {
      this.deckB.update(d => {
        const cues = [...d.hotCues];
        cues[slot] = pos;
        return { ...d, hotCues: cues };
      });
    }
  }

  jumpToHotCue(deck: 'A' | 'B', slot: number) {
    this.engine.jumpToHotCue(deck, slot);
  }

  setDeckEq(deck: 'A' | 'B', high: number, mid: number, low: number) {
    this.engine.setDeckEq(deck, high, mid, low);
    if (deck === 'A') this.deckA.update(d => ({ ...d, eqHigh: high, eqMid: mid, eqLow: low }));
    else this.deckB.update(d => ({ ...d, eqHigh: high, eqMid: mid, eqLow: low }));
  }

  setDeckFilter(deck: 'A' | 'B', freq: number) {
    this.engine.setDeckFilterFreq(deck, freq);
    if (deck === 'A') this.deckA.update(d => ({ ...d, filterFreq: freq }));
    else this.deckB.update(d => ({ ...d, filterFreq: freq }));
  }

  setDeckGain(deck: 'A' | 'B', gain: number) {
    this.engine.setDeckGain(deck, gain);
    if (deck === 'A') this.deckA.update(d => ({ ...d, gain }));
    else this.deckB.update(d => ({ ...d, gain }));
  }

  syncProgress() {
    const progA = this.engine.getDeckProgress('A');
    const progB = this.engine.getDeckProgress('B');
    this.deckA.update(d => ({ ...d, progress: progA.position, isPlaying: progA.isPlaying }));
    this.deckB.update(d => ({ ...d, progress: progB.position, isPlaying: progB.isPlaying }));
  }
}
