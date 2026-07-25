import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { DeckService } from './deck.service';
import { LoggingService } from './logging.service';

export interface MidiNoteEvent {
  note: number;
  velocity: number;
  channel: number;
}

export interface MidiCCEvent {
  controller: number;
  value: number;
  channel: number;
}

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

export interface PerformerCCMapping {
  controller: number;
  channel: number;
  target: string;
}

export interface MidiLogEntry {
  id: number;
  type: string;
  channel: number;
  number: number;
  value: number;
  timestamp: number;
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

  /** Performer-specific MIDI Learn */
  performerLearnActive = signal(false);
  performerLearnTarget = signal<string | null>(null);
  performerCCMap = signal<PerformerCCMapping[]>([]);

  /** MIDI activity pulse — toggles on each incoming message for visual feedback */
  midiActivityPulse = signal(false);

  // ── MIDI Activity Log ────────────────────────────────
  private logIdCounter = 0;
  readonly MIDI_LOG_MAX = 50;
  midiLog = signal<MidiLogEntry[]>([]);

  // ── MIDI Thru/Merge Router ───────────────────────────
  /** Exposed input device names for routing UI */
  midiInputNames = signal<string[]>([]);
  /** Exposed output device names for routing UI */
  midiOutputNames = signal<string[]>([]);
  /** Whether thru routing is active */
  thruEnabled = signal(false);
  /** Source input index (-1 = all inputs) */
  thruInputIndex = signal(0);
  /** Destination output index */
  thruOutputIndex = signal(0);
  /** Filter by message type: 'all' | 'notes' | 'cc' | 'clock' */
  thruFilter = signal<string>('all');

  private midiInputDevices: any[] = [];
  private midiOutputDeviceList: any[] = [];

  // ── MIDI Slave Sync ──────────────────────────────────
  slaveSyncEnabled = signal(false);
  slaveBpm = signal(120);
  slaveTransportRunning = signal(false);
  private lastClockTime = 0;
  private clockIntervals: number[] = [];
  private readonly SLAVE_INTERVAL_SAMPLE = 16; // average over 16 ticks

  // ── MIDI Clock Output ────────────────────────────────
  /** Available MIDI output ports */
  midiOutputs = signal<string[]>([]);
  /** Whether MIDI clock transmission is active */
  clockEnabled = signal(false);
  /** Current BPM for clock timing */
  clockBpm = signal(140);
  /** Target output device index */
  clockOutputIndex = signal(0);

  private midiOutputDevices: any[] = [];
  private midiOutputDevicesList: any[] = [];
  private clockInterval: any = null;
  private readonly CLOCK_PPQN = 24; // pulses per quarter note

  /** Performer-oriented MIDI streams */
  readonly performerNoteOn = new Subject<MidiNoteEvent>();
  readonly performerNoteOff = new Subject<MidiNoteEvent>();
  readonly performerCC = new Subject<MidiCCEvent>();

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
    this.loadPerformerCCMappings();
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

  // ── MIDI Clock Output ────────────────────────────────
  startClock(): void {
    if (!this.midiAccess || this.clockEnabled()) return;
    this.clockEnabled.set(true);

    // Collect output devices
    this.midiOutputDevices = [];
    const outputs = this.midiAccess.outputs.values();
    for (let o = outputs.next(); o && !o.done; o = outputs.next()) {
      this.midiOutputDevices.push(o.value);
    }
    this.midiOutputs.set(this.midiOutputDevices.map((o) => o.name || 'MIDI Output'));

    // Send MIDI Start (0xFA)
    this.sendMidiMessage(0xFA);

    // Calculate clock interval: 60000 / (BPM * 24) ms per tick
    this.updateClockInterval();
  }

  stopClock(): void {
    if (!this.clockEnabled()) return;
    this.clockEnabled.set(false);
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    // Send MIDI Stop (0xFC)
    this.sendMidiMessage(0xFC);
  }

  setClockBpm(bpm: number): void {
    const clamped = Math.max(40, Math.min(300, bpm));
    this.clockBpm.set(clamped);
    if (this.clockEnabled()) {
      this.updateClockInterval();
    }
  }

  setClockOutput(index: number): void {
    this.clockOutputIndex.set(Math.max(0, Math.min(this.midiOutputDevices.length - 1, index)));
  }

  private updateClockInterval(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    const intervalMs = 60000 / (this.clockBpm() * this.CLOCK_PPQN);
    this.clockInterval = setInterval(() => {
      if (!this.clockEnabled()) return;
      this.sendMidiMessage(0xF8);
      this.midiActivityPulse.set(true);
      setTimeout(() => this.midiActivityPulse.set(false), 20);
    }, intervalMs);
  }

  private sendMidiMessage(...bytes: number[]): void {
    if (!this.midiOutputDevices.length) return;
    const idx = this.clockOutputIndex();
    if (idx >= this.midiOutputDevices.length) return;
    try {
      this.midiOutputDevices[idx].send(bytes);
    } catch {}
  }

  /** Send MIDI Continue (0xFB) after pause */
  sendContinue(): void {
    this.sendMidiMessage(0xFB);
  }

  // ── MIDI Slave Sync ──────────────────────────────────
  toggleSlaveSync(): void {
    this.slaveSyncEnabled.update((v) => !v);
    if (!this.slaveSyncEnabled()) {
      this.clockIntervals = [];
      this.slaveTransportRunning.set(false);
    }
  }

  clearMidiLog(): void {
    this.midiLog.set([]);
  }

  private setupInputs() {
    if (!this.midiAccess) return;
    const devices: string[] = [];
    this.midiInputDevices = [];
    const inputs = this.midiAccess.inputs.values();
    for (
      let input = inputs.next();
      input && !input.done;
      input = inputs.next()
    ) {
      const device = input.value;
      this.midiInputDevices.push(device);
      devices.push(device.name || 'Unknown MIDI Device');
      device.onmidimessage = (msg: any) => this.handleMidi(msg);
    }
    this.connectedDevices.set(devices);
    this.midiInputNames.set(devices);
    this.refreshOutputList();
    if (devices.length > 0) {
      this.logger.info(`DJ MIDI Devices: ${devices.join(', ')}`);
    }
  }

  // ── Performer MIDI Learn ─────────────────────────────
  startPerformerLearn(target: string) {
    this.performerLearnActive.set(true);
    this.performerLearnTarget.set(target);
    this.logger.info(`Performer MIDI Learn: waiting for CC input for "${target}"`);
  }

  cancelPerformerLearn() {
    this.performerLearnActive.set(false);
    this.performerLearnTarget.set(null);
  }

  private savePerformerCCMappings() {
    try {
      localStorage.setItem('smuve_performer_cc_mappings', JSON.stringify(this.performerCCMap()));
    } catch {}
  }

  private loadPerformerCCMappings() {
    try {
      const raw = localStorage.getItem('smuve_performer_cc_mappings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.performerCCMap.set(parsed);
      }
    } catch {}
  }
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

  /** Consolidate MIDI output devices list */
  private refreshOutputList(): void {
    if (!this.midiAccess) return;
    this.midiOutputDeviceList = [];
    this.midiOutputDevicesList = [];
    const outputs = this.midiAccess.outputs.values();
    for (let o = outputs.next(); o && !o.done; o = outputs.next()) {
      this.midiOutputDeviceList.push(o.value);
      this.midiOutputDevicesList.push(o.value);
    }
    this.midiOutputNames.set(this.midiOutputDeviceList.map((o: any) => o.name || 'MIDI Output'));
  }

  // ── Message Handler ──────────────────────────────────
  private handleMidi(message: any) {
    const [status, data1, data2] = message.data;
    const cmd = status >> 4;
    const channel = status & 0xf;

    // ── Detect MIDI System Real-Time messages (Clock, Start, Stop, Continue) ──
    if (status >= 0xF8) {
      // Forward real-time messages if thru is enabled
      if (this.thruEnabled() && (this.thruFilter() === 'all' || this.thruFilter() === 'clock')) {
        this.forwardThru(status);
      }
      this.handleRealTime(status);
      return;
    }

    this.lastMidiMessage.set({
      type: cmd === 9 ? 'note_on' : cmd === 8 ? 'note_off' : cmd === 11 ? 'cc' : 'other',
      channel,
      number: data1,
      value: data2,
    });

    // Activity pulse for device picker LED
    this.midiActivityPulse.set(true);
    setTimeout(() => this.midiActivityPulse.set(false), 150);

    // Push to activity log
    this.pushMidiLog(this.lastMidiMessage()!.type, channel, data1, data2);

    // ── MIDI Thru/Merge Router: forward to output if enabled ──
    if (this.thruEnabled()) {
      const sourceMatch =
        this.thruInputIndex() === 0 || // index 0 = all inputs
        (this.midiInputDevices.indexOf(message.target) >= 0 &&
          this.midiInputDevices.indexOf(message.target) + 1 === this.thruInputIndex());

      if (sourceMatch) {
        const filterPass =
          this.thruFilter() === 'all' ||
          (this.thruFilter() === 'notes' && (cmd === 9 || cmd === 8)) ||
          (this.thruFilter() === 'cc' && cmd === 11);

        if (filterPass) {
          this.forwardThru(status, data1, data2);
        }
      }
    }

    // Performer MIDI Learn: capture CC input
    if (this.performerLearnActive() && cmd === 11 && this.performerLearnTarget()) {
      const newCC: PerformerCCMapping = {
        controller: data1,
        channel,
        target: this.performerLearnTarget()!,
      };
      this.performerCCMap.update((m) => {
        const filtered = m.filter((x) => x.target !== newCC.target);
        return [...filtered, newCC];
      });
      this.savePerformerCCMappings();
      this.logger.info(`Performer CC Learned: ${newCC.target} → CH${channel} CC${data1}`);
      this.cancelPerformerLearn();
      return;
    }

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

    // Always forward note events for the Performer regardless of DJ mappings
    if (cmd === 9 && data2 > 0) {
      this.performerNoteOn.next({ note: data1, velocity: data2 / 127, channel });
    } else if (cmd === 8 || (cmd === 9 && data2 === 0)) {
      this.performerNoteOff.next({ note: data1, velocity: 0, channel });
    } else if (cmd === 11) {
      this.performerCC.next({ controller: data1, value: data2 / 127, channel });
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

  /** Forward MIDI message to the thru output device */
  private forwardThru(status: number, data1?: number, data2?: number): void {
    this.refreshOutputList();
    const idx = this.thruOutputIndex();
    if (idx < 0 || idx >= this.midiOutputDeviceList.length) return;
    try {
      const bytes: number[] = [status];
      if (data1 !== undefined) bytes.push(data1);
      if (data2 !== undefined) bytes.push(data2);
      this.midiOutputDeviceList[idx].send(bytes);
    } catch {}
  }

  /** Handle MIDI System Real-Time messages for Slave Sync */
  private handleRealTime(status: number): void {
    switch (status) {
      case 0xF8: // Timing Clock
        this.midiActivityPulse.set(true);
        setTimeout(() => this.midiActivityPulse.set(false), 20);
        this.pushMidiLog('clock', 0, 0, 0);

        if (this.slaveSyncEnabled()) {
          const now = performance.now();
          if (this.lastClockTime > 0) {
            const delta = now - this.lastClockTime;
            this.clockIntervals.push(delta);
            if (this.clockIntervals.length > this.SLAVE_INTERVAL_SAMPLE) {
              this.clockIntervals.shift();
            }
            // Derive BPM: average interval → ms per tick → BPM = 60000 / (avgInterval * 24)
            if (this.clockIntervals.length >= 4) {
              const avgInterval = this.clockIntervals.reduce((a, b) => a + b, 0) / this.clockIntervals.length;
              const bpm = Math.max(40, Math.min(300, Math.round(60000 / (avgInterval * 24))));
              this.slaveBpm.set(bpm);
            }
          }
          this.lastClockTime = now;
        }
        break;
      case 0xFA: // Start
        this.pushMidiLog('start', 0, 0, 0);
        if (this.slaveSyncEnabled()) {
          this.slaveTransportRunning.set(true);
          this.lastClockTime = performance.now();
          this.clockIntervals = [];
        }
        break;
      case 0xFB: // Continue
        this.pushMidiLog('continue', 0, 0, 0);
        if (this.slaveSyncEnabled()) {
          this.slaveTransportRunning.set(true);
          this.lastClockTime = performance.now();
        }
        break;
      case 0xFC: // Stop
        this.pushMidiLog('stop', 0, 0, 0);
        if (this.slaveSyncEnabled()) {
          this.slaveTransportRunning.set(false);
          this.lastClockTime = 0;
        }
        break;
    }
  }

  /** Push to the activity log, capped at MIDI_LOG_MAX */
  private pushMidiLog(type: string, channel: number, number: number, value: number): void {
    this.midiLog.update((log) => {
      const entry: MidiLogEntry = {
        id: ++this.logIdCounter,
        type,
        channel,
        number,
        value,
        timestamp: Date.now(),
      };
      const next = [...log, entry];
      if (next.length > this.MIDI_LOG_MAX) next.shift();
      return next;
    });
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
