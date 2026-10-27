import {
  Component,
  signal,
  inject,
  computed,
  effect,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SmartRecordingService, CompTake } from "../smart-recording.service";
import {
  VocalCompSuggesterService,
  CompSuggestion,
} from "../vocal-comp-suggester.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { SnackbarService } from "../../services/snackbar.service";
import { LoggingService } from "../../services/logging.service";
import { computeWaveformPeaks } from "../waveform-peaks";

type CompareMode = "off" | "a-b" | "all";

/** Bars in a take's waveform strip; the row is fixed-width in the layout. */
const WAVEFORM_BARS = 48;

@Component({
  selector: "app-vocal-comp-view",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./vocal-comp-view.component.html",
  styleUrls: ["./vocal-comp-view.component.css", "../shared/platform-ux.css"],
})
export class VocalCompViewComponent implements OnDestroy {
  private smartRecording = inject(SmartRecordingService);
  private audioEngine = inject(AudioEngineService);
  private snackbar = inject(SnackbarService);
  private logger = inject(LoggingService);
  private suggester = inject(VocalCompSuggesterService);

  // ── State ──────────────────────────────────────────────
  selectedGroupId = signal<string | null>(null);
  compareMode = signal<CompareMode>("off");
  abReferenceTakeId = signal<string | null>(null);
  playingTakeId = signal<string | null>(null);
  isExporting = signal(false);
  searchQuery = signal("");

  /** Suggested "best" take from the AI comp suggester for the selected group. */
  suggestion = signal<CompSuggestion | null>(null);
  searchingSuggestion = signal(false);

  // ── Computed ───────────────────────────────────────────
  compGroups = computed(() => this.smartRecording.compGroups());

  selectedGroup = computed(() => {
    const id = this.selectedGroupId() || this.compGroups()[0]?.id || null;
    if (id !== this.selectedGroupId()) {
      // Auto-select first group
      return this.compGroups().find((g) => g.id === id) || null;
    }
    return this.compGroups().find((g) => g.id === id) || null;
  });

  takes = computed(() => this.selectedGroup()?.takes || []);

  selectedTake = computed(() => {
    const group = this.selectedGroup();
    if (!group?.selectedTakeId) return null;
    return group.takes.find((t) => t.id === group.selectedTakeId) || null;
  });

  compTake = computed(() => {
    return this.takes().find((t) => t.isCompSelection) || null;
  });

  hasTakes = computed(() => this.takes().length > 0);

  takeCount = computed(() => this.takes().length);

  filteredGroups = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.compGroups();
    return this.compGroups().filter(
      (g) =>
        g.sectionLabel.toLowerCase().includes(q) ||
        g.trackName.toLowerCase().includes(q),
    );
  });

  /**
   * Real peaks per take, decoded once and cached by take id.
   *
   * The strip used to draw the same synthetic pattern for every take, so two
   * passes a minute apart looked identical — the one thing a comp view exists to
   * help the artist hear apart. `peaksRevision` exists because a Map is not
   * reactive: bumping it after a decode is what redraws the rows.
   */
  private readonly peaksByTakeId = new Map<string, number[]>();
  private readonly peaksPending = new Set<string>();
  private readonly peaksUnavailable = new Set<string>();
  private readonly peaksRevision = signal(0);
  private destroyed = false;

  constructor() {
    // Decode every visible take once. `takes()` narrows to the selected group,
    // so switching sections decodes only what the artist is about to compare.
    effect(() => {
      for (const take of this.takes()) void this.loadTakePeaks(take);
    });
  }

  // ── Group management ───────────────────────────────────
  selectGroup(groupId: string) {
    this.selectedGroupId.set(groupId);
    // Keep the service's recording target on the section the artist is looking
    // at, otherwise takes recorded elsewhere land in whichever section happened
    // to be created last.
    this.smartRecording.setActiveCompGroup(groupId);
    this.compareMode.set("off");
    this.playingTakeId.set(null);
  }

  createNewGroup() {
    this.smartRecording.startNewCompGroup(
      "vocal-track",
      "Vocal Track",
      `Section ${this.compGroups().length + 1}`,
    );
    this.selectedGroupId.set(this.smartRecording.activeCompGroupId());
    this.snackbar.info("New comp group created");
  }

  deleteGroup(groupId: string) {
    const group = this.compGroups().find((g) => g.id === groupId);
    if (!group) return;
    this.smartRecording.deleteCompGroup(groupId);
    if (this.selectedGroupId() === groupId) {
      // Fall back to the first remaining section and re-point recording at it,
      // so the next take does not silently create a fresh group. The deleted id
      // is excluded explicitly rather than trusting list order.
      const next = this.compGroups().find((g) => g.id !== groupId)?.id ?? null;
      this.selectedGroupId.set(next);
      if (next) this.smartRecording.setActiveCompGroup(next);
    }
    this.snackbar.info(`Group "${group.sectionLabel}" deleted`);
  }

  renameGroup(groupId: string, newLabel: string) {
    this.smartRecording.compGroups.update((groups) =>
      groups.map((g) =>
        g.id === groupId ? { ...g, sectionLabel: newLabel } : g,
      ),
    );
  }

  // ── Take operations ────────────────────────────────────
  selectTake(takeId: string) {
    const group = this.selectedGroup();
    if (!group) return;
    this.smartRecording.selectCompTake(group.id, takeId);
    this.compareMode.set("off");
  }

  toggleMute(groupId: string, takeId: string) {
    this.smartRecording.toggleTakeMute(groupId, takeId);
  }

  deleteTake(groupId: string, takeId: string) {
    this.smartRecording.deleteTake(groupId, takeId);
    this.snackbar.info("Take deleted");
  }

  /**
   * Play / stop a take. The button is a toggle: tapping the take that is
   * currently sounding stops it instead of restarting it, which is what the
   * play/stop icon in the template promises.
   */
  playTake(takeId: string) {
    if (this.playingTakeId() === takeId) {
      this.stopPlayback();
      return;
    }

    const group = this.selectedGroup();
    if (!group) return;
    const take = group.takes.find((t) => t.id === takeId);
    if (!take || !take.url) return;

    // Stop any other take before starting this one.
    this.stopPlayback();

    const audio = new Audio(take.url);
    // Own the element before playback starts so a rejected start (autoplay
    // policy, stale blob URL) still has a stop path and never leaves a
    // dangling "playing" highlight.
    this._currentAudio = audio;
    audio.onended = () => {
      if (this._currentAudio === audio) this._currentAudio = null;
      this.playingTakeId.set(null);
    };
    this.playingTakeId.set(takeId);

    const started = audio.play();
    if (started && typeof started.catch === "function") {
      started.catch((error) => {
        this.logger.warn("Take playback failed", error);
        this.snackbar.error("Could not play this take");
        if (this._currentAudio === audio) this.stopPlayback();
      });
    }
  }

  stopPlayback() {
    if (this._currentAudio) {
      this._currentAudio.onended = null;
      this._currentAudio.pause();
      this._currentAudio = null;
    }
    this.playingTakeId.set(null);
  }

  /** Leaving the view must not leave a take playing in the background. */
  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPlayback();
  }

  // ── A/B Comparison ────────────────────────────────────
  toggleCompare() {
    const modes: CompareMode[] = ["off", "a-b", "all"];
    const currentIndex = modes.indexOf(this.compareMode());
    const nextIndex = (currentIndex + 1) % modes.length;
    this.compareMode.set(modes[nextIndex]);

    if (modes[nextIndex] === "off") {
      this.abReferenceTakeId.set(null);
    } else if (modes[nextIndex] === "a-b" && this.compTake()) {
      // Set reference to the current comp selection
      this.abReferenceTakeId.set(this.compTake()?.id || null);
    }
  }

  setReferenceTake(takeId: string) {
    this.abReferenceTakeId.set(takeId);
    this.snackbar.info("Reference take set for A/B comparison");
  }

  // ── Comp assembly ─────────────────────────────────────
  assembleComp(): string {
    // Collect all non-muted takes and play them in sequence
    const group = this.selectedGroup();
    if (!group) return "";

    const activeTakes = group.takes.filter((t) => !t.isMuted);
    if (activeTakes.length === 0) return "";

    // Return the URL of the comp-selected take
    const compTake = group.takes.find((t) => t.isCompSelection);
    if (compTake?.url) return compTake.url;

    return activeTakes[activeTakes.length - 1]?.url || "";
  }

  // ── AI comp suggestion ─────────────────────────────────
  suggestBestTake() {
    const group = this.selectedGroup();
    if (!group) return;
    this.searchingSuggestion.set(true);
    const found = this.suggester.suggestBestTake(group.id);
    this.suggestion.set(found);
    this.searchingSuggestion.set(false);
    if (found) {
      this.snackbar.info(
        `AI suggests Take ${found.takeNumber} (${found.score}/100)`,
      );
    } else {
      this.snackbar.warning(
        "No usable takes to suggest from — record at least one",
      );
    }
  }

  applySuggestedTake() {
    const group = this.selectedGroup();
    const s = this.suggestion();
    if (!group || !s) return;
    this.smartRecording.selectCompTake(group.id, s.takeId);
    this.snackbar.success(`Applied suggested Take ${s.takeNumber} as the comp`);
  }

  clearSuggestion() {
    this.suggestion.set(null);
  }

  // ── Export ────────────────────────────────────────────
  async exportComp() {
    const group = this.selectedGroup();
    if (!group || group.takes.length === 0) return;

    this.isExporting.set(true);

    try {
      const fileName = `SMUVE_Comp_${group.sectionLabel.replace(/\s+/g, "_")}_${Date.now()}.wav`;

      // A split section is a bar-by-bar comp, so the export has to render the
      // assigned takes with crossfaded joins rather than hand back one take.
      // Unsplit groups *are* a single take, so those keep the direct copy.
      if (group.segments?.length) {
        const assembled = await this.smartRecording.renderCompAssembly(
          group.id,
        );
        if (!assembled) {
          this.snackbar.warning("No comp selection to export");
          return;
        }
        this.downloadBlob(assembled, fileName);
        this.snackbar.success(`Comp "${group.sectionLabel}" exported as WAV`);
        return;
      }

      // Find the comp selection or fall back to last take
      const compTake =
        group.takes.find((t) => t.isCompSelection) ||
        group.takes[group.takes.length - 1];

      if (!compTake?.blob) {
        this.snackbar.warning("No comp selection to export");
        return;
      }

      // Trigger download
      const a = document.createElement("a");
      a.href = compTake.url;
      a.download = fileName;
      a.click();

      this.snackbar.success(`Comp "${group.sectionLabel}" exported as WAV`);
    } catch (e) {
      this.logger.error("Export failed", e);
      this.snackbar.error("Export failed");
    } finally {
      this.isExporting.set(false);
    }
  }

  async exportAllTakes() {
    const group = this.selectedGroup();
    if (!group || group.takes.length === 0) return;

    this.isExporting.set(true);

    try {
      for (const take of group.takes) {
        if (!take.url) continue;
        const a = document.createElement("a");
        a.href = take.url;
        a.download = `SMUVE_Take${take.takeNumber}_${group.sectionLabel.replace(/\s+/g, "_")}.wav`;
        a.click();
        // Small delay between downloads
        await new Promise((r) => setTimeout(r, 200));
      }
      this.snackbar.success(`${group.takes.length} takes exported`);
    } catch (e) {
      this.logger.error("Export all failed", e);
      this.snackbar.error("Export failed");
    } finally {
      this.isExporting.set(false);
    }
  }

  // ── Utility ───────────────────────────────────────────
  /** Save a generated audio blob through a temporary object URL. */
  private downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    // Release the URL once the browser has taken the bytes; revoking it
    // synchronously can cancel a download that has not started yet.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs.toString().padStart(2, "0")}`;
  }

  getTakeColor(takeNumber: number): string {
    const colors = [
      "#10b981",
      "#a855f7",
      "#f59e0b",
      "#ec4899",
      "#3b82f6",
      "#ef4444",
      "#14b8a6",
      "#f97316",
    ];
    return colors[(takeNumber - 1) % colors.length];
  }

  /**
   * The bars for one take: its own decoded peaks, or an empty strip while the
   * decode is in flight / after it failed. Empty is honest — a placeholder
   * pattern is indistinguishable from audio and was the bug this replaced.
   */
  takePeaks(take: CompTake): number[] {
    this.peaksRevision();
    return this.peaksByTakeId.get(take.id) ?? [];
  }

  /**
   * Decode a take once and cache its peaks.
   *
   * Failures are remembered per take so a blob the browser cannot decode (an
   * unsupported codec, a truncated write) is not retried on every change
   * detection pass; that would make the whole list janky for one bad take.
   */
  private async loadTakePeaks(take: CompTake): Promise<void> {
    if (
      !take.blob ||
      this.peaksByTakeId.has(take.id) ||
      this.peaksPending.has(take.id) ||
      this.peaksUnavailable.has(take.id)
    ) {
      return;
    }

    const context = this.audioEngine.ctx;
    if (!context?.decodeAudioData) {
      this.peaksUnavailable.add(take.id);
      return;
    }

    this.peaksPending.add(take.id);
    try {
      const buffer = await context.decodeAudioData(await take.blob.arrayBuffer());
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
        buffer.getChannelData(i),
      );
      if (this.destroyed) return;
      this.peaksByTakeId.set(
        take.id,
        computeWaveformPeaks(channels, WAVEFORM_BARS),
      );
      this.peaksRevision.update((revision) => revision + 1);
    } catch (error) {
      this.peaksUnavailable.add(take.id);
      this.logger.warn(`Could not render the waveform for ${take.label}`, error);
    } finally {
      this.peaksPending.delete(take.id);
    }
  }

  private _currentAudio: HTMLAudioElement | null = null;
}
