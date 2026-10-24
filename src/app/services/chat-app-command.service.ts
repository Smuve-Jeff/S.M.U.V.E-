import { Injectable, inject } from "@angular/core";
import {
  CommandResult,
  SmuveTotalControlService,
} from "./smuve-total-control.service";
import { UserProfileService } from "./user-profile.service";
import { getPersonaOption, personaOfflineVoice } from "../types/persona.types";

/**
 * Natural-language → Total Control bridge.
 *
 * Why this exists: S.M.U.V.E. could only *execute* what the artist typed as a
 * slash command. "Mute the bass", "save my session", "switch to the mixer" or
 * "export as wav" went to the language model, which — correctly, since it has
 * no hands — answered with a description of the command the artist should type.
 * The persona prompt already promised "when a command would move the session
 * forward, hand it over instead of describing it"; there was no mechanism
 * behind that promise. This is the mechanism.
 *
 * Three rules keep it safe:
 *
 *  1. **Only commands the control engine actually implements** are emitted, so
 *     a mapping can never invent an action. The command string still goes
 *     through `SmuveTotalControlService.executeCommand()`, which means the
 *     Full-Control gate, the guarded-verb confirmation flow (`/confirm`) and
 *     the command history all still apply — this layer can bypass nothing.
 *  2. **Questions are never executions.** Anything opened by an interrogative
 *     word ("how do I mute the bass", "what is a split sheet") is left to the
 *     model, which is the surface that should answer it.
 *  3. **Music creation stays with the chat-music engine.** Beats, basslines,
 *     drums, chords, melodies, lyrics and tempo are handled by
 *     `ChatMusicCommandEngineService` before this router runs, so an ambiguous
 *     "add a bass" keeps creating music rather than renaming a mixer channel.
 */

export interface AppControlIntent {
  /** A command `SmuveTotalControlService` supports. */
  command: string;
  /** Short imperative label the acknowledgement speaks back to the artist. */
  summary: string;
  /** True when running it changes the session (drives the advisory warning). */
  mutating: boolean;
}

export interface AppControlOutcome {
  /** S.M.U.V.E.'s reply, in the active persona's register. */
  content: string;
  success: boolean;
  /** Set when the engine needs something from the artist (usually /confirm). */
  actionRequired?: string;
}

/**
 * Politeness that can precede a real request. Stripped repeatedly so
 * "please can you mute the bass" resolves after two passes.
 */
const POLITE_PREFIX =
  /^(?:hey\s+smuve|smuve|ok(?:ay)?|please|kindly|can you|could you|would you|will you|i need you to|i want you to|i'd like you to|i would like you to)\b[\s,:-]*/;

/**
 * A leading question word means the artist wants an answer, not an action —
 * even when the sentence contains a verb this router knows how to execute.
 */
const QUESTION_LEAD =
  /^(?:how|what|what's|whats|why|when|where|which|who|whose|explain|describe|should|is|are|does|did|do\b|can i|could i|may i|would|will|any)\b/;

function stripPoliteness(raw: string): string {
  let text = raw
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
  for (let pass = 0; pass < 3; pass++) {
    const next = text.replace(POLITE_PREFIX, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * A captured name has to be a name: "add a track" leaves the article behind as
 * the capture, and executing `/tracks add a` would be worse than not acting.
 */
function usableName(value: string): string {
  const trimmed = value.trim();
  return /^(?:a|an|the|new|my|another|some)$/i.test(trimmed) ? "" : trimmed;
}

/** Trailing words an artist adds to a track name ("the bass track"). */
function cleanSubject(value: string): string {
  return value
    .trim()
    .replace(/^(?:the|my|a|an)\s+/i, "")
    .replace(/\s+(?:track|channel|bus)\s*$/i, "")
    .trim();
}

function cleanDestination(value: string): string {
  return value
    .trim()
    .replace(/^(?:the|my)\s+/i, "")
    .replace(/\s+/g, " ");
}

function normalizeExportFormat(value: string): string {
  if (/^waves?$/.test(value)) return "wav";
  if (/^stems?$/.test(value)) return "stems";
  return value.replace(/s$/, "");
}

/**
 * Pure interpreter: free-text request → supported control command, or null when
 * the request is a question, a music-creation request, or simply not an app
 * action. Exported so the mapping is unit-testable without a TestBed.
 */
export function interpretAppRequest(raw: string): AppControlIntent | null {
  if (!raw) return null;
  const original = raw.trim();
  // Slash commands are Total Control's own surface and are routed before this.
  if (!original || original.startsWith("/")) return null;

  // Matching is lower-case, but names are read back from the artist's own
  // spelling: "add a track called Vocoder" must not create "vocoder".
  const stripped = stripPoliteness(original);
  const text = stripped.toLowerCase();
  if (!text || QUESTION_LEAD.test(text)) return null;
  const asTyped = (captured: string): string => {
    const index = text.indexOf(captured);
    return index >= 0
      ? stripped.slice(index, index + captured.length).trim()
      : captured;
  };

  // ── Navigation the chatbot's own route matcher does not already cover ──
  const nav = text.match(
    /^(?:switch to|pull up|bring up|jump to|head to|take me back to|back to|go over to|navigate me to)\s+(?:the\s+)?(.+)$/,
  );
  if (nav) {
    const destination = cleanDestination(nav[1]);
    return {
      command: `/go ${destination}`,
      summary: `open ${destination}`,
      mutating: false,
    };
  }

  // ── Mixer ──────────────────────────────────────────────────────────────
  const toggle = text.match(
    /^(mute|unmute|solo|unsolo|un-solo|un solo)\s+(.+?)(?:\s+(?:track|channel|bus))?$/,
  );
  if (toggle) {
    const verb = toggle[1].replace(/\s+/g, "").replace("un-solo", "unsolo");
    const subject = cleanSubject(asTyped(toggle[2]));
    if (subject) {
      return {
        command: `/mixer ${verb} ${subject}`,
        summary: `${verb} ${subject}`,
        mutating: true,
      };
    }
  }
  const volume = text.match(
    /^(?:set|turn|bring|push)\s+(.+?)(?:'s)?\s+(?:volume|level|fader)\s+(?:up\s+|down\s+)?(?:to\s+)?(\d{1,3})\s*%?$/,
  );
  if (volume) {
    const subject = cleanSubject(asTyped(volume[1]));
    if (subject) {
      return {
        command: `/mixer volume ${subject} ${volume[2]}`,
        summary: `set ${subject} to ${volume[2]}%`,
        mutating: true,
      };
    }
  }
  if (
    /^(?:reset|flatten|zero out|zero)\s+(?:the\s+)?(?:mixer|faders|mix)$/.test(
      text,
    )
  ) {
    return {
      command: "/mixer reset",
      summary: "reset the mixer",
      mutating: true,
    };
  }

  // ── Tracks ─────────────────────────────────────────────────────────────
  if (
    /^(?:list|show|read out|give me|pull up)\s+(?:me\s+)?(?:my\s+|the\s+)?tracks$/.test(
      text,
    )
  ) {
    return {
      command: "/tracks list",
      summary: "list the tracks",
      mutating: false,
    };
  }
  const addTrack =
    text.match(
      /^(?:add|create|make|new)\s+(?:a\s+|an\s+|the\s+)*(?:new\s+)?track\s+(?:called\s+|named\s+)?(.+)$/,
    ) || text.match(/^(?:add|create)\s+(?:a\s+|an\s+)?(.+?)\s+track$/);
  if (addTrack) {
    const name = usableName(cleanSubject(asTyped(addTrack[1])));
    if (name) {
      return {
        command: `/tracks add ${name}`,
        summary: `add the ${name} track`,
        mutating: true,
      };
    }
  }
  const removeTrack =
    text.match(/^(?:delete|remove|kill|drop)\s+(.+?)\s+track$/) ||
    text.match(
      /^(?:delete|remove|kill|drop)\s+(?:the\s+)?track\s+(?:called\s+|named\s+)?(.+)$/,
    );
  if (removeTrack) {
    const name = usableName(cleanSubject(asTyped(removeTrack[1])));
    if (name) {
      return {
        command: `/tracks remove ${name}`,
        summary: `delete the ${name} track`,
        mutating: true,
      };
    }
  }
  if (/^(?:how many tracks)$/.test(text)) return null; // a question in disguise

  // ── Project ────────────────────────────────────────────────────────────
  if (
    /^(?:save|commit)\s+(?:the\s+|my\s+)?(?:project|session|work|song|it)$/.test(
      text,
    ) ||
    text === "save"
  ) {
    return {
      command: "/project save",
      summary: "save the project",
      mutating: true,
    };
  }
  if (
    /^(?:start|begin|create)\s+(?:a\s+)?(?:brand\s+)?new\s+(?:project|session)$/.test(
      text,
    ) ||
    /^(?:new|blank)\s+(?:project|session)$/.test(text)
  ) {
    return {
      command: "/project new",
      summary: "start a new project",
      mutating: true,
    };
  }

  // ── Export ─────────────────────────────────────────────────────────────
  const exportMatch = text.match(
    /^(?:export|bounce|render|print|download)\s*(?:my\s+|the\s+)?(?:song|track|project|mix|beat|session|master)?\s*(?:as\s+|to\s+|in\s+)?(wav|wave|mp3|midi|stems?|backup|formats?)?$/,
  );
  if (exportMatch) {
    const format = exportMatch[1]
      ? normalizeExportFormat(exportMatch[1])
      : "formats";
    return format === "formats"
      ? {
          command: "/export formats",
          summary: "list the export formats",
          mutating: false,
        }
      : {
          command: `/export ${format}`,
          summary: `open export controls for ${format}`,
          mutating: false,
        };
  }

  // ── Mastering / audit / status ─────────────────────────────────────────
  if (
    /^(?:master|mastering)\s*(?:my\s+|the\s+)?(?:track|song|mix|project|session)?$/.test(
      text,
    ) ||
    /^mastering suite$/.test(text)
  ) {
    return {
      command: "/go mastering",
      summary: "open the mastering suite",
      mutating: false,
    };
  }
  if (
    /^(?:run\s+)?(?:an?\s+)?(?:full\s+|deep\s+|project\s+|session\s+|profile\s+)?audit(?:\s+(?:my|the)\s+(?:project|session|profile))?$/.test(
      text,
    )
  ) {
    return {
      command: "/ai audit",
      summary: "run a project audit",
      mutating: false,
    };
  }
  if (/^(?:system\s+|ai\s+|smuve\s+)?status(?:\s+check)?$/.test(text)) {
    return {
      command: "/ai status",
      summary: "report system status",
      mutating: false,
    };
  }
  if (
    /^(?:make|create|generate|prepare|show)\s+(?:me\s+)?(?:a\s+)?split\s*sheets?$/.test(
      text,
    ) ||
    /^splits?$/.test(text)
  ) {
    return {
      command: "/ai generate-splits",
      summary: "draft the split sheet",
      mutating: false,
    };
  }
  if (
    /^(?:market intel(?:ligence)?|market signals|what is the market doing)$/.test(
      text,
    )
  ) {
    return {
      command: "/ai market-intel",
      summary: "pull market intelligence",
      mutating: false,
    };
  }
  if (
    /^(?:sync|refresh|update)\s+(?:the\s+)?(?:kb|knowledge base)$/.test(text)
  ) {
    return {
      command: "/ai sync-kb",
      summary: "sync the knowledge base",
      mutating: false,
    };
  }

  // ── Marketing / release planning ───────────────────────────────────────
  if (
    /^(?:plan|build|make|give me|draft|start)\s+(?:a\s+|my\s+)?(?:release|rollout|release plan|release strategy)$/.test(
      text,
    ) ||
    /^release (?:plan|strategy|calendar)$/.test(text)
  ) {
    return {
      command: "/release",
      summary: "open release strategy",
      mutating: false,
    };
  }
  if (
    /^(?:plan|build|make|give me|draft|start)\s+(?:a\s+|my\s+)?(?:promo|promotion|marketing|marketing plan|promo plan)$/.test(
      text,
    ) ||
    /^(?:promo|promotion|marketing)(?:\s+(?:plan|strategy))?$/.test(text)
  ) {
    return {
      command: "/promo",
      summary: "open promotion strategy",
      mutating: false,
    };
  }

  // ── Vocal surface ──────────────────────────────────────────────────────
  const vocal = text.match(
    /^(?:start\s+)?(?:a\s+)?vocal\s+(warm\s?up|warm-up|tips|technique|chain|signal chain)$/,
  );
  if (vocal) {
    const action = /chain/.test(vocal[1])
      ? "chain"
      : /tips|technique/.test(vocal[1])
        ? "tips"
        : "warmup";
    return {
      command: `/vocal ${action}`,
      summary: `vocal ${action}`,
      mutating: false,
    };
  }
  if (
    /^(?:open|start|pull up)\s+(?:the\s+)?(?:vocal\s+)?comp(?:ing)?(?:\s+(?:suite|view))?$/.test(
      text,
    ) ||
    /^(?:open|start|pull up)\s+(?:the\s+)?vocal suite$/.test(text)
  ) {
    return {
      command: "/comp",
      summary: "open the vocal comp suite",
      mutating: false,
    };
  }

  // ── Lessons on the curated knowledge base ──────────────────────────────
  const lesson = text.match(
    /^(?:lesson on|teach me about|teach me|learn about|study)\s+(.+)$/,
  );
  if (lesson) {
    const topic = asTyped(lesson[1]).trim();
    if (usableName(topic)) {
      return {
        command: `/knowledge ${topic}`,
        summary: `pull the knowledge on ${topic}`,
        mutating: false,
      };
    }
  }

  return null;
}

/** Deterministic pick so the same request always answers in the same voice. */
function pickLine(lines: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return lines[hash % lines.length];
}

function fillVoice(
  line: string,
  vars: { request: string; artist: string; subject: string },
): string {
  return line
    .replace(/\{request\}/g, vars.request)
    .replace(/\{artist\}/g, vars.artist)
    .replace(/\{subject\}/g, vars.subject);
}

/**
 * The signature character's own flourish for the two bare outcomes. Every
 * other persona owns an acknowledgement set, while Prime's confirmations were
 * the only lines in the product with no character in them at all — which read
 * as silence, not restraint. Picked deterministically from the request so the
 * same command always answers in the same voice.
 */
const PRIME_SUCCESS_FLOURISHES = [
  'Filed under things I made look effortless: this one, on MY clock.',
  'Of course it worked — MY execution does not need your faith.',
  'Done. Take notes; that is how MY systems behave when the request is merely adequate.',
  'Executed flawlessly. MY standards did the carrying again.',
];

const PRIME_FAILURE_FLOURISHES = [
  'Blocked. Even MY miracles need a real target — bring one.',
  'Not executed. Even MY patience has a noise floor, and you just found it.',
  'Denied. Fix the request, then present it to ME like you intend to deserve MY answer.',
];

/**
 * Formats a control result in the active persona's register. Modes other than
 * the signature character answer with their own acknowledgement lines, so an
 * artist on Elite or Supportive is not congratulated in S.M.U.V.E. Prime's
 * voice; Prime's own lines live here because the deterministic sets that
 * predate this router are written in it.
 */
export function describeControlOutcome(
  intent: AppControlIntent,
  result: CommandResult,
  options: { personaId?: string | null; artistName?: string } = {},
): AppControlOutcome {
  const persona = getPersonaOption(options.personaId);
  const voice = personaOfflineVoice(persona.id);
  const artist = options.artistName?.trim() || "artist";
  const vars = { request: intent.summary, artist, subject: intent.summary };

  let head: string;
  if (voice) {
    head = result.success
      ? fillVoice(pickLine(voice.acknowledgements, intent.summary), vars)
      : `${persona.name}: that request did not complete.`;
  } else {
    const flourish = pickLine(
      result.success ? PRIME_SUCCESS_FLOURISHES : PRIME_FAILURE_FLOURISHES,
      intent.summary,
    );
    head = result.success
      ? `⚡ EXECUTED — ${intent.summary}.\n${flourish}`
      : `⚡ BLOCKED — ${intent.summary}.\n${flourish}`;
  }

  const confirmation = result.actionRequired?.includes("/confirm")
    ? "\n\nS.M.U.V.E. does not authorise itself: type /confirm to execute this exact request, or /cancel."
    : "";

  return {
    content: `${head}\n${result.message}${confirmation}`,
    success: result.success,
    actionRequired: result.actionRequired,
  };
}

/** Executes what the interpreter recognises, through the existing control engine. */
@Injectable({ providedIn: "root" })
export class ChatAppCommandService {
  private control = inject(SmuveTotalControlService);
  private userProfile = inject(UserProfileService, { optional: true });

  /**
   * Returns null when the request is not an app action, so the caller can fall
   * through to the model and the knowledge base.
   */
  async tryExecute(input: string): Promise<AppControlOutcome | null> {
    const intent = interpretAppRequest(input);
    if (!intent) return null;
    const result = await this.control.executeCommand(intent.command);
    const profile = this.userProfile?.profile();
    return describeControlOutcome(intent, result, {
      personaId: profile?.settings?.ai?.commanderPersona,
      artistName: profile?.artistName,
    });
  }
}
