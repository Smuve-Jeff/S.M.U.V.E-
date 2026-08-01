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
