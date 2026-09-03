import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { PluginStoreService, DspPluginManifest } from '../../services/plugin-store.service';
import { KnobComponent } from '../shared/knob/knob.component';

@Component({
  selector: 'app-effects-rack-ui',
  standalone: true,
  imports: [CommonModule, FormsModule, KnobComponent],
  templateUrl: './effects-rack-ui.component.html',
  styleUrls: ['./effects-rack-ui.component.css'],
})
export class EffectsRackUiComponent {
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private pluginStore = inject(PluginStoreService);

  selectedTrack = this.musicManager.selectedTrack;
  activeSlot = signal(1);

  /** Sprint B1 Phase 2 — WASM plugin catalog for live inserts. */
  wasmCatalog: DspPluginManifest[] = this.pluginStore.catalog;

  /** The selected track's live WASM insert chain (plugin ids). */
  trackPluginIds = computed(() => {
    const track = this.selectedTrack();
    return track?.pluginIds ?? [];
  });

  hasPlugin(id: string): boolean {
    return this.trackPluginIds().includes(id);
  }

  togglePluginInsert(manifest: DspPluginManifest): void {
    const track = this.selectedTrack();
    if (!track) return;
    const current = this.trackPluginIds();
    const next = current.includes(manifest.id)
      ? current.filter((x) => x !== manifest.id)
      : [...current, manifest.id];
    this.musicManager.setTrackPlugins(track.id, next);
  }

  // Sprint B1 Phase 3 — master-bus live insert wiring. The audio engine holds
  // the canonical masterPluginIds signal; we render chips from it and install
  // a closure that resolves kernels through the plugin store.
  masterPluginIds = computed(() => this.audioEngine.masterPluginIds());

  hasMasterPlugin(id: string): boolean {
    return this.masterPluginIds().includes(id);
  }

  toggleMasterPlugin(manifest: DspPluginManifest): void {
    const current = this.masterPluginIds();
    const next = current.includes(manifest.id)
      ? current.filter((x) => x !== manifest.id)
      : [...current, manifest.id];
    this.installMasterChain(next);
  }

  /** Splice/Un-splice the master-bus ScriptProcessor with a kernel closure
   *  that reads the current enabled plugins from the plugin store each block.
   *  Uses the width-preserving splice point (installMasterPluginInsertAfterWidth)
   *  so the M/S master-width stage stays in the signal path. */
  installMasterChain(ids: string[]): void {
    this.audioEngine.installMasterPluginInsertAfterWidth(ids, (pluginIds) => {
      const kernels: Array<((input: Float32Array, output: Float32Array, params: Float32Array, sr: number) => void) | null> = [];
      for (const id of pluginIds) {
        const mod = this.pluginStore['loader']?.getModule?.(id);
        const kernel = mod?.getKernel?.(this.kernelNameForManifest(id)) ?? null;
        kernels.push(kernel);
      }
      return kernels;
    });
    this.pluginStore.preload(ids);
  }

  /** Reverse-lookup for the kernel name from a plugin id (manifest catalog). */
  private kernelNameForManifest(id: string): string {
    return this.pluginStore.manifestFor(id)?.kernelName ?? 'process';
  }

  fxSlots = computed(() => {
    const track = this.selectedTrack();
    return track?.fxSlots || [];
  });

  /** Returns the currently selected effect slot for parameter display */
  activeFxSlot = computed(() => {
    const slots = this.fxSlots();
    const idx = this.activeSlot() - 1;
    return idx >= 0 && idx < slots.length ? slots[idx] : null;
  });

  toggleFx(slotId: string) {
    const track = this.selectedTrack();
    if (!track) return;
    this.musicManager.tracks.update((ts) =>
      ts.map((t) =>
        t.id === track.id
          ? {
              ...t,
              fxSlots: t.fxSlots.map((s) =>
                s.id === slotId ? { ...s, enabled: !s.enabled } : s
              ),
            }
          : t
      )
    );
  }
}
