import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PluginStoreService, DspPluginManifest } from '../../services/plugin-store.service';
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
  loading = new Set<string>();

  wasmSupported = this.loader.wasmSupported;

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
