import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from "@angular/core";
import { MusicManagerService } from "../../services/music-manager.service";
import {
  CharacterLibraryService,
  type SavedCharacterModel,
} from "./character-library.service";
import { portraitCameraDistance } from "./portrait-framing";
import {
  DEFAULT_ORBIT_RADIUS,
  MAX_ORBIT_RADIUS,
  MIN_ORBIT_RADIUS,
  orbitLimitsFor,
  stageCameraDistance,
  stageFogRange,
  type StageExtents,
} from "./stage-framing";

type ThreeModule = typeof import("three");
type Renderer = import("three").WebGLRenderer;
type Scene = import("three").Scene;
type Camera = import("three").PerspectiveCamera;
type Group = import("three").Group;
type Mesh = import("three").Mesh;
type Material = import("three").MeshStandardMaterial;
type BasicMaterial = import("three").MeshBasicMaterial;
type ColorMaterial =
  | import("three").MeshBasicMaterial
  | import("three").LineBasicMaterial
  | import("three").PointsMaterial;
type Line = import("three").Line;
type Points = import("three").Points;
type Object3D = import("three").Object3D;
type Instanced = import("three").InstancedMesh;
type Color = import("three").Color;
type Fog = import("three").Fog;
type SpotLight = import("three").SpotLight;
type PointLight = import("three").PointLight;
type Raycaster = import("three").Raycaster;
type Vector2 = import("three").Vector2;
type BufferAttribute = import("three").BufferAttribute;
type AnimationAction = import("three").AnimationAction;
type AnimationMixer = import("three").AnimationMixer;
type Gltf = import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;

export type StageMood = "groove" | "hype" | "chill";
export type StagePalette = "teal" | "violet" | "ember";
export type StageMove = "wave" | "point" | "spin" | "jump";

interface PaletteSpec {
  background: number;
  fog: number;
  primary: number;
  secondary: number;
  accent: number;
  key: number;
}

interface MoveSpec {
  id: StageMove;
  label: string;
  glyph: string;
}

const PALETTES: Record<StagePalette, PaletteSpec> = {
  teal: {
    background: 0x04080f,
    fog: 0x06121a,
    primary: 0x2ba09c,
    secondary: 0x65f4ff,
    accent: 0xff4fd8,
    key: 0xd8ffff,
  },
  violet: {
    background: 0x08040f,
    fog: 0x13081f,
    primary: 0x8b5cf6,
    secondary: 0xd8b4fe,
    accent: 0x22d3ee,
    key: 0xf3e8ff,
  },
  ember: {
    background: 0x0e0604,
    fog: 0x1c0a06,
    primary: 0xf97316,
    secondary: 0xfbbf24,
    accent: 0xef4444,
    key: 0xffe8d1,
  },
};

const MOODS: readonly StageMood[] = ["groove", "hype", "chill"];

const MOVES: readonly MoveSpec[] = [
  { id: "wave", label: "Wave", glyph: "◡" },
  { id: "point", label: "Point", glyph: "→" },
  { id: "spin", label: "Spin", glyph: "↻" },
  { id: "jump", label: "Jump", glyph: "↑" },
];

const MOOD_LABELS: Record<StageMood, string> = {
  groove: "Groove",
  hype: "Hype",
  chill: "Chill",
};

const PALETTE_LABELS: Record<StagePalette, string> = {
  teal: "Teal",
  violet: "Violet",
  ember: "Ember",
};

const GESTURE_LABELS: Record<StageMove, string> = {
  wave: "Waving",
  point: "Pointing",
  spin: "Spinning",
  jump: "Jumping",
};

const MAX_CHARACTER_BYTES = 30 * 1024 * 1024;
const CHARACTER_HEIGHT = 2.65;
/** Square side of the portrait rendered for each saved performer. */
const THUMBNAIL_SIZE = 160;

/** Clip names vary between exporters; match the intent, not one exact name. */
const MOVE_CLIP_PATTERNS: Record<StageMove, RegExp> = {
  wave: /wave|greet|hello|salute|bye/i,
  point: /point|aim|direct|instruct/i,
  spin: /spin|twirl|turn|dance/i,
  jump: /jump|hop|leap/i,
};

const IDLE_CLIP_PATTERN = /idle|breath|loop|dance|groove|sway|standing/i;

interface Gesture {
  type: StageMove;
  start: number;
  duration: number;
}

interface AvatarJoints {
  hips: Group;
  torso: Group;
  head: Group;
  leftShoulder: Group;
  leftElbow: Group;
  rightShoulder: Group;
  rightElbow: Group;
  leftHip: Group;
  leftKnee: Group;
  rightHip: Group;
  rightKnee: Group;
}

const BAR_COUNT = 64;
const INNER_BAR_COUNT = 40;
const WAVE_POINTS = 96;

/**
 * A self-contained live stage: an articulated 3D performer, a spectrum crown,
 * waveform halos and a beat-reactive floor driven by the master analyser.
 *
 * The renderer is loaded only when this component is mounted, so the Studio
 * does not pay for Three.js on every surface. When WebGL is unavailable the
 * component keeps its HUD and controls usable and explains the fallback rather
 * than leaving a blank canvas.
 */
@Component({
  selector: "app-visual-stage",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./visual-stage.component.html",
  styleUrls: ["./visual-stage.component.css"],
})
export class VisualStageComponent implements AfterViewInit, OnDestroy {
  private readonly music = inject(MusicManagerService);
  private readonly zone = inject(NgZone);
  private readonly library = inject(CharacterLibraryService);

  @ViewChild("surface", { static: true })
  private surfaceRef!: ElementRef<HTMLCanvasElement>;

  /** Shows a back control when the stage is presented as a full-screen view. */
  @Input() dismissible = false;
  @Output() readonly dismiss = new EventEmitter<void>();

  readonly playing = this.music.engine.isPlaying;
  readonly bpm = computed(() => Math.round(this.music.engine.tempo()));
  readonly mood = signal<StageMood>("groove");
  readonly palette = signal<StagePalette>("teal");
  readonly autoOrbit = signal(true);
  readonly particlesOn = signal(true);
  readonly ready = signal(false);
  readonly fallbackReason = signal("");
  readonly energyPct = signal(0);
  readonly beatPct = signal(0);
  readonly lastGesture = signal<StageMove | null>(null);
  readonly importedCharacter = signal(false);
  readonly characterName = signal("");
  readonly characterStatus = signal("");
  readonly characterError = signal(false);
  readonly characterLoading = signal(false);
  readonly savedModels = this.library.models;
  readonly libraryAvailable = this.library.available;
  readonly libraryOpen = signal(false);
  readonly dragActive = signal(false);
  readonly savedCount = computed(() => this.savedModels().length);
  readonly moodLabel = computed(() => MOOD_LABELS[this.mood()]);
  readonly paletteLabel = computed(() => PALETTE_LABELS[this.palette()]);
  readonly modelLabel = computed(() =>
    this.importedCharacter() ? "CUSTOM" : "IMPORT GLB",
  );
  readonly gestureLabel = computed(() => {
    const gesture = this.lastGesture();
    return gesture ? GESTURE_LABELS[gesture] : "Ready";
  });
  readonly moves = MOVES;

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.libraryOpen()) {
      this.libraryOpen.set(false);
      return;
    }
    if (this.dismissible) this.dismiss.emit();
  }

  private readonly reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  private three: ThreeModule | null = null;
  private renderer: Renderer | null = null;
  private scene: Scene | null = null;
  private camera: Camera | null = null;
  private avatar: Group | null = null;
  private joints: AvatarJoints | null = null;
  private backgroundColor: Color | null = null;
  private fog: Fog | null = null;
  private floorMaterial: Material | null = null;
  private keyLight: SpotLight | null = null;
  private rimLight: PointLight | null = null;
  private fillLight: PointLight | null = null;
  private bars: Instanced | null = null;
  private innerBars: Instanced | null = null;
  private barMaterial: BasicMaterial | null = null;
  private innerBarMaterial: BasicMaterial | null = null;
  private waveLine: Line | null = null;
  private waveMaterial: import("three").LineBasicMaterial | null = null;
  private innerWave: Line | null = null;
  private innerWaveMaterial: import("three").LineBasicMaterial | null = null;
  private particles: Points | null = null;
  private particleMaterial: import("three").PointsMaterial | null = null;
  private particlePositions: Float32Array | null = null;
  private particleSpeeds: Float32Array | null = null;
  private wavePositions: Float32Array | null = null;
  private innerWavePositions: Float32Array | null = null;
  private halo: Mesh | null = null;
  private innerHalo: Mesh | null = null;
  private haloMaterial: BasicMaterial | null = null;
  private innerHaloMaterial: BasicMaterial | null = null;
  private readonly ringMeshes: Mesh[] = [];
  private readonly ringMaterials: BasicMaterial[] = [];
  private readonly primaryMaterials: Material[] = [];
  private readonly accentMaterials: Material[] = [];
  private readonly primaryBasics: ColorMaterial[] = [];
  private readonly accentBasics: ColorMaterial[] = [];
  private barDummy: Object3D | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private frameId = 0;
  private destroyed = false;
  private inView = true;
  private pageVisible = true;
  private lastFrame = 0;
  private elapsed = 0;
  private beatClock = 0;
  private energy = 0;
  private visualEnergy = 0;
  private pulse = 0;
  private hudClock = 0;
  private gesture: Gesture | null = null;
  private readonly barValues = new Float32Array(BAR_COUNT);
  private readonly innerBarValues = new Float32Array(INNER_BAR_COUNT);
  private readonly waveValues = new Float32Array(WAVE_POINTS);
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private timeDomainData: Uint8Array<ArrayBuffer> | null = null;
  private raycaster: Raycaster | null = null;
  private pointerNdc: Vector2 | null = null;

  private importedWrapper: Group | null = null;
  private importedModel: Object3D | null = null;
  private mixer: AnimationMixer | null = null;
  private idleAction: AnimationAction | null = null;
  private gestureAction: AnimationAction | null = null;
  private readonly moveActions = new Map<StageMove, AnimationAction>();
  private importToken = 0;
  private characterStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private dragDepth = 0;

  /** Bounds of the imported performer, used to reframe the stage as it resizes. */
  private stageExtents: StageExtents | null = null;
  private frameRadius = DEFAULT_ORBIT_RADIUS;
  private minOrbitRadius = MIN_ORBIT_RADIUS;
  private maxOrbitRadius = MAX_ORBIT_RADIUS;

  private readonly orbit = {
    azimuth: 0.34,
    polar: 1.33,
    radius: DEFAULT_ORBIT_RADIUS,
  };
  private readonly smoothOrbit = {
    azimuth: 0.34,
    polar: 1.33,
    radius: DEFAULT_ORBIT_RADIUS,
  };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragPointer: number | null = null;
  private dragDistance = 0;
  private pinchDistance = 0;

  constructor() {
    this.autoOrbit.set(!this.reducedMotion);
    this.pageVisible =
      typeof document === "undefined" || document.visibilityState !== "hidden";
  }

  ngAfterViewInit(): void {
    this.observeLayout();
    void this.library.refresh();
    void this.initialize3d();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.importToken += 1;
    if (this.characterStatusTimer) clearTimeout(this.characterStatusTimer);
    this.removeImportedModel();
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  cycleMood(): void {
    const index = MOODS.indexOf(this.mood());
    this.mood.set(MOODS[(index + 1) % MOODS.length]);
    this.triggerMove(this.mood() === "hype" ? "jump" : "wave");
  }

  cyclePalette(): void {
    const palettes = Object.keys(PALETTES) as StagePalette[];
    const index = palettes.indexOf(this.palette());
    this.palette.set(palettes[(index + 1) % palettes.length]);
    this.applyPalette();
  }

  toggleAutoOrbit(): void {
    this.autoOrbit.update((value) => !value);
  }

  toggleParticles(): void {
    this.particlesOn.update((value) => !value);
    if (this.particles) this.particles.visible = this.particlesOn();
  }

  resetCamera(): void {
    this.orbit.azimuth = 0.34;
    this.orbit.polar = 1.33;
    this.orbit.radius = this.frameRadius;
    this.autoOrbit.set(!this.reducedMotion);
    this.pointers.clear();
    this.dragPointer = null;
  }

  /**
   * Frame the stage around a performer, or restore the built-in view when given
   * null. The built-in performer keeps the stage's default distance; an import
   * that overflows the performer slot — a sofa is nearly three times wider than
   * it is tall — pulls the camera back until the whole model fits.
   */
  private frameStage(extents: StageExtents | null): void {
    this.stageExtents = extents;
    const distance = this.framedRadius();
    const limits = orbitLimitsFor(distance);
    this.frameRadius = distance;
    this.minOrbitRadius = limits.min;
    this.maxOrbitRadius = limits.max;
    this.orbit.radius = distance;
    this.smoothOrbit.radius = distance;
    this.applyStageDepth();
  }

  private framedRadius(): number {
    const camera = this.camera;
    if (!this.stageExtents || !camera) return DEFAULT_ORBIT_RADIUS;
    const distance = stageCameraDistance(
      this.stageExtents,
      camera.fov,
      camera.aspect,
    );
    // Never move closer than the stage's own view: a performer that already
    // fits should look exactly as it always has.
    return Math.max(DEFAULT_ORBIT_RADIUS, distance);
  }

  /** Keep the fog behind the performer when the camera has to pull back. */
  private applyStageDepth(): void {
    if (!this.fog) return;
    const { near, far } = stageFogRange(this.frameRadius);
    this.fog.near = near;
    this.fog.far = far;
  }

  /**
   * A narrower stage needs a longer view for a wide performer, so the framed
   * distance follows the canvas — unless the artist has zoomed away from it.
   */
  private refitStageToViewport(): void {
    if (!this.stageExtents || !this.camera) return;
    const wasFramed = Math.abs(this.orbit.radius - this.frameRadius) < 0.01;
    const distance = this.framedRadius();
    const limits = orbitLimitsFor(distance);
    this.frameRadius = distance;
    this.minOrbitRadius = limits.min;
    this.maxOrbitRadius = limits.max;
    if (wasFramed) {
      this.orbit.radius = distance;
      this.smoothOrbit.radius = distance;
    } else {
      this.orbit.radius = this.clamp(this.orbit.radius, limits.min, limits.max);
    }
    this.applyStageDepth();
  }

  onCharacterFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void this.importCharacter(file);
  }

  onDragEnter(event: DragEvent): void {
    if (!this.hasDraggedFiles(event)) return;
    event.preventDefault();
    this.dragDepth += 1;
    this.dragActive.set(true);
  }

  onDragOver(event: DragEvent): void {
    if (!this.hasDraggedFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  onDragLeave(event: DragEvent): void {
    if (!this.dragActive()) return;
    if (this.hasDraggedFiles(event)) event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    if (!this.dragActive() && !this.hasDraggedFiles(event)) return;
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    this.resetDrag();
    if (file) void this.importCharacter(file);
  }

  toggleLibrary(): void {
    this.libraryOpen.update((open) => !open);
    if (this.libraryOpen()) void this.library.refresh();
  }

  async useSavedCharacter(model: SavedCharacterModel): Promise<void> {
    if (this.characterLoading()) return;
    const file = await this.library.load(model.id);
    if (this.destroyed) return;
    if (!file) {
      this.setCharacterStatus(
        "That saved performer could not be read from this browser.",
        true,
      );
      return;
    }
    this.libraryOpen.set(false);
    await this.importCharacter(file);
  }

  async removeSavedCharacter(model: SavedCharacterModel): Promise<void> {
    await this.library.remove(model.id);
    if (this.destroyed) return;
    this.setCharacterStatus(`Removed ${model.name} from the library.`);
  }

  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async importCharacter(file: File): Promise<void> {
    const problem = this.characterFileError(file);
    if (problem) {
      this.setCharacterStatus(problem, true);
      return;
    }
    if (!this.ready() || !this.avatar) {
      this.setCharacterStatus(
        "The 3D stage is unavailable, so the character cannot be mounted.",
        true,
      );
      return;
    }

    const token = ++this.importToken;
    this.characterLoading.set(true);
    this.setCharacterStatus("IMPORTING CHARACTER…", false, false);

    try {
      const buffer = await file.arrayBuffer();
      if (token !== this.importToken || this.destroyed) return;
      const { GLTFLoader } =
        await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (token !== this.importToken || this.destroyed) return;
      const gltf = await new Promise<Gltf>((resolve, reject) => {
        new GLTFLoader().parse(buffer, "", resolve, reject);
      });
      if (token !== this.importToken || this.destroyed) {
        this.disposeObject(gltf.scene);
        return;
      }
      const clipCount = this.mountCharacter(gltf, file.name);
      // Saved after mounting so the library never lists a model the stage
      // refused to render, and so the entry can carry its own portrait.
      const thumbnail = this.captureCharacterThumbnail();
      void this.library.save(file, clipCount, thumbnail ?? undefined);
    } catch (error) {
      if (token !== this.importToken || this.destroyed) return;
      const message = error instanceof Error ? error.message : "";
      this.setCharacterStatus(
        /draco|meshopt/i.test(message)
          ? "This GLB uses compression. Export an uncompressed GLB, then try again."
          : "Could not read that GLB. Try a rigged, uncompressed .glb file.",
        true,
      );
    } finally {
      if (token === this.importToken) this.characterLoading.set(false);
    }
  }

  restoreBuiltIn(): void {
    this.importToken += 1;
    this.characterLoading.set(false);
    this.removeImportedModel();
    this.frameStage(null);
    this.importedCharacter.set(false);
    this.characterName.set("");
    this.lastGesture.set(null);
    this.gesture = null;
    this.setCharacterStatus("BUILT-IN PERFORMER");
  }

  triggerMove(move?: StageMove): void {
    const type =
      move ?? MOVES[Math.floor(Math.random() * MOVES.length)]?.id ?? "wave";
    const durations: Record<StageMove, number> = {
      wave: 2.2,
      point: 1.8,
      spin: 1.35,
      jump: 1.0,
    };
    this.gesture = {
      type,
      start: this.elapsed,
      duration: durations[type],
    };
    this.lastGesture.set(type);
    this.playCharacterMove(type);
  }

  onPointerDown(event: PointerEvent): void {
    const canvas = this.surfaceRef.nativeElement;
    canvas.focus({ preventScroll: true });
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    this.dragDistance = 0;
    this.dragPointer = event.pointerId;
    this.autoOrbit.set(false);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is unavailable in some webviews. */
    }
    if (this.pointers.size === 2) {
      this.pinchDistance = this.pointerDistance();
      this.dragPointer = null;
    }
  }

  onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (this.pointers.size >= 2) {
      const nextDistance = this.pointerDistance();
      if (this.pinchDistance > 0) {
        const ratio = this.pinchDistance / Math.max(1, nextDistance);
        this.orbit.radius = this.clamp(
          this.orbit.radius * ratio,
          this.minOrbitRadius,
          this.maxOrbitRadius,
        );
      }
      this.pinchDistance = nextDistance;
      return;
    }

    if (this.dragPointer !== event.pointerId) return;
    this.dragDistance += Math.abs(dx) + Math.abs(dy);
    this.orbit.azimuth -= dx * 0.007;
    this.orbit.polar = this.clamp(this.orbit.polar + dy * 0.005, 0.72, 1.52);
  }

  onPointerUp(event: PointerEvent): void {
    const wasTap =
      this.pointers.size === 1 &&
      this.dragPointer === event.pointerId &&
      this.dragDistance < 8;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) {
      this.dragPointer = null;
      this.pinchDistance = 0;
    }
    if (wasTap) this.pickAvatar(event);
  }

  onPointerCancel(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (this.pointers.size === 0) this.dragPointer = null;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.orbit.radius = this.clamp(
      this.orbit.radius + event.deltaY * 0.0025,
      this.minOrbitRadius,
      this.maxOrbitRadius,
    );
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        this.orbit.azimuth += 0.16;
        this.autoOrbit.set(false);
        break;
      case "ArrowRight":
        event.preventDefault();
        this.orbit.azimuth -= 0.16;
        this.autoOrbit.set(false);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.orbit.polar = this.clamp(this.orbit.polar - 0.08, 0.72, 1.52);
        break;
      case "ArrowDown":
        event.preventDefault();
        this.orbit.polar = this.clamp(this.orbit.polar + 0.08, 0.72, 1.52);
        break;
      case "+":
      case "=":
        event.preventDefault();
        this.orbit.radius = this.clamp(
          this.orbit.radius - 0.4,
          this.minOrbitRadius,
          this.maxOrbitRadius,
        );
        break;
      case "-":
        event.preventDefault();
        this.orbit.radius = this.clamp(
          this.orbit.radius + 0.4,
          this.minOrbitRadius,
          this.maxOrbitRadius,
        );
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        this.triggerMove();
        break;
      case "Escape":
        if (this.dismissible) {
          event.preventDefault();
          this.dismiss.emit();
        }
        break;
      default:
        break;
    }
  }

  private characterFileError(file: File): string | null {
    const isGlb =
      file.name.toLowerCase().endsWith(".glb") ||
      file.type === "model/gltf-binary";
    if (!isGlb) {
      return "Choose a .glb file. A .gltf file often needs external textures and buffers.";
    }
    if (file.size === 0) return "That GLB is empty.";
    if (file.size > MAX_CHARACTER_BYTES) {
      return "That GLB is larger than 30 MB. Compress the model or remove unused textures.";
    }
    return null;
  }

  private hasDraggedFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    return !!types && Array.from(types).includes("Files");
  }

  private resetDrag(): void {
    this.dragDepth = 0;
    this.dragActive.set(false);
  }

  private async initialize3d(): Promise<void> {
    try {
      const THREE = await import("three");
      if (this.destroyed) return;
      this.three = THREE;
      this.buildStage(THREE);
      this.ready.set(true);
      this.lastFrame = performance.now();
      this.zone.runOutsideAngular(() => {
        this.frameId = requestAnimationFrame(this.frame);
      });
    } catch {
      this.fallbackReason.set(
        "The 3D stage needs WebGL. Your browser or device has not exposed a usable graphics context.",
      );
    }
  }

  private buildStage(THREE: ThreeModule): void {
    const canvas = this.surfaceRef.nativeElement;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const palette = PALETTES[this.palette()];
    const background = new THREE.Color(palette.background);
    const fogRange = stageFogRange(DEFAULT_ORBIT_RADIUS);
    const fog = new THREE.Fog(palette.fog, fogRange.near, fogRange.far);
    scene.background = background;
    scene.fog = fog;
    this.scene = scene;
    this.backgroundColor = background;
    this.fog = fog;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();

    this.buildLights(THREE);
    this.buildRoom(THREE);
    this.buildAvatar(THREE);
    this.buildSpectrum(THREE);
    this.buildWaveforms(THREE);
    this.buildParticles(THREE);
    this.applyPalette();
    this.resize();
    renderer.render(scene, this.camera);
  }

  private buildLights(THREE: ThreeModule): void {
    const scene = this.scene!;
    const palette = PALETTES[this.palette()];

    scene.add(new THREE.HemisphereLight(0x9cefff, 0x05070d, 1.35));

    const key = new THREE.SpotLight(
      palette.key,
      22,
      16,
      Math.PI / 5,
      0.55,
      1.1,
    );
    key.position.set(3.2, 5.6, 4.2);
    key.target.position.set(0, 1.2, 0);
    scene.add(key, key.target);
    this.keyLight = key;

    const rim = new THREE.PointLight(palette.accent, 24, 10, 1.3);
    rim.position.set(-2.9, 2.5, -2);
    scene.add(rim);
    this.rimLight = rim;

    const fill = new THREE.PointLight(palette.primary, 14, 9, 1.4);
    fill.position.set(2.5, 1.4, 2.8);
    scene.add(fill);
    this.fillLight = fill;
  }

  private buildRoom(THREE: ThreeModule): void {
    const scene = this.scene!;
    const palette = PALETTES[this.palette()];

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x07101a,
      metalness: 0.72,
      roughness: 0.42,
      emissive: palette.primary,
      emissiveIntensity: 0.06,
    });
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4.8, 72),
      floorMaterial,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    scene.add(floor);
    this.floorMaterial = floorMaterial;

    const grid = new THREE.GridHelper(18, 36, palette.primary, 0x12303a);
    grid.position.y = 0.002;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.38;
    }
    scene.add(grid);

    for (const [radius, material, opacity] of [
      [1.28, palette.primary, 0.62],
      [1.92, palette.secondary, 0.42],
      [2.7, palette.accent, 0.3],
    ] as const) {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: material,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.014, 6, 120),
        ringMaterial,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.012;
      scene.add(ring);
      this.ringMeshes.push(ring);
      this.ringMaterials.push(ringMaterial);
      this.primaryBasics.push(ringMaterial);
    }

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(2.35, 0.015, 6, 140),
      haloMaterial,
    );
    halo.position.set(0, 1.55, -1.15);
    scene.add(halo);
    this.halo = halo;
    this.haloMaterial = haloMaterial;
    this.primaryBasics.push(haloMaterial);

    const innerHaloMaterial = new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(1.82, 0.01, 6, 120),
      innerHaloMaterial,
    );
    innerHalo.position.set(0, 1.55, -1.18);
    scene.add(innerHalo);
    this.innerHalo = innerHalo;
    this.innerHaloMaterial = innerHaloMaterial;
    this.accentBasics.push(innerHaloMaterial);

    for (const [x, color] of [
      [-2.8, palette.primary],
      [2.8, palette.accent],
    ] as const) {
      const barMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 4.2, 0.035),
        barMaterial,
      );
      bar.position.set(x, 2.05, -1.7);
      scene.add(bar);
      if (x < 0) this.primaryBasics.push(barMaterial);
      else this.accentBasics.push(barMaterial);
    }
  }

  private buildAvatar(THREE: ThreeModule): void {
    const scene = this.scene!;
    const palette = PALETTES[this.palette()];
    const suit = new THREE.MeshStandardMaterial({
      color: 0x151b2c,
      metalness: 0.7,
      roughness: 0.3,
    });
    const panel = new THREE.MeshStandardMaterial({
      color: 0x222b45,
      metalness: 0.55,
      roughness: 0.38,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: palette.primary,
      emissive: palette.primary,
      emissiveIntensity: 1.9,
      metalness: 0.4,
      roughness: 0.24,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 2.2,
      metalness: 0.3,
      roughness: 0.24,
    });
    const visor = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      toneMapped: false,
    });
    const bootSole = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.9,
    });

    this.primaryMaterials.push(trim);
    this.accentMaterials.push(accent);
    this.primaryBasics.push(visor);
    this.accentBasics.push(bootSole);

    const root = new THREE.Group();
    root.name = "stage-performer";
    scene.add(root);
    this.avatar = root;

    const hips = new THREE.Group();
    hips.position.y = 0.93;
    root.add(hips);

    const hipMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.19, 0.16, 6, 14),
      suit,
    );
    hips.add(hipMesh);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.25), panel);
    belt.position.y = 0.04;
    hips.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.035, 0.02),
      accent,
    );
    buckle.position.set(0, 0.04, 0.14);
    hips.add(buckle);

    const torso = new THREE.Group();
    torso.position.y = 0.07;
    hips.add(torso);

    const torsoMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.27, 0.38, 7, 18),
      suit,
    );
    torsoMesh.position.y = 0.36;
    torso.add(torsoMesh);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.24, 0.06),
      panel,
    );
    chest.position.set(0, 0.43, 0.23);
    torso.add(chest);

    for (const [y, width, material] of [
      [0.49, 0.24, trim],
      [0.43, 0.18, accent],
      [0.37, 0.12, trim],
    ] as const) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.012, 0.012),
        material,
      );
      light.position.set(0, y, 0.266);
      torso.add(light);
    }

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.014, 6, 24),
      trim,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.82;
    torso.add(collar);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10),
      panel,
    );
    neck.position.y = 0.91;
    torso.add(neck);

    const head = new THREE.Group();
    head.position.y = 1.04;
    torso.add(head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.245, 24, 18), suit);
    skull.scale.set(1, 1.04, 0.94);
    head.add(skull);

    const visorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.075, 0.06),
      visor,
    );
    visorMesh.position.set(0, 0.02, 0.238);
    head.add(visorMesh);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.05, 14),
        panel,
      );
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.235, 0.01, 0);
      head.add(ear);

      const earLight = new THREE.Mesh(
        new THREE.TorusGeometry(0.052, 0.009, 6, 16),
        side < 0 ? accent : trim,
      );
      earLight.position.set(side * 0.262, 0.01, 0);
      earLight.rotation.y = Math.PI / 2;
      head.add(earLight);
    }

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.012, 0.18, 6),
      trim,
    );
    antenna.position.set(0.08, 0.3, 0);
    antenna.rotation.z = -0.18;
    head.add(antenna);

    const antennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 10, 8),
      accent,
    );
    antennaTip.position.set(0.095, 0.39, 0);
    head.add(antennaTip);

    const buildArm = (side: -1 | 1): { shoulder: Group; elbow: Group } => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.345, 0.67, 0);
      torso.add(shoulder);

      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), panel);
      shoulder.add(pad);

      const upperArm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.082, 0.26, 6, 12),
        suit,
      );
      upperArm.position.y = -0.22;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -0.43;
      shoulder.add(elbow);

      const forearm = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.25, 6, 12),
        suit,
      );
      forearm.position.y = -0.2;
      elbow.add(forearm);

      const cuff = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.01, 6, 18),
        side < 0 ? trim : accent,
      );
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.36;
      elbow.add(cuff);

      const hand = new THREE.Group();
      hand.position.y = -0.41;
      elbow.add(hand);

      const palm = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 10),
        panel,
      );
      palm.scale.set(0.9, 1.1, 0.75);
      hand.add(palm);

      if (side > 0) {
        const mic = new THREE.Group();
        mic.position.set(0, -0.04, 0.08);
        mic.rotation.x = -0.55;
        hand.add(mic);

        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.026, 0.18, 10),
          suit,
        );
        mic.add(handle);

        const micHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 12, 10),
          accent,
        );
        micHead.position.y = 0.11;
        micHead.scale.set(1, 0.8, 1);
        mic.add(micHead);
      }

      return { shoulder, elbow };
    };

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

    const buildLeg = (side: -1 | 1): { hip: Group; knee: Group } => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.17, 0, 0);
      hips.add(hip);

      const thigh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.105, 0.32, 6, 12),
        suit,
      );
      thigh.position.y = -0.22;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);

      const shin = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.092, 0.3, 6, 12),
        panel,
      );
      shin.position.y = -0.2;
      knee.add(shin);

      const shinLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.22, 0.018),
        side < 0 ? trim : accent,
      );
      shinLight.position.set(side * 0.085, -0.18, 0.04);
      shinLight.rotation.z = side * 0.08;
      knee.add(shinLight);

      const foot = new THREE.Group();
      foot.position.set(0, -0.4, 0.02);
      knee.add(foot);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.3), suit);
      boot.position.set(0, -0.02, 0.065);
      foot.add(boot);

      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.175, 0.018, 0.31),
        bootSole,
      );
      sole.position.set(0, -0.085, 0.065);
      foot.add(sole);

      return { hip, knee };
    };

    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);

    this.joints = {
      hips,
      torso,
      head,
      leftShoulder: leftArm.shoulder,
      leftElbow: leftArm.elbow,
      rightShoulder: rightArm.shoulder,
      rightElbow: rightArm.elbow,
      leftHip: leftLeg.hip,
      leftKnee: leftLeg.knee,
      rightHip: rightLeg.hip,
      rightKnee: rightLeg.knee,
    };
  }

  private mountCharacter(gltf: Gltf, fileName: string): number {
    const three = this.three;
    const avatar = this.avatar;
    if (!three || !avatar) {
      this.disposeObject(gltf.scene);
      throw new Error("The stage has no character slot.");
    }

    this.removeImportedModel();

    try {
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const bounds = new three.Box3().setFromObject(model);
      const size = bounds.getSize(new three.Vector3());
      if (!Number.isFinite(size.y) || size.y < 0.001) {
        throw new Error("The GLB has no visible geometry.");
      }

      // glTF exporters use centimetres, metres and everything between. Fit the
      // character to the stage's performer slot rather than guessing a scale.
      model.scale.multiplyScalar(CHARACTER_HEIGHT / size.y);
      model.updateMatrixWorld(true);
      bounds.setFromObject(model);
      const centre = bounds.getCenter(new three.Vector3());
      const framed = bounds.getSize(new three.Vector3());
      model.position.x -= centre.x;
      model.position.z -= centre.z;
      model.position.y -= bounds.min.y;
      model.traverse((child) => {
        child.frustumCulled = false;
      });

      const wrapper = new three.Group();
      wrapper.name = "imported-performer";
      wrapper.add(model);
      avatar.add(wrapper);
      this.importedWrapper = wrapper;
      this.importedModel = model;
      this.frameStage(framed);

      const clipCount = this.setupCharacterAnimations(gltf);
      if (this.joints) this.joints.hips.visible = false;
      this.importedCharacter.set(true);
      const name = fileName.replace(/\.glb$/i, "");
      this.characterName.set(name);
      this.lastGesture.set(null);
      this.gesture = null;
      this.setCharacterStatus(
        clipCount > 0
          ? `${name} · ${clipCount} CLIPS`
          : `${name} · STATIC MODEL`,
      );
      return clipCount;
    } catch (error) {
      this.removeImportedModel();
      this.frameStage(null);
      throw error;
    }
  }

  private setupCharacterAnimations(gltf: Gltf): number {
    const three = this.three;
    const clips = gltf.animations ?? [];
    if (!three || clips.length === 0) return 0;

    const mixer = new three.AnimationMixer(gltf.scene);
    this.mixer = mixer;
    const used = new Set<AnimationAction>();

    const idleClip = clips.find((clip) => IDLE_CLIP_PATTERN.test(clip.name));
    if (idleClip) {
      this.idleAction = mixer.clipAction(idleClip);
      this.idleAction.setLoop(three.LoopRepeat, Infinity).play();
      used.add(this.idleAction);
    }

    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      if (used.has(action)) continue;
      const move = (
        Object.entries(MOVE_CLIP_PATTERNS) as [StageMove, RegExp][]
      ).find(([type, pattern]) => {
        return !this.moveActions.has(type) && pattern.test(clip.name);
      })?.[0];
      if (move) {
        this.moveActions.set(move, action);
        used.add(action);
      }
    }

    if (!this.idleAction) {
      const ambient = clips
        .map((clip) => mixer.clipAction(clip))
        .find((action) => !used.has(action));
      if (ambient) {
        this.idleAction = ambient;
        ambient.setLoop(three.LoopRepeat, Infinity).play();
        used.add(ambient);
      }
    }

    mixer.addEventListener("finished", (event) => {
      const finished = (event as { action?: AnimationAction }).action;
      if (!finished || finished !== this.gestureAction) return;
      this.gestureAction = null;
      this.gesture = null;
      this.idleAction?.reset().fadeIn(0.25).play();
    });

    return used.size;
  }

  private playCharacterMove(type: StageMove): void {
    const action = this.moveActions.get(type);
    if (!action || !this.three) return;

    if (this.gestureAction && this.gestureAction !== action) {
      this.gestureAction.fadeOut(0.1);
    }
    if (this.idleAction && this.idleAction !== action) {
      this.idleAction.fadeOut(0.15);
    }
    action.reset();
    action.setLoop(this.three.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.fadeIn(this.reducedMotion ? 0 : 0.12).play();
    this.gestureAction = action;
  }

  private animateImported(delta: number): void {
    const wrapper = this.importedWrapper;
    if (!wrapper) return;

    this.mixer?.update(delta);
    wrapper.position.set(0, 0, 0);
    wrapper.rotation.set(0, 0, 0);

    const energy = this.visualEnergy;
    const pulse = this.pulse;
    const beat = this.beatClock;

    if (this.gestureAction) {
      wrapper.position.y = pulse * 0.012;
      return;
    }

    if (!this.reducedMotion) {
      wrapper.position.y =
        Math.abs(Math.sin(beat * Math.PI)) * (0.01 + energy * 0.035);
      wrapper.rotation.y =
        Math.sin(beat * Math.PI * 0.5) * (0.018 + energy * 0.02);
    }

    if (!this.gesture) return;
    const progress =
      (this.elapsed - this.gesture.start) / this.gesture.duration;
    if (progress >= 1) {
      this.gesture = null;
      return;
    }
    this.applyImportedGesture(progress);
  }

  private applyImportedGesture(progress: number): void {
    const wrapper = this.importedWrapper;
    const gesture = this.gesture;
    if (!wrapper || !gesture) return;
    const envelope = Math.sin(Math.min(1, progress) * Math.PI);

    switch (gesture.type) {
      case "wave":
        wrapper.rotation.z =
          Math.sin(progress * Math.PI * 12) * 0.07 * envelope;
        wrapper.rotation.x = -0.04 * envelope;
        break;
      case "point":
        wrapper.rotation.y = 0.42 * envelope;
        wrapper.rotation.x = -0.08 * envelope;
        break;
      case "spin":
        wrapper.rotation.y = progress * Math.PI * 2;
        break;
      case "jump":
        wrapper.position.y += Math.sin(progress * Math.PI) * 0.42;
        break;
      default:
        break;
    }
  }

  private removeImportedModel(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.importedModel) this.mixer.uncacheRoot(this.importedModel);
      this.mixer = null;
    }
    this.idleAction = null;
    this.gestureAction = null;
    this.moveActions.clear();

    if (this.importedWrapper) {
      this.avatar?.remove(this.importedWrapper);
      this.disposeObject(this.importedWrapper);
    }
    this.importedWrapper = null;
    this.importedModel = null;
    if (this.joints) this.joints.hips.visible = true;
  }

  private disposeObject(root: Object3D): void {
    root.traverse((child) => {
      const renderable = child as unknown as {
        geometry?: { dispose?: () => void };
        material?: import("three").Material | import("three").Material[];
      };
      renderable.geometry?.dispose?.();
      if (!renderable.material) return;
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      for (const material of materials) {
        if (!material) continue;
        const textures = material as unknown as Record<
          string,
          import("three").Texture | null | undefined
        >;
        for (const key of [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
          "emissiveMap",
          "alphaMap",
          "aoMap",
          "envMap",
        ]) {
          textures[key]?.dispose();
        }
        material.dispose();
      }
    });
  }

  /**
   * Render a square portrait of the imported performer without disturbing the
   * live canvas: the stage is drawn into a small offscreen target with every
   * prop hidden, then the pixels are read back into a 2D canvas.
   */
  private captureCharacterThumbnail(): string | null {
    const three = this.three;
    const renderer = this.renderer;
    const scene = this.scene;
    const wrapper = this.importedWrapper;
    if (!three || !renderer || !scene || !wrapper) return null;

    const bounds = new three.Box3().setFromObject(wrapper);
    const size = bounds.getSize(new three.Vector3());
    const centre = bounds.getCenter(new three.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) return null;

    const camera = new three.PerspectiveCamera(32, 1, 0.05, 60);
    const distance = portraitCameraDistance(size, camera.fov);
    camera.position.set(centre.x, centre.y, centre.z + distance);
    camera.lookAt(centre);

    const hidden: Object3D[] = [];
    for (const child of scene.children) {
      const light = (child as { isLight?: boolean }).isLight;
      if (child === this.avatar || light || !child.visible) continue;
      child.visible = false;
      hidden.push(child);
    }

    const target = new three.WebGLRenderTarget(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    target.texture.colorSpace = three.SRGBColorSpace;
    const pixels = new Uint8Array(THUMBNAIL_SIZE * THUMBNAIL_SIZE * 4);
    let url: string | null = null;
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(
        target,
        0,
        0,
        THUMBNAIL_SIZE,
        THUMBNAIL_SIZE,
        pixels,
      );
      url = this.thumbnailFromPixels(pixels);
    } catch {
      url = null;
    } finally {
      renderer.setRenderTarget(null);
      for (const child of hidden) child.visible = true;
      target.dispose();
    }
    return url;
  }

  private thumbnailFromPixels(pixels: Uint8Array): string | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const image = context.createImageData(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    const rowBytes = THUMBNAIL_SIZE * 4;
    // WebGL reads bottom-up; a 2D canvas expects top-down rows.
    for (let y = 0; y < THUMBNAIL_SIZE; y += 1) {
      const source = (THUMBNAIL_SIZE - 1 - y) * rowBytes;
      image.data.set(pixels.subarray(source, source + rowBytes), y * rowBytes);
    }
    context.putImageData(image, 0, 0);
    const url = canvas.toDataURL("image/webp", 0.85);
    return url.startsWith("data:image/") ? url : null;
  }

  private setCharacterStatus(
    message: string,
    error = false,
    autoHide = !error,
  ): void {
    if (this.characterStatusTimer) {
      clearTimeout(this.characterStatusTimer);
      this.characterStatusTimer = null;
    }
    this.characterError.set(error);
    this.characterStatus.set(message);
    if (!autoHide) return;
    this.characterStatusTimer = setTimeout(() => {
      this.characterStatus.set("");
      this.characterError.set(false);
      this.characterStatusTimer = null;
    }, 4500);
  }

  private buildSpectrum(THREE: ThreeModule): void {
    const scene = this.scene!;
    const palette = PALETTES[this.palette()];

    const barMaterial = new THREE.MeshBasicMaterial({
      color: palette.primary,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.055, 1, 0.055),
      barMaterial,
      BAR_COUNT,
    );
    bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bars.frustumCulled = false;
    scene.add(bars);
    this.bars = bars;
    this.barMaterial = barMaterial;
    this.primaryBasics.push(barMaterial);

    const innerBarMaterial = new THREE.MeshBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerBars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.035, 1, 0.035),
      innerBarMaterial,
      INNER_BAR_COUNT,
    );
    innerBars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    innerBars.frustumCulled = false;
    scene.add(innerBars);
    this.innerBars = innerBars;
    this.innerBarMaterial = innerBarMaterial;
    this.accentBasics.push(innerBarMaterial);
  }

  private buildWaveforms(THREE: ThreeModule): void {
    const scene = this.scene!;
    const palette = PALETTES[this.palette()];

    const outerPositions = new Float32Array(WAVE_POINTS * 3);
    const outerGeometry = new THREE.BufferGeometry();
    outerGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(outerPositions, 3),
    );
    const waveMaterial = new THREE.LineBasicMaterial({
      color: palette.secondary,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const waveLine = new THREE.Line(outerGeometry, waveMaterial);
    waveLine.position.y = 0.42;
    scene.add(waveLine);
    this.waveLine = waveLine;
    this.waveMaterial = waveMaterial;
    this.wavePositions = outerPositions;
    this.primaryBasics.push(waveMaterial);

    const innerPositions = new Float32Array(WAVE_POINTS * 3);
    const innerGeometry = new THREE.BufferGeometry();
    innerGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(innerPositions, 3),
    );
    const innerWaveMaterial = new THREE.LineBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerWave = new THREE.Line(innerGeometry, innerWaveMaterial);
    innerWave.position.y = 0.82;
    scene.add(innerWave);
    this.innerWave = innerWave;
    this.innerWaveMaterial = innerWaveMaterial;
    this.innerWavePositions = innerPositions;
    this.accentBasics.push(innerWaveMaterial);
  }

  private buildParticles(THREE: ThreeModule): void {
    const scene = this.scene!;
    const palette = PALETTES[this.palette()];
    const count = 280;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.7 + Math.random() * 3.8;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.random() * 5;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speeds[i] = 0.12 + Math.random() * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: palette.secondary,
      size: 0.035,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    this.particles = points;
    this.particleMaterial = material;
    this.particlePositions = positions;
    this.particleSpeeds = speeds;
    this.primaryBasics.push(material);
  }

  private applyPalette(): void {
    const palette = PALETTES[this.palette()];
    this.backgroundColor?.set(palette.background);
    this.fog?.color.set(palette.fog);

    for (const material of this.primaryMaterials) {
      material.color.set(palette.primary);
      material.emissive.set(palette.primary);
    }
    for (const material of this.accentMaterials) {
      material.color.set(palette.accent);
      material.emissive.set(palette.accent);
    }
    for (const material of this.primaryBasics) {
      material.color.set(palette.primary);
    }
    for (const material of this.accentBasics) {
      material.color.set(palette.accent);
    }

    if (this.barMaterial) this.barMaterial.color.set(palette.primary);
    if (this.innerBarMaterial) {
      this.innerBarMaterial.color.set(palette.secondary);
    }
    if (this.waveMaterial) this.waveMaterial.color.set(palette.secondary);
    if (this.innerWaveMaterial) {
      this.innerWaveMaterial.color.set(palette.accent);
    }
    if (this.particleMaterial) {
      this.particleMaterial.color.set(palette.secondary);
    }
    this.floorMaterial?.emissive.set(palette.primary);
    this.keyLight?.color.set(palette.key);
    this.rimLight?.color.set(palette.accent);
    this.fillLight?.color.set(palette.primary);
  }

  private readonly frame = (now: number): void => {
    this.frameId = requestAnimationFrame(this.frame);
    if (
      this.destroyed ||
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.three
    ) {
      return;
    }

    const delta = Math.min(Math.max((now - this.lastFrame) / 1000, 0), 0.05);
    this.lastFrame = now;
    if (!this.inView || !this.pageVisible) return;

    this.elapsed += delta;
    this.beatClock += delta * (this.music.engine.tempo() / 60);
    this.readAudio(delta);
    this.updateOrbit(delta);
    this.animateAvatar(delta);
    this.animateImported(delta);
    this.updateSpectrum();
    this.updateWaveforms();
    this.updateParticles(delta);
    this.updateRoom();
    this.renderer.render(this.scene, this.camera);
    this.publishHud(delta);
  };

  private readAudio(delta: number): void {
    const analyser = this.music.engine.masterAnalyser;
    let low = 0;
    let mid = 0;
    let high = 0;

    if (analyser) {
      const binCount = Math.max(1, analyser.frequencyBinCount || 1024);
      if (!this.frequencyData || this.frequencyData.length !== binCount) {
        this.frequencyData = new Uint8Array(binCount);
      }
      analyser.getByteFrequencyData(this.frequencyData);

      const lowEnd = Math.max(1, Math.floor(binCount * 0.08));
      const midEnd = Math.max(lowEnd + 1, Math.floor(binCount * 0.34));
      low = this.averageBins(this.frequencyData, 0, lowEnd);
      mid = this.averageBins(this.frequencyData, lowEnd, midEnd);
      high = this.averageBins(
        this.frequencyData,
        midEnd,
        Math.min(binCount, midEnd + 180),
      );

      const maxBin = Math.min(binCount, 260);
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const position = Math.pow(i / (BAR_COUNT - 1), 1.55);
        const index = Math.min(maxBin - 1, Math.floor(position * maxBin));
        const current = this.frequencyData[index] / 255;
        this.barValues[i] += (current - this.barValues[i]) * 0.34;
      }
      for (let i = 0; i < INNER_BAR_COUNT; i += 1) {
        const position = Math.pow(i / (INNER_BAR_COUNT - 1), 1.3);
        const index = Math.min(maxBin - 1, Math.floor(position * maxBin));
        const current = this.frequencyData[index] / 255;
        this.innerBarValues[i] += (current - this.innerBarValues[i]) * 0.28;
      }

      if (analyser.fftSize > 0) {
        if (
          !this.timeDomainData ||
          this.timeDomainData.length !== analyser.fftSize
        ) {
          this.timeDomainData = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteTimeDomainData(this.timeDomainData);
        for (let i = 0; i < WAVE_POINTS; i += 1) {
          const index = Math.floor(
            (i / (WAVE_POINTS - 1)) * (this.timeDomainData.length - 1),
          );
          this.waveValues[i] = (this.timeDomainData[index] - 128) / 128;
        }
      }
    } else {
      this.barValues.fill(0.08);
      this.innerBarValues.fill(0.06);
      this.waveValues.fill(0);
    }

    const live = Math.max(low * 1.55, mid * 1.08, high * 0.86);
    const target = this.clamp(live, 0, 1);
    const response = target > this.energy ? 15 : 4.2;
    this.energy += (target - this.energy) * Math.min(1, delta * response);
    const idle = this.playing() ? 0.11 : 0.05;
    this.visualEnergy = Math.max(this.energy, idle);

    const phase = this.beatClock % 1;
    const beat = Math.exp(-phase * 5.2);
    this.pulse = beat * (0.35 + this.visualEnergy * 0.85);
  }

  private updateOrbit(delta: number): void {
    if (this.autoOrbit() && !this.reducedMotion && this.pointers.size === 0) {
      this.orbit.azimuth += delta * 0.13;
    }

    const ease = Math.min(1, delta * 7);
    this.smoothOrbit.azimuth +=
      (this.orbit.azimuth - this.smoothOrbit.azimuth) * ease;
    this.smoothOrbit.polar +=
      (this.orbit.polar - this.smoothOrbit.polar) * ease;
    this.smoothOrbit.radius +=
      (this.orbit.radius - this.smoothOrbit.radius) * ease;

    const camera = this.camera!;
    const { azimuth, polar, radius } = this.smoothOrbit;
    const targetY = 1.24;
    camera.position.set(
      Math.sin(azimuth) * Math.sin(polar) * radius,
      targetY + Math.cos(polar) * radius,
      Math.cos(azimuth) * Math.sin(polar) * radius,
    );
    camera.lookAt(0, targetY + 0.04, 0);
  }

  private animateAvatar(delta: number): void {
    const joints = this.joints;
    const avatar = this.avatar;
    if (!joints || !avatar) return;

    const mood = this.mood();
    const energy = this.visualEnergy;
    const pulse = this.pulse;
    const beat = this.beatClock;
    const swing = Math.sin(beat * Math.PI);
    const halfSwing = Math.sin(beat * Math.PI * 0.5);
    const speed = mood === "hype" ? 1.28 : mood === "chill" ? 0.62 : 0.92;
    const lift =
      mood === "hype" ? 0.78 + energy * 0.58 : mood === "groove" ? 0.18 : 0.04;
    const bounce =
      mood === "hype"
        ? Math.abs(swing) * (0.08 + energy * 0.1)
        : mood === "groove"
          ? Math.abs(swing) * (0.025 + energy * 0.035)
          : Math.abs(swing) * 0.012;
    const amplitude = this.reducedMotion
      ? 0.4
      : mood === "hype"
        ? 1.25
        : mood === "chill"
          ? 0.55
          : 0.9;

    avatar.position.y = bounce + (mood === "hype" ? pulse * 0.015 : 0);
    avatar.position.x = halfSwing * 0.08 * amplitude;
    avatar.rotation.y = halfSwing * 0.16 * amplitude;

    joints.hips.rotation.z = swing * 0.07 * amplitude;
    joints.hips.rotation.y = halfSwing * 0.1 * amplitude;
    joints.torso.rotation.z = -swing * 0.055 * amplitude;
    joints.torso.rotation.y = -halfSwing * 0.12 * amplitude;
    joints.torso.rotation.x = -0.025 + pulse * 0.05 * amplitude;

    joints.head.rotation.y = Math.sin(beat * Math.PI * 0.5 + 0.6) * 0.16;
    joints.head.rotation.z = -swing * 0.06;
    joints.head.rotation.x = pulse * 0.04;

    const armSwing = Math.sin(beat * Math.PI + 0.4) * 0.28 * amplitude;
    joints.leftShoulder.rotation.z = -0.14 - lift - pulse * 0.03;
    joints.rightShoulder.rotation.z = 0.14 + lift + pulse * 0.03;
    joints.leftShoulder.rotation.x = armSwing;
    joints.rightShoulder.rotation.x = -armSwing;

    const bend = 0.38 + energy * 0.5;
    joints.leftElbow.rotation.x =
      -0.28 - Math.max(0, Math.sin(beat * Math.PI)) * bend;
    joints.rightElbow.rotation.x =
      -0.28 - Math.max(0, -Math.sin(beat * Math.PI)) * bend;

    const step = Math.sin(beat * Math.PI) * 0.18 * amplitude * speed;
    joints.leftHip.rotation.x = step;
    joints.rightHip.rotation.x = -step;
    joints.leftHip.rotation.z = -0.02;
    joints.rightHip.rotation.z = 0.02;
    joints.leftKnee.rotation.x = Math.max(0, -step) * 1.7 + 0.04;
    joints.rightKnee.rotation.x = Math.max(0, step) * 1.7 + 0.04;

    if (this.gesture) {
      const progress =
        (this.elapsed - this.gesture.start) / this.gesture.duration;
      if (progress >= 1) {
        this.gesture = null;
      } else {
        this.applyGesture(this.gesture.type, progress, delta);
      }
    }
  }

  private applyGesture(type: StageMove, progress: number, delta: number): void {
    const joints = this.joints;
    const avatar = this.avatar;
    if (!joints || !avatar) return;
    const envelope = Math.sin(Math.min(1, progress) * Math.PI);

    switch (type) {
      case "wave": {
        const wave = Math.sin(progress * Math.PI * 12) * 0.38;
        joints.rightShoulder.rotation.z = 2.15;
        joints.rightShoulder.rotation.x = -0.24;
        joints.rightElbow.rotation.x = -0.62 + wave;
        joints.head.rotation.z = 0.1 + wave * 0.12;
        joints.torso.rotation.y = -0.12;
        break;
      }
      case "point": {
        joints.rightShoulder.rotation.z = 1.45;
        joints.rightShoulder.rotation.x = -1.0;
        joints.rightElbow.rotation.x = -0.08;
        joints.torso.rotation.y = -0.38 * envelope;
        joints.head.rotation.y = -0.28 * envelope;
        break;
      }
      case "spin": {
        avatar.rotation.y += progress * Math.PI * 2;
        avatar.position.y += Math.sin(progress * Math.PI) * 0.18;
        joints.leftShoulder.rotation.z = -0.95;
        joints.rightShoulder.rotation.z = 0.95;
        break;
      }
      case "jump": {
        avatar.position.y += Math.sin(progress * Math.PI) * 0.46;
        joints.leftKnee.rotation.x += 0.55 * envelope;
        joints.rightKnee.rotation.x += 0.55 * envelope;
        joints.leftShoulder.rotation.z = -1.3;
        joints.rightShoulder.rotation.z = 1.3;
        break;
      }
      default:
        break;
    }

    if (type !== "spin") {
      avatar.rotation.y += Math.sin(progress * Math.PI * 2) * 0.08;
    }
    void delta;
  }

  private updateSpectrum(): void {
    if (!this.bars || !this.innerBars || !this.three) return;
    const dummy = this.getDummy();

    for (let i = 0; i < BAR_COUNT; i += 1) {
      const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
      const idle =
        this.energy < 0.04
          ? 0.055 + 0.035 * (0.5 + 0.5 * Math.sin(this.elapsed * 2 + i * 0.35))
          : 0;
      const value = Math.max(this.barValues[i], idle);
      const height = 0.06 + Math.pow(value, 1.35) * 1.5;
      dummy.position.set(
        Math.cos(angle) * 2.02,
        height / 2,
        Math.sin(angle) * 2.02,
      );
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      this.bars.setMatrixAt(i, dummy.matrix);
    }
    this.bars.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < INNER_BAR_COUNT; i += 1) {
      const angle = (i / INNER_BAR_COUNT) * Math.PI * 2 + Math.PI / 2;
      const idle =
        this.energy < 0.04
          ? 0.045 + 0.03 * (0.5 + 0.5 * Math.sin(this.elapsed * 1.6 + i * 0.5))
          : 0;
      const value = Math.max(this.innerBarValues[i], idle);
      const height = 0.05 + Math.pow(value, 1.4) * 0.82;
      dummy.position.set(
        Math.cos(angle) * 1.5,
        0.22 + height / 2,
        Math.sin(angle) * 1.5,
      );
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      this.innerBars.setMatrixAt(i, dummy.matrix);
    }
    this.innerBars.instanceMatrix.needsUpdate = true;
  }

  private updateWaveforms(): void {
    if (!this.three) return;
    const time = this.elapsed;
    const outer = this.wavePositions;
    const inner = this.innerWavePositions;
    if (!outer || !inner) return;

    for (let i = 0; i < WAVE_POINTS; i += 1) {
      const angle = (i / WAVE_POINTS) * Math.PI * 2 + time * 0.05;
      const audio = this.waveValues[i] * (0.22 + this.visualEnergy * 0.7);
      const procedural =
        this.energy < 0.03 ? Math.sin(time * 2 + i * 0.34) * 0.025 : 0;
      const radius = 2.55 + audio + procedural;
      outer[i * 3] = Math.cos(angle) * radius;
      outer[i * 3 + 1] = Math.sin(angle * 3 + time) * 0.03;
      outer[i * 3 + 2] = Math.sin(angle) * radius;

      const innerAngle = angle - 0.18;
      const innerRadius = 2.22 + audio * 0.7;
      inner[i * 3] = Math.cos(innerAngle) * innerRadius;
      inner[i * 3 + 1] = Math.sin(innerAngle * 4 - time * 0.8) * 0.045;
      inner[i * 3 + 2] = Math.sin(innerAngle) * innerRadius;
    }

    this.updateLinePositions(this.waveLine, outer);
    this.updateLinePositions(this.innerWave, inner);
  }

  private updateLinePositions(
    line: Line | null,
    positions: Float32Array,
  ): void {
    if (!line) return;
    const attribute = line.geometry.getAttribute("position") as BufferAttribute;
    if (attribute.array instanceof Float32Array) {
      attribute.array.set(positions);
    }
    attribute.needsUpdate = true;
  }

  private updateParticles(delta: number): void {
    const positions = this.particlePositions;
    const speeds = this.particleSpeeds;
    if (!positions || !speeds || !this.particles) return;
    this.particles.rotation.y += delta * 0.035;
    for (let i = 0; i < speeds.length; i += 1) {
      const yIndex = i * 3 + 1;
      positions[yIndex] += delta * speeds[i] * (0.35 + this.visualEnergy * 1.5);
      if (positions[yIndex] > 5) {
        positions[yIndex] = 0;
      }
    }
    const attribute = this.particles.geometry.getAttribute(
      "position",
    ) as BufferAttribute;
    attribute.needsUpdate = true;
    this.particles.visible = this.particlesOn();
  }

  private updateRoom(): void {
    const pulse = this.pulse;
    const energy = this.visualEnergy;

    this.ringsPulse(pulse, energy);
    this.halo?.scale.setScalar(1 + pulse * 0.045 + energy * 0.02);
    this.innerHalo?.scale.setScalar(1 + pulse * 0.08);
    if (this.haloMaterial) {
      this.haloMaterial.opacity = 0.3 + pulse * 0.28;
    }
    if (this.innerHaloMaterial) {
      this.innerHaloMaterial.opacity = 0.2 + pulse * 0.26;
    }
    if (this.keyLight) this.keyLight.intensity = 16 + energy * 18;
    if (this.rimLight) this.rimLight.intensity = 16 + pulse * 20;
    if (this.fillLight) this.fillLight.intensity = 10 + energy * 10;
    if (this.floorMaterial) {
      this.floorMaterial.emissiveIntensity = 0.04 + energy * 0.14;
    }
  }

  private ringsPulse(pulse: number, energy: number): void {
    for (let i = 0; i < this.ringMeshes.length; i += 1) {
      const ring = this.ringMeshes[i];
      const material = this.ringMaterials[i];
      ring.scale.setScalar(1 + pulse * (0.02 + i * 0.018));
      if (material) {
        material.opacity = 0.22 + energy * 0.2 + pulse * (0.14 + i * 0.03);
      }
    }
  }

  private publishHud(delta: number): void {
    this.hudClock += delta;
    if (this.hudClock < 0.1) return;
    this.hudClock = 0;
    const energy = Math.round(this.visualEnergy * 100);
    const beat = Math.round(this.pulse * 100);
    this.zone.run(() => {
      this.energyPct.set(Math.min(100, energy));
      this.beatPct.set(Math.min(100, beat));
    });
  }

  private pickAvatar(event: PointerEvent): void {
    if (!this.camera || !this.avatar || !this.raycaster || !this.pointerNdc) {
      this.triggerMove();
      return;
    }
    const rect = this.surfaceRef.nativeElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const target = this.importedWrapper ?? this.avatar;
    const hit = this.raycaster.intersectObject(target, true);
    if (hit.length > 0) {
      this.triggerMove();
    }
  }

  private observeLayout(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      const canvas = this.surfaceRef.nativeElement;
      this.resizeObserver.observe(canvas.parentElement ?? canvas);
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.inView = entries.some((entry) => entry.isIntersecting);
      });
      this.intersectionObserver.observe(this.surfaceRef.nativeElement);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  private readonly onVisibilityChange = (): void => {
    this.pageVisible = document.visibilityState !== "hidden";
  };

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const canvas = this.surfaceRef.nativeElement;
    const width = Math.max(1, Math.floor(canvas.clientWidth || 640));
    const height = Math.max(1, Math.floor(canvas.clientHeight || 480));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.refitStageToViewport();
  }

  private averageBins(data: Uint8Array, start: number, end: number): number {
    let sum = 0;
    const safeEnd = Math.min(data.length, Math.max(start + 1, end));
    for (let i = start; i < safeEnd; i += 1) sum += data[i];
    return sum / Math.max(1, safeEnd - start) / 255;
  }

  private pointerDistance(): number {
    const points = [...this.pointers.values()];
    if (points.length < 2) return 0;
    const dx = points[0].x - points[1].x;
    const dy = points[0].y - points[1].y;
    return Math.hypot(dx, dy);
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private getDummy(): Object3D {
    if (!this.barDummy) this.barDummy = new this.three!.Object3D();
    return this.barDummy;
  }
}
