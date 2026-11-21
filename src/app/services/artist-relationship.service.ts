import { Injectable, computed, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { SmuveMemoryService } from './smuve-memory.service';
import { LoggingService } from './logging.service';
import {
  recordDnaEvidence,
  type DnaDimensionId,
  type DnaEvidenceInput,
} from '../types/musical-dna.types';
import type { UserProfile } from '../types/profile.types';

/** How well S.M.U.V.E. knows the artist right now. */
export type ArtistRelationshipStage =
  | 'stranger'
  | 'getting-to-know'
  | 'collaborator'
  | 'confidant';

/**
 * One filed interview answer, kept so its Filed note can offer one-tap
 * undo. Session-local: a reload starts a fresh ledger.
 */
export interface InterviewAnswerRecord {
  /** The Filed note's message id — the undo button carries this. */
  messageId: string;
  field: string;
  label: string;
  value: string | string[];
  /** What the field held before the answer (undefined = it was empty). */
  previous: unknown;
  /** DNA event id appended for this answer, if any. */
  dnaEventId: string | null;
}

/**
 * How S.M.U.V.E. should sound to THIS artist right now.
 *
 * Deterministic surfaces used to recite the same generic lines to every
 * account. The voice is drawn from the relationship stage and the artist's own
 * file; both lines rotate so consecutive answers never open the same way, and
 * either stays null when there is nothing real behind it, so intimacy is never
 * invented for an account S.M.U.V.E. has not actually met.
 */
export interface RelationshipVoice {
  /** Stage-shaped opener, rotated per reply; null before any real history. */
  opener: string | null;
  /** One fact from the artist's own file, rotated; null when none is recorded. */
  note: string | null;
}

export interface RelationshipQuestion {
  /** Stable id so the interview never repeats itself. */
  id: string;
  /** Profile path this answer fills (`primaryGenre` or `journey.*`). */
  field: string;
  /** Human label for briefs and progress. */
  label: string;
  /** The one question, in S.M.U.V.E.'s voice. */
  ask: string;
  /** DNA axis this answer evidences. */
  dimension: DnaDimensionId;
}

/**
 * The interview ladder: highest-signal questions first, so even three
 * answers give S.M.U.V.E. something real to work with. The artist's own
 * words go straight into the profile — never into a form.
 */
const INTERVIEW_LADDER: RelationshipQuestion[] = [
  {
    id: 'genre',
    field: 'primaryGenre',
    label: 'Primary genre',
    ask: 'What lane are we running in — what is your primary genre?',
    dimension: 'audience',
  },
  {
    id: 'experience',
    field: 'journey.experienceLevel',
    label: 'Experience level',
    ask: 'Where are you at — just starting, building, or already dangerous?',
    dimension: 'production',
  },
  {
    id: 'roles',
    field: 'journey.roles',
    label: 'Roles',
    ask: 'What do you actually do — rap, sing, produce, engineer, all of it?',
    dimension: 'writing',
  },
  {
    id: 'influences',
    field: 'journey.musicalInfluences',
    label: 'Influences',
    ask: 'Who shaped your ear? Name the voices you studied.',
    dimension: 'melody',
  },
  {
    id: 'focus',
    field: 'journey.currentFocus',
    label: 'Current focus',
    ask: 'What is the mission right now — what are you building?',
    dimension: 'arrangement',
  },
  {
    id: 'challenge',
    field: 'journey.biggestChallenge',
    label: 'Biggest challenge',
    ask: 'What is the one thing standing between you and the next level?',
    dimension: 'production',
  },
  {
    id: 'tempo',
    field: 'journey.preferredBpmRange',
    label: 'Tempo zone',
    ask: 'What tempo zone feels like home — give me a range like 90-120?',
    dimension: 'rhythm',
  },
  {
    id: 'songwriting',
    field: 'journey.songwritingStyle',
    label: 'Songwriting style',
    ask: 'How do songs usually start for you — melody, beat, story, or accident?',
    dimension: 'writing',
  },
  {
    id: 'signature',
    field: 'journey.signatureSound',
    label: 'Signature sound',
    ask: 'Finish this: nobody else sounds like me because…',
    dimension: 'sonics',
  },
  {
    id: 'collab',
    field: 'journey.collaborationGoals',
    label: 'Collaboration goals',
    ask: 'Who should be in the room with you that is not there yet?',
    dimension: 'audience',
  },
  {
    id: 'references',
    field: 'blueprint.referenceTracks',
    label: 'Reference tracks',
    ask: 'Give me two or three reference tracks — the standard your mixes answer to.',
    dimension: 'sonics',
  },
  {
    id: 'velocity',
    field: 'journey.releaseVelocity',
    label: 'Release velocity',
    ask: 'How fast do you ship — steady singles, or projects when they are ready?',
    dimension: 'audience',
  },
];

interface CompletenessField {
  get: (profile: UserProfile) => unknown;
  label: string;
  weight: number;
}

const journeyOf = (profile: UserProfile): Record<string, unknown> =>
  (profile.musicalJourney ?? {}) as unknown as Record<string, unknown>;
const blueprintOf = (profile: UserProfile): Record<string, unknown> =>
  (journeyOf(profile)['musicBlueprint'] ?? {}) as Record<string, unknown>;

/** Weighted profile signals — core identity outweighs supporting detail. */
const COMPLETENESS_FIELDS: CompletenessField[] = [
  { get: (p) => p.primaryGenre, label: 'Genre', weight: 2 },
  { get: (p) => p.artistName, label: 'Artist name', weight: 2 },
  { get: (p) => journeyOf(p).experienceLevel, label: 'Experience', weight: 2 },
  { get: (p) => journeyOf(p).roles, label: 'Roles', weight: 1 },
  { get: (p) => journeyOf(p).musicalInfluences, label: 'Influences', weight: 2 },
  { get: (p) => journeyOf(p).subgenres, label: 'Subgenres', weight: 1 },
  { get: (p) => journeyOf(p).currentFocus, label: 'Current focus', weight: 2 },
  {
    get: (p) => journeyOf(p).biggestChallenge,
    label: 'Biggest challenge',
    weight: 2,
  },
  {
    get: (p) => journeyOf(p).preferredBpmRange,
    label: 'Tempo zone',
    weight: 1,
  },
  {
    get: (p) => journeyOf(p).songwritingStyle,
    label: 'Songwriting style',
    weight: 1,
  },
  {
    get: (p) => journeyOf(p).productionPhilosophy,
    label: 'Production philosophy',
    weight: 1,
  },
  {
    get: (p) => journeyOf(p).signatureSound,
    label: 'Signature sound',
    weight: 2,
  },
  {
    get: (p) => journeyOf(p).releaseVelocity,
    label: 'Release velocity',
    weight: 1,
  },
  {
    get: (p) => journeyOf(p).primarySuccessMetric,
    label: 'Success metric',
    weight: 1,
  },
  { get: (p) => blueprintOf(p).vocalDelivery, label: 'Delivery', weight: 1 },
  { get: (p) => blueprintOf(p).lyricalThemes, label: 'Lyrical themes', weight: 1 },
  { get: (p) => blueprintOf(p).rhythmicFeel, label: 'Rhythmic feel', weight: 1 },
  {
    get: (p) => blueprintOf(p).referenceTracks,
    label: 'Reference tracks',
    weight: 1,
  },
];

function isFilled(value: unknown, fieldLabel?: string): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) {
    return value.some((item) =>
      typeof item === 'string' ? item.trim() !== '' : item != null
    );
  }
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  const text = String(value).trim();
  if (!text) return false;
  // A placeholder name is not an identity.
  if (fieldLabel === 'Artist name') {
    const lowered = text.toLowerCase();
    return lowered !== 'new artist' && lowered !== 'untitled artist';
  }
  return true;
}

/**
 * The living artist model behind the manager.
 *
 * The profile questionnaire captures a snapshot; this service tracks the
 * relationship itself — how much S.M.U.V.E. actually knows, what to learn
 * next, and how the voice should bend toward this artist. New artists get
 * an interview (one question at a time, in conversation) instead of a
 * form; veterans get their own history quoted back at them. Everything
 * learned lands in the profile and the DNA log, so every surface —
 * chatbot, advisor, lifecycle — reads the same deepening picture.
 */
@Injectable({ providedIn: 'root' })
export class ArtistRelationshipService {
  private profiles = inject(UserProfileService);
  private memory = inject(SmuveMemoryService);
  private logger = inject(LoggingService);

  /** Question ids already put to the artist this session. */
  private readonly askedIds = signal<string[]>([]);

  /** Rotation cursors for `voice()`, so consecutive replies differ. */
  private openerCursor = 0;
  private noteCursor = 0;

  /** Filed answers, newest last — undo only ever touches the top. */
  private readonly answerLedger: InterviewAnswerRecord[] = [];

  /** 0..100 — weighted share of the profile S.M.U.V.E. can reason with. */
  readonly completeness = computed(() => {
    const profile = this.profiles.profile();
    if (!profile) return 0;
    const max = COMPLETENESS_FIELDS.reduce((sum, f) => sum + f.weight, 0);
    if (max <= 0) return 0;
    const earned = COMPLETENESS_FIELDS.filter((f) =>
      isFilled(f.get(profile), f.label)
    ).reduce((sum, f) => sum + f.weight, 0);
    return Math.round((earned / max) * 100);
  });

  /** Shared history: case-file lines plus DNA behaviour events. */
  readonly sharedHistoryCount = computed(() => {
    const profile = this.profiles.profile();
    const memories = this.memory.entries()?.length ?? 0;
    const dnaEvents = profile?.musicalDna?.events?.length ?? 0;
    return memories + dnaEvents;
  });

  /** What S.M.U.V.E. calls this artist, once the name is real. */
  readonly address = computed(() => {
    const name = String(this.profiles.profile()?.artistName ?? '').trim();
    return !name || /^(new|untitled) artist$/i.test(name) ? 'artist' : name;
  });

  /** The relationship stage — drives tone, depth and initiative. */
  readonly stage = computed<ArtistRelationshipStage>(() => {
    const known = this.completeness();
    const history = this.sharedHistoryCount();
    if (known >= 85 && history >= 8) return 'confidant';
    if (known >= 55 || history >= 4) return 'collaborator';
    if (known >= 25 || history >= 1) return 'getting-to-know';
    return 'stranger';
  });

  /** Labels S.M.U.V.E. can already reason with (privacy-gated by callers). */
  readonly knownLabels = computed(() => {
    const profile = this.profiles.profile();
    if (!profile) return [];
    return COMPLETENESS_FIELDS.filter((f) => isFilled(f.get(profile), f.label)).map(
      (f) => f.label
    );
  });

  /** Labels still missing, highest weight first. */
  readonly missingLabels = computed(() => {
    const profile = this.profiles.profile();
    if (!profile) return COMPLETENESS_FIELDS.map((f) => f.label);
    return COMPLETENESS_FIELDS.filter(
      (f) => !isFilled(f.get(profile), f.label)
    )
      .sort((a, b) => b.weight - a.weight)
      .map((f) => f.label);
  });

  /**
   * The next interview question: first ladder rung whose field is still
   * empty and that this session has not already asked. Null when the
   * ladder is done — the relationship continues through behaviour.
   */
  nextQuestion(): RelationshipQuestion | null {
    const profile = this.profiles.profile();
    if (!profile) return null;
    const asked = new Set(this.askedIds());
    for (const question of INTERVIEW_LADDER) {
      if (asked.has(question.id)) continue;
      if (isFilled(this.readField(profile, question.field))) continue;
      return question;
    }
    return null;
  }

  /**
   * Record the artist's answer: write it into the profile, evidence it
   * in the DNA log as a declared answer, and advance the interview.
   * Returns false when there is nothing to answer or the write fails.
   */
  async answerCurrentQuestion(
    value: string | string[],
    opts?: { messageId?: string }
  ): Promise<boolean> {
    const question = this.nextQuestion();
    if (!question) return false;
    const cleaned = Array.isArray(value)
      ? value.map((v) => String(v ?? '').trim()).filter(Boolean)
      : String(value ?? '').trim();
    if (
      (Array.isArray(cleaned) && cleaned.length === 0) ||
      (!Array.isArray(cleaned) && !cleaned)
    ) {
      return false;
    }
    const previous = this.readField(this.profiles.profile(), question.field);
    try {
      const ok = await this.profiles.updateProfile(
        this.buildPatch(question.field, cleaned)
      );
      if (!ok) return false;
      const profile = this.profiles.profile();
      if (profile) {
        await this.profiles.updateProfile({
          musicalDna: recordDnaEvidence(
            profile.musicalDna,
            {
              dimension: question.dimension,
              source: 'questionnaire',
              summary: `${question.label} declared in conversation`,
              weight: 0.5,
            },
            Date.now()
          ),
        });
      }
      this.askedIds.update((ids) =>
        ids.includes(question.id) ? ids : [...ids, question.id]
      );
      const events = this.profiles.profile()?.musicalDna?.events ?? [];
      const appendedId = events.length
        ? (events[events.length - 1].id ?? null)
        : null;
      if (opts?.messageId) {
        this.answerLedger.push({
          messageId: opts.messageId,
          field: question.field,
          label: question.label,
          value: cleaned,
          previous,
          dnaEventId: appendedId,
        });
      }
      return true;
    } catch (error) {
      this.logger.warn(
        'ArtistRelationship: interview answer could not be saved',
        error
      );
      return false;
    }
  }

  /**
   * Undo one filed answer, newest-first. Only the latest ledger entry can
   * go back: an older note whose field has since moved on is refused
   * rather than restored over newer truth. A successful undo restores the
   * previous value (or empties the field when there was none), drops the
   * DNA event the answer appended, and reopens the ladder rung.
   */
  async undoInterviewAnswer(
    messageId: string
  ): Promise<{ ok: boolean; reason: string; label?: string }> {
    const top = this.answerLedger[this.answerLedger.length - 1];
    if (!top || top.messageId !== messageId) {
      return {
        ok: false,
        reason:
          'A newer answer already replaced that one — change it in the profile editor.',
      };
    }
    const profile = this.profiles.profile();
    if (!profile) return { ok: false, reason: 'No profile to restore.' };
    const current = this.readField(profile, top.field);
    if (JSON.stringify(current ?? null) !== JSON.stringify(top.value ?? null)) {
      this.answerLedger.pop();
      return {
        ok: false,
        reason:
          'That answer already changed — change it in the profile editor.',
      };
    }
    try {
      const revert =
        top.previous === undefined
          ? Array.isArray(top.value)
            ? []
            : ''
          : top.previous;
      const ok = await this.profiles.updateProfile(
        this.buildPatch(top.field, revert as string | string[])
      );
      if (!ok) return { ok: false, reason: 'The profile refused the undo.' };
      if (top.dnaEventId) {
        const dna = this.profiles.profile()?.musicalDna;
        if (dna) {
          await this.profiles.updateProfile({
            musicalDna: {
              ...dna,
              events: dna.events.filter((e) => e.id !== top.dnaEventId),
              updatedAt: Date.now(),
            },
          });
        }
      }
      this.answerLedger.pop();
      this.askedIds.update((ids) =>
        ids.filter((id) => id !== this.questionIdForField(top.field))
      );
      return { ok: true, reason: 'undone', label: top.label };
    } catch (error) {
      this.logger.warn('ArtistRelationship: interview undo failed', error);
      return { ok: false, reason: 'The undo failed — try the profile editor.' };
    }
  }

  /** Ladder question id that fills a profile field (for reopening on undo). */
  private questionIdForField(field: string): string | null {
    return (
      INTERVIEW_LADDER.find((question) => question.field === field)?.id ?? null
    );
  }

  /**
   * Interview progress for the card: answered ladder rungs over the ladder.
   */
  readonly interviewProgress = computed(() => {
    const profile = this.profiles.profile();
    const total = INTERVIEW_LADDER.length;
    if (!profile) return { answered: 0, total };
    const answered = INTERVIEW_LADDER.filter((question) =>
      isFilled(this.readField(profile, question.field))
    ).length;
    return { answered, total };
  });

  /**
   * Skip the current interview question without answering it. The rung is
   * marked asked for this session so the interview moves on; the gap stays
   * visible in missingLabels and the model may circle back later.
   */
  skipCurrentQuestion(): RelationshipQuestion | null {
    const question = this.nextQuestion();
    if (!question) return null;
    this.askedIds.update((ids) =>
      ids.includes(question.id) ? ids : [...ids, question.id]
    );
    return question;
  }

  /**
   * Learn from behaviour: sessions, shipped versions, dismissed advice.
   * Anything the engine observes lands in the DNA log, so the chatbot's
   * picture of the artist deepens even when they never fill a form.
   */
  async observe(input: DnaEvidenceInput): Promise<boolean> {
    try {
      const profile = this.profiles.profile();
      if (!profile) return false;
      return await this.profiles.updateProfile({
        musicalDna: recordDnaEvidence(
          profile.musicalDna,
          { source: 'behaviour', weight: 0.25, ...input },
          Date.now()
        ),
      });
    } catch (error) {
      this.logger.warn('ArtistRelationship: behaviour could not be learned', error);
      return false;
    }
  }

  /**
   * The relationship in one answer: what this history lets S.M.U.V.E. say, and
   * one fact from the artist's own file. Used by the deterministic reply path
   * so offline S.M.U.V.E. still knows exactly who it is talking to.
   */
  voice(): RelationshipVoice {
    return { opener: this.nextOpener(), note: this.nextNote() };
  }

  /**
   * The stage's opener, rotated. A stage changes rarely, so a fixed line would
   * open every answer in a session word for word; a stranger has no history to
   * speak from, so the persona's own varying openers take over instead.
   */
  private nextOpener(): string | null {
    const stage = this.stage();
    if (stage === 'stranger') return null;
    const history = this.sharedHistoryCount();
    const lines =
      stage === 'getting-to-know'
        ? [
            'I am still reading you, but the direction is yours.',
            'Half a file on you so far, and no bluffing yet — keep it that way.',
            'We are early, and I am already taking notes.',
          ]
        : stage === 'collaborator'
          ? [
              `${history} moments on the file, and I am not starting from zero with you.`,
              `We have done this before — ${history} times — so I will skip the introductions.`,
              `${history} moments in, and you still need me to say it out loud.`,
            ]
          : [
              `${history} moments on the file — I know what you sound like when you are guessing.`,
              `After ${history} moments together, do not insult me with the easy version.`,
              `${history} moments of your work in my file. I know exactly where you cut corners.`,
            ];
    const line = lines[this.openerCursor % lines.length];
    this.openerCursor += 1;
    const address = this.address();
    return address === 'artist' ? line : `${address}. ${line}`;
  }

  /** The next filed fact, rotated so one line does not close every answer. */
  private nextNote(): string | null {
    const notes = this.personalNotes();
    if (!notes.length) return null;
    const note = notes[this.noteCursor % notes.length];
    this.noteCursor += 1;
    return note;
  }

  /** Every true fact on file about this artist, strongest first. */
  private personalNotes(): string[] {
    const profile = this.profiles.profile();
    if (!profile) return [];
    const said = (field: string): string | null => {
      const value = this.readField(profile, field);
      if (value === undefined || value === null || Array.isArray(value)) {
        return null;
      }
      const text = String(value).replace(/\s+/g, ' ').trim();
      if (!text) return null;
      return text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text;
    };
    const notes: string[] = [];
    const signature = said('journey.signatureSound');
    if (signature) notes.push(`Your signature, in your own words: “${signature}”.`);
    const focus = said('journey.currentFocus');
    if (focus) notes.push(`The mission on record: “${focus}”.`);
    const challenge = said('journey.biggestChallenge');
    if (challenge) notes.push(`You named your own wall: “${challenge}”.`);
    const loop = this.memory.openLoops()[0];
    if (loop?.text) notes.push(`Still open on my file: “${loop.text}”.`);
    const genre = said('primaryGenre');
    if (genre) notes.push(`Everything here answers to your ${genre} standard.`);
    return notes;
  }

  /**
   * Prompt-ready relationship brief for the master prompt. Field contents
   * obey the same gates as every other profile-derived block: nothing the
   * artist kept private is named, only the shape of what is missing.
   *
   * Pass `interview: false` on a surface that speaks with the artist but never
   * files interview answers (the Studio panel): the stage, depth and address
   * still frame the reply, without a marker nothing there can consume.
   */
  brief(interview = true): string {
    const profile = this.profiles.profile();
    const known = this.completeness();
    const history = this.sharedHistoryCount();
    const stage = this.stage();
    const stageLine =
      stage === 'stranger'
        ? interview
          ? 'STRANGER — you have never met. Introduce yourself briefly, then ask exactly one interview question.'
          : 'STRANGER — you have never met. Introduce yourself briefly; do not pretend to know them yet.'
        : stage === 'getting-to-know'
          ? interview
            ? 'GETTING TO KNOW YOU — early days. Stay curious, keep answers short enough to earn the next one, ask exactly one question.'
            : 'GETTING TO KNOW YOU — early days. Stay curious, keep answers short, and earn the trust before you use it.'
          : stage === 'collaborator'
            ? 'COLLABORATOR — working history exists. Quote their own past moves back at them and push for the next level.'
            : 'CONFIDANT — deep history. Speak from everything you know, hold them to their own standards, no small talk unless they start it.';
    const lines = [
      `RELATIONSHIP — ${stageLine}`,
      `Profile known: ${known}% · shared history: ${history} moment${history === 1 ? '' : 's'}.`,
    ];
    const address = this.address();
    if (address !== 'artist') {
      lines.push(`Call the artist “${address}” when you speak to them.`);
    }
    const shareAnswers =
      profile?.settings?.security?.shareProfileAnswersWithAi === true;
    if (!shareAnswers) {
      lines.push(
        'Profile answers are PRIVATE — learn only from this conversation. Ask before assuming anything; never present a guess as a fact.'
      );
    } else {
      const knownLabels = this.knownLabels().slice(0, 6);
      if (knownLabels.length) lines.push(`Already known: ${knownLabels.join('; ')}.`);
    }
    const missing = this.missingLabels().slice(0, 2);
    if (missing.length) {
      lines.push(
        interview
          ? `Still missing: ${missing.join('; ')}.`
          : `Not yet on file — ask before assuming: ${missing.join('; ')}.`
      );
    }
    const next = interview ? this.nextQuestion() : null;
    if (next) {
      // The bracketed marker is the card's machine-readable identity. The
      // card itself never reaches the model (system messages are filtered
      // from history), so this line IS the model's view of the card: it
      // must reproduce the marker verbatim at the end of its woven
      // question. A reply typed under that echo files exactly — no
      // fuzzy text matching, never an invented or recycled marker.
      lines.push(
        `Next interview move — weave exactly this one question into your reply naturally, then use the answer: "${next.ask}" [iq:${next.id}] — reproduce that bracketed marker verbatim at the end of your woven question. Never invent a marker, never reuse one from earlier in the transcript.`
      );
    }
    const level = String(
      profile?.musicalJourney?.experienceLevel ?? ''
    ).toLowerCase();
    lines.push(
      level.includes('beginn') || (!level && known < 25)
        ? 'Tone: foundations first. Teach the why in one line, encourage the attempt, never shame inexperience — pressure the work, never the person.'
        : 'Tone: veteran pressure. Skip the basics, name the weak spot precisely, demand the next level by name.'
    );
    return lines.join('\n');
  }

  /** Read a `top.nested.path` field off the profile without leaking `any`. */
  private readField(profile: UserProfile, field: string): unknown {
    if (field === 'primaryGenre') return profile.primaryGenre;
    if (field === 'artistName') return profile.artistName;
    if (field.startsWith('journey.')) {
      const journey = (profile.musicalJourney ?? {}) as Record<string, unknown>;
      return journey[field.slice('journey.'.length)];
    }
    if (field.startsWith('blueprint.')) {
      const blueprint = ((profile.musicalJourney?.musicBlueprint ?? {}) as Record<
        string,
        unknown
      >);
      return blueprint[field.slice('blueprint.'.length)];
    }
    return undefined;
  }

  /** Build a shallow-merge-safe profile patch for an interview answer. */
  private buildPatch(
    field: string,
    value: string | string[]
  ): Partial<UserProfile> {
    if (field === 'primaryGenre' || field === 'artistName') {
      return { [field]: value } as Partial<UserProfile>;
    }
    if (field.startsWith('journey.')) {
      const key = field.slice('journey.'.length);
      const journey = (this.profiles.profile()?.musicalJourney ?? {}) as Record<
        string,
        unknown
      >;
      return {
        musicalJourney: { ...journey, [key]: value },
      } as unknown as Partial<UserProfile>;
    }
    if (field.startsWith('blueprint.')) {
      const key = field.slice('blueprint.'.length);
      const journey = (this.profiles.profile()?.musicalJourney ?? {}) as Record<
        string,
        unknown
      >;
      const blueprint = ((journey['musicBlueprint'] ?? {}) as Record<string, unknown>);
      return {
        musicalJourney: {
          ...journey,
          musicBlueprint: { ...blueprint, [key]: value },
        },
      } as unknown as Partial<UserProfile>;
    }
    return {};
  }
}
