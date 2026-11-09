import { Injectable, inject } from '@angular/core';
import { AiService } from '../services/ai.service';
import { isOfflineAiText } from '../../ai-manager.contract';
import {
  MusicManagerService,
  type TrackModel,
  type TrackNote,
} from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiBeatGeneratorService } from '../services/ai-beat-generator.service';
import { AiProduceService } from '../services/ai-produce.service';
import { ScaleDetectionService } from '../services/scale-detection.service';
import { VocalAiService } from '../services/vocal-ai.service';
import { LoggingService } from '../services/logging.service';
import { NeuralMixerService } from '../services/neural-mixer.service';
import { TakeManagerService } from '../services/take-manager.service';
import { AudioRecorderService } from './audio-recorder.service';
import { AiMixAssistantService } from './effects/ai-mix-assistant.service';
import { AiCopilotService } from './ai-copilot.service';
import { OfflineBounceService } from './offline-bounce.service';
import { ProjectWorkspaceService } from './project-workspace.service';
import { SmartSoundService } from './smart-sound.service';
import { SmartProductionFoundationsService } from './smart-production-foundations.service';
import { StudioTelemetryService } from './studio-telemetry.service';
import {
  STUDIO_SURFACES,
  isStudioSurfaceId,
  type StudioSurfaceId,
} from './studio-surfaces';

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
  private engine = inject(AudioEngineService);
  private beat = inject(AiBeatGeneratorService);
  private produce = inject(AiProduceService);
  private mix = inject(AiMixAssistantService);
  private copilot = inject(AiCopilotService);
  private offlineBounce = inject(OfflineBounceService);
  private scale = inject(ScaleDetectionService);
  private vocal = inject(VocalAiService);
  private sounds = inject(SmartSoundService);
  private neural = inject(NeuralMixerService);
  private takeManager = inject(TakeManagerService);
  private audioRecorder = inject(AudioRecorderService);
  private workspace = inject(ProjectWorkspaceService);
  private foundations = inject(SmartProductionFoundationsService);
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
          make(1, 'Choose the fastest environment that fits the session', 'Open the Quick Session environments and pick Warm-Up, Sketch, Loop, Guide, Track, Take or Performance based on whether the artist is warming up, sketching, learning, writing, arranging or performing.', false, () => 'Guided: choose the environment in Quick Session, then confirm the selected BPM and key in the footer.', 'quick-session'),
          make(2, 'Verify tempo and key before committing', 'Read the transport tempo, project key/scale and metronome state from the live services before any further Quick Session work.', true, () => this.quickSessionReadiness()),
          make(3, 'Brief the next one-tap move', 'Read the current track, note and clip state, then recommend the next Quick Session move that fits it.', true, () => this.quickSessionNextMove()),
        ];
      case 'arrangement':
        return [
          make(1, 'Focus the selected arrangement lane', 'Select the first track with notes so the director works on a real lane rather than an empty one.', true, () => this.selectFirstTrack()),
          make(2, 'Detect the musical key and scale', 'Run Krumhansl-Kessler key detection over the session notes and apply the result to the project key/scale.', true, () => this.detectAndApplyKey()),
          make(3, 'Apply the section energy map', 'Use the detected key and session density to place intro, verse, chorus and bridge transitions. The default AI Copilot structure is applied only when the current markers are still the stock defaults; custom sections are left alone.', true, () => this.applySongStructure()),
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
          make(3, 'Use EVOLVE for the next variation', 'After the pattern is audible, use the drum header EVOLVE control for one variation rather than overwriting the whole kit.', false, () => 'Guided: press EVOLVE once, audition a full loop, then keep or undo.', 'drum-machine'),
        ];
      case 'channel-rack':
        return [
          make(1, 'Seed the rack with a complete groove', 'Generate the full beat package and map its layers to rack tracks.', true, () => this.applyBeatPackage(context)),
          make(2, 'Check channel headroom', 'Run the AI mix pass so channel gains are compared against the current scene before adding more sounds.', true, () => this.analyzeAndApplyMix()),
          make(3, 'Assign steps and samples intentionally', 'Only assign a sample to a channel when the generated layer needs that sound; avoid duplicate channels.', false, () => 'Guided: assign one sample/preset per channel role, then audition the full rack before duplicating it.', 'channel-rack'),
        ];
      case 'mixer':
        return [
          make(1, 'Refresh the evidence-backed mix pass', 'Recompute every track-level suggestion from the current session instead of trusting an old snapshot.', true, () => this.analyzeAndApplyMix()),
          make(2, 'Audit mute and solo state', 'Read the live mute/solo state for every track and the selected track before balancing gains.', true, () => this.auditMixerMuteSolo()),
          make(3, 'Use the neural balance only as a rough nudge', 'The neural balance is a randomized gain nudge plus safety compression, not a measurement-based mix.', true, () => this.applyNeuralNudge()),
        ];
      case 'effects-rack':
        return [
          make(1, 'Run the rack analysis', 'Recompute AI mix suggestions against the selected track and current FX chain.', true, () => this.analyzeAndApplyMix()),
          make(2, 'Apply the highest-value suggestion', 'Apply the top recommendation instead of stacking unrelated effects.', true, () => this.applyTopMixSuggestion()),
          make(3, 'A/B the rack in context', 'Bypass the selected track’s insert chain with one undoable Studio command, confirm the difference, then restore it if the processing hurt the mix.', true, () => this.toggleInsertBypass()),
        ];
      case 'vocal-suite':
        return [
          make(1, 'Run the vocal performance check', 'Pass an uploaded take through measured analysis: duration, peak, RMS, crest, silence and clipping.', false, () => 'Guided: upload the vocal take in the Vocal Suite and let Vocal AI analyze its measured evidence.', 'vocal-suite'),
          make(2, 'Generate a harmony stack from the take', 'Use the take’s notes to create a harmony part; if no part is detected, the fallback is a simple third above the root.', true, () => this.generateHarmonyFromSelectedTake()),
          make(3, 'Apply vocal polish only after the repair plan is clear', 'Use Director Chat / Vocal Suite polish controls on the repaired take; do not use polish to hide tuning, clipping or timing problems.', false, () => 'Guided: use the Vocal Suite polish controls on the repaired take after the current advice has been applied.', 'vocal-suite'),
        ];
      case 'dj':
        return [
          make(1, 'Make both decks audition-ready', 'Set both deck gains and the crossfader to neutral so the artist can hear either deck cleanly.', true, () => this.prepareDjDecks()),
          make(2, 'Arm key-lock and deck B loop', 'Set deck B to unity rate with pitch preservation and enable its loop so the next phrase can be cued cleanly.', true, () => this.prepareDjLoop()),
          make(3, 'Centre the crossfader in phrase', 'Set the DJ crossfader back to the phrase-neutral centre so the next move can ride either deck cleanly.', true, () => this.prepareDjCrossfade()),
        ];
      case 'performance':
        return [
          make(1, 'Count the performance takes', 'Read the current take carousel so the next instruction starts from the real take count.', true, () => this.performanceTakeStatus()),
          make(2, 'Run one clean pass before tuning it', 'Avoid overwriting a good pass; use the take carousel to compare candidates.', false, () => 'Guided: arm the take, perform the full pass once, then compare it against the previous take.', 'performance'),
          make(3, 'Promote the strongest MIDI take', 'Rank the takes by captured note count and make the strongest take the active take for playback/comping.', true, () => this.promoteBestTake()),
        ];
      case 'mastering':
        return [
          make(1, 'Run the genre-aware master', 'Let the AI Mix Assistant choose targets from the session composition and apply compressor, limiter and tone EQ.', true, () => this.autoMaster()),
          make(2, 'Render the offline review bounce', 'Render the full arrangement offline and read its measured peak/RMS; if the peak clips, lower the target rather than raising the limiter.', true, () => this.bounceProjectReview()),
          make(3, 'Render a comparison master', 'Render the offline comparison bounce and read its measured peak/RMS against the streaming target.', true, () => this.bounceProjectReview()),
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
          make(2, 'Match the patch to the generated key', 'Confirm the synth patch sits in the project key and does not fight the bass register.', false, () => 'Guided: set the patch register around the generated melody, then compare it with the bass loop.', 'synthesizer'),
          make(3, 'Track a useful patch recipe', 'Favorite the patch once its role is proven in the full session.', true, () => this.favoriteBestSound(context)),
        ];
      case 'tuner':
        return [
          make(1, 'Open the tuning field', 'The tuner needs a microphone or a played reference; use live input rather than guessing from the session BPM.', false, () => 'Guided: enable the microphone or play the reference note and watch the nearest cents needle.', 'tuner'),
          make(2, 'Apply the same reference across takes', 'Retune strings/instruments to one reference so takes can be comped without pitch drift.', false, () => 'Guided: tune the lowest string first, then check each string against the same reference.', 'piano-roll'),
          make(3, 'Recheck key after tuning', 'After tuning, run key detection again if the material was out of tune.', true, () => this.detectAndApplyKey()),
        ];
      case 'chord-editor':
        return [
          make(1, 'Generate a chord framework', 'Create a genre-aware progression from the session key and mood; Roman numerals are interpreted as guidance, not literal notes.', true, () => this.generateChordFramework(context)),
          make(2, 'Voicing check against the bass', 'Measure the bass and chord registers from the live project notes and flag any root collision.', true, () => this.chordBassRegisterCheck()),
          make(3, 'Turn the progression into parts', 'Use the framework to write a pad, bass and top line as separate lanes.', false, () => 'Guided: turn the progression into separate pad, bass and melody lanes, then return to Piano Roll.', 'piano-roll'),
        ];
      case 'sampler':
        return [
          make(1, 'Find a sample that fits the key and tempo', 'Search the sound library by the session key/BPM and favorite only the sample that loops cleanly.', true, () => this.smartSearchSounds(context)),
          make(2, 'Slice on phrase boundaries', 'Place slices on downbeats and phrase endings; avoid random micro-slices that fight the groove.', false, () => 'Guided: slice on the phrase boundaries, audition the loop, then keep only slices that return to the downbeat cleanly.', 'sampler'),
          make(3, 'Chop against the generated groove', 'Use the generated drum pattern as the timing reference for the chop.', true, () => this.applyBeatPackage(context)),
        ];
      case 'score':
        return [
          make(1, 'Seed the score with a playable motif', 'Add a generated four-bar motif to the selected track so the score has a real subject.', true, () => this.seedMelodicTrack()),
          make(2, 'Audit the score’s range and scale fit', 'Measure the selected track’s pitch range and count notes that fall outside the detected project scale; add harmony only after this audit.', true, () => this.auditScoreRange()),
          make(3, 'Humanize the printed part', 'Add micro-timing and velocity variation so the notation does not sound mechanical.', true, () => this.humanizeSelectedTrack()),
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
          make(1, 'Count the saved takes', 'Read the recorder’s saved takes so the artist knows what already exists before recording another pass.', true, () => this.recorderTakeStatus()),
          make(2, 'Record one deliberate pass', 'Read the recorder take count and the selected track take count, then recommend a deliberate pass that does not overwrite them.', true, () => this.recorderPassStatus()),
          make(3, 'Move the best take into the session', 'Promote the strongest captured MIDI take through TakeManagerService so playback and comping use it.', true, () => this.promoteBestTake()),
        ];
      case 'performer':
        return [
          make(1, 'Read the performer’s take state', 'Open the take state and meters so the next instruction starts from the real performance, not the plan.', true, () => this.performanceTakeStatus()),
          make(2, 'Perform one pass per take slot', 'Use one take slot per complete pass; label the strongest candidate before the next attempt.', false, () => 'Guided: record one full pass per take slot and label the strongest candidate before the next attempt.', 'performer'),
          make(3, 'Merge the take comp into the track', 'Stack every take on the track, merge them through TakeManagerService, and write the comp back through MusicManagerService.replaceTrackNotes().', true, () => this.applyTakeComp()),
        ];
      case 'export':
        return [
          make(1, 'Run the final mastering pass', 'Master against the intended delivery surface before exporting.', true, () => this.autoMaster()),
          make(2, 'Export the review bounce', 'Render the offline WAV review bounce and read its measured peak/RMS before delivery.', true, () => this.bounceProjectReview()),
          make(3, 'Prepare the delivery checklist', 'Read the AI Produce release handoff and surface format, loudness target, artwork, metadata and next delivery step.', true, () => this.deliveryChecklist()),
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
    const tempo = this.engine.tempo();
    const key = this.workspace.metadata()?.key ?? 'C';
    const metronome = this.engine.metronomeEnabled();
    return `Quick Session checkpoint: ${tempo} BPM · ${key} ${this.lastDetectedScale} · metronome ${metronome ? 'on' : 'off'} · transport ${this.engine.isPlaying() ? 'playing' : 'stopped'}. Confirm these before recording or arranging.`;
  }

  private quickSessionNextMove(): string {
    const tracks = this.music.tracks();
    const notes = tracks.reduce((sum, track) => sum + (track.notes?.length ?? 0), 0);
    const clips = tracks.reduce((sum, track) => sum + (track.clips?.length ?? 0), 0);
    if (tracks.length === 0) return 'Recommended next move: build a one-tap groove in Quick Session before moving to Arrangement.';
    if (notes === 0 && clips === 0) return 'Recommended next move: add a groove or channel in Quick Session before arranging.';
    if (notes > 0 && clips === 0) return 'Recommended next move: refine the loop, then move to Arrangement for structure.';
    return `Recommended next move: ${tracks.length} tracks, ${notes} notes and ${clips} clips are already in the session, so move to Arrangement and shape the sections.`;
  }

  private auditMixerMuteSolo(): string {
    const tracks = this.music.tracks();
    const muted = tracks.filter((track) => track.muted).length;
    const soloed = tracks.filter((track) => track.soloed).length;
    const selected = this.music.selectedTrack();
    return `Mute/solo audit: ${muted} of ${tracks.length} tracks muted; ${soloed} soloed; selected ${selected?.name ?? 'none'} is ${selected?.muted ? 'muted' : 'unmuted'}, ${selected?.soloed ? 'soloed' : 'not soloed'}.`;
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

  private async recorderPassStatus(): Promise<string> {
    const recordings = await this.audioRecorder.getOfflineRecordings();
    const selected = this.music.selectedTrack();
    const midiTakeCount = selected ? this.takeManager.getTakes(selected.id)().length : 0;
    return `${recordings.length} saved recorder take${recordings.length === 1 ? '' : 's'}; ${selected?.name ?? 'no track selected'} currently has ${midiTakeCount} MIDI take${midiTakeCount === 1 ? '' : 's'}. Record one new deliberate pass without overwriting them.`;
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

  private performanceTakeStatus(): string {
    const count = this.music.tracks().reduce(
      (sum, track) => sum + this.takeManager.getTakes(track.id)().length,
      0,
    );
    return `${count} MIDI take${count === 1 ? '' : 's'} currently available.`;
  }

  private async recorderTakeStatus(): Promise<string> {
    const recordings = await this.audioRecorder.getOfflineRecordings();
    return `${recordings.length} saved recording take${recordings.length === 1 ? '' : 's'} currently available.`;
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

  private ensureTrack(name: string, instrumentId: string, type: 'midi' | 'drum'): TrackModel {
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
