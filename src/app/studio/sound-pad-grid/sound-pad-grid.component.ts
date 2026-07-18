import {
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoundPadComponent } from '../sound-pad/sound-pad.component';
import {
  InstrumentsService,
  InstrumentPreset,
} from '../../services/instruments.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';

interface PadSlot {
  index: number;
  label: string;
  presetId: string | null;
  color: string;
  active: boolean;
}

@Component({
  selector: 'app-sound-pad-grid',
  standalone: true,
  imports: [CommonModule, SoundPadComponent],
  templateUrl: './sound-pad-grid.component.html',
  styleUrls: ['./sound-pad-grid.component.css'],
})
export class SoundPadGridComponent {
  private instruments = inject(InstrumentsService);
  private musicManager = inject(MusicManagerService);
  private audioEngine = inject(AudioEngineService);
  private haptic = inject(HapticService);
  private snackbar = inject(SnackbarService);

  // ── Pad bank ─────────────────────────────────────────────
  pads = signal<PadSlot[]>([
    { index: 0, label: 'KICK',    presetId: 'kick',    color: '#FFB627', active: false },
    { index: 1, label: 'SNARE',   presetId: 'snare',   color: '#FF8A3D', active: false },
    { index: 2, label: 'HAT',     presetId: 'hat',     color: '#FF1A8C', active: false },
    { index: 3, label: 'CLAP',    presetId: 'clap',    color: '#8B5CF6', active: false },
    { index: 4, label: 'BASS',    presetId: 'bass',    color: '#00E5FF', active: false },
    { index: 5, label: 'KEY',     presetId: 'keys',    color: '#34F5C5', active: false },
    { index: 6, label: 'LEAD',    presetId: 'lead',    color: '#FF1A4D', active: false },
    { index: 7, label: 'PAD',     presetId: 'pad',     color: '#A5F8FF', active: false },
    { index: 8, label: 'VOX',     presetId: 'vox',     color: '#FFB627', active: false },
    { index: 9, label: 'PERC',    presetId: 'percussion', color: '#FF1A8C', active: false },
    { index: 10, label: 'FX 1',   presetId: 'fx-impact',  color: '#8B5CF6', active: false },
    { index: 11, label: 'FX 2',   presetId: 'fx-riser',   color: '#34F5C5', active: false },
    { index: 12, label: 'LOOP 1', presetId: 'loop-rnb',   color: '#00E5FF', active: false },
    { index: 13, label: 'LOOP 2', presetId: 'loop-trap',  color: '#FFB627', active: false },
    { index: 14, label: '808',    presetId: '808-kick',   color: '#FF1A4D', active: false },
    { index: 15, label: 'CRASH',  presetId: 'crash',      color: '#A5F8FF', active: false },
  ]);

  // ── Reassign form ────────────────────────────────────────
  public reassignIndex = signal<number | null>(null);
  allPresets = computed(() => this.instruments.getPresets());

  // ── Stats ─────────────────────────────────────────────────
  armedCount = computed(
    () => this.pads().filter((p) => p.presetId !== null).length
  );

  triggerPad(index: number): void {
    const pad = this.pads()[index];
    if (!pad) return;
    if (!pad.presetId) {
      this.snackbar.info('Empty pad — assign an instrument first');
      return;
    }
    this.haptic.medium();
    this.audioEngine.resume();

    // Flash highlight
    this.pads.update((list) =>
      list.map((p) => (p.index === index ? { ...p, active: true } : p))
    );
    setTimeout(() => {
      this.pads.update((list) =>
        list.map((p) =>
          p.index === index ? { ...p, active: false } : p
        )
      );
    }, 250);

    // 1) Audition the instrument (1-shot preview)
    this.instruments.audition(pad.presetId).catch(() => undefined);
    // 2) Pin to currently selected track so it commits
    const selected = this.musicManager.selectedTrackId();
    if (selected) {
      this.musicManager.setInstrument(selected, pad.presetId);
    }
  }

  clearAll(): void {
    this.haptic.light();
    this.pads.update((list) =>
      list.map((p) => ({ ...p, presetId: null, label: `EMPTY ${p.index + 1}` }))
    );
    this.snackbar.info('Pad bank cleared');
  }

  reassign(index: number, presetId: string): void {
    const preset: InstrumentPreset | undefined = this.allPresets().find(
      (p) => p.id === presetId
    );
    if (!preset) return;
    this.pads.update((list) =>
      list.map((p) =>
        p.index === index
          ? { ...p, presetId, label: preset.name.slice(0, 8).toUpperCase() }
          : p
      )
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
