import { Injectable, inject } from '@angular/core';
import { AiService } from './ai.service';
import { SmuveMemoryService } from './smuve-memory.service';

/**
 * The Director Coach: S.M.U.V.E. as narrator/teacher over one project.
 *
 * The journey ladder is computed from verified console state, never from
 * the model's imagination — so the coach can't send the artist to stage a
 * plan that already exists, or congratulate them on a shot that was never
 * styled. The LLM only narrates the facts; when the link is down the
 * deterministic report is the coaching, so the teacher is never silent.
 */

export interface CoachState {
  hasPlan: boolean;
  planTitle?: string;
  shotCount: number;
  stagedShots: number;
  styledShots: number;
  animatedShots: number;
  hasOverlay: boolean;
  overlayName?: string;
  overlayDurationSeconds?: number;
  hasPhoto: boolean;
  /** Footage clips on the visuals lane (storyboard cards excluded). */
  laneClipCount: number;
  hasTalkingHead: boolean;
}

export type JourneyStepState = 'done' | 'active' | 'upcoming';

export interface JourneyStep {
  id: string;
  label: string;
  state: JourneyStepState;
  hint: string;
}

export interface CoachReport {
  headline: string;
  narration: string;
  nextAction: string;
  steps: JourneyStep[];
}

/** The music-video journey, in the order the console actually delivers. */
export function assessJourney(state: CoachState): JourneyStep[] {
  const remaining = (done: number, total: number) => Math.max(0, total - done);
  const steps: Array<Omit<JourneyStep, 'state'> & { done: boolean }> = [
    {
      id: 'audio',
      label: 'Load the audio bed',
      done: state.hasOverlay,
      hint: state.hasOverlay
        ? 'The bed is on the desk — everything cuts to it.'
        : 'Every cut needs a bed to sit on. Load the track or stem.',
    },
    {
      id: 'plan',
      label: 'Generate a shot plan',
      done: state.hasPlan,
      hint: state.planTitle
        ? `"${state.planTitle}" is the plan — ${state.shotCount} shots on the board.`
        : 'A plan turns a track into shootable beats. Generate one.',
    },
    {
      id: 'stage',
      label: 'Stage the storyboard',
      done: state.stagedShots > 0,
      hint:
        state.stagedShots > 0
          ? `${state.stagedShots} of ${state.shotCount} shot cards are on the lane.`
          : 'Cards on the visuals lane are the skeleton of the video.',
    },
    {
      id: 'style',
      label: 'Style the shots',
      done: state.shotCount > 0 && state.styledShots === state.shotCount,
      hint:
        state.styledShots === state.shotCount && state.shotCount > 0
          ? 'Every shot has its concept still.'
          : `${remaining(state.styledShots, state.shotCount)} of ${state.shotCount} shots still need a CONCEPT still.`,
    },
    {
      id: 'animate',
      label: 'Animate the shots',
      done: state.shotCount > 0 && state.animatedShots === state.shotCount,
      hint:
        state.animatedShots === state.shotCount && state.shotCount > 0
          ? 'Every shot moves.'
          : `${remaining(state.animatedShots, state.shotCount)} of ${state.shotCount} shots still need ANIMATE.`,
    },
    {
      id: 'performance',
      label: 'Make the still talk',
      done: state.hasTalkingHead,
      hint: state.hasTalkingHead
        ? 'The talking head is cut — the face performs the bed.'
        : state.hasPhoto
          ? 'A still plus the bed becomes a talking head.'
          : 'Optional garnish: load a portrait still and let it perform the bed.',
    },
  ];

  const activeIndex = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({
    id: step.id,
    label: step.label,
    hint: step.hint,
    state: step.done
      ? 'done'
      : index === activeIndex
        ? 'active'
        : 'upcoming',
  }));
}

/** One to three sentences, in the coach's own voice, from the ladder. */
export function deterministicReport(state: CoachState): CoachReport {
  const steps = assessJourney(state);
  const active = steps.find((step) => step.state === 'active');
  if (!active) {
    return {
      headline: 'Cut ready — export it.',
      narration:
        'Every step of the journey is done: the bed, the plan, the styled and animated shots, and the performance. What remains is the export — the cut is shot, styled and moving.',
      nextAction: 'Export the cut.',
      steps,
    };
  }
  const nextAction =
    active.id === 'performance' && !state.hasPhoto
      ? 'Export the cut, or load a portrait still to make it talk.'
      : active.hint;
  return {
    headline: active.label,
    narration: `You are at "${active.label}". ${active.hint}`,
    nextAction,
    steps,
  };
}

/** Tolerant JSON pull: models answer with prose around the object, so the
 * first braced block wins. Anything unparseable is not a verdict. */
export function parseCoachJson(raw: string): {
  headline?: string;
  narration?: string;
  nextAction?: string;
} | null {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    const text = (value: unknown, max: number) =>
      typeof value === 'string' && value.trim()
        ? value.trim().slice(0, max)
        : undefined;
    const result = {
      headline: text(parsed.headline, 90),
      narration: text(parsed.narration, 700),
      nextAction: text(parsed.nextAction, 220),
    };
    return result.headline || result.narration || result.nextAction
      ? result
      : null;
  } catch {
    return null;
  }
}

function factSheet(state: CoachState): string {
  const parts = [
    `audio bed: ${
      state.hasOverlay
        ? `yes (${state.overlayName ?? 'unnamed'}, ${Math.round(
            state.overlayDurationSeconds ?? 0,
          )}s)`
        : 'no'
    }`,
    `shot plan: ${
      state.hasPlan
        ? `"${state.planTitle ?? 'untitled'}", ${state.shotCount} shots`
        : 'none'
    }`,
    `staged cards: ${state.stagedShots}/${state.shotCount}`,
    `styled stills: ${state.styledShots}/${state.shotCount}`,
    `animated shots: ${state.animatedShots}/${state.shotCount}`,
    `portrait still loaded: ${state.hasPhoto ? 'yes' : 'no'}`,
    `footage clips on the visuals lane: ${state.laneClipCount}`,
    `talking head cut: ${state.hasTalkingHead ? 'yes' : 'no'}`,
  ];
  return parts.join('; ');
}

@Injectable({ providedIn: 'root' })
export class DirectorCoachService {
  private aiService = inject(AiService);
  private memory = inject(SmuveMemoryService);

  /**
   * Coach one project. The ladder is always computed from the given facts;
   * the model only narrates it. Offline or malformed answers fall back to
   * the deterministic report — the journey never depends on the wire.
   */
  async coach(
    state: CoachState,
    artistQuestion = 'What is the next move?',
  ): Promise<CoachReport> {
    const report = deterministicReport(state);
    let final = report;
    try {
      const prompt = [
        'You are S.M.U.V.E., the director-teacher inside an image and video lab.',
        'Coach the artist on THIS project using ONLY these verified facts:',
        factSheet(state),
        'Reply with ONLY a JSON object with three string fields: headline (short coach line), narration (two or three sentences of teaching, speaking only to the facts above), nextAction (one imperative sentence naming a real console control).',
        'JSON only, no prose outside it.',
      ].join('\n');
      const parsed = parseCoachJson(
        await this.aiService.getAIResponse(prompt),
      );
      if (parsed?.narration) {
        final = {
          steps: report.steps,
          headline: parsed.headline ?? report.headline,
          narration: parsed.narration,
          nextAction: parsed.nextAction ?? report.nextAction,
        };
      }
    } catch {
      // The deterministic ladder is the coaching.
    }
    this.memory.captureTurn(
      'video',
      'Image & Video Lab',
      artistQuestion,
      final.narration,
    );
    return final;
  }
}
