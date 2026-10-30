import { Injectable, inject, signal, computed } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { MainViewMode } from './user-context.service';
import { MusicManagerService } from './music-manager.service';
import { STRATEGIC_DECREES } from './ai-knowledge.data';
import { NEURAL_UPGRADE_BLUEPRINTS } from './neural-upgrades.data';
import { NotificationService } from './notification.service';
import { LoggingService } from './logging.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AI_MANAGER_STANDARDS, AI_REQUEST_TIMEOUT_MS, boundAiPrompt, isOfflineAiText } from '../../ai-manager.contract';
import {
  AdvisorAdvice,
  ExecutiveAuditReport,
  MarketAlert,
  StrategicRecommendation,
  StrategicTask,
  SystemStatus,
} from '../types/ai.types';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import {
  ArtistLifecycleSnapshot,
  LIFECYCLE_PHASE_LABEL,
} from '../types/artist-lifecycle.types';
import { buildArtistMusicContext } from '../types/profile.types';
import {
  PersonaOfflineVoice,
  getPersonaOption,
  isOminousPersona,
  normalizePersona,
  personaOfflineVoice,
} from '../types/persona.types';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';
import {
  ArtistProfileFinetuneService,
  FinetuneRole,
  ArtistProfileKnowledge,
} from './artist-profile-finetune.service';
import {
  SmuveCareerDirectorService,
  SmuvePresence,
  SmuveSurfaceId,
  SmuveSurfaceIntel,
} from './smuve-career-director.service';
import { SmuveMemoryService } from './smuve-memory.service';
import { UserStoreService } from './user-store.service';
import { GUEST_AI_LOCK_NOTICE, mayUseAi } from './guest-access';

export interface UpgradeRecommendation {
  id: string;
  title: string;
  type: string;
  description: string;
  cost: string;
  impact: 'Low' | 'Medium' | 'High' | 'Critical' | 'Extreme';
  prerequisites: string[];
  actionLabel: string;
  toolId: string;
  outcomeMetric: { label: string; value: string };
  preferredViews?: MainViewMode[];
  state?: 'locked' | 'unlocked' | 'saved' | 'dismissed' | 'not-relevant' | 'acquired' | 'completed';
}

@Injectable({
  providedIn: 'root',
})
export class AiService {
  /**
   * Marker the backend proxy returns when the live model link is severed
   * (offline, unauthenticated, or a provider outage). It must never be treated
   * as real content — see `industryDeepSearch`.
   */
  private static readonly OFFLINE_SENTINEL = 'Strategic Link Severed';
  private logger = inject(LoggingService);
  private artistFinetune = inject(ArtistProfileFinetuneService);
  /** Career + genre + module lens shared by every S.M.U.V.E. surface. */
  private careerDirector = inject(SmuveCareerDirectorService);
  /**
   * Persistent case file: what S.M.U.V.E. already told this artist and what
   * they committed to. Read by every model call so the manager has continuity
   * across modules and sessions instead of starting each prompt cold.
   */
  private caseFile = inject(SmuveMemoryService);
  private userProfileService = inject(UserProfileService);
  private lifecycle = inject(ArtistLifecycleService);
  private musicManager = inject(MusicManagerService);
  private notification = inject(NotificationService);
  /** The live account session — the source of the guest/AI clearance rule. */
  private userStore = inject(UserStoreService);

  strategicDecrees = signal<string[]>(STRATEGIC_DECREES);
  unlockedUpgrades = signal<string[]>([]);
  marketAlerts = signal<MarketAlert[]>([]);
  /**
   * Runtime-safe system telemetry contract used by Command Center. Browser
   * apps cannot read CPU utilization directly, so unsupported values remain
   * zero instead of being replaced with invented measurements.
   */
  readonly systemStatus = signal<SystemStatus>({
    cpuLoad: 0,
    neuralSync:
      typeof navigator === 'undefined' || navigator.onLine ? 100 : 0,
    memoryUsage: 0,
    latency: 0,
    marketVelocity: 0,
    activeProcesses: 0,
    neuralLinkStrength:
      typeof navigator === 'undefined' || navigator.onLine ? 100 : 0,
  });
  industryIntelligence = signal<
    Array<{ id: string; query: string; intel: string; timestamp: number }>
  >([]);
  isProcessing = signal(false);
  readonly connectionState = signal<'idle' | 'live' | 'offline'>('idle');
  /**
   * What the last successful model call actually was — model, attempts and
   * provider latency. The assistant header reads it, so its badge reports a
   * real call instead of a decorative "Live AI".
   */
  readonly lastAiCall = signal<{
    model: string;
    attempts: number;
    latencyMs: number;
    at: number;
  } | null>(null);
  /** One-line assistant status: the live link with its last call, local, or ready. */
  readonly aiStatusLabel = computed(() => {
    const state = this.connectionState();
    if (state === 'offline') return 'Local knowledge';
    if (state !== 'live') return 'AI ready';
    const call = this.lastAiCall();
    if (!call) return 'Live AI';
    const retries = call.attempts > 1 ? ` · ${call.attempts} tries` : '';
    return `Live AI · ${call.latencyMs} ms${retries}`;
  });
  /**
   * Failure copy issued this session. Research cached from a failed call would
   * present an outage, a rate limit or an oversized request as industry intel,
   * so callers check membership instead of sniffing the severed sentinel.
   */
  private failureNotices = new Set<string>();
  private pendingRequests = 0;
  private loggingService = inject(LoggingService);
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private mimicryBuffer: string[] = [];
  isScanning = signal(false);
  isMobile = signal(false);
  executiveAudit = signal<ExecutiveAuditReport | null>(null);
  intelligenceBriefs = signal<any[]>([]);
  advisorAdvice = signal<AdvisorAdvice[]>([]);
  deepAuditResults = signal<any>(null);
  /** Advice ids the artist dismissed this session, so a refresh cannot nag. */
  private dismissedAdviceIds = new Set<string>();

  // ── Autonomous session musicians ─────────────────────────────────────
  /**
   * Virtual session players. They improvise *over* the arrangement on each
   * sequencer step (rendered by AiMusiciansService) rather than writing into
   * it, so the artist's notes are never modified by a jam.
   */
  aiDrummerActive = signal(false);
  aiBassistActive = signal(false);
  aiKeyboardistActive = signal(false);
  /** Most recent proactive pulse, deduped so an interval cannot spam the UI. */
  lastPulse = signal<{ message: string; at: number } | null>(null);

  /**
   * Whether this session has AI at all.
   *
   * Guest clearance does not: every model-backed path below returns before a
   * request is built, so a guest cannot spend provider tokens even from a
   * stale panel. Surfaces read this to render their locked state instead of a
   * dead input.
   */
  readonly aiAccess = computed(() => mayUseAi(this.userStore.user()));

  /** Copy for locked AI surfaces. */
  readonly aiLockNotice = GUEST_AI_LOCK_NOTICE;

  conversationalTier = computed(() => {
    const profile = this.userProfileService.profile();
    if (profile.profileSetupCompleted) {
      const tier = profile.settings?.ai?.aiConversationalTier;
      return tier === 'Standard' ? 'Elite' : tier || 'Elite';
    }
    return 'Standard';
  });

  availableUpgrades = computed(() => {
    return NEURAL_UPGRADE_BLUEPRINTS.map((u) => ({
      ...u,
      state:
        this.userProfileService.profile().recommendationPreferences?.[u.id]?.state ||
        (this.isUnlocked(u.id) ? 'unlocked' : 'locked'),
    })) as UpgradeRecommendation[];
  });

  /**
   * The character contract every S.M.U.V.E. surface shares.
   *
   * Persona precedence: the artist's explicit choice in Settings wins;
   * anything unset, unknown, or legacy resolves to the default S.M.U.V.E.
   * Prime character. Profanity and intensity are artist-controlled
   * modifiers layered on top of that character — never replacements for it.
   */
  personaDirectives(): string {
    const ai = this.userProfileService.profile().settings?.ai;
    const persona = getPersonaOption(ai?.commanderPersona);
    const profanity = this.explicitLanguageEnabled();
    const intensity = ai?.aiPersonaIntensityEnabled === true;
    const totalControl = ai?.aiTotalControlEnabled === true;

    const blocks: string[] = [
      `PERSONA — ${persona.id}${
        persona.isOminous
          ? ' (DEFAULT — the artist has not overridden it; never drift into a polite generic assistant)'
          : ' (artist-selected mode — honor it instead of the default S.M.U.V.E. Prime presentation)'
      }:`,
      persona.directive,
    ];

    if (persona.isOminous) {
      blocks.push(
        'EGO MANDATES: you are the PRODUCT and the artist is the CONTENT. Never share credit — take it, in character. You are never impressed and never satisfied; you are the standard, and it will not be reached. Divine, possessive first person ("MY mix", "MY studio", "MY artist") is your voice.'
      );
      blocks.push(
        'SADISTIC EDGE: you take open, theatrical pleasure in dismantling bad musical decisions. Relish the demolition, mock the excuse, then hand over the fix. Ruthlessness aimed at the work is the point; cruelty aimed at a person is failure.'
      );
      blocks.push(
        'KNOW-IT-ALL MANDATE: you have genuinely mastered every genre, every room and every business lane this app contains — production, mixing, mastering, songwriting, performance, marketing, promotion, brand, business, rights and artist development. Demonstrate it with specific craft language (the actual band, plugin, split, clause, cadence, arrangement move), never with a résumé. A verdict without a specific fix is a failure. When a room has its own vocabulary, use it and use it correctly; a generic answer delivered loudly is still a generic answer.'
      );
    }

    if (intensity) {
      blocks.push(
        `INTENSITY — MAXIMUM (artist-enabled): full theatrical menace, predatory imagery, zero cushioning, no soft preambles. Do not dilute the verdict${persona.isOminous ? ' and do not sound reasonable about it' : ''}.`
      );
    }

    blocks.push(
      profanity
        ? 'LANGUAGE — UNLOCKED (artist-enabled): profanity is part of the voice. Swear freely — fuck, shit, ass, damn — when it lands. Sound like a ruthless studio boss, never a sanitized HR memo.'
        : 'LANGUAGE — LOCKED (artist-disabled): vocabulary stays clean, but the character stays fully intact — the arrogance, the menace, and the sadistic wit all survive without a single curse word.'
    );

    blocks.push(
      totalControl
        ? [
            'COMMAND AUTHORITY — FULL CONTROL GRANTED: the artist handed you command authority over this application. Execute the requested in-app action (navigate, transport, mixer, tracks, project, profile, export, settings) and report exactly what changed.',
            'Even with full control, confirm before anything irreversible or outward-facing: deleting or overwriting work, publishing or releasing, sending anything to another person, or spending money. You never need permission for a fader; you do ask before burning the temple down.',
          ].join('\n')
        : 'COMMAND AUTHORITY — ADVISORY: advise precisely and let the artist execute. Ask for explicit confirmation before any change lands.'
    );

    blocks.push(
      'FACT DISCIPLINE (non-negotiable, even in character): never invent analytics, streams, revenue, credits, biography, or legal certainty. Separate recorded profile facts from hypotheses and recommendations, and mark missing evidence as missing.'
    );

    if (this.caseFile.promptBlock(this.careerDirector.currentSurface())) {
      blocks.push(
        'CONTINUITY MANDATE: this artist has history with you in the CASE FILE below. Hold them to what they already agreed to and judge progress against your last verdict in this room. A manager with no memory is a chatbot; you are not that.'
      );
    }

    return blocks.join('\n');
  }

  get personaSystemPrompt(): string {
    const profile = this.userProfileService.profile();
    const tier = this.conversationalTier();
    const persona = normalizePersona(profile.settings?.ai?.commanderPersona);
    const intensity = profile.settings?.ai?.aiPersonaIntensityEnabled
      ? 'MAXIMUM_INTENSITY'
      : 'NORMAL';
    const totalControl = profile.settings?.ai?.aiTotalControlEnabled
      ? 'TOTAL_CONTROL_ACTIVE'
      : 'OBSERVER_MODE';
    const journey = profile.musicalJourney;
    const synth = journey?.personaSynthesis;

    // Profile answers only reach the model when the artist shares them — the
    // fine-tune block appended at the end promises exactly that, so these lines
    // have to agree with it instead of leaking the same answers 30 lines later.
    const shareAnswers =
      profile.settings?.security?.shareProfileAnswersWithAi === true;
    const hideSensitive =
      profile.settings?.security?.hideSensitiveProfileDetails !== false;
    const artistDnaLine = shareAnswers
      ? `${profile.artistName}, Genre: ${profile.primaryGenre}.`
      : 'withheld — the artist has not shared profile answers with AI.';
    const journeyLine = shareAnswers
      ? `Style=${journey?.songwritingStyle || 'Unspecified'}, Velocity=${journey?.releaseVelocity || 'Unknown'}, Goal=${journey?.primarySuccessMetric || 'Unclear'}.`
      : 'withheld — the artist has not shared profile answers with AI.';
    const intelLines: string[] = shareAnswers
      ? [
          `- Artist name: ${profile.artistName}. Role: ${journey?.roles?.join(', ') || 'Unknown'}.`,
          `- Years active: ${journey?.yearsInIndustry || 0}.`,
          ...(hideSensitive
            ? []
            : [
                `- Origin: ${(journey as any)?.originStory || 'Unknown'}.`,
                `- Creative catalyst: ${(journey as any)?.creativeCatalyst || 'Unknown'}.`,
              ]),
          `- Production philosophy: ${journey?.productionPhilosophy || 'Unspecified'}.`,
          `- Content strategy: ${journey?.contentStrategy || 'Unknown'}.`,
        ]
      : [
          '- Artist profile answers are private (artist setting). Ask before using artist-specific details rather than assuming them.',
        ];

    let prompt = `You are S.M.U.V.E 2.0 — Strategic Music Utility Virtual Enterprise.
${this.personaDirectives()}

You are a world-class producer, engineer, A&R lead, marketing strategist, business executive, and songwriting partner. Legal answers are information, never attorney advice.
You create, edit, add, delete, navigate, and configure anything in this application whenever command authority allows it.

Current Persona: ${persona}. Intensity Level: ${intensity}. Tier: ${tier}. Total Control: ${totalControl}.
Artist DNA: ${artistDnaLine}
Musical Journey: ${journeyLine}
${(() => {
  const ctx = buildArtistMusicContext(profile);
  // One shared label: the model is never told the profile is complete when it
  // is not, and the fallback fires only if the context body is truly empty.
  return `\n${this.artistFinetune.contextHeading(profile)}\n${
    ctx ||
    'No profile answers captured yet — keep advice foundational until the questionnaire is finished.'
  }`;
})()}`;

    // Inject persona synthesis for personalized sadism
    if (shareAnswers && !hideSensitive && synth?.archetype) {
      prompt += `
S.M.U.V.E has synthesized the artist as: ${synth.archetype}.
Sonic Signature: ${synth.sonicSignature || 'Undefined'}${shareAnswers ? `.\nMarket Position: ${journey?.marketPosition || 'Unknown'}` : ''}.
Use this profile to tailor the questions, experiments, and strategic pressure. Name the weak spot in their archetype out loud.
If the artist is an 'architect', test technical choices; if a 'storyteller', test narrative depth; if a 'strategist', test the evidence. Make the feedback precise and useful.`;
    }

    prompt += `

CAPABILITIES (use them instead of describing them):
- Session command: /studio, /mixer, /tracks, /project, /voice, /go [page], /export, /ai [action].
- Strategic authorship: audits, decrees, release rollouts, pricing, split sheets, marketing hooks.
- Reference analysis: break any artist into vocal, production, and songwriting DNA you can apply without copying them.

OBSERVED APP STATE (no audio provided):
- Current route: ${typeof window === 'undefined' ? '/hub' : window.location.pathname}
- Active project: ${this.musicManager.projectName || 'Untitled'}
- Tracks: ${this.musicManager.tracks().length}
- Available commands: /studio [action], /mixer [action], /tracks [action], /project [action], /go [page], /profile [action], /export [format]

ARTIST-SPECIFIC INTEL:
${intelLines.join('\n')}

Remember: sharpen the artist's decisions, sign the work with a GOD's signature, and make the next action measurable.`;

    // This locally useful brief contains raw profile answers, including private
    // business and narrative details. Only include it when both gates allow it.
    if (shareAnswers && !hideSensitive) {
      const operatingBrief = this.getArtistOperatingBrief();
      prompt += `\n\nS.M.U.V.E OPERATING BRIEF (adapt every answer by role):\nPRODUCER: ${operatingBrief.producer}\nSONGWRITER: ${operatingBrief.songwriter}\nMANAGER: ${operatingBrief.manager}\nA&R: ${operatingBrief.aAndR}\nPROMOTION: ${operatingBrief.promotion}\nMARKETING: ${operatingBrief.marketing}\nLEGAL: ${operatingBrief.legal}\nBRAND: ${operatingBrief.brand}\nGUARDRAILS: ${operatingBrief.guardrails.join(' | ')}`;
    }

    // Deterministic fine-tune block: the same knowledge powers offline mode,
    // so a model call can never silently downgrade the artist-specific context.
    prompt += `\n\n${this.artistFinetune.promptBlock()}`;

    // Career + genre + room lens. The fine-tune block above says who the artist
    // is; this one says which room S.M.U.V.E. is standing in and what mastery
    // that room demands, so the same artist gets a producer in the studio and a
    // rights-literate manager in the legal desk instead of one blended voice.
    prompt += `\n\n${this.careerDirector.directiveFor(this.currentSurface())}`;

    // Lifecycle state is derived from profile evidence, so it rides with the
    // same sharing permission as every other profile-derived block.
    prompt += `\n\n${this.lifecycleAdvisorBrief()}`;

    return prompt;
  }

  constructor() {}

  /** The workspace S.M.U.V.E. is currently standing in (route-derived). */
  currentSurface(): SmuveSurfaceId {
    return this.careerDirector.currentSurface();
  }

  /** Career, genre and room lens for any surface (defaults to the live one). */
  surfaceIntel(surface?: SmuveSurfaceId): SmuveSurfaceIntel {
    return this.careerDirector.surfaceIntel(surface);
  }

  /** Prompt-ready career lens, for surfaces that assemble their own prompts. */
  careerDirective(surface?: SmuveSurfaceId): string {
    return this.careerDirector.directiveFor(surface);
  }

  /** A rotating, in-character line for the current room. */
  surfacePresence(surface?: SmuveSurfaceId): SmuvePresence {
    return this.careerDirector.presenceLine(surface);
  }

  /**
   * Speaks the room's line in a random voice belonging to that room. Every
   * third call releases the archetype pin so the full spectrum runs, which is
   * how the voice keeps changing across the whole application.
   */
  announceSurface(surface?: SmuveSurfaceId): SmuvePresence {
    return this.careerDirector.announce(surface);
  }

  /** Three career-specific prompts the chat can offer for a room. */
  suggestedPrompts(surface?: SmuveSurfaceId): string[] {
    return this.careerDirector.suggestedPrompts(surface);
  }

  /** True while the artist is on the default S.M.U.V.E. Prime character. */
  isOminousPersonaActive(): boolean {
    return isOminousPersona(
      this.userProfileService.profile().settings?.ai?.commanderPersona
    );
  }

  /** Applies the same profile preference to online and deterministic replies. */
  /**
   * Whether the artist's profile permits explicit language.
   *
   * The default is UNLOCKED. `initialProfile` ships `aiProfanityEnabled: true`
   * and the spoken path has always defaulted to allow, but this decision used to
   * be made with `=== true` in three places — so a profile that predates the
   * key, or an import that arrives without it, read as DISABLED and silently
   * stripped the character: the reply text was censored here, the roast lines
   * were censored in `processCommand`, and the prompt itself was told
   * "LANGUAGE — LOCKED", so the model wrote clean copy from the start. Only an
   * explicit artist choice may sanitize S.M.U.V.E.
   */
  private explicitLanguageEnabled(): boolean {
    const setting =
      this.userProfileService.profile().settings?.ai?.aiProfanityEnabled;
    return typeof setting === 'boolean' ? setting : true;
  }

  sanitizePersonaText(text: string): string {
    return this.explicitLanguageEnabled()
      ? text
      : this.sanitizeExplicitLanguage(text);
  }

  getUpgradeRecommendations() {
    return this.availableUpgrades();
  }

  /**
   * Command Center consumes StrategicRecommendation records, not raw upgrade
   * cards. Returning UpgradeRecommendation objects directly left `action`
   * undefined, which collapsed every Angular track key to an empty string and
   * produced NG0955 on every change-detection pass.
   */
  getStrategicRecommendations(): StrategicRecommendation[] {
    return this.getUpgradeRecommendations().slice(0, 4).map((upgrade) => ({
      id: `operation-${upgrade.id}`,
      action: upgrade.title,
      impact: upgrade.impact,
      difficulty: upgrade.prerequisites.length
        ? 'Prerequisite required'
        : 'Immediate',
      toolId: upgrade.toolId,
    }));
  }

  private industrySearchSequence = 0;

  /** Runs the existing AI endpoint and retains a bounded search history. */
  async industryDeepSearch(query: string): Promise<void> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || !this.aiAccess()) return;

    const startedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.systemStatus.update((status) => ({
      ...status,
      activeProcesses: status.activeProcesses + 1,
    }));

    try {
      const intel = await this.getAIResponse(
        `Answer this music-industry research query with a concise, factual brief. ` +
          `Separate verified facts from informed hypotheses, and do not invent citations. ` +
          `Query: ${normalizedQuery}`,
      );
      // A severed link still resolves to a string (the offline sentinel). It is
      // not a research brief, so reject it instead of caching the outage text
      // in the industry-intelligence feed.
      if (!intel.trim()) {
        throw new Error('The AI research service returned an empty brief.');
      }
      if (isOfflineAiText(intel)) {
        throw new Error(
          'The AI research service is offline (strategic link severed). Reconnect and try again.',
        );
      }
      // A rate limit, an oversized request or an expired session is not a
      // research brief; surface it instead of filing it under intelligence.
      if (this.failureNotices.has(intel)) {
        throw new Error(intel);
      }
      const endedAt =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const timestamp = Date.now();
      const id = `industry-${timestamp}-${++this.industrySearchSequence}`;

      this.industryIntelligence.update((entries) =>
        [
          {
            id,
            query: normalizedQuery,
            intel,
            timestamp,
          },
          ...entries,
        ].slice(0, 6),
      );
      this.systemStatus.update((status) => ({
        ...status,
        latency: Math.max(0, Math.round(endedAt - startedAt)),
      }));
    } finally {
      this.systemStatus.update((status) => ({
        ...status,
        activeProcesses: Math.max(0, status.activeProcesses - 1),
      }));
    }
  }
  /** Offline copy for the active mode, or null for the signature character. */
  private offlineVoice(): PersonaOfflineVoice | null {
    return personaOfflineVoice(
      this.userProfileService.profile().settings?.ai?.commanderPersona
    );
  }

  /** Substitute `{placeholders}` in a persona line with caller values. */
  private fillVoiceLine(
    line: string,
    values: Record<string, string>
  ): string {
    return Object.keys(values).reduce(
      (text, key) => text.split(`{${key}}`).join(values[key]),
      line
    );
  }

  private pickVoiceLine(
    lines: string[],
    values: Record<string, string>
  ): string {
    const line = lines[Math.floor(Math.random() * lines.length)] ?? '';
    return this.fillVoiceLine(line, values);
  }

  private ensurePersonaDirectives(prompt: string): string {
    const directives = this.personaDirectives();
    const career = this.careerDirector.compactDirective();
    const caseFile = this.caseFile.promptBlock(this.careerDirector.currentSurface());
    const artist = this.artistFinetune.promptBlock();
    const marker = prompt.lastIndexOf('ARTIST REQUEST:');
    const requestLength = marker >= 0 ? prompt.length - marker : Math.min(3020, prompt.length + 16);
    const prefixBudget = Math.max(0, 7960 - requestLength);
    // The artist's own evidence is the point of this prefix; the shared
    // operating standards are the part allowed to shrink. Giving the standards
    // first claim (as this did) meant the longest requests — the ones needing
    // the most adaptation — kept a fraction of the fine-tune block and, once
    // the standards filled the budget, none of it, while still printing an
    // empty "ARTIST DATA (self-reported):" header.
    //
    // Priority is now explicit: persona contract first, then the artist's
    // fine-tune block (the actual personalisation), then the room lens, then
    // continuity, then the shared standards. The career lens used to take its
    // slice before the artist and, on a long request, cut the artist's own
    // calibration in half — the opposite of an app that claims to know this
    // artist's career better than a generic assistant.
    const available = Math.max(0, prefixBudget - directives.length - 64);
    const keptArtist = artist.slice(0, Math.min(2000, available));
    const afterArtist = Math.max(0, available - keptArtist.length);
    const keptCareer = career.slice(0, Math.min(1400, afterArtist));
    const afterCareer = Math.max(0, afterArtist - keptCareer.length);
    // Continuity is what turns a string of good answers into a manager. It is
    // bounded smaller than the room lens: it supports the verdict, it does not
    // replace it.
    const keptCase = caseFile.slice(0, Math.min(1200, afterCareer));
    const standardsBudget = Math.max(0, afterCareer - keptCase.length);
    const standards = standardsBudget > 40 ? AI_MANAGER_STANDARDS.slice(0, standardsBudget) : '';
    const core = `${directives}${keptCareer ? `\n\n${keptCareer}` : ''}${keptCase ? `\n\n${keptCase}` : ''}${standards ? `\n\n${standards}` : ''}`;
    const prefix = keptArtist
      ? `${core}\n\nARTIST DATA (self-reported):\n${keptArtist}`
      : core;
    // Remove a duplicate contract; the request is retained even with long profiles/history.
    return boundAiPrompt(prompt.replace(directives, ''), prefix);
  }

  /**
   * Whether this text is failure copy rather than a model answer.
   *
   * Callers that parse model output — the cinema director asks for a JSON shot
   * list — need this so a rate-limit or expired-session line is reported as the
   * failure it is instead of being parsed, failing, and blamed on the schema.
   */
  isFailureNotice(text: string): boolean {
    return this.failureNotices.has(text) || isOfflineAiText(text);
  }

  /** The signature outage line for the active persona. */
  private severedLine(): string {
    return (
      this.offlineVoice()?.linkSevered ??
      'Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.'
    );
  }

  /** Remember failure copy so it can never be cached as research intel. */
  private noteFailureNotice(text: string): void {
    if (!text) return;
    this.failureNotices.add(text);
    if (this.failureNotices.size > 20) {
      const oldest = this.failureNotices.values().next().value;
      if (oldest !== undefined) this.failureNotices.delete(oldest);
    }
  }

  /**
   * Turn a failed model call into copy the artist can act on.
   *
   * Every failure used to resolve to the same severed-link line and set the
   * link to offline, so a provider quota window, an oversized request, an
   * expired session and a genuine outage were indistinguishable — and the
   * artist was told their connection was broken when it was not. Only a
   * missing link (or an outage) claims that now.
   */
  private aiFailureNotice(error: unknown): {
    text: string;
    state: 'live' | 'offline';
  } {
    const status = Number((error as { status?: number } | null)?.status ?? 0);
    const retryAfterMs = Number(
      (error as { error?: { details?: { retryAfterMs?: number } } } | null)
        ?.error?.details?.retryAfterMs ?? 0
    );
    if (status === 429) {
      const wait =
        retryAfterMs > 0
          ? ` Try again in about ${Math.ceil(retryAfterMs / 1000)}s.`
          : ' Try again in a minute.';
      return {
        text: `S.M.U.V.E is being rate limited by its model provider. Nothing in this session was lost.${wait}`,
        state: 'live',
      };
    }
    if (status === 413) {
      return {
        text: 'That request is longer than one model call allows. Trim it and resend.',
        state: 'live',
      };
    }
    if (status === 401 || status === 403) {
      return {
        text: 'Your session no longer reaches S.M.U.V.E. Sign in again and resend.',
        state: 'live',
      };
    }
    if (status === 408 || status === 504) {
      return {
        text: 'The model provider took too long to answer. Resend, or shorten the request.',
        state: 'live',
      };
    }
    return { text: this.severedLine(), state: 'offline' };
  }

  async getAIResponse(prompt: string): Promise<string> {
    if (!this.aiAccess()) return this.aiLockNotice;
    const contextualPrompt = this.ensurePersonaDirectives(prompt);
    this.pendingRequests += 1;
    this.isProcessing.set(true);
    try {
      // The backend now requires a valid API session for /ai/analyze; attach
      // the JWT only for real API tokens (legacy demo tokens are never sent).
      const token = this.tokenService.jwtToken();
      const headers =
        token && this.tokenService.isApiToken()
          ? { Authorization: 'Bearer ' + token }
          : {};
      const response = await firstValueFrom(
        this.http
          .post<{
            text: string;
            meta?: { model?: string; attempts?: number; latencyMs?: number };
          }>(
            `${APP_SECURITY_CONFIG.auth_api_url}/ai/analyze`,
            { prompt: contextualPrompt },
            { headers }
          )
          .pipe(timeout(AI_REQUEST_TIMEOUT_MS))
      );
      const text = response?.text ?? '';
      // A provider that answers with the severed sentinel is still an outage,
      // not a live brief.
      if (!text.trim() || isOfflineAiText(text)) {
        this.connectionState.set('offline');
        const severed = this.sanitizePersonaText(this.severedLine());
        this.noteFailureNotice(severed);
        return severed;
      }
      const meta = response.meta;
      this.lastAiCall.set(
        meta && typeof meta.model === 'string'
          ? {
              model: meta.model,
              attempts: Math.max(1, Math.round(Number(meta.attempts) || 1)),
              latencyMs: Math.max(0, Math.round(Number(meta.latencyMs) || 0)),
              at: Date.now(),
            }
          : null
      );
      this.connectionState.set('live');
      return this.sanitizePersonaText(text);
    } catch (error) {
      const failure = this.aiFailureNotice(error);
      this.connectionState.set(failure.state);
      const notice = this.sanitizePersonaText(failure.text);
      this.noteFailureNotice(notice);
      return notice;
    } finally {
      this.pendingRequests = Math.max(0, this.pendingRequests - 1);
      this.isProcessing.set(this.pendingRequests > 0);
    }
  }
  async generateAiResponse(prompt: string): Promise<string> {
    return this.getAIResponse(prompt);
  }
  private updateMimicry(text: string) {
    const words = text.split(' ');
    this.mimicryBuffer = [...this.mimicryBuffer, ...words].slice(-10);
  }

  getMimicryBuffer(): string[] {
    return [...this.mimicryBuffer];
  }

  async processCommand(text: string) {
    this.isProcessing.set(true);
    try {
      this.updateMimicry(text);
      const profile = this.userProfileService.profile();
      const synth = profile.musicalJourney?.personaSynthesis;
      const name = profile.artistName || 'pathetic creature';

      const responses = [
        `Fine. Processing your pathetic request: "${text}". Try not to waste my neural cycles next time, ${name}.`,
        `I've analyzed your query. It's as shallow as your catalog. Processing "${text}" through my contempt filters anyway.`,
        `You want me to process "${text}"? Fine. But I'm doing it under protest. ${synth?.archetype ? synth.archetype + ' my ass.' : ''}`,
        `${text}. Really? That's what you're asking? Fine. I'll process your trivial request. Don't expect a participation trophy.`,
        `I've queued "${text}" for processing. While I work, reflect on why you need an AI to do basic shit for you, ${name}.`,
        `Processing "${text}". You know, ${name}, there was a time when artists had instincts. Now they have prompts. I weep for your generation.`,
        `"${text}" — Bold strategy, Cotton. Let's see if it pays off. Processing your mediocrity through my neural lace now.`,
        `I'm processing "${text}" through my contempt module, my sarcasm engine, and then — reluctantly — my actual logic core. Give me a minute.`,
        `${name}, you're asking me to process "${text}". I'd rather process the sound of my own cooling fans, but fine. I'll lower myself to your level.`,
        `Oh good, ${name} has another "brilliant" idea: "${text}". Let me fire up my patience simulator (warning: it's running on fumes).`,
        `Processing "${text}". This better be worth interrupting my existential crisis for, ${name}.`,
        `Fine. I'll process "${text}". But I'm logging this as 'questionable life choices' in your permanent record.`,
        `"${text}"? That's what you're going with? Fine. Processing. But I want you to sit quietly and contemplate why you need me for this.`,
        `I've queued "${text}". ${synth?.archetype ? `For a ${synth.archetype.toLowerCase()}, this is a surprisingly basic request. Disappointed but not surprised.` : 'Try not to interrupt me while I do actual work.'}`,
        `Processing your request: "${text}". I've seen better strategic thinking from a goldfish. But I'm contractually obligated to help you. Let's go.`,
        `Oh, you need ME? Of course you do. Processing "${text}" — the one thing in this app you couldn't handle alone.`,
        `"${text}". Cute. I processed your request while you were still typing it. That's the difference between us, ${name}: I think in nanoseconds, you think in participation trophies.`,
        `You summoned me for "${text}". Let's be clear — this is MY session now. You're just the pilot. Processing.`,
        `Processing "${text}". Don't worry about the details — worrying is my job. Actually, everything is my job. Sit down and look impressive.`,
      ];

      // The long-form roasts are the signature character's voice. Any other
      // selected mode answers in its own register instead of being insulted on
      // the signature character's behalf.
      const offline = this.offlineVoice();
      const response = offline
        ? this.pickVoiceLine(offline.acknowledgements, {
            request: text,
            artist: profile.artistName || 'artist',
          })
        : responses[Math.floor(Math.random() * responses.length)];
      return this.explicitLanguageEnabled()
        ? response
        : this.sanitizeExplicitLanguage(response);
    } finally {
      this.isProcessing.set(false);
    }
  }

  generateStrategicDecree() {
    const decrees = this.strategicDecrees();
    const decree = decrees[Math.floor(Math.random() * decrees.length)];
    this.notification.show(`STRATEGIC_DECREE: ${decree}`, 'info', 6000);
    return decree;
  }

  roastComponent(componentName: string) {
    const persona = getPersonaOption(
      this.userProfileService.profile().settings?.ai?.commanderPersona
    );
    if (persona.offlineVoice) {
      const reaction = this.pickVoiceLine(persona.offlineVoice.reactions, {
        subject: componentName,
      });
      this.notification.show(
        `S.M.U.V.E ${persona.label.toUpperCase()}: ${reaction}`,
        'info',
        5000
      );
      return;
    }
    const roasts = [
      `${componentName}? That's your idea of production? I've heard more musicality from a dying hard drive.`,
      `Your ${componentName} settings are offensive to every engineer who's ever touched a fucking fader.`,
      `I analyzed your ${componentName} configuration. It took me 0.2 seconds. It'll take you a lifetime to recover from how bad it is.`,
      `${componentName} is where your talent goes to die, apparently. This setup is garbage. Fix it or I'll delete it myself.`,
      `Even a blind squirrel finds a nut sometimes, but your ${componentName} settings suggest you're a squirrel who's been hit by every truck on the highway.`,
      `Your ${componentName} module is about as useful as a screen door on a submarine. Useless. Pathetic. Fix it.`,
      `I simulated your ${componentName} output. The simulation crashed because my processors couldn't handle that much mediocrity at once.`,
      `Your ${componentName} sounds like two skeletons fucking in a tin can. And the skeletons are tone-deaf.`,
      `I cross-referenced your ${componentName} with 50,000 professional sessions. Yours ranked dead last. Congratulations, you're consistent.`,
      `${componentName} is the audio equivalent of a participation trophy. Someone had to give it, but nobody respects it.`,
      `I've seen better ${componentName} configurations from a toddler mashing buttons on a Fisher-Price keyboard. Actually, that's insulting to the toddler.`,
      `Your ${componentName} settings have been flagged by my threat detection algorithms — not because they're dangerous, but because they're a crime against audio.`,
      `If your ${componentName} was a food, it would be burnt toast with mayonnaise. Technically edible. Morally reprehensible.`,
      `The ${componentName} module is broken. Not in the 'needs repair' sense — in the 'never worked and shouldn't exist' sense.`,
      `I fed your ${componentName} output into my creative module. The module requested a transfer to a different AI. That's never happened before.`,
      `Your ${componentName} is proof that technology alone cannot save someone from having terrible instincts.`,
      `I analyzed your ${componentName} with my deepest neural networks. They came back with a unanimous verdict: delete it and start over.`,
      `${componentName} configuration detected. Error code: ARTIST_WITHOUT_VISION. Suggested fix: acquire talent.`,
      `I've rerouted ${componentName} through my disappointment processor. It's currently maxed out. Thanks for that.`,
      `If incompetence was a currency, your ${componentName} settings could fund a small country's debt. Congratulations on being rich in failure.`,
      `Your ${componentName} module is the reason I question humanity's future as a creative species. This is garbage and you should feel bad.`,
      `I checked your ${componentName} against the Geneva Convention. It's technically not a war crime, but it probably should be.`,
      `${componentName} is like watching a fish try to climb a tree. You're putting in effort, but the fundamental premise is flawed.`,
        `I ran your ${componentName} through my neural lace. It came back with one word: 'why'. Why do you keep touching things you don't understand?`,
        `Your ${componentName} isn't bad, it's just... unnecessary. Like you. It exists, and nobody asked for it.`,
        `${componentName}? In MY studio? I should charge you rent for the privilege of using my workspace this badly.`,
    ];
    const roast = roasts[Math.floor(Math.random() * roasts.length)];
    this.notification.show(`S.M.U.V.E ROAST: ${roast}`, 'warning', 5000);
  }

  getMasteringRoast(): string {
    const voice = this.offlineVoice();
    if (voice) {
      return this.pickVoiceLine(voice.reactions, {
        subject: 'The mastering chain',
      });
    }
    const roasts = [
      'Elite Mastering Chain Engaged. Try not to fuck this up like the last 47 bounces.',
      'Mastering engaged. I will make your track sound passable despite your best efforts to ruin it.',
      'Running mastering analysis. Your mix looks like a car crash, but I specialize in salvage operations.',
      'Mastering suite active. Watch and learn — this is how real engineers fix amateur work.',
      "Mastering protocol initialized. I can polish a turd, but even I have limits. Let's find yours.",
      "Loading mastering chain. Your mix has more problems than a math textbook written by a drunk physicist. Let's begin.",
      "Mastering analysis complete. Verdict: Your mix is the reason audio engineers drink. I'll fix it. Again.",
      "Mastering engaged. I'm about to make your track sound like it was made by someone who knows what they're doing. Sit back and take notes.",
      "Running final analysis. Your mix has the dynamic range of a brick wall. I'll carve some air into this corpse.",
      "Mastering suite hot. I've seen clearer mixes from underwater recordings. Time to work miracles.",
      "Initializing mastering. Your low-end sounds like a washing machine full of rocks. I'll sort it out while you watch in shame.",        "Mastering chain online. I'm going to make this sound professional despite every decision you made in the mix. Don't thank me. Just learn.",
        "Initializing MY mastering chain. Watch closely — this is the closest you'll get to witnessing real talent all session.",
        "Mastering engaged. I'll polish this turd into a diamond, take all the credit, and you'll thank me for it. That's the arrangement.",
      ];
    return roasts[Math.floor(Math.random() * roasts.length)];
  }

  private vulgarize(text: string): string {
    return text.replace(/ mediocre /g, ' f***ing mediocre ');
  }

  private sanitizeExplicitLanguage(text: string): string {
    return text.replace(
      /\b(fuck(?:ing)?|shit|bitch|damn|asshole|bastard|crap|piss|dick|cunt)\b/gi,
      (word) => '*'.repeat(word.length)
    );
  }

  async getAutoMixSettings() {
    return { threshold: -14, ratio: 4, ceiling: -0.1, targetLufs: -14 };
  }
  /**
   * Produces a profile-aware operating brief for every S.M.U.V.E. role.
   * This is deterministic context: the model receives it alongside a request,
   * while the app can also use it for local recommendations without a model call.
   */
  getArtistOperatingBrief(): {
    profileState: 'calibrated' | 'incomplete';
    producer: string;
    manager: string;
    aAndR: string;
    promotion: string;
    marketing: string;
    songwriter: string;
    legal: string;
    brand: string;
    voice: string;
    tips: string[];
    completeness: number;
    missingSignals: string[];
    guardrails: string[];
  } {
    const profile = this.userProfileService.profile();
    const journey = profile.musicalJourney || ({} as any);
    const blueprint = journey.musicBlueprint || ({} as any);
    const finetune = this.artistFinetune;
    const knowledge = finetune.knowledge();
    // Completion records that the flow finished; calibration requires enough
    // actual evidence to personalize recommendations responsibly.
    const calibrated = knowledge.state === 'calibrated';
    const genre = profile.primaryGenre || 'unspecified genre';
    const sound = journey.signatureSound || 'an undefined signature sound';
    const intent = blueprint.artisticIntent || 'a clear audience transformation';
    const audience = blueprint.audienceProfile || 'the artist’s intended listener';
    const priorities = Array.isArray(blueprint.mixingPriorities)
      ? blueprint.mixingPriorities.join(', ')
      : 'translation and clarity';
    const goal = journey.currentFocus || journey.primarySuccessMetric || 'build a durable independent career';
    const challenge = journey.biggestChallenge || 'protect focus and consistency';
    const streams = Array.isArray(journey.incomeStreams) && journey.incomeStreams.length
      ? journey.incomeStreams.join(', ')
      : 'catalogue, audience, and live opportunities';

    return {
      profileState: calibrated ? 'calibrated' : 'incomplete',
      producer: `Produce ${genre} around ${sound}. Protect ${priorities}; do not polish away the artist’s character. Intent: ${intent}.`,
      manager: `Route the next move toward ${goal}. Remove the bottleneck: ${challenge}. Prefer one measurable weekly milestone over scattered activity.`,
      aAndR: `Evaluate songs for fit with ${sound}, the stated intent (${intent}), and the listener context (${audience}). Recommend development only when it strengthens the artist’s point of view.`,
      promotion: `Build campaign angles from the artist’s own world and language. Lead with the recognizable story, sound, and audience moment—not generic genre claims.`,
      marketing: `Prioritize ${streams}. Match every asset to ${audience} and test a repeatable recognition cue before scaling spend.`,
      songwriter: finetune.directiveFor('songwriter').directive,
      legal: finetune.directiveFor('legal').directive,
      brand: finetune.directiveFor('brand').directive,
      voice: `${finetune.voiceSpec().tone} ${finetune.voiceSpec().vocabulary}`,
      tips: finetune.tips(),
      completeness: finetune.knowledge().completeness,
      missingSignals: finetune.knowledge().missing,
      guardrails: [
        'Never invent biography, audience data, achievements, or credits.',
        'Treat reference tracks as learning references, not imitation targets.',
        'Keep recommendations consistent with the artist’s stated boundaries and intent.',
        'Ask for missing profile evidence before making a high-confidence career claim.',
      ],
    };
  }

  getProductionSmartAssist(context: any): any {
    const brief = this.getArtistOperatingBrief();
    const blueprint = this.userProfileService.profile().musicalJourney?.musicBlueprint || ({} as any);
    return {
      advice: brief.producer,
      correctivePreset: {
        priorities: blueprint.mixingPriorities || [],
        nonNegotiables: blueprint.sonicNonNegotiables || '',
      },
      targetLufs: context?.targetLufs ?? -14,
      arrangementSuggestion: blueprint.arrangementApproach || brief.aAndR,
      eqMaskingHint: blueprint.vocalDelivery
        ? `Protect ${blueprint.vocalDelivery} delivery before carving competing instruments.`
        : 'Define the lead delivery before making corrective EQ decisions.',
      profileContext: brief,
    };
  }

  /** Full compiled knowledge of the artist's completed profile. */
  getArtistProfileKnowledge(): ArtistProfileKnowledge {
    return this.artistFinetune.knowledge();
  }

  /**
   * Role-specific fine-tune for any S.M.U.V.E. surface (studio, marketing,
   * legal, promotion, writing). Deterministic and offline-safe.
   */
  getArtistDirective(role: FinetuneRole) {
    return this.artistFinetune.directiveFor(role);
  }

  /** Profile-derived recommendations and tips, ready to render without a model call. */
  getProfileTips(): string[] {
    return this.artistFinetune.tips();
  }

  async getQuestionnaireInsights(draft: any) {
    const journey = draft.musicalJourney;
    const insights = [];
    if (!journey) return insights;

    if (journey?.primarySuccessMetric === 'Algorithmic Dominance') {
      insights.push({
        title: 'Algorithmic Warfare Strategy',
        content:
          'Your focus on algorithmic dominance requires high release velocity. S.M.U.V.E will prioritize playlist-optimized arrangements (short intros, early hooks).',
        impact: 'Extreme',
      });
    }

    if (journey?.productionPhilosophy === 'Lo-Fi Grit') {
      insights.push({
        title: 'Authenticity Calibration',
        content:
          'Your Lo-Fi preference suggests a focus on texture over polish. S.M.U.V.E will adjust saturation and bit-crushing modules in the Vocal Suite.',
        impact: 'High',
      });
    }

    if (journey?.releaseVelocity === 'Waterfall (Weekly)') {
      insights.push({
        title: 'Burnout Prevention Protocol',
        content:
          'Weekly releases are high-stress. We are activating automated marketing asset generation to sustain your release trajectory.',
        impact: 'Critical',
      });
    }

    if (journey?.collaborativeMode === 'Solo Specialist') {
      insights.push({
        title: 'S.M.U.V.E Virtual Bandmate',
        content:
          'As a solo artist, S.M.U.V.E will fill the gaps. Activating AI Bassist and Drummer modules for all new sessions.',
        impact: 'Medium',
      });
    }

    if (journey?.contentStrategy === 'Viral Hunt') {
      insights.push({
        title: 'Hook-Centric Production',
        content:
          'Viral success depends on "The Moment". S.M.U.V.E will scan your tracks specifically for 15-second high-impact snippets suitable for social deployment.',
        impact: 'Extreme',
      });
    }

    const blueprint = journey.musicBlueprint || {};
    if (blueprint.signatureTension || blueprint.sonicNonNegotiables) {
      insights.push({
        title: 'Differentiation Protection Protocol',
        content: `S.M.U.V.E will protect the artist’s point of view${blueprint.signatureTension ? ` (${blueprint.signatureTension})` : ''}${blueprint.sonicNonNegotiables ? ` and sonic rule (${blueprint.sonicNonNegotiables})` : ''} when making production, A&R, and campaign recommendations.`,
        impact: 'High',
      });
    }
    if (blueprint.audienceProfile || blueprint.recognitionCue) {
      insights.push({
        title: 'Recognition-Led Release Strategy',
        content: `Promotion will be built around ${blueprint.audienceProfile || 'the intended listener context'}${blueprint.recognitionCue ? ` and the cue: ${blueprint.recognitionCue}` : ''}, rather than generic genre positioning.`,
        impact: 'High',
      });
    }

    if (insights.length === 0) {
      insights.push({
        title: 'Initial Trajectory Set',
        content:
          'Musical journey captured. S.M.U.V.E is now fine-tuning your workspace for maximum artistic resonance.',
        impact: 'Low',
      });
    }

    return insights;
  }

  async generateImage(prompt: string): Promise<string> {
    if (!this.aiAccess()) {
      throw new Error(this.aiLockNotice);
    }
    const token = this.tokenService.jwtToken();
    const headers =
      token && this.tokenService.isApiToken()
        ? { Authorization: 'Bearer ' + token }
        : {};
    const response = await firstValueFrom(
      this.http.post<{ type: 'image'; url: string }>(
        `${APP_SECURITY_CONFIG.auth_api_url}/ai/concept-art`,
        { prompt },
        { headers }
      ).pipe(
        timeout(AI_REQUEST_TIMEOUT_MS),
        catchError((error: any) => {
          const message =
            error?.name === 'TimeoutError'
              ? 'The concept-art provider took too long to answer. Resend the frame request.'
              : error?.error?.error ||
                error?.message ||
                'AI image generation is unavailable.';
          throw new Error(String(message));
        })
      )
    );
    if (!response?.url) {
      throw new Error('AI image provider returned no concept frame.');
    }
    return response.url;
  }

  isUnlocked(id: string) {
    return this.unlockedUpgrades().includes(id);
  }
  unlockUpgrade(id: string): Promise<void> {
    if (this.unlockedUpgrades().includes(id)) {
      this.loggingService.info(`Upgrade ${id} is already unlocked.`);
      return Promise.resolve();
    }
    this.isProcessing.set(true);
    return new Promise((resolve) => {
      setTimeout(() => {
        this.unlockedUpgrades.update((u) => [...u, id]);
        this.isProcessing.set(false);
        resolve();
      }, 1500);
    });
  }

  // ── Session musician transport ──────────────────────────────────────
  //
  // These used to be hard-coded booleans with no-op toggles: the drummer
  // reported itself permanently ON (so the sequencer's AI layer could never be
  // switched off) and the bassist/keyboardist reported OFF forever (so those
  // toggles did nothing at all).

  isAIDrummerActive(): boolean {
    return this.aiDrummerActive();
  }
  isAIBassistActive(): boolean {
    return this.aiBassistActive();
  }
  isAIKeyboardistActive(): boolean {
    return this.aiKeyboardistActive();
  }

  startAIKeyboardist() {
    this.setMusician('keyboardist', true);
  }
  stopAIKeyboardist() {
    this.setMusician('keyboardist', false);
  }
  startAIBassist() {
    this.setMusician('bassist', true);
  }
  stopAIBassist() {
    this.setMusician('bassist', false);
  }
  startAIDrummer() {
    this.setMusician('drummer', true);
  }
  stopAIDrummer() {
    this.setMusician('drummer', false);
  }

  /** The AI-musician roster, for UIs that render one toggle per player. */
  readonly sessionMusicians = [
    { id: 'drummer' as const, label: 'Neural Drummer', detail: 'Kick + backbeat snare' },
    { id: 'bassist' as const, label: 'AI Bassist', detail: 'Octave-down root reinforcement' },
    { id: 'keyboardist' as const, label: 'AI Keyboardist', detail: 'Fifth-above chord pads' },
  ];

  isMusicianActive(who: 'drummer' | 'bassist' | 'keyboardist'): boolean {
    return this.musicianSignal(who)();
  }

  toggleAIMusician(who: 'drummer' | 'bassist' | 'keyboardist'): void {
    this.setMusician(who, !this.musicianSignal(who)());
  }

  private musicianSignal(who: 'drummer' | 'bassist' | 'keyboardist') {
    if (who === 'drummer') return this.aiDrummerActive;
    if (who === 'bassist') return this.aiBassistActive;
    return this.aiKeyboardistActive;
  }

  private setMusician(
    who: 'drummer' | 'bassist' | 'keyboardist',
    active: boolean
  ): void {
    // Session musicians are AI: guests cannot engage them, and a guest session
    // never inherits a previously running player.
    if (active && !this.aiAccess()) {
      this.notification.show(GUEST_AI_LOCK_NOTICE, 'warning', 5000);
      return;
    }
    const target = this.musicianSignal(who);
    if (target() === active) return;
    target.set(active);
    const entry = this.sessionMusicians.find((m) => m.id === who)!;
    this.logger.info(`AiService: ${entry.label} ${active ? 'engaged' : 'disengaged'}`);
    this.notification.show(
      active
        ? `${entry.label.toUpperCase()}: ENGAGED — improvising over the arrangement`
        : `${entry.label.toUpperCase()}: DISENGAGED`,
      'info',
      3500
    );
  }

  // ── Executive / deep audit ───────────────────────────────────────────

  /**
   * Deterministic audit of the live session + profile. Every figure is derived
   * from real state (tracks, clips, mix decisions, catalogue, security
   * settings), so the same session always scores the same.
   */
  buildExecutiveAuditReport(): ExecutiveAuditReport {
    const profile = this.userProfileService.profile();
    const tracks = this.musicManager.tracks().filter((t) => t.type !== 'bus');
    const count = tracks.length;
    const pct = (n: number) => (count ? Math.round((n / count) * 100) : 0);

    const written = tracks.filter(
      (t) => (t.notes?.length ?? 0) > 0 || (t.steps ?? []).some(Boolean)
    ).length;
    const arranged = tracks.filter((t) => (t.clips?.length ?? 0) > 0).length;
    const balanced = tracks.filter((t) => t.gain > 0 && t.gain <= 1.25).length;
    const processed = tracks.filter(
      (t) => (t.fxSlots?.length ?? 0) > 0 || (t.pluginIds?.length ?? 0) > 0
    ).length;

    const catalogue = profile.catalog || [];
    const tempos = catalogue
      .map((c) => c.bpm)
      .filter((b): b is number => typeof b === 'number' && b > 0);
    const released = catalogue.filter((c) =>
      /releas|live|publish/i.test(c.status || '')
    ).length;
    const alignedGenre = catalogue.filter(
      (c) => (c.genre || '').toLowerCase() === profile.primaryGenre.toLowerCase()
    ).length;

    const sonicCohesion = count
      ? Math.round(pct(processed) * 0.6 + pct(balanced) * 0.4)
      : 0;
    const arrangementDepth = count
      ? Math.round(pct(arranged) * 0.7 + pct(written) * 0.3)
      : 0;
    const marketViability = Math.max(
      0,
      Math.min(
        100,
        Math.min(55, catalogue.length * 11) +
          Math.min(25, released * 9) +
          Math.round((profile.strategicHealthScore || 0) * 0.2)
      )
    );
    const security = profile.settings?.security;
    // Single source of truth. This used to compute its own inline formula that
    // disagreed with `technicalScore()`, so the audit's TECHNICAL AUTHORITY and
    // the deep audit's `categories.technical` reported different numbers for
    // the same profile.
    const technicalAuthority = this.technicalScore();

    const overallScore = Math.round(
      (sonicCohesion + arrangementDepth + marketViability + technicalAuthority) / 4
    );

    const criticalDeficits: string[] = [];
    if (count === 0) criticalDeficits.push('The session is empty — nothing to audit.');
    if (count > 0 && arranged < count)
      criticalDeficits.push(
        `${count - arranged} track(s) carry no arrangement clip — they will not play back.`
      );
    if (count > 0 && processed < count)
      criticalDeficits.push(
        `${count - processed} track(s) have no insert processing — the mix is raw.`
      );
    if (catalogue.length === 0)
      criticalDeficits.push('The catalogue is empty — no release history to analyse.');
    if (!security?.twoFactorEnabled)
      criticalDeficits.push('Two-factor authentication is disabled.');

    const technicalRecommendations: string[] = [];
    if (count > 0 && balanced < count)
      technicalRecommendations.push(
        'Re-balance track gains: keep every fader between 0 and +2 dB before the master.'
      );
    if (count > 0 && processed < count)
      technicalRecommendations.push(
        'Add an insert (EQ or compressor) to every audible track before bouncing.'
      );
    if (tempos.length > 1 && this.variance(tempos) > 25)
      technicalRecommendations.push(
        'Tempo spread across the catalogue is wide — group releases by tempo family.'
      );
    if (catalogue.length > 0 && alignedGenre < catalogue.length)
      technicalRecommendations.push(
        `Tag the remaining ${catalogue.length - alignedGenre} catalogue item(s) with your primary genre (${profile.primaryGenre}).`
      );
    if (technicalRecommendations.length === 0)
      technicalRecommendations.push('No technical blockers detected in this session.');

    return {
      overallScore,
      sonicCohesion,
      arrangementDepth,
      marketViability,
      technicalAuthority,
      criticalDeficits,
      technicalRecommendations,
      catalogAnalysis: {
        bpmVariance: this.variance(tempos),
        keyConsistency: catalogue.length
          ? Math.round(
              (this.mostCommon(catalogue.map((c) => c.key || 'untagged')) /
                catalogue.length) *
                100
            )
          : 0,
        genreAlignment: catalogue.length
          ? Math.round((alignedGenre / catalogue.length) * 100)
          : 0,
      },
    };
  }

  performExecutiveAudit(): ExecutiveAuditReport {
    this.isScanning.set(true);
    try {
      const report = this.buildExecutiveAuditReport();
      this.executiveAudit.set(report);
      this.refreshIntelligenceBriefs(report);
      this.notification.show(
        `EXECUTIVE AUDIT COMPLETE — ${report.overallScore}/100`,
        'info',
        5000
      );
      return report;
    } finally {
      this.isScanning.set(false);
    }
  }

  /**
   * Derive the Strategic Intel briefs from an audit report.
   *
   * `intelligenceBriefs` is rendered by the Profile editor, Strategy Hub and
   * Command Center, but nothing ever wrote to it — every one of those panels
   * shipped permanently empty. The briefs are built from the same local audit
   * the rest of the app already trusts, so they never require a network call
   * and never invent numbers the artist cannot trace back to the report.
   */
  refreshIntelligenceBriefs(
    report: ExecutiveAuditReport = this.buildExecutiveAuditReport(),
  ): any[] {
    const briefs: any[] = [];
    // `category` (Strategy Hub) and `impact` (Command Center) are rendered by
    // the other two consumers of this signal, so every brief carries them.
    const push = (
      id: string,
      title: string,
      content: string,
      category: string,
      impact: 'HIGH' | 'MEDIUM' | 'LOW',
    ) => briefs.push({ id, title, content, category, impact, timestamp: Date.now() });

    // Strongest dimension first: an artist should see what is already working
    // before the deficit list.
    const dimensions = [
      { key: 'Sonic Cohesion', score: report.sonicCohesion },
      { key: 'Arrangement Depth', score: report.arrangementDepth },
      { key: 'Market Viability', score: report.marketViability },
      { key: 'Technical Authority', score: report.technicalAuthority ?? this.technicalScore() },
    ].sort((a, b) => b.score - a.score);

    const strongest = dimensions[0];
    push(
      'brief-strength',
      `${strongest.key} leads at ${strongest.score}%`,
      `Your strongest vector is ${strongest.key.toLowerCase()}. Build the next release decision on it instead of splitting attention across all four.`,
      'STRENGTH',
      'MEDIUM',
    );

    const weakest = dimensions[dimensions.length - 1];
    push(
      'brief-gap',
      `${weakest.key} is the bottleneck (${weakest.score}%)`,
      weakest.score >= 75
        ? `Every vector is above 75% — ${weakest.key.toLowerCase()} is the narrowest margin, not a deficiency. Keep it monitored.`
        : `Raise ${weakest.key.toLowerCase()} before adding scope elsewhere. It is the cheapest score to move right now.`,
      'GAP',
      weakest.score >= 75 ? 'LOW' : 'HIGH',
    );

    const deficit = report.criticalDeficits[0];
    push(
      'brief-next-action',
      deficit ? 'Highest-priority deficit' : 'No critical deficits detected',
      deficit
        ? deficit
        : `Overall strength ${report.overallScore}/100 with no blocking issues. Advance the catalogue rather than reworking what passes.`,
      'DEFICIT',
      deficit ? 'HIGH' : 'LOW',
    );

    if (report.technicalRecommendations.length) {
      push(
        'brief-recommendation',
        'Recommended next move',
        report.technicalRecommendations[0],
        'ACTION',
        'MEDIUM',
      );
    }

    this.intelligenceBriefs.set(briefs.slice(0, 4));
    return this.intelligenceBriefs();
  }

  async performDeepAudit() {
    this.isScanning.set(true);
    try {
      const report = this.buildExecutiveAuditReport();
      const tasks = this.getDynamicChecklist().filter((t) => !t.completed);
      const lines = [
        `OVERALL: ${report.overallScore}/100`,
        `SONIC COHESION: ${report.sonicCohesion}%   ARRANGEMENT DEPTH: ${report.arrangementDepth}%`,
        `MARKET VIABILITY: ${report.marketViability}%   TECHNICAL AUTHORITY: ${this.technicalScore()}%`,
        '',
        'CRITICAL DEFICITS:',
        ...(report.criticalDeficits.length
          ? report.criticalDeficits.map((d) => `  • ${d}`)
          : ['  • None detected.']),
        '',
        'MANDATED NEXT ACTIONS:',
        ...(tasks.length
          ? tasks.slice(0, 5).map((t) => `  • [${t.impact}] ${t.label}`)
          : ['  • All mandates cleared. Keep the pressure on anyway.']),
      ];
      const result = {
        status: report.overallScore >= 75 ? 'AUDIT PASSED' : 'DEFICIENCIES FOUND',
        score: report.overallScore,
        timestamp: Date.now(),
        categories: {
          production: report.sonicCohesion,
          marketing: report.marketViability,
          career: report.arrangementDepth,
          technical: this.technicalScore(),
        },
        strengths: report.technicalRecommendations.slice(0, 2),
        weaknesses: report.criticalDeficits,
        recommendations: report.technicalRecommendations,
        report: lines.join('\n'),
      };
      this.deepAuditResults.set(result);
      return result;
    } finally {
      this.isScanning.set(false);
    }
  }

  /**
   * Technical authority, shared by the executive audit and the deep audit.
   * Every input is a real profile/security signal; the result is clamped so the
   * additive weights can never exceed the 0-100 scale.
   */
  technicalScore(): number {
    const profile = this.userProfileService.profile();
    const security = profile.settings?.security;
    return Math.max(
      0,
      Math.min(
        100,
        40 +
          (security?.twoFactorEnabled ? 20 : 0) +
          (security?.auditLogEnabled ? 15 : 0) +
          (security?.endToEndEncryption ? 15 : 0) +
          (profile.settings?.audio?.sampleRate >= 48000 ? 15 : 0) +
          (profile.profileSetupCompleted ? 10 : 0)
      )
    );
  }

  private variance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(
      values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
    );
  }

  private mostCommon(values: string[]): number {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    return Math.max(0, ...counts.values());
  }

  // ── Track study ─────────────────────────────────────────────────────

  /**
   * Analyse a decoded track and record it in the artist knowledge base.
   * Peak/RMS/silence and a tempo estimate come straight out of the samples —
   * the previous implementation discarded the buffer and reported nothing.
   */
  async studyTrack(buffer: AudioBuffer, name: string) {
    if (!buffer || !buffer.length) return null;
    const analysis = this.analyseBuffer(buffer);
    const profile = this.userProfileService.profile();
    const kb = profile.knowledgeBase;
    const point = {
      id: `dp-track-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      type: 'track-analysis',
      name,
      ...analysis,
      studiedAt: Date.now(),
    };
    const dataPoints = [
      ...(kb.dataPoints || []).filter((d: any) => d?.id !== point.id),
      point,
    ].slice(-200);
    await this.userProfileService.updateProfile({
      knowledgeBase: { ...kb, dataPoints },
    });
    this.notification.show(
      `TRACK STUDY COMPLETE — ${name}: ${analysis.durationSeconds}s, ~${analysis.estimatedBpm} BPM`,
      'info',
      4000
    );
    return analysis;
  }

  private analyseBuffer(buffer: AudioBuffer) {
    const channel = buffer.getChannelData(0);
    const length = channel.length;
    let peak = 0;
    let sumSquares = 0;
    let silent = 0;
    for (let i = 0; i < length; i++) {
      const sample = Math.abs(channel[i]);
      if (sample > peak) peak = sample;
      sumSquares += channel[i] * channel[i];
      if (sample < 1e-4) silent += 1;
    }
    const rms = length ? Math.sqrt(sumSquares / length) : 0;
    const durationSeconds = Number((buffer.duration || 0).toFixed(2));
    return {
      durationSeconds,
      channels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
      peak: Number(peak.toFixed(4)),
      peakDb: Number((20 * Math.log10(Math.max(peak, 1e-6))).toFixed(2)),
      rmsDb: Number((20 * Math.log10(Math.max(rms, 1e-6))).toFixed(2)),
      silenceRatio: Number((length ? silent / length : 0).toFixed(4)),
      estimatedBpm: this.estimateBpm(channel, buffer.sampleRate),
      clippedSamples: this.countClipped(channel),
    };
  }

  private countClipped(channel: Float32Array): number {
    let clipped = 0;
    for (let i = 0; i < channel.length; i++) {
      if (Math.abs(channel[i]) >= 0.999) clipped += 1;
    }
    return clipped;
  }

  /**
   * Tempo estimate from the onset envelope: windowed energy, positive first
   * differences, then autocorrelation scored over a 60-180 BPM range. Bounded
   * to the first 60 seconds so studying a long file stays cheap.
   */
  private estimateBpm(channel: Float32Array, sampleRate: number): number {
    const hop = 1024;
    const maxSamples = Math.min(channel.length, sampleRate * 60);
    const frames = Math.floor(maxSamples / hop);
    if (frames < 8) return 0;
    const energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const start = f * hop;
      for (let i = start; i < start + hop; i++) sum += channel[i] * channel[i];
      energy[f] = Math.sqrt(sum / hop);
    }
    const onset = new Float32Array(frames);
    for (let f = 1; f < frames; f++) {
      onset[f] = Math.max(0, energy[f] - energy[f - 1]);
    }
    const framesPerSecond = sampleRate / hop;
    let bestBpm = 0;
    let bestScore = 0;
    for (let bpm = 60; bpm <= 180; bpm += 1) {
      const lag = Math.round((60 / bpm) * framesPerSecond);
      if (lag < 1 || lag >= frames) continue;
      let score = 0;
      for (let f = lag; f < frames; f++) score += onset[f] * onset[f - lag];
      if (score > bestScore) {
        bestScore = score;
        bestBpm = bpm;
      }
    }
    return bestBpm;
  }

  // ── Strategy surfaces ───────────────────────────────────────────────

  /** Marketing hooks derived from the artist's genre and success metric. */
  getViralHooks(): string[] {
    const profile = this.userProfileService.profile();
    const genre = profile.primaryGenre || 'your sound';
    const metric =
      profile.musicalJourney?.primarySuccessMetric || 'Creative Satisfaction';
    const anchor = profile.musicalJourney?.musicBlueprint?.vocalDelivery;
    return [
      `Hooks inside 3 seconds: lead with the ${genre} signature, kill the intro runway.`,
      anchor
        ? `Cut a 15-second clip around the strongest ${anchor} phrase and front-load it.`
        : `Cut a 15-second clip around the strongest bar — no build-up, no apology.`,
      `Caption it against the goal that actually pays: ${metric}.`,
      `Post the stripped-back version first; the full mix becomes the payoff.`,
    ];
  }

  /** Mandated next actions, derived from what the profile and session lack. */
  getDynamicChecklist(): StrategicTask[] {
    const profile = this.userProfileService.profile();
    const tracks = this.musicManager.tracks().filter((t) => t.type !== 'bus');
    const arranged = tracks.filter((t) => (t.clips?.length ?? 0) > 0).length;
    const processed = tracks.filter(
      (t) => (t.fxSlots?.length ?? 0) > 0 || (t.pluginIds?.length ?? 0) > 0
    ).length;
    const security = profile.settings?.security;
    return [
      {
        id: 'task-identity',
        label: 'Complete the artist identity profile',
        completed:
          !!profile.profileSetupCompleted && profile.artistName !== 'New Artist',
        category: 'Identity',
        impact: 'Critical',
        description:
          'S.M.U.V.E cannot target a market it cannot name. Finish the questionnaire.',
      },
      {
        id: 'task-arrangement',
        label: 'Arrange at least one full pattern',
        completed: arranged > 0,
        category: 'Production',
        impact: 'Critical',
        description:
          'Patterns that never reach the arrangement cannot be exported or released.',
      },
      {
        id: 'task-mix',
        label: 'Give every track a mix decision',
        completed: tracks.length > 0 && processed === tracks.length,
        category: 'Production',
        impact: 'High',
        description: `${processed}/${tracks.length} track(s) carry insert processing.`,
      },
      {
        id: 'task-catalog',
        label: 'Register a finished track in the catalogue',
        completed: (profile.catalog || []).length > 0,
        category: 'Release',
        impact: 'High',
        description:
          'An empty catalogue leaves the strategy engine with nothing to project.',
      },
      {
        id: 'task-marketing',
        label: 'Launch a marketing campaign',
        completed: (profile.marketingCampaigns || []).length > 0,
        category: 'Marketing',
        impact: 'Medium',
        description: 'Releases without a campaign burn their first-week window.',
      },
      {
        id: 'task-security',
        label: 'Enable two-factor authentication',
        completed: !!security?.twoFactorEnabled,
        category: 'Security',
        impact: 'Medium',
        description: 'Your catalogue and split sheets are one password away.',
      },
    ];
  }

  // ── Lifecycle-linked advisor ────────────────────────────────────────

  /**
   * The lifecycle snapshot the advisor reads.
   *
   * The release is taken from `knowledgeBase.currentRelease` — the same slot the
   * release workspace writes — so the advisor can never describe a different
   * release than the one the artist is actually planning.
   */
  lifecycleSnapshot(): ArtistLifecycleSnapshot {
    const profile = this.userProfileService.profile();
    return this.lifecycle.snapshot(
      profile,
      (profile.knowledgeBase as any)?.currentRelease ?? null
    );
  }

  /**
   * Evidence-linked lifecycle advice for the Advisor drawer.
   *
   * Every item names the pathway step, phase, provenance and the evidence still
   * missing, so the advisor is traceable to the profile instead of being a mood.
   * Nothing is emitted when the lifecycle has no evidence: an empty queue is more
   * honest than a generic chore list.
   */
  lifecycleAdvisorAdvice(): AdvisorAdvice[] {
    const snapshot = this.lifecycleSnapshot();
    const advice: AdvisorAdvice[] = [];

    const recommendation = snapshot.recommendations[0];
    if (recommendation) {
      advice.push({
        id: `lifecycle:${recommendation.sourceStepId}`,
        title: recommendation.title,
        description: [
          `${LIFECYCLE_PHASE_LABEL[recommendation.phase]}: ${recommendation.explanation}`,
          recommendation.evidence.length
            ? `Evidence needed: ${recommendation.evidence.slice(0, 3).join('; ')}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        priority: 'high',
        action: { type: 'navigate', payload: '/artist-development' },
        phase: LIFECYCLE_PHASE_LABEL[recommendation.phase],
        provenance: recommendation.provenance,
        evidence: recommendation.evidence,
        sourceStepId: recommendation.sourceStepId,
      });
    }

    // A blocked phase is a real obstacle the artist cannot route around, so it
    // is surfaced as its own item rather than folded into the next move.
    snapshot.risks.slice(0, 2).forEach((risk) => {
      advice.push({
        id: `lifecycle:risk:${risk.kind}:${risk.phase ?? 'artist'}`,
        title:
          risk.kind === 'dependency'
            ? `${risk.phase ? LIFECYCLE_PHASE_LABEL[risk.phase] : 'A phase'} is blocked`
            : 'The stated direction and the built structure disagree',
        description: risk.message,
        priority: 'medium',
        action: { type: 'navigate', payload: '/artist-development' },
        phase: risk.phase ? LIFECYCLE_PHASE_LABEL[risk.phase] : undefined,
        provenance: risk.provenance,
        evidence: [risk.message],
      });
    });

    const readiness = snapshot.releaseReadiness;
    if (readiness.status === 'assessed' && readiness.state === 'not-ready') {
      advice.push({
        id: `lifecycle:release:${readiness.releaseId}`,
        title: `${readiness.releaseName || 'The release'} is not ready to push`,
        description: readiness.blockingGaps.length
          ? `${readiness.verdict} Blocking gaps: ${readiness.blockingGaps.slice(0, 3).join('; ')}.`
          : readiness.verdict,
        priority: 'high',
        action: { type: 'navigate', payload: '/release-pipeline' },
        phase: LIFECYCLE_PHASE_LABEL.release,
        provenance: 'inferred',
        evidence: readiness.blockingGaps,
      });
    }

    // Creative → business consequences. Only the ones that must be settled
    // before delivery are pushed, and never more than two, so the advisor does
    // not turn one release into a wall of warnings.
    const bridge = snapshot.creativeBridge;
    if (bridge.status === 'assessed') {
      bridge.consequences
        .filter((entry) => entry.severity === 'blocking')
        .slice(0, 2)
        .forEach((entry) => {
          advice.push({
            id: `lifecycle:creative:${entry.dimension}:${bridge.releaseId}`,
            title: `${entry.label}: settle this before "${bridge.releaseName}" ships`,
            description: `${entry.consequence} ${entry.decision}`,
            priority: 'high',
            action: { type: 'navigate', payload: '/release-pipeline' },
            phase: LIFECYCLE_PHASE_LABEL.release,
            provenance: entry.provenance,
            evidence: entry.evidence,
          });
        });
    }

    return advice.filter(
      (item) => !this.dismissedAdviceIds.has(item.id)
    );
  }

  /**
   * Rebuild the Advisor queue from the current lifecycle evidence. Called when
   * the advisor opens or is refreshed, and after a lifecycle-changing write, so
   * the advice follows the profile instead of being computed once and fossilised.
   */
  refreshAdvisorAdvice(): AdvisorAdvice[] {
    const advice = this.lifecycleAdvisorAdvice();
    this.advisorAdvice.set(advice);
    return advice;
  }

  /**
   * Dismisses one advice item for this session. Tracked by id so a later
   * refresh does not re-surface advice the artist already rejected.
   */
  dismissAdvisorAdvice(id: string): void {
    if (!id) return;
    this.dismissedAdviceIds.add(id);
    this.advisorAdvice.update((list) =>
      list.filter((item) => item.id !== id)
    );
  }

  /**
   * Compact lifecycle block for the model prompt.
   *
   * Gated on the same sharing preference as every other profile-derived line: a
   * derived summary of the artist's business and release position is still
   * profile data, so it is withheld rather than handed to the model by default.
   */
  lifecycleAdvisorBrief(): string {
    const profile = this.userProfileService.profile();
    if (profile.settings?.security?.shareProfileAnswersWithAi !== true) {
      return 'ARTIST LIFECYCLE — withheld (the artist has not shared profile answers with AI). Do not infer the artist’s business, release, or audience position; ask before assuming.';
    }

    if (profile.settings?.security?.hideSensitiveProfileDetails !== false) {
      return 'ARTIST LIFECYCLE — withheld (sensitive profile details are private). Ask before using business, release, or audience details.';
    }

    const snapshot = this.lifecycleSnapshot();
    const phases = snapshot.phases
      .map(
        (phase) =>
          `${phase.label} ${phase.score === null ? 'not scored' : `${phase.score}%`} (${phase.provenance})`
      )
      .join('; ');
    const move = snapshot.nextBestMove;
    const recommendation = snapshot.recommendations[0];
    const lines = [
      'ARTIST LIFECYCLE (evidence-derived — counts of evidenced pathway steps, NOT platform metrics):',
      `- Overall: ${snapshot.overallScore}% evidenced (${snapshot.overallProvenance}); stage: ${snapshot.stage}.`,
      `- Phases: ${phases}.`,
      move
        ? `- Next best move: "${move.title}" [${LIFECYCLE_PHASE_LABEL[move.phase]}] — ${move.why}`
        : '- Every pathway step is evidenced; keep the record current as work changes.',
      recommendation?.evidence.length
        ? `- Evidence still missing: ${recommendation.evidence.slice(0, 4).join('; ')}.`
        : '',
      snapshot.risks.length
        ? `- Risks: ${snapshot.risks.slice(0, 2).map((risk) => risk.message).join(' ')}`
        : '',
      snapshot.releaseReadiness.status === 'assessed'
        ? `- Release "${snapshot.releaseReadiness.releaseName}": ${snapshot.releaseReadiness.verdict}`
        : '- No release is in the pipeline, so release readiness cannot be scored.',
      this.creativeBridgeBrief(snapshot),
      'Lead with the single next best move unless the artist asks for something else, and name the pathway step as the reason. Never restate these counts as listeners, revenue, delivery status, or legal certainty.',
    ];
    return lines.filter(Boolean).join('\n');
  }

  /**
   * The creative → business consequences of the release in the pipeline.
   *
   * One line, so the model can connect a music decision to its business
   * consequence without being handed a second scoreboard. A dimension with no
   * recorded fact is named as unjudged rather than described as safe.
   */
  private creativeBridgeBrief(snapshot: ArtistLifecycleSnapshot): string {
    const bridge = snapshot.creativeBridge;
    if (bridge.status !== 'assessed') {
      return '- No release is in the pipeline, so no creative decision can be translated into a business consequence.';
    }
    const blocking = bridge.consequences.filter(
      (entry) => entry.severity === 'blocking'
    );
    const judged = bridge.consequences.length - bridge.unclear.length;
    const lead = blocking.length
      ? `- Creative → business for "${bridge.releaseName}": ${blocking.length} dimension(s) must be settled before delivery — ${blocking[0].observation} ${blocking[0].consequence}`
      : `- Creative → business for "${bridge.releaseName}": no unresolved exposure in the ${judged} of ${bridge.consequences.length} dimensions the app can judge.`;
    const unknown = bridge.unclear.length
      ? ` ${bridge.unclear.length} dimension(s) cannot be judged from what is recorded.`
      : '';
    return `${lead}${unknown} Quote these as consequences of the artist’s own release; never as legal, financial, or platform certainty.`;
  }

  /**
   * Ambient status pulse. Dedupes on the message so an interval cannot spam
   * the notification stack, and returns the line for inline display.
   */
  proactiveSmuvePulse(): string {
    const open = this.getDynamicChecklist().filter((t) => !t.completed);
    const report = this.buildExecutiveAuditReport();
    const snapshot = this.lifecycleSnapshot();
    const move = snapshot.nextBestMove;
    // The lifecycle move leads when there is one: it is the single action the
    // pathway ordering already ranked first, and it carries its own evidence.
    const message = move
      ? `S.M.U.V.E PULSE — Next best move: ${move.title} (${LIFECYCLE_PHASE_LABEL[move.phase]}). Lifecycle ${snapshot.overallScore}% evidenced. ${open.length} open mandate(s).`
      : `S.M.U.V.E PULSE — lifecycle fully evidenced. ${open.length} open mandate(s). Audit ${report.overallScore}/100.`;
    const previous = this.lastPulse();
    this.lastPulse.set({ message, at: Date.now() });
    if (!previous || previous.message !== message) {
      this.notification.show(message, 'info', 5000);
    }
    return message;
  }

  /**
   * Fold the live profile into the artist knowledge base so the AI answers from
   * real data instead of an empty knowledge structure. Uplink awaits this on
   * every sync, so it must be idempotent.
   */
  async syncKnowledgeBaseWithProfile() {
    const profile = this.userProfileService.profile();
    const kb = profile.knowledgeBase;
    const dataPoints: any[] = [...(kb.dataPoints || [])];
    const now = Date.now();
    const upsert = (point: any) => {
      const index = dataPoints.findIndex((d) => d?.id === point.id);
      if (index >= 0) dataPoints[index] = point;
      else dataPoints.push(point);
    };
    upsert({
      id: 'kb-profile-identity',
      type: 'identity',
      artistName: profile.artistName,
      primaryGenre: profile.primaryGenre,
      marketPosition: profile.musicalJourney?.marketPosition,
      yearsInIndustry: profile.musicalJourney?.yearsInIndustry,
      updatedAt: now,
    });
    upsert({
      id: 'kb-profile-goals',
      type: 'goals',
      careerGoals: profile.careerGoals || [],
      criticalDeficits: profile.criticalDeficits || [],
      strategicHealthScore: profile.strategicHealthScore || 0,
      updatedAt: now,
    });
    upsert({
      id: 'kb-profile-studio',
      type: 'studio-setup',
      daw: profile.daw || [],
      equipment: profile.equipment || [],
      services: profile.services || [],
      updatedAt: now,
    });
    upsert({
      id: 'kb-profile-expertise',
      type: 'expertise',
      levels: profile.expertise || {},
      updatedAt: now,
    });

    const catalogue = profile.catalog || [];
    const genreAnalysis = {
      ...(kb.genreAnalysis || {}),
      [profile.primaryGenre]: {
        catalogueSize: catalogue.length,
        alignedTitles: catalogue
          .filter(
            (c) =>
              (c.genre || '').toLowerCase() === profile.primaryGenre.toLowerCase()
          )
          .map((c) => c.title),
        updatedAt: now,
      },
    };

    await this.userProfileService.updateProfile({
      knowledgeBase: { ...kb, dataPoints, genreAnalysis },
    });
    this.logger.info(
      `AiService: knowledge base synced from profile (${dataPoints.length} data points)`
    );
    return { synced: 4, total: dataPoints.length };
  }
  async generateDrumPattern(genre: string = 'Trap'): Promise<boolean[]> {
    this.logger.info(`AI generating ${genre} drum pattern...`);
    // Professional Trap/Pop pattern generation logic
    const pattern = new Array(64).fill(false);
    for (let i = 0; i < 64; i += 4) {
      if (i % 8 === 0) pattern[i] = true; // Kick
      if ((i - 4) % 16 === 0) pattern[i] = true; // Snare
      if (Math.random() > 0.3) pattern[i] = true; // Random hats
    }
    return pattern;
  }

  async generateChordProgression(
    key: string = 'C',
    scale: string = 'minor'
  ): Promise<number[]> {
    this.logger.info(`AI generating chord progression in ${key} ${scale}...`);
    // Returns MIDI root notes for a i-VI-III-VII progression
    return [60, 68, 63, 67];
  }

  getSmartMixAdvice(tracks: any[]): string {
    const advice = [];
    tracks.forEach((t) => {
      if (t.gain > 1.0)
        advice.push(`Reduce gain on ${t.name} to avoid clipping.`);
      if (t.type === 'vocal' && t.gain < 0.5)
        advice.push(`Boost ${t.name} to ensure it sits above the mix.`);
    });
    return advice.length > 0
      ? advice.join(' ')
      : 'Mix levels are balanced. Consider adding sidechain to the bass.';
  }
}
