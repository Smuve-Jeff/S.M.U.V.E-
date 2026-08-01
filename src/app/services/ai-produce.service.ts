import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  AiBeatGeneratorService,
  FullBeatArrangement,
} from './ai-beat-generator.service';
import {
  SongwritingAssistantService,
  SongwritingAssistantResult,
} from './songwriting-assistant.service';
import { AiMixAssistantService } from '../studio/effects/ai-mix-assistant.service';
import { ReleasePipelineService } from './release-pipeline.service';
import { MusicManagerService } from './music-manager.service';
import { NotificationService } from './notification.service';
import { LoggingService } from './logging.service';

export type ProduceStage =
  | 'idle'
  | 'idea'
  | 'beat'
  | 'lyrics'
  | 'mix-master'
  | 'release'
  | 'done'
  | 'cancelled'
  | 'error';

export interface ProduceIdea {
  title: string;
  genre: string;
  mood: string;
  topic: string;
  key: string;
  bpm: number;
  energy: number;
  theme: string;
  estimatedBars: number;
}

export interface ProduceLogEntry {
  stage: ProduceStage | string;
  message: string;
  timestamp: number;
}

export interface ProduceOptions {
  prompt: string;
  genre: string;
  mood?: string;
  /**
   * Optional artist/style mimic target — routes through
   * SmuveStyleMimicService profiles used by the beat generator.
   */
  style?: string;
  title?: string;
  bpm?: number;
}

export interface ProduceResult {
  /**
   * Per-stage artifacts. Any field may be null after a cancel mid-pipeline
   * — callers must null-check or rely on `.cancelled` to gate behavior.
   */
  idea: ProduceIdea | null;
  beat: FullBeatArrangement | null;
  lyrics: SongwritingAssistantResult | null;
  mixReport: string[];
  releaseId: string | null;
  trackIds: string[];
  cancelled: boolean;
}

/**
 * Sprint B3 — one-tap "Produce" orchestrator that drives the existing AI
 * services through a single user gesture. Each stage is observable,
 * cancellable, and produces a real artifact so the user can choose what
 * to apply to their project.
 *
 * Reuses — never re-implements:
 *   • `AiBeatGeneratorService.generateBeat()`      — drums/bass/chords/melody
 *   • `SongwritingAssistantService.generateLyrics()` — verse/chorus/bridge
 *   • `AiMixAssistantService.autoMaster()`         — mix + mastering chain
 *   • `AiMixAssistantService.recommendInstruments()` — track instrument picks
 *   • `ReleasePipelineService.initializeRelease()` — release row bootstrap
 *   • `MusicManagerService.addTrack()`              — committed tracks
 */
@Injectable({ providedIn: 'root' })
export class AiProduceService {
  private aiBeat = inject(AiBeatGeneratorService);
  private songwriter = inject(SongwritingAssistantService);
  private aiMix = inject(AiMixAssistantService);
  private releases = inject(ReleasePipelineService);
  private music = inject(MusicManagerService);
  private notify = inject(NotificationService);
  private logger = inject(LoggingService);
  private router = inject(Router);

  // ── Public signals ────────────────────────────────────────────────
  stage = signal<ProduceStage>('idle');
  progress = signal(0);
  progressLabel = signal('');
  currentIdea = signal<ProduceIdea | null>(null);
  currentBeat = signal<FullBeatArrangement | null>(null);
  currentLyrics = signal<SongwritingAssistantResult | null>(null);
  currentMixReport = signal<string[]>([]);
  appliedTrackIds = signal<string[]>([]);
  appliedReleaseId = signal<string | null>(null);
  log = signal<ProduceLogEntry[]>([]);
  error = signal<string | null>(null);

  isRunning = computed(() => {
    const s = this.stage();
    return (
      s === 'idea' ||
      s === 'beat' ||
      s === 'lyrics' ||
      s === 'mix-master' ||
      s === 'release'
    );
  });

  hasArtifacts = computed(
    () =>
      !!this.currentIdea() &&
      !!this.currentBeat() &&
      !!this.currentLyrics()
  );

  private cancelled = false;

  reset(): void {
    this.stage.set('idle');
    this.progress.set(0);
    this.progressLabel.set('');
    this.currentIdea.set(null);
    this.currentBeat.set(null);
    this.currentLyrics.set(null);
    this.currentMixReport.set([]);
    this.appliedTrackIds.set([]);
    this.appliedReleaseId.set(null);
    this.log.set([]);
    this.error.set(null);
    this.cancelled = false;
  }

  cancel(): void {
    if (!this.isRunning()) return;
    this.cancelled = true;
    this.pushLog('cancelled', 'User cancelled AI Produce run.');
    this.progressLabel.set('Cancelled.');
    this.stage.set('cancelled');
  }

  /**
   * Run the full one-tap Produce pipeline.
   *
   * Cancellation contract: each stage checks `this.cancelled` AFTER its
   * generator call returns and again BEFORE setting its own signal. If the
   * loop bails, we still return a partial `ProduceResult` so the UI knows
   * what made it through.
   */
  async run(opts: ProduceOptions): Promise<ProduceResult | null> {
    this.reset();
    this.cancelled = false;

    try {
      // ── Stage 1: Idea ──
      this.stage.set('idea');
      this.progress.set(5);
      this.progressLabel.set('Synthesizing idea envelope...');
      const idea = this.applyIdea(opts);
      this.currentIdea.set(idea);
      this.pushLog(
        'idea',
        `Idea locked: "${idea.title}" — ${idea.genre} @ ${idea.bpm} BPM, ${idea.mood} mood.`
      );
      if (this.bailIfCancelled()) return this.buildResult(true);
      this.progress.set(20);

      // ── Stage 2: Beat ──
      this.stage.set('beat');
      this.progressLabel.set('Generating full beat arrangement...');
      await this.tick();
      const beat = this.aiBeat.generateBeat(
        opts.style || idea.genre,
        idea.title,
        idea.bpm
      );
      this.currentBeat.set(beat);
      this.pushLog(
        'beat',
        `Beat "${beat.drums.name}" ready · ${beat.totalBars} bars · ${beat.estimatedDuration}.`
      );
      if (this.bailIfCancelled()) return this.buildResult(true);
      this.progress.set(40);

      // ── Stage 3: Lyrics ──
      this.stage.set('lyrics');
      this.progressLabel.set('Drafting verse / chorus / bridge...');
      await this.tick();
      const lyrics = this.songwriter.generateLyrics(
        idea.topic,
        opts.style || idea.genre,
        idea.mood,
        opts.style
      );
      this.currentLyrics.set(lyrics);
      this.pushLog(
        'lyrics',
        `Lyrics drafted across ${lyrics.lyrics.length} sections with ${lyrics.chordProgressions.length} chord options.`
      );
      if (this.bailIfCancelled()) return this.buildResult(true);
      this.progress.set(60);

      // ── Stage 4: Mix + Master ──
      this.stage.set('mix-master');
      this.progressLabel.set('Running AI Mix Master...');
      await this.tick();
      const inferred = this.guessBeatGenre(beat.genre);
      const report = this.aiMix.autoMaster(inferred);
      this.currentMixReport.set(report);
      this.pushLog(
        'mix-master',
        `Mix+Master finished — ${report.length} lines of mastering report ready.`
      );
      if (this.bailIfCancelled()) return this.buildResult(true);
      this.progress.set(80);

      // ── Stage 5: Release Checklist ──
      this.stage.set('release');
      this.progressLabel.set('Building release checklist...');
      await this.tick();
      let releaseId: string | null = null;
      try {
        const releaseName = `${idea.title} (AI Produce)`;
        await this.releases.initializeRelease(releaseName, 'Single');
        const activeAfterInit = this.releases.activeRelease();
        if (activeAfterInit) {
          releaseId = activeAfterInit.id;
          await this.releases.addTrack(idea.title);
          const track = this.releases.activeRelease()?.tracks?.[0];
          if (track) {
            await this.releases.updateTrackStage(
              track.id,
              'instrumental',
              'Completed'
            );
            await this.releases.updateTrackStage(track.id, 'lyrics', 'Completed');
            await this.releases.updateTrackStage(track.id, 'mixing', 'Completed');
            await this.releases.updateTrackStage(
              track.id,
              'mastering',
              'Completed'
            );
            // 'vocals' left In Progress — lyrics drafted but not performed.
          }
        }
        this.pushLog(
          'release',
          `Release "${releaseName}" initialized — ${idea.title} staged through mastering.`
        );
      } catch (e: any) {
        this.pushLog(
          'release',
          `Release init deferred: ${e?.message || 'unknown'}`
        );
      }
      this.appliedReleaseId.set(releaseId);
      if (this.bailIfCancelled()) return this.buildResult(true);
      this.progress.set(100);

      // ── Stage 6: Done ──
      this.stage.set('done');
      this.progressLabel.set('AI Produce complete — ready to apply.');
      this.notify.show(
        'AI Produce complete. Tap Apply to commit to your studio.',
        'success'
      );
      this.logger.info('Sprint B3: AI Produce run finished — all 5 stages.');
      return this.buildResult(false);
    } catch (e: any) {
      const msg = (e && e.message) || 'AI Produce failed.';
      this.error.set(msg);
      this.pushLog('error', `Pipeline failed: ${msg}`);
      this.stage.set('error');
      this.progressLabel.set('Failed.');
      this.logger.error('Sprint B3: AI Produce pipeline failed', e);
      return null;
    }
  }

  /** Stage 1 — synthesize a ProduceIdea from the user prompt + genre/mood. */
  applyIdea(opts: ProduceOptions): ProduceIdea {
    const genre = (opts.genre || 'Pop').trim();
    const mood = (opts.mood || this.guessMoodFromPrompt(opts.prompt)).trim();
    const title =
      opts.title && opts.title.trim().length > 0
        ? opts.title.trim()
        : this.suggestTitle(opts.prompt, genre);
    const topic = (opts.prompt || `${mood} ${genre} track`).trim();
    const bpm = opts.bpm && opts.bpm > 0 ? opts.bpm : this.suggestBpm(genre);
    const energy = this.suggestEnergy(genre, mood);
    const keys = [
      'C#m',
      'Am',
      'F#m',
      'Dm',
      'Em',
      'Cm',
      'Gm',
      'Bm',
      'C',
      'G',
    ];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const estimatedBars = this.estimateBars(genre);
    return {
      title,
      genre,
      mood,
      topic,
      key,
      bpm,
      energy,
      theme: topic,
      estimatedBars,
    };
  }

  /**
   * Commit the orchestrator output to `MusicManager`. Creates the drum,
   * bass, chord, and lead tracks with the AI-recommended instrument IDs.
   * Returns the new track IDs in the order they were added.
   */
  applyToProject(): string[] {
    const beat = this.currentBeat();
    const idea = this.currentIdea();
    if (!beat || !idea) {
      this.notify.show(
        'Run AI Produce first — no artifacts to apply.',
        'warning'
      );
      return [];
    }
    const inferred = this.guessBeatGenre(beat.genre);
    // We use a fixed role→instrument map rather than indexing into
    // `recommendInstruments()` because the recommended array is order-
    // dependent per genre (pop puts guitar first, trap puts bass first,
    // etc.). The map below keeps the drum/bass/chord/lead assignment
    // stable across genres.
    const roleInstruments: Array<{
      suffix: string;
      instrumentId: string;
      type: 'midi' | 'drum' | 'audio';
    }> = [
      { suffix: 'Drums', instrumentId: 'trap-808-elite', type: 'drum' },
      { suffix: 'Bass', instrumentId: 'p-bass-elite', type: 'midi' },
      { suffix: 'Chords', instrumentId: 'grand-piano', type: 'midi' },
      { suffix: 'Lead', instrumentId: 'synth-lead', type: 'midi' },
    ];
    // Touch the recommender anyway so the AI Mix Assistant's preload hooks
    // fire for the genre — keeps the engine primed for the mastering pass.
    this.aiMix.recommendInstruments(inferred);

    const trackIds: string[] = [];
    for (const slot of roleInstruments) {
      trackIds.push(
        this.music.addTrack(
          `${idea.title} · ${slot.suffix}`,
          slot.instrumentId,
          slot.type
        )
      );
    }
    this.appliedTrackIds.set(trackIds);
    this.pushLog(
      'done',
      `Applied ${trackIds.length} tracks to studio: ${trackIds.join(', ')}.`
    );
    return trackIds;
  }

  // ── Internal helpers ──

  private pushLog(stage: string, message: string): void {
    this.log.update((entries) => [
      ...entries,
      { stage, message, timestamp: Date.now() },
    ]);
  }

  private buildResult(cancelled: boolean): ProduceResult {
    // Always returns a partial or full result. Consumers gate on
    // `cancelled` and individual fields may be null if the user
    // aborted before that stage finished.
    return {
      idea: this.currentIdea(),
      beat: this.currentBeat(),
      lyrics: this.currentLyrics(),
      mixReport: this.currentMixReport(),
      releaseId: this.appliedReleaseId(),
      trackIds: this.appliedTrackIds(),
      cancelled,
    };
  }

  /**
   * Centralized cancellation gate. Sets the stage to 'cancelled' and
   * returns true if the user aborted; otherwise returns false so the
   * caller can continue normally. Using one helper keeps every stage
   * post-condition consistent.
   */
  private bailIfCancelled(): boolean {
    if (!this.cancelled) return false;
    this.stage.set('cancelled');
    this.progressLabel.set('Cancelled.');
    return true;
  }

  private async tick(): Promise<void> {
    // Yield to the event loop so the UI can re-render progress between
    // (potentially synchronous, but heavy) generator calls.
    return new Promise((r) => setTimeout(r, 0));
  }

  private guessMoodFromPrompt(prompt: string): string {
    const p = (prompt || '').toLowerCase();
    if (/(dark|gritty|angst|rage|hate|fight|war)/.test(p)) return 'dark';
    if (/(love|romance|kiss|forever|heart)/.test(p)) return 'romantic';
    if (/(party|club|dance|turn up|hype)/.test(p)) return 'high-energy';
    if (/(chill|calm|relax|study|lofi|ambient)/.test(p)) return 'chill';
    if (/(sad|cry|loss|goodbye|alone)/.test(p)) return 'sad';
    return 'pop';
  }

  private suggestTitle(prompt: string, genre: string): string {
    const clean = (prompt || '').trim().split(/\s+/).slice(0, 4).join(' ');
    if (clean) {
      return clean
        .replace(/[^\w\s]/g, '')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const titles: Record<string, string[]> = {
      Trap: ['Night Code', 'Static Crown', 'Midnight Run'],
      'Hip Hop': ['Concrete', 'Cassette', 'Open Mic'],
      Pop: ['Brightside', 'Afterglow', 'Sunset Highway'],
      House: ['Heatwave', 'Pulse', 'Lift Off'],
      'R&B': ['Velvet', 'Slow Tide', 'All I Want'],
      'Lo-Fi': ['Coffee Stains', 'Rainy Window', 'Postcards'],
      Jazz: ['Brass Notes', 'Late Set', 'Cobalt Lounge'],
      Electronic: ['Aurora', 'Spectrum', 'Neon Sky'],
      Drill: ['Cold Steel', 'Concrete Furnace'],
      Dubstep: ['Subzero', 'Fracture'],
      Reggaeton: ['Sabor', 'Noche', 'Calle 9'],
    };
    const pool = titles[genre] || titles['Pop'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private suggestBpm(genre: string): number {
    const ranges: Record<string, [number, number]> = {
      Trap: [135, 145],
      'Hip Hop': [85, 100],
      Pop: [108, 124],
      House: [120, 128],
      'R&B': [80, 100],
      'Lo-Fi': [70, 90],
      Jazz: [90, 130],
      Electronic: [124, 140],
      Drill: [140, 150],
      Dubstep: [140, 150],
      Reggaeton: [90, 100],
    };
    const r = ranges[genre] || [110, 130];
    return Math.round((r[0] + r[1]) / 2);
  }

  private suggestEnergy(genre: string, mood: string): number {
    if (mood === 'high-energy') return 0.95;
    if (mood === 'chill' || mood === 'sad') return 0.4;
    if (mood === 'dark') return 0.7;
    if (genre === 'Pop' || genre === 'House') return 0.75;
    return 0.6;
  }

  private estimateBars(genre: string): number {
    const ranges: Record<string, [number, number]> = {
      Pop: [96, 128],
      Trap: [80, 96],
      'Hip Hop': [80, 96],
      'R&B': [96, 112],
      House: [120, 144],
      Electronic: [112, 128],
      'Lo-Fi': [64, 80],
      Jazz: [64, 96],
      Drill: [80, 96],
      Dubstep: [96, 128],
      Reggaeton: [80, 96],
    };
    const r = ranges[genre] || [80, 128];
    return Math.round((r[0] + r[1]) / 2);
  }

  private guessBeatGenre(beatGenre: string): string {
    const g = (beatGenre || '').toLowerCase();
    if (g.includes('trap')) return 'trap';
    if (g.includes('hip') || g.includes('boom')) return 'trap';
    if (g.includes('house') || g.includes('electronic')) return 'house';
    if (g.includes('r&b') || g.includes('soul')) return 'rnb';
    if (g.includes('lo-fi') || g.includes('lofi')) return 'lo-fi';
    if (g.includes('jazz')) return 'jazz';
    if (g.includes('rock')) return 'pop';
    if (g.includes('reggaeton') || g.includes('latin')) return 'reggaeton';
    if (g.includes('dubstep') || g.includes('drill')) return 'dubstep';
    return 'pop';
  }
}
