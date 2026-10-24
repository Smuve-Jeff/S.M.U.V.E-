import { TestBed } from "@angular/core/testing";
import {
  ChatAppCommandService,
  describeControlOutcome,
  interpretAppRequest,
} from "./chat-app-command.service";
import { SmuveTotalControlService } from "./smuve-total-control.service";
import { UserProfileService } from "./user-profile.service";
import { initialProfile } from "../types/profile.types";
import { signal } from "@angular/core";

/**
 * The interpreter is a pure function on purpose: every mapping and every guard
 * is asserted here without a TestBed, so a future edit that widens the router
 * has to widen these expectations with it.
 */
describe("interpretAppRequest", () => {
  const command = (input: string) => interpretAppRequest(input)?.command;
  const mutating = (input: string) => interpretAppRequest(input)?.mutating;

  it("maps mixer requests onto the supported mixer commands", () => {
    expect(command("mute the bass")).toBe("/mixer mute bass");
    expect(command("please unmute the lead vocal track")).toBe(
      "/mixer unmute lead vocal",
    );
    expect(command("Solo the drums")).toBe("/mixer solo drums");
    expect(command("set the bass volume to 80")).toBe("/mixer volume bass 80");
    expect(command("set my kick level to 65%")).toBe("/mixer volume kick 65");
    expect(command("reset the mixer")).toBe("/mixer reset");
  });

  it("maps track requests onto the supported track commands", () => {
    expect(command("list the tracks")).toBe("/tracks list");
    expect(command("show me the tracks")).toBe("/tracks list");
    expect(command("add a track called Vocoder")).toBe("/tracks add Vocoder");
    expect(command("create a strings track")).toBe("/tracks add strings");
    expect(interpretAppRequest("add a track called Vocoder")?.summary).toBe(
      "add the Vocoder track",
    );
    expect(command("delete the bass track")).toBe("/tracks remove bass");
    expect(command("remove the track called Lead")).toBe("/tracks remove Lead");
  });

  it("maps project, export and module requests onto shipped commands", () => {
    expect(command("save my session")).toBe("/project save");
    expect(command("save")).toBe("/project save");
    expect(command("start a new project")).toBe("/project new");
    expect(command("export as wav")).toBe("/export wav");
    expect(command("bounce to mp3")).toBe("/export mp3");
    expect(command("export my song")).toBe("/export formats");
    expect(command("switch to the mixer")).toBe("/go mixer");
    // Destinations are passed through as typed; the control engine normalises
    // spacing itself ("piano roll" → the /piano-roll route).
    expect(command("pull up the piano roll")).toBe("/go piano roll");
    expect(command("master my track")).toBe("/go mastering");
    expect(command("run a full audit")).toBe("/ai audit");
    expect(command("status")).toBe("/ai status");
    expect(command("make me a split sheet")).toBe("/ai generate-splits");
    expect(command("market intel")).toBe("/ai market-intel");
    expect(command("vocal warmup")).toBe("/vocal warmup");
    expect(command("vocal chain")).toBe("/vocal chain");
    expect(command("open the vocal comp suite")).toBe("/comp");
  });

  it("routes business and marketing requests to the knowledge surface", () => {
    expect(command("plan my release")).toBe("/release");
    expect(command("draft a marketing plan")).toBe("/promo");
    expect(command("promotion")).toBe("/promo");
    expect(command("lesson on sync licensing")).toBe(
      "/knowledge sync licensing",
    );
  });

  it("marks the requests that change the session", () => {
    expect(mutating("mute the bass")).toBe(true);
    expect(mutating("delete the bass track")).toBe(true);
    expect(mutating("save my session")).toBe(true);
    expect(mutating("list the tracks")).toBe(false);
    expect(mutating("export as wav")).toBe(false);
    expect(mutating("run a full audit")).toBe(false);
  });

  it("never executes a question, however command-shaped the words are", () => {
    for (const question of [
      "how do I mute the bass",
      "what is a split sheet",
      "why is my mix muddy",
      "can I export as mp3",
      "should I delete the bass track",
      "explain how to master a track",
      "is my tempo too slow",
    ]) {
      expect(interpretAppRequest(question)).toBeNull();
    }
  });

  it("leaves music creation to the chat-music engine", () => {
    for (const request of [
      "make a beat",
      "add a bass",
      "write me some lyrics",
      "stop the music",
      "make a drum loop",
    ]) {
      // Either the chat-music engine claims it first, or nothing here should
      // claim it: what must never happen is this router turning a music request
      // into a mixer or track edit.
      const intent = interpretAppRequest(request);
      if (intent) expect(intent.command.startsWith("/mixer")).toBe(false);
      expect(intent?.command ?? null).not.toBe("/tracks add bass");
    }
  });

  it("ignores slash commands, incomplete requests and unrelated prose", () => {
    expect(interpretAppRequest("/mixer mute bass")).toBeNull();
    expect(interpretAppRequest("add a track")).toBeNull();
    expect(interpretAppRequest("")).toBeNull();
    expect(interpretAppRequest("thanks, that low end tip worked")).toBeNull();
  });
});

describe("describeControlOutcome", () => {
  const intent = {
    command: "/mixer mute bass",
    summary: "mute bass",
    mutating: true,
  };

  it("answers in S.M.U.V.E. Prime by default and names what ran", () => {
    const outcome = describeControlOutcome(intent, {
      success: true,
      message: "bass: mute applied.",
    });
    expect(outcome.content).toContain("⚡ EXECUTED — mute bass.");
    expect(outcome.content).toContain("bass: mute applied.");
    expect(outcome.success).toBe(true);
  });

  it("gives the signature character the last word on its own confirmations", () => {
    // Every other persona owns an acknowledgement set; the signature persona
    // used to answer in bare "⚡ EXECUTED" status lines, which read as silence.
    const outcome = describeControlOutcome(intent, {
      success: true,
      message: "bass: mute applied.",
    });
    const [statusLine, flourish, ...rest] = outcome.content.split("\n");
    expect(statusLine).toBe("⚡ EXECUTED — mute bass.");
    // Deterministic pick: the same request always answers in the same voice.
    expect(flourish.length).toBeGreaterThan(0);
    expect(flourish).toContain("MY");
    expect(rest.join("\n")).toContain("bass: mute applied.");

    const refusal = describeControlOutcome(intent, {
      success: false,
      message: "no target matched.",
      actionRequired: ["/confirm"],
    });
    const [, refusalFlourish] = refusal.content.split("\n");
    expect(refusalFlourish).toContain("MY");
  });

  it("reports a refusal without pretending the work happened", () => {
    const outcome = describeControlOutcome(intent, {
      success: false,
      message: "Track missing or ambiguous.",
    });
    expect(outcome.content).toContain("⚡ BLOCKED — mute bass.");
    expect(outcome.content).toContain("Track missing or ambiguous.");
    expect(outcome.success).toBe(false);
  });

  it("keeps the confirmation hand-off when the engine asks for /confirm", () => {
    const outcome = describeControlOutcome(intent, {
      success: false,
      message: "Review: delete the bass track.",
      actionRequired: "Confirm with /confirm or cancel with /cancel",
    });
    expect(outcome.content).toContain("/confirm");
    expect(outcome.actionRequired).toContain("/confirm");
  });

  it("gives a non-signature persona its own voice instead of Prime theatre", () => {
    const supportive = describeControlOutcome(
      intent,
      { success: true, message: "bass muted." },
      { personaId: "Supportive", artistName: "Ada" },
    );
    expect(supportive.content).not.toContain("⚡ EXECUTED");
    expect(supportive.content).toContain("mute bass");
    expect(supportive.content).toContain("bass muted.");

    const elite = describeControlOutcome(
      intent,
      { success: false, message: "no such track." },
      { personaId: "Elite" },
    );
    expect(elite.content).toContain("The Elite Commander");
    expect(elite.content).not.toContain("⚡ BLOCKED");
  });
});

describe("ChatAppCommandService", () => {
  let service: ChatAppCommandService;
  const executeCommand = jest.fn();

  beforeEach(() => {
    executeCommand.mockReset();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SmuveTotalControlService,
          useValue: { executeCommand },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile: signal({
              ...initialProfile,
              artistName: "Ada",
              settings: {
                ...initialProfile.settings,
                ai: {
                  ...initialProfile.settings.ai,
                  commanderPersona: "Elite",
                },
              },
            }),
          },
        },
      ],
    });
    service = TestBed.inject(ChatAppCommandService);
  });

  it("executes a recognised request through Total Control, guards included", async () => {
    executeCommand.mockResolvedValue({ success: true, message: "bass muted." });

    const outcome = await service.tryExecute("mute the bass");

    expect(executeCommand).toHaveBeenCalledWith("/mixer mute bass");
    expect(outcome?.success).toBe(true);
    expect(outcome?.content).toContain("bass muted.");
    // The configured persona owns the acknowledgement, not the default one.
    expect(outcome?.content).not.toContain("⚡ EXECUTED");
  });

  it("returns null for a question so the caller can answer it", async () => {
    const outcome = await service.tryExecute("how do I mute the bass");

    expect(outcome).toBeNull();
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
