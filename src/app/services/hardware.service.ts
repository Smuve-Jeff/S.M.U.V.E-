import { Injectable, signal, computed, inject, NgZone } from '@angular/core';
import { LoggingService } from './logging.service';
import { MicrophoneService } from './microphone.service';
import { NativeMidiService } from './native-midi.service';
import {
  MidiInputBusService,
  type MidiInputRef,
} from './midi-input-bus.service';
import { setMidiInputHandler } from './midi-input-chain';

const HARDWARE_MIDI_HANDLER = Symbol('smuve-hardware-midi');

export interface MidiInputDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface HardwareStatus {
  audioInterfaceConnected: boolean;
  activeInterfaceName: string | null;
  midiDevicesConnected: number;
  gamepadConnected: boolean;
  recordReady: boolean;
}

/** How far the MIDI input handshake has got. */
export type MidiConnectionStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'unsupported'
  | 'denied';

@Injectable({ providedIn: 'root' })
export class HardwareService {
  private logger = inject(LoggingService);
  private micService = inject(MicrophoneService);
  private nativeMidi = inject(NativeMidiService);
  private zone = inject(NgZone);
  private readonly midiBus = inject(MidiInputBusService);

  status = signal<HardwareStatus>({
    audioInterfaceConnected: false,
    activeInterfaceName: null,
    midiDevicesConnected: 0,
    gamepadConnected: false,
    recordReady: false,
  });

  /**
   * Friendly summary used by the topbar / footer badges. Empty when
   * nothing interesting is connected. Format: "AUDIO IN: name · MIDI × N".
   */
  readonly connectedDevicesBadge = computed(() => {
    const s = this.status();
    const parts: string[] = [];
    if (s.audioInterfaceConnected && s.activeInterfaceName) {
      parts.push('AUDIO IN: ' + s.activeInterfaceName);
    }
    if (s.midiDevicesConnected > 0) {
      parts.push('MIDI × ' + s.midiDevicesConnected);
    }
    if (s.gamepadConnected) {
      parts.push('GAMEPAD connected');
    }
    return parts.join(' · ');
  });

  midiInputs = signal<MidiInputDevice[]>([]);
  /**
   * Observable MIDI handshake state. Android has no Web MIDI, so a denied or
   * unsupported Web MIDI request is not the end of the story: the native
   * bridge is tried before this settles on `unsupported`.
   */
  readonly midiStatus = signal<MidiConnectionStatus>('idle');
  readonly midiError = signal<string | null>(null);
  private connectInFlight: Promise<MidiConnectionStatus> | null = null;
  /** Callback fired when a MIDI note-on is received (note 0-127, velocity 0-127). Called by the service. */
  onMidiNoteOn?: (note: number, velocity: number) => void;
  onMidiNoteOff?: (note: number) => void;
  /** Callback fired for any MIDI CC message (controller 0-127, value 0-127). */
  onMidiCC?: (controller: number, value: number) => void;
  /** Channel/polyphonic aftertouch. `note` is -1 for channel pressure. */
  onMidiAftertouch?: (note: number, pressure: number) => void;

  // ── Sustain Pedal (CC64 + Half-Pedal CC68) ──────────────
  /** True while the sustain pedal is held down (MIDI CC64 >= 64). */
  sustainActive = signal(false);
  /** Continuous pedal position 0-127 (CC68 half-pedal amount, 127 = full). */
  sustainAmount = signal(127);
  /** Half-pedal engaged: pedal partially released but still holding. */
  readonly sustainHalfPedal = computed(
    () => this.sustainActive() && this.sustainAmount() < 64
  );
  /** Number of notes released by the last pedal lift (pedal-up or half-pedal). */
  lastSustainReleaseCount = signal(0);
  /** Notes currently held down on the keyboard (note -> press count). */
  private heldNotes = new Map<number, number>();
  /** Notes kept ringing by the sustain pedal (note -> strike velocity). */
  private sustainedNotes = new Map<number, number>();
  /** Last strike velocity per held note, used for velocity-aware half-pedal. */
  private noteVelocities = new Map<number, number>();
  readonly externalHardwareConnected = computed(() => {
    const s = this.status();
    return (
      s.audioInterfaceConnected ||
      s.midiDevicesConnected > 0 ||
      s.gamepadConnected
    );
  });

  constructor() {
    this.initMonitoring();
    void this.connectMidi();
  }

  private initMonitoring() {
    if (typeof window === 'undefined') return;

    // Monitor Audio Devices
    this.monitorAudioDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', () =>
        this.monitorAudioDevices()
      );
    }

    // Monitor Gamepads
    window.addEventListener('gamepadconnected', () =>
      this.updateGamepadStatus(true)
    );
    window.addEventListener('gamepaddisconnected', () =>
      this.updateGamepadStatus(false)
    );

    // Initial check
    this.refreshConnectedHardware();
  }

  /** Reconcile hot-plug state after a user-initiated rescan. */
  async refreshConnectedHardware(): Promise<void> {
    await this.monitorAudioDevices();
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const connected = Array.from(navigator.getGamepads()).some(Boolean);
      this.updateGamepadStatus(connected);
    }
  }

  private async monitorAudioDevices() {
    try {
      await this.micService.updateAvailableDevices();
      const devices = this.micService.availableDevices();

      const interfaces = devices.filter(
        (d) =>
          d.type === 'interface' || d.capabilities?.includes('usb-interface')
      );
      const isConnected = interfaces.length > 0;
      const name = isConnected ? interfaces[0].label : null;

      this.status.update((s) => ({
        ...s,
        audioInterfaceConnected: isConnected,
        activeInterfaceName: name,
        // Built-in microphones are valid recording hardware too. Keep this
        // readiness flag distinct from the optional USB-interface flag.
        recordReady: devices.length > 0,
      }));

      if (isConnected) {
        this.logger.info(`Elite Hardware Detected: ${name}`);
      }
    } catch {
      // Gracefully handle environments where mic service is unavailable
      // (e.g. test runners, browsers without media device APIs)
    }
  }

  private updateGamepadStatus(connected: boolean) {
    this.status.update((s) => ({ ...s, gamepadConnected: connected }));
  }

  updateMidiCount(count: number) {
    this.status.update((s) => ({ ...s, midiDevicesConnected: Math.max(0, Math.floor(count)) }));
  }

  /**
   * Open MIDI input, preferring Web MIDI and falling back to Android's native
   * bridge. Safe to call again from the hardware panel's rescans: an in-flight
   * handshake is shared, and a repeat request re-enumerates hot-plugged ports.
   */
  async connectMidi(): Promise<MidiConnectionStatus> {
    if (this.connectInFlight) return this.connectInFlight;
    this.connectInFlight = this.openMidiInputs().finally(() => {
      this.connectInFlight = null;
    });
    return this.connectInFlight;
  }

  private async openMidiInputs(): Promise<MidiConnectionStatus> {
    this.midiStatus.set('requesting');
    this.midiError.set(null);

    if (typeof navigator === 'undefined') {
      this.midiStatus.set('unsupported');
      return 'unsupported';
    }

    const request = (navigator as any)?.requestMIDIAccess;
    if (typeof request === 'function') {
      try {
        const midi = await this.zone.runOutsideAngular(() =>
          request.call(navigator),
        );
        this.refreshMidiInputs(midi);
        midi.onstatechange = () => this.refreshMidiInputs(midi);
        this.midiStatus.set('ready');
        return 'ready';
      } catch (error) {
        // Android WebViews usually have no Web MIDI at all; when access is
        // refused, try the platform bridge before declaring MIDI unavailable.
        this.midiError.set(
          error instanceof Error ? error.message : 'Web MIDI access was denied',
        );
        this.midiStatus.set('denied');
      }
    }

    if (await this.initNativeMidi()) {
      this.midiStatus.set('ready');
      return 'ready';
    }

    if (this.midiStatus() !== 'denied') this.midiStatus.set('unsupported');
    this.midiBus.publishState({
      available: false,
      native: false,
      inputs: [],
    });
    return this.midiStatus() as MidiConnectionStatus;
  }

  /**
   * Connect the Android MIDI bridge. A native controller is published through
   * the MIDI input bus so the hardware keyboard, DJ mappings, Studio MIDI learn
   * and performer streams all see the same messages instead of overwriting the
   * bridge's single callback.
   */
  private async initNativeMidi(): Promise<boolean> {
    try {
      if (!(await this.nativeMidi.refresh())) return false;
      const inputs: MidiInputDevice[] = this.nativeMidi.devices().map((device) => ({
        id: device.id,
        name: device.name || 'MIDI Device',
        manufacturer: device.manufacturer || '',
      }));
      const sources = new Map<string, MidiInputRef>(
        inputs.map((input) => [
          input.id,
          { ...input, native: true },
        ]),
      );
      this.nativeMidi.onMessage = (data, deviceId) => {
        const source =
          sources.get(deviceId) ??
          ({
            id: deviceId,
            name: 'MIDI Device',
            manufacturer: '',
            native: true,
          } satisfies MidiInputRef);
        this.midiBus.publishMessage(data, source);
        this.handleMidiData(data);
      };
      await this.nativeMidi.connectInputs();
      this.zone.run(() => {
        this.midiInputs.set(inputs);
        this.updateMidiCount(inputs.length);
      });
      this.midiBus.publishState({
        available: true,
        native: true,
        inputs: [...sources.values()],
      });
      return true;
    } catch (error) {
      this.midiError.set(
        error instanceof Error ? error.message : 'Native MIDI is unavailable',
      );
      // No native bridge / no connected hardware is a valid state.
      return false;
    }
  }

  private refreshMidiInputs(midi: any): void {
    const inputs: MidiInputDevice[] = [];
    for (const input of (midi.inputs as any).values()) {
      const device: MidiInputDevice = {
        id: input.id,
        name: input.name || 'MIDI Device',
        manufacturer: input.manufacturer || '',
      };
      inputs.push(device);
      setMidiInputHandler(input, HARDWARE_MIDI_HANDLER, (event: any) => {
        this.midiBus.publishMessage(event.data, {
          ...device,
          native: false,
        });
        this.handleMidiData(event.data);
      });
    }

    this.zone.run(() => {
      this.midiInputs.set(inputs);
      this.updateMidiCount(inputs.length);
    });
    this.midiBus.publishState({
      available: true,
      native: false,
      inputs: inputs.map((input) => ({ ...input, native: false })),
    });
  }

  /**
   * Shared MIDI byte decoder for Web MIDI and the Android bridge.
   * `data` is a status byte followed by its data bytes.
   */
  private handleMidiData(data: ArrayLike<number>): void {
    if (!data || data.length < 2) return;
    const status = Number(data[0]) & 0xff;
    const data1 = Number(data[1]) & 0x7f;
    const data2 = data.length > 2 ? Number(data[2]) & 0x7f : 0;
    const command = status & 0xf0;

    if (command === 0x90 && data2 > 0) {
      this.heldNotes.set(data1, (this.heldNotes.get(data1) ?? 0) + 1);
      this.sustainedNotes.delete(data1);
      this.noteVelocities.set(data1, data2);
      this.zone.run(() => this.onMidiNoteOn?.(data1, data2));
    } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      const count = (this.heldNotes.get(data1) ?? 1) - 1;
      if (count <= 0) {
        this.heldNotes.delete(data1);
        const velocity = this.noteVelocities.get(data1) ?? 100;
        this.noteVelocities.delete(data1);
        if (this.sustainActive()) {
          this.sustainedNotes.set(data1, velocity);
        } else {
          this.zone.run(() => this.onMidiNoteOff?.(data1));
        }
      } else {
        this.heldNotes.set(data1, count);
      }
    } else if (command === 0xd0) {
      this.zone.run(() => this.onMidiAftertouch?.(-1, data1 / 127));
    } else if (command === 0xa0) {
      this.zone.run(() => this.onMidiAftertouch?.(data1, data2 / 127));
    } else if (command === 0xb0) {
      this.zone.run(() => {
        if (data1 === 64) {
          if (data2 >= 64) {
            this.sustainActive.set(true);
            this.sustainAmount.set(127);
          } else {
            this.sustainActive.set(false);
            this.sustainAmount.set(0);
            const released = this.sustainedNotes.size;
            this.sustainedNotes.forEach((_, note) => this.onMidiNoteOff?.(note));
            this.sustainedNotes.clear();
            if (released > 0) this.lastSustainReleaseCount.set(released);
          }
        } else if (data1 === 68) {
          this.sustainAmount.set(data2);
          if (data2 < 64) {
            let released = 0;
            this.sustainedNotes.forEach((velocity, note) => {
              if (velocity < data2) {
                this.onMidiNoteOff?.(note);
                this.sustainedNotes.delete(note);
                released++;
              }
            });
            if (released > 0) this.lastSustainReleaseCount.set(released);
          }
        }
        this.onMidiCC?.(data1, data2);
      });
    }
  }
}
