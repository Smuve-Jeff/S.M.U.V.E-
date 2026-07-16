import { Injectable, signal, inject, NgZone } from '@angular/core';
import { LoggingService } from './logging.service';
import { AudioInputDevice, MicrophoneService } from './microphone.service';

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

  constructor() {
    this.initMonitoring();
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
        (d) => d.type === 'interface' || d.capabilities?.includes('usb-interface')
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
}
