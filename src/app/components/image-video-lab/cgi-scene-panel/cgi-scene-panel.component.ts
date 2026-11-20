import { Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  KEYFRAME_EASINGS,
  type KeyframeEasing,
} from '../../../services/clip-keyframes';
import {
  CGI_ANIMATION_CHANNELS,
  CGI_CAMERA_MOVES,
  CGI_MATERIAL_PRESETS,
  CGI_PRIMITIVES,
  CGI_SCENE_PRESETS,
  MAX_CGI_MODEL_DATA_URL,
  MAX_CGI_OBJECTS,
  applyCgiMaterialPreset,
  applyCgiMaterialPresetToAll,
  applyCgiScenePreset,
  clearCgiMaterialPreset,
  cgiChannelValueAt,
  createCgiPrimitive,
  removeCgiKeyframe,
  sanitizeCgiScene,
  setCgiKeyframe,
  type CgiAnimationChannel,
  type CgiCameraMove,
  type CgiKeyframe,
  type CgiObject,
  type CgiPrimitive,
  type CgiScenePresetId,
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
  /** Ask the Lab to park the playhead on a key, in clip-local seconds. */
  readonly seekRequest = output<number>();

  readonly cameraMoves = CGI_CAMERA_MOVES;
  readonly primitives = CGI_PRIMITIVES;
  readonly presets = CGI_SCENE_PRESETS;
  readonly materialPresets = CGI_MATERIAL_PRESETS;
  readonly keyframeEasings = KEYFRAME_EASINGS;
  readonly maxObjects = MAX_CGI_OBJECTS;
  readonly axes = [
    { index: 0 as const, label: 'X' },
    { index: 1 as const, label: 'Y' },
    { index: 2 as const, label: 'Z' },
  ];
  readonly sceneError = signal<string | null>(null);
  readonly selectedObjectId = signal<string | null>(null);
  primitive: Exclude<CgiPrimitive, 'model'> = 'cube';

  /** '' authors the scene (camera/light); otherwise an object id. */
  readonly animTarget = signal('');
  readonly animChannel = signal<CgiAnimationChannel>('camera.distance');
  /** Curve leaving the next key; the smooth stage default. */
  readonly animEasing = signal<KeyframeEasing>('ease-in-out');
  /** A value typed for the next key, or null to follow the playhead value. */
  private readonly valueDraft = signal<number | null>(null);
  /** The key loaded for editing, tracked by channel and id across scene edits. */
  private readonly selectedKeyRef = signal<{
    channel: CgiAnimationChannel;
    id: string;
  } | null>(null);

  readonly atObjectLimit = computed(
    () => (this.scene()?.objects.length ?? 0) >= MAX_CGI_OBJECTS,
  );

  /** The object whose transform/material inspector is open. */
  readonly selectedObject = computed<CgiObject | null>(() => {
    const id = this.selectedObjectId();
    if (!id) return null;
    return this.scene()?.objects.find((object) => object.id === id) ?? null;
  });

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

  /** The loaded key, or null when the scene no longer holds it. */
  readonly selectedKey = computed<CgiKeyframe | null>(() => {
    const ref = this.selectedKeyRef();
    return (ref ? this.trackKey(ref.channel, ref.id) : null) ?? null;
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
    const inherited = CGI_MATERIAL_PRESETS.find(
      (preset) => preset.id === scene.materialPreset,
    )?.patch;
    const object = {
      ...createCgiPrimitive(this.primitive, scene.objects.length),
      ...(inherited ?? {}),
      position: this.slot(scene.objects),
    };
    this.selectedObjectId.set(object.id);
    this.sceneChange.emit({ ...scene, objects: [...scene.objects, object] });
  }

  selectObject(id: string): void {
    this.selectedObjectId.set(id);
  }

  /** Apply a stage look while preserving objects, colours and keyframes. */
  applyPreset(presetId: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(
      applyCgiScenePreset(scene, presetId as CgiScenePresetId),
    );
  }

  removeObject(id: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneError.set(null);
    if (this.selectedObjectId() === id) this.selectedObjectId.set(null);
    // The sanitizer drops tracks whose object no longer exists, so deleting an
    // object cannot leave orphan animation behind in the project.
    const next = sanitizeCgiScene({
      ...scene,
      objects: scene.objects.filter((object) => object.id !== id),
    });
    if (next) this.sceneChange.emit(next);
    // Drop the editor back to the scene so the channel menu cannot keep an
    // object-only channel with no object behind it.
    if (this.animTarget() === id) this.setAnimTarget('');
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
        id: `cgi-model-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        name: file.name,
        kind: 'model',
        color: '#94a3b8',
        position: this.slot(scene.objects),
        scale: 1,
        spin: 0.4,
        modelDataUrl,
      };
      this.selectedObjectId.set(object.id);
      this.sceneChange.emit({ ...scene, objects: [...scene.objects, object] });
    };
    reader.onerror = () => this.sceneError.set('That model could not be read.');
    reader.readAsDataURL(file);
  }

  setCameraMove(value: string): void {
    this.patch({ cameraMove: value as CgiCameraMove });
  }

  setObjectColor(id: string, value: string): void {
    this.patchObject(id, { color: value });
  }

  setObjectPosition(
    id: string,
    axis: 0 | 1 | 2,
    value: number | string,
  ): void {
    const object = this.scene()?.objects.find((entry) => entry.id === id);
    if (!object) return;
    const position = [...object.position] as [number, number, number];
    position[axis] = this.clamp(value, -20, 20, position[axis]);
    this.patchObject(id, { position });
  }

  setObjectScale(id: string, value: number | string): void {
    const object = this.scene()?.objects.find((entry) => entry.id === id);
    if (!object) return;
    this.patchObject(id, { scale: this.clamp(value, 0.05, 5, object.scale) });
  }

  setObjectSpin(id: string, value: number | string): void {
    const object = this.scene()?.objects.find((entry) => entry.id === id);
    if (!object) return;
    this.patchObject(id, { spin: this.clamp(value, -8, 8, object.spin) });
  }

  setObjectMaterial(
    id: string,
    field: 'metalness' | 'roughness',
    value: number | string,
  ): void {
    const object = this.scene()?.objects.find((entry) => entry.id === id);
    if (!object) return;
    const fallback = field === 'metalness' ? 0.72 : 0.22;
    this.patchObject(id, {
      [field]: this.clamp(value, 0, 1, object[field] ?? fallback),
    });
  }

  setObjectEmissive(id: string, value: number | string): void {
    const object = this.scene()?.objects.find((entry) => entry.id === id);
    if (!object) return;
    this.patchObject(id, {
      emissive: this.clamp(value, 0, 4, object.emissive ?? 0),
    });
  }

  applyMaterialPreset(objectId: string, presetId: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(applyCgiMaterialPreset(scene, objectId, presetId));
  }

  applySceneMaterialPreset(presetId: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(applyCgiMaterialPresetToAll(scene, presetId));
  }

  clearSceneMaterialPreset(): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(clearCgiMaterialPreset(scene));
  }

  clearObjectMaterialPreset(id: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(clearCgiMaterialPreset(scene, id));
  }

  /**
   * Persist one object edit through the sanitizer so a typed out-of-range
   * number cannot produce a scene that reloads differently than it looked.
   */
  private patchObject(id: string, patch: Partial<CgiObject>): void {
    const scene = this.scene();
    if (!scene) return;
    const next = sanitizeCgiScene({
      ...scene,
      objects: scene.objects.map((object) =>
        object.id === id ? { ...object, ...patch } : object,
      ),
    });
    if (next) this.sceneChange.emit(next);
  }

  private clamp(
    value: number | string,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  setAnimTarget(value: string): void {
    this.animTarget.set(value);
    this.animChannel.set(value ? 'position.x' : 'camera.distance');
    this.valueDraft.set(null);
    this.selectedKeyRef.set(null);
  }

  setAnimChannel(value: string): void {
    this.animChannel.set(value as CgiAnimationChannel);
    this.valueDraft.set(null);
    this.selectedKeyRef.set(null);
  }

  setKeyframeValue(value: number | string): void {
    const numeric = Number(value);
    this.valueDraft.set(Number.isFinite(numeric) ? numeric : 0);
  }

  setAnimEasing(value: string): void {
    this.animEasing.set(value as KeyframeEasing);
  }

  easingLabel(easing: KeyframeEasing): string {
    return (
      KEYFRAME_EASINGS.find((entry) => entry.id === easing)?.label ?? easing
    );
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
        this.animEasing(),
      ),
    );
  }

  /** Load a key into the value and easing fields so it can be changed. */
  selectKey(channel: CgiAnimationChannel, keyId: string): void {
    const key = this.trackKey(channel, keyId);
    if (!key) return;
    this.animChannel.set(channel);
    this.selectedKeyRef.set({ channel, id: keyId });
    this.valueDraft.set(key.value);
    this.animEasing.set(key.easing);
    // Show the frame being edited, not just the values behind it.
    this.seekRequest.emit(key.time);
  }

  /** Re-write the loaded key at its own time with the current values. */
  updateKeyframe(): void {
    const scene = this.scene();
    const ref = this.selectedKeyRef();
    const key = this.selectedKey();
    if (!scene || !ref || !key) return;
    this.sceneChange.emit(
      setCgiKeyframe(
        scene,
        this.animTarget() || null,
        ref.channel,
        key.time,
        this.keyframeValue(),
        this.animEasing(),
      ),
    );
    this.selectedKeyRef.set(null);
  }

  deleteSelectedKey(): void {
    const scene = this.scene();
    const ref = this.selectedKeyRef();
    if (!scene || !ref) return;
    this.removeKey(ref.channel, ref.id);
  }

  removeKey(channel: CgiAnimationChannel, keyId: string): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(
      removeCgiKeyframe(scene, this.animTarget() || null, channel, keyId),
    );
    if (this.selectedKeyRef()?.id === keyId) this.selectedKeyRef.set(null);
  }

  clearTrack(channel: CgiAnimationChannel): void {
    const scene = this.scene();
    if (!scene) return;
    this.sceneChange.emit(
      removeCgiKeyframe(scene, this.animTarget() || null, channel),
    );
    if (this.selectedKeyRef()?.channel === channel) {
      this.selectedKeyRef.set(null);
    }
  }

  private trackKey(
    channel: CgiAnimationChannel,
    keyId: string,
  ): CgiKeyframe | undefined {
    const target = this.animTarget() || null;
    return (this.scene()?.animation?.tracks ?? [])
      .find(
        (track) =>
          track.targetObjectId === target && track.channel === channel,
      )
      ?.keys.find((key) => key.id === keyId);
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
