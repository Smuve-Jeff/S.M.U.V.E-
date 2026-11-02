import { Component, inject, signal, computed, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SoundPadComponent } from "../sound-pad/sound-pad.component";
import {
  InstrumentsService,
  InstrumentPreset,
} from "../../services/instruments.service";
import { MusicManagerService } from "../../services/music-manager.service";
import { AudioEngineService } from "../../services/audio-engine.service";
import { HapticService } from "../../services/haptic.service";
import { SnackbarService } from "../../services/snackbar.service";

interface PadSlot {
  index: number;
  label: string;
  presetId: string | null;
  /**
   * MIDI note the pad auditions. Drum kits map one voice per note (36 kick,
   * 38 snare, 42 closed hat, 46 open hat, 60/62/64 congas), so a pad without a
   * note always auditioned the kick — "SNARE" played a kick drum. Every pad
   * that names a drum voice therefore carries the note that voice lives on.
   */
  note?: number;
  color: string;
  active: boolean;
}

@Component({
  selector: "app-sound-pad-grid",
  standalone: true,
  imports: [CommonModule, SoundPadComponent],
  templateUrl: "./sound-pad-grid.component.html",
  styleUrls: ["./sound-pad-grid.component.css", "../shared/platform-ux.css"],
})
export class SoundPadGridComponent implements OnDestroy {
  private instruments = inject(InstrumentsService);
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);

  /**
   * The 4×4 bank. Labels are the voices these pads actually trigger: the
   * trap kit provides kick/snare/closed hat/open hat, the Afro-Cuban kit the
   * congas, and the tonal pads play their own preset at middle C. Pads no
   * longer claim sounds the presets do not contain (the old "CLAP", "CRASH"
   * and "LOOP" pads all auditioned something else).
   */
  pads = signal<PadSlot[]>([
    {
      index: 0,
      label: "KICK",
      presetId: "trap-kit-elite",
      note: 36,
      color: "#FFB627",
      active: false,
    },
    {
      index: 1,
      label: "SNARE",
      presetId: "trap-kit-elite",
      note: 38,
      color: "#FF8A3D",
      active: false,
    },
    {
      index: 2,
      label: "HAT",
      presetId: "trap-kit-elite",
      note: 42,
      color: "#FF1A8C",
      active: false,
    },
    {
      index: 3,
      label: "OPEN HAT",
      presetId: "trap-kit-elite",
      note: 46,
      color: "#8B5CF6",
      active: false,
    },
    {
      index: 4,
      label: "BASS",
      presetId: "sub-commander",
      note: 36,
      color: "#00E5FF",
      active: false,
    },
    {
      index: 5,
      label: "808",
      presetId: "trap-808-elite",
      note: 36,
      color: "#FF1A4D",
      active: false,
    },
    {
      index: 6,
      label: "CONGA HI",
      presetId: "afro-cuban-kit",
      note: 60,
      color: "#FFB627",
      active: false,
    },
    {
      index: 7,
      label: "CONGA LO",
      presetId: "afro-cuban-kit",
      note: 64,
      color: "#A5F8FF",
      active: false,
    },
    {
      index: 8,
      label: "RHODES",
      presetId: "rhodes-mk2-stage",
      note: 60,
      color: "#34F5C5",
      active: false,
    },
    {
      index: 9,
      label: "MOOG",
      presetId: "minimoog-model-d-lead",
      note: 60,
      color: "#FF1A4D",
      active: false,
    },
    {
      index: 10,
      label: "WARM PAD",
      presetId: "analog-warmth",
      note: 60,
      color: "#A5F8FF",
      active: false,
    },
    {
      index: 11,
      label: "CHOIR",
      presetId: "choir-ensemble",
      note: 60,
      color: "#FFB627",
      active: false,
    },
    {
      index: 12,
      label: "TABLA",
      presetId: "tabla-classic",
      note: 60,
      color: "#FF1A8C",
      active: false,
    },
    {
      index: 13,
      label: "STAB",
      presetId: "cyber-stab",
      note: 60,
      color: "#8B5CF6",
      active: false,
    },
    {
      index: 14,
      label: "SUPERSAW",
      presetId: "supersaw-stack",
      note: 60,
      color: "#34F5C5",
      active: false,
    },
    {
      index: 15,
      label: "VHS PAD",
      presetId: "vhs-memory",
      note: 60,
      color: "#00E5FF",
      active: false,
    },
  ]);

  // ── Note repeat ─────────────────────────────────────────
  noteRepeatEnabled = signal(false);
  /** 4 = quarter, 2 = eighth, 1 = sixteenth. */
  repeatDivisions = [
    { id: 4, label: "1/4" },
    { id: 2, label: "1/8" },
    { id: 1, label: "1/16" },
  ];
  repeatDivision = signal(1);
  private repeatDelay: ReturnType<typeof setTimeout> | null = null;
  private repeatTimer: ReturnType<typeof setInterval> | null = null;

  // ── Reassign form ────────────────────────────────────────
  public reassignIndex = signal<number | null>(null);
  allPresets = computed(() => this.instruments.getPresets());

  // ── Stats ─────────────────────────────────────────────────
  /** Pads that hold a preset (what the "LOADED" readout reports). */
  loadedCount = computed(
    () => this.pads().filter((p) => p.presetId !== null).length,
  );
  /** Kept as an alias for the existing templates/tests. */
  armedCount = this.loadedCount;

  triggerPad(index: number): void {
    const pad = this.pads()[index];
    if (!pad) return;
    if (!pad.presetId) {
      this.openReassign(index);
      return;
    }
    this.haptic.medium();
    this.audioEngine.resume();

    // Flash highlight
    this.pads.update((list) =>
      list.map((p) => (p.index === index ? { ...p, active: true } : p)),
    );
    setTimeout(() => {
      this.pads.update((list) =>
        list.map((p) => (p.index === index ? { ...p, active: false } : p)),
      );
    }, 250);

    // 1) Audition the exact voice on the label (kick vs snare vs open hat).
    this.instruments
      .audition(pad.presetId, pad.note)
      .catch(() => undefined);
    // 2) Pin to currently selected track so it commits
    const selected = this.musicManager.selectedTrackId();
    if (selected) {
      this.musicManager.setInstrument(selected, pad.presetId);
    }
  }

  toggleNoteRepeat(): void {
    this.noteRepeatEnabled.update((value) => !value);
    if (!this.noteRepeatEnabled()) this.stopPadRepeat();
    this.haptic.light();
  }

  setRepeatDivision(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.repeatDivision.set(value === 4 || value === 2 ? value : 1);
  }

  /** Hold a pad to retrigger at the current transport BPM. */
  startPadRepeat(index: number): void {
    this.stopPadRepeat();
    if (!this.noteRepeatEnabled()) return;
    this.repeatDelay = setTimeout(() => {
      const division = this.repeatDivision();
      const bpm = Math.max(20, Math.min(300, this.audioEngine.tempo?.() ?? 120));
      const intervalMs = (60_000 / bpm) * (division / 4);
      this.triggerPad(index);
      this.repeatTimer = setInterval(() => this.triggerPad(index), intervalMs);
    }, 320);
  }

  stopPadRepeat(): void {
    if (this.repeatDelay) clearTimeout(this.repeatDelay);
    if (this.repeatTimer) clearInterval(this.repeatTimer);
    this.repeatDelay = null;
    this.repeatTimer = null;
  }

  ngOnDestroy(): void {
    this.stopPadRepeat();
  }

  clearAll(): void {
    this.haptic.light();
    this.pads.update((list) =>
      list.map((p) => ({
        ...p,
        presetId: null,
        note: undefined,
        label: `EMPTY ${p.index + 1}`,
      })),
    );
    this.snackbar.info("Pad bank cleared");
  }

  reassign(index: number, presetId: string): void {
    const preset: InstrumentPreset | undefined = this.allPresets().find(
      (p) => p.id === presetId,
    );
    if (!preset) return;
    this.pads.update((list) =>
      list.map((p) =>
        p.index === index
          ? {
              ...p,
              presetId,
              // A newly assigned instrument keeps its own default audition
              // note: the previous pad's note may not exist on this preset.
              note: undefined,
              label: preset.name.slice(0, 8).toUpperCase(),
            }
          : p,
      ),
    );
    this.reassignIndex.set(null);
    this.snackbar.success(`Pad ${index + 1} → ${preset.name}`);
  }

  openReassign(index: number): void {
    this.haptic.light();
    this.reassignIndex.set(this.reassignIndex() === index ? null : index);
  }

  trackByIndex = (_: number, item: PadSlot) => item.index;
}
