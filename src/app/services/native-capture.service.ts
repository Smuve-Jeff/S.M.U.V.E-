import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';

interface StudioNativePlugin {
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class NativeCaptureService {
  private logger = inject(LoggingService);
  private plugin: StudioNativePlugin | null = null;
  private pluginPromise: Promise<StudioNativePlugin | null> | null = null;
  /**
   * True while the Android microphone foreground service owns the capture
   * lifetime. The transport reads this when the app is hidden: a protected
   * take may keep rolling, while an unprotected one must be finalized now.
   */
  readonly active = signal(false);

  isNative(): boolean {
    return !!(globalThis as any).Capacitor?.isNativePlatform?.();
  }

  async start(): Promise<boolean> {
    if (!this.isNative()) return false;
    // Set before the bridge resolves so a visibility change racing the first
    // await already knows the take is protected, mirroring playback.
    this.active.set(true);
    const plugin = await this.resolvePlugin();
    if (!plugin) {
      this.active.set(false);
      return false;
    }
    try {
      await plugin.startCapture();
      return true;
    } catch (error) {
      this.active.set(false);
      this.logger.warn('Native capture service could not start', error);
      return false;
    }
  }

  async stop(): Promise<void> {
    this.active.set(false);
    const plugin = await this.resolvePlugin();
    if (!plugin) return;
    try {
      await plugin.stopCapture();
    } catch (error) {
      this.logger.warn('Native capture service could not stop', error);
    }
  }

  private async resolvePlugin(): Promise<StudioNativePlugin | null> {
    if (!(globalThis as any).Capacitor?.isNativePlatform?.()) return null;
    if (this.plugin) return this.plugin;
    if (this.pluginPromise) return this.pluginPromise;
    this.pluginPromise = (async () => {
      try {
        const { registerPlugin } = await import('@capacitor/core');
        this.plugin = registerPlugin<StudioNativePlugin>('StudioNative');
        return this.plugin;
      } catch {
        return null;
      }
    })();
    return this.pluginPromise;
  }
}
