import { Injectable, signal } from '@angular/core';

export interface NativeMidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  /** Android input ports (host → device). */
  sendPorts: number[];
  /** Android output ports (device → host). */
  receivePorts: number[];
}

interface NativeMidiPlugin {
  listMidiDevices(): Promise<{ devices: NativeMidiDevice[] }>;
  openSource(options: {
    deviceId: string;
    portNumber: number;
  }): Promise<void>;
  sendMidi(options: {
    deviceId: string;
    portNumber: number;
    data: number[];
  }): Promise<void>;
  closeMidi(): Promise<void>;
  addListener(
    eventName: 'midiMessage',
    listener: (event: { deviceId: string; data: number[] }) => void,
  ): Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
}

/**
 * Android MIDI transport. Initialisation is lazy and a no-op on the web, so
 * the existing Web MIDI path stays authoritative wherever it exists.
 */
@Injectable({ providedIn: 'root' })
export class NativeMidiService {
  readonly available = signal(false);
  readonly devices = signal<NativeMidiDevice[]>([]);

  private plugin: NativeMidiPlugin | null = null;
  private initPromise: Promise<boolean> | null = null;
  private listenerHandle: { remove: () => Promise<void> } | null = null;
  onMessage?: (data: number[], deviceId: string) => void;

  init(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.register();
    return this.initPromise;
  }

  async connectInputs(): Promise<void> {
    if (!(await this.init()) || !this.plugin) return;
    for (const device of this.devices()) {
      for (const port of device.receivePorts) {
        try {
          await this.plugin.openSource({
            deviceId: device.id,
            portNumber: port,
          });
        } catch {
          /* a port may be claimed by another app; keep the rest usable */
        }
      }
    }
  }

  async send(deviceId: string, portNumber: number, data: number[]): Promise<boolean> {
    if (!this.plugin) return false;
    try {
      await this.plugin.sendMidi({ deviceId, portNumber, data });
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.plugin) return;
    try {
      await this.plugin.closeMidi();
      await this.listenerHandle?.remove();
    } catch {
      /* already closed */
    }
    this.listenerHandle = null;
  }

  private async register(): Promise<boolean> {
    if (!(globalThis as any).Capacitor?.isNativePlatform?.()) return false;
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const plugin = registerPlugin<NativeMidiPlugin>('StudioNative');
      const result = await plugin.listMidiDevices();
      this.plugin = plugin;
      this.devices.set(Array.isArray(result?.devices) ? result.devices : []);
      this.listenerHandle = await plugin.addListener('midiMessage', (event) => {
        if (Array.isArray(event?.data)) {
          this.onMessage?.(event.data, event.deviceId);
        }
      });
      this.available.set(true);
      return true;
    } catch {
      this.available.set(false);
      return false;
    }
  }
}
