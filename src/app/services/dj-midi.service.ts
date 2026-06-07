import { Injectable, inject } from '@angular/core';
import { DeckService } from './deck.service';
import { LoggingService } from './logging.service';

@Injectable({
  providedIn: 'root',
})
export class DjMidiService {
  private deckService = inject(DeckService);
  private logger = inject(LoggingService);
  private midiAccess: any = null;

  async initMidi() {
    if (typeof navigator !== 'undefined' && (navigator as any).requestMIDIAccess) {
      try {
        this.midiAccess = await (navigator as any).requestMIDIAccess();
        this.logger.info('DJ MIDI Access Granted');
        this.setupInputs();
      } catch (e) {
        this.logger.warn('DJ MIDI Access Denied');
      }
    }
  }

  private setupInputs() {
    const inputs = this.midiAccess.inputs.values();
    for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
      input.value.onmidimessage = (msg: any) => this.handleMidi(msg);
    }
  }

  private handleMidi(message: any) {
    const [status, data1, data2] = message.data;
    const cmd = status >> 4;
    const channel = status & 0xf;

    // Generic DJ Controller Mapping (Simulated)
    // Channel 0 = Deck A, Channel 1 = Deck B
    const deck = channel === 0 ? 'A' : 'B';

    if (cmd === 9 && data2 > 0) { // Note On / Button Press
      this.handleButton(deck, data1);
    } else if (cmd === 11) { // CC / Faders & Knobs
      this.handleControl(deck, data1, data2);
    }
  }

  private handleButton(deck: 'A' | 'B', note: number) {
    switch (note) {
      case 11: // Play/Pause
        this.deckService.togglePlay(deck);
        break;
      case 12: // Cue
        this.deckService.toggleCue(deck);
        break;
      case 13: // Sync
        this.deckService.autoSync(deck);
        break;
    }
  }

  private handleControl(deck: 'A' | 'B', cc: number, value: number) {
    const normalized = value / 127;
    switch (cc) {
      case 1: // Volume Fader
        this.deckService.setDeckGain(deck, normalized * 1.5);
        break;
      case 2: // Pitch Fader
        const pitch = 0.9 + normalized * 0.2; // 0.9 to 1.1
        if (deck === 'A') this.deckService.deckA.update(d => ({ ...d, playbackRate: pitch }));
        else this.deckService.deckB.update(d => ({ ...d, playbackRate: pitch }));
        break;
      case 3: // Crossfader
        this.deckService.crossfade.set((normalized - 0.5) * 2);
        break;
      case 10: // EQ HI
        this.updateEq(deck, 'high', normalized * 2);
        break;
    }
  }

  private updateEq(deck: 'A' | 'B', type: 'high' | 'mid' | 'low', val: number) {
    const state = deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
    let { eqHigh, eqMid, eqLow } = state;
    if (type === 'high') eqHigh = val;
    if (type === 'mid') eqMid = val;
    if (type === 'low') eqLow = val;
    this.deckService.setDeckEq(deck, eqHigh, eqMid, eqLow);
  }
}
