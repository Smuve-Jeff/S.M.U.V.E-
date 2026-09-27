import {
  Component,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  type OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { HapticService } from "../../../services/haptic.service";
import { IdeasGeneratorService } from "../../../services/ideas-generator.service";
import { MusicManagerService } from "../../../services/music-manager.service";
import { AudioEngineService } from "../../../services/audio-engine.service";
import { SnackbarService } from "../../../services/snackbar.service";
import { UserProfileService } from "../../../services/user-profile.service";
import type { SmartSheetMemory } from "../../../types/profile.types";

export interface GenreStarter {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  emoji: string;
  tagline: string;
  instruments: string[];
  gradient: string;
}

/** Smart-sheet recall is mirrored to localStorage — not IndexedDB — so it is
 *  readable synchronously while the sheet paints, and before any session exists. */
const MEMORY_KEY = "smuve_smart_sheet_memory";
/** Coalesce account pushes: a tab tap must not upload the whole profile. */
const ACCOUNT_SYNC_DEBOUNCE_MS = 900;
/** Chips kept in the combined Recently Used row. */
const MAX_RECENT_ITEMS = 4;

type SmartSheetTab = "beats" | "vocals" | "chords" | "ai";

export type RecentKind = "Pack" | "Vocal" | "Chords";

/** Recency-map key prefix per category, so ids from the three catalogues can
 *  share one map without colliding. */
const RECENT_PREFIX: Record<RecentKind, string> = {
  Pack: "starter:",
  Vocal: "vocal:",
  Chords: "chord:",
};

/** One entry of the combined Recently Used row. */
export interface RecentItem {
  key: string;
  kind: RecentKind;
  id: string;
  name: string;
  emoji: string;
  usedAt: number;
}

const SHEET_TABS: SmartSheetTab[] = ["beats", "vocals", "chords", "ai"];

const isSmartSheetTab = (value: string | undefined): value is SmartSheetTab =>
  !!value && (SHEET_TABS as string[]).includes(value);

export interface QuickChordMood {
  id: string;
  label: string;
  mood: string;
  key: string;
  progression: string[];
  emoji: string;
}

/** One-tap vocal chain — arming a preset loads the DSP chain and opens the booth. */
export interface VocalPreset {
  id: string;
  name: string;
  category: string;
  emoji: string;
  tagline: string;
  /** Vocal-suite chain modules applied when the preset is armed. */
  chain: string[];
  gradient: string;
}

@Component({
  selector: "app-smart-creation-sheet",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./smart-creation-sheet.component.html",
  styleUrls: ["./smart-creation-sheet.component.css", "../platform-ux.css"],
})
export class SmartCreationSheetComponent implements OnDestroy {
  private haptic = inject(HapticService);
  private ideas = inject(IdeasGeneratorService);
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private snackbar = inject(SnackbarService);
  private profile = inject(UserProfileService);

  @Output() closeSheet = new EventEmitter<void>();
  @Output() navigateToView = new EventEmitter<string>();

  activeTab = signal<SmartSheetTab>("beats");

  /** Live drag offset (px) of the bottom sheet while the chrome is pulled. */
  sheetDragOffset = signal(0);
  readonly dragDismissThreshold = 90;
  /** A quick downward flick closes the sheet without dragging the full distance. */
  readonly flickVelocity = 0.55; // px per ms (~550 px/s)
  readonly flickMinDistance = 28;
  readonly flickMinDurationMs = 40;
  private dragStartY = 0;
  private dragStartTime = 0;
  private isDragging = false;

  /** Horizontal travel (px) before a content swipe counts as a tab change. */
  readonly swipeThreshold = 56;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeTracking = false;

  /** Packs/presets used last time — restored so one tap re-arms them. */
  readonly lastStarterId = signal<string | null>(null);
  readonly lastVocalPresetId = signal<string | null>(null);
  readonly lastStarter = computed(
    () => this.genreStarters.find((s) => s.id === this.lastStarterId()) ?? null,
  );
  readonly lastVocalPreset = computed(
    () =>
      this.vocalPresets.find((p) => p.id === this.lastVocalPresetId()) ?? null,
  );

  readonly lastChordMoodId = signal<string | null>(null);
  readonly lastChordMood = computed(
    () => this.chordMoods.find((m) => m.id === this.lastChordMoodId()) ?? null,
  );

  /** The last-used pack/preset/mood floats to the front of its grid. */
  readonly orderedStarters = computed(() =>
    this.recencyFirst(this.genreStarters, this.lastStarterId()),
  );
  readonly orderedVocalPresets = computed(() =>
    this.recencyFirst(this.vocalPresets, this.lastVocalPresetId()),
  );
  readonly orderedChordMoods = computed(() =>
    this.recencyFirst(this.chordMoods, this.lastChordMoodId()),
  );

  /** Per-item use stamps (`starter:trap`) behind the Recently Used row. */
  readonly recentUsage = signal<Record<string, number>>({});

  /** Newest-first mix of packs, vocal presets and chord moods actually used. */
  readonly recentItems = computed<RecentItem[]>(() => {
    const usage = this.recentUsage();
    const items: RecentItem[] = [];
    const collect = (
      kind: RecentKind,
      entries: Array<{ id: string; name: string; emoji: string }>,
    ) => {
      for (const entry of entries) {
        const key = RECENT_PREFIX[kind] + entry.id;
        const usedAt = usage[key];
        if (usedAt) {
          items.push({
            key,
            kind,
            id: entry.id,
            name: entry.name,
            emoji: entry.emoji,
            usedAt,
          });
        }
      }
    };

    collect("Pack", this.genreStarters);
    collect("Vocal", this.vocalPresets);
    collect(
      "Chords",
      this.chordMoods.map((m) => ({ id: m.id, name: m.label, emoji: m.emoji })),
    );

    return items.sort((a, b) => b.usedAt - a.usedAt).slice(0, MAX_RECENT_ITEMS);
  });

  /** Recall payload mirrored locally and stored on the account profile. */
  private memory: SmartSheetMemory = {};
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private memorySyncPending = false;

  constructor() {
    this.memory = this.newestMemory();
    this.recentUsage.set(this.memory.recent ?? {});
    this.applyMemory(this.memory);
  }

  ngOnDestroy(): void {
    // A coalesced push must not die with the sheet if it closes inside the window.
    this.flushMemorySync();
  }

  // ── Recall: local mirror + account sync ────────────────────────

  /**
   * The newer of {this device, the account}. A device used more recently keeps
   * its own recall; a fresh device (no local mirror) adopts the account's last
   * session, which is what makes the choice follow the artist between devices.
   */
  private newestMemory(): SmartSheetMemory {
    const local = this.readLocalMemory();
    const account = this.profile.profile()?.settings?.studio?.smartSheet;
    if (!local) return account ?? {};
    if (!account) return local;

    const accountIsNewer = (account.updatedAt ?? 0) > (local.updatedAt ?? 0);
    const newest = accountIsNewer ? account : local;
    // Per-item stamps are merged by max rather than picked: a device that used a
    // pack yesterday and one that used a preset today both feed the Recent row.
    return {
      ...newest,
      recent: this.mergeRecent(local.recent, account.recent),
    };
  }

  private mergeRecent(
    ...maps: Array<Record<string, number> | undefined>
  ): Record<string, number> {
    const merged: Record<string, number> = {};
    for (const map of maps) {
      if (!map) continue;
      for (const [key, usedAt] of Object.entries(map)) {
        if (typeof usedAt === "number")
          merged[key] = Math.max(merged[key] ?? 0, usedAt);
      }
    }
    return merged;
  }

  private applyMemory(memory: SmartSheetMemory): void {
    const tab = memory.lastTab;
    if (isSmartSheetTab(tab)) this.activeTab.set(tab);

    const starterId = memory.lastStarterId;
    if (starterId && this.genreStarters.some((s) => s.id === starterId)) {
      this.lastStarterId.set(starterId);
    }

    const presetId = memory.lastVocalPresetId;
    if (presetId && this.vocalPresets.some((p) => p.id === presetId)) {
      this.lastVocalPresetId.set(presetId);
    }

    const moodId = memory.lastChordMoodId;
    if (moodId && this.chordMoods.some((m) => m.id === moodId)) {
      this.lastChordMoodId.set(moodId);
    }
  }

  private readLocalMemory(): SmartSheetMemory | null {
    try {
      const raw =
        typeof window === "undefined"
          ? null
          : window.localStorage.getItem(MEMORY_KEY);
      return raw ? (JSON.parse(raw) as SmartSheetMemory) : null;
    } catch {
      // Storage disabled (private mode) or a corrupt blob — the sheet still
      // works, it just forgets.
      return null;
    }
  }

  /** Record a recall change locally at once, and push it to the account soon. */
  private remember(patch: Partial<SmartSheetMemory>): void {
    this.memory = { ...this.memory, ...patch, updatedAt: Date.now() };
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(MEMORY_KEY, JSON.stringify(this.memory));
      }
    } catch {
      // Local mirror is best-effort; the account copy still lands.
    }
    this.memorySyncPending = true;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(
      () => this.flushMemorySync(),
      ACCOUNT_SYNC_DEBOUNCE_MS,
    );
  }

  /** Push the recall payload into the profile, which syncs it to the account. */
  private flushMemorySync(): void {
    if (!this.memorySyncPending) return;
    this.memorySyncPending = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    const settings = this.profile.profile()?.settings;
    // A host without a loaded profile keeps the local mirror and skips the push.
    if (!settings) return;
    void this.profile.updateProfile({
      settings: {
        ...settings,
        studio: { ...settings.studio, smartSheet: this.memory },
      },
    });
  }

  private recencyFirst<T extends { id: string }>(
    items: T[],
    lastId: string | null,
  ): T[] {
    const last = lastId ? items.find((item) => item.id === lastId) : undefined;
    return last
      ? [last, ...items.filter((item) => item.id !== last.id)]
      : items;
  }

  /** Stamp a use for the Recently Used row and mirror it into the payload. */
  private rememberUse(key: string, patch: Partial<SmartSheetMemory>): void {
    const recent = { ...this.recentUsage(), [key]: Date.now() };
    this.recentUsage.set(recent);
    this.remember({ ...patch, recent });
  }

  /** Re-run a Recently Used entry — the same path as tapping its own card. */
  useRecent(item: RecentItem): void {
    if (item.kind === "Pack") {
      const starter = this.genreStarters.find((s) => s.id === item.id);
      if (starter) this.loadStarter(starter);
      return;
    }
    if (item.kind === "Vocal") {
      const preset = this.vocalPresets.find((p) => p.id === item.id);
      if (preset) this.applyVocalPreset(preset);
      return;
    }
    const mood = this.chordMoods.find((m) => m.id === item.id);
    if (mood) this.applyChordMood(mood);
  }

  readonly genreStarters: GenreStarter[] = [
    {
      id: "trap",
      name: "Trap Elite",
      genre: "Trap / Hip-Hop",
      bpm: 140,
      emoji: "🔥",
      tagline: "Heavy 808 sub, hi-hat rolls & dark keys",
      instruments: ["808 Sub", "Dark Piano", "Trap Kit", "Hi-Hats"],
      gradient:
        "linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "rnb",
      name: "Smooth R&B",
      genre: "R&B / Soul",
      bpm: 92,
      emoji: "🌊",
      tagline: "Warm electric piano, deep P-bass & velvet claps",
      instruments: ["Ethereal Rhodes", "P-Bass", "Finger Snap", "Lead"],
      gradient:
        "linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "lofi",
      name: "Lo-Fi Chill",
      genre: "Lo-Fi / Beats",
      bpm: 80,
      emoji: "☕",
      tagline: "Dusty vinyl chords, muffled drums & cozy warmth",
      instruments: ["Muted Keys", "Vinyl Beats", "Warm Sub", "Ambient FX"],
      gradient:
        "linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "drill",
      name: "Drill Heat",
      genre: "UK / NY Drill",
      bpm: 142,
      emoji: "⚡",
      tagline: "Sliding 808 glides, syncopated snares & bell accents",
      instruments: ["Glide 808", "Ghost Snare", "Dark Bells", "Percs"],
      gradient:
        "linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "house",
      name: "Club House",
      genre: "House / Dance",
      bpm: 128,
      emoji: "🪩",
      tagline: "Pumping four-on-the-floor kick, rolling bass & stabs",
      instruments: ["Punch Kick", "Organ Bass", "Off-Beat Hat", "Stab Synth"],
      gradient:
        "linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "pop",
      name: "Radio Pop",
      genre: "Pop / Modern",
      bpm: 120,
      emoji: "✨",
      tagline: "Anthem guitar chords, driving bass & melodic punch",
      instruments: ["Pop Keys", "Punch Bass", "Modern Kit", "Arp Synth"],
      gradient:
        "linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "afrobeats",
      name: "Lagos Sunset",
      genre: "Afrobeats / Afro-Fusion",
      bpm: 104,
      emoji: "🌴",
      tagline: "Bouncing log-drum sub, bright plucks & shaker groove",
      instruments: ["Log Drum", "Island Pluck", "Shaker", "Bright Sub"],
      gradient:
        "linear-gradient(135deg, rgba(250, 204, 21, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "synthwave",
      name: "Neon Highway",
      genre: "Synthwave / Retrowave",
      bpm: 112,
      emoji: "🌆",
      tagline: "Analog arps, gated pads & pulsing retro drive",
      instruments: ["Analog Arp", "Gated Pad", "Pulse 808", "Retro Kit"],
      gradient:
        "linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "boombap",
      name: "Golden Era",
      genre: "Boom Bap / Hip-Hop",
      bpm: 90,
      emoji: "🥁",
      tagline: "Dusty swung breaks, chopped Rhodes & upright bass",
      instruments: ["Chopped Rhodes", "Upright Bass", "Dusty Breaks"],
      gradient:
        "linear-gradient(135deg, rgba(217, 119, 6, 0.25), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "reggaeton",
      name: "Perreo Heat",
      genre: "Reggaeton / Latin",
      bpm: 94,
      emoji: "💃",
      tagline: "Dembow riddim, marimba plucks & deep perreo sub",
      instruments: ["Dembow Kit", "Marimba Pluck", "Perreo Sub"],
      gradient:
        "linear-gradient(135deg, rgba(244, 63, 94, 0.25), rgba(15, 23, 42, 0.95))",
    },
  ];

  readonly chordMoods: QuickChordMood[] = [
    {
      id: "dark",
      label: "Dark & Emotional",
      mood: "Melancholic / Trap",
      key: "C Minor",
      progression: ["i", "VI", "III", "VII"],
      emoji: "🌑",
    },
    {
      id: "uplifting",
      label: "Uplifting Anthem",
      mood: "Hopeful / Pop",
      key: "G Major",
      progression: ["I", "V", "vi", "IV"],
      emoji: "☀️",
    },
    {
      id: "neo-soul",
      label: "Neo-Soul & Jazz",
      mood: "Smooth / Complex",
      key: "F Minor",
      progression: ["i7", "iv7", "v7", "VImaj7"],
      emoji: "🎷",
    },
    {
      id: "nostalgia",
      label: "Late Night Chill",
      mood: "Dreamy / Lo-Fi",
      key: "Eb Major",
      progression: ["IVmaj7", "iii7", "ii7", "Imaj7"],
      emoji: "🌌",
    },
    {
      id: "cinematic",
      label: "Cinematic Drama",
      mood: "Epic / Score",
      key: "D Minor",
      progression: ["i", "VI", "iv", "V"],
      emoji: "🎬",
    },
    {
      id: "gospel",
      label: "Gospel & Soul",
      mood: "Uplifting / Church",
      key: "Ab Major",
      progression: ["I", "vi", "ii7", "V7"],
      emoji: "🙌",
    },
    {
      id: "cyberpunk",
      label: "Cyberpunk Grit",
      mood: "Dystopian / Dark Synth",
      key: "F# Minor",
      progression: ["i", "VI", "III", "iv"],
      emoji: "🤖",
    },
  ];

  readonly vocalPresets: VocalPreset[] = [
    {
      id: "modern-autopitch",
      name: "Modern Auto-Pitch",
      category: "Trap / Pop",
      emoji: "🎯",
      tagline: "Hard-tuned, snappy doubles for hooks and ad-libs",
      chain: ["Hard Auto-Pitch", "Fast Retune", "Air EQ", "Doubler"],
      gradient:
        "linear-gradient(135deg, rgba(0, 240, 255, 0.22), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "vintage-tube",
      name: "Warm Vintage Tube",
      category: "Soul / R&B",
      emoji: "🎛️",
      tagline: "Tube saturation, tape warmth & silky compression",
      chain: ["Tube Pre", "Tape Saturation", "Opto Comp", "Soft De-Esser"],
      gradient:
        "linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "crisp-radio",
      name: "Crisp Radio Lead",
      category: "Pop / Radio",
      emoji: "📻",
      tagline: "Polished lead vocal, bright top end & upfront presence",
      chain: ["Clean Pre", "Presence EQ", "Fast Comp", "Plate Reverb"],
      gradient:
        "linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "lofi-telephone",
      name: "Lo-Fi Telephone",
      category: "Lo-Fi / Texture",
      emoji: "☎️",
      tagline: "Band-limited phone tone with vinyl grit and wobble",
      chain: ["Band-Pass Filter", "Bit Crush", "Vinyl Noise", "Tape Wow"],
      gradient:
        "linear-gradient(135deg, rgba(168, 85, 247, 0.22), rgba(15, 23, 42, 0.95))",
    },
    {
      id: "ethereal-space",
      name: "Ethereal Space Reverb",
      category: "Ambient / Dream",
      emoji: "🌫️",
      tagline: "Huge shimmer tails and floating stereo expanse",
      chain: ["Shimmer Verb", "Wide Chorus", "Long Delay", "Duck Bed"],
      gradient:
        "linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(15, 23, 42, 0.95))",
    },
  ];

  setTab(tab: SmartSheetTab): void {
    this.haptic.light();
    this.activeTab.set(tab);
    this.remember({ lastTab: tab });
  }

  // ── Swipe between workflow tabs (mobile) ──────────────────────

  onContentTouchStart(event: TouchEvent): void {
    const touch = event.touches?.[0];
    if (!touch) return;
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
    this.swipeTracking = true;
  }

  onContentTouchEnd(event: TouchEvent): void {
    if (!this.swipeTracking) return;
    this.swipeTracking = false;
    const touch = event.changedTouches?.[0] ?? event.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - this.swipeStartX;
    const dy = touch.clientY - this.swipeStartY;
    // Horizontal intent only: a vertical flick belongs to the scroller, not the tabs.
    if (Math.abs(dx) < this.swipeThreshold || Math.abs(dx) < Math.abs(dy) * 1.5)
      return;
    this.stepTab(dx < 0 ? 1 : -1);
  }

  /** System interrupted the swipe (scroll takeover, call, etc.) — drop it. */
  onContentTouchCancel(): void {
    this.swipeTracking = false;
  }

  private stepTab(direction: 1 | -1): void {
    const next = SHEET_TABS[SHEET_TABS.indexOf(this.activeTab()) + direction];
    if (!next) return;
    this.setTab(next);
  }

  // ── Drag-to-dismiss gesture (mobile bottom sheet) ─────────────

  onDragStart(event: TouchEvent): void {
    const touch = event.touches?.[0];
    if (!touch) return;
    this.isDragging = true;
    this.dragStartY = touch.clientY;
    this.dragStartTime = Date.now();
    this.sheetDragOffset.set(0);
  }

  onDragMove(event: TouchEvent): void {
    if (!this.isDragging) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    // Only downward travel moves the sheet; upward pulls are ignored.
    this.sheetDragOffset.set(Math.max(0, touch.clientY - this.dragStartY));
  }

  onDragEnd(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const distance = this.sheetDragOffset();
    const elapsedMs = Date.now() - this.dragStartTime;
    this.sheetDragOffset.set(0);
    if (this.dragDismisses(distance, elapsedMs)) {
      this.haptic.medium();
      this.closeSheet.emit();
    }
  }

  /**
   * Dismissal rule: far enough down, or a quick flick. The duration floor keeps
   * a jittery tap from registering as a flick when the clock barely advanced.
   */
  private dragDismisses(distance: number, elapsedMs: number): boolean {
    if (distance >= this.dragDismissThreshold) return true;
    if (elapsedMs < this.flickMinDurationMs || distance < this.flickMinDistance)
      return false;
    return distance / elapsedMs >= this.flickVelocity;
  }

  /** System interrupted the gesture (scroll takeover, call, etc.) — snap back without dismissing. */
  onDragCancel(): void {
    this.isDragging = false;
    this.sheetDragOffset.set(0);
  }

  loadStarter(starter: GenreStarter): void {
    this.haptic.medium();
    this.audioEngine.resume();
    this.lastStarterId.set(starter.id);
    this.rememberUse(RECENT_PREFIX.Pack + starter.id, {
      lastStarterId: starter.id,
    });

    // Match starter id or bpm to curated recipes in IdeasGeneratorService
    const recipe =
      this.ideas.recipes.find(
        (r) => r.id === starter.id || r.name.toLowerCase().includes(starter.id),
      ) || this.ideas.recommend(starter.bpm);

    this.musicManager.applyGeneratedRecipe(recipe);
    this.audioEngine.tempo.set(starter.bpm);

    // Auto-play the groove so the user experiences immediate creation
    try {
      this.audioEngine.start();
    } catch {
      // AudioContext resumed, playback triggered
    }

    this.snackbar.success(
      `Loaded ${starter.name} (${starter.bpm} BPM) — Ready to Jam!`,
    );
    this.navigateToView.emit("arrangement");
    this.closeSheet.emit();
  }

  setupVocalRecording(): void {
    this.haptic.medium();
    this.audioEngine.resume();

    // Ensure a vocal track exists
    const hasVocalTrack = this.musicManager
      .tracks()
      .some((t) => t.name.toLowerCase().includes("vocal"));
    if (!hasVocalTrack) {
      this.musicManager.addTrack("Lead Vocals", "grand-piano");
    }

    this.snackbar.info("Vocal Booth Armed — Mic check ready!");
    this.navigateToView.emit("vocal-suite");
    this.closeSheet.emit();
  }

  setupAudioRecorder(): void {
    this.haptic.light();
    this.audioEngine.resume();
    this.snackbar.info("Voice Recorder Ready — Tap record to capture ideas");
    this.navigateToView.emit("audio-recorder");
    this.closeSheet.emit();
  }

  /** Arm a one-tap vocal chain — ensures a vocal track exists, then opens the booth. */
  applyVocalPreset(preset: VocalPreset): void {
    this.haptic.medium();
    this.audioEngine.resume();
    this.lastVocalPresetId.set(preset.id);
    this.rememberUse(RECENT_PREFIX.Vocal + preset.id, {
      lastVocalPresetId: preset.id,
    });

    const hasVocalTrack = this.musicManager
      .tracks()
      .some((t) => t.name.toLowerCase().includes("vocal"));
    if (!hasVocalTrack) {
      this.musicManager.addTrack("Lead Vocals", "grand-piano");
    }

    this.snackbar.success(`${preset.name} armed — ${preset.chain.join(" · ")}`);
    this.navigateToView.emit("vocal-suite");
    this.closeSheet.emit();
  }

  applyChordMood(mood: QuickChordMood): void {
    this.haptic.medium();
    this.audioEngine.resume();
    this.lastChordMoodId.set(mood.id);
    this.rememberUse(RECENT_PREFIX.Chords + mood.id, {
      lastChordMoodId: mood.id,
    });

    // Generate predictive chord progression notes
    const { notes } = this.ideas.generatePredictiveNotes({
      key: mood.key.split(" ")[0],
      scale: mood.key.toLowerCase().includes("minor") ? "minor" : "major",
      genre: mood.id,
      barCount: 4,
    });

    if (notes.length > 0) {
      // Find or add a keys track
      let keysTrack = this.musicManager
        .tracks()
        .find(
          (t) =>
            t.name.toLowerCase().includes("keys") ||
            t.name.toLowerCase().includes("piano") ||
            t.name.toLowerCase().includes("chord"),
        );
      if (!keysTrack) {
        const trackId = this.musicManager.addTrack("Chords", "grand-piano");
        keysTrack = this.musicManager.tracks().find((t) => t.id === trackId);
      }

      if (keysTrack) {
        const trackNotes = notes.map((n, i) => ({
          id: `chord_${Date.now()}_${i}`,
          midi: n.midi,
          step: n.step,
          length: n.length,
          velocity: n.velocity,
        }));
        this.musicManager.replaceTrackNotes(keysTrack.id, trackNotes);
        this.snackbar.success(
          `Injected ${mood.label} chords into ${keysTrack.name}!`,
        );
      }
    }

    this.navigateToView.emit("piano-roll");
    this.closeSheet.emit();
  }

  openChordEditor(): void {
    this.haptic.light();
    this.navigateToView.emit("chord-editor");
    this.closeSheet.emit();
  }

  openAiProduce(): void {
    this.haptic.light();
    this.navigateToView.emit("ai-produce");
    this.closeSheet.emit();
  }

  openDrumMachine(): void {
    this.haptic.light();
    this.navigateToView.emit("drum-machine");
    this.closeSheet.emit();
  }

  openPianoRoll(): void {
    this.haptic.light();
    this.navigateToView.emit("piano-roll");
    this.closeSheet.emit();
  }
}
