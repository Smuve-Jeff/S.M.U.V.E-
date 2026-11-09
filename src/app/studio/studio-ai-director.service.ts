import { Injectable, inject } from '@angular/core';
import { AiService } from '../services/ai.service';
import { isOfflineAiText } from '../../ai-manager.contract';
import {
  MusicManagerService,
  type TrackModel,
  type TrackNote,
} from '../services/music-manager.service';
import { HistoryService } from '../services/history.service';
import { SessionHistoryService } from '../services/session-history.service';
import { ExportService } from '../services/export.service';
import { IdeasGeneratorService } from '../services/ideas-generator.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiBeatGeneratorService } from '../services/ai-beat-generator.service';
import { AiProduceService } from '../services/ai-produce.service';
import { ScaleDetectionService } from '../services/scale-detection.service';
import { VocalAiService, analyzeVocalBuffer } from '../services/vocal-ai.service';
import { AutomationService } from './automation.service';
import { RecordingStatusService } from './recording-status.service';
import {
  VocalMasteringService,
  type MasteringParameters,
} from '../services/vocal-mastering.service';
import { LoggingService } from '../services/logging.service';
import { NeuralMixerService } from '../services/neural-mixer.service';
import { TakeManagerService } from '../services/take-manager.service';
import { AudioRecorderService } from './audio-recorder.service';
import { AiMixAssistantService } from './effects/ai-mix-assistant.service';
import { AiCopilotService } from './ai-copilot.service';
import { OfflineBounceService } from './offline-bounce.service';
import { ProjectWorkspaceService, type ProjectBundle } from './project-workspace.service';
import { buildProjectArchive } from './project-archive.util';
import { SmartSoundService } from './smart-sound.service';
import { SmartProductionFoundationsService } from './smart-production-foundations.service';
import { PerformanceRecordingService } from './performance-recording.service';
import { AudioImportService } from './audio-import.service';
import {
  DEFAULT_TUNER_TOLERANCE_CENTS,
  frequencyToNote,
  midiToFrequency,
} from './tuner/tuner-pitch.util';
import { TunerLiveService, type LiveInputVerification } from './tuner/tuner-live.service';
import { VcaBusService } from './vca-bus.service';
import {
  detectTransientFrames,
  sliceAudioBufferAtFrames,
} from './sampler-slice.util';
import { detectPitch } from './audio-to-midi.util';
import { SamplerStateService } from './sampler-state.service';
import { StudioTelemetryService } from './studio-telemetry.service';
import {
  STUDIO_SURFACES,
  isStudioSurfaceId,
  type StudioSurfaceId,
} from './studio-surfaces';
import {
  buildMusicXml,
  musicXmlFileName,
  type MusicXmlPart,
} from './score-view/score-musicxml.util';

export interface StudioDirectorContext {
  surfaceId: string;
  focusPrompt?: string;
  artistName?: string;
  projectName?: string;
  genre?: string;
  bpm?: number;
  key?: string;
  scale?: string;
  mood?: string;
  style?: string;
}

export interface StudioDirectorStep {
  id: string;
  surfaceId: StudioSurfaceId;
  label: string;
  detail: string;
  executable: boolean;
  targetSurfaceId?: StudioSurfaceId;
  run: () => Promise<string> | string;
}

export interface StudioDirectorPlan {
  surfaceId: StudioSurfaceId;
  title: string;
  mission: string;
  successCriteria: string[];
  evidence: string[];
  steps: StudioDirectorStep[];
}

export interface StudioDirectorStepResult {
  step: StudioDirectorStep;
  ok: boolean;
  message: string;
  durationMs: number;
}

export interface StudioDirectorRunResult {
  surfaceId: StudioSurfaceId;
  startedAt: number;
  finishedAt: number;
  results: StudioDirectorStepResult[];
  report: string[];
  completed: number;
  failed: number;
}

export interface DirectorCheckpointSummary {
  id: string;
  label: string;
  at: number;
  isFullSnapshot: boolean;
  hasBundle: boolean;
  detail: string;
}

const SURFACE_LOOKUP = new Map(STUDIO_SURFACES.map((s) => [s.id, s]));
const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Cross-surface director for the complete Studio module.
 *
 * Each view gets a deterministic, evidence-backed production plan. Steps that
 * can call a real service are executed directly; steps that require a
 * gesture in the surface (metronome tap, hot-cue placement, mute/solo, etc.)
 * become guided actions. The plan is a work brief — it never pretends to have
 * operated a control it could not reach.
 */
@Injectable({ providedIn: 'root' })
export class StudioAiDirectorService {
  private ai = inject(AiService);
  private music = inject(MusicManagerService);
  private history = inject(HistoryService);
  private sessionHistory = inject(SessionHistoryService);
  private exports = inject(ExportService);
  private ideas = inject(IdeasGeneratorService);
  private engine = inject(AudioEngineService);
  private beat = inject(AiBeatGeneratorService);
  private produce = inject(AiProduceService);
  private mix = inject(AiMixAssistantService);
  private copilot = inject(AiCopilotService);
  private offlineBounce = inject(OfflineBounceService);
  private scale = inject(ScaleDetectionService);
  private vocal = inject(VocalAiService);
  private vocalMastering = inject(VocalMasteringService);
  private sounds = inject(SmartSoundService);
  private neural = inject(NeuralMixerService);
  private takeManager = inject(TakeManagerService);
  private audioRecorder = inject(AudioRecorderService);
  private workspace = inject(ProjectWorkspaceService);
  private foundations = inject(SmartProductionFoundationsService);
  private performanceRecording = inject(PerformanceRecordingService);
  private audioImport = inject(AudioImportService);
  private samplerState = inject(SamplerStateService);
  private tunerLive = inject(TunerLiveService);
  private vcaBuses = inject(VcaBusService);
  private automation = inject(AutomationService);
  private recordingStatus = inject(RecordingStatusService);
  private telemetry = inject(StudioTelemetryService);
  private logger = inject(LoggingService);

  private sequence = 0;
  private lastDetectedScale = 'major';

  /** Normalize a host-provided surface id (or legacy alias) for the director. */
  normalizeSurfaceId(value: string | null | undefined): StudioSurfaceId {
    if (value && isStudioSurfaceId(value)) return value;
    return 'arrangement';
  }

  /** Build an evidence-backed plan for the requested surface. */
  buildPlan(context: StudioDirectorContext): StudioDirectorPlan {
    const surfaceId = this.normalizeSurfaceId(context.surfaceId);
    const surface = SURFACE_LOOKUP.get(surfaceId);
    const planContext = { ...context, surfaceId };
    const evidence = this.sessionEvidence(planContext);
    const steps = this.stepsFor(planContext, evidence);

    return {
      surfaceId,
      title: `${surface?.label ?? 'Studio'} Director Plan`,
      mission: this.missionFor(surfaceId),
      successCriteria: this.successCriteriaFor(surfaceId),
      evidence,
      steps,
    };
  }

  /**
   * Ask the live model for a compact, view-specific brief. Any failure or
   * offline marker falls back to deterministic local guidance.
   */
  async createStudioBrief(
    plan: StudioDirectorPlan,
    context: StudioDirectorContext = { surfaceId: plan.surfaceId },
  ): Promise<string> {
    const surface = SURFACE_LOOKUP.get(plan.surfaceId);
    const prompt = [
      `You are the S.M.U.V.E Studio director for the ${surface?.label ?? plan.surfaceId} surface.`,
      'Give a short 4-6 line production brief for the artist.',
      'Use only this session evidence; do not invent measurements:',
      plan.evidence.join(' | '),
      context.focusPrompt ? `Artist focus: ${context.focusPrompt}` : 'No extra focus prompt.',
      'Include the first move, the creative intention, and the check that proves it worked.',
      'Keep it direct and production-specific. Do not claim to have changed the project.',
    ].join('\n');

    try {
      const response = await this.ai.getAIResponse(prompt);
      if (!response || isOfflineAiText(response)) return this.fallbackBrief(plan, context);
      return response.trim();
    } catch (error) {
      this.logger.warn('Studio Director: live brief unavailable, using local brief', error);
      return this.fallbackBrief(plan, context);
    }
  }

  /** Deterministic brief used offline and as the non-LLM safety net. */
  fallbackBrief(plan: StudioDirectorPlan, context: StudioDirectorContext = { surfaceId: plan.surfaceId }): string {
    const evidence = plan.evidence.slice(0, 3).join(' ');
    return [
      `${plan.title}: ${plan.mission}`,
      evidence,
      `First move: ${plan.steps[0]?.label ?? 'review the current evidence'}.`,
      `Done when: ${plan.successCriteria[0] ?? 'the surface shows the intended result'}.`,
      context.focusPrompt ? `Focus on: ${context.focusPrompt}` : 'Start with the executable steps, then audit the result.',
    ].join('\n');
  }

  canUndoDirectorAction(): boolean {
    return this.history.canUndo();
  }

  canRedoDirectorAction(): boolean {
    return this.history.canRedo();
  }

  undoLastAction(): string {
    if (!this.history.canUndo()) return 'Nothing to undo.';
    const label = this.history.lastActionName();
    this.history.undo();
    return label ? `Undid ${label}.` : 'Undid the last action.';
  }

  redoLastAction(): string {
    if (!this.history.canRedo()) return 'Nothing to redo.';
    this.history.redo();
    return 'Redid the last undone action.';
  }

  /**
   * Delete is deliberately routed through the normal undoable track command.
   * There is no separate "restore" state: Undo restores the exact track and
   * its bus memberships.
   */
  deleteSelectedTrack(): string {
    const track = this.music.selectedTrack();
    if (!track) throw new Error('Select a track before deleting it.');
    this.music.removeTrack(track.id);
    return `Deleted ${track.name}. Use Undo to restore the exact track and its bus memberships.`;
  }

  restoreLastDeletedState(): string {
    return this.undoLastAction();
  }

  /** Checkpoint count / latest label for the current project branch. */
  checkpointSummary(): string {
    const projectId = this.workspace.metadata()?.id;
    if (!projectId) return 'No project metadata is active.';
    const branchId = this.sessionHistory.activeBranch(projectId);
    if (!branchId) return 'No session checkpoint branch is active.';
    const checkpoints = this.sessionHistory.checkpoints(projectId, branchId);
    if (checkpoints.length === 0) return 'No session checkpoints are available yet.';
    const latest = checkpoints[checkpoints.length - 1];
    return `${checkpoints.length} checkpoint${checkpoints.length === 1 ? '' : 's'}; latest: ${latest.label}.`;
  }

  /**
   * Newest-first browser rows for the active project branch. Each row says
   * whether the checkpoint materializes to a full portable bundle and, for
   * metadata-only checkpoints, which fields a restore can actually apply.
   */
  listCheckpoints(): DirectorCheckpointSummary[] {
    const projectId = this.workspace.metadata()?.id;
    if (!projectId) return [];
    const branchId = this.sessionHistory.activeBranch(projectId);
    if (!branchId) return [];
    const checkpoints = this.sessionHistory.checkpoints(projectId, branchId);
    return [...checkpoints]
      .sort((a, b) => b.at - a.at)
      .map((checkpoint) => {
        let hasBundle = false;
        let detail = 'Delta checkpoint';
        try {
          const materialized = this.sessionHistory.materializeSnapshot(projectId, checkpoint.id);
          const payload = (materialized ?? {}) as Record<string, unknown>;
          if (payload.metadata && Array.isArray(payload.tracks)) {
            hasBundle = true;
            const tracks = payload.tracks as unknown[];
            const metadata = payload.metadata as Record<string, unknown>;
            const name = typeof metadata.name === 'string' && metadata.name ? metadata.name : 'project';
            detail = `Full bundle · ${name} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}`;
          } else {
            const keys = Object.keys(payload).filter((key) => key !== 'id');
            detail = keys.length > 0 ? `Metadata · ${keys.slice(0, 4).join(', ')}` : 'Metadata checkpoint';
          }
        } catch {
          detail = 'Could not be materialized';
        }
        return {
          id: checkpoint.id,
          label: checkpoint.label,
          at: checkpoint.at,
          isFullSnapshot: checkpoint.isFullSnapshot,
          hasBundle,
          detail,
        };
      });
  }

  /** Download the open project as a portable `.smuve` bundle. */
  exportProjectBundle(): string {
    const meta = this.workspace.metadata();
    if (!meta) throw new Error('No project metadata is active.');
    this.workspace.downloadProjectBundle();
    return `Exported the open project as a .smuve bundle (${meta.name}).`;
  }

  /**
   * Download one materialized checkpoint as a portable `.smuve` bundle, so a
   * checkpoint can leave the browser and be re-imported later. Only full
   * bundle checkpoints can be exported; metadata-only ones are reported.
   */
  exportCheckpointBundle(checkpointId?: string): string {
    const projectId = this.workspace.metadata()?.id;
    if (!projectId) throw new Error('No project metadata is active.');
    const branchId = this.sessionHistory.activeBranch(projectId);
    if (!branchId) throw new Error('No session checkpoint branch is active.');
    const checkpoints = this.sessionHistory.checkpoints(projectId, branchId);
    if (checkpoints.length === 0) throw new Error('No session checkpoints are available to export.');
    const target = checkpointId
      ? checkpoints.find((checkpoint) => checkpoint.id === checkpointId)
      : checkpoints[checkpoints.length - 1];
    if (!target) throw new Error(`Checkpoint ${checkpointId} was not found.`);
    const materialized = this.sessionHistory.materializeSnapshot(projectId, target.id);
    if (!materialized) throw new Error(`Checkpoint ${target.label} could not be materialized.`);
    const payload = materialized as unknown as Record<string, unknown>;
    if (!payload.metadata || !Array.isArray(payload.tracks)) {
      throw new Error(`Checkpoint ${target.label} is not a full project bundle, so it cannot be exported as a .smuve file. Restore it for its tempo/key metadata instead.`);
    }
    const bundle = materialized as unknown as ProjectBundle;
    const blob = buildProjectArchive(bundle);
    const metadata = bundle.metadata as unknown as Record<string, unknown>;
    const project = String(metadata.name || this.music.projectName || 'Elite_Session').replace(/[^\w.-]/g, '_');
    const label = target.label.replace(/[^\w.-]/g, '_') || 'latest';
    const filename = `${project}_Director_Checkpoint_${label}_${Date.now()}.smuve`;
    this.exports.downloadBlob(blob, filename);
    return `Exported checkpoint ${target.label} as ${filename} (${blob.size} bytes).`;
  }

  /**
   * Import a portable project bundle into the live project. The import itself
   * replaces the canvas, so the previous canvas is captured first and the
   * import is recorded as an undoable edit.
   */
  async importProjectBundle(bundle: ProjectBundle): Promise<string> {
    if (!bundle || typeof bundle !== 'object' || !bundle.metadata || !Array.isArray(bundle.tracks)) {
      throw new Error('That file is not a valid S.M.U.V.E. project bundle.');
    }
    const before = this.workspace.createSnapshot();
    const ok = await this.workspace.importProjectBundle(bundle);
    if (!ok) {
      const workspace = this.workspace as unknown as { persistenceError?: () => string };
      const reason = typeof workspace.persistenceError === 'function' ? workspace.persistenceError() : '';
      throw new Error(reason || 'Project bundle import was rejected.');
    }
    this.history.execute({
      name: `Import project bundle ${bundle.metadata.name}`,
      execute: () => this.workspace.restoreFromSnapshot(bundle),
      undo: () => this.workspace.restoreFromSnapshot(before),
    });
    return `Imported project bundle ${bundle.metadata.name}; the previous canvas is an undoable edit away.`;
  }

  /**
   * Restore a persisted SessionHistory checkpoint into the live project.
   * The current project state is captured first, then the restore is pushed
   * through HistoryService, so the restore is an undoable edit.
   */
  async restoreCheckpoint(checkpointId?: string): Promise<string> {
    const projectId = this.workspace.metadata()?.id;
    if (!projectId) throw new Error('No project metadata is active.');
    const branchId = this.sessionHistory.activeBranch(projectId);
    if (!branchId) throw new Error('No session checkpoint branch is active.');
    const checkpoints = this.sessionHistory.checkpoints(projectId, branchId);
    if (checkpoints.length === 0) throw new Error('No session checkpoints are available to restore.');
    const target = checkpointId
      ? checkpoints.find((checkpoint) => checkpoint.id === checkpointId)
      : checkpoints[checkpoints.length - 1];
    if (!target) throw new Error(`Checkpoint ${checkpointId} was not found.`);
    const materialized = this.sessionHistory.materializeSnapshot(projectId, target.id);
    if (!materialized) throw new Error(`Checkpoint ${target.label} could not be materialized.`);
    const before = this.workspace.createSnapshot();
    const payload = materialized as unknown as Record<string, unknown>;

    if (payload.metadata && Array.isArray(payload.tracks)) {
      const bundle = materialized as unknown as ProjectBundle;
      this.history.execute({
        name: `Restore checkpoint ${target.label}`,
        execute: () => this.workspace.restoreFromSnapshot(bundle),
        undo: () => this.workspace.restoreFromSnapshot(before),
      });
      await this.sessionHistory.rewind({ branchId, targetCheckpointId: target.id }).catch(() => null);
      return `Restored checkpoint ${target.label} into the live project. The previous project state is an undoable edit away.`;
    }

    const metadataPatch: Record<string, unknown> = {};
    const tempo = typeof payload.tempo === 'number' ? payload.tempo : typeof payload.bpm === 'number' ? payload.bpm : null;
    if (typeof tempo === 'number' && Number.isFinite(tempo)) metadataPatch.bpm = tempo;
    if (typeof payload.key === 'string' && payload.key.trim()) metadataPatch.key = payload.key;
    if (Object.keys(metadataPatch).length === 0) {
      throw new Error(`Checkpoint ${target.label} does not contain a full project bundle or tempo/key metadata to restore.`);
    }
    const beforeMetadata = { ...(this.workspace.metadata() ?? {}) } as Record<string, unknown>;
    const beforeTempo = this.engine.tempo();
    const restoredTempo = typeof metadataPatch.bpm === 'number' ? metadataPatch.bpm as number : null;
    this.history.execute({
      name: `Restore checkpoint ${target.label}`,
      execute: () => {
        this.workspace.updateMetadata(metadataPatch as never);
        if (restoredTempo !== null) this.engine.tempo.set(restoredTempo);
      },
      undo: () => {
        this.workspace.updateMetadata(beforeMetadata as never);
        this.engine.tempo.set(beforeTempo);
      },
    });
    await this.sessionHistory.rewind({ branchId, targetCheckpointId: target.id }).catch(() => null);
    return `Restored checkpoint ${target.label} metadata (${Object.keys(metadataPatch).join(', ')}). It did not contain a full project bundle, so tracks were left unchanged; the previous tempo/key state is an undoable edit away.`;
  }

  /** Run one plan step and report its real outcome. */
  async runStep(step: StudioDirectorStep): Promise<StudioDirectorStepResult> {
    const started = Date.now();
    try {
      const message = await step.run();
      this.track('coach_action_taken', true, { surfaceId: step.surfaceId, stepId: step.id, executable: step.executable });
      return { step, ok: true, message, durationMs: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.track('studio_error', false, { surfaceId: step.surfaceId, stepId: step.id, error: message });
      return { step, ok: false, message, durationMs: Date.now() - started };
    }
  }

  /** Run a plan sequentially and return one result per step. */
  async runPlan(plan: StudioDirectorPlan): Promise<StudioDirectorRunResult> {
    const startedAt = Date.now();
    const results: StudioDirectorStepResult[] = [];
    for (const step of plan.steps) {
      results.push(await this.runStep(step));
    }
    const finishedAt = Date.now();
    const completed = results.filter((r) => r.ok).length;
    const failed = results.length - completed;
    const report = results.map((r) => `${r.ok ? 'Done' : 'Check'} — ${r.step.label}: ${r.message}`);
    this.track('coach_action_taken', failed === 0, {
      surfaceId: plan.surfaceId,
      completed,
      failed,
      durationMs: finishedAt - startedAt,
    });
    return { surfaceId: plan.surfaceId, startedAt, finishedAt, results, report, completed, failed };
  }

  /** Compact live evidence summary for any surface. */
  sessionEvidence(context: StudioDirectorContext = { surfaceId: 'arrangement' }): string[] {
    const tracks = this.music.tracks();
    const selected = this.music.selectedTrack();
    const notes = tracks.reduce((sum, t) => sum + (t.notes?.length ?? 0), 0);
    const bars = tracks.reduce((sum, t) => sum + (t.clips?.length ?? 0), 0);
    const muted = tracks.filter((t) => t.muted).length;
    const soloed = tracks.filter((t) => t.soloed).length;
    const bpm = this.engine.tempo();
    const key = context.key ?? this.workspace.metadata()?.key ?? 'C';
    const scale = context.scale ?? this.lastDetectedScale;
    const volume = this.engine.masterGainValue();
    const metronome = this.engine.metronomeEnabled();
    const playing = this.engine.isPlaying();
    const soundCount = this.sounds.sounds().length;
    const favorites = this.sounds.favoriteIds().size;
    const suggestions = this.mix.suggestions().length;
    const produceBeat = this.produce.currentBeat();
    const vocalAdvice = this.vocal.currentAdvice().trim();
    const foundationsReady = this.foundations.capabilities().filter((c) => c.status === 'ready').length > 0;

    const evidence = [
      `Session: ${tracks.length} tracks · ${notes} notes · ${bars} clips · ${muted} muted · ${soloed} soloed.`,
      `Tempo ${bpm} BPM · ${key} ${scale} · master ${Math.round(volume * 100)}% · metronome ${metronome ? 'on' : 'off'} · transport ${playing ? 'playing' : 'stopped'}.`,
      selected
        ? `Selected track: ${selected.name} (${selected.type}, ${selected.notes?.length ?? 0} notes).`
        : 'No track is selected.',
      `AI context: ${suggestions} mix suggestion${suggestions === 1 ? '' : 's'} · ${soundCount} searchable sounds · ${favorites} favorites · ${foundationsReady ? 'foundations ready' : 'foundations preparing'}.`,
    ];

    if (produceBeat) {
      evidence.push(`Last produced beat: ${produceBeat.title} · ${produceBeat.genre} · ${produceBeat.bpm} BPM · ${produceBeat.key} · ${produceBeat.totalBars} bars.`);
    }
    if (vocalAdvice && vocalAdvice.length > 12) {
      evidence.push(`Latest vocal signal: ${vocalAdvice.slice(0, 140)}`);
    }
    if (context.focusPrompt) evidence.push(`Artist focus: ${context.focusPrompt}`);
    return evidence;
  }

  private stepsFor(context: StudioDirectorContext, evidence: string[]): StudioDirectorStep[] {
    const surfaceId = this.normalizeSurfaceId(context.surfaceId);
    const make = (
      index: number,
      label: string,
      detail: string,
      executable: boolean,
      run: () => Promise<string> | string,
      targetSurfaceId?: StudioSurfaceId,
    ): StudioDirectorStep => ({
      id: `${surfaceId}-${index}`,
      surfaceId,
      label,
      detail,
      executable,
      targetSurfaceId,
      run,
    });

    switch (surfaceId) {
      case 'quick-session':
        return [
          make(1, 'Apply the closest Quick Session starter', 'Pick the one-tap Quick Session recipe closest to the transport BPM and write it to real tracks via MusicManagerService.applyGeneratedRecipe, which is undoable. A dirty sketch is never replaced: when the session is dirty the step reports the recommendation and preserves the canvas.', true, () => this.applyQuickSessionStarter()),
          make(2, 'Sync tempo and verify key', 'Sync the engine tempo to the project tempo when they differ, then read the key/scale and metronome state from the live services. Syncing the tempo is a service-backed write; the key readout stays a measurement.', true, () => this.quickSessionReadiness()),
          make(3, 'Select the next one-tap move', 'Focus the first playable track with notes so the artist can act on the recommended next move immediately. When nothing is playable yet, the step reports building a groove first.', true, () => this.quickSessionNextMove()),
        ];
      case 'arrangement':
        return [
          make(1, 'Focus the selected arrangement lane', 'Select the first track with notes so the director works on a real lane rather than an empty one.', true, () => this.selectFirstTrack()),
          make(2, 'Detect the musical key and scale', 'Run Krumhansl-Kessler key detection over the session notes and apply the result to the project key/scale.', true, () => this.detectAndApplyKey()),
          make(3, 'Apply the section energy map', 'Use the detected key and session density to place intro, verse, chorus and bridge transitions. The default AI Copilot structure is applied only when the current markers are still the stock defaults; custom sections are left alone.', true, () => this.applySongStructure()),
          make(4, 'Read the automation lanes', 'Read every automation lane, its points and interpolation, plus modulation sources, macros and the write mode. The same readout states which export path carries each lane, so the arrangement is judged against delivery before anything renders.', true, () => this.automationCoverage(), 'arrangement'),
        ];
      case 'session':
        return [
          make(1, 'Seed the clip grid with a full beat', 'Generate drums, bass, chords and melody and write them to real tracks.', true, () => this.applyBeatPackage(context)),
          make(2, 'Focus the scene’s first playable track', 'Select the first melodic track so the artist can immediately audition the generated clip.', true, () => this.selectFirstTrack()),
          make(3, 'Launch the first pattern scene', 'Launch the first non-empty pattern scene and report how many channels switched. Returning to Arrangement is the reversible undo.', true, () => this.launchFirstScene()),
        ];
      case 'piano-roll':
        return [
          make(1, 'Detect and apply the roll’s key', 'Analyze the notes in the roll, then set the project key/scale so highlighting and scale safety pull in the same direction.', true, () => this.detectAndApplyKey()),
          make(2, 'Write a melodic seed into the selected track', 'Ensure the selected track has notes; if empty, generate a complete beat and write bass/melody into it.', true, () => this.seedMelodicTrack()),
          make(3, 'Humanize and audit scale collisions', 'Humanize the selected track, then check each pitch against the active key and scale before adding ornament notes.', true, () => this.humanizeSelectedTrack()),
        ];
      case 'drum-machine':
        return [
          make(1, 'Generate a playable drum kit pattern', 'Generate a genre-aware drum pattern and write kick, snare/clap, hi-hat and percussion into a drum track.', true, () => this.applyBeatPackage(context)),
          make(2, 'Humanize the kit timing', 'Apply micro-timing and velocity variation to the selected drum track when available.', true, () => this.humanizeSelectedTrack()),
          make(3, 'Run one EVOLVE variation', 'Mutate a focused slice of the kit on a drum track: trim or retime a small number of hits and nudge some velocities, matching the surface EVOLVE behavior without claiming to press its header control.', true, () => this.evolveDrumVariation()),
        ];
      case 'channel-rack':
        return [
          make(1, 'Seed the rack with a complete groove', 'Generate the full beat package and map its layers to rack tracks.', true, () => this.applyBeatPackage(context)),
          make(2, 'Check channel headroom', 'Run the AI mix pass so channel gains are compared against the current scene before adding more sounds.', true, () => this.analyzeAndApplyMix()),
          make(3, 'Audit channel roles for duplicates', 'Read every Channel Rack track’s current instrument identity and flag duplicate channel roles before adding or assigning more sounds. This is an audit pass, not a silent reassignment of sample-backed sounds.', true, () => this.channelRoleAudit()),
        ];
      case 'mixer':
        return [
          make(1, 'Refresh the evidence-backed mix pass', 'Recompute every track-level suggestion from the current session instead of trusting an old snapshot.', true, () => this.analyzeAndApplyMix()),
          make(2, 'Audit mute and solo state', 'Read the live mute/solo state for every track and the selected track before balancing gains.', true, () => this.auditMixerMuteSolo()),
          make(3, 'Read the channel meters', 'Read the post-fader peak and momentary level for every mixer channel from the audio engine taps, plus the selected channel’s mono correlation. When the transport is stopped the meters correctly read silence, so play the session to judge balance.', true, () => this.mixerChannelMeters(), 'mixer'),
          make(4, 'Snapshot the bus routing and VCA state', 'Read every group bus with its member channels, master-routed channels, VCA buses with their assignments and fader values, and send levels — one snapshot of the whole console routing.', true, () => this.mixerBusSnapshot(), 'mixer'),
          make(5, 'Check stems readiness for delivery', 'Confirm which tracks the stem renderer would actually write: every unmuted non-bus track becomes a stem, muted tracks are skipped and solo is ignored. No audio is rendered in this step.', true, () => this.stemsReadiness(), 'mixer'),
          make(6, 'Use the neural balance only as a rough nudge', 'The neural balance is a randomized gain nudge plus safety compression, not a measurement-based mix.', true, () => this.applyNeuralNudge()),
        ];
      case 'effects-rack':
        return [
          make(1, 'Run the rack analysis', 'Recompute AI mix suggestions against the selected track and current FX chain.', true, () => this.analyzeAndApplyMix()),
          make(2, 'Apply the highest-value suggestion', 'Apply the top recommendation instead of stacking unrelated effects.', true, () => this.applyTopMixSuggestion()),
          make(3, 'A/B the rack in context', 'Bypass the selected track’s insert chain with one undoable Studio command, confirm the difference, then restore it if the processing hurt the mix.', true, () => this.toggleInsertBypass()),
        ];
      case 'vocal-suite':
        return [
          make(1, 'Measure the selected vocal take', 'Measure the selected track’s recorded audio clip directly (peak, RMS, crest, silence and clipped samples) when one exists; otherwise read the latest Vocal AI guidance note. Uploading and analyzing a new take in the Vocal Suite remains required for guidance on material that is not already in the session.', true, () => this.measureVocalTake(), 'vocal-suite'),
          make(2, 'Generate a harmony stack from the take', 'Use the take’s notes to create a harmony part; if no part is detected, the fallback is a simple third above the root.', true, () => this.generateHarmonyFromSelectedTake()),
          make(3, 'Apply the conservative vocal polish chain', 'Only after Vocal AI evidence exists, set the vocal mastering chain to a conservative de-esser, multiband, exciter, EQ and limiter profile. This changes the live vocal chain; it does not hide tuning, clipping or timing problems.', true, () => this.applyConservativeVocalPolish(), 'vocal-suite'),
        ];
      case 'dj':
        return [
          make(1, 'Make both decks audition-ready', 'Set both deck gains and the crossfader to neutral so the artist can hear either deck cleanly.', true, () => this.prepareDjDecks()),
          make(2, 'Arm key-lock and deck B loop', 'Set deck B to unity rate with pitch preservation and enable its loop so the next phrase can be cued cleanly.', true, () => this.prepareDjLoop()),
          make(3, 'Centre the crossfader in phrase', 'Set the DJ crossfader back to the phrase-neutral centre so the next move can ride either deck cleanly.', true, () => this.prepareDjCrossfade()),
        ];
      case 'performance':
        return [
          make(1, 'Select the strongest performance take', 'Rank the PerformanceRecordingService takes by captured notes then peak level, select the strongest in the carousel, and report the MIDI take count. Selecting is reversible; no take is overwritten.', true, () => this.selectStrongestPerformanceTake()),
          make(2, 'Arm the next clean performance take', 'Arm the next PerformanceRecordingService take slot for the selected track, then perform the full pass and stop the take from the performance surface to capture it.', true, () => this.armNextPerformanceTake(), 'performance'),
          make(3, 'Promote the strongest MIDI take', 'Rank the takes by captured note count and make the strongest take the active take for playback/comping.', true, () => this.promoteBestTake()),
        ];
      case 'mastering':
        return [
          make(1, 'Run the genre-aware master', 'Let the AI Mix Assistant choose targets from the session composition and apply compressor, limiter and tone EQ.', true, () => this.autoMaster()),
          make(2, 'Render the offline review bounce', 'Render the full arrangement offline and read its measured peak/RMS; if the peak clips, lower the target rather than raising the limiter.', true, () => this.bounceProjectReview()),
          make(3, 'Render the offline comparison bounce', 'Render the offline comparison bounce and read its measured peak/RMS against the streaming target.', true, () => this.bounceProjectReview()),
        ];
      case 'ai-produce':
        return [
          make(1, 'Generate the full one-tap production idea', 'Run the six-stage Produce pipeline: idea, beat, lyrics, voice preview, mix/master and release checklist.', true, () => this.runAiProduce(context)),
          make(2, 'Apply the generated artifacts', 'Commit the current idea, beat, lyrics and mix handoff to the project via AiProduceService.applyToProject().', true, () => this.applyAiProduceArtifacts()),
          make(3, 'Use the release handoff to plan delivery', 'Read the AI Produce release handoff directly and surface the completed stages, pending stages and next step.', true, () => this.releaseHandoffStatus()),
        ];
      case 'sound-browser':
      case 'sound-pad':
        return [
          make(1, 'Smart-search the session’s sound family', `Use the current key, BPM and mood to search the sound library for a matching sound.`, true, () => this.smartSearchSounds(context)),
          make(2, 'Favorite the best playable result', 'Save the best match so the next session starts from a proven sound, not a blind search.', true, () => this.favoriteBestSound(context)),
          make(3, 'Surface the closest sound neighbours', 'Find the closest matches around the best search result and record the sound as used; keep the original unless a neighbour wins a full-loop audition.', true, () => this.surfaceSimilarSounds(context)),
        ];
      case 'synthesizer':
        return [
          make(1, 'Seed the synth with a melodic layer', 'Add a generated melody to a track if the synth lane is empty, then use that track for sound design.', true, () => this.seedMelodicTrack()),
          make(2, 'Check the synth register against the bass', 'Measure the selected synth lane and the lowest melodic register from the live project notes and flag any root/register collision.', true, () => this.synthRegisterCheck()),
          make(3, 'Track a useful patch recipe', 'Favorite the patch once its role is proven in the full session.', true, () => this.favoriteBestSound(context)),
        ];
      case 'tuner':
        return [
          make(1, 'Report the tuning reference', 'Read the shared A4 concert-pitch reference and tolerance from the tuner pitch utilities, then compare it with the project key. The live needle still needs the artist or line input to play or sing the reference.', true, () => this.tunerReferenceStatus(), 'tuner'),
          make(2, 'Open the live tuner input', 'Open the shared TunerLiveService microphone input — the same stream the Tuner surface needle reads — so a physical instrument can be tuned against the reference.', true, () => this.openLiveTunerInput(), 'tuner'),
          make(3, 'Read the live tuner input', 'Report the latest live needle reading from the shared tuner input, or say plainly that no stable note has been heard yet.', true, () => this.liveTunerReading(), 'tuner'),
          make(4, 'Stop the live tuner input', 'Close the shared tuner input after the instrument is in tune.', true, () => this.stopLiveTunerInput(), 'tuner'),
          make(5, 'Measure tuner reads from a recorded clip', 'Measure pitch on the selected track’s recorded audio clips and report the resulting note and cents. This is a recorded-clip reading; a live instrument still needs the Tuner input for a needle reading.', true, () => this.measureTunerReads(), 'tuner'),
          make(6, 'Check the same tuning reference across takes', 'Measure the recorded audio clips on every track against the one A4 reference and report each take’s deviation, so takes can be comped without pitch drift. This checks recorded material; a physical instrument still has to be tuned to the live input first.', true, () => this.tunerReferenceAcrossTakes(), 'tuner'),
          make(7, 'Recheck key after tuning', 'After tuning, run key detection again if the material was out of tune.', true, () => this.detectAndApplyKey()),
          make(8, 'Verify the live microphone on this device', 'Verify the microphone path on the device the artist is actually using: browser capture support, the audio inputs the device exposes, the permission state, and whether the shared tuner stream is live, silent or ended. This step never opens the microphone and never claims a pitch it did not measure.', true, () => this.verifyLiveMicrophone(), 'tuner'),
        ];
      case 'chord-editor':
        return [
          make(1, 'Generate a chord framework', 'Create a genre-aware progression from the session key and mood; Roman numerals are interpreted as guidance, not literal notes.', true, () => this.generateChordFramework(context)),
          make(2, 'Voicing check against the bass', 'Measure the bass and chord registers from the live project notes and flag any root collision.', true, () => this.chordBassRegisterCheck()),
          make(3, 'Turn the progression into parts', 'Generate a generator-backed chord framework, then write pad, bass and top-line notes into separate undoable tracks.', true, () => this.turnProgressionIntoParts(context), 'piano-roll'),
        ];
      case 'sampler':
        return [
          make(1, 'Find a sample that fits the key and tempo', 'Search the sound library by the session key/BPM and favorite only the sample that loops cleanly.', true, () => this.smartSearchSounds(context)),
          make(2, 'Slice the selected sample on phrase boundaries', 'Use transient detection and the sampler-slice utility to cut the selected imported sample on measured phrase boundaries, then load the resulting AudioBuffers into the shared Sampler pads and place arrangement audio clips for audition.', true, () => this.sliceSelectedSampleOnPhraseBoundaries(), 'sampler'),
          make(3, 'Chop against the generated groove', 'Use the generated drum pattern as the timing reference for the chop.', true, () => this.applyBeatPackage(context)),
        ];
      case 'score':
        return [
          make(1, 'Seed the score with a playable motif', 'Add a generated four-bar motif to the selected track so the score has a real subject.', true, () => this.seedMelodicTrack()),
          make(2, 'Audit the score’s range and scale fit', 'Measure the selected track’s pitch range and count notes that fall outside the detected project scale; add harmony only after this audit.', true, () => this.auditScoreRange()),
          make(3, 'Humanize the printed part', 'Add micro-timing and velocity variation so the notation does not sound mechanical.', true, () => this.humanizeSelectedTrack()),
          make(4, 'Export the score as MusicXML', 'Serialize every notation part into a MusicXML chart through the score utility and download it for MuseScore, Sibelius or Dorico.', true, () => this.exportScoreMusicXml(), 'score'),
          make(5, 'Open the score print/PDF dialog', 'Open the browser print dialog from the Score surface so the chart can be printed or saved as PDF.', true, () => this.printScorePdf(), 'score'),
        ];
      case 'sample-library':
        return [
          make(1, 'Search the library by musical fit', 'Use key, BPM, genre and mood instead of a random browser scroll.', true, () => this.smartSearchSounds(context)),
          make(2, 'Favorite the first playable winner', 'Save the first sample that sounds correct in the full session.', true, () => this.favoriteBestSound(context)),
          make(3, 'Install the closest curated pack', 'Install the not-yet-installed pack whose genre or mood matches the Director context, avoiding a duplicate install.', true, () => this.installClosestPack(context)),
        ];
      case 'plugins':
        return [
          make(1, 'Run the mix evidence pass first', 'Plugins should solve a measured problem, not become decoration.', true, () => this.analyzeAndApplyMix()),
          make(2, 'Apply the highest-value suggested plugin chain', 'Use the top mix suggestion as the plugin chain, then audition it in context.', true, () => this.applyTopMixSuggestion()),
          make(3, 'Bypass the chain for a reversible comparison', 'Bypass the selected track’s inserts with one undoable command; only commit the chain after the mix survives a full loop.', true, () => this.toggleInsertBypass()),
        ];
      case 'audio-recorder':
        return [
          make(1, 'Audit the saved takes', 'Read the recorder saved takes from persistence, including each take duration and measured level when stored, so the artist knows what already exists before recording another pass.', true, () => this.recorderTakeStatus()),
          make(2, 'Arm the selected track for the next record pass', 'Arm the selected track in RecordingStatusService so the next record press lands on it, then report the recorder take count and the track take counts without overwriting them. Arming is reversible from the mixer; capturing audio itself remains a surface gesture.', true, () => this.armRecorderTrack()),
          make(3, 'Move the best take into the session', 'Promote the strongest captured MIDI take through TakeManagerService so playback and comping use it.', true, () => this.promoteBestTake()),
        ];
      case 'performer':
        return [
          make(1, 'Select the strongest performance take', 'Rank the PerformanceRecordingService takes by captured notes then peak level, select the strongest in the carousel, and report the MIDI take count. Selecting is reversible; no take is overwritten.', true, () => this.selectStrongestPerformanceTake()),
          make(2, 'Arm the performer’s next take slot', 'Arm the next PerformanceRecordingService take slot for the selected track, then perform one complete pass and stop the take from the performer surface.', true, () => this.armNextPerformanceTake(), 'performer'),
          make(3, 'Merge the take comp into the track', 'Stack every take on the track, merge them through TakeManagerService, and write the comp back through MusicManagerService.replaceTrackNotes().', true, () => this.applyTakeComp()),
        ];
      case 'export':
        return [
          make(1, 'Run the final mastering pass', 'Master against the intended delivery surface before exporting.', true, () => this.autoMaster()),
          make(2, 'Complete the delivery export', 'Render the pre-master mix, apply the retained master chain, run the S.M.U.V.E polish, measure the polished buffer, encode a real WAV and download the delivery file.', true, () => this.completeDeliveryExport()),
          make(3, 'Check stems readiness before exporting stems', 'Confirm exactly which tracks become stems (every unmuted non-bus track) and which are skipped (muted tracks and buses) before spending time rendering them. No audio is rendered in this step.', true, () => this.stemsReadiness()),
          make(4, 'Check automation coverage for export', 'Read the automation lanes, modulation and macros, then state the honest per-format verdict: the project bundle round-trips the full automation snapshot and offline mixdowns/stems bake enabled lanes into the audio, while MIDI and DAWproject interchange drop automation curves. No audio is rendered in this step.', true, () => this.automationCoverage()),
          make(5, 'Export stems', 'Render each playable track to its own WAV and download the stems ZIP.', true, () => this.exportStems()),
          make(6, 'Export MIDI', 'Serialize the project’s note data to a Type 1 Standard MIDI File and download it.', true, () => this.exportMidi()),
          make(7, 'Export DAWproject', 'Serialize the project with reference audio to a .dawproject ZIP and download it.', true, () => this.exportDawproject()),
          make(8, 'Export project bundle', 'Download the open project as a portable .smuve bundle so the set can be re-imported later. Checkpoint bundles can be exported one by one from the Director checkpoint browser.', true, () => this.exportProjectBundle()),
          make(9, 'Export the transport loop as WAV', 'Render the current A/B loop region, or the active loop length from step 0 when no A/B region is set, and download it as a standalone 24-bit WAV.', true, () => this.exportTransportLoop('wav24')),
          make(10, 'Export the transport loop as MP3', 'Render the same loop region as a shareable MP3; the filename and result metadata carry the loop start/end steps.', true, () => this.exportTransportLoop('mp3')),
          make(11, 'Prepare the delivery checklist', 'Read the AI Produce release handoff and surface format, loudness target, artwork, metadata and next delivery step.', true, () => this.deliveryChecklist()),
        ];
    }
  }

  private missionFor(surfaceId: StudioSurfaceId): string {
    const missions: Record<StudioSurfaceId, string> = {
      'quick-session': 'Turn a fast environment choice into a clean loop, take or arrangement decision.',
      arrangement: 'Turn existing clips and notes into a coherent song structure.',
      session: 'Turn the clip grid into a playable live set.',
      'piano-roll': 'Turn notes into a key-correct, human performance.',
      'drum-machine': 'Turn a kit into a genre-correct, human groove.',
      'channel-rack': 'Turn step channels into balanced, playable layers.',
      mixer: 'Turn track levels into a transparent, balanced mix.',
      'effects-rack': 'Turn FX slots into one purposeful processing chain.',
      'vocal-suite': 'Turn a raw vocal into a tuned, clean, performance-ready take.',
      dj: 'Turn two decks into a phrase-accurate performance.',
      performance: 'Turn performance takes into one strongest complete pass.',
      mastering: 'Turn the mix into a deliverable master.',
      'ai-produce': 'Turn one prompt into a reviewable production package.',
      'sound-browser': 'Turn the library into the smallest useful palette.',
      'sound-pad': 'Turn the pad bank into instantly playable sounds.',
      synthesizer: 'Turn a synth lane into a purposeful sound-design layer.',
      tuner: 'Turn live pitch into a stable tuning reference.',
      'chord-editor': 'Turn a key and mood into a usable harmonic framework.',
      sampler: 'Turn samples into a loopable, phrase-correct instrument.',
      score: 'Turn a motif into a readable, playable score.',
      'sample-library': 'Turn the sample catalog into a curated working palette.',
      plugins: 'Turn plugin choices into a reversible, evidence-backed chain.',
      'audio-recorder': 'Turn microphone takes into one usable recorded pass.',
      performer: 'Turn live performance into comped, stage-ready takes.',
      export: 'Turn the finished master into a correct delivery package.',
    };
    return missions[surfaceId];
  }

  private successCriteriaFor(surfaceId: StudioSurfaceId): string[] {
    const criteria: Record<StudioSurfaceId, string[]> = {
      'quick-session': ['The selected environment matches the intended workflow.', 'Tempo and key are confirmed before recording or arranging.'],
      arrangement: ['The selected lane is audible.', 'Key/scale match the written material.', 'Sections create verse/chorus contrast.'],
      session: ['A clip grid exists.', 'The first generated scene plays without masking.'],
      'piano-roll': ['The selected track has playable notes.', 'Notes follow the active key/scale.', 'Humanization survives a full loop.'],
      'drum-machine': ['A drum track has playable hits.', 'The pattern survives EVOLVE and full-loop audition.'],
      'channel-rack': ['Generated layers are assigned to channels.', 'No duplicate channel roles remain.'],
      mixer: ['The mix pass is recomputed from current evidence.', 'Mute/solo state matches the intended arrangement.'],
      'effects-rack': ['One suggestion is applied and auditioned.', 'The chain survives bypass comparison.'],
      'vocal-suite': ['The take is measured before repair.', 'Harmony/polish are applied only after the repair plan is clear.'],
      dj: ['Both decks are auditionable.', 'Transitions stay in phrase.'],
      performance: ['The take count is known.', 'Only the strongest complete take is promoted.'],
      mastering: ['The master peaks below 0 dBFS.', 'The LUFS target matches the destination.'],
      'ai-produce': ['The idea, beat, lyrics and mix report are reviewed before applying.'],
      'sound-browser': ['A matching sound is found and favorited.', 'It survives full-loop audition.'],
      'sound-pad': ['A pad sound is playable at the session key/BPM.', 'The favorite survives full-loop audition.'],
      synthesizer: ['The synth lane has a playable melodic part.', 'The patch sits in the project key.'],
      tuner: ['A live reference is used.', 'Key detection is rechecked after tuning.'],
      'chord-editor': ['A progression exists.', 'Voicing does not mask the bass.'],
      sampler: ['The chosen sample loops cleanly.', 'Slices return to the downbeat.'],
      score: ['The motif is notated and in scale.', 'Humanization survives playback.'],
      'sample-library': ['A musical-fit search is performed.', 'Only a pack that expands the palette is installed.'],
      plugins: ['A measured problem drives the plugin choice.', 'The chain remains reversible until proven.'],
      'audio-recorder': ['Saved takes are counted before recording.', 'The promoted take survives full-session audition.'],
      performer: ['Take state is known before performing.', 'Only the strongest complete pass is comped.'],
      export: ['The master is checked and reviewed as a WAV.', 'Delivery format and metadata match the destination.'],
    };
    return criteria[surfaceId];
  }

  private selectFirstTrack(): string {
    const tracks = this.music.tracks();
    const track = tracks.find((t) => (t.notes?.length ?? 0) > 0) ?? tracks[0];
    if (!track) throw new Error('No tracks in the session yet.');
    this.music.selectedTrackId.set(track.id);
    return `Selected ${track.name} (${track.notes?.length ?? 0} notes).`;
  }

  private applySongStructure(): string {
    const sections = this.music.structure();
    const defaultIds = ['intro', 'verse', 'chorus', 'outro'];
    const isStockStructure =
      sections.length === defaultIds.length &&
      sections.every((section, index) => section.id === defaultIds[index]);
    if (sections.length > 0 && !isStockStructure) {
      return 'Kept the custom arrangement markers; the Director does not overwrite project structure without a lower-level undo.';
    }
    this.copilot.suggestStructure();
    const applied = this.music.structure();
    return `Applied the AI Copilot structure: ${applied.map((s) => s.name).join(' → ')}.`;
  }

  private launchFirstScene(): string {
    const count = this.music.sceneColumnCount();
    if (count === 0) return 'No pattern scene columns exist yet; generated notes are session clips, not scenes.';
    for (let column = 0; column < count; column++) {
      if (!this.music.sceneColumnHasContent(column)) continue;
      const switched = this.music.launchSceneColumn(column);
      return `Launched scene ${column + 1}; ${switched} channel${switched === 1 ? '' : 's'} switched. Use Back to Arrangement to reverse the launch.`;
    }
    return 'No scene column has pattern content yet; launch a pattern clip before using live scenes.';
  }

  private toggleInsertBypass(): string {
    const track = this.music.selectedTrack();
    if (!track) throw new Error('Select a track before A/B bypass.');
    const hasChain = (track.fxSlots?.length ?? 0) > 0 || (track.pluginIds?.length ?? 0) > 0;
    if (!hasChain) return `${track.name} has no insert chain to bypass.`;
    this.music.toggleAllInsertsBypass(track.id);
    return `Toggled the bypass state of the ${track.name} insert chain; the command is undoable and each slot’s saved state is preserved.`;
  }

  private prepareDjLoop(): string {
    this.engine.setDeckRate('B', 1, true);
    this.engine.setDeckLoop('B', true);
    return 'Deck B is set to unity rate with key-lock active; its loop is enabled for a clean phrase cue.';
  }

  private async bounceProjectReview(): Promise<string> {
    const result = await this.offlineBounce.bounce('wav-32-float');
    if (!result) throw new Error('Offline review bounce did not complete.');
    return `Offline review bounce rendered ${result.durationSeconds.toFixed(1)}s at ${Math.round(result.sampleRate / 1000)} kHz (${result.format}); measured peak ${result.peakDb} dBFS, RMS ${result.rmsDb} dBFS.`;
  }

  /**
   * Full Director delivery path. The Studio Export surface intentionally
   * pauses between rendering and encoding so the artist can review the
   * measured master; this step carries the same real render, master, S.M.U.V.E
   * polish, measurement, encode and download path through in one command.
   */
  private async completeDeliveryExport(): Promise<string> {
    const sampleRate = 44100;
    const preMaster = await this.exports.renderProjectOffline({
      sampleRate,
      preMaster: true,
    });
    const mastered = await this.exports.masterRetainedMix(preMaster);
    const polished = await this.exports.applySmuvePolish(mastered);
    const analysis = this.exports.analyzeBuffer(polished);
    const blob = await this.exports.exportToFormat(polished, 'wav24');
    if (!blob) throw new Error('Delivery export did not produce an audio file.');
    const project = (this.music.projectName || 'Elite_Session').replace(/[^\w.-]/g, '_');
    const filename = `${project}_Director_Delivery_24bit_${Date.now()}.wav`;
    this.exports.downloadBlob(blob, filename);
    return `Complete delivery export downloaded ${filename}: rendered ${analysis.durationSec.toFixed(1)}s at ${Math.round(sampleRate / 1000)} kHz, peak ${analysis.peakDb} dBFS, true peak ${analysis.truePeakDb} dBFS, RMS ${analysis.rmsDb} dBFS, ${analysis.lufs} LUFS.`;
  }

  private async exportStems(): Promise<string> {
    const blob = await this.exports.exportStems();
    if (!blob) throw new Error('Stem export did not complete.');
    return `Exported the stems ZIP (${blob.size} bytes) with the master WAV plus one WAV per unmuted non-bus track.`;
  }

  private exportMidi(): string {
    const blob = this.exports.exportProjectMidi();
    if (!blob) throw new Error('MIDI export did not produce a file.');
    const project = (this.music.projectName || 'Elite_Session').replace(/[^\w.-]/g, '_');
    const filename = `${project}_Director_MIDI_${Date.now()}.mid`;
    this.exports.downloadBlob(blob, filename);
    return `Exported project MIDI as ${filename} (${blob.size} bytes).`;
  }

  private async exportDawproject(): Promise<string> {
    const blob = await this.exports.exportDawproject();
    if (!blob) throw new Error('DAWproject export did not produce a package.');
    const project = (this.music.projectName || 'Elite_Session').replace(/[^\w.-]/g, '_');
    const filename = `${project}_Director_DAWproject_${Date.now()}.dawproject`;
    this.exports.downloadBlob(blob, filename);
    return `Exported DAWproject as ${filename} (${blob.size} bytes).`;
  }

  private async exportTransportLoop(format: string = 'wav24'): Promise<string> {
    const result = await this.exports.exportLoopWav({ format });
    const formatLabel = result.format ?? format;
    return `Exported the transport loop (${formatLabel}) as ${result.filename}: steps ${result.startStep + 1}-${result.endStep}, ${result.durationSec.toFixed(2)}s at ${result.sampleRate} Hz.`;
  }

  private exportScoreMusicXml(): string {
    const tracks = this.music.tracks().filter((track) => track.type !== 'audio' && track.type !== 'bus');
    const parts: MusicXmlPart[] = tracks
      .map((track) => ({
        name: track.name || 'Untitled track',
        notes: (track.notes ?? []).map((note) => ({
          midi: note.midi,
          step: note.step,
          length: note.length,
          velocity: note.velocity,
        })),
      }))
      .filter((part) => part.notes.length > 0);
    const noteCount = parts.reduce((total, part) => total + part.notes.length, 0);
    if (noteCount === 0) throw new Error('Add notes before exporting a score chart.');
    const xml = buildMusicXml(parts, {
      title: this.music.projectName,
      bpm: this.engine.tempo(),
    });
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    const filename = musicXmlFileName(this.music.projectName);
    this.exports.downloadBlob(blob, filename);
    return `Exported the score as ${filename} (${parts.length} parts, ${noteCount} notes) for MuseScore, Sibelius or Dorico.`;
  }

  private printScorePdf(): string {
    const noteCount = this.music.tracks().reduce((total, track) => total + ((track.type === 'audio' || track.type === 'bus') ? 0 : track.notes?.length ?? 0), 0);
    if (noteCount === 0) throw new Error('Add notes before printing a score chart.');
    window.print();
    return 'Opened the browser print dialog for the Score view; choose Save as PDF to create the score PDF.';
  }

  private applyQuickSessionStarter(): string {
    const recipe = this.ideas.recommend(this.engine.tempo());
    // applyGeneratedRecipe is undoable via History, but replacing a dirty
    // canvas (including a guest sketch with no autosave) would still be a
    // destructive default. Preserve the sketch and report instead.
    const dirty = typeof this.workspace.isDirty === 'function' ? this.workspace.isDirty() : false;
    if (dirty) {
      return `Recommended first Quick Session starter: ${recipe.name} at ${recipe.bpm} BPM (${recipe.vibe}). The open sketch is dirty, so it was preserved and nothing was replaced. Save it first, then apply the starter.`;
    }
    this.music.applyGeneratedRecipe(recipe as never);
    return `Applied the closest Quick Session starter: ${recipe.name} at ${recipe.bpm} BPM (${recipe.vibe}) via MusicManagerService.applyGeneratedRecipe. The change is undoable.`;
  }

  private evolveDrumVariation(): string {
    const drumTracks = this.music.tracks().filter(
      (track) => track.type === 'drum' && (track.notes?.length ?? 0) > 0,
    );
    const selected = this.music.selectedTrack();
    const track =
      (selected && selected.type === 'drum' && (selected.notes?.length ?? 0) > 0
        ? selected
        : drumTracks[0]) ?? null;
    if (!track) throw new Error('No drum track with notes is available to evolve.');

    const voices = [36, 38, 39, 42, 46];
    const evolvedNotes = (track.notes ?? [])
      .map((note) => {
        const roll = Math.random();
        if (roll < 0.2) return null;
        if (roll < 0.35) {
          return {
            ...note,
            velocity: Math.max(
              0.1,
              Math.min(1, (note.velocity ?? 0.8) + (Math.random() - 0.5) * 0.3),
            ),
          } as TrackNote;
        }
        return note;
      })
      .filter((note): note is TrackNote => note !== null);

    for (const midi of voices) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const step = Math.floor(Math.random() * 64);
        const exists = evolvedNotes.some(
          (note) => note.midi === midi && Math.round(note.step) === step,
        );
        if (!exists && Math.random() > 0.6) {
          evolvedNotes.push({
            id: this.nextId('evolve'),
            midi,
            step,
            length: 1,
            velocity: 0.5 + Math.random() * 0.4,
            probability: 0.8,
          });
        }
      }
    }

    this.music.replaceTrackNotes(track.id, evolvedNotes, 'Director EVOLVE variation');
    this.music.selectedTrackId.set(track.id);
    return `Evolved ${track.name}: mutated a focused slice of ${track.notes?.length ?? 0} hits, nudged velocities and added sparse accents; the variation is undoable.`;
  }

  private channelRoleAudit(): string {
    const tracks = this.music.tracks().filter((track) => track.type !== 'audio');
    if (tracks.length === 0) throw new Error('No Channel Rack channels are available to audit.');
    const roles = new Map<string, string[]>();
    for (const track of tracks) {
      const role = track.instrumentId || track.type;
      const names = roles.get(role) ?? [];
      names.push(track.name);
      roles.set(role, names);
    }
    const duplicates = [...roles.entries()].filter(([, names]) => names.length > 1);
    if (duplicates.length === 0) {
      return `${tracks.length} channel roles audited; no duplicate primary instrument assignments found.`;
    }
    return `${tracks.length} channel roles audited; duplicate assignments: ${duplicates.map(([role, names]) => `${role} (${names.join(', ')})`).join('; ')}.`;
  }

  private latestVocalGuidance(): string {
    const advice = this.vocal.currentAdvice().trim();
    if (!advice || advice.length <= 12) {
      throw new Error('No measured vocal guidance is available yet; upload a vocal take in the Vocal Suite first.');
    }
    return `Latest Vocal AI guidance: ${advice}`;
  }

  /**
   * Measure the selected track's recorded audio clip with the same pure
   * sample analysis the Vocal Suite uses for uploads, so the Director reports
   * real numbers instead of only repeating a text note. When the selected
   * track has no recorded clip, fall back to the latest guidance readout.
   */
  private measureVocalTake(): string {
    const tracks = this.music.tracks();
    const selected = this.music.selectedTrack();
    const ordered = [selected, ...tracks.filter((track) => track.id !== selected?.id)].filter(
      (track): track is TrackModel => !!track,
    );
    for (const track of ordered) {
      if (track.type !== 'vocal' && track.type !== 'audio') continue;
      const clip = (track.clips ?? []).find(
        (candidate) => candidate.type === 'audio' && candidate.audioData,
      );
      if (!clip?.audioData) continue;
      const analysis = analyzeVocalBuffer(clip.audioData);
      const advice = this.vocal.currentAdvice().trim();
      const adviceText =
        advice && advice.length > 12 ? ` Latest guidance: ${advice}` : '';
      return `Measured vocal take on ${track.name} (${clip.name || clip.id}): ${analysis.durationSeconds.toFixed(1)}s, peak ${analysis.peakDb} dBFS, RMS ${analysis.rmsDb} dBFS, crest ${analysis.crestDb} dB, ${Math.round(analysis.silentRatio * 100)}% silence, ${analysis.clippedSamples} clipped samples, ${analysis.channels}ch @ ${analysis.sampleRate} Hz.${adviceText}`;
    }
    return this.latestVocalGuidance();
  }

  private applyConservativeVocalPolish(): string {
    const advice = this.vocal.currentAdvice().trim();
    if (!advice || advice.length <= 12) {
      throw new Error('No measured vocal guidance is available yet; upload and analyze a vocal take before applying polish.');
    }

    const current = this.vocalMastering.params();
    const patch: Partial<MasteringParameters> = {
      deesser: {
        ...current.deesser,
        threshold: -24,
        frequency: 6500,
        bypass: false,
      },
      multiband: {
        low: {
          ...current.multiband.low,
          threshold: -20,
          ratio: 4,
          frequency: 320,
          bypass: false,
        },
        mid: {
          ...current.multiband.mid,
          threshold: -18,
          ratio: 2.5,
          bypass: false,
        },
        high: {
          ...current.multiband.high,
          threshold: -16,
          ratio: 2,
          frequency: 2500,
          bypass: false,
        },
      },
      exciter: {
        ...current.exciter,
        amount: Math.min(Math.max(0, current.exciter.amount), 0.12),
        frequency: 8000,
        bypass: false,
      },
      eq: { low: 0, mid: 0, high: 0, bypass: false },
      limiter: {
        ...current.limiter,
        ceiling: -0.5,
        release: 0.12,
        bypass: false,
      },
    };
    this.vocalMastering.updateParams(patch);
    return `Applied conservative vocal polish after existing Vocal AI guidance: de-esser at 6.5 kHz, multiband low/mid/high enabled, exciter capped at ${patch.exciter!.amount.toFixed(2)}, flat EQ and limiter ceiling -0.5 dB.`;
  }

  private armNextPerformanceTake(): string {
    if (this.performanceRecording.isRecording()) {
      throw new Error('A performance take is already recording; stop it before arming another pass.');
    }
    const selected = this.music.selectedTrack();
    const nextTake = Math.max(1, this.performanceRecording.takes().length + 1);
    this.performanceRecording.arm(nextTake);
    return `Armed take ${nextTake}${selected ? ` for ${selected.name}` : ''}; perform the complete pass now and stop the take from the performance surface to capture it.`;
  }

  private synthRegisterCheck(): string {
    const tracks = this.music.tracks().filter((track) => (track.notes?.length ?? 0) > 0);
    if (tracks.length === 0) throw new Error('No synth notes are available for a register check.');
    const selected = this.music.selectedTrack();
    const ranges = tracks.map((track) => {
      const midis = (track.notes ?? []).map((note) => note.midi);
      return { name: track.name, low: Math.min(...midis), high: Math.max(...midis) };
    });
    const bass = [...ranges].sort((a, b) => a.low - b.low)[0];
    const synth = ranges.find((range) => range.name === selected?.name && range.name !== bass.name) ?? ranges.find((range) => range.name !== bass.name) ?? ranges[0];
    return `Synth register ${synth.name} spans MIDI ${synth.low}–${synth.high}; bass register ${bass.name} spans MIDI ${bass.low}–${bass.high}; ${synth.low <= bass.high ? 'the synth enters the bass register, so raise the patch or lower the bass before committing' : 'the synth register stays clear of the bass register'}.`;
  }

  private applyAiProduceArtifacts(): string {
    const trackIds = this.produce.applyToProject();
    if (trackIds.length === 0) return 'No AI Produce artifacts were available to apply; run the production step first.';
    return `Applied ${trackIds.length} AI Produce track${trackIds.length === 1 ? '' : 's'} to the project.`;
  }

  private surfaceSimilarSounds(context: StudioDirectorContext): string {
    const query = this.soundQuery(context);
    const results = this.sounds.smartSearch(query);
    const target = results[0] ?? this.sounds.sounds()[0];
    if (!target) throw new Error('No sound is available to compare.');
    const similar = this.sounds.findSimilar(target.id, 6);
    this.sounds.recordUsage(target.id);
    if (similar.length === 0) return `${target.name} has no close neighbours in the current catalog.`;
    return `Closest neighbours to ${target.name}: ${similar.map((s) => s.name).join(', ')}. Audition them against the favourite before replacing it.`;
  }

  private async installClosestPack(context: StudioDirectorContext): Promise<string> {
    const available = this.sounds.availablePacks();
    if (available.length === 0) return 'Every curated sound pack is already installed.';
    const genre = context.genre?.toLowerCase();
    const mood = context.mood?.toLowerCase();
    const pack = available.find((candidate) => candidate.genre.toLowerCase() === genre || candidate.mood.toLowerCase() === mood) ?? available[0];
    await this.sounds.installPack(pack.id);
    return `Installed ${pack.name}: ${pack.description}`;
  }

  private promoteBestTake(): string {
    const taken = this.tracksWithTakes();
    if (taken.length === 0) throw new Error('No MIDI takes are available to promote.');
    const { track, takes } = taken[0];
    const best = takes.reduce((winner, take) => {
      const score = take.noteCount ?? take.notes?.length ?? 0;
      const bestScore = winner.noteCount ?? winner.notes?.length ?? 0;
      return score > bestScore ? take : winner;
    });
    this.takeManager.setActiveTake(track.id, best.id);
    this.music.selectedTrackId.set(track.id);
    return `Promoted ${best.label ?? best.id} (${best.noteCount ?? best.notes?.length ?? 0} notes) as the active take on ${track.name}.`;
  }

  private applyTakeComp(): string {
    const taken = this.tracksWithTakes();
    if (taken.length === 0) throw new Error('No MIDI takes are available to comp.');
    const { track, takes } = taken[0];
    const stack = new Set(this.takeManager.compStack(track.id)());
    for (const take of takes) {
      if (!stack.has(take.id)) this.takeManager.toggleCompTake(track.id, take.id);
    }
    const merged = this.takeManager.applyComp(track.id);
    if (merged.length === 0) throw new Error('The comp stack produced no notes.');
    this.music.replaceTrackNotes(track.id, merged, 'Director Take Comp');
    this.music.selectedTrackId.set(track.id);
    return `Merged ${takes.length} take${takes.length === 1 ? '' : 's'} into ${merged.length} comp notes on ${track.name}; the replace is undoable.`;
  }

  private auditScoreRange(): string {
    const track = this.music.selectedTrack() ?? this.music.tracks().find((t) => (t.notes?.length ?? 0) > 0);
    if (!track) throw new Error('No track with notes is available to audit.');
    const notes = track.notes ?? [];
    if (notes.length === 0) throw new Error(`${track.name} has no notes to audit.`);
    const midis = notes.map((n) => n.midi);
    const low = Math.min(...midis);
    const high = Math.max(...midis);
    const key = this.scaleRootForAudit();
    const scale = this.lastDetectedScale;
    const outside = notes.filter((n) => !this.scale.isInScale(n.midi, key, scale)).length;
    return `${track.name} spans MIDI ${low}–${high} (${high - low} semitones); ${outside} of ${notes.length} note${notes.length === 1 ? '' : 's'} fall outside ${key} ${scale}.`;
  }

  private tracksWithTakes() {
    return this.music.tracks()
      .map((track) => ({ track, takes: this.takeManager.getTakes(track.id)() }))
      .filter((entry) => entry.takes.length > 0);
  }

  private scaleRootForAudit(): string {
    const projectKey = this.workspace.metadata()?.key ?? 'C';
    const root = projectKey.replace(/m$/i, '').trim() || 'C';
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].includes(root) ? root : 'C';
  }

  private tunerReferenceStatus(): string {
    const root = this.scaleRootForAudit();
    const rootMidi = 60 + PITCHES.indexOf(root);
    const frequency = midiToFrequency(rootMidi);
    const key = this.workspace.metadata()?.key ?? 'C';
    return `Tuning reference: A4 440 Hz with ±${DEFAULT_TUNER_TOLERANCE_CENTS} cents tolerance; project key is ${key} ${this.lastDetectedScale}, so use ${root}4 around ${frequency.toFixed(1)} Hz as the shared reference before opening the tuner input.`;
  }

  /** Open the shared live tuner microphone input; the Tuner surface reads it too. */
  private async openLiveTunerInput(): Promise<string> {
    if (!this.tunerLive.listening() && !this.tunerLive.starting()) {
      await this.tunerLive.start();
    }
    const error = this.tunerLive.error();
    if (error) throw new Error(error);
    const device = this.tunerLive.deviceLabel();
    if (this.tunerLive.listening()) {
      return `Live tuner input is open on ${device}. Play or sing the reference note; the Tuner surface needle and the next Director read follow the same stream.`;
    }
    return `Live tuner input is opening on ${device}. Play or sing the reference note once the needle is live.`;
  }

  private liveTunerReading(): string {
    const reading = this.tunerLive.reading();
    const device = this.tunerLive.deviceLabel();
    if (!reading) {
      return this.tunerLive.listening()
        ? `Live tuner is listening on ${device}; no stable note yet — play or sing a sustained note.`
        : 'Live tuner is idle; open the live tuner input first.';
    }
    const sign = reading.cents > 0 ? '+' : '';
    const status = reading.inTune ? 'in tune' : 'out of tune';
    return `Live tuner read on ${device}: ${reading.note}${reading.octave} at ${reading.frequency.toFixed(1)} Hz (${sign}${reading.cents.toFixed(1)} cents) — ${status}.`;
  }

  private stopLiveTunerInput(): string {
    this.tunerLive.stop();
    return 'Live tuner input stopped.';
  }

  /**
   * Measure pitch on the selected track’s recorded audio clips and report the
   * tuner reading. This reads recorded audio, not a live Tuner input; the
   * Tuner surface remains the live needle path for physical instruments.
   */
  private measureTunerReads(): string {
    const track = this.music.selectedTrack();
    if (!track) throw new Error('Select a track with a recorded audio clip before measuring tuner reads.');
    const audioClips = (track.clips ?? []).filter((clip) => clip.type === 'audio');
    if (audioClips.length === 0) throw new Error(`${track.name} has no recorded audio clips to measure.`);

    const measured = this.measureTrackTunerMedian(track);
    if (!measured) throw new Error(`${track.name} has audio clips, but none produced a stable pitch reading.`);
    const { median, frames } = measured;
    const sign = median.cents > 0 ? '+' : '';
    const status = Math.abs(median.cents) <= DEFAULT_TUNER_TOLERANCE_CENTS ? 'in tune' : 'out of tune';
    return `Tuner read on ${track.name}: ${median.note}${median.octave} at ${median.frequency.toFixed(1)} Hz (${sign}${median.cents.toFixed(1)} cents) — ${status} from ${frames} measured frame${frames === 1 ? '' : 's'}.`;
  }

  /**
   * Check every recorded take against the one A4 reference so takes can be
   * comped without pitch drift. Recorded material only: a physical
   * instrument must still be tuned to the live input first.
   */
  private tunerReferenceAcrossTakes(): string {
    const withAudio = this.music
      .tracks()
      .filter((track) => (track.clips ?? []).some((clip) => clip.type === 'audio'));
    if (withAudio.length === 0) {
      throw new Error('No recorded audio clips are available to check against the tuning reference. Record a take first, or tune a physical instrument with the live input.');
    }
    const results = withAudio
      .map((track) => ({ track, measured: this.measureTrackTunerMedian(track) }))
      .filter((entry): entry is { track: TrackModel; measured: { median: { note: string; octave: number; cents: number; frequency: number }; frames: number } } => entry.measured !== null);
    if (results.length === 0) {
      throw new Error('The recorded clips produced no stable pitch readings, so the reference cannot be compared across takes.');
    }
    const cents = results.map((entry) => entry.measured.median.cents);
    const spread = Math.max(...cents) - Math.min(...cents);
    const inTune = results.filter((entry) => Math.abs(entry.measured.median.cents) <= DEFAULT_TUNER_TOLERANCE_CENTS).length;
    const detail = results
      .map((entry) => {
        const { median } = entry.measured;
        const sign = median.cents > 0 ? '+' : '';
        const status = Math.abs(median.cents) <= DEFAULT_TUNER_TOLERANCE_CENTS ? 'in tune' : 'out of tune';
        return `${entry.track.name}: ${median.note}${median.octave} (${sign}${median.cents.toFixed(1)} cents, ${status})`;
      })
      .join('; ');
    const verdict = inTune === results.length
      ? 'every checked take agrees with the A4 reference'
      : spread > 20
        ? 'the takes disagree by more than one tolerance band, so retune the out-of-tune takes before comping'
        : 'some takes sit outside tolerance, so check them before comping';
    return `Same reference across takes (A4 440 Hz ±${DEFAULT_TUNER_TOLERANCE_CENTS} cents): ${detail}. Spread ${spread.toFixed(1)} cents — ${verdict}.`;
  }

  /** Median pitch reading measured from one track's recorded audio clips. */
  private measureTrackTunerMedian(track: TrackModel): { median: { note: string; octave: number; cents: number; frequency: number }; frames: number } | null {
    const audioClips = (track.clips ?? []).filter((clip) => clip.type === 'audio');
    const readings: Array<{ note: string; octave: number; cents: number; frequency: number }> = [];
    for (const clip of audioClips) {
      const buffer = clip.audioData ?? (clip.audioRefId ? this.music.stemAudioCache.get(clip.audioRefId) : undefined);
      if (!buffer || buffer.numberOfChannels === 0 || buffer.length === 0) continue;
      const data = buffer.getChannelData(0);
      const sampleRate = buffer.sampleRate;
      const frameSize = Math.max(512, Math.round(sampleRate * 0.05));
      const hop = Math.max(128, Math.round(sampleRate * 0.02));
      for (let start = 0; start + frameSize <= data.length; start += hop) {
        const frame = data.subarray(start, start + frameSize);
        let energy = 0;
        for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
        const rms = Math.sqrt(energy / frame.length);
        if (rms < 0.004) continue;
        const frequency = detectPitch(frame, sampleRate, {
          clarityThreshold: 0.6,
          silenceThreshold: 0.004,
        });
        if (frequency === null) continue;
        const reading = frequencyToNote(frequency);
        if (reading) readings.push({ note: reading.note, octave: reading.octave, cents: reading.cents, frequency: reading.frequency });
        if (readings.length >= 24) break;
      }
      if (readings.length >= 24) break;
    }

    if (readings.length === 0) return null;
    const sorted = [...readings].sort((a, b) => a.frequency - b.frequency);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { median, frames: readings.length };
  }

  private detectAndApplyKey(): string {
    const notes = this.music.tracks().flatMap((t) => (t.notes ?? []).map((n) => ({ midi: n.midi, length: n.length ?? 1 })));
    const result = this.scale.detectKeyAndScale(notes);
    if (!result) throw new Error('No notes available to detect key.');
    this.lastDetectedScale = result.scale;
    if (this.workspace.metadata()) this.workspace.updateMetadata({ key: result.key });
    return `Detected ${result.key} ${result.scale} at ${Math.round(result.confidence * 100)}% confidence and applied it to the project.`;
  }

  private humanizeSelectedTrack(): string {
    const trackId = this.music.selectedTrackId();
    if (!trackId) throw new Error('Select a track before humanizing.');
    this.music.humanizeTrack(trackId);
    const track = this.music.tracks().find((t) => t.id === trackId);
    return `Humanized ${track?.name ?? trackId}; micro-timing and velocity variation applied.`;
  }

  private analyzeAndApplyMix(): string {
    this.mix.analyzeAll();
    const suggestions = this.mix.suggestions();
    if (suggestions.length === 0) return 'Mix analysis ran; no new suggestions were produced.';
    const applied = this.applyTopMixSuggestion();
    return `Mix analysis recomputed ${suggestions.length} suggestions. ${applied}`;
  }

  private applyTopMixSuggestion(): string {
    const suggestions = this.mix.suggestions();
    if (suggestions.length === 0) this.mix.analyzeAll();
    const suggestion = this.mix.suggestions()[0];
    if (!suggestion) return 'No mix suggestion is available to apply.';
    const applied = this.mix.applySuggestion(suggestion.id);
    return applied ? `Applied ${suggestion.label} (${suggestion.reason})` : `Could not apply ${suggestion.label}.`;
  }

  private applyNeuralNudge(): string {
    // NeuralMixerService is intentionally a rough nudge; the label keeps the
    // Director honest about what it does.
    this.neural.applyNeuralMix();
    return 'Applied the rough neural balance: randomized ±5% gain nudge plus safety compression on tracks without FX.';
  }

  private autoMaster(): string {
    const genre = this.mix.detectGenre?.() ?? 'pop';
    const report = this.mix.autoMaster(genre);
    return report.slice(-3).join(' ') || `Auto-mastered with the ${genre} profile.`;
  }

  private applyBeatPackage(context: StudioDirectorContext): string {
    const style = context.style ?? context.genre ?? 'pop';
    const beat = this.beat.generateBeat(style, `${style} | Director`, context.bpm);
    this.engine.tempo.set(beat.bpm);
    const music = this.music;
    const summary: string[] = [`Generated ${beat.drums.name} at ${beat.bpm} BPM in ${beat.key}.`];

    const drumTrack = this.ensureTrack('Director Drums', 'trap-kit-elite', 'drum');
    const drumNotes = this.drumNotesFromPattern(beat.drums);
    this.addNotesToTrack(drumTrack.id, drumNotes);
    summary.push(`${drumNotes.length} drum hits written to ${drumTrack.name}.`);

    const bassTrack = this.ensureTrack('Director Bass', 'grand-piano', 'midi');
    const bassNotes = beat.bass.notes.map((n) => this.noteFromPitch(n.pitch, n.octave, n.position, n.duration, n.velocity));
    this.addNotesToTrack(bassTrack.id, bassNotes);
    summary.push(`${bassNotes.length} bass notes written to ${bassTrack.name}.`);

    const leadTrack = this.ensureTrack('Director Lead', 'grand-piano', 'midi');
    const leadNotes = beat.melody.flatMap((phrase) =>
      phrase.notes.map((n) => this.noteFromPitch(n.pitch, n.octave, n.position, n.duration, n.velocity)),
    );
    this.addNotesToTrack(leadTrack.id, leadNotes);
    summary.push(`${leadNotes.length} melody notes written to ${leadTrack.name}.`);

    music.selectedTrackId.set(leadTrack.id);
    return summary.join(' ');
  }

  private seedMelodicTrack(): string {
    const selected = this.music.selectedTrack();
    if (selected && (selected.notes?.length ?? 0) > 0) {
      return `${selected.name} already has ${selected.notes.length} notes; keeping the existing material.`;
    }
    const returnValue = this.applyBeatPackage({ surfaceId: 'piano-roll' });
    if (selected) this.music.selectedTrackId.set(selected.id);
    return returnValue;
  }

  private generateHarmonyFromSelectedTake(): string {
    const melody = this.selectedMelody();
    if (melody.length === 0) throw new Error('No melodic notes found to harmonize.');
    const track = this.ensureTrack('Director Harmony', 'grand-piano', 'midi');
    // Keep the Director honest: this is a simple major-third harmony, not a
    // measured vocal arrangement. The full Vocal Suite remains the model.
    const harmonyNotes = melody.map((note, i) => ({
      id: this.nextId('harmony'),
      midi: note.midi + 4,
      step: note.step,
      length: note.length,
      velocity: 0.72,
    }));
    this.addNotesToTrack(track.id, harmonyNotes);
    return `Wrote ${harmonyNotes.length} major-third harmony notes to ${track.name}.`;
  }

  private prepareDjDecks(): string {
    this.engine.setDeckGain('A', 0.8);
    this.engine.setDeckGain('B', 0.8);
    this.engine.setCrossfader(0.5);
    return 'Deck A and B gains set to 80% with the crossfader centred for a neutral audition.';
  }

  private quickSessionReadiness(): string {
    const metadata = this.workspace.metadata() as { bpm?: unknown; key?: unknown } | null;
    const projectBpm = typeof metadata?.bpm === 'number' && Number.isFinite(metadata.bpm) && metadata.bpm > 0 ? metadata.bpm : null;
    let tempo = this.engine.tempo();
    let synced = false;
    if (projectBpm !== null && projectBpm !== tempo) {
      this.engine.tempo.set(projectBpm);
      tempo = projectBpm;
      synced = true;
    }
    const key = typeof metadata?.key === 'string' && metadata.key ? metadata.key : 'C';
    const metronome = this.engine.metronomeEnabled();
    const syncText = synced ? ` Synced the engine tempo to the project tempo ${projectBpm} BPM.` : projectBpm !== null ? ' Engine tempo already matches the project tempo.' : ' No project tempo is stored, so the engine tempo was left alone.';
    return `Quick Session checkpoint: ${tempo} BPM · ${key} ${this.lastDetectedScale} · metronome ${metronome ? 'on' : 'off'} · transport ${this.engine.isPlaying() ? 'playing' : 'stopped'}.${syncText} Confirm these before recording or arranging.`;
  }

  private quickSessionNextMove(): string {
    const tracks = this.music.tracks();
    const notes = tracks.reduce((sum, track) => sum + (track.notes?.length ?? 0), 0);
    const clips = tracks.reduce((sum, track) => sum + (track.clips?.length ?? 0), 0);
    if (tracks.length === 0) return 'Recommended next move: build a one-tap groove in Quick Session before moving to Arrangement.';
    if (notes === 0 && clips === 0) return 'Recommended next move: add a groove or channel in Quick Session before arranging.';
    const playable = tracks.find((track) => (track.notes?.length ?? 0) > 0) ?? tracks[0];
    if (playable) this.music.selectedTrackId.set(playable.id);
    const focus = playable ? ` Selected ${playable.name} as the focus track.` : '';
    if (notes > 0 && clips === 0) return `Recommended next move: refine the loop on the focused track, then move to Arrangement for structure.${focus}`;
    return `Recommended next move: ${tracks.length} tracks, ${notes} notes and ${clips} clips are already in the session, so move to Arrangement and shape the sections.${focus}`;
  }

  private auditMixerMuteSolo(): string {
    const tracks = this.music.tracks();
    const muted = tracks.filter((track) => track.muted).length;
    const soloed = tracks.filter((track) => track.soloed).length;
    const selected = this.music.selectedTrack();
    return `Mute/solo audit: ${muted} of ${tracks.length} tracks muted; ${soloed} soloed; selected ${selected?.name ?? 'none'} is ${selected?.muted ? 'muted' : 'unmuted'}, ${selected?.soloed ? 'soloed' : 'not soloed'}.`;
  }

  /**
   * Read the post-fader channel meters from the engine taps. Meters are
   * silence when the transport is stopped, so the report says whether the
   * session was playing instead of inventing a balance judgement.
   */
  private mixerChannelMeters(): string {
    const tracks = this.music.tracks();
    if (tracks.length === 0) throw new Error('No mixer channels are available to meter.');
    if (typeof this.engine.getTrackLevel !== 'function') {
      throw new Error('The channel meter API is unavailable in this environment.');
    }
    const playing = this.engine.isPlaying();
    const rows = tracks.map((track) => {
      const peak = Math.max(0, Math.min(1, this.engine.getTrackLevel(track.id)));
      const rmsDb =
        typeof this.engine.getTrackMomentaryLevelDb === 'function'
          ? this.engine.getTrackMomentaryLevelDb(track.id)
          : null;
      const correlation =
        typeof this.engine.getTrackCorrelation === 'function'
          ? this.engine.getTrackCorrelation(track.id)
          : null;
      return { track, peak, rmsDb, correlation };
    });
    const loudest = [...rows].sort((a, b) => b.peak - a.peak)[0];
    const clipping = rows.filter((row) => row.peak >= 0.99);
    const selected = this.music.selectedTrack();
    const selectedRow = selected ? rows.find((row) => row.track.id === selected.id) : undefined;
    const correlationText = (value: number | null): string =>
      value === null ? 'no signal' : `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}`;
    const monoText = (value: number | null): string =>
      value === null ? 'no signal' : value < 0 ? 'out of phase' : value < 0.3 ? 'wide' : 'mono safe';
    const masterCorrelation =
      typeof this.engine.outputCorrelation === 'function'
        ? (this.engine.outputCorrelation as () => number | null)()
        : null;
    const masterLufs =
      typeof this.engine.outputLufs === 'function'
        ? (this.engine.outputLufs as () => number | null)()
        : null;
    const summary = rows
      .map(
        (row) =>
          `${row.track.name} peak ${row.peak.toFixed(2)}${
            row.rmsDb === null ? '' : `, momentary ${row.rmsDb.toFixed(1)} dBFS`
          }, correlation ${correlationText(row.correlation)} (${monoText(row.correlation)})`,
      )
      .join('; ');
    const masterText =
      `Master correlation ${correlationText(masterCorrelation)}` +
      (masterLufs === null ? '' : `, output ${masterLufs.toFixed(1)} LUFS`);
    const verdict = clipping.length > 0
      ? `Clipping risk: ${clipping.map((row) => row.track.name).join(', ')} reached full scale.`
      : 'No channel is clipping.';
    const selectedText = selectedRow
      ? ` Selected ${selectedRow.track.name}: peak ${selectedRow.peak.toFixed(2)}.`
      : '';
    return `Channel meters (${playing ? 'transport playing' : 'transport stopped — meters read silence, press play to judge balance'}): ${summary}. Loudest: ${loudest.track.name} at ${loudest.peak.toFixed(2)}. ${masterText}. ${verdict}${selectedText}`;
  }

  /**
   * One snapshot of the console routing: real audio group buses with their
   * members, master-routed channels, VCA control buses with their
   * assignments, and send levels. Reads project state and the engine routes.
   */
  private mixerBusSnapshot(): string {
    const tracks = this.music.tracks();
    if (tracks.length === 0) throw new Error('No mixer channels are available to snapshot.');
    const busTracks = tracks.filter((track) => track.type === 'bus');
    const busIdOf = (track: TrackModel): string | undefined =>
      track.busId ??
      (typeof this.engine.getTrackBus === 'function' ? this.engine.getTrackBus(track.id) : undefined);
    const membersOf = (busId: string): string[] =>
      tracks.filter((track) => track.type !== 'bus' && busIdOf(track) === busId).map((track) => track.name);
    const masterRouted = tracks.filter((track) => track.type !== 'bus' && !busIdOf(track)).length;
    const busText =
      busTracks.length === 0
        ? 'no group buses'
        : busTracks
            .map((bus) => {
              const members = membersOf(bus.id);
              return `${bus.name} → ${members.length > 0 ? members.join(', ') : 'no members'}`;
            })
            .join('; ');
    const vcaBuses =
      typeof this.vcaBuses.buses === 'function' ? this.vcaBuses.buses() : [];
    const vcaText =
      vcaBuses.length === 0
        ? 'no VCA buses'
        : vcaBuses
            .map((bus) => {
              const assigned =
                typeof this.vcaBuses.trackIdsForBus === 'function'
                  ? this.vcaBuses.trackIdsForBus(bus.id)
                  : [];
              const names = assigned
                .map((id) => tracks.find((track) => track.id === id)?.name ?? id)
                .join(', ');
              return `${bus.name} at ${(bus.faderValue * 100).toFixed(0)}%${bus.muted ? ' (muted)' : ''} → ${names || 'no assignments'}`;
            })
            .join('; ');
    const withSends = tracks.filter(
      (track) => (track.sendA ?? 0) > 0.001 || (track.sendB ?? 0) > 0.001,
    );
    const sendText =
      withSends.length === 0
        ? 'no sends raised'
        : `${withSends.length} channel${withSends.length === 1 ? '' : 's'} sending: ${withSends
            .map((track) => `${track.name} A ${Math.round((track.sendA ?? 0) * 100)}% / B ${Math.round((track.sendB ?? 0) * 100)}%`)
            .join('; ')}`;
    return `Bus snapshot: ${busText}; ${masterRouted} channel${masterRouted === 1 ? '' : 's'} to master; VCA: ${vcaText}; ${sendText}. Master fader ${Math.round(this.engine.masterGainValue() * 100)}%${this.engine.masterMuted() ? ' (muted)' : ''}.`;
  }

  /**
   * The stem renderer's own inclusion rule, read before rendering: Export-
   * Service writes the master plus one WAV per unmuted non-bus track, skips
   * muted tracks, and ignores solo. This check renders nothing.
   */
  private stemsReadiness(): string {
    const tracks = this.music.tracks();
    if (tracks.length === 0) throw new Error('No tracks are available for stems export.');
    const ready = tracks.filter((track) => !track.muted && track.type !== 'bus');
    const mutedSkipped = tracks.filter((track) => track.muted && track.type !== 'bus');
    const buses = tracks.filter((track) => track.type === 'bus');
    if (ready.length === 0) {
      throw new Error('No tracks are ready for stems export: every track is muted or a bus, so the stem renderer would only write the master.');
    }
    const names = (list: TrackModel[]): string => (list.length > 0 ? list.map((track) => track.name).join(', ') : 'none');
    return `Stems readiness: ${ready.length} of ${tracks.length} tracks will be rendered (${names(ready)}) plus the master, at 24-bit / 44.1 kHz. Muted tracks skipped: ${names(mutedSkipped)}. Bus tracks are not stems: ${names(buses)}. Solo is ignored by the stem renderer.`;
  }

  /**
   * Automation readout plus the honest per-format export verdict. Lanes,
   * modulation and macros come straight from AutomationService; the verdict
   * mirrors the real export paths: the project bundle snapshots everything
   * for round-trip, offline mixdowns and stems bake enabled lanes (including
   * CC curves) into the rendered audio, and MIDI/DAWproject interchange has
   * no faithful mapping for automation curves, so those drop them.
   */
  private automationCoverage(): string {
    const lanes = this.automation?.lanes?.() ?? [];
    const modulation = this.automation?.modulationSources?.() ?? [];
    const macros = this.automation?.macros?.() ?? [];
    const writeMode = this.automation?.writeMode?.() ?? 'touch';
    const trackName = (trackId: string): string => {
      if (trackId === 'master' || trackId.startsWith('aux:') || trackId.startsWith('vca:')) return trackId;
      return this.music.tracks().find((track) => track.id === trackId)?.name ?? trackId;
    };
    const enabled = lanes.filter((lane) => lane.enabled);
    const disabled = lanes.filter((lane) => !lane.enabled);
    const empty = lanes.filter((lane) => lane.points.length === 0);
    const laneText =
      lanes.length === 0
        ? 'no automation lanes'
        : lanes
            .map(
              (lane) =>
                `${trackName(lane.target.trackId)} ${lane.target.parameter}: ${lane.points.length} points, ${lane.interpolation}${lane.enabled ? '' : ' (disabled)'}`,
            )
            .join('; ');
    const modulationText = `${modulation.filter((source) => source.enabled).length} of ${modulation.length} modulation sources enabled`;
    return `Automation: ${enabled.length} of ${lanes.length} lanes enabled (${laneText}); ${disabled.length} disabled, ${empty.length} empty; ${modulationText}; ${macros.length} performance macros; write mode ${writeMode}. Export coverage: project bundle carries the full automation snapshot (lanes, macros, modulation) for round-trip; offline mixdowns and stems bake enabled lanes into the audio including MIDI CC curves; MIDI and DAWproject interchange drop automation curves and carry notes plus level/pan/mute/solo only.`;
  }

  /**
   * On-device microphone verification: support, exposed inputs, permission
   * state, and the live stream state — without opening the microphone or
   * claiming a pitch that was not measured.
   */
  private async verifyLiveMicrophone(): Promise<string> {
    const verification: LiveInputVerification = await this.tunerLive.verifyDevice();
    const inputText =
      verification.audioInputCount < 0
        ? `input enumeration unavailable${verification.error ? ` (${verification.error})` : ''}`
        : verification.audioInputCount === 0
          ? 'no audio input devices exposed'
          : `${verification.audioInputCount} audio input${verification.audioInputCount === 1 ? '' : 's'} exposed${
              verification.audioInputLabels.length > 0 ? ` (${verification.audioInputLabels.join(', ')})` : ' (labels hidden until permission)'
            }`;
    const permissionText =
      verification.permissionState
        ? `permission ${verification.permissionState}`
        : 'permission state unknown';
    const streamText = verification.listening
      ? `tuner stream ${verification.trackState} on ${verification.deviceLabel} at ${Math.round(verification.level * 100)}% input level` +
        (verification.reading
          ? `, latest reading ${verification.reading.note}${verification.reading.octave} at ${verification.reading.frequency.toFixed(1)} Hz (${verification.reading.cents > 0 ? '+' : ''}${verification.reading.cents.toFixed(1)} cents)`
          : ', no stable note heard yet')
      : `tuner stream idle (${verification.trackState})`;
    const guidance = !verification.supported
      ? ' This browser cannot open a microphone, so live tuning is unavailable here; use the recorded-clip tuner reads instead.'
      : verification.permissionState === 'denied'
        ? ' Microphone permission is denied: allow it in the browser site settings, then open the live tuner input again.'
        : '';
    return `Microphone verification on this device: ${verification.supported ? 'capture supported' : 'capture NOT supported'}; ${inputText}; ${permissionText}; ${streamText}.${guidance}`;
  }

  private prepareDjCrossfade(): string {
    this.engine.setCrossfader(0.5);
    return 'Crossfader centred at the phrase-neutral position; prepare the next deck and ride either deck from the same hand position.';
  }

  private releaseHandoffStatus(): string {
    const handoff = this.produce.releaseHandoff();
    if (!handoff) return 'No AI Produce release handoff is available; run AI Produce before delivery planning.';
    const stageSummary = handoff.stages.map((stage) => `${stage.name}: ${stage.status}`).join(', ');
    return `${handoff.title} release handoff — ${stageSummary}. Pending: ${handoff.pending.join(', ') || 'none'}. Next step: ${handoff.nextStep}.`;
  }

  private deliveryChecklist(): string {
    const handoff = this.produce.releaseHandoff();
    if (!handoff) return 'Delivery checklist unavailable until AI Produce has a release handoff.';
    return `${handoff.title} delivery checklist — ${handoff.stages.map((stage) => `${stage.name}: ${stage.status}`).join(', ')}. Next step: ${handoff.nextStep}.`;
  }

  private async armRecorderTrack(): Promise<string> {
    const recordings = await this.audioRecorder.getOfflineRecordings();
    const selected = this.music.selectedTrack();
    if (!selected) throw new Error('Select a track before arming the next record pass.');
    const midiTakeCount = this.takeManager.getTakes(selected.id)().length;
    this.recordingStatus.armTrack(selected.id);
    const stillArmed = this.recordingStatus.isTrackArmed ? this.recordingStatus.isTrackArmed(selected.id) : true;
    return `${recordings.length} saved recorder take${recordings.length === 1 ? '' : 's'}; armed ${selected.name} for the next record pass (${midiTakeCount} MIDI take${midiTakeCount === 1 ? '' : 's'} on that track)${stillArmed ? '' : ' (arm failed)'}. Record one new deliberate pass without overwriting them; recording itself remains a surface gesture.`;
  }

  private chordBassRegisterCheck(): string {
    const tracks = this.music.tracks().filter((track) => (track.notes?.length ?? 0) > 0);
    if (tracks.length === 0) throw new Error('No notes are available for a voicing check.');
    const ranges = tracks.map((track) => {
      const midis = (track.notes ?? []).map((note) => note.midi);
      return { name: track.name, low: Math.min(...midis), high: Math.max(...midis) };
    });
    const bass = [...ranges].sort((a, b) => a.low - b.low)[0];
    const chord = ranges.find((range) => range.name !== bass.name) ?? ranges[0];
    return `Bass register ${bass.name} spans MIDI ${bass.low}–${bass.high}; chord register ${chord.name} spans MIDI ${chord.low}–${chord.high}; ${chord.low <= bass.high ? 'the chord enters the bass register, so raise an inversion or move the bass before committing' : 'chord roots stay clear of the bass register'}.`;
  }

  private selectStrongestPerformanceTake(): string {
    const midiCount = this.music.tracks().reduce(
      (sum, track) => sum + this.takeManager.getTakes(track.id)().length,
      0,
    );
    const takes = typeof this.performanceRecording.takes === 'function' ? this.performanceRecording.takes() : [];
    if (takes.length === 0) {
      return `No performance takes are available yet; ${midiCount} MIDI take${midiCount === 1 ? '' : 's'} currently available.`;
    }
    const score = (take: { notes?: unknown[]; peakDbL?: unknown; peakDbR?: unknown }): number => {
      const notes = Array.isArray(take.notes) ? take.notes.length : 0;
      const peakL = typeof take.peakDbL === 'number' && Number.isFinite(take.peakDbL) ? take.peakDbL : -60;
      const peakR = typeof take.peakDbR === 'number' && Number.isFinite(take.peakDbR) ? take.peakDbR : -60;
      // Notes dominate; peak breaks the tie without hiding a note-less take.
      return notes * 1000 + Math.max(peakL, peakR);
    };
    const strongest = takes.reduce((winner, take) => (score(take) > score(winner) ? take : winner));
    if (typeof this.performanceRecording.selectedTakeId === 'function') {
      this.performanceRecording.selectedTakeId.set(strongest.id);
    } else if (this.performanceRecording.selectedTakeId && typeof (this.performanceRecording.selectedTakeId as unknown as { set?: unknown }).set === 'function') {
      (this.performanceRecording.selectedTakeId as unknown as { set: (v: string) => void }).set(strongest.id);
    }
    const notes = Array.isArray((strongest as { notes?: unknown[] }).notes) ? (strongest as { notes?: unknown[] }).notes!.length : 0;
    return `Selected strongest performance take ${strongest.name ?? strongest.id} (${notes} notes) in the carousel; ${midiCount} MIDI take${midiCount === 1 ? '' : 's'} currently available.`;
  }

  private async recorderTakeStatus(): Promise<string> {
    const recordings = await this.audioRecorder.getOfflineRecordings();
    let detail = '';
    if (recordings.length > 0) {
      const items = recordings as Array<{ name?: string; timestamp?: number; settings?: { durationSec?: unknown; level?: unknown } }>;
      const newest = items.reduce((a, b) => ((b?.timestamp ?? 0) > (a?.timestamp ?? 0) ? b : a), items[0]);
      const dur = typeof newest?.settings?.durationSec === 'number' && Number.isFinite(newest.settings.durationSec) ? `${newest.settings.durationSec}s` : 'unknown duration';
      const level = typeof newest?.settings?.level === 'string' ? `, level ${newest.settings.level}` : '';
      detail = ` Newest: ${newest?.name ?? 'untitled'} (${dur}${level}).`;
    }
    return `${recordings.length} saved recording take${recordings.length === 1 ? '' : 's'} currently available.${detail}`;
  }

  private async runAiProduce(context: StudioDirectorContext): Promise<string> {
    const result = await this.produce.run({
      prompt: context.focusPrompt ?? 'A S.M.U.V.E. original built from the current session.',
      genre: context.genre ?? 'Pop',
      mood: context.mood ?? 'energetic',
      style: context.style ?? context.genre ?? 'pop',
      bpm: context.bpm ?? this.engine.tempo(),
      voicePreview: true,
    });
    if (!result) throw new Error(this.produce.error() ?? 'AI Produce did not complete.');
    const idea = result.idea?.title ?? 'the generated idea';
    return `AI Produce completed: ${idea}, beat ${result.beat?.title ?? 'ready'}, lyrics ${result.lyrics ? 'drafted' : 'skipped'}, mix report ${result.mixReport.length} lines${result.cancelled ? ' (cancelled at a stage boundary)' : ''}.`;
  }

  private smartSearchSounds(context: StudioDirectorContext): string {
    const results = this.sounds.smartSearch(this.soundQuery(context));
    if (results.length === 0) throw new Error('No sounds matched the smart search.');
    return `Smart search returned ${results.length} sounds; top match is ${results[0].name}.`;
  }

  private soundQuery(context: StudioDirectorContext): string {
    return [context.genre, context.mood, context.key ?? this.workspace.metadata()?.key, context.bpm ? `${context.bpm} bpm` : ''].filter(Boolean).join(' ') || 'dark';
  }

  private favoriteBestSound(context: StudioDirectorContext): string {
    const query = [context.genre, context.mood, context.key ?? this.workspace.metadata()?.key].filter(Boolean).join(' ') || 'dark';
    const results = this.sounds.smartSearch(query);
    const target = results[0] ?? this.sounds.sounds()[0];
    if (!target) throw new Error('No sound is available to favorite.');
    const wasFavorite = this.sounds.isFavorite(target.id);
    if (!wasFavorite) this.sounds.toggleFavorite(target.id);
    this.sounds.recordUsage(target.id);
    return `${wasFavorite ? 'Kept' : 'Favorited'} ${target.name} and recorded it as used.`;
  }

  private generateChordFramework(context: StudioDirectorContext): string {
    const style = context.style ?? context.genre ?? 'pop';
    const beat = this.beat.generateBeat(style, `${style} | Chords`, context.bpm);
    return `${beat.title}: ${beat.chords.map((c) => c.chord).join(' | ')} at ${beat.bpm} BPM in ${beat.key}.`;
  }

  private turnProgressionIntoParts(context: StudioDirectorContext): string {
    const style = context.style ?? context.genre ?? 'pop';
    const beat = this.beat.generateBeat(style, `${style} | Chord parts`, context.bpm);
    const chordStabs = beat.chords.length > 0 ? beat.chords : [{ chord: 'I', position: 0, duration: 4, velocity: 0.8, inversion: 'root' }];
    const keyRoot = context.key
      ? context.key.replace(/m$/i, '').trim() || 'C'
      : this.workspace.metadata()?.key
        ? this.scaleRootForAudit()
        : (beat.key || 'C').replace(/m$/i, '').trim() || 'C';
    const padTrack = this.ensureTrack('Director Chord Pad', 'grand-piano', 'midi');
    const bassTrack = this.ensureTrack('Director Chord Bass', 'grand-piano', 'midi');
    const topTrack = this.ensureTrack('Director Chord Top', 'grand-piano', 'midi');
    const majorScale = [0, 2, 4, 5, 7, 9, 11];
    const padNotes: TrackNote[] = [];
    const bassNotes: TrackNote[] = [];

    chordStabs.forEach((stab, index) => {
      const parsed = this.parseRomanChord(stab.chord, keyRoot);
      const start = Number.isFinite(stab.position) ? Math.max(0, Math.floor(stab.position)) : index * 4;
      const rootMidi = 60 + parsed.pitchClass;
      for (const interval of parsed.intervals) {
        padNotes.push({
          id: this.nextId('chord-pad'),
          midi: rootMidi + interval,
          step: start,
          length: 4,
          velocity: Math.max(0.05, Math.min(1, stab.velocity ?? 0.75)),
        });
      }
      bassNotes.push({
        id: this.nextId('chord-bass'),
        midi: 36 + parsed.pitchClass,
        step: start,
        length: 4,
        velocity: Math.max(0.05, Math.min(1, stab.velocity ?? 0.8)),
      });
    });

    const topNotes = beat.melody.flatMap((phrase) =>
      phrase.notes.map((n) => this.noteFromPitch(n.pitch, n.octave, n.position, n.duration, n.velocity)),
    );
    this.music.replaceTrackNotes(padTrack.id, padNotes, 'Director Chord Parts');
    this.music.replaceTrackNotes(bassTrack.id, bassNotes, 'Director Chord Parts');
    this.music.replaceTrackNotes(topTrack.id, topNotes, 'Director Chord Parts');
    return `${beat.title}: wrote ${padNotes.length} pad notes to ${padTrack.name}, ${bassNotes.length} bass notes to ${bassTrack.name}, and ${topNotes.length} top-line notes to ${topTrack.name}; each replacement is undoable.`;
  }

  private parseRomanChord(symbol: string, keyRoot: string): { pitchClass: number; intervals: number[] } {
    const match = symbol.match(/^([ivIV]+)(.*)$/);
    const numerals: Record<string, number> = {
      i: 1,
      ii: 2,
      iii: 3,
      iv: 4,
      v: 5,
      vi: 6,
      vii: 7,
    };
    const numeral = match?.[1]?.toLowerCase() ?? 'i';
    const degree = numerals[numeral] ?? 1;
    const suffix = match?.[2] ?? '';
    const majorScale = [0, 2, 4, 5, 7, 9, 11];
    const rootPc = PITCHES.indexOf(keyRoot);
    const pitchClass = ((rootPc >= 0 ? rootPc : 0) + majorScale[degree - 1]) % 12;
    const minor = match?.[1] ? /^[ivx]+$/.test(match[1]) && match[1] === match[1].toLowerCase() : false;
    if (/dim/i.test(suffix)) return { pitchClass, intervals: [0, 3, 6] };
    if (/aug/i.test(suffix)) return { pitchClass, intervals: [0, 4, 8] };
    if (/7/.test(suffix)) return { pitchClass, intervals: minor ? [0, 3, 7, 10] : [0, 4, 7, 10] };
    if (/sus/i.test(suffix)) return { pitchClass, intervals: [0, 5, 7] };
    return { pitchClass, intervals: minor ? [0, 3, 7] : [0, 4, 7] };
  }

  private async sliceSelectedSampleOnPhraseBoundaries(): Promise<string> {
    const imported = this.audioImport.selectedAudio() ?? this.audioImport.importedAudio()[0];
    const streamedBuffer = (imported?.sampleStreamer as unknown as { getResidentBuffer?: () => AudioBuffer | null } | null)?.getResidentBuffer?.() ?? null;
    const buffer = imported?.buffer ?? streamedBuffer;
    if (!imported || !buffer) {
      throw new Error('Import a sample in Sampler first; no decoded buffer is available to slice.');
    }
    const ctx = this.engine.ctx as unknown as { createBuffer?: (channels: number, length: number, sampleRate: number) => AudioBuffer };
    if (!ctx?.createBuffer) {
      throw new Error('The audio context cannot create sliced AudioBuffers in this environment.');
    }
    const onsets = detectTransientFrames(buffer, { sensitivity: 0.55, maxSlices: 16 });
    if (onsets.length === 0) {
      throw new Error(`${imported.name} has no transient onsets; use equal slicing or a more percussive sample.`);
    }
    const starts = [0, ...onsets.map((onset) => onset.frame)];
    const slices = sliceAudioBufferAtFrames(ctx as BaseAudioContext, buffer, starts);
    if (slices.length <= 1) {
      throw new Error(`${imported.name} is too short or too steady to produce useful phrase-boundary slices.`);
    }
    const track = this.ensureTrack('Director Sample Slices', 'grand-piano', 'audio');
    if ((track.clips?.length ?? 0) > 0) {
      const alreadyLoaded = this.samplerState.getLoadedPitches().length >= slices.length;
      if (alreadyLoaded) {
        return `Kept the existing ${track.clips.length} phrase-boundary slices on ${track.name} and their shared Sampler pads; run a different sample to reslice.`;
      }
      const migratedPitches = await this.samplerState.loadSlices(slices, 60);
      return `Loaded ${migratedPitches.length} existing slices into the shared Sampler pads at MIDI ${migratedPitches.join(', ')} and kept the ${track.clips.length} arrangement clips on ${track.name}.`;
    }
    const loadedPitches = await this.samplerState.loadSlices(slices, 60);
    if (loadedPitches.length === 0) {
      throw new Error('The shared Sampler pads are full; clear a pad pitch range before loading more slices.');
    }
    const beatSeconds = 60 / Math.max(20, this.engine.tempo() || 120) / 4;
    let startStep = 0;
    slices.forEach((slice, index) => {
      const clipId = this.nextId('director-slice').replace(/[^\w-]/g, '-');
      this.music.stemAudioCache.set(clipId, slice);
      const lengthSteps = Math.max(1, Math.round(slice.duration / beatSeconds));
      this.music.addClipToTrack(track.id, {
        id: clipId,
        name: `${imported.name} slice ${index + 1}`,
        start: startStep,
        length: lengthSteps,
        type: 'audio',
        audioRefId: clipId,
        clipGain: 1,
      });
      startStep += lengthSteps;
    });
    return `Sliced ${imported.name} into ${slices.length} phrase-boundary slices, loaded them into the shared Sampler pads at MIDI ${loadedPitches.join(', ')}, and placed them as audio clips on ${track.name}; ${onsets.length} transient onsets were measured at ${onsets.map((o) => `${o.time.toFixed(2)}s`).join(', ')}.`;
  }

  private ensureTrack(name: string, instrumentId: string, type: TrackModel['type']): TrackModel {
    const existing = this.music.tracks().find((t) => t.type === type && t.name === name);
    if (existing) return existing;
    const id = this.music.addTrack(name, instrumentId, type);
    const track = this.music.tracks().find((t) => t.id === id);
    if (!track) throw new Error(`Could not create ${name}.`);
    return track;
  }

  private addNotesToTrack(trackId: string, notes: TrackNote[]): void {
    notes.forEach((note) => this.music.addNoteToTrack(trackId, note));
  }

  private drumNotesFromPattern(pattern: {
    kick: Array<{ position: number; velocity: number; probability: number }>;
    snare: Array<{ position: number; velocity: number; probability: number }>;
    hihat: Array<{ position: number; velocity: number; probability: number }>;
    clap: Array<{ position: number; velocity: number; probability: number }>;
    percussion: Array<{ position: number; velocity: number; probability: number }>;
  }): TrackNote[] {
    const voices: Array<[number, Array<{ position: number; velocity: number; probability: number }>]> = [
      [36, pattern.kick],
      [38, pattern.snare],
      [42, pattern.hihat],
      [39, pattern.clap],
      [46, pattern.percussion],
    ];
    return voices.flatMap(([midi, hits]) =>
      hits.map((hit) => ({
        id: this.nextId('drum'),
        midi,
        step: hit.position,
        length: 1,
        velocity: Math.max(0.05, Math.min(1, hit.velocity)),
        probability: hit.probability,
      })),
    );
  }

  private noteFromPitch(pitch: string, octave: number, position: number, duration: number, velocity: number): TrackNote {
    const index = PITCHES.indexOf(pitch);
    const midi = 12 * (octave + 1) + (index >= 0 ? index : 0);
    return {
      id: this.nextId('note'),
      midi,
      step: position,
      length: Math.max(1, duration),
      velocity: Math.max(0.05, Math.min(1, velocity)),
    };
  }

  private selectedMelody(): Array<{ midi: number; step: number; length: number }> {
    const track = this.music.selectedTrack();
    return (track?.notes ?? []).map((n) => ({ midi: n.midi, step: n.step, length: n.length ?? 1 }));
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.sequence}`;
  }

  private track(name: Parameters<StudioTelemetryService['trackEvent']>[0], success: boolean, data: Record<string, unknown>): void {
    try {
      this.telemetry.trackEvent(name, data, success);
    } catch {
      // Telemetry must never break the director path.
    }
  }
}
