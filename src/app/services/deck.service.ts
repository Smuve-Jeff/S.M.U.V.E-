import { Injectable, signal, effect } from '@angular/core';
import { AudioEngineService, DeckId } from './audio-engine.service';
import { Stems, DeckState, initialDeckState } from './user-context.service';

const MIN_AUTOWAH_FREQUENCY = 350;
const AUTOWAH_FREQUENCY_RANGE = 5500;
const DAMP_HIGH_REDUCTION = 0.8;
const DAMP_MID_FLOOR = 0.25;
const DAMP_MID_REDUCTION = 0.35;
const DAMP_LOW_LIFT = 0.1;

@Injectable({
  providedIn: 'root',
})
export class DeckService {
  deckA = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  deckB = signal<DeckState>({ ...initialDeckState, playbackRate: 1 });
  crossfade = signal(0);
  automix = signal(false);
  xfCurve = signal<'linear' | 'power' | 'exp' | 'cut'>('power');
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

  /**
   * Sync a deck to the other one. `deck` is the deck being pulled into
   * tempo/phase alignment with its counterpart.
   *
   * 1. Tempo match: sets `deck`'s playback rate so its effective BPM
   *    (native BPM × rate) equals the master's effective BPM.
   * 2. Phase alignment: snaps the slave playhead to the equivalent beat
   *    phase within its own beat grid so downbeats land together.
   */
  autoSync(deck: DeckId) {
    const masterId = deck === 'A' ? 'B' : 'A';
    const master = masterId === 'A' ? this.deckA() : this.deckB();
    const slave = deck === 'A' ? this.deckA() : this.deckB();

    const masterBpm = master.bpm || 0;
    const slaveBpm = slave.bpm || 0;
    if (!master.duration || !slave.duration || masterBpm <= 0 || slaveBpm <= 0) {
      return;
    }

    // Match effective tempo: masterEff = nativeBpm × rate.
    const masterEff = masterBpm * (master.playbackRate || 1);
    const targetRate = this.clamp(masterEff / slaveBpm, 0.5, 2);
    if (Math.abs((slave.playbackRate || 1) - targetRate) > 0.0005) {
      this.setPlaybackRate(deck, targetRate);
    }

    // Phase-align both decks on their own beat grids (source-seconds).
    const masterProg = this.engine.getDeckProgress(masterId);
    const slaveProg = this.engine.getDeckProgress(deck);
    if (masterProg.duration <= 0 || slaveProg.duration <= 0) return;
    const masterBeat = 60 / masterBpm;
    const slaveBeat = 60 / slaveBpm;
    const phase = (masterProg.position % masterBeat) - (slaveProg.position % slaveBeat);
    const target = this.clamp(
      slaveProg.position + phase,
      0,
      Math.max(0, slaveProg.duration - 0.001)
    );
    if (Math.abs(slaveProg.position - target) > 0.002) {
      this.engine.seekDeck(deck, target);
    }
  }

  setXfCurve(curve: 'linear' | 'power' | 'exp' | 'cut') {
    if (curve !== 'linear' && curve !== 'power' && curve !== 'exp' && curve !== 'cut') return;
    this.xfCurve.set(curve);
  }

  setHamster(enabled: boolean) {
    this.hamster.set(!!enabled);
  }

  scratch(deck: DeckId, delta: number) {
    this.engine.scratch(deck, delta);
  }

  /** Base values captured when a borrowing FX (autowah/damp) engages, so
   *  leaving the mode can restore the user's tonal settings exactly. */
  private fxFilterBase: Record<DeckId, number> = {
    A: initialDeckState.filterFreq,
    B: initialDeckState.filterFreq,
  };
  private fxEqBase: Record<DeckId, { high: number; mid: number; low: number }> = {
    A: { high: initialDeckState.eqHigh, mid: initialDeckState.eqMid, low: initialDeckState.eqLow },
    B: { high: initialDeckState.eqHigh, mid: initialDeckState.eqMid, low: initialDeckState.eqLow },
  };
  /** Base send gains captured when a send-borrowing FX (reverb/rotate)
   *  engages, so leaving the mode returns the A/B sends to their previous
   *  levels instead of letting the ambience wash bleed into the master
   *  forever. */
  private fxSendBase: Record<DeckId, { a: number; b: number }> = {
    A: { a: 0, b: 0 },
    B: { a: 0, b: 0 },
  };

  setFx(deck: DeckId, mode: DeckState['activeFx'], val: number) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const amount = Math.max(0, Math.min(1, val));
    const state = target();
    const prevMode = state.activeFx;
    const sendBorrowing = (m: DeckState['activeFx']) =>
      m === 'reverb' || m === 'rotate';

    // Leaving a filter/EQ-borrowing FX restores the base values so the
    // next mode starts from a clean tonal canvas instead of inheriting the
    // previous effect's mangled EQ/filter.
    if (prevMode === 'autowah' && mode !== 'autowah') {
      this.setDeckFilter(deck, this.fxFilterBase[deck]);
    }
    if (prevMode === 'damp' && mode !== 'damp') {
      const base = this.fxEqBase[deck];
      this.setDeckEq(deck, base.high, base.mid, base.low);
    }
    // Leaving a send-borrowing FX restores the A/B send levels so the
    // reverb/rotate wash does not keep feeding the master after the mode
    // is switched away (sends are otherwise never zeroed).
    if (sendBorrowing(prevMode) && !sendBorrowing(mode)) {
      const base = this.fxSendBase[deck];
      this.setDeckSend(deck, 'A', base.a);
      this.setDeckSend(deck, 'B', base.b);
    }
    // Entering a borrowing mode captures the base values for later restore.
    if (mode === 'autowah' && prevMode !== 'autowah') {
      this.fxFilterBase[deck] = state.filterFreq;
    }
    if (mode === 'damp' && prevMode !== 'damp') {
      this.fxEqBase[deck] = {
        high: state.eqHigh,
        mid: state.eqMid,
        low: state.eqLow,
      };
    }
    if (sendBorrowing(mode) && !sendBorrowing(prevMode)) {
      const sendA = (state as DeckState & { sendA?: number }).sendA ?? 0;
      const sendB = (state as DeckState & { sendB?: number }).sendB ?? 0;
      this.fxSendBase[deck] = { a: sendA, b: sendB };
    }

    // Clear any residue from the previous advanced FX (echo/chorus/phaser)
    // before applying the new mode — one knob per FX bank.
    this.engine.resetDeckAdvancedFx(deck);

    target.update((d) => ({ ...d, fxAmount: amount, activeFx: mode }));

    if (mode === 'echo') {
      this.engine.setDeckAdvancedFx(deck, 'delay', amount);
      return;
    }
    if (mode === 'chorus') {
      // The engine's flanger block is the closest built-in chorus approximation.
      this.engine.setDeckAdvancedFx(deck, 'flanger', amount);
      return;
    }
    if (mode === 'phaser') {
      this.engine.setDeckAdvancedFx(deck, 'phaser', amount);
      return;
    }
    if (mode === 'autowah') {
      const freq = MIN_AUTOWAH_FREQUENCY + amount * AUTOWAH_FREQUENCY_RANGE;
      this.engine.setDeckFilter(deck, freq);
      return;
    }
    if (mode === 'damp') {
      // Round to 3 decimals so the profile lands on exact values (0.2/0.65/1.1
      // at full depth) instead of float dust from `1 - 0.8`.
      const round3 = (v: number) => Math.round(v * 1000) / 1000;
      const high = Math.max(0, round3(1 - amount * DAMP_HIGH_REDUCTION));
      const mid = Math.max(DAMP_MID_FLOOR, round3(1 - amount * DAMP_MID_REDUCTION));
      const low = round3(1 + amount * DAMP_LOW_LIFT);
      this.setDeckEq(deck, high, mid, low);
      return;
    }
    if (mode === 'reverb') {
      // Send bus A is used as the shared ambience return for reverb-style wash.
      this.engine.setDeckSend(deck, 'A', amount);
      return;
    }
    if (mode === 'rotate') {
      // Rotate approximates movement by balancing send A/B returns against each other.
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
  }

  setKeyLock(deck: DeckId, enabled: boolean) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    target.update((d) => ({ ...d, keyLock: enabled }));
  }

  setBassBoost(deck: DeckId, amount: number) {
    const target = deck === 'A' ? this.deckA : this.deckB;
    const normalized = this.clamp(amount, 0, 1);
    const state = target();
    const neutralLow = state.eqLow - state.bassBoost * 0.8;
    const boostedLow = this.clamp(neutralLow + normalized * 0.8, 0, 2);
    target.update((d) => ({ ...d, bassBoost: normalized, eqLow: boostedLow }));
    const deckState = target();
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
        track: {
          ...d.track,
          id: `deck-a-${Date.now()}`,
          name: fileName,
          url: '',
        },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        samplerPads: {
          drums: new Array(8).fill(null),
          fx: new Array(8).fill(null),
          vocals: new Array(8).fill(null),
        },
        bassBoost: 0,
        progress: 0,
        vinylImageUrl:
          vinylUrl || 'https://picsum.photos/seed/' + fileName + '/200',
      }));
    } else {
      this.deckB.update((d) => ({
        ...d,
        track: {
          ...d.track,
          id: `deck-b-${Date.now()}`,
          name: fileName,
          url: '',
        },
        duration: buffer.duration,
        hotCues: new Array(8).fill(null),
        samplerPads: {
          drums: new Array(8).fill(null),
          fx: new Array(8).fill(null),
          vocals: new Array(8).fill(null),
        },
        bassBoost: 0,
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

  setDeckFilterMode(deck: DeckId, type: BiquadFilterType) {
    this.engine.setDeckFilterMode(deck, type);
    if (deck === 'A') this.deckA.update((d) => ({ ...d, filterMode: type }));
    else this.deckB.update((d) => ({ ...d, filterMode: type }));
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
