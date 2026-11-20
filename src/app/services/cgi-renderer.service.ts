import { Injectable, OnDestroy, isDevMode, signal } from '@angular/core';
import * as THREE from 'three';
import type {
  CgiMaterialPreset,
  CgiObject,
  CgiSceneSettings,
} from './cgi-scene';
import { CGI_MATERIAL_PRESETS, resolveCgiFrame } from './cgi-scene';

/** How long a failed or lost GPU surface waits before a rebuild attempt. */
const SURFACE_RETRY_MS = 1_000;
/** A context the driver dropped is replaced almost immediately. */
const CONTEXT_LOSS_RETRY_MS = 500;
/** Rebuild delays double per consecutive failure, so a dead GPU is not hammered. */
const SURFACE_RETRY_MAX_MS = 30_000;
/** A surface stuck in 'starting' this long is reported as stalled, not silent. */
const SURFACE_START_TIMEOUT_MS = 5_000;
/** Model reads/parses are retried with backoff, then left to the placeholder. */
const MAX_MODEL_LOAD_ATTEMPTS = 5;
const MODEL_RETRY_BASE_MS = 2_000;
const MODEL_RETRY_MAX_MS = 30_000;

/**
 * Three.js renderer for one transparent CGI overlay.
 *
 * It owns one WebGL surface and reuses it across frames: creating a context per
 * repaint would exhaust WebGL on a phone in seconds. The returned canvas is
 * drawn into the Lab's 2D programme canvas after the media layer and before the
 * mask/grade/FX passes, so the same 3D frame lands in the preview and export.
 *
 * The surface is disposable: a lost context or a failed draw releases it and a
 * later frame builds a fresh one, so a driver reset degrades to the placeholder
 * instead of disabling CGI or breaking the paint loop for the session.
 */
/** What the editor can say about the 3D surface instead of showing nothing. */
export type CgiSurfaceStatus = 'idle' | 'starting' | 'ready' | 'failed';

@Injectable({ providedIn: 'root' })
export class CgiRendererService implements OnDestroy {
  /**
   * Surface state for the editor's status badge.
   *
   * A cold GPU, a driver reset and a host without WebGL all used to look the
   * same from the UI: an empty monitor. These states make the wait and the
   * failure visible, and `statusDetail` says what happened in one line.
   */
  readonly status = signal<CgiSurfaceStatus>('idle');
  readonly statusDetail = signal('');
  private startingAt = 0;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private objectRoot: THREE.Group | null = null;
  private ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private environment: THREE.Texture | null = null;
  private environmentForReflections = false;
  private glowTexture: THREE.CanvasTexture | null = null;
  private surfaceWidth = 0;
  private surfaceHeight = 0;
  /** Structural object list; transforms and colours update every frame. */
  private objectSignature = '';
  /** A model finished loading, so the next frame must rebuild its object. */
  private objectsDirty = false;
  private readonly modelCache = new Map<string, THREE.Group>();
  /** Shared in-flight reads, so a preview and an export never parse twice. */
  private readonly modelLoads = new Map<string, Promise<void>>();
  /** Failed model reads, retried with backoff instead of vanishing. */
  private readonly modelFailures = new Map<
    string,
    { attempts: number; nextAt: number }
  >();
  private readonly modelRetryTimers = new Set<ReturnType<typeof setTimeout>>();
  /** True when this host has no WebGL at all; retrying cannot help. */
  private webglUnavailable = false;
  /** No rebuild is attempted before this timestamp (lost context, render error). */
  private retryAt = 0;
  /** Consecutive surface failures; successful creation resets the backoff. */
  private surfaceFailures = 0;

  /**
   * Load every embedded model a set of scenes references before an export
   * starts. Preview can paint a frame while a GLB is still parsing; a
   * frame-locked export must not encode the first slots with a missing model.
   * Failed models resolve as well and keep their placeholder/retry behaviour.
   */
  async preload(scenes: readonly CgiSceneSettings[]): Promise<void> {
    const urls = new Set<string>();
    for (const scene of scenes) {
      if (!scene.enabled) continue;
      for (const object of scene.objects) {
        if (object.kind === 'model' && object.modelDataUrl) {
          urls.add(object.modelDataUrl);
        }
      }
    }
    await Promise.all([...urls].map((url) => this.loadModel(url)));
  }

  /**
   * Render one frame. Returns null when WebGL is unavailable in this host; the
   * caller then keeps the media/placeholder path rather than painting a blank
   * frame over the programme.
   *
   * Renderer errors are contained here. A lost context or a failed draw drops
   * the surface and schedules a rebuild, so it can never escape into the
   * editor's paint loop and freeze the preview.
   */
  render(
    settings: CgiSceneSettings,
    width: number,
    height: number,
    clipLocalTime: number,
    duration: number,
  ): HTMLCanvasElement | null {
    if (!settings.enabled || width < 2 || height < 2) return null;
    if (!this.renderer) this.noteSurfaceRequest();
    if (!this.ensureRenderer(width, height)) return null;
    try {
      const canvas = this.paint(settings, width, height, clipLocalTime, duration);
      this.markSurfaceReady();
      return canvas;
    } catch {
      // A GPU reset, a driver hiccup or a shader failure: keep the caller's
      // placeholder path and let a later frame rebuild on a fresh surface.
      this.handleSurfaceFailure(
        SURFACE_RETRY_MS,
        'The GPU failed while drawing the 3D stage.',
      );
      return null;
    }
  }

  /** Draw one frame on the current surface; throws are handled by `render`. */
  private paint(
    settings: CgiSceneSettings,
    width: number,
    height: number,
    clipLocalTime: number,
    duration: number,
  ): HTMLCanvasElement | null {
    const renderer = this.renderer!;
    const scene = this.scene!;
    const camera = this.camera!;
    const frame = resolveCgiFrame(settings, clipLocalTime, duration);

    if (width !== this.surfaceWidth || height !== this.surfaceHeight) {
      renderer.setSize(width, height, false);
      this.surfaceWidth = width;
      this.surfaceHeight = height;
    }
    renderer.shadowMap.enabled = settings.shadows;
    renderer.setClearColor(
      settings.background === 'dark' ? 0x050816 : 0x000000,
      settings.background === 'dark' ? 1 : 0,
    );

    if (this.environmentForReflections !== settings.reflections) {
      scene.environment = settings.reflections ? this.ensureEnvironment() : null;
      scene.environmentIntensity = 0.9;
      this.environmentForReflections = settings.reflections;
    }

    if (this.keyLight) {
      this.keyLight.intensity = 1.2 + frame.lightIntensity * 1.8;
      this.keyLight.castShadow = settings.shadows;
    }
    if (this.ground) {
      this.ground.visible = settings.shadows;
      this.ground.receiveShadow = settings.shadows;
    }

    this.syncObjects(settings);
    const pose = frame.cameraPose;
    camera.fov = settings.fov;
    camera.aspect = width / height;
    camera.position.set(
      Math.sin(pose.azimuth) * pose.distance,
      pose.height,
      Math.cos(pose.azimuth) * pose.distance,
    );
    camera.lookAt(0, pose.targetY, 0);
    camera.updateProjectionMatrix();

    const objectsById = new Map(
      settings.objects.map((object) => [object.id, object]),
    );
    const resolvedById = new Map(
      frame.objects.map((object) => [object.id, object]),
    );
    this.objectRoot?.children.forEach((child) => {
      const id = child.userData['cgiObjectId'] as string | undefined;
      const object = id ? objectsById.get(id) : undefined;
      const resolved = id ? resolvedById.get(id) : undefined;
      if (!object || !resolved) return;

      child.position.set(...resolved.position);
      child.rotation.set(...resolved.rotation);
      const baseScale = child.userData['cgiBaseScale'] as
        | THREE.Vector3
        | undefined;
      if (baseScale) child.scale.copy(baseScale).multiplyScalar(resolved.scale);
      else child.scale.setScalar(resolved.scale);

      let modelFinish: CgiMaterialPreset | undefined;
      if (child.userData['cgiPrimitive'] === true) {
        const material = (child as THREE.Mesh).material;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.set(object.color);
          material.emissive.copy(material.color);
          material.metalness = object.metalness ?? 0.72;
          material.roughness = object.roughness ?? 0.22;
        }
      } else if (object.materialPreset) {
        modelFinish = CGI_MATERIAL_PRESETS.find(
          (preset) => preset.id === object.materialPreset,
        );
        this.applyModelFinish(child, modelFinish);
      } else {
        this.applyModelFinish(child, undefined);
      }

      const glow = child.userData['cgiGlow'] as THREE.Sprite | undefined;
      if (glow) {
        const glowAmount =
          settings.bloom === false
            ? 0
            : Math.max(0, resolved.emissive, modelFinish?.patch.emissive ?? 0);
        const sceneStrength = Math.max(
          0,
          Math.min(2, settings.bloomStrength ?? 1),
        );
        const objectStrength = Math.max(
          0,
          Math.min(2, object.bloomStrength ?? 1),
        );
        const strength = Math.min(2, sceneStrength * objectStrength);
        const radius = Math.max(
          0.25,
          Math.min(2.5, settings.bloomRadius ?? 1),
        );
        glow.visible =
          object.bloom !== false && glowAmount > 0.01 && strength > 0.001;
        if (glow.visible) {
          const glowMaterial = glow.material;
          glowMaterial.color.set(object.color);
          glowMaterial.opacity = Math.min(
            0.95,
            (0.4 + glowAmount * 0.35) * strength,
          );
          glow.scale.setScalar(
            (5.2 + Math.min(1.6, glowAmount * 0.5)) * radius,
          );
        }
      }

      this.applyMaterialLook(
        child,
        resolved.opacity,
        object.kind === 'model'
          ? Math.max(resolved.emissive, modelFinish?.patch.emissive ?? 0)
          : resolved.emissive,
      );
    });

    renderer.render(scene, camera);
    return renderer.domElement;
  }

  /**
   * Record that a frame wants a surface, before the GPU is asked for one.
   *
   * A surface that never answers stays 'starting' only until the stall window
   * passes; then it is reported as failed instead of leaving an empty monitor.
   */
  private noteSurfaceRequest(): void {
    if (this.webglUnavailable || Date.now() < this.retryAt) return;
    if (this.status() === 'starting') {
      if (Date.now() - this.startingAt > SURFACE_START_TIMEOUT_MS) {
        this.status.set('failed');
        this.statusDetail.set(
          'The GPU has not answered yet; retrying automatically.',
        );
      }
      return;
    }
    if (this.status() === 'ready') return;
    this.startingAt = Date.now();
    this.status.set('starting');
    this.statusDetail.set('Preparing the 3D stage on the GPU.');
  }

  private markSurfaceReady(): void {
    if (this.status() === 'ready') return;
    this.status.set('ready');
    this.statusDetail.set('');
  }

  private failSurface(detail: string): void {
    this.status.set('failed');
    this.statusDetail.set(detail);
  }

  private ensureRenderer(width: number, height: number): boolean {
    if (this.renderer) return true;
    if (this.webglUnavailable) return false;
    if (Date.now() < this.retryAt) return false;
    if (
      typeof document === 'undefined' ||
      typeof WebGLRenderingContext === 'undefined'
    ) {
      this.webglUnavailable = true;
      this.failSurface(
        'This browser has no WebGL, so the 3D stage cannot render.',
      );
      return false;
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 1.1));

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
      keyLight.position.set(4.5, 7, 4);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -7;
      keyLight.shadow.camera.right = 7;
      keyLight.shadow.camera.top = 7;
      keyLight.shadow.camera.bottom = -7;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 24;
      keyLight.shadow.bias = -0.0006;
      scene.add(keyLight);

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 24),
        new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.35 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1.3;
      ground.receiveShadow = true;
      scene.add(ground);

      const objectRoot = new THREE.Group();
      scene.add(objectRoot);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.keyLight = keyLight;
      this.ground = ground;
      this.objectRoot = objectRoot;
      this.surfaceWidth = width;
      this.surfaceHeight = height;
      renderer.domElement.addEventListener(
        'webglcontextlost',
        this.onContextLost,
      );
      if (isDevMode()) {
        // Dev-only handle for the manual context-loss drill: the surface never
        // enters the DOM, so it cannot be reached from the page otherwise.
        (globalThis as { __smuveCgiSurface?: HTMLCanvasElement })
          .__smuveCgiSurface = renderer.domElement;
      }
      this.surfaceFailures = 0;
      this.retryAt = 0;
      return true;
    } catch {
      // Context creation can fail transiently (too many live contexts, a
      // driver reset). Back off instead of disabling CGI for the session.
      this.failSurface('The GPU could not create the 3D stage.');
      this.scheduleSurfaceRetry(SURFACE_RETRY_MS);
      return false;
    }
  }

  /**
   * A small procedural studio environment gives metal and glass real
   * reflections without shipping an HDR file or depending on an asset CDN.
   */
  private ensureEnvironment(): THREE.Texture | null {
    if (this.environment) return this.environment;
    if (!this.renderer) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const sky = ctx.createLinearGradient(0, 0, 0, 512);
      sky.addColorStop(0, '#dbeafe');
      sky.addColorStop(0.42, '#64748b');
      sky.addColorStop(0.58, '#111827');
      sky.addColorStop(1, '#020617');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 1024, 512);
      const glow = ctx.createRadialGradient(690, 170, 8, 690, 170, 210);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.2, 'rgba(186,230,253,0.5)');
      glow.addColorStop(1, 'rgba(186,230,253,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1024, 512);

      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.environment = pmrem.fromEquirectangular(texture).texture;
      texture.dispose();
      pmrem.dispose();
      return this.environment;
    } catch {
      return null;
    }
  }

  /**
   * Rebuild only when the object list's structure changes. Transform, opacity,
   * emissive and colour are applied every frame, so dragging a slider or
   * scrubbing an animation does not recreate geometry or reload a model.
   */
  private syncObjects(settings: CgiSceneSettings): void {
    if (!this.objectRoot) return;
    const signature = settings.objects
      .map(
        (object) =>
          `${object.id}:${object.kind}:${object.modelDataUrl?.length ?? 0}`,
      )
      .join('|');
    if (!this.objectsDirty && signature === this.objectSignature) return;
    this.objectsDirty = false;
    this.objectSignature = signature;
    this.pruneModelCache(settings);

    for (const child of [...this.objectRoot.children]) {
      this.objectRoot.remove(child);
      if (child.userData['cgiPrimitive'] === true) this.disposeObject(child);
      else this.disposeMaterials(child);
    }

    settings.objects.forEach((object) => {
      if (object.kind !== 'model') {
        const mesh = this.createPrimitive(object);
        if (mesh) this.objectRoot?.add(mesh);
        return;
      }
      const cached = object.modelDataUrl
        ? this.modelCache.get(object.modelDataUrl)
        : null;
      if (cached) this.addModelClone(cached, object);
      else if (object.modelDataUrl) this.requestModel(object.modelDataUrl);
    });
  }

  /** Drop models the current scene no longer references, releasing GPU memory. */
  private pruneModelCache(settings: CgiSceneSettings): void {
    const active = new Set(
      settings.objects.flatMap((object) =>
        object.modelDataUrl ? [object.modelDataUrl] : [],
      ),
    );
    for (const [url, model] of this.modelCache) {
      if (active.has(url)) continue;
      this.disposeObject(model);
      this.modelCache.delete(url);
    }
    // A removed broken model should not keep a retry deadline forever.
    for (const url of this.modelFailures.keys()) {
      if (!active.has(url)) this.modelFailures.delete(url);
    }
  }

  private createPrimitive(object: CgiObject): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    switch (object.kind) {
      case 'cube':
        geometry = new THREE.BoxGeometry(1.45, 1.45, 1.45, 1, 1, 1);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.95, 64, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.78, 0.78, 1.65, 64, 1);
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(0.92, 1.7, 64, 1);
        break;
      case 'torus':
      default:
        geometry = new THREE.TorusKnotGeometry(0.72, 0.24, 180, 32);
        break;
    }
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(object.color),
      metalness: object.metalness ?? 0.72,
      roughness: object.roughness ?? 0.22,
      envMapIntensity: 1.15,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['cgiPrimitive'] = true;
    mesh.userData['cgiObjectId'] = object.id;
    mesh.userData['cgiBaseScale'] = mesh.scale.clone();
    const glow = this.createGlow(object);
    if (glow) {
      mesh.add(glow);
      mesh.userData['cgiGlow'] = glow;
    }
    this.cacheMaterials(mesh);
    return mesh;
  }

  /**
   * A small additive sprite gives emissive objects a bloom halo without a
   * post-processing pass. It keeps the transparent canvas transparent, which a
   * full-screen bloom target would not.
   */
  private createGlow(object: CgiObject): THREE.Sprite | null {
    const texture = this.ensureGlowTexture();
    if (!texture) return null;
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(object.color),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const glow = new THREE.Sprite(material);
    glow.visible = false;
    glow.renderOrder = 2;
    glow.scale.setScalar(3.1);
    glow.userData['cgiGlow'] = true;
    return glow;
  }

  private ensureGlowTexture(): THREE.CanvasTexture | null {
    if (this.glowTexture) return this.glowTexture;
    if (typeof document === 'undefined' || typeof WebGLRenderingContext === 'undefined') {
      return null;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      // Keep the centre clear: the halo should surround the surface, not wash
      // the object itself out to white.
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.32, 'rgba(255,255,255,0.08)');
      gradient.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      gradient.addColorStop(0.72, 'rgba(255,255,255,0.12)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.glowTexture = texture;
      return texture;
    } catch {
      return null;
    }
  }

  /** Apply or restore a model's PBR scalars; its textures and colours stay. */
  private applyModelFinish(
    root: THREE.Object3D,
    finish: CgiMaterialPreset | undefined,
  ): void {
    const materials =
      (root.userData['cgiMaterials'] as THREE.Material[] | undefined) ?? [];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const data = material.userData;
      if (!Number.isFinite(data['cgiBaseMetalness'])) {
        data['cgiBaseMetalness'] = material.metalness;
      }
      if (!Number.isFinite(data['cgiBaseRoughness'])) {
        data['cgiBaseRoughness'] = material.roughness;
      }
      material.metalness = finish
        ? (finish.patch.metalness ?? material.metalness)
        : (data['cgiBaseMetalness'] as number);
      material.roughness = finish
        ? (finish.patch.roughness ?? material.roughness)
        : (data['cgiBaseRoughness'] as number);
    }
  }

  private addModelClone(source: THREE.Group, object: CgiObject): void {
    const clone = source.clone(true);
    // Object3D.clone shares materials. Opacity/emissive are per overlay object,
    // so each clone needs its own material copies before the first render.
    this.cloneModelMaterials(clone);
    clone.userData['cgiPrimitive'] = false;
    clone.userData['cgiObjectId'] = object.id;
    // Preserve the auto-fit scale; the resolver supplies the authored scale.
    clone.userData['cgiBaseScale'] = clone.scale.clone();
    this.cacheMaterials(clone);
    const glow = this.createGlow(object);
    if (glow) {
      clone.add(glow);
      clone.userData['cgiGlow'] = glow;
    }
    this.objectRoot?.add(clone);
  }

  private cloneModelMaterials(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material;
      child.material = Array.isArray(material)
        ? material.map((entry) => entry.clone())
        : material.clone();
    });
  }

  /** Flatten the object's materials once so the render loop avoids a traverse. */
  private cacheMaterials(root: THREE.Object3D): void {
    const materials: THREE.Material[] = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material;
      if (Array.isArray(material)) materials.push(...material);
      else if (material) materials.push(material);
    });
    root.userData['cgiMaterials'] = materials;
  }

  private applyMaterialLook(
    root: THREE.Object3D,
    opacity: number,
    emissive: number,
  ): void {
    const materials =
      (root.userData['cgiMaterials'] as THREE.Material[] | undefined) ?? [];
    for (const material of materials) {
      const data = material.userData;
      if (!Number.isFinite(data['cgiBaseOpacity'])) {
        data['cgiBaseOpacity'] = material.opacity;
      }
      if (typeof data['cgiBaseTransparent'] !== 'boolean') {
        data['cgiBaseTransparent'] = material.transparent;
      }

      const nextOpacity =
        Math.max(0, Math.min(1, opacity)) *
        (data['cgiBaseOpacity'] as number);
      const transparent =
        data['cgiBaseTransparent'] === true || nextOpacity < 1;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = nextOpacity;

      if (material instanceof THREE.MeshStandardMaterial) {
        if (!Number.isFinite(data['cgiBaseEmissiveIntensity'])) {
          const hasEmissive =
            material.emissive.getHex() !== 0 || !!material.emissiveMap;
          data['cgiBaseEmissiveIntensity'] = hasEmissive
            ? material.emissiveIntensity
            : 0;
          if (!hasEmissive) material.emissive.copy(material.color);
        }
        material.emissiveIntensity =
          (data['cgiBaseEmissiveIntensity'] as number) +
          Math.max(0, emissive);
      }
    }
  }

  /** A shared read/parse for one embedded model. Resolves even on failure. */
  private loadModel(dataUrl: string): Promise<void> {
    if (this.modelCache.has(dataUrl)) return Promise.resolve();
    const inFlight = this.modelLoads.get(dataUrl);
    if (inFlight) return inFlight;

    const read = this.readModel(dataUrl);
    const tracked = read.finally(() => {
      if (this.modelLoads.get(dataUrl) === tracked) {
        this.modelLoads.delete(dataUrl);
      }
    });
    this.modelLoads.set(dataUrl, tracked);
    return tracked;
  }

  private async readModel(dataUrl: string): Promise<void> {
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error('CGI model could not be read');
      // Sniff the bytes instead of trusting the data URL's MIME type. A .gltf
      // file can arrive as application/octet-stream or with an empty type, and
      // parsing its JSON as a GLB fails with a misleading loader error. GLB
      // starts with the ASCII magic "glTF"; everything else is JSON text.
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isGlb =
        bytes.length >= 4 &&
        bytes[0] === 0x67 &&
        bytes[1] === 0x6c &&
        bytes[2] === 0x54 &&
        bytes[3] === 0x46;
      const payload: ArrayBuffer | string = isGlb
        ? buffer
        : new TextDecoder().decode(buffer);
      const { GLTFLoader } = await import(
        'three/examples/jsm/loaders/GLTFLoader.js'
      );
      const loader = new GLTFLoader();
      await new Promise<void>((resolve, reject) => {
        loader.parse(
          payload,
          '',
          (gltf) => {
            try {
              const scene = gltf.scene;
              scene.traverse((child) => {
                if (!(child instanceof THREE.Mesh)) return;
                child.castShadow = true;
                child.receiveShadow = true;
              });
              const bounds = new THREE.Box3().setFromObject(scene);
              const size = bounds.getSize(new THREE.Vector3());
              const center = bounds.getCenter(new THREE.Vector3());
              scene.position.sub(center);
              const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
              const wrapper = new THREE.Group();
              wrapper.add(scene);
              wrapper.scale.setScalar(2 / maxDimension);
              this.modelCache.set(dataUrl, wrapper);
              this.modelFailures.delete(dataUrl);
              this.objectsDirty = true;
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          (error) => reject(error),
        );
      });
    } catch {
      this.noteModelFailure(dataUrl);
    }
  }

  /** Ask for a model unless it is cached, in flight, or backing off. */
  private requestModel(dataUrl: string): void {
    if (this.modelCache.has(dataUrl) || this.modelLoads.has(dataUrl)) return;
    const failure = this.modelFailures.get(dataUrl);
    if (
      failure &&
      (failure.attempts >= MAX_MODEL_LOAD_ATTEMPTS ||
        Date.now() < failure.nextAt)
    ) {
      return;
    }
    void this.loadModel(dataUrl);
  }

  /**
   * A model that failed to read or parse must not vanish silently. Retry it
   * with backoff so a transient failure heals while the rest of the scene keeps
   * rendering; after the last attempt the object simply stays absent.
   */
  private noteModelFailure(dataUrl: string): void {
    const attempts = (this.modelFailures.get(dataUrl)?.attempts ?? 0) + 1;
    const delay = Math.min(
      MODEL_RETRY_MAX_MS,
      MODEL_RETRY_BASE_MS * 2 ** (attempts - 1),
    );
    this.modelFailures.set(dataUrl, { attempts, nextAt: Date.now() + delay });
    if (attempts >= MAX_MODEL_LOAD_ATTEMPTS) return;
    const timer = setTimeout(() => {
      this.modelRetryTimers.delete(timer);
      // Force one structural pass; `requestModel` re-checks the backoff.
      this.objectsDirty = true;
    }, delay);
    this.modelRetryTimers.add(timer);
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Sprite) {
        child.material.dispose();
        return;
      }
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry?.dispose();
      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else {
        material?.dispose();
      }
    });
  }

  /** Model clones share geometry with the cache; only their materials are theirs. */
  private disposeMaterials(root: THREE.Object3D): void {
    const materials = root.userData['cgiMaterials'] as
      | THREE.Material[]
      | undefined;
    materials?.forEach((material) => material.dispose());
    const glow = root.userData['cgiGlow'] as THREE.Sprite | undefined;
    glow?.material.dispose();
  }

  /**
   * Drop the live GPU surface and everything built on it, keeping the cached
   * models' CPU data: the next render creates a fresh renderer and re-uploads
   * them. This is the recovery path for a lost context or a failed draw.
   */
  private releaseSurface(): void {
    this.renderer?.domElement.removeEventListener(
      'webglcontextlost',
      this.onContextLost,
    );
    if (this.objectRoot) {
      for (const child of [...this.objectRoot.children]) {
        if (child.userData['cgiPrimitive'] === true) this.disposeObject(child);
        else this.disposeMaterials(child);
      }
      this.objectRoot.clear();
    }
    this.ground?.geometry.dispose();
    this.ground?.material.dispose();
    this.scene?.clear();
    this.environment?.dispose();
    const renderer = this.renderer;
    try {
      renderer?.dispose();
      // Browsers cap how many contexts may be live, so hand this one back -
      // but only if the driver has not already dropped it, because losing a
      // lost context only logs a WebGL INVALID_OPERATION warning.
      if (renderer && !renderer.getContext().isContextLost()) {
        renderer.forceContextLoss();
      }
    } catch {
      // The context was already gone.
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.objectRoot = null;
    this.ground = null;
    this.keyLight = null;
    this.objectSignature = '';
    this.objectsDirty = false;
    this.surfaceWidth = 0;
    this.surfaceHeight = 0;
    this.environment = null;
    this.environmentForReflections = false;
    this.glowTexture?.dispose();
    this.glowTexture = null;
  }

  private handleSurfaceFailure(baseDelayMs: number, detail: string): void {
    this.failSurface(detail);
    this.releaseSurface();
    this.scheduleSurfaceRetry(baseDelayMs);
  }

  private scheduleSurfaceRetry(baseDelayMs: number): void {
    this.surfaceFailures += 1;
    const delay = Math.min(
      SURFACE_RETRY_MAX_MS,
      baseDelayMs * 2 ** (this.surfaceFailures - 1),
    );
    this.retryAt = Date.now() + delay;
  }

  private readonly onContextLost = (event: Event): void => {
    // preventDefault keeps the canvas eligible for restoration, but the
    // renderer is replaced anyway: reusing a context the driver threw away
    // usually renders nothing.
    event.preventDefault();
    if (!this.renderer) return;
    this.handleSurfaceFailure(
      CONTEXT_LOSS_RETRY_MS,
      'The GPU dropped the 3D surface; rebuilding it.',
    );
  };

  /**
   * Rebuild the stage now instead of waiting out the backoff: the editor's
   * RETRY. A browser with no WebGL cannot recover, so that failure stands.
   */
  retrySurface(): void {
    if (this.webglUnavailable) {
      this.failSurface(
        'This browser has no WebGL, so the 3D stage cannot render.',
      );
      return;
    }
    this.releaseSurface();
    this.retryAt = 0;
    this.surfaceFailures = 0;
    this.startingAt = 0;
    this.status.set('idle');
    this.statusDetail.set('');
  }

  dispose(): void {
    this.releaseSurface();
    for (const model of this.modelCache.values()) this.disposeObject(model);
    this.modelCache.clear();
    this.modelFailures.clear();
    for (const timer of this.modelRetryTimers) clearTimeout(timer);
    this.modelRetryTimers.clear();
    this.modelLoads.clear();
    this.webglUnavailable = false;
    this.retryAt = 0;
    this.surfaceFailures = 0;
    this.startingAt = 0;
    this.status.set('idle');
    this.statusDetail.set('');
  }

  ngOnDestroy(): void {
    this.dispose();
  }
}
