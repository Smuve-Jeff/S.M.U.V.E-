import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  COMPONENT_OPTIONS,
  formatDuration as formatTrackDuration,
} from '../../composer/composer-engine';
import type {
  CatalogEntry,
  ComponentKind,
  ComposerPart,
  GenreProfile,
  SavedComposition,
  VariationMode,
} from '../../composer/composer.types';
import {
  CompositionCoreService,
  type CompositionPass,
} from '../../composer/composition-core.service';
import { ComposerUplinkService } from '../../composer/composer-uplink.service';
import { CompositionAuditionService } from '../../composer/composition-audition.service';
import { briefSummary } from '../../composer/composition-brief';
import {
  comparePasses,
  type PassComparison,
} from '../../composer/composition-compare';
import { NotificationService } from '../../services/notification.service';

interface PreviewCell {
  on: boolean;
  velocity: number;
}

interface PreviewLane {
  label: string;
  cells: PreviewCell[];
}

interface PartPreview {
  id: string;
  part: ComposerPart;
  lanes: PreviewLane[];
  kind: 'drums' | 'notes' | 'empty';
}

const DRUM_LANE_ORDER = ['kick', 'snare', 'clap', 'rim', 'hat', 'openhat', 'ride', 'perc', 'shaker', 'tom', 'crash'];
const DRUM_LANE_LABEL: Record<string, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  rim: 'Rim',
  hat: 'Closed hat',
  openhat: 'Open hat',
  ride: 'Ride',
  perc: 'Perc',
  shaker: 'Shaker',
  tom: 'Tom',
  crash: 'Crash',
};
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

@Component({
  selector: 'app-composition-core',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './composition-core.component.html',
  styleUrls: ['./composition-core.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompositionCoreComponent implements OnInit, OnDestroy {
  readonly core = inject(CompositionCoreService);
  readonly uplink = inject(ComposerUplinkService);
  readonly audition = inject(CompositionAuditionService);
  private notify = inject(NotificationService);

  readonly components = COMPONENT_OPTIONS;
  readonly formatDuration = formatTrackDuration;
  readonly libraryQuery = signal('');
  readonly showLibrary = signal(true);
  readonly copied = signal(false);
  readonly compareA = signal<string | null>(null);
  readonly compareB = signal<string | null>(null);

  readonly comparison = computed<PassComparison | null>(() => {
    const history = this.core.passHistory();
    const a = history.find((pass) => pass.id === this.compareA());
    const b = history.find((pass) => pass.id === this.compareB());
    return a && b ? comparePasses(a, b) : null;
  });

  readonly filteredCatalog = computed(() => {
    const query = this.libraryQuery().trim().toLowerCase();
    const catalog = this.core.catalog();
    if (!query) return catalog;
    return catalog.filter((entry) =>
      [entry.title, entry.keyLabel, entry.hook, ...entry.tags]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  });

  readonly genreTempoLabel = computed(() => {
    const genre = this.core.selectedGenre();
    return genre ? `${genre.bpm[0]}–${genre.bpm[1]} BPM` : '';
  });

  readonly previews = computed<PartPreview[]>(() => {
    const composition = this.core.current();
    if (!composition) return [];
    return composition.parts.map((part) => this.buildPreview(part));
  });

  readonly briefChips = computed(() => briefSummary(this.core.brief()));

  readonly renderPercent = computed(() =>
    Math.round(
      Math.max(0, Math.min(1, this.audition.renderProgress())) * 100,
    ),
  );

  readonly auditionLabel = computed(() => {
    if (this.audition.rendering()) return 'Cancel render';
    return this.audition.playing() ? 'Stop audition' : 'Audition';
  });

  readonly auditionNote = computed(() => {
    const composition = this.core.current();
    if (!composition) return '';
    if (this.audition.rendering()) {
      const detail = [
        this.audition.renderSliceLabel(),
        this.audition.renderEtaLabel(),
      ]
        .filter(Boolean)
        .join(' · ');
      return `Synthesizing the written score · ${this.renderPercent()}%${
        detail ? ` · ${detail}` : ''
      }`;
    }
    if (this.audition.playing()) {
      return `Playing the written score · ${this.audition.previewBars()} bars`;
    }
    if (this.audition.readyCompositionId() === composition.id) {
      return `Rendered ${formatTrackDuration(this.audition.previewSeconds())} · synthesized from the score, not a mix`;
    }
    return `Audition the whole ${formatTrackDuration(composition.durationSeconds)} pass before loading it`;
  });

  readonly auditionMemory = computed(() => {
    const composition = this.core.current();
    return composition
      ? this.audition.memoryEstimateFor(composition.durationSeconds)
      : null;
  });

  readonly generateLabel = computed(() => {
    if (this.core.generating()) return 'Writing…';
    const option = this.components.find((entry) => entry.id === this.core.component());
    return `Generate ${option?.shortLabel ?? 'music'}`;
  });

  readonly totalEvents = computed(() => {
    const composition = this.core.current();
    if (!composition) return 0;
    return composition.parts.reduce(
      (sum, part) => sum + part.notes.length + part.hits.length,
      0
    );
  });

  ngOnInit(): void {
    this.core.ensureGenreSelected();
  }

  ngOnDestroy(): void {
    this.audition.stop();
  }

  toggleAudition(): void {
    if (this.audition.rendering()) {
      this.audition.cancelRender();
      return;
    }
    const composition = this.core.current();
    if (!composition) return;
    void this.audition.toggle(composition);
  }

  componentDescription(kind: ComponentKind): string {
    return this.components.find((entry) => entry.id === kind)?.description ?? '';
  }

  componentIcon(kind: ComponentKind): string {
    return this.components.find((entry) => entry.id === kind)?.icon ?? 'music_note';
  }

  selectGenre(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.core.selectGenre(value);
  }

  setComponent(kind: ComponentKind): void {
    this.core.setComponent(kind);
  }

  setBrief(event: Event): void {
    this.core.setBrief((event.target as HTMLTextAreaElement).value);
  }

  selectIntensity(key: 'complexity' | 'energy' | 'darkness', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    this.core.setIntensity({ [key]: value });
  }

  setBpm(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw ? Math.round(Number(raw)) : null;
    this.core.bpmOverride.set(value && value > 40 && value < 220 ? value : null);
  }

  toggleKeyLock(): void {
    this.core.lockKey.update((value) => !value);
  }

  generate(): void {
    const composition = this.core.generate();
    if (composition) {
      this.notify.show(`“${composition.title}” is ready.`, 'success');
    }
  }

  generateFromEntry(entry: CatalogEntry, event?: Event): void {
    event?.preventDefault();
    this.core.generateFromEntry(entry);
  }

  regenerate(mode: VariationMode): void {
    this.core.regenerate(mode);
  }

  generateStep(kind: ComponentKind): void {
    this.core.generateStep(kind);
  }

  restorePass(pass: CompositionPass): void {
    this.audition.stop();
    this.core.restorePass(pass);
    this.notify.show(`Restored “${pass.composition.title}”.`, 'info');
  }

  isCurrentPass(pass: CompositionPass): boolean {
    return this.core.current() === pass.composition;
  }

  setCompare(slot: 'a' | 'b', pass: CompositionPass, event: Event): void {
    event.stopPropagation();
    const target = slot === 'a' ? this.compareA : this.compareB;
    const other = slot === 'a' ? this.compareB : this.compareA;
    if (target() === pass.id) {
      target.set(null);
      return;
    }
    if (other() === pass.id) other.set(null);
    target.set(pass.id);
  }

  isCompareSelected(slot: 'a' | 'b', pass: CompositionPass): boolean {
    return (slot === 'a' ? this.compareA() : this.compareB()) === pass.id;
  }

  /** Auditions one comparison card straight from its saved pass. */
  toggleCompareAudition(passId: string): void {
    const pass = this.core.passHistory().find((entry) => entry.id === passId);
    if (!pass) return;
    if (this.audition.rendering()) {
      this.audition.cancelRender();
      return;
    }
    if (this.isAuditioning(passId)) {
      this.audition.stop();
      return;
    }
    void this.audition.start(pass.composition);
  }

  isAuditioning(passId: string): boolean {
    const pass = this.core.passHistory().find((entry) => entry.id === passId);
    return Boolean(
      pass &&
        this.audition.playing() &&
        this.audition.readyCompositionId() === pass.composition.id
    );
  }

  comparisonAuditionLabel(passId: string): string {
    if (this.audition.rendering()) return 'Cancel render';
    return this.isAuditioning(passId) ? 'Stop audition' : 'Audition this side';
  }

  /** Which comparison card is the pass currently on the desk. */
  isCurrentCompareCard(passId: string): boolean {
    const pass = this.core.passHistory().find((entry) => entry.id === passId);
    return Boolean(pass && this.core.current() === pass.composition);
  }

  swapCompare(): void {
    const a = this.compareA();
    this.compareA.set(this.compareB());
    this.compareB.set(a);
  }

  restoreCompareCard(passId: string): void {
    const pass = this.core.passHistory().find((entry) => entry.id === passId);
    if (!pass || this.core.current() === pass.composition) return;
    this.restorePass(pass);
  }

  clearCompare(): void {
    this.compareA.set(null);
    this.compareB.set(null);
  }

  clearHistory(): void {
    this.clearCompare();
    this.core.clearPassHistory();
  }

  /** Compact delta against the pass currently on the desk. */
  passDelta(pass: CompositionPass): string {
    const current = this.core.current();
    if (!current) return 'not on the desk';
    if (current === pass.composition) return 'current';
    const parts: string[] = [];
    const bars = pass.composition.totalBars - current.totalBars;
    if (bars) parts.push(`${bars > 0 ? '+' : ''}${bars} bars`);
    const bpm = pass.composition.bpm - current.bpm;
    if (bpm) parts.push(`${bpm > 0 ? '+' : ''}${bpm} BPM`);
    const energy = Math.round((pass.composition.energy - current.energy) * 100);
    if (energy) parts.push(`energy ${energy > 0 ? '+' : ''}${energy}%`);
    const darkness = Math.round((pass.composition.darkness - current.darkness) * 100);
    if (darkness) parts.push(`dark ${darkness > 0 ? '+' : ''}${darkness}%`);
    if (pass.brief !== this.core.briefText().trim()) parts.push('brief differs');
    return parts.join(' · ') || 'same shape';
  }

  sendToStudio(): void {
    this.core.sendToStudio();
  }

  save(): void {
    this.core.saveCurrent();
  }

  loadSaved(saved: SavedComposition): void {
    this.core.loadSaved(saved);
  }

  removeSaved(saved: SavedComposition, event: Event): void {
    event.stopPropagation();
    this.core.removeSaved(saved.id);
  }

  async copyBlueprint(): Promise<void> {
    const text = this.core.blueprintText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      this.notify.show('Blueprint copied to clipboard.', 'success');
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.notify.show('Clipboard is unavailable in this browser.', 'warning');
    }
  }

  toggleLibrary(): void {
    this.showLibrary.update((value) => !value);
  }

  setLibraryQuery(event: Event): void {
    this.libraryQuery.set((event.target as HTMLInputElement).value);
  }

  intensityPercent(key: 'complexity' | 'energy' | 'darkness'): number {
    return Math.round(this.core.intensity()[key] * 100);
  }

  trackByTitle(_index: number, item: { title: string }): string {
    return item.title;
  }

  genreIsOutOfProfile(genre: GenreProfile): boolean {
    return !this.uplink.isDeclaredGenre(genre.id);
  }

  private buildPreview(part: ComposerPart): PartPreview {
    if (part.hits.length) {
      const lanes: PreviewLane[] = [];
      const present = DRUM_LANE_ORDER.filter((lane) =>
        part.hits.some((hit) => hit.lane === lane)
      );
      for (const lane of present.slice(0, 8)) {
        const cells: PreviewCell[] = [];
        for (let step = 0; step < 32; step++) {
          const bar = Math.floor(step / 16);
          const inBar = step % 16;
          const hit = part.hits.find(
            (candidate) =>
              candidate.lane === lane && candidate.bar === bar && candidate.step === inBar
          );
          cells.push({ on: Boolean(hit), velocity: hit?.velocity ?? 0 });
        }
        lanes.push({ label: DRUM_LANE_LABEL[lane] ?? lane, cells });
      }
      return { id: part.id, part, lanes, kind: lanes.length ? 'drums' : 'empty' };
    }

    if (!part.notes.length) {
      return { id: part.id, part, lanes: [], kind: 'empty' };
    }

    const visible = part.notes.filter((note) => note.bar < 2);
    const pitches = [...new Set(visible.map((note) => note.midi))]
      .sort((a, b) => b - a)
      .slice(0, 10);
    const lanes: PreviewLane[] = pitches.map((midi) => {
      const cells: PreviewCell[] = [];
      for (let step = 0; step < 32; step++) {
        const bar = Math.floor(step / 16);
        const inBar = step % 16;
        const note = visible.find(
          (candidate) =>
            candidate.midi === midi &&
            candidate.bar === bar &&
            inBar >= candidate.step &&
            inBar < candidate.step + Math.max(1, candidate.length)
        );
        cells.push({ on: Boolean(note), velocity: note?.velocity ?? 0 });
      }
      return { label: `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`, cells };
    });
    return { id: part.id, part, lanes, kind: lanes.length ? 'notes' : 'empty' };
  }
}
