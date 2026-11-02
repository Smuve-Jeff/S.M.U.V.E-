import { Component, inject, signal, computed, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AudioRecorderService } from "../audio-recorder.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { SnackbarService } from "../../services/snackbar.service";
import { HapticService } from "../../services/haptic.service";

interface LibraryCategory {
  id: string;
  label: string;
  icon: string;
  count: number;
}

interface LibraryPack {
  id: string;
  label: string;
  /** Short description shown in the shelf header. */
  blurb: string;
  count: number;
}

@Component({
  selector: "app-sample-library",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./sample-library.component.html",
  styleUrls: ["./sample-library.component.css", "../shared/platform-ux.css"],
})
export class SampleLibraryComponent implements OnInit {
  private static readonly TOUCH_HOLD_MS = 420;

  private recorder = inject(AudioRecorderService);
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private snackbar = inject(SnackbarService);
  private haptic = inject(HapticService);

  private static readonly FAVORITES_KEY = "smuve_sample_favorites_v1";

  searchQuery = signal("");
  selectedCategory = signal<string>("all");
  selectedTag = signal<string | null>(null);
  selectedPack = signal<string>("all");
  favoritesOnly = signal(false);
  favorites = signal<Set<string>>(this.loadFavorites());

  private rawSamples: Array<{
    id: string;
    name: string;
    category: string;
    tags: string[];
    icon: string;
    /** Factory pack name; omitted entries fall back to a category pack. */
    pack?: string;
  }> = [
    {
      id: "kick",
      name: "808 KICK",
      category: "drum",
      tags: ["808", "kick", "boom"],
      icon: "graphic_eq",
    },
    {
      id: "snare",
      name: "SNARE 909",
      category: "drum",
      tags: ["snare", "crisp"],
      icon: "graphic_eq",
    },
    {
      id: "clap",
      name: "CLAP TIGHT",
      category: "drum",
      tags: ["clap", "tight"],
      icon: "graphic_eq",
    },
    {
      id: "hat",
      name: "HH CLOSED",
      category: "drum",
      tags: ["hat", "closed"],
      icon: "graphic_eq",
    },
    {
      id: "crash",
      name: "CRASH METAL",
      category: "drum",
      tags: ["crash", "metal"],
      icon: "graphic_eq",
    },
    {
      id: "percussion",
      name: "PERC LOOP",
      category: "drum",
      tags: ["perc", "loop"],
      icon: "graphic_eq",
    },
    {
      id: "live-kick",
      name: "LIVE KICK",
      category: "drum",
      tags: ["live", "kick"],
      icon: "mic_external_on",
    },
    {
      id: "live-vocal",
      name: "LIVE VOCAL",
      category: "vox",
      tags: ["live", "vocal"],
      icon: "mic",
    },
    {
      id: "bass-sub",
      name: "SUB BASS",
      category: "bass",
      tags: ["bass", "sub"],
      icon: "waves",
    },
    {
      id: "bass-reese",
      name: "REESE BASS",
      category: "bass",
      tags: ["bass", "reese"],
      icon: "waves",
    },
    {
      id: "keys-rhodes",
      name: "RHODES PIANO",
      category: "keys",
      tags: ["keys", "piano", "rhodes"],
      icon: "piano",
    },
    {
      id: "keys-wurli",
      name: "WURLITZER",
      category: "keys",
      tags: ["keys", "electric"],
      icon: "piano",
    },
    {
      id: "lead-saw",
      name: "SAW LEAD",
      category: "lead",
      tags: ["lead", "saw"],
      icon: "graphic_eq",
    },
    {
      id: "lead-pluck",
      name: "PLUCK SYNTH",
      category: "lead",
      tags: ["lead", "pluck"],
      icon: "graphic_eq",
    },
    {
      id: "pad-glass",
      name: "GLASS PAD",
      category: "pad",
      tags: ["pad", "glass"],
      icon: "layers",
    },
    {
      id: "pad-strings",
      name: "STRINGS PAD",
      category: "pad",
      tags: ["pad", "strings"],
      icon: "layers",
    },
    {
      id: "fx-riser",
      name: "RISER FX",
      category: "vfx",
      tags: ["fx", "riser"],
      icon: "auto_awesome",
    },
    {
      id: "fx-impact",
      name: "IMPACT FX",
      category: "vfx",
      tags: ["fx", "impact"],
      icon: "auto_awesome",
    },
    {
      id: "fx-down",
      name: "DOWNLIFTER",
      category: "vfx",
      tags: ["fx", "downlifter"],
      icon: "auto_awesome",
    },
    {
      id: "loop-trap",
      name: "TRAP LOOP",
      category: "loop",
      tags: ["loop", "trap"],
      icon: "loop",
    },
    {
      id: "loop-rnb",
      name: "R&B LOOP",
      category: "loop",
      tags: ["loop", "rnb"],
      icon: "loop",
    },
    {
      id: "loop-house",
      name: "HOUSE LOOP",
      category: "loop",
      tags: ["loop", "house"],
      icon: "loop",
    },
    {
      id: "rim",
      name: "RIM TICK",
      category: "drum",
      tags: ["rim", "tick", "afro"],
      icon: "graphic_eq",
      pack: "Club Arsenal",
    },
    {
      id: "tom",
      name: "FLOOR TOM",
      category: "drum",
      tags: ["tom", "acoustic", "live"],
      icon: "mic_external_on",
      pack: "Club Arsenal",
    },
    {
      id: "ride",
      name: "RIDE WASH",
      category: "drum",
      tags: ["ride", "cymbal", "jazz"],
      icon: "graphic_eq",
      pack: "After Hours",
    },
    {
      id: "break",
      name: "BREAK SLICE",
      category: "drum",
      tags: ["break", "breakbeat", "loop"],
      icon: "content_cut",
      pack: "Club Arsenal",
    },
    {
      id: "bass-808-slide",
      name: "808 SLIDE",
      category: "bass",
      tags: ["808", "slide", "glide"],
      icon: "waves",
      pack: "Club Arsenal",
    },
    {
      id: "bass-funk",
      name: "FUNK BASS",
      category: "bass",
      tags: ["bass", "funk", "finger"],
      icon: "waves",
      pack: "After Hours",
    },
    {
      id: "bass-upright",
      name: "UPRIGHT BASS",
      category: "bass",
      tags: ["bass", "upright", "jazz"],
      icon: "music_note",
      pack: "After Hours",
    },
    {
      id: "keys-organ",
      name: "DRAW ORGAN",
      category: "keys",
      tags: ["organ", "keys", "soul"],
      icon: "piano",
      pack: "After Hours",
    },
    {
      id: "keys-clav",
      name: "CLAV FUNK",
      category: "keys",
      tags: ["clav", "funk", "keys"],
      icon: "piano",
      pack: "After Hours",
    },
    {
      id: "keys-grand",
      name: "CONCERT GRAND",
      category: "keys",
      tags: ["piano", "grand", "cinematic"],
      icon: "piano",
      pack: "Cinematic Tools",
    },
    {
      id: "lead-square",
      name: "SQUARE LEAD",
      category: "lead",
      tags: ["lead", "square", "retro"],
      icon: "graphic_eq",
      pack: "Club Arsenal",
    },
    {
      id: "pad-choir",
      name: "CHOIR PAD",
      category: "pad",
      tags: ["choir", "pad", "cinematic"],
      icon: "layers",
      pack: "Cinematic Tools",
    },
    {
      id: "pad-analog",
      name: "ANALOG PAD",
      category: "pad",
      tags: ["pad", "analog", "warm"],
      icon: "layers",
      pack: "After Hours",
    },
    {
      id: "vocal-chop",
      name: "VOCAL CHOP",
      category: "vox",
      tags: ["vocal", "chop", "hook"],
      icon: "mic",
      pack: "Club Arsenal",
    },
    {
      id: "vocal-adlib",
      name: "ADLIB STACK",
      category: "vox",
      tags: ["vocal", "adlib", "stack"],
      icon: "mic",
      pack: "After Hours",
    },
    {
      id: "fx-glitch",
      name: "GLITCH STUTTER",
      category: "vfx",
      tags: ["glitch", "stutter", "fx"],
      icon: "auto_awesome",
      pack: "Cinematic Tools",
    },
    {
      id: "fx-sweep",
      name: "SPECTRAL SWEEP",
      category: "vfx",
      tags: ["sweep", "riser", "fx"],
      icon: "auto_awesome",
      pack: "Cinematic Tools",
    },
    {
      id: "loop-drill",
      name: "DRILL LOOP",
      category: "loop",
      tags: ["loop", "drill", "sliding"],
      icon: "loop",
      pack: "Club Arsenal",
    },
  ];

  categories = computed<LibraryCategory[]>(() => {
    const counts = new Map<string, number>();
    counts.set("all", this.rawSamples.length);
    for (const s of this.rawSamples) {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    return [
      {
        id: "all",
        label: "All",
        icon: "grid_view",
        count: counts.get("all") ?? 0,
      },
      {
        id: "drum",
        label: "Drums",
        icon: "drum",
        count: counts.get("drum") ?? 0,
      },
      {
        id: "bass",
        label: "Bass",
        icon: "waves",
        count: counts.get("bass") ?? 0,
      },
      {
        id: "keys",
        label: "Keys",
        icon: "piano",
        count: counts.get("keys") ?? 0,
      },
      {
        id: "lead",
        label: "Leads",
        icon: "graphic_eq",
        count: counts.get("lead") ?? 0,
      },
      {
        id: "pad",
        label: "Pads",
        icon: "layers",
        count: counts.get("pad") ?? 0,
      },
      { id: "vox", label: "Vox", icon: "mic", count: counts.get("vox") ?? 0 },
      {
        id: "vfx",
        label: "FX",
        icon: "auto_awesome",
        count: counts.get("vfx") ?? 0,
      },
      {
        id: "loop",
        label: "Loops",
        icon: "loop",
        count: counts.get("loop") ?? 0,
      },
    ];
  });

  /** Factory packs group the shelf into coherent production palettes. */
  packs = computed<LibraryPack[]>(() => {
    const definitions: Array<Pick<LibraryPack, "id" | "label" | "blurb">> = [
      {
        id: "all",
        label: "All packs",
        blurb: "Every factory sound in this install.",
      },
      {
        id: "Club Arsenal",
        label: "Club Arsenal",
        blurb: "Hard drums, 808s and dancefloor-ready leads.",
      },
      {
        id: "After Hours",
        label: "After Hours",
        blurb: "Warm keys, upright bass and late-night textures.",
      },
      {
        id: "Cinematic Tools",
        label: "Cinematic Tools",
        blurb: "Pads, choir, grand piano and transition design.",
      },
    ];
    return definitions.map((definition) => ({
      ...definition,
      count:
        definition.id === "all"
          ? this.rawSamples.length
          : this.rawSamples.filter((sample) => this.packFor(sample) === definition.id)
              .length,
    }));
  });

  /** Category-derived pack for catalog entries written before packs existed. */
  packFor(sample: { category: string; pack?: string }): string {
    if (sample.pack) return sample.pack;
    if (sample.category === "drum" || sample.category === "loop") {
      return "Club Arsenal";
    }
    if (sample.category === "pad" || sample.category === "vfx") {
      return "Cinematic Tools";
    }
    return "After Hours";
  }

  selectedPackBlurb(): string {
    const pack = this.selectedPack();
    return this.packs().find((entry) => entry.id === pack)?.blurb ?? "";
  }

  filteredSamples = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const cat = this.selectedCategory();
    const tag = this.selectedTag();
    const pack = this.selectedPack();
    const favoritesOnly = this.favoritesOnly();
    const favorites = this.favorites();
    return this.rawSamples.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        this.packFor(s).toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q));
      const matchesCat = cat === "all" || s.category === cat;
      const matchesTag = !tag || s.tags.includes(tag);
      const matchesPack = pack === "all" || this.packFor(s) === pack;
      const matchesFavorite = !favoritesOnly || favorites.has(s.id);
      return matchesSearch && matchesCat && matchesTag && matchesPack && matchesFavorite;
    });
  });

  previewingId = signal<string | null>(null);
  dragSampleId = signal<string | null>(null);
  private cardPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressSampleId: string | null = null;
  private suppressCardClickId: string | null = null;

  ngOnInit(): void {
    // Touch recorder to pull any offline takes metadata on mount
    void this.recorder.getOfflineRecordings().catch(() => []);
  }

  // ── Drag-to-track ────────────────────────────────────
  onDragStart(event: DragEvent, sampleId: string, name: string): void {
    this.dragSampleId.set(sampleId);
    event.dataTransfer?.setData(
      "application/smuve-sample",
      JSON.stringify({ id: sampleId, name }),
    );
    event.dataTransfer!.effectAllowed = "copy";
    if (event.dataTransfer?.setDragImage) {
      const el = document.createElement("div");
      el.textContent = name;
      el.style.cssText =
        "position:fixed;top:-100px;padding:8px 14px;background:var(--teal-500);color:#fff;border-radius:8px;font-size:11px;font-weight:800;pointer-events:none";
      document.body.appendChild(el);
      event.dataTransfer.setDragImage(el, 0, 0);
      setTimeout(() => el.remove(), 0);
    }
  }

  onDragEnd(): void {
    this.dragSampleId.set(null);
  }

  onCardPointerDown(event: PointerEvent, sampleId: string): void {
    if (!this.isTouchCardGesture(event)) return;
    this.clearCardPressState();
    this.cardPreviewTimer = setTimeout(() => {
      this.longPressSampleId = sampleId;
      this.suppressCardClickId = sampleId;
      void this.previewSample(sampleId);
    }, SampleLibraryComponent.TOUCH_HOLD_MS);
  }

  onCardPointerUp(event: PointerEvent, sampleId: string): void {
    if (!this.isTouchCardGesture(event)) return;
    const wasLongPress = this.longPressSampleId === sampleId;
    this.clearCardPressState();
    this.suppressCardClickId = sampleId;
    if (!wasLongPress) {
      this.loadSample(sampleId);
    }
  }

  onCardPointerCancel(): void {
    this.clearCardPressState();
  }

  onCardClick(event: Event, sampleId: string): void {
    if (this.isInteractiveTarget(event.target)) return;
    if (this.suppressCardClickId === sampleId) {
      this.suppressCardClickId = null;
      return;
    }
    this.loadSample(sampleId);
  }

  toggleTag(tag: string): void {
    this.haptic.light();
    if (this.selectedTag() === tag) {
      this.selectedTag.set(null);
    } else {
      this.selectedTag.set(tag);
    }
  }

  selectPack(pack: string): void {
    this.selectedPack.set(pack);
    this.haptic.light();
  }

  toggleFavoritesOnly(): void {
    this.favoritesOnly.update((value) => !value);
    this.haptic.light();
  }

  isFavorite(sampleId: string): boolean {
    return this.favorites().has(sampleId);
  }

  toggleFavorite(sampleId: string, event?: Event): void {
    event?.stopPropagation();
    const next = new Set(this.favorites());
    if (next.has(sampleId)) next.delete(sampleId);
    else next.add(sampleId);
    this.favorites.set(next);
    try {
      localStorage.setItem(
        SampleLibraryComponent.FAVORITES_KEY,
        JSON.stringify([...next]),
      );
    } catch {
      /* storage unavailable */
    }
    this.haptic.light();
  }

  private loadFavorites(): Set<string> {
    try {
      const raw = localStorage.getItem(SampleLibraryComponent.FAVORITES_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
        : new Set();
    } catch {
      return new Set();
    }
  }

  /** Map library entry IDs to real InstrumentsService preset IDs so "Load"
   *  produces an audible track (the catalog is metadata-only). Unknown IDs
   *  fall back to ensureTrack's default instrument. */
  private static readonly SAMPLE_TO_PRESET: Record<string, string> = {
    kick: "trap-kit-elite",
    snare: "trap-kit-elite",
    clap: "trap-kit-elite",
    hat: "trap-kit-elite",
    crash: "trap-kit-elite",
    percussion: "afro-cuban-kit",
    "live-kick": "acoustic-kit-pro",
    "bass-sub": "sub-commander",
    "bass-reese": "reese-bass-neuro",
    "keys-rhodes": "rhodes-mk2-stage",
    "keys-wurli": "wurlitzer-200a-ep",
    "lead-saw": "supersaw-stack",
    "lead-pluck": "pluck-marimba-hybrid",
    "pad-glass": "wavetable-dream",
    "pad-strings": "ob-xa-strings",
    "fx-riser": "cyber-stab",
    "fx-impact": "cyber-stab",
    "fx-down": "vhs-memory",
    "loop-trap": "trap-kit-elite",
    "loop-rnb": "rhodes-mk2-stage",
    "loop-house": "modern-kit-elite",
    rim: "afro-cuban-kit",
    tom: "acoustic-kit-pro",
    ride: "modern-kit-elite",
    break: "trap-kit-elite",
    "bass-808-slide": "trap-808-elite",
    "bass-funk": "sub-commander",
    "bass-upright": "reese-bass-neuro",
    "keys-organ": "rhodes-mk2-stage",
    "keys-clav": "wurlitzer-200a-ep",
    "keys-grand": "grand-piano",
    "lead-square": "supersaw-stack",
    "pad-choir": "ob-xa-strings",
    "pad-analog": "wavetable-dream",
    "vocal-chop": "cyber-stab",
    "vocal-adlib": "vhs-memory",
    "fx-glitch": "cyber-stab",
    "fx-sweep": "vhs-memory",
    "loop-drill": "trap-kit-elite",
  };

  loadSample(sampleId: string): void {
    this.haptic.medium();
    this.audioEngine.resume();
    const sample = this.rawSamples.find((s) => s.id === sampleId);
    const presetId =
      SampleLibraryComponent.SAMPLE_TO_PRESET[sampleId] ?? sampleId;
    this.musicManager.ensureTrack(presetId);
    this.snackbar.success(
      `Sample loaded: ${sample?.name ?? sampleId} → ${presetId}`,
    );
  }

  /**
   * Audible preview — synthesizes a short, category-appropriate one-shot
   * through the live engine (drum thumps, tonal hits, FX sweeps). The library
   * catalog is metadata-only, so this is the real audition path.
   */
  async previewSample(sampleId: string, event?: Event): Promise<void> {
    event?.stopPropagation?.();
    if (this.previewingId() === sampleId) return;
    this.previewingId.set(sampleId);
    this.haptic.light();
    const sample = this.rawSamples.find((s) => s.id === sampleId);
    this.playSampleAudition(sample);
    setTimeout(() => {
      if (this.previewingId() === sampleId) {
        this.previewingId.set(null);
      }
    }, 450);
    this.snackbar.info(`Previewing ${sample?.name ?? sampleId}`);
  }

  /** Short synthesized one-shot per category — never throws, mobile-safe. */
  private playSampleAudition(sample?: {
    id: string;
    category: string;
    name: string;
  }): void {
    const ctx = this.audioEngine.ctx;
    if (!ctx) return;
    try {
      this.audioEngine.resume();
    } catch {
      /* context may be suspended — the source still gets scheduled */
    }
    const now = ctx.currentTime;
    const cat = sample?.category ?? "drum";
    const id = sample?.id ?? "";
    const dur = 0.35;

    const out = ctx.createGain();
    out.connect(this.audioEngine.masterGain ?? ctx.destination);
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    // ── Percussive hits ────────────────────────────────────
    if (cat === "drum" || cat === "perc" || cat === "loop") {
      const thump = ctx.createOscillator();
      thump.type = "sine";
      const isNoise =
        id.includes("hat") || id.includes("crash") || id.includes("clap");
      thump.frequency.setValueAtTime(
        isNoise ? 220 : id.includes("snare") ? 180 : 140,
        now,
      );
      thump.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      thump.connect(out);
      thump.start(now);
      thump.stop(now + 0.25);

      if (isNoise) {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 5000;
        const nb = ctx.createBuffer(
          1,
          Math.max(1, Math.floor(ctx.sampleRate * 0.08)),
          ctx.sampleRate,
        );
        const data = nb.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.4;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = nb;
        noise.connect(hp);
        hp.connect(out);
        noise.start(now);
        noise.stop(now + 0.08);
      }
      return;
    }

    // ── Tonal hits ─────────────────────────────────────────
    const BASE: Record<string, number> = {
      bass: 55,
      keys: 330,
      lead: 440,
      pad: 220,
      vox: 392,
      organ: 262,
      guitar: 196,
      strings: 294,
      world: 294,
      piano: 262,
      brass: 233,
      woodwind: 392,
      choir: 392,
      vfx: 660,
    };
    const freq = BASE[cat] ?? 330;
    const osc = ctx.createOscillator();
    osc.type =
      cat === "lead" || cat === "vfx"
        ? "sawtooth"
        : cat === "pad" || cat === "choir"
          ? "triangle"
          : "sine";
    osc.frequency.setValueAtTime(freq, now);
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = cat === "lead" ? 2500 : 1200;
    osc.connect(flt);
    flt.connect(out);
    osc.start(now);
    osc.stop(now + dur);

    // Pads / choirs get a fifth for warmth
    if (cat === "pad" || cat === "choir") {
      const fifth = ctx.createOscillator();
      fifth.type = "triangle";
      fifth.frequency.setValueAtTime(freq * 1.5, now);
      fifth.connect(flt);
      fifth.start(now);
      fifth.stop(now + dur);
    }
    // FX get a downward sweep
    if (cat === "vfx") {
      osc.frequency.exponentialRampToValueAtTime(freq * 0.25, now + dur);
    }
  }

  private clearCardPressState(): void {
    if (this.cardPreviewTimer) {
      clearTimeout(this.cardPreviewTimer);
      this.cardPreviewTimer = null;
    }
    this.longPressSampleId = null;
    this.suppressCardClickId = null;
  }

  private isTouchCardGesture(event: PointerEvent): boolean {
    return (
      event.pointerType !== "mouse" && !this.isInteractiveTarget(event.target)
    );
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof Element
      ? !!target.closest("button,input,select,textarea,a")
      : false;
  }
}
