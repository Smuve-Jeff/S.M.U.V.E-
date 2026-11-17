import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CGI_CAMERA_MOVES,
  CGI_PRIMITIVES,
  MAX_CGI_MODEL_DATA_URL,
  createCgiPrimitive,
  type CgiCameraMove,
  type CgiObject,
  type CgiPrimitive,
  type CgiSceneSettings,
} from '../../../services/cgi-scene';

/**
 * Authoring surface for the Lab's Three.js overlay.
 *
 * The panel only edits scene data; it never touches WebGL. The Lab owns the
 * clip, the renderer draws it, and the same settings travel into project saves
 * and the export. A model is embedded as a data URL so it survives a reload
 * without a second media store or a CDN dependency.
 */
@Component({
  selector: 'app-cgi-scene-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cgi-scene-panel.component.html',
  styleUrls: ['./cgi-scene-panel.component.css'],
})
export class CgiScenePanelComponent {
  readonly scene = input<CgiSceneSettings | null>(null);
  readonly sceneChange = output<CgiSceneSettings>();
  readonly addLayer = output<void>();
  readonly removeLayer = output<void>();

  readonly cameraMoves = CGI_CAMERA_MOVES;
  readonly primitives = CGI_PRIMITIVES;
  readonly modelError = signal<string | null>(null);
  primitive: Exclude<CgiPrimitive, 'model'> = 'cube';

  patch(patch: Partial<CgiSceneSettings>): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit({ ...scene, ...patch });
  }

  addPrimitive(): void {
    const scene = this.scene();
    if (!scene) return;
    const object = {
      ...createCgiPrimitive(this.primitive, scene.objects.length),
      position: this.slot(scene.objects),
    };
    this.sceneChange.emit({ ...scene, objects: [...scene.objects, object] });
  }

  removeObject(id: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit({
      ...scene,
      objects: scene.objects.filter((object) => object.id !== id),
    });
  }

  onModelFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) input.value = '';
    const scene = this.scene();
    if (!file || !scene) return;
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      this.modelError.set('Choose a .glb or self-contained .gltf model.');
      return;
    }
    if (file.size > MAX_CGI_MODEL_DATA_URL * 0.75) {
      this.modelError.set('That model is too large for an embedded CGI layer.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const modelDataUrl = String(reader.result ?? '');
      if (!modelDataUrl || modelDataUrl.length > MAX_CGI_MODEL_DATA_URL) {
        this.modelError.set('That model is too large for an embedded CGI layer.');
        return;
      }
      this.modelError.set(null);
      const object: CgiObject = {
        id: `cgi-model-${Date.now().toString(36)}`,
        name: file.name,
        kind: 'model',
        color: '#94a3b8',
        position: this.slot(scene.objects),
        scale: 1,
        spin: 0.4,
        modelDataUrl,
      };
      this.sceneChange.emit({ ...scene, objects: [...scene.objects, object] });
    };
    reader.onerror = () => this.modelError.set('That model could not be read.');
    reader.readAsDataURL(file);
  }

  setCameraMove(value: string): void {
    this.patch({ cameraMove: value as CgiCameraMove });
  }

  setObjectColor(id: string, value: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.patch({
      objects: scene.objects.map((object) =>
        object.id === id ? { ...object, color: value } : object,
      ),
    });
  }

  /**
   * First free slot in a three-column stage. Existing objects stay put, so a
   * new object cannot land inside the default torus at the origin.
   */
  private slot(objects: readonly CgiObject[]): [number, number, number] {
    const columnX = 2.4;
    const rowZ = 2;
    const occupied = new Set(
      objects.map(
        (object) =>
          `${Math.round(object.position[0] * 100)}:${Math.round(
            object.position[2] * 100,
          )}`,
      ),
    );
    for (let row = 0; row < 4; row += 1) {
      for (const x of [0, columnX, -columnX]) {
        const z = row === 0 ? 0 : -row * rowZ;
        const key = `${Math.round(x * 100)}:${Math.round(z * 100)}`;
        if (!occupied.has(key)) return [x, 0, z];
      }
    }
    return [0, 0, -4 * rowZ];
  }
}
