import { Injectable, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';

interface StudioPlaybackPlugin {
  startPlayback(): Promise<void>;
  stopPlayback(): Promise<void>;
}

/**
 * Android foreground playback lifetime.
 *
 * The Web Audio graph still runs inside the WebView; this service supplies the
 * Android process guarantee (and partial wake lock) that keeps a locked screen
 * from suspending the Studio transport. Browsers and desktops are a no-op.
 */
@Injectable({ providedIn: 'root' })
export class NativePlaybackService {
  private logger = inject(LoggingService);
  private plugin: StudioPlaybackPlugin | null = null;
  private pluginPromise: Promise<StudioPlaybackPlugin | null> | null = null;
  readonly active = signal(false);

  isNative(): boolean {
    return !!(globalThis as any).Capacitor?.isNativePlatform?.();
  }

  async start(): Promise<boolean> {
    if (!this.isNative()) return false;
    // Set this before the async bridge resolves: a visibility change can race
    // the first await, and the session handler must know playback is protected.
    this.active.set(true);
    const plugin = await this.resolvePlugin();
    if (!plugin) {
      this.active.set(false);
      return false;
    }
    try {
      await plugin.startPlayback();
      return true;
    } catch (error) {
      this.active.set(false);
      this.logger.warn('Native playback service could not start', error);
      return false;
    }
  }

  async stop(): Promise<void> {
    this.active.set(false);
    const plugin = await this.resolvePlugin();
    if (!plugin) return;
    try {
      await plugin.stopPlayback();
    } catch (error) {
      this.logger.warn('Native playback service could not stop', error);
    }
  }

  private async resolvePlugin(): Promise<StudioPlaybackPlugin | null> {
    if (!this.isNative()) return null;
    if (this.plugin) return this.plugin;
    if (this.pluginPromise) return this.pluginPromise;
    this.pluginPromise = (async () => {
      try {
        const { registerPlugin } = await import('@capacitor/core');
        this.plugin = registerPlugin<StudioPlaybackPlugin>('StudioNative');
        return this.plugin;
      } catch {
        return null;
      }
    })();
    return this.pluginPromise;
  }
}
