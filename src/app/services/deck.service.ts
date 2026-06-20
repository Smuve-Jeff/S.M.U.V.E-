import { Injectable, signal, effect } from '@angular/core';
import { AudioEngineService, DeckId } from './audio-engine.service';
import { Stems, DeckState, initialDeckState } from './user-context.service';

@Injectable({
  providedIn: 'root',
})
export class DeckService {
  deckA = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  deckB = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  crossfade = signal(0);
  automix = signal(false);
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
      const deck = this.deckA();
      this.engine.setDeckRate('A', deck.playbackRate, deck.keyLock);
    });
    effect(() => {
      const deck = this.deckB();
      this.engine.setDeckRate('B', deck.playbackRate, deck.keyLock);
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

  onStemGainChange(deck: DeckId, event: { stem: keyof Stems; gain: number }) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({
      ...d,
      stemGains: {
        ...d.stemGains,
        [event.stem]: event.gain,
      },
    }));
    this.engine.setDeckStemGain(deck, event.stem, event.gain);
  }

  toggleCue(deck: DeckId) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const newState = !target().isCueing;
    target.update((d) => ({ ...d, isCueing: newState }));
    this.engine.setDeckCue(deck, newState);
  }

  autoSync(deck: DeckId) {
    const other = deck === 'A' ? 'B' : 'A';
    this.engine.syncDecks(other, deck);
  }

  scratch(deck: DeckId, delta: number) {
    this.engine.scratch(deck, delta);
  }

  setFx(deck: DeckId, mode: string, val: number) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const amount = Math.max(0, Math.min(1, val));
    target.update((d) => ({ ...d, fxAmount: amount, activeFx: mode as any }));

    if (mode === 'echo') {
      this.engine.setAdvancedFX(deck, 'delay', amount);
      return;
    }
    if (mode === 'chorus') {
      this.engine.setAdvancedFX(deck, 'flanger', amount);
      return;
    }
    if (mode === 'phaser') {
      this.engine.setAdvancedFX(deck, 'phaser', amount);
      return;
    }
    if (mode === 'autowah') {
      const freq = 350 + amount * 5500;
      this.engine.setDeckFilter(deck, freq);
      return;
    }
    if (mode === 'damp') {
      const high = Math.max(0, 1 - amount * 0.8);
      const mid = Math.max(0.25, 1 - amount * 0.35);
      const low = 1 + amount * 0.1;
      this.setDeckEq(deck, high, mid, low);
      return;
    }
    if (mode === 'reverb') {
      this.engine.setDeckSend(deck, 'A', amount);
      return;
    }
    if (mode === 'rotate') {
      this.engine.setDeckSend(deck, 'A', amount);
      this.engine.setDeckSend(deck, 'B', 1 - amount);
    }
  }

  toggleAutomix() {
    this.automix.update((active) => !active);
  }

  automixEnabled() {
    return this.automix();
  }

  setSamplerPad(
    deck: DeckId,
    index: number,
    category: 'drums' | 'fx' | 'vocals'
  ) {
    const progress = this.engine.getDeckProgress(deck).position;
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const categoryPads = [...d.samplerPads[category]];
      categoryPads[index] = progress;
      return {
        ...d,
        samplerPads: {
          ...d.samplerPads,
          [category]: categoryPads,
        },
      };
    });
  }

  clearSamplerPad(
    deck: DeckId,
    index: number,
    category: 'drums' | 'fx' | 'vocals'
  ) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const categoryPads = [...d.samplerPads[category]];
      categoryPads[index] = null;
      return {
        ...d,
        samplerPads: {
          ...d.samplerPads,
          [category]: categoryPads,
        },
      };
    });
  }

  setPlaybackRate(deck: DeckId, rate: number) {
    const next = this.clamp(rate, 0.5, 2);
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, playbackRate: next }));
    this.engine.setDeckRate(deck, next, target().keyLock);
  }

  setKeyLock(deck: DeckId, enabled: boolean) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const state = target();
    target.update((d) => ({ ...d, keyLock: enabled }));
    this.engine.setDeckRate(deck, state.playbackRate, enabled);
  }

  setBassBoost(deck: DeckId, amount: number) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const normalized = this.clamp(amount, 0, 1);
    const deckState = target();
    target.update((d) => ({ ...d, bassBoost: normalized }));
    const boostedLow = this.clamp(deckState.eqLow + normalized * 0.8, 0, 2);
    this.engine.setDeckEq(deck, deckState.eqHigh, deckState.eqMid, boostedLow);
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
        samplerPads: {
          drums: new Array(8).fill(null),
          fx: new Array(8).fill(null),
          vocals: new Array(8).fill(null),
        },
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
        samplerPads: {
          drums: new Array(8).fill(null),
          fx: new Array(8).fill(null),
          vocals: new Array(8).fill(null),
        },
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

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
