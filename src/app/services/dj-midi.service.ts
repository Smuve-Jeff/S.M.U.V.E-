import { Injectable, inject, signal } from '@angular/core';
import { DeckService } from './deck.service';
import { LoggingService } from './logging.service';

export interface MidiMapping {
  type: 'cc' | 'note';
  channel: number;
  number: number;
  action: string;
  deck?: 'A' | 'B';
}

export interface MidiLearnState {
  active: boolean;
  targetAction: string | null;
  targetDeck: 'A' | 'B' | null;
}

@Injectable({
  providedIn: 'root',
})
export class DjMidiService {
  private deckService = inject(DeckService);
  private logger = inject(LoggingService);
  private midiAccess: any = null;
  private initialized = false;

  /** Persisted custom MIDI mappings */
  mappings = signal<MidiMapping[]>([]);

  /** MIDI Learn state */
  learnState = signal<MidiLearnState>({
    active: false,
    targetAction: null,
    targetDeck: null,
  });

  /** Connected MIDI device names */
  connectedDevices = signal<string[]>([]);

  /** Last received MIDI message for debugging */
  lastMidiMessage = signal<{ type: string; channel: number; number: number; value: number } | null>(null);

  /** Default mappings — always active unless overridden */
  private readonly DEFAULT_MAPPINGS: MidiMapping[] = [
    // Deck A (channel 0)
    { type: 'note', channel: 0, number: 11, action: 'play', deck: 'A' },
    { type: 'note', channel: 0, number: 12, action: 'cue', deck: 'A' },
    { type: 'note', channel: 0, number: 13, action: 'sync', deck: 'A' },
    { type: 'note', channel: 0, number: 14, action: 'loop_toggle', deck: 'A' },
    { type: 'note', channel: 0, number: 15, action: 'slip_toggle', deck: 'A' },
    // Hot cues A (notes 35-42)
    { type: 'note', channel: 0, number: 35, action: 'hotcue_0', deck: 'A' },
    { type: 'note', channel: 0, number: 36, action: 'hotcue_1', deck: 'A' },
    { type: 'note', channel: 0, number: 37, action: 'hotcue_2', deck: 'A' },
    { type: 'note', channel: 0, number: 38, action: 'hotcue_3', deck: 'A' },
    { type: 'note', channel: 0, number: 39, action: 'hotcue_4', deck: 'A' },
    { type: 'note', channel: 0, number: 40, action: 'hotcue_5', deck: 'A' },
    { type: 'note', channel: 0, number: 41, action: 'hotcue_6', deck: 'A' },
    { type: 'note', channel: 0, number: 42, action: 'hotcue_7', deck: 'A' },
    // Deck B (channel 1)
    { type: 'note', channel: 1, number: 11, action: 'play', deck: 'B' },
    { type: 'note', channel: 1, number: 12, action: 'cue', deck: 'B' },
    { type: 'note', channel: 1, number: 13, action: 'sync', deck: 'B' },
    { type: 'note', channel: 1, number: 14, action: 'loop_toggle', deck: 'B' },
    { type: 'note', channel: 1, number: 15, action: 'slip_toggle', deck: 'B' },
    // Hot cues B (notes 35-42)
    { type: 'note', channel: 1, number: 35, action: 'hotcue_0', deck: 'B' },
    { type: 'note', channel: 1, number: 36, action: 'hotcue_1', deck: 'B' },
    { type: 'note', channel: 1, number: 37, action: 'hotcue_2', deck: 'B' },
    { type: 'note', channel: 1, number: 38, action: 'hotcue_3', deck: 'B' },
    { type: 'note', channel: 1, number: 39, action: 'hotcue_4', deck: 'B' },
    { type: 'note', channel: 1, number: 40, action: 'hotcue_5', deck: 'B' },
    { type: 'note', channel: 1, number: 41, action: 'hotcue_6', deck: 'B' },
    { type: 'note', channel: 1, number: 42, action: 'hotcue_7', deck: 'B' },
    // CC mappings
    { type: 'cc', channel: 0, number: 1, action: 'volume', deck: 'A' },
    { type: 'cc', channel: 0, number: 2, action: 'pitch', deck: 'A' },
    { type: 'cc', channel: 0, number: 3, action: 'filter', deck: 'A' },
    { type: 'cc', channel: 0, number: 10, action: 'eq_high', deck: 'A' },
    { type: 'cc', channel: 0, number: 11, action: 'eq_mid', deck: 'A' },
    { type: 'cc', channel: 0, number: 12, action: 'eq_low', deck: 'A' },
    { type: 'cc', channel: 0, number: 13, action: 'fx_amount', deck: 'A' },
    { type: 'cc', channel: 1, number: 1, action: 'volume', deck: 'B' },
    { type: 'cc', channel: 1, number: 2, action: 'pitch', deck: 'B' },
    { type: 'cc', channel: 1, number: 3, action: 'filter', deck: 'B' },
    { type: 'cc', channel: 1, number: 10, action: 'eq_high', deck: 'B' },
    { type: 'cc', channel: 1, number: 11, action: 'eq_mid', deck: 'B' },
    { type: 'cc', channel: 1, number: 12, action: 'eq_low', deck: 'B' },
    { type: 'cc', channel: 1, number: 13, action: 'fx_amount', deck: 'B' },
    // Crossfader (global)
    { type: 'cc', channel: 0, number: 20, action: 'crossfader' },
  ];

  constructor() {
    this.loadCustomMappings();
    this.autoInit();
  }

  /** Auto-initialize MIDI on app boot */
  async autoInit() {
    if (this.initialized) return;
    this.initialized = true;
    await this.initMidi();
  }

  async initMidi() {
    if (
      typeof navigator !== 'undefined' &&
      (navigator as any).requestMIDIAccess
    ) {
      try {
        this.midiAccess = await (navigator as any).requestMIDIAccess();
        this.logger.info('DJ MIDI Access Granted');
        this.setupInputs();
        this.midiAccess.onstatechange = () => this.setupInputs();
      } catch (e) {
        this.logger.warn('DJ MIDI Access Denied');
      }
    }
  }

  private setupInputs() {
    if (!this.midiAccess) return;
    const devices: string[] = [];
    const inputs = this.midiAccess.inputs.values();
    for (
      let input = inputs.next();
      input && !input.done;
      input = inputs.next()
    ) {
      const device = input.value;
      devices.push(device.name || 'Unknown MIDI Device');
      device.onmidimessage = (msg: any) => this.handleMidi(msg);
    }
    this.connectedDevices.set(devices);
    if (devices.length > 0) {
      this.logger.info(`DJ MIDI Devices: ${devices.join(', ')}`);
    }
  }

  // ── MIDI Learn ────────────────────────────────────────
  startLearn(action: string, deck: 'A' | 'B' | null = null) {
    this.learnState.set({ active: true, targetAction: action, targetDeck: deck });
    this.logger.info(`MIDI Learn: waiting for input for "${action}"`);
  }

  cancelLearn() {
    this.learnState.set({ active: false, targetAction: null, targetDeck: null });
  }

  clearMappings() {
    this.mappings.set([]);
    this.saveCustomMappings();
    this.logger.info('Custom MIDI mappings cleared');
  }

  removeMapping(index: number) {
    this.mappings.update((m) => m.filter((_, i) => i !== index));
    this.saveCustomMappings();
  }

  private saveCustomMappings() {
    try {
      localStorage.setItem('smuve_midi_mappings', JSON.stringify(this.mappings()));
    } catch {}
  }

  private loadCustomMappings() {
    try {
      const raw = localStorage.getItem('smuve_midi_mappings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.mappings.set(parsed);
      }
    } catch {}
  }

  // ── Message Handler ──────────────────────────────────
  private handleMidi(message: any) {
    const [status, data1, data2] = message.data;
    const cmd = status >> 4;
    const channel = status & 0xf;

    this.lastMidiMessage.set({
      type: cmd === 9 ? 'note_on' : cmd === 8 ? 'note_off' : cmd === 11 ? 'cc' : 'other',
      channel,
      number: data1,
      value: data2,
    });

    // MIDI Learn: capture this input as a mapping
    if (this.learnState().active && this.learnState().targetAction) {
      const learn = this.learnState();
      if (learn.targetAction) {
        const newMapping: MidiMapping = {
          type: cmd === 11 ? 'cc' : 'note',
          channel,
          number: data1,
          action: learn.targetAction,
          deck: learn.targetDeck ?? undefined,
        };
        this.mappings.update((m) => {
          // Remove existing mapping for same action+deck
          const filtered = m.filter(
            (x) => !(x.action === newMapping.action && x.deck === newMapping.deck)
          );
          return [...filtered, newMapping];
        });
        this.saveCustomMappings();
        this.logger.info(`MIDI Learned: ${learn.targetAction} → CH${channel} ${newMapping.type.toUpperCase()} ${data1}`);
        this.cancelLearn();
        return;
      }
    }

    // Process message against mappings
    if (cmd === 9 && data2 > 0) {
      this.handleNoteOn(channel, data1, data2);
    } else if (cmd === 8 || (cmd === 9 && data2 === 0)) {
      // Note off — no action needed for DJ
    } else if (cmd === 11) {
      this.handleCC(channel, data1, data2);
    }
  }

  private findMapping(type: 'cc' | 'note', channel: number, number: number): MidiMapping | undefined {
    // Custom mappings override defaults
    const custom = this.mappings().find(
      (m) => m.type === type && m.channel === channel && m.number === number
    );
    if (custom) return custom;
    return this.DEFAULT_MAPPINGS.find(
      (m) => m.type === type && m.channel === channel && m.number === number
    );
  }

  private handleNoteOn(channel: number, note: number, velocity: number) {
    const mapping = this.findMapping('note', channel, note);
    if (!mapping || !mapping.deck) return;

    const deck = mapping.deck;
    switch (mapping.action) {
      case 'play': this.deckService.togglePlay(deck); break;
      case 'cue': this.deckService.toggleCue(deck); break;
      case 'sync': this.deckService.autoSync(deck); break;
      case 'loop_toggle': this.deckService.toggleLoop(deck); break;
      case 'slip_toggle': this.deckService.toggleSlip(deck); break;
      case 'hotcue_0': this.deckService.jumpToHotCue(deck, 0); break;
      case 'hotcue_1': this.deckService.jumpToHotCue(deck, 1); break;
      case 'hotcue_2': this.deckService.jumpToHotCue(deck, 2); break;
      case 'hotcue_3': this.deckService.jumpToHotCue(deck, 3); break;
      case 'hotcue_4': this.deckService.jumpToHotCue(deck, 4); break;
      case 'hotcue_5': this.deckService.jumpToHotCue(deck, 5); break;
      case 'hotcue_6': this.deckService.jumpToHotCue(deck, 6); break;
      case 'hotcue_7': this.deckService.jumpToHotCue(deck, 7); break;
    }
  }

  private handleCC(channel: number, cc: number, value: number) {
    const mapping = this.findMapping('cc', channel, cc);
    if (!mapping) return;

    const normalized = value / 127;

    // Global controls
    if (mapping.action === 'crossfader') {
      this.deckService.crossfade.set((normalized - 0.5) * 2);
      return;
    }

    if (!mapping.deck) return;
    const deck = mapping.deck;

    switch (mapping.action) {
      case 'volume':
        this.deckService.setDeckGain(deck, normalized * 1.5);
        break;
      case 'pitch': {
        const pitch = 0.9 + normalized * 0.2; // 0.9 to 1.1
        const current = deck === 'A' ? this.deckService.deckA() : this.deckService.deckB();
        if (deck === 'A') this.deckService.deckA.update((d) => ({ ...d, playbackRate: pitch }));
        else this.deckService.deckB.update((d) => ({ ...d, playbackRate: pitch }));
        break;
      }
      case 'filter':
        this.deckService.setDeckFilter(deck, 100 + normalized * 19900);
        break;
      case 'eq_high':
        this.updateEq(deck, 'high', normalized * 2);
        break;
      case 'eq_mid':
        this.updateEq(deck, 'mid', normalized * 2);
        break;
      case 'eq_low':
        this.updateEq(deck, 'low', normalized * 2);
        break;
      case 'fx_amount':
        this.deckService.setFx(deck, 'echo', normalized);
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
