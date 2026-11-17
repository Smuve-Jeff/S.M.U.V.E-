import { Injectable, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import type { CgiObject, CgiSceneSettings } from './cgi-scene';
import { resolveCgiFrame } from './cgi-scene';

/**
 * Three.js renderer for one transparent CGI overlay.
 *
 * It owns one WebGL surface and reuses it across frames: creating a context per
 * repaint would exhaust WebGL on a phone in seconds. The returned canvas is
 * drawn into the Lab's 2D programme canvas after the media layer and before the
 * mask/grade/FX passes, so the same 3D frame lands in the preview and export.
 */
@Injectable({ providedIn: 'root' })
export class CgiRendererService implements OnDestroy {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private objectRoot: THREE.Group | null = null;
  private ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private environment: THREE.Texture | null = null;
  private environmentForReflections = false;
  private surfaceWidth = 0;
  private surfaceHeight = 0;
  /** Structural object list; transforms and colours update every frame. */
  private objectSignature = '';
  /** A model finished loading, so the next frame must rebuild its object. */
  private objectsDirty = false;
  private readonly modelCache = new Map<string, THREE.Group>();
  private readonly loadingModels = new Set<string>();
  private failed = false;

  /**
   * Render one frame. Returns null when WebGL is unavailable in this host; the
   * caller then keeps the media/placeholder path rather than painting a blank
   * frame over the programme.
   */
  render(
    settings: CgiSceneSettings,
    width: number,
    height: number,
    clipLocalTime: number,
    duration: number,
  ): HTMLCanvasElement | null {
    if (!settings.enabled || width < 2 || height < 2) return null;
    if (!this.ensureRenderer(width, height)) return null;

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

      if (child.userData['cgiPrimitive'] === true) {
        const material = (child as THREE.Mesh).material;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.set(object.color);
          material.emissive.copy(material.color);
        }
      }
      this.applyMaterialLook(child, resolved.opacity, resolved.emissive);
    });

    renderer.render(scene, camera);
    return renderer.domElement;
  }

  private ensureRenderer(width: number, height: number): boolean {
    if (this.failed) return false;
    if (this.renderer) return true;
    if (
      typeof document === 'undefined' ||
      typeof WebGLRenderingContext === 'undefined'
    ) {
      this.failed = true;
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
      return true;
    } catch {
      this.failed = true;
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
      else if (object.modelDataUrl) void this.loadModel(object.modelDataUrl);
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
      case 'torus':
      default:
        geometry = new THREE.TorusKnotGeometry(0.72, 0.24, 180, 32);
        break;
    }
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(object.color),
      metalness: 0.72,
      roughness: 0.22,
      envMapIntensity: 1.15,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['cgiPrimitive'] = true;
    mesh.userData['cgiObjectId'] = object.id;
    mesh.userData['cgiBaseScale'] = mesh.scale.clone();
    this.cacheMaterials(mesh);
    return mesh;
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

  private async loadModel(dataUrl: string): Promise<void> {
    if (this.loadingModels.has(dataUrl) || this.modelCache.has(dataUrl)) return;
    this.loadingModels.add(dataUrl);
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error('CGI model could not be read');
      const isJson = /^data:application\/(?:ld\+)?json/i.test(dataUrl);
      const payload = isJson ? await response.text() : await response.arrayBuffer();
      const { GLTFLoader } = await import(
        'three/examples/jsm/loaders/GLTFLoader.js'
      );
      const loader = new GLTFLoader();
      loader.parse(
        payload,
        '',
        (gltf) => {
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
          this.objectsDirty = true;
        },
        () => undefined,
      );
    } catch {
      // A malformed model leaves the other objects renderable.
    } finally {
      this.loadingModels.delete(dataUrl);
    }
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((child) => {
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
  }

  dispose(): void {
    if (this.objectRoot) {
      for (const child of [...this.objectRoot.children]) {
        if (child.userData['cgiPrimitive'] === true) this.disposeObject(child);
        else this.disposeMaterials(child);
      }
      this.objectRoot.clear();
    }
    for (const model of this.modelCache.values()) this.disposeObject(model);
    this.modelCache.clear();
    this.scene?.clear();
    this.environment?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.objectRoot = null;
    this.ground = null;
    this.keyLight = null;
    this.loadingModels.clear();
    this.objectSignature = '';
    this.objectsDirty = false;
    this.surfaceWidth = 0;
    this.surfaceHeight = 0;
    this.failed = false;
    this.environment = null;
    this.environmentForReflections = false;
  }

  ngOnDestroy(): void {
    this.dispose();
  }
}
