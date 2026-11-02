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
import { WorkProtectionService } from "../../work-protection.service";
import {
  CompositionAuditionService,
  type AuditionScore,
} from "../../../composer/composition-audition.service";
import {
  templateMixPreviewPrefix,
  templatePatternPreviewId,
  templatePatternSelectionKey,
  templatePatternsPreviewId,
  templatePatternsToAuditionScore,
  templatePatternToAuditionScore,
  templatePreviewId,
  templateSectionBars,
  templateSectionPreviewId,
  templateSectionToAuditionScore,
  templateSectionsPreviewId,
  templateSectionsToAuditionScore,
  templateToAuditionScore,
  type TemplatePatternSelection,
} from "../template-audition.util";
import {
  MAX_SECTION_BARS,
  MIN_SECTION_BARS,
  ProjectTemplateService,
  type ProjectTemplate,
  type TemplateSection,
} from "../../../services/project-template.service";

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

interface TemplatePatternDetail {
  track: string;
  slot: string;
  launch: string;
  trackIndex: number;
  slotId: string | null;
  versions: { id: string; name: string; active: boolean }[];
}

interface TemplateSectionDetailRow {
  track: string;
  slot: string;
  version: string;
  available: boolean;
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
  private readonly workProtection = inject(WorkProtectionService);
  private profile = inject(UserProfileService);
  private projectTemplates = inject(ProjectTemplateService);
  private compositionAudition = inject(CompositionAuditionService);

  /** The artist's own saved channel/tempo templates, newest first. */
  readonly userTemplates = this.projectTemplates.userTemplates;
  readonly newTemplateName = signal("");
  /** Optional: capture the active MIDI/drum pattern and clip windows. */
  readonly includeTemplatePattern = signal(false);
  /** Which saved template's pattern breakdown is open. */
  readonly expandedTemplateId = signal<string | null>(null);
  /** Preview score id currently rendering or playing, if any. */
  readonly auditioningPreviewId = signal<string | null>(null);
  /** Breakdown rows in the combined preview, mapped to a chosen version. */
  readonly selectedPatternVersions = signal<
    ReadonlyMap<string, string | null>
  >(new Map());
  /** Name being edited for a reusable section of the current breakdown. */
  readonly sectionName = signal("");
  /** Saved section whose row/version contents are expanded. */
  readonly expandedSectionId = signal<string | null>(null);
  /** Saved section being renamed and its draft name. */
  readonly renamingSectionId = signal<string | null>(null);
  readonly sectionRenameName = signal("");
  /** Whether the open breakdown shows the saved-section reorder list. */
  readonly reorderingSections = signal(false);
  /** Saved-section auditions repeat their set bars until stopped. */
  readonly sectionAuditionLoop = signal(true);
  private selectedPatternTemplateId: string | null = null;

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

    if (typeof memory.sectionAuditionLoop === "boolean") {
      this.sectionAuditionLoop.set(memory.sectionAuditionLoop);
    }

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

  async loadStarter(starter: GenreStarter): Promise<void> {
    this.haptic.medium();
    // A starter replaces the whole sketch; never trade an unsaved one for it.
    if (!(await this.workProtection.preserveBeforeReplace("smart_starter"))) {
      return;
    }
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

  saveTemplate(): void {
    const template = this.projectTemplates.saveCurrentAsTemplate(
      this.newTemplateName(),
      this.includeTemplatePattern(),
    );
    if (!template) {
      this.snackbar.error(
        "Add at least one channel and give the template a name",
      );
      return;
    }
    const withPattern = this.includeTemplatePattern();
    this.newTemplateName.set("");
    this.haptic.medium();
    this.snackbar.success(
      withPattern
        ? `Saved template “${template.name}” with its pattern`
        : `Saved template “${template.name}”`,
    );
  }

  templateHasPattern(template: ProjectTemplate): boolean {
    return this.templatePatternCount(template) > 0;
  }

  templatePatternCount(template: ProjectTemplate): number {
    return template.tracks.reduce((total, track) => {
      const slots = track.patternSlots?.length ?? 0;
      return total + (slots || (track.notes?.length ? 1 : 0));
    }, 0);
  }

  templateVersionCount(template: ProjectTemplate): number {
    return template.tracks.reduce(
      (total, track) =>
        total +
        (track.patternSlots ?? []).reduce(
          (slotTotal, slot) => slotTotal + (slot.versions?.length ?? 0),
          0,
        ),
      0,
    );
  }

  /** Human summary for a template row; empty for channel-only templates. */
  templateContents(template: ProjectTemplate): string {
    const patterns = this.templatePatternCount(template);
    if (!patterns) return '';
    const versions = this.templateVersionCount(template);
    return `${patterns} pattern${patterns === 1 ? '' : 's'}${
      versions
        ? ` · ${versions} version${versions === 1 ? '' : 's'}`
        : ''
    }`;
  }

  /** Open or close a breakdown and seed its combined-preview selection. */
  toggleTemplateDetails(template: ProjectTemplate): void {
    this.haptic.light();
    const isOpen = this.expandedTemplateId() === template.id;
    const previousId = this.expandedTemplateId();
    if (previousId && previousId !== template.id) {
      this.stopTemplateMixPreview(previousId);
    }
    if (isOpen) {
      this.stopTemplateMixPreview(template.id);
      this.expandedTemplateId.set(null);
      this.sectionName.set("");
      this.expandedSectionId.set(null);
      this.renamingSectionId.set(null);
      this.sectionRenameName.set("");
      this.reorderingSections.set(false);
      this.clearPatternSelection();
      return;
    }
    this.expandedTemplateId.set(template.id);
    this.sectionName.set("");
    this.expandedSectionId.set(null);
    this.renamingSectionId.set(null);
    this.sectionRenameName.set("");
    this.reorderingSections.set(false);
    this.selectedPatternTemplateId = template.id;
    this.selectedPatternVersions.set(
      new Map(
        this.templateDetails(template).map(
          (detail): [string, string | null] => [
            templatePatternSelectionKey(detail.trackIndex, detail.slotId),
            null,
          ],
        ),
      ),
    );
  }

  /** Rows currently selected for the mix, in breakdown order. */
  selectedPatternSelections(
    template: ProjectTemplate,
  ): TemplatePatternSelection[] {
    if (this.selectedPatternTemplateId !== template.id) return [];
    return this.templateDetails(template)
      .filter((detail) => this.patternSelected(template, detail))
      .map((detail) => ({
        trackIndex: detail.trackIndex,
        slotId: detail.slotId,
        versionId:
          this.selectedPatternVersions().get(
            templatePatternSelectionKey(detail.trackIndex, detail.slotId),
          ) ?? null,
      }));
  }

  selectedPatternCount(template: ProjectTemplate): number {
    return this.selectedPatternSelections(template).length;
  }

  patternSelected(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
  ): boolean {
    if (this.selectedPatternTemplateId !== template.id) return false;
    return this.selectedPatternVersions().has(
      templatePatternSelectionKey(detail.trackIndex, detail.slotId),
    );
  }

  /** Selected version for the row's mix contribution; empty means live. */
  patternMixVersionId(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
  ): string {
    if (!this.patternSelected(template, detail)) return "";
    return (
      this.selectedPatternVersions().get(
        templatePatternSelectionKey(detail.trackIndex, detail.slotId),
      ) ?? ""
    );
  }

  /** Choose a saved version (or the live pattern) for one mixed row. */
  selectPatternMixVersion(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
    event: Event,
  ): void {
    event.stopPropagation();
    const select = event.target as HTMLSelectElement;
    this.setPatternMixVersion(template, detail, select.value || null);
  }

  /** Programmatic entry point used by the row selector and its tests. */
  setPatternMixVersion(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
    versionId: string | null,
  ): void {
    if (!this.patternSelected(template, detail)) return;
    if (
      versionId &&
      !detail.versions.some((version) => version.id === versionId)
    ) {
      return;
    }
    const key = templatePatternSelectionKey(detail.trackIndex, detail.slotId);
    if ((this.selectedPatternVersions().get(key) ?? null) === versionId) return;
    const next = new Map(this.selectedPatternVersions());
    next.set(key, versionId);
    this.selectedPatternTemplateId = template.id;
    this.selectedPatternVersions.set(next);
    this.stopTemplateMixPreview(template.id);
    this.haptic.light();
  }

  /** Include or exclude one row from the combined arrangement preview. */
  togglePatternSelection(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
    event?: Event,
  ): void {
    event?.stopPropagation();
    const key = templatePatternSelectionKey(detail.trackIndex, detail.slotId);
    const next = new Map(this.selectedPatternVersions());
    if (next.has(key)) next.delete(key);
    else next.set(key, null);
    this.selectedPatternTemplateId = template.id;
    this.selectedPatternVersions.set(next);
    // The old mix no longer matches the selection; never let it keep playing
    // or finish rendering over the artist's new choice.
    this.stopTemplateMixPreview(template.id);
    this.haptic.light();
  }

  templateSections(template: ProjectTemplate): TemplateSection[] {
    return template.sections ?? [];
  }

  /** Bounds for the arrangement-length stepper. */
  readonly minSectionBars = MIN_SECTION_BARS;
  readonly maxSectionBars = MAX_SECTION_BARS;

  /** Chosen arrangement length, or the length the saved patterns need. */
  sectionBars(template: ProjectTemplate, section: TemplateSection): number {
    return templateSectionBars(template, section);
  }

  /** True until the artist sets an explicit length for this section. */
  sectionLengthIsAuto(section: TemplateSection): boolean {
    return typeof section.bars !== "number";
  }

  /** Accessible readout for the length stepper. */
  sectionLengthLabel(
    template: ProjectTemplate,
    section: TemplateSection,
  ): string {
    const bars = this.sectionBars(template, section);
    return `${bars} bar${bars === 1 ? "" : "s"}${
      this.sectionLengthIsAuto(section) ? " · auto" : ""
    }`;
  }

  /**
   * Lengthen or shorten one saved section in the arrangement preview. The
   * change is persisted with the template and only the preview projection is
   * affected; no channel, clip or version is loaded.
   */
  adjustSectionBars(
    template: ProjectTemplate,
    section: TemplateSection,
    offset: number,
    event?: Event,
  ): void {
    event?.stopPropagation();
    if (!Number.isInteger(offset) || offset === 0) return;
    const current = this.sectionBars(template, section);
    const next = Math.max(
      MIN_SECTION_BARS,
      Math.min(MAX_SECTION_BARS, current + offset),
    );
    if (next === current) return;

    // The arrangement and this section's score are about to change; never
    // leave the old take playing under a control that no longer points at it.
    this.stopPreview(this.sectionPreviewId(template, section));
    this.stopSectionsPreview(template);
    const updated = this.projectTemplates.setTemplateSectionBars(
      template.id,
      section.id,
      next,
    );
    if (!updated) {
      this.snackbar.error("Could not change this section's length.");
      return;
    }
    this.haptic.light();
  }

  /** Stop only the saved-section arrangement, not an unrelated preview. */
  private stopSectionsPreview(template: ProjectTemplate): void {
    this.stopPreview(this.sectionsPreviewId(template));
  }

  /** Stop or cancel one specific preview, leaving every other score alone. */
  private stopPreview(id: string | null): void {
    if (!id) return;
    const playing = this.previewPlaying(id);
    const rendering =
      this.auditioningPreviewId() === id &&
      this.compositionAudition.rendering();
    if (playing) this.compositionAudition.stop();
    if (rendering) this.compositionAudition.clear();
    if (playing || rendering) this.auditioningPreviewId.set(null);
  }

  /** Resolve saved rows and versions to readable names before auditioning. */
  sectionDetailRows(
    template: ProjectTemplate,
    section: TemplateSection,
  ): TemplateSectionDetailRow[] {
    const details = new Map(
      this.templateDetails(template).map((detail) => [
        templatePatternSelectionKey(detail.trackIndex, detail.slotId),
        detail,
      ]),
    );
    return section.rows.map((row) => {
      const detail = details.get(
        templatePatternSelectionKey(row.trackIndex, row.slotId),
      );
      if (!detail) {
        return {
          track:
            template.tracks[row.trackIndex]?.name ??
            `Track ${row.trackIndex + 1}`,
          slot: "Pattern missing",
          version: "No longer in template",
          available: false,
        };
      }
      const version = row.versionId
        ? detail.versions.find((candidate) => candidate.id === row.versionId)
        : undefined;
      return {
        track: detail.track,
        slot: detail.slot,
        version: row.versionId
          ? version?.name ?? "Live pattern (saved version missing)"
          : "Live pattern",
        available: true,
      };
    });
  }

  /** Reveal a saved section's rows without starting its audition. */
  toggleSectionDetails(section: TemplateSection, event?: Event): void {
    event?.stopPropagation();
    this.expandedSectionId.update((current) =>
      current === section.id ? null : section.id,
    );
    this.haptic.light();
  }

  beginSectionRename(section: TemplateSection, event?: Event): void {
    event?.stopPropagation();
    this.renamingSectionId.set(section.id);
    this.sectionRenameName.set(section.name);
    this.haptic.light();
  }

  cancelSectionRename(event?: Event): void {
    event?.stopPropagation();
    this.renamingSectionId.set(null);
    this.sectionRenameName.set("");
    this.haptic.light();
  }

  /** Switch the open breakdown between section audition and reordering. */
  toggleSectionReorder(template: ProjectTemplate, event?: Event): void {
    event?.stopPropagation();
    if (
      !this.reorderingSections() &&
      this.templateSections(template).length < 2
    ) {
      return;
    }
    const next = !this.reorderingSections();
    this.reorderingSections.set(next);
    if (next) {
      // The reorder list hides the audition controls, so never leave a loop
      // playing with no visible way to stop it.
      this.stopTemplateMixPreview(template.id);
      this.expandedSectionId.set(null);
      this.renamingSectionId.set(null);
      this.sectionRenameName.set("");
    }
    this.haptic.light();
  }

  /**
   * Choose whether saved-section auditions loop their set bars or play once.
   * The preference is remembered and any section take already running stops,
   * so the next tap cannot contradict the switch.
   */
  toggleSectionAuditionLoop(template?: ProjectTemplate, event?: Event): void {
    event?.stopPropagation();
    const next = !this.sectionAuditionLoop();
    this.sectionAuditionLoop.set(next);
    if (template) this.stopActiveSectionAudition(template.id);
    this.remember({ sectionAuditionLoop: next });
    this.haptic.light();
  }

  /** Stop whichever saved section (not arrangement) is rendering or playing. */
  private stopActiveSectionAudition(templateId: string): void {
    const prefix = `${templateMixPreviewPrefix(templateId)}section-`;
    const playingId = this.compositionAudition.readyCompositionId();
    if (playingId?.startsWith(prefix) && this.compositionAudition.playing()) {
      this.compositionAudition.stop();
    }
    const renderingId = this.auditioningPreviewId();
    if (renderingId?.startsWith(prefix)) {
      this.compositionAudition.clear();
      this.auditioningPreviewId.set(null);
    }
  }

  /** Move a saved section one place earlier or later without auditioning. */
  moveSavedSection(
    template: ProjectTemplate,
    section: TemplateSection,
    offset: number,
    event?: Event,
  ): void {
    event?.stopPropagation();
    if (
      !this.projectTemplates.moveTemplateSection(
        template.id,
        section.id,
        offset,
      )
    ) {
      return;
    }
    this.haptic.light();
  }

  /** Accessible summary of the current saved-section order. */
  sectionOrderLabel(template: ProjectTemplate): string {
    const names = this.templateSections(template).map((section) => section.name);
    return names.length ? `Order: ${names.join(" → ")}` : "";
  }

  /** Rename a saved section in place, preserving its rows and id. */
  commitSectionRename(
    template: ProjectTemplate,
    section: TemplateSection,
    event?: Event,
  ): void {
    event?.stopPropagation();
    if (!this.sectionRenameName().trim()) {
      this.snackbar.error("Give the section a name.");
      return;
    }
    const renamed = this.projectTemplates.renameTemplateSection(
      template.id,
      section.id,
      this.sectionRenameName(),
    );
    if (!renamed) {
      this.snackbar.error("That section name is already in use.");
      return;
    }
    this.renamingSectionId.set(null);
    this.sectionRenameName.set("");
    this.haptic.medium();
    this.snackbar.success(`Renamed section to “${renamed.name}”.`);
  }

  /** Store the current row/version choices under a reusable section name. */
  saveCurrentSection(template: ProjectTemplate, event?: Event): void {
    event?.stopPropagation();
    const rows = this.selectedPatternSelections(template);
    if (!this.sectionName().trim() || !rows.length) {
      this.snackbar.info("Name the section and keep at least one row selected.");
      return;
    }
    const section = this.projectTemplates.saveTemplateSection(
      template.id,
      this.sectionName(),
      rows,
    );
    if (!section) {
      this.snackbar.error(
        "Could not save this section — check its name, selected rows, or the section limit.",
      );
      return;
    }
    this.sectionName.set("");
    this.haptic.medium();
    this.snackbar.success(
      `Saved section “${section.name}” with ${section.rows.length} row${
        section.rows.length === 1 ? "" : "s"
      }.`,
    );
  }

  /** True while this saved section is the mix being auditioned. */
  sectionAuditionPlaying(
    template: ProjectTemplate,
    section: TemplateSection,
  ): boolean {
    const id = this.sectionPreviewId(template, section);
    return !!id && this.previewPlaying(id);
  }

  /** True while this saved section's mix is rendering for playback. */
  sectionAuditionRendering(
    template: ProjectTemplate,
    section: TemplateSection,
  ): boolean {
    const id = this.sectionPreviewId(template, section);
    return (
      !!id &&
      this.auditioningPreviewId() === id &&
      this.compositionAudition.rendering()
    );
  }

  private sectionsPreviewId(template: ProjectTemplate): string | null {
    const sections = this.templateSections(template);
    return sections.length
      ? templateSectionsPreviewId(template.id, sections)
      : null;
  }

  /** True while saved sections are playing back-to-back in listed order. */
  sectionsPreviewPlaying(template: ProjectTemplate): boolean {
    const id = this.sectionsPreviewId(template);
    return !!id && this.previewPlaying(id);
  }

  sectionsPreviewRendering(template: ProjectTemplate): boolean {
    const id = this.sectionsPreviewId(template);
    return (
      !!id &&
      this.auditioningPreviewId() === id &&
      this.compositionAudition.rendering()
    );
  }

  sectionsPreviewActive(template: ProjectTemplate): boolean {
    return this.sectionsPreviewPlaying(template);
  }

  sectionsPreviewLabel(template: ProjectTemplate): string {
    if (this.sectionsPreviewRendering(template)) return "Rendering…";
    return this.sectionsPreviewPlaying(template) ? "Stop" : "Play all";
  }

  sectionsPreviewProgressPercent(template: ProjectTemplate): number {
    return this.sectionsPreviewActive(template)
      ? this.previewProgressPercent()
      : 0;
  }

  sectionsPreviewProgressLabel(template: ProjectTemplate): string {
    if (!this.sectionsPreviewActive(template)) return "";
    const count = this.templateSections(template).length;
    return `${count} section${count === 1 ? "" : "s"} · ${this.previewPositionLabel(
      "one pass",
    )}`;
  }

  /** Play the saved sections once, in their current listed order. */
  async auditionSavedSections(
    template: ProjectTemplate,
    event?: Event,
  ): Promise<void> {
    event?.stopPropagation();
    const sections = this.templateSections(template);
    const score = templateSectionsToAuditionScore(template, sections);
    if (!score) {
      this.snackbar.info("These saved sections have no playable notes.");
      return;
    }

    if (this.previewPlaying(score.id)) {
      this.compositionAudition.stop();
      this.auditioningPreviewId.set(null);
      this.haptic.light();
      this.snackbar.info("Stopped the saved-section arrangement.");
      return;
    }
    if (
      this.auditioningPreviewId() === score.id &&
      this.compositionAudition.rendering()
    ) {
      this.compositionAudition.clear();
      this.auditioningPreviewId.set(null);
      this.haptic.light();
      this.snackbar.info("Stopped the saved-section arrangement.");
      return;
    }

    this.stopTemplateMixPreview(template.id);
    this.haptic.medium();
    await this.previewScore(
      score,
      `${sections.length} saved section${
        sections.length === 1 ? "" : "s"
      } in order`,
      false,
    );
  }

  /**
   * Recall a named section and audition it without loading the template. The
   * preview loops only the section's set number of bars, not its whole saved
   * pattern.
   */
  async applySavedSection(
    template: ProjectTemplate,
    section: TemplateSection,
    event?: Event,
  ): Promise<void> {
    event?.stopPropagation();
    const selections = this.savedSectionSelections(template, section);
    if (!selections.length) {
      this.snackbar.info("This section no longer matches the template.");
      return;
    }
    const score = templateSectionToAuditionScore(template, section);
    if (!score) {
      this.snackbar.info(
        "This section has no playable notes at its set length.",
      );
      return;
    }

    // A second click is a stop/cancel, never an immediate restart.
    if (this.previewPlaying(score.id)) {
      this.compositionAudition.stop();
      this.auditioningPreviewId.set(null);
      this.haptic.light();
      this.snackbar.info(`Stopped section “${section.name}”.`);
      return;
    }
    if (
      this.auditioningPreviewId() === score.id &&
      this.compositionAudition.rendering()
    ) {
      this.compositionAudition.clear();
      this.auditioningPreviewId.set(null);
      this.haptic.light();
      this.snackbar.info(`Stopped section “${section.name}”.`);
      return;
    }

    this.stopTemplateMixPreview(template.id);
    this.selectedPatternTemplateId = template.id;
    this.selectedPatternVersions.set(
      new Map(
        selections.map((selection) => [
          templatePatternSelectionKey(selection.trackIndex, selection.slotId),
          selection.versionId ?? null,
        ]),
      ),
    );
    this.haptic.medium();
    const loop = this.sectionAuditionLoop();
    await this.previewScore(
      score,
      `section “${section.name}”${loop ? "" : " · one pass"}`,
      loop,
    );
  }

  /** Valid rows/versions from a saved section, in saved order. */
  private savedSectionSelections(
    template: ProjectTemplate,
    section: TemplateSection,
  ): TemplatePatternSelection[] {
    const details = new Map(
      this.templateDetails(template).map((detail) => [
        templatePatternSelectionKey(detail.trackIndex, detail.slotId),
        detail,
      ]),
    );
    const selections: TemplatePatternSelection[] = [];
    for (const row of section.rows) {
      const key = templatePatternSelectionKey(row.trackIndex, row.slotId);
      const detail = details.get(key);
      if (!detail) continue;
      const versionId =
        row.versionId &&
        detail.versions.some((version) => version.id === row.versionId)
          ? row.versionId
          : null;
      selections.push({
        trackIndex: row.trackIndex,
        slotId: row.slotId,
        versionId,
      });
    }
    return selections;
  }

  private sectionPreviewId(
    template: ProjectTemplate,
    section: TemplateSection,
  ): string | null {
    return this.savedSectionSelections(template, section).length
      ? templateSectionPreviewId(template, section)
      : null;
  }

  removeSavedSection(
    template: ProjectTemplate,
    section: TemplateSection,
    event?: Event,
  ): void {
    event?.stopPropagation();
    if (!this.projectTemplates.deleteTemplateSection(template.id, section.id)) {
      return;
    }
    if (this.expandedSectionId() === section.id) {
      this.expandedSectionId.set(null);
    }
    if (this.renamingSectionId() === section.id) {
      this.renamingSectionId.set(null);
      this.sectionRenameName.set("");
    }
    this.haptic.light();
    this.snackbar.info(`Deleted section “${section.name}”.`);
  }

  private clearPatternSelection(): void {
    this.selectedPatternTemplateId = null;
    this.selectedPatternVersions.set(new Map());
  }

  private stopTemplateMixPreview(templateId: string): void {
    const prefix = templateMixPreviewPrefix(templateId);
    const readyId = this.compositionAudition.readyCompositionId();
    if (readyId?.startsWith(prefix) && this.compositionAudition.playing()) {
      this.compositionAudition.stop();
    }
    const renderingId = this.auditioningPreviewId();
    if (renderingId?.startsWith(prefix)) {
      this.compositionAudition.clear();
      this.auditioningPreviewId.set(null);
    }
  }

  /** Pattern names and saved versions, grouped by channel. */
  templateDetails(template: ProjectTemplate): TemplatePatternDetail[] {
    return template.tracks.flatMap((track, trackIndex) => {
      const slots = track.patternSlots ?? [];
      if (!slots.length) {
        if (!track.notes?.length) return [];
        return [
          {
            track: track.name,
            slot: "Pattern 1",
            launch: "grid default",
            trackIndex,
            slotId: null,
            versions: [],
          },
        ];
      }
      return slots.map((slot) => ({
        track: track.name,
        slot: slot.name,
        launch:
          slot.launchQuantize === null || slot.launchQuantize === undefined
            ? "grid default"
            : slot.launchQuantize === "none"
              ? "no wait"
              : `wait ${slot.launchQuantize}`,
        trackIndex,
        slotId: slot.id,
        versions: (slot.versions ?? []).map((version) => ({
          id: version.id,
          name: version.name || version.id,
          active: version.id === slot.activeVersionId,
        })),
      }));
    });
  }

  private previewPlaying(scoreId: string): boolean {
    return (
      this.compositionAudition.playing() &&
      this.compositionAudition.readyCompositionId() === scoreId
    );
  }

  private previewLabel(scoreId: string): string {
    if (
      this.auditioningPreviewId() === scoreId &&
      this.compositionAudition.rendering()
    ) {
      return "Rendering…";
    }
    return this.previewPlaying(scoreId) ? "Stop" : "Audition";
  }

  /** True while the template-wide preview is the audible one. */
  templateAuditionPlaying(template: ProjectTemplate): boolean {
    return this.previewPlaying(templatePreviewId(template.id));
  }

  templateAuditionLabel(template: ProjectTemplate): string {
    return this.previewLabel(templatePreviewId(template.id));
  }

  /** Stable id for the mix of the currently selected breakdown rows. */
  private mixPreviewId(template: ProjectTemplate): string {
    return templatePatternsPreviewId(
      template.id,
      this.selectedPatternSelections(template),
    );
  }

  mixAuditionPlaying(template: ProjectTemplate): boolean {
    return this.previewPlaying(this.mixPreviewId(template));
  }

  mixAuditionLabel(template: ProjectTemplate): string {
    const id = this.mixPreviewId(template);
    if (
      this.auditioningPreviewId() === id &&
      this.compositionAudition.rendering()
    ) {
      return "Rendering…";
    }
    if (this.previewPlaying(id)) return "Stop mix";
    const count = this.selectedPatternCount(template);
    return count
      ? `Mix ${count} row${count === 1 ? "" : "s"}`
      : "Mix rows";
  }

  /** True while the combined arrangement preview is audible. */
  mixPreviewActive(template: ProjectTemplate): boolean {
    return this.previewPlaying(this.mixPreviewId(template));
  }

  mixPreviewProgressPercent(template: ProjectTemplate): number {
    return this.mixPreviewActive(template) ? this.previewProgressPercent() : 0;
  }

  mixPreviewProgressLabel(template: ProjectTemplate): string {
    if (!this.mixPreviewActive(template)) return "";
    const count = this.selectedPatternCount(template);
    return `${count} row${count === 1 ? "" : "s"} · ${this.previewPositionLabel()}`;
  }

  /** Stable preview id for one breakdown row or one of its saved versions. */
  patternPreviewId(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
    versionId?: string,
  ): string {
    return templatePatternPreviewId(
      template.id,
      detail.trackIndex,
      detail.slotId,
      versionId,
    );
  }

  patternAuditionPlaying(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
    versionId?: string,
  ): boolean {
    return this.previewPlaying(
      this.patternPreviewId(template, detail, versionId),
    );
  }

  patternAuditionLabel(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
    versionId?: string,
  ): string {
    return this.previewLabel(this.patternPreviewId(template, detail, versionId));
  }

  /** The live row or saved version currently audible for this row, if any. */
  private activePatternPreview(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
  ): {
    id: string;
    version?: TemplatePatternDetail["versions"][number];
  } | null {
    const liveId = this.patternPreviewId(template, detail);
    if (this.previewPlaying(liveId)) return { id: liveId };
    for (const version of detail.versions) {
      const id = this.patternPreviewId(template, detail, version.id);
      if (this.previewPlaying(id)) return { id, version };
    }
    return null;
  }

  /** Whether this row has an audible preview to show progress for. */
  patternPreviewActive(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
  ): boolean {
    return this.activePatternPreview(template, detail) !== null;
  }

  /** Position in the current pass, 0–100, for the row progress strip. */
  patternPreviewProgressPercent(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
  ): number {
    return this.patternPreviewActive(template, detail)
      ? this.previewProgressPercent()
      : 0;
  }

  /** Names the audible take and shows its bar/clock position while looping. */
  patternPreviewProgressLabel(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
  ): string {
    const active = this.activePatternPreview(template, detail);
    if (!active) return "";
    const take = active.version?.name ?? "Live pattern";
    return `${take} · ${this.previewPositionLabel()}`;
  }

  private previewProgressPercent(): number {
    return Math.round(
      Math.max(0, Math.min(1, this.compositionAudition.progress())) * 100,
    );
  }

  private previewPositionLabel(trailing = "loop"): string {
    const progress = Math.max(
      0,
      Math.min(1, this.compositionAudition.progress()),
    );
    const seconds = Math.max(0, this.compositionAudition.previewSeconds());
    const bars = Math.max(1, this.compositionAudition.previewBars());
    const bar = Math.min(bars, Math.floor(progress * bars) + 1);
    return `bar ${bar}/${bars} · ${this.previewClock(
      progress * seconds,
    )} / ${this.previewClock(seconds)} · ${trailing}`;
  }

  private previewClock(seconds: number): string {
    const total = Math.max(0, Math.round(seconds));
    return `${Math.floor(total / 60)}:${(total % 60)
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Hear every reopening pattern in a template without loading it. The preview
   * is a temporary score; tracks, clips and the open sketch stay exactly as they
   * are until the artist explicitly loads the template.
   */
  async auditionTemplate(
    template: ProjectTemplate,
    event?: Event,
  ): Promise<void> {
    event?.stopPropagation();
    const score = templateToAuditionScore(template);
    if (!score) {
      this.snackbar.info("This template has no MIDI or drum pattern to audition.");
      return;
    }
    await this.previewScore(score, template.name);
  }

  /**
   * Hear one breakdown row, or one specific saved version of it, without
   * loading the template or changing which version is active.
   */
  async auditionTemplatePattern(
    template: ProjectTemplate,
    detail: TemplatePatternDetail,
    event?: Event,
    versionId?: string,
  ): Promise<void> {
    event?.stopPropagation();
    const score = templatePatternToAuditionScore(
      template,
      detail.trackIndex,
      detail.slotId,
      versionId,
    );
    if (!score) {
      this.snackbar.info(
        versionId
          ? "This saved version has no playable notes."
          : "This pattern has no playable notes.",
      );
      return;
    }
    const version = versionId
      ? detail.versions.find((candidate) => candidate.id === versionId)
      : undefined;
    await this.previewScore(
      score,
      `${template.name} — ${detail.track} · ${detail.slot}${
        version ? ` · ${version.name}` : ""
      }`,
      true,
    );
  }

  /**
   * Hear the selected breakdown rows together. The mix uses each row's live
   * pattern, loops like an individual preview and never loads the template.
   */
  async auditionTemplateMix(
    template: ProjectTemplate,
    event?: Event,
    designation?: string,
  ): Promise<void> {
    event?.stopPropagation();
    const selections = this.selectedPatternSelections(template);
    if (!selections.length) {
      this.snackbar.info("Select at least one pattern row to mix.");
      return;
    }
    const score = templatePatternsToAuditionScore(template, selections);
    if (!score) {
      this.snackbar.info("The selected rows have no playable notes.");
      return;
    }
    const rows = score.parts.length;
    await this.previewScore(
      score,
      `${template.name} — ${
        designation ?? `${rows} row${rows === 1 ? "" : "s"} mixed`
      }`,
      true,
    );
  }

  /** Start, switch or stop a temporary template preview. */
  private async previewScore(
    score: AuditionScore,
    label: string,
    loop = false,
  ): Promise<void> {
    if (this.previewPlaying(score.id)) {
      this.compositionAudition.stop();
      this.auditioningPreviewId.set(null);
      this.haptic.light();
      return;
    }

    this.haptic.light();
    this.audioEngine.resume();
    this.auditioningPreviewId.set(score.id);
    try {
      await this.compositionAudition.startScore(score, loop);
      if (!this.compositionAudition.error()) {
        this.snackbar.info(
          `Auditioning ${label} — preview only, nothing loaded.`,
        );
      }
    } finally {
      if (this.auditioningPreviewId() === score.id) {
        this.auditioningPreviewId.set(null);
      }
    }
  }

  async applyUserTemplate(id: string): Promise<void> {
    if (!(await this.workProtection.preserveBeforeReplace("user_template"))) {
      return;
    }
    this.audioEngine.resume();
    this.projectTemplates.applyTemplate(id);
    this.haptic.medium();
    this.snackbar.success("Template loaded — channels and tempo restored");
    this.navigateToView.emit("arrangement");
    this.closeSheet.emit();
  }

  deleteUserTemplate(id: string, event: Event): void {
    event.stopPropagation();
    if (!this.projectTemplates.deleteUserTemplate(id)) return;
    if (this.expandedTemplateId() === id) {
      this.stopTemplateMixPreview(id);
      this.expandedTemplateId.set(null);
      this.sectionName.set("");
      this.expandedSectionId.set(null);
      this.renamingSectionId.set(null);
      this.sectionRenameName.set("");
      this.reorderingSections.set(false);
      this.clearPatternSelection();
    }
    this.haptic.light();
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
        this.musicManager.replaceTrackNotes(
          keysTrack.id,
          trackNotes,
          "Inject Chords",
        );
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
