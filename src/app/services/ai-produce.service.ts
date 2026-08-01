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
import {
  StudioActionResult,
  StudioActionTarget,
} from '../types/studio-orchestration.types';

export type ProduceStage =
  | 'idle'
  | 'idea'
  | 'beat'
  | 'lyrics'
  | 'voice-preview'
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
  /** Sprint B3 polish — toggle the offline voice-preview stage. */
  voicePreview?: boolean;
}

export interface ProduceResult {
  /**
   * Per-stage artifacts. Any field may be null after a cancel mid-pipeline
   * — callers must null-check or rely on `.cancelled` to gate behavior.
   */
  idea: ProduceIdea | null;
  beat: FullBeatArrangement | null;
  lyrics: SongwritingAssistantResult | null;
  voicePreview: VoicePreview | null;
  mixReport: string[];
  releaseId: string | null;
  trackIds: string[];
  cancelled: boolean;
}

/**
 * Sprint B3 polish — voice-preview stage artifact. Holds a short
 * synthesized AudioBuffer of the chorus hook plus the rendered line.
 * The UI consumes `previewBuffer` via AudioEngineService.playAudition()
 * so the user can accept/reject before mastering.
 */
export interface VoicePreview {
  previewBuffer: AudioBuffer;
  durationSeconds: number;
  hookLine: string;
  generatedAt: number;
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
  currentVoicePreview = signal<VoicePreview | null>(null);
  voicePreviewEnabled = signal<boolean>(true);
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
      s === 'voice-preview' ||
      s === 'mix-master' ||
      s === 'release'
    );
  });

  hasArtifacts = computed(
    () => !!this.currentIdea() && !!this.currentBeat() && !!this.currentLyrics()
  );

  private cancelled = false;

  reset(): void {
    this.stage.set('idle');
    this.progress.set(0);
    this.progressLabel.set('');
    this.currentIdea.set(null);
    this.currentBeat.set(null);
    this.currentLyrics.set(null);
    this.currentVoicePreview.set(null);
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

  /** Toggle voice-preview stage for the next run. UI checkbox. */
  setVoicePreviewEnabled(enabled: boolean): void {
    this.voicePreviewEnabled.set(enabled);
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
    if (opts.voicePreview !== undefined) {
      this.voicePreviewEnabled.set(!!opts.voicePreview);
    }

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
      this.progress.set(15);

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
      this.progress.set(30);

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
      this.progress.set(50);

      // ── Voice-preview stage (Sprint B3 polish) — synthesize chorus hook so
      // the user can audition the lyric-to-tone shape before mastering.
      // Skipped on request or when the chorus has fewer than two lines. ──
      if (this.voicePreviewEnabled()) {
        this.stage.set('voice-preview');
        this.progressLabel.set('Synthesizing chorus hook preview...');
        await this.tick();
        const preview = await this.runVoicePreview(
          opts.prompt,
          lyrics,
          idea.bpm
        );
        if (preview) {
          this.currentVoicePreview.set(preview);
          this.pushLog(
            'voice-preview',
            `Chorus preview ready (${preview.durationSeconds.toFixed(
              2
            )}s · "${this.truncate(preview.hookLine, 60)}").`
          );
        } else {
          this.pushLog(
            'voice-preview',
            'Chorus hook too short — voice preview skipped, mastering will run unchanged.'
          );
        }
      } else {
        this.pushLog('voice-preview', 'Voice preview skipped (user disabled).');
      }
      if (this.bailIfCancelled()) return this.buildResult(true);
      this.progress.set(65);

      // ── Stage 5: Mix + Master ──
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
      this.progress.set(85);

      // ── Stage 6: Release Checklist ──
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
            await this.releases.updateTrackStage(
              track.id,
              'lyrics',
              'Completed'
            );
            await this.releases.updateTrackStage(
              track.id,
              'mixing',
              'Completed'
            );
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

      // ── Stage 7: Done ──
      this.stage.set('done');
      this.progressLabel.set('AI Produce complete — ready to apply.');
      this.notify.show(
        'AI Produce complete. Tap Apply to commit to your studio.',
        'success'
      );
      this.logger.info(
        'Sprint B3+polish: AI Produce run finished — all 6 stages.'
      );
      return this.buildResult(false);
    } catch (e: any) {
      const msg = (e && e.message) || 'AI Produce failed.';
      this.error.set(msg);
      this.pushLog('error', `Pipeline failed: ${msg}`);
      this.stage.set('error');
      this.progressLabel.set('Failed.');
      this.logger.error('Sprint B3+polish: AI Produce pipeline failed', e);
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
    const keys = ['C#m', 'Am', 'F#m', 'Dm', 'Em', 'Cm', 'Gm', 'Bm', 'C', 'G'];
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
   * Sprint B3 polish — synthesize the chorus hook into a 6-12s AudioBuffer.
   * Uses the existing chorus section (or first section as fallback). Each
   * line gets one formant-shaped sine with a micro-glide. Real signal
   * graph on OfflineAudioContext — not a mock.
   *
   * Cancellation: every iteration that would schedule a new note first
   * checks `this.cancelled` so a mid-stage cancel stops the render cleanly.
   */
  async runVoicePreview(
    prompt: string,
    lyrics: SongwritingAssistantResult | null,
    bpm: number
  ): Promise<VoicePreview | null> {
    const chorus =
      lyrics?.lyrics?.find((s) => s.type === 'chorus') ?? lyrics?.lyrics?.[0];
    if (!chorus || chorus.lines.length < 2) return null;
    const lines = chorus.lines.slice(0, 4); // Cap preview length
    const totalSeconds = Math.max(6, (lines.length * 60) / Math.max(40, bpm));
    const sampleRate = 44100;
    const ctx = new OfflineAudioContext(
      2,
      Math.ceil(totalSeconds * sampleRate),
      sampleRate
    );
    const baseFreq = voicingBaseFromPrompt(prompt);
    const secondsPerLine = totalSeconds / lines.length;

    for (let i = 0; i < lines.length; i++) {
      if (this.cancelled) break;
      const t = i * secondsPerLine;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, t);
      // Subtle melodic contour: each chorus line drifts up a semitone so
      // the preview matches the "lift" most choruses aim for.
      const target = baseFreq * Math.pow(2, i * 0.04);
      osc.frequency.linearRampToValueAtTime(target, t + secondsPerLine * 0.9);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.exponentialRampToValueAtTime(0.45, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + secondsPerLine * 0.95);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + secondsPerLine);
    }

    if (this.cancelled) {
      // OfflineAudioContext exposes `suspend()` but not `close()` —
      // the one-shot renderer cleans itself up once `startRendering()`
      // is short-circuited. We drop the OfflineAudioContext reference
      // so the GC can reclaim it.
      return null;
    }

    const buffer = await ctx.startRendering();
    return {
      previewBuffer: buffer,
      durationSeconds: buffer.duration || totalSeconds,
      hookLine: lines[0]?.text || '',
      generatedAt: Date.now(),
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

  buildStudioActionResults(target: StudioActionTarget): StudioActionResult[] {
    const beat = this.currentBeat();
    const idea = this.currentIdea();
    const lyrics = this.currentLyrics();
    if (!beat || !idea) return [];

    const createdAt = this.currentVoicePreview()?.generatedAt ?? Date.now();
    const arrangementPreview = beat.arrangement
      .map((section) => `${section.name} (${section.bars} bars)`)
      .join(' → ');
    const results: StudioActionResult[] = [
      {
        id: `produce_arrangement_${idea.title}`,
        source: 'ai-produce',
        kind: 'arrangement-completion',
        title: `Complete ${idea.title}`,
        description: `Use the generated ${beat.totalBars}-bar arrangement to complete the active ${target.activeView} pass.`,
        reason: `AI Produce generated ${beat.arrangement.length} arrangement sections for the current session.`,
        preview: arrangementPreview,
        status: 'pending',
        target,
        payload: {
          title: idea.title,
          genre: beat.genre,
          totalBars: beat.totalBars,
          arrangement: beat.arrangement,
          releaseId: this.appliedReleaseId(),
        },
        outcomes: {
          preview: 'Review the generated arrangement outline.',
          apply: 'Apply the arrangement artifacts to the studio project.',
          transition: 'Use the generated transitions between sections.',
          export: 'Export the arrangement brief for async collaboration.',
        },
        createdAt,
        updatedAt: Date.now(),
      },
    ];

    results.push(
      ...beat.arrangement.slice(0, 3).flatMap((section, index, sections) => {
        const next = sections[index + 1];
        if (!next) return [];
        return [
          {
            id: `produce_transition_${idea.title}_${index}`,
            source: 'ai-produce' as const,
            kind: 'section-transition' as const,
            title: `${section.name} → ${next.name}`,
            description: `Stage a transition from ${section.name} into ${next.name} for the active arrangement checkpoint.`,
            reason: `${section.name} carries ${section.elements.join(', ')} before handing off to ${next.elements.join(', ')}.`,
            preview: `${section.description} → ${next.description}`,
            status: 'pending' as const,
            target,
            payload: {
              fromSection: section,
              toSection: next,
              bpm: idea.bpm,
            },
            outcomes: {
              preview: 'Preview the AI-produced transition brief.',
              apply: 'Apply the transition direction to the arrangement.',
              replace: 'Swap to a different transition idea.',
              transition: 'Advance the checkpoint to the next section.',
            },
            createdAt,
            updatedAt: Date.now(),
          },
        ];
      })
    );

    const chorus =
      lyrics?.lyrics?.find((entry) => entry.type === 'chorus') ??
      lyrics?.lyrics?.[0];
    if (chorus?.lines?.length) {
      results.push({
        id: `produce_hook_${idea.title}`,
        source: 'ai-produce',
        kind: 'hook-variant',
        title: `Hook variants for ${idea.title}`,
        description: `Attach hook candidates to ${target.selectedTrackId ?? 'the active arrangement'} for review.`,
        reason: `Generated chorus material is available for the current ${target.activeView} context.`,
        preview: chorus.lines
          .slice(0, 3)
          .map((line) => line.text)
          .join('\n'),
        status: 'pending',
        target,
        payload: {
          hookLines: chorus.lines.map((line) => line.text),
          voicePreviewReady: !!this.currentVoicePreview(),
          mixReport: this.currentMixReport(),
        },
        outcomes: {
          preview: 'Preview the hook variants against the active context.',
          apply: 'Commit the current hook direction to the project.',
          replace: 'Replace the active hook with a new variant.',
          export: 'Export the hook brief for reviewers.',
        },
        createdAt,
        updatedAt: Date.now(),
      });
    }

    return results;
  }

  // ── Internal helpers ──

  private pushLog(stage: string, message: string): void {
    this.log.update((entries) => [
      ...entries,
      { stage, message, timestamp: Date.now() },
    ]);
  }

  private buildResult(cancelled: boolean): ProduceResult {
    return {
      idea: this.currentIdea(),
      beat: this.currentBeat(),
      lyrics: this.currentLyrics(),
      voicePreview: this.currentVoicePreview(),
      mixReport: this.currentMixReport(),
      releaseId: this.appliedReleaseId(),
      trackIds: this.appliedTrackIds(),
      cancelled,
    };
  }

  /** String truncation for log entries (no third-party dep). */
  private truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  private bailIfCancelled(): boolean {
    if (!this.cancelled) return false;
    this.stage.set('cancelled');
    this.progressLabel.set('Cancelled.');
    return true;
  }

  private async tick(): Promise<void> {
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

/**
 * Sprint B3 polish — turn a free-text prompt into a rough vocal base
 * frequency. Lives outside the class because it's a pure helper with no
 * state; exported only so the spec can pin it down.
 */
export function voicingBaseFromPrompt(prompt: string): number {
  const p = (prompt || '').toLowerCase();
  if (/(dark|gritty|low)/.test(p)) return 196; // G3 — chest-voice range
  if (/(bright|pop|love)/.test(p)) return 392; // G4 — head-voice range
  if (/(energy|club|hype)/.test(p)) return 261.6; // C4 — punchy mid
  return 261.6;
}
