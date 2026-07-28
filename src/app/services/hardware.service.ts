import { Injectable, signal, computed, inject, NgZone } from '@angular/core';
import { LoggingService } from './logging.service';
import { AudioInputDevice, MicrophoneService } from './microphone.service';

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

@Injectable({ providedIn: 'root' })
export class HardwareService {
  private logger = inject(LoggingService);
  private micService = inject(MicrophoneService);
  private zone = inject(NgZone);

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
  /** Callback fired when a MIDI note-on is received (note 0-127, velocity 0-127). Called by the service. */
  onMidiNoteOn?: (note: number, velocity: number) => void;
  onMidiNoteOff?: (note: number) => void;
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
    this.initMidiInput();
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
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const gps = navigator.getGamepads();
      if (gps && gps[0]) this.updateGamepadStatus(true);
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
        recordReady: isConnected,
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
    this.status.update((s) => ({ ...s, midiDevicesConnected: count }));
  }

  /** Initialize Web MIDI input and forward note events to the callback. */
  private initMidiInput(): void {
    if (typeof navigator === 'undefined' || typeof (navigator as any).requestMIDIAccess !== 'function') {
      return;
    }

    this.zone.runOutsideAngular(() => {
      (navigator as any).requestMIDIAccess().then((midi: any) => {
        this.refreshMidiInputs(midi);
        midi.onstatechange = () => this.refreshMidiInputs(midi);
      }).catch(() => {
        // MIDI access denied or unavailable
      });
    });
  }

  private refreshMidiInputs(midi: any): void {
    const inputs: MidiInputDevice[] = [];
    for (const input of (midi.inputs as any).values()) {
      inputs.push({
        id: input.id,
        name: input.name || 'MIDI Device',
        manufacturer: input.manufacturer || '',
      });

      // Wire note-on / note-off handlers
      input.onmidimessage = (event: any) => {
        const [status, data1, data2] = event.data;
        const channel = status & 0x0f;
        const command = status & 0xf0;

        if (command === 0x90 && data2 > 0) {
          // Note on
          this.zone.run(() => {
            this.onMidiNoteOn?.(data1, data2);
          });
        } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
          // Note off
          this.zone.run(() => {
            this.onMidiNoteOff?.(data1);
          });
        }
      };
    }

    this.zone.run(() => {
      this.midiInputs.set(inputs);
      this.updateMidiCount(inputs.length);
    });
  }
}
