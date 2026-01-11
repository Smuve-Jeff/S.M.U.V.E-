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
      }));
    } else {
      this.deckB.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
      }));
    }
  }
}
