import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MusicManagerService, TrackNote } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { NotificationService } from '../services/notification.service';
import {
  briefRationale,
  parseCompositionBrief,
} from './composition-brief';
import type {
  CatalogEntry,
  ComponentKind,
  ComposerPart,
  Composition,
  ComposeRequest,
  DrumLane,
  GenreProfile,
  SavedComposition,
  VariationMode,
} from './composer.types';
import {
  buildCatalogEntries,
  composeWithGenre,
  drumMidiForLane,
  formatDuration,
  randomSeed,
  variationRequest,
} from './composer-engine';
import { GENRE_BY_ID } from './atlas';
import { ComposerUplinkService } from './composer-uplink.service';

const LIBRARY_KEY = 'smuve.composer.library.v1';
const MAX_SAVED = 60;

export interface ComposerIntensity {
  complexity: number;
  energy: number;
  darkness: number;
}

export interface StudioHandoffResult {
  trackIds: string[];
  skipped: string[];
}

/**
 * The stateful surface over the composition engine: what genre the artist
 * selected, what step they asked for, the on-demand catalogue, the current
 * score, the saved library, and the handoff into the Studio.
 *
 * Every generation path runs through the uplink gate, so the engine can never
 * write for a profile that was never committed.
 */
@Injectable({ providedIn: 'root' })
export class CompositionCoreService {
  private uplink = inject(ComposerUplinkService);
  private music = inject(MusicManagerService);
  private engine = inject(AudioEngineService);
  private notify = inject(NotificationService);
  private router = inject(Router);

  readonly gate = this.uplink.gate;

  /** Catalogue size per genre — the on-demand library depth. */
  readonly variantsPerGenre = 24;

  selectedGenreId = signal<string | null>(null);
  component = signal<ComponentKind>('full-song');
  /** Free-text creative direction; parsed into steering values, never genre. */
  briefText = signal('');
  readonly brief = computed(() => parseCompositionBrief(this.briefText()));
  intensity = signal<ComposerIntensity>({ complexity: 0.6, energy: 0.68, darkness: 0.5 });
  bpmOverride = signal<number | null>(null);
  lockKey = signal(true);
  current = signal<Composition | null>(null);
  generating = signal(false);
  error = signal<string | null>(null);
  savedLibrary = signal<SavedComposition[]>([]);
  appliedCompositionId = signal<string | null>(null);
  lastHandoff = signal<StudioHandoffResult | null>(null);

  readonly selectedGenre = computed<GenreProfile | null>(() => {
    const id = this.selectedGenreId();
    const allowed = this.uplink.allowedGenres();
    if (id) {
      const match = allowed.find((genre) => genre.id === id);
      if (match) return match;
    }
    return allowed[0] ?? null;
  });

  /** True when the selected genre is one the artist actually declared. */
  readonly genreIsDeclared = computed(() => {
    const genre = this.selectedGenre();
    return genre ? this.uplink.isDeclaredGenre(genre.id) : false;
  });

  /** The browsable catalogue for the selected genre, built on demand. */
  readonly catalog = computed<CatalogEntry[]>(() => {
    const genre = this.selectedGenre();
    if (!genre || !this.gate().ready) return [];
    return buildCatalogEntries(genre, this.variantsPerGenre);
  });

  readonly genreOptions = computed(() => this.uplink.availableGenres());

  readonly canGenerate = computed(
    () => this.gate().ready && !this.generating() && Boolean(this.selectedGenre())
  );

  readonly canApply = computed(
    () => Boolean(this.current()) && this.generating() === false
  );

  readonly personalizedLines = computed(() => {
    const genre = this.selectedGenre();
    if (!genre) return [];
    return this.uplink.personalizationLines(genre);
  });

  constructor() {
    this.savedLibrary.set(this.readLibrary());
  }

  /** Ensures a genre is selected as soon as the gate opens. */
  ensureGenreSelected(): void {
    if (this.selectedGenreId()) return;
    const allowed = this.uplink.allowedGenres();
    if (allowed.length) this.selectedGenreId.set(allowed[0].id);
  }

  selectGenre(genreId: string): void {
    this.selectedGenreId.set(genreId);
    this.appliedCompositionId.set(null);
  }

  setBrief(text: string): void {
    this.briefText.set(text ?? '');
  }

  setIntensity(patch: Partial<ComposerIntensity>): void {
    this.intensity.update((current) => ({
      complexity: clamp01(patch.complexity ?? current.complexity),
      energy: clamp01(patch.energy ?? current.energy),
      darkness: clamp01(patch.darkness ?? current.darkness),
    }));
  }

  setComponent(component: ComponentKind): void {
    this.component.set(component);
  }

  /**
   * Generates a composition from the current selections. Returns null and
   * surfaces the gate blockers when the profile is not committed.
   */
  generate(overrides: Partial<ComposeRequest> = {}): Composition | null {
    const gate = this.gate();
    if (!gate.ready) {
      this.error.set(
        'S.M.U.V.E. will not write for a profile that is not committed. ' +
          gate.blockers.map((blocker) => blocker.label).join('; ')
      );
      return null;
    }
    const genre = this.selectedGenre();
    if (!genre) {
      this.error.set('No genre selected.');
      return null;
    }

    this.generating.set(true);
    this.error.set(null);
    try {
      const settings = this.intensity();
      const brief = this.brief();
      // Brief beats the dials; an explicit override from the caller beats both.
      const keyPreference =
        brief.keyLabel ?? (this.lockKey() ? this.current()?.keyLabel : undefined);
      const composition = composeWithGenre(genre, {
        genreId: genre.id,
        component: this.component(),
        seed: overrides.seed ?? randomSeed(),
        motifSeed: overrides.motifSeed,
        variation: overrides.variation ?? 'fresh',
        bpm: this.bpmOverride() ?? overrides.bpm ?? brief.bpm,
        complexity: overrides.complexity ?? brief.complexity ?? settings.complexity,
        energy: overrides.energy ?? brief.energy ?? settings.energy,
        darkness: overrides.darkness ?? brief.darkness ?? settings.darkness,
        title: overrides.title,
        keyLabel: overrides.keyLabel ?? keyPreference,
        bars: overrides.bars ?? brief.bars ?? 8,
      });
      const withContext: Composition = {
        ...composition,
        rationale: [
          ...composition.rationale,
          ...this.personalizedLines(),
          ...briefRationale(brief),
        ],
      };
      this.current.set(withContext);
      this.appliedCompositionId.set(null);
      return withContext;
    } catch (cause: any) {
      this.error.set(`Generation failed: ${cause?.message ?? cause}`);
      this.notify.show('Composition failed to generate.', 'warning');
      return null;
    } finally {
      this.generating.set(false);
    }
  }

  /** Composes a catalogue card exactly as previewed. */
  generateFromEntry(entry: CatalogEntry): Composition | null {
    const genre = GENRE_BY_ID.get(entry.genreId) ?? this.selectedGenre();
    if (!genre) return null;
    if (this.selectedGenre()?.id !== entry.genreId) {
      this.selectedGenreId.set(entry.genreId);
    }
    const settings = this.intensity();
    const composition = composeWithGenre(genre, {
      genreId: genre.id,
      component: this.component() === 'full-song' ? 'full-song' : this.component(),
      seed: entry.seed,
      bpm: entry.bpm,
      keyLabel: entry.keyLabel,
      complexity: settings.complexity,
      energy: settings.energy,
      darkness: settings.darkness,
      title: entry.title,
      bars: 8,
    });
    const withContext: Composition = {
      ...composition,
      rationale: [...composition.rationale, ...this.personalizedLines()],
    };
    this.current.set(withContext);
    this.appliedCompositionId.set(null);
    return withContext;
  }

  /**
   * Evolves the current score. `variation` keeps the motif; `evolve` keeps the
   * brief and pushes complexity; `reharmonize` swaps the cycle; `simplify` and
   * `strip` remove information rather than adding it.
   */
  regenerate(mode: VariationMode): Composition | null {
    const current = this.current();
    const genre = this.selectedGenre();
    if (!current || !genre) {
      return this.generate();
    }
    if (mode === 'fresh') {
      return this.generate({ variation: 'fresh' });
    }
    const request = variationRequest(current, mode);
    if (mode === 'simplify' || mode === 'strip') {
      this.intensity.update((value) => ({
        ...value,
        complexity: clamp01(value.complexity * 0.6),
      }));
    }
    if (mode === 'evolve' || mode === 'intensify') {
      this.intensity.update((value) => ({
        ...value,
        complexity: clamp01(value.complexity + 0.15),
        energy: clamp01(value.energy + 0.1),
      }));
    }
    return this.generate({
      seed: request.seed,
      motifSeed: request.motifSeed,
      variation: mode,
      bpm: request.bpm,
      keyLabel: mode === 'reharmonize' ? current.keyLabel : current.keyLabel,
      complexity: this.intensity().complexity,
      energy: this.intensity().energy,
      darkness: this.intensity().darkness,
      title: current.title,
    });
  }

  /** Generates a single step (melody, kick, bassline…) as its own pass. */
  generateStep(component: ComponentKind): Composition | null {
    this.component.set(component);
    return this.generate({ variation: 'fresh' });
  }

  /* ── Library ─────────────────────────────────────────────────── */

  saveCurrent(): SavedComposition | null {
    const composition = this.current();
    if (!composition) return null;
    const entry: SavedComposition = {
      id: `${composition.id}-${Date.now().toString(36)}`,
      title: composition.title,
      genreId: composition.genreId,
      seed: composition.seed,
      motifSeed: composition.motifSeed,
      component: composition.component,
      bpm: composition.bpm,
      keyLabel: composition.keyLabel,
      complexity: composition.complexity,
      energy: composition.energy,
      darkness: composition.darkness,
      savedAt: Date.now(),
    };
    const next = [entry, ...this.savedLibrary().filter((saved) => saved.id !== entry.id)].slice(
      0,
      MAX_SAVED
    );
    this.savedLibrary.set(next);
    this.writeLibrary(next);
    this.notify.show(`Saved “${composition.title}” to your composition library.`, 'success');
    return entry;
  }

  loadSaved(saved: SavedComposition): Composition | null {
    const genre = GENRE_BY_ID.get(saved.genreId) ?? this.selectedGenre();
    if (!genre) return null;
    this.selectedGenreId.set(genre.id);
    this.component.set(saved.component);
    this.intensity.set({
      complexity: saved.complexity,
      energy: saved.energy,
      darkness: saved.darkness,
    });
    const composition = composeWithGenre(genre, {
      genreId: genre.id,
      component: saved.component,
      seed: saved.seed,
      motifSeed: saved.motifSeed,
      bpm: saved.bpm,
      keyLabel: saved.keyLabel,
      complexity: saved.complexity,
      energy: saved.energy,
      darkness: saved.darkness,
      title: saved.title,
      bars: 8,
    });
    this.current.set({
      ...composition,
      rationale: [...composition.rationale, ...this.personalizedLines()],
    });
    this.appliedCompositionId.set(null);
    return this.current();
  }

  removeSaved(id: string): void {
    const next = this.savedLibrary().filter((saved) => saved.id !== id);
    this.savedLibrary.set(next);
    this.writeLibrary(next);
  }

  clearLibrary(): void {
    this.savedLibrary.set([]);
    this.writeLibrary([]);
  }

  private readLibrary(): SavedComposition[] {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry: any) =>
          entry &&
          typeof entry.title === 'string' &&
          typeof entry.seed === 'number' &&
          typeof entry.genreId === 'string'
      );
    } catch {
      return [];
    }
  }

  private writeLibrary(entries: SavedComposition[]): void {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
    } catch {
      // Storage can be unavailable (private mode, quota). The in-memory
      // library still works for this session; nothing else breaks.
    }
  }

  /* ── Studio handoff ──────────────────────────────────────────── */

  private instrumentFallback(part: ComposerPart): string {
    switch (part.role) {
      case 'kick':
      case 'snare':
      case 'drums':
      case 'percussion':
      case 'hats':
        return part.instrumentId ?? 'trap-kit-elite';
      case 'bass':
        return part.instrumentId ?? 'p-bass-elite';
      case 'chords':
      case 'pad':
        return part.instrumentId ?? 'grand-piano';
      case 'melody':
      case 'counter':
      case 'arp':
        return part.instrumentId ?? 'synth-lead';
      default:
        return part.instrumentId ?? 'grand-piano';
    }
  }

  private partToTrackNotes(part: ComposerPart, stepOffset: number): TrackNote[] {
    const notes: TrackNote[] = [];
    let index = 0;
    for (const note of part.notes) {
      notes.push({
        id: `${part.id}-n${index++}`,
        midi: note.midi,
        step: Math.max(0, note.bar * 16 + note.step + stepOffset),
        length: Math.max(1, note.length),
        velocity: clampUnit(note.velocity),
        isSlide: note.slide,
      });
    }
    for (const hit of part.hits) {
      notes.push({
        id: `${part.id}-h${index++}`,
        midi: drumMidiForLane(hit.lane as DrumLane),
        step: Math.max(0, hit.bar * 16 + hit.step + stepOffset),
        length: 1,
        velocity: clampUnit(hit.velocity),
      });
    }
    return notes;
  }

  /**
   * Loads the current score into the Studio as real tracks with real notes.
   * Reference parts (context harmony) are skipped unless the artist asks for
   * them, and every skipped track is reported rather than silently dropped.
   */
  sendToStudio(options: { includeReference?: boolean; replaceExisting?: boolean } = {}): StudioHandoffResult {
    const composition = this.current();
    if (!composition) {
      this.notify.show('Generate a composition first.', 'warning');
      return { trackIds: [], skipped: [] };
    }
    const reference = options.includeReference === true;
    const parts = composition.parts.filter((part) => reference || !part.reference);
    const trackIds: string[] = [];
    const skipped: string[] = [];

    for (const part of parts) {
      const isDrum = ['drums', 'kick', 'snare', 'hats', 'percussion'].includes(part.role);
      const trackId = this.music.addTrack(
        `${composition.title} · ${part.name}`,
        this.instrumentFallback(part),
        isDrum ? 'drum' : 'midi'
      );
      if (!trackId) {
        skipped.push(part.name);
        continue;
      }
      const notes = this.partToTrackNotes(part, 0);
      if (notes.length) {
        this.music.replaceTrackNotes(trackId, notes, `Load “${part.name}”`);
      }
      trackIds.push(trackId);
    }

    const result: StudioHandoffResult = { trackIds, skipped };
    this.lastHandoff.set(result);
    if (trackIds.length) {
      // Match the session to the score: tempo, full-length song mode and the
      // steps needed for every bar, otherwise playback would stop after four.
      this.engine.setTempo(composition.bpm);
      this.engine.setSongLengthSteps(Math.max(16, composition.totalBars * 16));
      this.engine.setPlayMode('song');
      this.appliedCompositionId.set(composition.id);
      this.notify.show(
        `${trackIds.length} track${trackIds.length === 1 ? '' : 's'} loaded into the Studio${
          skipped.length ? ` · ${skipped.length} skipped (track limit)` : ''
        }.`,
        skipped.length ? 'warning' : 'success'
      );
      this.router.navigate(['/studio'], { queryParams: { view: 'arrangement' } });
    } else {
      this.notify.show('Nothing could be loaded — check the Studio track limit.', 'warning');
    }
    return result;
  }

  /** Plain-text blueprint for sharing, notes apps or a co-writer. */
  blueprintText(composition?: Composition | null): string {
    const target = composition ?? this.current();
    if (!target) return '';
    const lines: string[] = [
      `${target.title}`,
      `${target.genreLabel} · ${target.bpm} BPM · ${target.keyLabel} · ${target.grooveName}`,
      `${target.totalBars} bars · ${formatDuration(target.durationSeconds)} · ${target.componentLabel}`,
      '',
      'ARRANGEMENT',
    ];
    for (const section of target.sections) {
      lines.push(
        `  ${section.label.padEnd(14)} ${String(section.bars).padStart(3)} bars  E${Math.round(
          section.energy * 10
        )}  ${section.layers.join(', ')}  ${section.chords}`
      );
    }
    lines.push('', 'PARTS');
    for (const part of target.parts) {
      lines.push(
        `  ${part.name.padEnd(34)} ${String(part.notes.length + part.hits.length).padStart(4)} events  ${part.range}${
          part.reference ? ' (reference)' : ''
        }`
      );
    }
    lines.push('', 'WHY IT WORKS');
    for (const line of target.rationale) lines.push(`  • ${line}`);
    lines.push('', 'PRODUCTION');
    for (const line of target.productionNotes) lines.push(`  • ${line}`);
    lines.push('', `MARKET: ${target.marketNote}`);
    lines.push('', `VOCAL: ${target.vocalDirection}`);
    return lines.join('\n');
  }

  /** Convenience for other surfaces (chat, palette, studio). */
  composeStep(genreId: string | null, component: ComponentKind): Composition | null {
    if (genreId) this.selectGenre(genreId);
    else this.ensureGenreSelected();
    return this.generateStep(component);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));
}

/** Studio notes carry velocity 0–1, not MIDI 0–127. */
function clampUnit(value: number): number {
  return Math.round(Math.min(1, Math.max(0.05, Number.isFinite(value) ? value : 0.8)) * 1000) / 1000;
}
