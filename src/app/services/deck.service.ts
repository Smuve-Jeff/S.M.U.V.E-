import { Injectable, signal, effect } from '@angular/core';
import { AudioEngineService, DeckId } from './audio-engine.service';
import { Stems, DeckState, initialDeckState } from './user-context.service';

@Injectable({
  providedIn: 'root',
})
export class DeckService {
  automixEnabled = signal(false);
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

    effect(() => {
      if (this.automixEnabled()) {
        const progressA = this.deckA().progress;
        const durationA = this.deckA().duration;
        const isPlayingA = this.deckA().isPlaying;

        const progressB = this.deckB().progress;
        const durationB = this.deckB().duration;
        const isPlayingB = this.deckB().isPlaying;

        if (isPlayingA && durationA > 0 && durationA - progressA < 10 && this.crossfade() < 0.9) {
          if (!isPlayingB) this.togglePlay('B');
          this.engine.syncDecks('A', 'B');
          this.crossfade.set(Math.min(1, this.crossfade() + 0.01));
        }

        if (isPlayingB && durationB > 0 && durationB - progressB < 10 && this.crossfade() > -0.9) {
          if (!isPlayingA) this.togglePlay('A');
          this.engine.syncDecks('B', 'A');
          this.crossfade.set(Math.max(-1, this.crossfade() - 0.01));
        }
      }
    }, { allowSignalWrites: true });
  }

  toggleLoop(deck: DeckId) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const newState = !target().loop;
    target.update((d) => ({ ...d, loop: newState }));
    this.engine.setDeckLoop(deck, newState);
  }

  toggleSlip(deck: DeckId) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const newState = !target().slip;
    target.update((d) => ({ ...d, slip: newState }));
    this.engine.setSlipMode(deck, newState);
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

  loadDeckBuffer(
    deck: DeckId,
    buffer: AudioBuffer,
    fileName: string,
    vinylUrl?: string
  ) {
    this.engine.loadDeck(deck, buffer);
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({
      ...d,
      track: { ...d.track, name: fileName, url: '' },
      duration: buffer.duration,
      hotCues: new Array(8).fill(null),
      samplerPads: { drums: new Array(8).fill(null), fx: new Array(8).fill(null), vocals: new Array(8).fill(null) },
      progress: 0,
      vinylImageUrl: vinylUrl || 'https://picsum.photos/seed/' + fileName + '/200',
    }));
  }

  setHotCue(deck: DeckId, slot: number) {
    this.engine.setHotCue(deck, slot);
    const pos = this.engine.getDeckProgress(deck).position;
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const cues = [...d.hotCues];
      cues[slot] = pos;
      return { ...d, hotCues: cues };
    });
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

  setSamplerPad(deck: DeckId, slot: number, category: 'drums' | 'fx' | 'vocals' = 'drums', position?: number) {
    const pos = position ?? this.engine.getDeckProgress(deck).position;
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const samplerPads = { ...d.samplerPads };
      samplerPads[category] = [...samplerPads[category]];
      samplerPads[category][slot] = pos;
      return { ...d, samplerPads };
    });
  }

  clearSamplerPad(deck: DeckId, slot: number, category: 'drums' | 'fx' | 'vocals' = 'drums') {
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => {
      const samplerPads = { ...d.samplerPads };
      samplerPads[category] = [...samplerPads[category]];
      samplerPads[category][slot] = null;
      return { ...d, samplerPads };
    });
  }

  jumpToHotCue(deck: DeckId, slot: number) {
    this.engine.jumpToHotCue(deck, slot);
    this.syncDeckState(deck);
  }

  setDeckEq(deck: DeckId, high: number, mid: number, low: number) {
    this.engine.setDeckEq(deck, high, mid, low);
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, eqHigh: high, eqMid: mid, eqLow: low }));
  }

  setDeckFilter(deck: DeckId, freq: number) {
    this.engine.setDeckFilter(deck, freq);
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, filterFreq: freq }));
  }

  setDeckSend(deck: DeckId, send: 'A' | 'B', gain: number) {
    this.engine.setDeckSend(deck, send, gain);
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, [send === 'A' ? 'sendA' : 'sendB']: gain }));
  }

  setBpm(deck: DeckId, bpm: number) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, bpm }));
  }

  setDeckGain(deck: DeckId, gain: number) {
    this.engine.setDeckGain(deck, gain);
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, gain }));
  }

  sync(id: DeckId) {
    const master = id === 'A' ? this.deckB() : this.deckA();
    const slave = id === 'A' ? this.deckA : this.deckB;
    slave.update((d) => ({ ...d, bpm: master.bpm }));
  }

  syncProgress() {
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

  toggleCue(deck: DeckId) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const newState = !target().isCueing;
    target.update((d) => ({ ...d, isCueing: newState }));
    this.engine.setDeckCue(deck, newState);
  }

  setFx(deck: DeckId, type: 'none' | 'flanger' | 'phaser' | 'delay', amount: number) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, activeFx: type, fxAmount: amount }));
    if (type !== 'none') this.engine.setAdvancedFX(deck, type, amount);
  }

  scratch(deck: DeckId, delta: number) {
    this.engine.scratch(deck, delta);
    this.syncDeckState(deck);
  }

  async autoSync(deck: DeckId) {
    const masterId = deck === 'A' ? 'B' : 'A';
    this.engine.syncDecks(masterId, deck);
    this.syncDeckState(deck);
  }

  setHeadphoneGain(val: number) {
    this.engine.setHeadphoneGain(val);
  }

  toggleAutomix() {
    this.automixEnabled.update(v => !v);
  }
}
