import { Injectable, inject } from '@angular/core';
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

  async start(): Promise<boolean> {
    const plugin = await this.resolvePlugin();
    if (!plugin) return false;
    try {
      await plugin.startCapture();
      return true;
    } catch (error) {
      this.logger.warn('Native capture service could not start', error);
      return false;
    }
  }

  async stop(): Promise<void> {
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
