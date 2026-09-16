import { Injectable, computed, inject, signal } from '@angular/core';
import { LoggingService } from './logging.service';
import { AiService } from './ai.service';
import {
  MIN_ACTIVE_CLIP_DURATION,
  MarkerKind,
  ProductionMode,
} from './video-engine.service';

/** Shot sizes the director knows how to stage. */
export const SHOT_SIZES = [
  'establishing',
  'wide',
  'medium',
  'close',
  'insert',
  'b-roll',
  'performance',
  'lip-sync',
  'transition',
] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

/** One planned shot in a S.M.U.V.E shot list. */
export interface ShotPlanShot {
  index: number;
  title: string;
  description: string;
  size: ShotSize;
  /** Length expressed in bars — the unit a music-video cut is built in. */
  bars: number;
  /** Resolved timeline placement, derived from the section map. */
  startTime: number;
  durationSeconds: number;
  /** Section or act this shot belongs to. */
  section: string;
}

export interface ShotPlan {
  title: string;
  logline: string;
  editorial: string[];
  shots: ShotPlanShot[];
  /** Where the plan actually came from — never claim S.M.U.V.E authored a local plan. */
  origin: 'smuve' | 'local';
}

export interface ShotPlanRequest {
  brief: string;
  mode: ProductionMode;
  bpm: number;
  durationSeconds: number;
  /** Clips already on the timeline, so the plan can react to existing footage. */
  existingClipCount?: number;
  /** Compact editorial context, deliberately excluding media bytes and URLs. */
  existingTimeline?: Array<{
    name: string;
    startTime: number;
    duration: number;
    type: string;
    source?: string;
  }>;
  existingMarkers?: Array<{ label: string; time: number; kind: MarkerKind }>;
}

export interface StructureMarker {
  label: string;
  time: number;
  kind: MarkerKind;
}

/** A deterministic cut list derived from the session tempo. */
export interface BeatCutEntry {
  id: string;
  startTime: number;
}

export type CinemaCommandId =
  | 'play'
  | 'pause'
  | 'take'
  | 'split'
  | 'marker'
  | 'next-marker'
  | 'previous-marker'
  | 'auto-cut'
  | 'export'
  | 'snap-on'
  | 'snap-off'
  | 'camera'
  | 'screen'
  | 'go-live'
  | 'end-stream'
  | 'lower-third'
  | 'cue';

export interface CinemaCommand {
  id: CinemaCommandId;
  /** Raw transcript that produced the command, for the feedback line. */
  transcript: string;
}

interface SectionTemplate {
  label: string;
  weight: number;
}

/**
 * Section skeletons per production mode. Bars are scaled to the real runtime,
 * so a 3-minute vertical clip and a 2-hour feature both get a sane structure.
 */
const SECTION_TEMPLATES: Record<ProductionMode, SectionTemplate[]> = {
  music: [
    { label: 'Intro', weight: 1 },
    { label: 'Verse 1', weight: 2 },
    { label: 'Pre-Chorus', weight: 1 },
    { label: 'Chorus 1', weight: 2 },
    { label: 'Verse 2', weight: 2 },
    { label: 'Chorus 2', weight: 2 },
    { label: 'Bridge', weight: 1 },
    { label: 'Final Chorus', weight: 2 },
    { label: 'Outro', weight: 1 },
  ],
  movie: [
    { label: 'Act I — Setup', weight: 1 },
    { label: 'Act II — Confrontation', weight: 2 },
    { label: 'Act III — Resolution', weight: 1 },
  ],
  stream: [
    { label: 'Cold Open', weight: 1 },
    { label: 'Live Core', weight: 3 },
    { label: 'Headliner Segment', weight: 2 },
    { label: 'Q&A', weight: 1 },
    { label: 'Replay Cutdown', weight: 1 },
  ],
  vlog: [
    { label: 'Hook', weight: 1 },
    { label: 'Body', weight: 2 },
    { label: 'Payoff', weight: 1 },
    { label: 'Outro', weight: 1 },
  ],
};

const MARKER_KIND_BY_MODE: Record<ProductionMode, MarkerKind> = {
  music: 'section',
  movie: 'act',
  stream: 'section',
  vlog: 'section',
};

/** Shot-size rotation used by the offline planner so plans read like real coverage. */
const SIZE_ROTATIONS: Record<ProductionMode, ShotSize[]> = {
  music: ['performance', 'lip-sync', 'close', 'insert', 'wide', 'b-roll'],
  movie: ['establishing', 'wide', 'medium', 'close', 'insert', 'b-roll'],
  stream: ['wide', 'medium', 'insert', 'transition', 'close'],
  vlog: ['wide', 'close', 'b-roll', 'medium', 'insert'],
};

const PLAN_SCHEMA_HINT =
  'Respond with ONLY minified JSON, no markdown: ' +
  '{"title":string,"logline":string,"editorial":string[3],"shots":' +
  '[{"title":string,"description":string,"size":"establishing|wide|medium|close|insert|b-roll|performance|lip-sync|transition","bars":number}]}';

const MAX_PLAN_SHOTS = 60;

@Injectable({ providedIn: 'root' })
export class CinemaDirectorService {
  private logger = inject(LoggingService);
  private aiService = inject(AiService);

  /** Director's brief — the one prompt that drives the whole production. */
  brief = signal('');
  isPlanning = signal(false);
  plan = signal<ShotPlan | null>(null);
  plannerNote = signal(
    'S.M.U.V.E stands ready. Describe the piece and it will cut a shot list.'
  );

  readonly shotCount = computed(() => this.plan()?.shots.length ?? 0);
  readonly plannedRuntime = computed(() => {
    const shots = this.plan()?.shots ?? [];
    return shots.reduce((total, shot) => total + shot.durationSeconds, 0);
  });

  /**
   * Ask S.M.U.V.E for a shot list. The AI proxy speaks free text, so the
   * response is parsed for a JSON plan; when the link is down or the model
   * ignores the schema, a deterministic local plan is built from the tempo and
   * the mode's structure instead — the console always produces something
   * shootable rather than an error state.
   */
  async generateShotPlan(request: ShotPlanRequest): Promise<ShotPlan> {
    this.isPlanning.set(true);
    const brief = request.brief.trim();
    try {
      const prompt = this.buildPrompt({ ...request, brief });
      let response = '';
      try {
        response = await this.aiService.getAIResponse(prompt);
      } catch (error) {
        this.logger.warn('Cinema director: AI link unavailable', error);
      }

      const parsed = this.parsePlanResponse(response, request);
      if (parsed) {
        this.plan.set(parsed);
        this.plannerNote.set(
          `S.M.U.V.E staged ${parsed.shots.length} shots — "${parsed.logline}"`
        );
        return parsed;
      }

      const local = this.buildLocalPlan(brief, request);
      this.plan.set(local);
      this.plannerNote.set(
        'S.M.U.V.E strategic link is offline — a tempo-locked structural plan was cut locally.'
      );
      return local;
    } finally {
      this.isPlanning.set(false);
    }
  }

  clearPlan(): void {
    this.plan.set(null);
    this.plannerNote.set(
      'Shot list cleared. Describe the piece and S.M.U.V.E will cut a new one.'
    );
  }

  /** The prompt handed to the AI proxy. Kept public so it can be asserted. */
  buildPrompt(request: ShotPlanRequest): string {
    const barSeconds = 240 / Math.max(1, request.bpm);
    const totalBars = Math.max(1, Math.round(request.durationSeconds / barSeconds));
    return [
      `You are S.M.U.V.E 2.0, an uncompromising film and music-video director.`,
      `Deliver a shootable shot list for a ${request.mode} production.`,
      `Brief: ${request.brief || 'a bold, high-contrast piece built around the artist.'}`,
      `Session tempo: ${request.bpm.toFixed(2)} BPM (1 bar = ${barSeconds.toFixed(2)}s).`,
      `Target runtime: ${Math.round(request.durationSeconds)}s (~${totalBars} bars).`,
      `Existing footage on the timeline: ${request.existingClipCount ?? 0} clips.`,
      request.existingTimeline?.length
        ? `Existing coverage: ${request.existingTimeline
            .slice(0, 24)
            .map(
              (clip) =>
                `${clip.name} [${Math.round(clip.startTime)}-${Math.round(
                  clip.startTime + clip.duration
                )}s${clip.source ? `, ${clip.source}` : ''}]`
            )
            .join('; ')}.`
        : 'Existing coverage: none.',
      request.existingMarkers?.length
        ? `Existing structure markers: ${request.existingMarkers
            .slice(0, 24)
            .map((marker) => `${marker.label}@${Math.round(marker.time)}s`)
            .join(', ')}.`
        : 'Existing structure markers: none.',
      `Cover every section of the piece, keep each shot between 1 and 8 bars, ` +
        `and order the shots as they should be cut.`,
      PLAN_SCHEMA_HINT,
    ].join('\n');
  }

  /**
   * Parse a model response into a validated plan. Tolerates markdown fences,
   * prose wrappers, a bare shots array, and a single malformed shot (dropped
   * rather than failing the whole plan).
   */
  parsePlanResponse(
    response: string,
    request: ShotPlanRequest
  ): ShotPlan | null {
    const payload = this.extractJson(response);
    if (!payload) return null;

    const rawShots = Array.isArray(payload.shots)
      ? payload.shots
      : Array.isArray(payload)
        ? payload
        : null;
    if (!rawShots || rawShots.length === 0) return null;

    const shots = rawShots
      .slice(0, MAX_PLAN_SHOTS)
      .map((raw) => this.normaliseShot(raw))
      .filter((shot): shot is Omit<ShotPlanShot, 'index' | 'startTime' | 'durationSeconds' | 'section'> => !!shot);
    if (shots.length === 0) return null;

    const title =
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : 'Untitled Cut';
    const logline =
      typeof payload.logline === 'string' && payload.logline.trim()
        ? payload.logline.trim()
        : 'Shot list delivered straight from the S.M.U.V.E edit bay.';
    const editorial = Array.isArray(payload.editorial)
      ? payload.editorial
          .filter((line): line is string => typeof line === 'string' && !!line.trim())
          .slice(0, 6)
      : [];

    return {
      title,
      logline,
      editorial,
      origin: 'smuve',
      shots: this.placeShots(shots, request),
    };
  }

  /**
   * Lay shots out back-to-back on the beat grid, mapped onto the section
   * structure so each shot belongs to a named part of the piece.
   */
  private placeShots(
    shots: { title: string; description: string; size: ShotSize; bars: number }[],
    request: ShotPlanRequest
  ): ShotPlanShot[] {
    const barSeconds = this.barSeconds(request.bpm);
    const sections = this.sectionMap(
      request.mode,
      request.durationSeconds,
      request.bpm
    );
    let cursor = 0;

    return shots.reduce<ShotPlanShot[]>((placedShots, shot) => {
      const cursor = placedShots.length
        ? placedShots[placedShots.length - 1].startTime +
          placedShots[placedShots.length - 1].durationSeconds
        : 0;
      if (cursor >= request.durationSeconds) return placedShots;
      const remaining = Math.max(MIN_ACTIVE_CLIP_DURATION, request.durationSeconds - cursor);
      const durationSeconds = Math.min(
        remaining,
        Math.max(MIN_ACTIVE_CLIP_DURATION, shot.bars * barSeconds)
      );
      const section =
        [...sections].reverse().find((marker) => marker.time <= cursor + 1e-6)
          ?.label ?? sections[0]?.label ?? 'Feature';
      placedShots.push({
        index: placedShots.length + 1,
        title: shot.title,
        description: shot.description,
        size: shot.size,
        bars: Math.max(1, Math.round(durationSeconds / barSeconds)),
        startTime: cursor,
        durationSeconds,
        section,
      });
      return placedShots;
    }, []);
  }

  /**
   * A local, tempo-locked plan built from the mode's structure. This is what a
   * director would sketch in five minutes: one to three shots per section, sized
   * by the rotation for the mode.
   */
  buildLocalPlan(brief: string, request: ShotPlanRequest): ShotPlan {
    const sections = this.sectionMap(
      request.mode,
      request.durationSeconds,
      request.bpm
    );
    const rotation = SIZE_ROTATIONS[request.mode];
    const barSeconds = this.barSeconds(request.bpm);
    const shots: ShotPlanShot[] = [];
    let cursor = 0;
    let rotationIndex = 0;

    sections.forEach((section, sectionIndex) => {
      if (cursor >= request.durationSeconds) return;
      const nextSection = sections[sectionIndex + 1];
      const sectionEnd = Math.min(
        request.durationSeconds,
        nextSection?.time ?? request.durationSeconds
      );
      const sectionBars = Math.max(
        1,
        Math.round((sectionEnd - section.time) / barSeconds)
      );
      // Longer sections get more coverage; the last shot of each section is
      // half a section long at minimum so nothing is a single-frame stub.
      const shotCount = Math.max(1, Math.min(4, Math.round(sectionBars / 4)));
      const barsPerShot = Math.max(1, Math.floor(sectionBars / shotCount));

      for (let i = 0; i < shotCount; i += 1) {
        const size = rotation[rotationIndex % rotation.length];
        rotationIndex += 1;
        const isLast = i === shotCount - 1;
        const bars = Math.max(
          1,
          isLast ? sectionBars - barsPerShot * (shotCount - 1) : barsPerShot
        );
        const durationSeconds = Math.max(
          MIN_ACTIVE_CLIP_DURATION,
          bars * barSeconds
        );
        shots.push({
          index: shots.length + 1,
          title: `${section.label} · ${this.formatShotSize(size)}`,
          description: this.describeShot(size, section.label, brief),
          size,
          bars,
          startTime: cursor,
          durationSeconds,
          section: section.label,
        });
        cursor += durationSeconds;
      }
    });

    return {
      title: brief.trim() || `${this.modeLabel(request.mode)} — Shot Plan`,
      logline:
        'Tempo-locked structural plan: coverage per section, cut on the bar.',
      editorial: [
        `Cut to ${request.bpm.toFixed(2)} BPM — every scene change lands on a bar line.`,
        'Cover each section with at least one wide and one tight shot.',
        'Drop the strongest frame in the first two bars to hook the scroll.',
      ],
      shots,
      origin: 'local',
    };
  }

  /**
   * Section/act markers for a piece. Bars are scaled proportionally to the real
   * runtime so a 2-hour feature and a 90-second vertical cut both get a
   * structure that fits exactly inside the timeline.
   */
  sectionMap(
    mode: ProductionMode,
    durationSeconds: number,
    bpm: number
  ): StructureMarker[] {
    const template = SECTION_TEMPLATES[mode] ?? SECTION_TEMPLATES.movie;
    const barSeconds = this.barSeconds(bpm);
    const totalBars = Math.max(
      template.length,
      Math.round(Math.max(0, durationSeconds) / barSeconds)
    );
    const totalWeight = template.reduce((sum, section) => sum + section.weight, 0);
    const kind = MARKER_KIND_BY_MODE[mode] ?? 'section';

    let elapsed = 0;
    const markers: StructureMarker[] = [];
    template.forEach((section) => {
      if (elapsed > durationSeconds) return;
      markers.push({ label: section.label, time: elapsed, kind });
      const bars = Math.max(
        1,
        Math.round((section.weight / totalWeight) * totalBars)
      );
      elapsed += bars * barSeconds;
    });

    return markers;
  }

  /**
   * Auto-cut: place clips on consecutive bar boundaries. Short clips take
   * shorter slots, so a montage of quick cuts stays on the grid instead of
   * drifting into dead air.
   */
  beatCutPlan(
    clips: { id: string; duration: number }[],
    options: { bpm: number; startTime?: number; barsPerShot?: number }
  ): BeatCutEntry[] {
    if (clips.length === 0) return [];
    const barSeconds = this.barSeconds(options.bpm);
    const minBars = Math.max(1, Math.round(options.barsPerShot ?? 2));
    // Open on a bar line, then keep every clip an exact whole number of bars so
    // the cut never drifts off the grid as the montage grows.
    let cursor = this.snapToBar(Math.max(0, options.startTime ?? 0), barSeconds);

    return clips.map((clip) => {
      const entry: BeatCutEntry = { id: clip.id, startTime: cursor };
      const bars = Math.max(
        minBars,
        Math.ceil(clip.duration / barSeconds - 1e-9)
      );
      cursor += bars * barSeconds;
      return entry;
    });
  }

  private snapToBar(time: number, barSeconds: number): number {
    if (!Number.isFinite(barSeconds) || barSeconds <= 0) return Math.max(0, time);
    return Math.max(0, Math.round(time / barSeconds) * barSeconds);
  }

  /**
   * Map a spoken transcript onto a cinema command. Short, aggressive voice
   * direction ("roll", "cut", "go live") is what a director actually barks at a
   * camera operator, so those are the phrases matched here.
   */
  parseVoiceCommand(transcript: string): CinemaCommand | null {
    const text = (transcript ?? '').toLowerCase().replace(/[.,!?;]/g, ' ').trim();
    if (!text) return null;

    const patterns: { id: CinemaCommandId; matches: RegExp }[] = [
      { id: 'end-stream', matches: /\b(end|stop|kill)\b.*\b(stream|broadcast|live)\b/ },
      { id: 'go-live', matches: /\b(go|be)\s+live\b|\bstart\b.*\b(stream|broadcast)\b/ },
      { id: 'pause', matches: /\b(pause|hold|stop playback|freeze|halt)\b/ },
      { id: 'take', matches: /\b(stop|end)\b.*\b(recording|take|tape)\b/ },
      { id: 'take', matches: /\b(record|rolling|action|start recording)\b/ },
      { id: 'auto-cut', matches: /\bauto\s*-?\s*cut\b|\bcut\b.*\b(on )?the beat\b|\bto the beat\b/ },
      { id: 'split', matches: /\b(split|cut here|cut it|slice)\b/ },
      { id: 'next-marker', matches: /\b(next|forward)\b.*\b(scene|marker|section|act)\b/ },
      { id: 'previous-marker', matches: /\b(previous|last|prior|back)\b.*\b(scene|marker|section|act)\b/ },
      { id: 'marker', matches: /\b(mark|marker|scene here|new scene)\b/ },
      { id: 'export', matches: /\b(export|render|bounce|master it)\b/ },
      { id: 'snap-on', matches: /\b(snap|lock)\b.*\b(on|to the grid|to the beat)\b/ },
      { id: 'snap-off', matches: /\b(snap|grid|quantize)\b.*\b(off|loose|free)\b/ },
      { id: 'screen', matches: /\b(screen share|share screen|share my screen)\b/ },
      { id: 'camera', matches: /\b(camera|webcam|lens)\b/ },
      { id: 'lower-third', matches: /\b(lower third|title card|name plate|chyron)\b/ },
      { id: 'cue', matches: /\b(countdown|count me in|ready cue|three two one|rolling cue)\b/ },
      { id: 'play', matches: /\b(play|roll|resume|action start|running)\b/ },
    ];

    for (const pattern of patterns) {
      if (pattern.matches.test(text)) {
        return { id: pattern.id, transcript: text };
      }
    }
    return null;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private barSeconds(bpm: number): number {
    const safeBpm = Math.max(1, bpm);
    return (60 / safeBpm) * 4;
  }

  private extractJson(response: string): any | null {
    if (!response || typeof response !== 'string') return null;
    const fenced = response.replace(/```(?:json)?/gi, ' ');
    const start = fenced.search(/[[{]/);
    if (start === -1) return null;
    const end = Math.max(fenced.lastIndexOf('}'), fenced.lastIndexOf(']'));
    if (end <= start) return null;
    try {
      return JSON.parse(fenced.slice(start, end + 1));
    } catch (error) {
      this.logger.warn('Cinema director: shot plan was not valid JSON', error);
      return null;
    }
  }

  private normaliseShot(
    raw: any
  ): { title: string; description: string; size: ShotSize; bars: number } | null {
    if (!raw || typeof raw !== 'object') return null;
    const title =
      typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null;
    if (!title) return null;
    const size = SHOT_SIZES.includes(raw.size) ? (raw.size as ShotSize) : 'wide';
    const rawBars = Number(raw.bars);
    const bars = Number.isFinite(rawBars)
      ? Math.max(1, Math.min(64, Math.round(rawBars)))
      : 2;

    return {
      title,
      description:
        typeof raw.description === 'string' && raw.description.trim()
          ? raw.description.trim()
          : 'Coverage per the director’s plan.',
      size,
      bars,
    };
  }

  private describeShot(size: ShotSize, section: string, brief: string): string {
    const subject = brief.trim() || 'the artist';
    const descriptions: Record<ShotSize, string> = {
      establishing: `Establish the world of ${section.toLowerCase()} — location, weather, scale.`,
      wide: `Wide coverage of ${subject} inside ${section.toLowerCase()}.`,
      medium: `Medium two-shot: ${subject} framed mid-body, hands in play.`,
      close: `Tight on ${subject} — eyes, breath, the moment before the hit.`,
      insert: `Insert detail: hands, textures, gear, a glance off-axis.`,
      'b-roll': `B-roll texture for ${section.toLowerCase()} — the city, the mirror, the drive.`,
      performance: `Performance take: ${subject} playing the hook straight to camera.`,
      'lip-sync': `Lip-sync take on the hook, cut to the syllable.`,
      transition: `Transition plate — whip, wipe, or match cut out of ${section.toLowerCase()}.`,
    };
    return descriptions[size];
  }

  private formatShotSize(size: ShotSize): string {
    return size.replace(/(^|-)([a-z])/g, (_match, prefix, letter) =>
      `${prefix ? ' ' : ''}${letter.toUpperCase()}`
    );
  }

  private modeLabel(mode: ProductionMode): string {
    const labels: Record<ProductionMode, string> = {
      movie: 'Feature',
      music: 'Music Video',
      stream: 'Broadcast',
      vlog: 'Vlog',
    };
    return labels[mode] ?? 'Production';
  }
}
