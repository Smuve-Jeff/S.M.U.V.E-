import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CGI_ANIMATION_CHANNELS,
  CGI_CAMERA_MOVES,
  CGI_PRIMITIVES,
  MAX_CGI_MODEL_DATA_URL,
  MAX_CGI_OBJECTS,
  cgiChannelValueAt,
  createCgiPrimitive,
  removeCgiKeyframe,
  setCgiKeyframe,
  type CgiAnimationChannel,
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
 *
 * Object count and keyframes are bounded here as well as in the sanitizer: the
 * panel refuses past the limit instead of letting an edit vanish on reload.
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
  /** Clip-local seconds of the playhead, where a new key is written. */
  readonly playhead = input<number>(0);
  readonly sceneChange = output<CgiSceneSettings>();
  readonly addLayer = output<void>();
  readonly removeLayer = output<void>();

  readonly cameraMoves = CGI_CAMERA_MOVES;
  readonly primitives = CGI_PRIMITIVES;
  readonly maxObjects = MAX_CGI_OBJECTS;
  readonly sceneError = signal<string | null>(null);
  primitive: Exclude<CgiPrimitive, 'model'> = 'cube';

  /** '' authors the scene (camera/light); otherwise an object id. */
  readonly animTarget = signal('');
  readonly animChannel = signal<CgiAnimationChannel>('camera.distance');
  /** A value typed for the next key, or null to follow the playhead value. */
  private readonly valueDraft = signal<number | null>(null);

  readonly atObjectLimit = computed(
    () => (this.scene()?.objects.length ?? 0) >= MAX_CGI_OBJECTS,
  );

  readonly targetChannels = computed(() =>
    CGI_ANIMATION_CHANNELS.filter((channel) =>
      this.animTarget() ? channel.scope === 'object' : channel.scope === 'scene',
    ),
  );

  readonly channelSpec = computed(
    () =>
      this.targetChannels().find(
        (channel) => channel.id === this.animChannel(),
      ) ?? this.targetChannels()[0],
  );

  /**
   * The value field: the operator's draft when they typed one, otherwise what
   * the renderer shows at the playhead. Keeping the draft separate means
   * playback or an unrelated scene edit cannot overwrite a half-entered value.
   */
  readonly keyframeValue = computed(() => {
    const draft = this.valueDraft();
    if (draft !== null) return draft;
    const scene = this.scene();
    if (!scene) return 0;
    return cgiChannelValueAt(
      scene,
      this.animTarget() || null,
      this.channelSpec().id,
      this.playhead(),
    );
  });

  readonly tracksForTarget = computed(() => {
    const target = this.animTarget() || null;
    return (this.scene()?.animation?.tracks ?? []).filter(
      (track) => track.targetObjectId === target,
    );
  });

  patch(patch: Partial<CgiSceneSettings>): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit({ ...scene, ...patch });
  }

  addPrimitive(): void {
    const scene = this.scene();
    if (!scene || this.refuseWhenFull()) return;
    this.sceneError.set(null);
    const object = {
      ...createCgiPrimitive(this.primitive, scene.objects.length),
      position: this.slot(scene.objects),
    };
    this.sceneChange.emit({ ...scene, objects: [...scene.objects, object] });
  }

  removeObject(id: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneError.set(null);
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
    if (!file || !scene || this.refuseWhenFull()) return;
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      this.sceneError.set('Choose a .glb or self-contained .gltf model.');
      return;
    }
    if (file.size > MAX_CGI_MODEL_DATA_URL * 0.75) {
      this.sceneError.set('That model is too large for an embedded CGI layer.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const modelDataUrl = String(reader.result ?? '');
      if (!modelDataUrl || modelDataUrl.length > MAX_CGI_MODEL_DATA_URL) {
        this.sceneError.set('That model is too large for an embedded CGI layer.');
        return;
      }
      this.sceneError.set(null);
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
    reader.onerror = () => this.sceneError.set('That model could not be read.');
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

  setAnimTarget(value: string): void {
    this.animTarget.set(value);
    this.animChannel.set(value ? 'position.x' : 'camera.distance');
    this.valueDraft.set(null);
  }

  setAnimChannel(value: string): void {
    this.animChannel.set(value as CgiAnimationChannel);
    this.valueDraft.set(null);
  }

  setKeyframeValue(value: number | string): void {
    const numeric = Number(value);
    this.valueDraft.set(Number.isFinite(numeric) ? numeric : 0);
  }

  channelLabel(channel: CgiAnimationChannel): string {
    return (
      CGI_ANIMATION_CHANNELS.find((entry) => entry.id === channel)?.label ??
      channel
    );
  }

  addKeyframe(): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(
      setCgiKeyframe(
        scene,
        this.animTarget() || null,
        this.channelSpec().id,
        this.playhead(),
        this.keyframeValue(),
      ),
    );
  }

  removeKey(channel: CgiAnimationChannel, keyId: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(
      removeCgiKeyframe(scene, this.animTarget() || null, channel, keyId),
    );
  }

  clearTrack(channel: CgiAnimationChannel): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(
      removeCgiKeyframe(scene, this.animTarget() || null, channel),
    );
  }

  /**
   * Refuse an object when the scene is full, so a saved scene can never hold
   * more objects than the sanitizer will restore. Returns true when refused.
   */
  private refuseWhenFull(): boolean {
    const scene = this.scene();
    if (!scene || scene.objects.length < MAX_CGI_OBJECTS) return false;
    this.sceneError.set(
      `Scene full — ${MAX_CGI_OBJECTS} objects is the cap. Remove one first.`,
    );
    return true;
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
