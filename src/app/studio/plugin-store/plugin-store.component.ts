import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PluginStoreService,
  DspPluginManifest,
  CommunityPluginPayload,
} from '../../services/plugin-store.service';
import { WasmLoaderService } from '../wasm/wasm-loader.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';

/**
 * Sprint B1 — WASM Plugin Store
 *
 * Catalog of sandboxed DSP plugins (Wasm-first, JS-fallback). Each card shows
 * the manifest, an enable toggle, a WASM/JSP badge, and live param controls.
 */
@Component({
  selector: 'app-plugin-store',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plugin-store.component.html',
  styleUrls: ['./plugin-store.component.css'],
})
export class PluginStoreComponent {
  private pluginStore = inject(PluginStoreService);
  private loader = inject(WasmLoaderService);
  private haptic = inject(HapticService);
  private snack = inject(SnackbarService);

  catalog: DspPluginManifest[] = this.pluginStore.catalog;
  community: CommunityPluginPayload[] = this.pluginStore.communityPlugins();
  loading = new Set<string>();

  wasmSupported = this.loader.wasmSupported;

  /** Export a plugin as a shareable .smuveplugin JSON file (community store). */
  exportPlugin(manifest: DspPluginManifest): void {
    const json = this.pluginStore.exportCommunityPlugin(manifest.id);
    if (!json) {
      this.snack.error('Export failed — plugin not found');
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${manifest.id.replace(/[^\w.-]/g, '_')}.smuveplugin`;
    a.click();
    URL.revokeObjectURL(url);
    this.haptic.light();
    this.snack.success(`${manifest.name} exported · shareable plugin file`);
  }

  /** Import a .smuveplugin JSON file from disk. */
  importPlugin(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.haptic.medium();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const id = this.pluginStore.importCommunityPlugin(reader.result as string);
        this.community = this.pluginStore.communityPlugins();
        this.snack.success(`Plugin imported · ${id}`);
      } catch (err: any) {
        this.snack.error(err?.message ?? 'Invalid plugin file');
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  /** Remove an imported community plugin. */
  removeCommunity(manifest: CommunityPluginPayload): void {
    this.haptic.medium();
    this.pluginStore.removeCommunityPlugin(manifest.manifest.id);
    this.community = this.pluginStore.communityPlugins();
    this.snack.info(`${manifest.manifest.name} removed from store`);
  }

  isEnabled(id: string): boolean {
    return this.pluginStore.isEnabled(id);
  }

  toggle(manifest: DspPluginManifest): void {
    this.haptic.light();
    this.pluginStore.toggle(manifest.id);
    if (this.isEnabled(manifest.id)) {
      this.snack.success(
        `${manifest.name} enabled · ${this.loader.wasmSupported() ? 'WASM kernel' : 'JS kernel'}`
      );
    } else {
      this.snack.info(`${manifest.name} disabled`);
    }
  }

  valuesFor(id: string): Record<string, number> {
    return this.pluginStore.valuesFor(id);
  }

  onParamChange(pluginId: string, paramId: string, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) this.pluginStore.setParam(pluginId, paramId, val);
  }
}
