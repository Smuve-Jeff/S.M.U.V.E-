import { Injectable, signal, effect } from '@angular/core';
import { AudioEngineService, DeckId } from './audio-engine.service';
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
  viewMode = signal<'functional' | 'flat'>('functional');

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

  toggleLoop(deck: DeckId) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const newState = !target().loop;
    target.update((d) => ({ ...d, loop: newState }));
    this.engine.setDeckLoop(deck, newState);
  }

  toggleSlip(deck: DeckId) {
    if (deck === 'A') {
      const newState = !this.deckA().slip;
      this.deckA.update((d) => ({ ...d, slip: newState }));
      this.engine.setSlipMode('A', newState);
    } else {
      const newState = !this.deckB().slip;
      this.deckB.update((d) => ({ ...d, slip: newState }));
      this.engine.setSlipMode('B', newState);
    }
  }

  toggleViewMode() {
    this.viewMode.update((m) => (m === 'functional' ? 'flat' : 'functional'));
  }

  togglePlay(deck: DeckId) {
    const state = deck === 'A' ? this.deckA() : this.deckB();
    if (state.isPlaying) {
      this.engine.pauseDeck(deck);
    } else {
      this.engine.playDeck(deck);
    }
    this.syncDeckState(deck);
  }

  onStemGainChange(deck: DeckId, event: { stem: string; gain: number }) {
    this.engine.setDeckStemGain(deck, event.stem as keyof Stems, event.gain);
  }

  loadDeckBuffer(
    deck: DeckId,
    buffer: AudioBuffer,
    fileName: string,
    vinylUrl?: string
  ) {
    this.engine.loadDeck(deck, buffer);
    if (deck === 'A') {
      this.deckA.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        samplerPads: new Array(8).fill(null),
        progress: 0,
        vinylImageUrl:
          vinylUrl || 'https://picsum.photos/seed/' + fileName + '/200',
      }));
    } else {
      this.deckB.update((d) => ({
        ...d,
        track: { ...d.track, name: fileName, url: '' },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        samplerPads: new Array(8).fill(null),
        progress: 0,
        vinylImageUrl:
          vinylUrl || 'https://picsum.photos/seed/' + fileName + '/200',
      }));
    }
  }

  setHotCue(deck: DeckId, slot: number) {
    this.engine.setHotCue(deck, slot);
    const pos = this.engine.getDeckProgress(deck).position;
    if (deck === 'A') {
      this.deckA.update((d) => {
        const cues = [...d.hotCues];
        cues[slot] = pos;
        return { ...d, hotCues: cues };
      });
    } else {
      this.deckB.update((d) => {
        const cues = [...d.hotCues];
        cues[slot] = pos;
        return { ...d, hotCues: cues };
      });
    }
  }

  clearHotCue(deck: DeckId, slot: number) {
    this.engine.clearHotCue(deck, slot);
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const cues = [...d.hotCues];
      cues[slot] = null;
      return { ...d, hotCues: cues };
    });
  }

  setSamplerPad(deck: DeckId, slot: number, position?: number) {
    const pos = position ?? this.engine.getDeckProgress(deck).position;
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const samplerPads = [...d.samplerPads];
      samplerPads[slot] = pos;
      return { ...d, samplerPads };
    });
  }

  clearSamplerPad(deck: DeckId, slot: number) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const samplerPads = [...d.samplerPads];
      samplerPads[slot] = null;
      return { ...d, samplerPads };
    });
  }

  jumpToHotCue(deck: DeckId, slot: number) {
    this.engine.jumpToHotCue(deck, slot);
    this.syncDeckState(deck);
  }

  setDeckEq(deck: DeckId, high: number, mid: number, low: number) {
    this.engine.setDeckEq(deck, high, mid, low);
    if (deck === 'A')
      this.deckA.update((d) => ({
        ...d,
        eqHigh: high,
        eqMid: mid,
        eqLow: low,
      }));
    else
      this.deckB.update((d) => ({
        ...d,
        eqHigh: high,
        eqMid: mid,
        eqLow: low,
      }));
  }

  setDeckFilter(deck: DeckId, freq: number) {
    this.engine.setDeckFilter(deck, freq);
    if (deck === 'A') this.deckA.update((d) => ({ ...d, filterFreq: freq }));
    else this.deckB.update((d) => ({ ...d, filterFreq: freq }));
  }

  setDeckSend(deck: DeckId, send: 'A' | 'B', gain: number) {
    this.engine.setDeckSend(deck, send, gain);
    if (deck === 'A')
      this.deckA.update((d) => ({
        ...d,
        [send === 'A' ? 'sendA' : 'sendB']: gain,
      }));
    else
      this.deckB.update((d) => ({
        ...d,
        [send === 'A' ? 'sendA' : 'sendB']: gain,
      }));
  }

  setBpm(deck: DeckId, bpm: number) {
    if (deck === 'A') this.deckA.update((d) => ({ ...d, bpm }));
    else this.deckB.update((d) => ({ ...d, bpm }));
  }

  setBeatGridOffset(deck: DeckId, offset: number) {
    if (deck === 'A')
      this.deckA.update((d) => ({ ...d, beatGridOffset: offset }));
    else this.deckB.update((d) => ({ ...d, beatGridOffset: offset }));
  }

  setDeckGain(deck: DeckId, gain: number) {
    this.engine.setDeckGain(deck, gain);
    if (deck === 'A') this.deckA.update((d) => ({ ...d, gain }));
    else this.deckB.update((d) => ({ ...d, gain }));
  }

  sync(id: DeckId) {
    const target = id === 'A' ? this.deckB() : this.deckA();
    if (id === 'A') {
      this.deckA.update((d) => ({ ...d, bpm: target.bpm }));
    } else {
      this.deckB.update((d) => ({ ...d, bpm: target.bpm }));
    }
  }

  syncProgress() {
    // In a real app we would use an analyzer for BPM detection
    // for now we just sync the positions and playing state
    this.syncDeckState('A');
    this.syncDeckState('B');
  }

  private syncDeckState(deck: DeckId) {
    const progress = this.engine.getDeckProgress(deck);
    const playbackRate = this.engine.getDeck(deck).rate;
    const target = deck === 'A' ? this.deckA : this.deckB;

    target.update((d) => ({
      ...d,
      progress: progress.position,
      duration: progress.duration || d.duration,
      isPlaying: progress.isPlaying,
      playbackRate,
    }));
  }
}
