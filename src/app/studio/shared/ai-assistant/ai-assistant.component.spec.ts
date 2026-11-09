import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { AiAssistantComponent } from "./ai-assistant.component";
import { SpeechRecognitionService } from "../../../services/speech-recognition.service";
import { SpeechSynthesisService } from "../../../services/speech-synthesis.service";
import { AiService } from "../../../services/ai.service";
import {
  UserProfileService,
  initialProfile,
} from "../../../services/user-profile.service";
import { MusicManagerService } from "../../../services/music-manager.service";
import { AudioEngineService } from "../../../services/audio-engine.service";
import { ProjectWorkspaceService } from "../../project-workspace.service";
import { AiCopilotService } from "../../ai-copilot.service";
import { NeuralMixerService } from "../../../services/neural-mixer.service";
import { HapticService } from "../../../services/haptic.service";
import { SnackbarService } from "../../../services/snackbar.service";
import { StudioAiDirectorService } from "../../studio-ai-director.service";
import { StudioOrchestrationService } from "../../../services/studio-orchestration.service";
import { readProjectFile } from "../../project-archive.util";

jest.mock("../../project-archive.util", () => ({
  readProjectFile: jest.fn(),
}));

const readProjectFileMock = readProjectFile as jest.Mock;

describe("AiAssistantComponent voice communication", () => {
  let recognition: any;
  let synthesis: any;
  let profileService: any;
  let orchestration: any;
  let ai: any;
  let director: any;

  beforeEach(async () => {
    recognition = {
      isSupported: jest.fn(() => true),
      isListening: jest.fn(() => false),
      capability: jest.fn(() => "ready"),
      capabilityMessage: jest.fn(() => "Microphone unavailable"),
      startListening: jest.fn(),
      stopListening: jest.fn(),
    };
    orchestration = { setActiveStudioView: jest.fn() };
    profileService = {
      profile: jest.fn(() => ({
        ...initialProfile,
        settings: {
          ...initialProfile.settings,
          ai: {
            ...initialProfile.settings.ai,
            commanderPersona: "S.M.U.V.E. Prime",
          },
        },
      })),
    };
    ai = {
      personaDirectives: jest.fn(
        () => "PERSONA — S.M.U.V.E. Prime: be theatrical and precise.",
      ),
      getAIResponse: jest.fn().mockResolvedValue("Live reply."),
      sanitizePersonaText: jest.fn((text: string) => text),
      getSmartMixAdvice: jest.fn(() => ""),
    };
    synthesis = {
      speak: jest.fn(),
      cancel: jest.fn(),
      isSupported: jest.fn(() => true),
      isSpeaking: jest.fn(() => false),
      outputCapability: jest.fn(() => "ready"),
      liveVoice: jest.fn(() => null),
    };
    await TestBed.configureTestingModule({
      imports: [AiAssistantComponent],
      providers: [
        { provide: SpeechRecognitionService, useValue: recognition },
        { provide: SpeechSynthesisService, useValue: synthesis },
        { provide: AiService, useValue: ai },
        { provide: UserProfileService, useValue: profileService },
        {
          provide: MusicManagerService,
          useValue: {
            selectedTrack: jest.fn(() => null),
            selectedTrackId: jest.fn(() => null),
            tracks: jest.fn(() => []),
            structure: jest.fn(() => []),
          },
        },
        {
          provide: AudioEngineService,
          useValue: { tempo: jest.fn(() => 120) },
        },
        {
          provide: ProjectWorkspaceService,
          useValue: { metadata: jest.fn(() => null) },
        },
        {
          provide: AiCopilotService,
          useValue: { suggestStructure: jest.fn() },
        },
        {
          provide: NeuralMixerService,
          useValue: { applyNeuralMix: jest.fn() },
        },
        {
          provide: HapticService,
          useValue: { light: jest.fn(), medium: jest.fn() },
        },
        {
          provide: SnackbarService,
          useValue: { success: jest.fn(), error: jest.fn() },
        },
        { provide: StudioOrchestrationService, useValue: orchestration },
        { provide: Router, useValue: { navigate: jest.fn(() => Promise.resolve(true)) } },
        {
          provide: StudioAiDirectorService,
          useValue: (director = {
            buildPlan: jest.fn(() => ({
              surfaceId: "arrangement",
              title: "Arrangement Director Plan",
              mission: "Make the session coherent.",
              successCriteria: ["Done."],
              evidence: ["1 track"],
              steps: [],
            })),
            createStudioBrief: jest.fn().mockResolvedValue("Director brief."),
            sessionEvidence: jest.fn(() => [
              "Transport loop: steps 1-16.",
              "Last Director run: export 8/11 completed, 3 failed.",
            ]),
            runPlan: jest.fn().mockResolvedValue({ report: [], failed: 0 }),
            runStep: jest.fn().mockResolvedValue({ ok: true, message: "ok" }),
            lastDirectorRun: jest.fn(() => null),
            listDirectorRuns: jest.fn(() => []),
            clearDirectorRuns: jest.fn(),
            exportRunReport: jest.fn(() => "Exported Director run report."),
            listCheckpoints: jest.fn(() => [
              {
                id: "cp-2",
                label: "Before drums",
                at: 2000,
                isFullSnapshot: false,
                hasBundle: true,
                detail: "Full bundle · Test Project · 1 track",
              },
            ]),
            restoreCheckpoint: jest.fn().mockResolvedValue("Restored checkpoint Before drums."),
            exportCheckpointBundle: jest.fn(() => "Exported checkpoint Before drums."),
            exportProjectBundle: jest.fn(() => "Exported project bundle."),
            importProjectBundle: jest.fn().mockResolvedValue("Imported project bundle."),
            canUndoDirectorAction: jest.fn(() => false),
            canRedoDirectorAction: jest.fn(() => false),
          }),
        },
      ],
    }).compileComponents();
  });

  it("builds the chat prompt from live Director evidence", () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    const prompt = (component as any).buildContextualPrompt("export the loop");
    expect(prompt).toContain("Transport loop: steps 1-16.");
    expect(prompt).toContain("Last Director run: export 8/11 completed, 3 failed.");
    expect(director.sessionEvidence).toHaveBeenCalled();
  });

  it("runs drum and mastering quick actions through real Director steps", async () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    director.buildPlan.mockReturnValue({
      surfaceId: "drum-machine",
      title: "Drum Machine Director Plan",
      mission: "",
      successCriteria: [],
      evidence: [],
      steps: [
        {
          id: "drum-machine-3",
          surfaceId: "drum-machine",
          label: "Run one EVOLVE variation",
          detail: "",
          executable: true,
          run: jest.fn(),
        },
      ],
    });
    director.runStep.mockResolvedValue({ ok: true, message: "EVOLVE variation applied." });

    const message = await (component as any).runDirectorStepFor(
      "drum-machine",
      "Run one EVOLVE variation",
    );
    expect(message).toBe("EVOLVE variation applied.");
    expect(director.buildPlan).toHaveBeenCalledWith({ surfaceId: "drum-machine" });
    expect(director.runStep).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Run one EVOLVE variation" }),
    );
  });

  it("routes chat intents to safe Director steps", async () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance as any;
    director.buildPlan.mockReturnValue({
      surfaceId: "export",
      title: "Export Director Plan",
      mission: "",
      successCriteria: [],
      evidence: [],
      steps: [
        {
          id: "export-9",
          surfaceId: "export",
          label: "Export the transport loop as WAV",
          detail: "",
          executable: true,
          run: jest.fn(),
        },
      ],
    });
    director.runStep.mockResolvedValue({ ok: true, message: "Loop WAV exported." });

    const actions = component.suggestActionsFor("export the loop as wav");
    expect(actions).toContainEqual({ id: "director-loop-wav", label: "Export loop WAV" });
    await component.runAssistantAction(actions[0]);
    expect(director.buildPlan).toHaveBeenCalledWith({ surfaceId: "export" });
    expect(director.runStep).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Export the transport loop as WAV" }),
    );
    expect(component.messages().at(-1).text).toBe("Loop WAV exported.");
  });

  it("hands the Director plan off to the selected Studio surface", () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    component.openDirectorSurface("mixer");
    expect(orchestration.setActiveStudioView).toHaveBeenCalledWith("mixer");
  });

  it("moves recognized speech into editable chat input without sending it", () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    component.toggleVoiceInput();
    expect(recognition.startListening).toHaveBeenCalledTimes(1);
    recognition.startListening.mock.calls[0][0]("  lower the bass  ");
    expect(component.userInput()).toBe("lower the bass");
    expect(
      component.messages().some((message: any) => message.role === "user"),
    ).toBe(false);
  });

  it("stops listening on a second toggle and exposes unavailable reasons", () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    recognition.isListening.mockReturnValue(true);
    component.toggleVoiceInput();
    expect(recognition.stopListening).toHaveBeenCalled();

    recognition.isListening.mockReturnValue(false);
    recognition.isSupported.mockReturnValue(false);
    recognition.capability.mockReturnValue("unsupported");
    component.toggleVoiceInput();
    expect(component.voiceNotice()).toBe("Microphone unavailable");
    expect(recognition.startListening).not.toHaveBeenCalled();
  });

  it("injects the selected persona into the Studio prompt and header identity", async () => {
    profileService.profile.mockReturnValue({
      ...initialProfile,
      settings: {
        ...initialProfile.settings,
        ai: { ...initialProfile.settings.ai, commanderPersona: "Supportive" },
      },
    });
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    expect(component.personaName()).toBe("The Encouraging Mentor");
    component.userInput.set("How do I improve my bass?");
    await component.sendMessage();
    const prompt = ai.getAIResponse.mock.calls[0][0] as string;
    expect(prompt).toContain("You are The Encouraging Mentor");
    expect(prompt).toContain("You are the Encouraging Mentor");
  });

  it("labels the studio prompt with the shared calibration heading", async () => {
    profileService.profile.mockReturnValue({
      ...initialProfile,
      settings: {
        ...initialProfile.settings,
        security: { shareProfileAnswersWithAi: true },
      },
    });
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    component.userInput.set("How do I improve my bass?");
    await component.sendMessage();

    const prompt = ai.getAIResponse.mock.calls[0][0] as string;
    // One heading across chat, this panel and the model system prompt — the
    // old line claimed full artist context with an unreachable fallback.
    expect(prompt).toContain("ARTIST PROFILE CONTEXT");
    expect(prompt).not.toContain("Profile incomplete; ask concise calibration questions");
    expect(prompt).toContain("ARTIST REQUEST: How do I improve my bass?");
  });

  it("recognizes offline replies in any persona casing", async () => {
    ai.getAIResponse.mockResolvedValue("Strategic link severed. Offline analysis continues.");
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    component.userInput.set("How do I improve my bass?");
    await component.sendMessage();
    expect(component.aiMode()).toBe("local");
    expect(component.messages().at(-1)?.text).not.toContain("Strategic link severed");
  });

  it("uses the selected persona for deterministic offline advice", () => {
    profileService.profile.mockReturnValue({
      ...initialProfile,
      settings: {
        ...initialProfile.settings,
        ai: { ...initialProfile.settings.ai, commanderPersona: "Supportive" },
      },
    });
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    expect((component as any).composeReply("mix")).toContain(
      "has real potential",
    );
    expect((component as any).composeReply("mix")).not.toContain(
      "if you have any ears",
    );
  });

  it("speaks assistant replies and lets the artist stop playback", () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    component.readAssistantMessage("The bass is masking the kick.");
    expect(synthesis.speak).toHaveBeenCalledWith(
      "The bass is masking the kick.",
      // Per-sentence voice rotation is the permanent S.M.U.V.E. identity, so
      // the studio panel shifts entity too — it used to pin one stable voice.
      expect.objectContaining({
        conversationId: expect.any(String),
        shapeShift: true,
      }),
    );
    component.stopVoiceOutput();
    expect(synthesis.cancel).toHaveBeenCalled();
  });

  it("shows Director checkpoints and restores the selected one", async () => {
    (window as any).confirm = jest.fn(() => true);
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    expect(component.directorCheckpoints()).toHaveLength(1);
    expect(component.directorCheckpoints()[0].label).toBe("Before drums");

    await component.restoreCheckpointById("cp-2", "Before drums");
    expect(director.restoreCheckpoint).toHaveBeenCalledWith("cp-2");
    expect(component.directorStatus()).toContain("Restored checkpoint");
  });

  it("exports a selected checkpoint bundle and the open project bundle", () => {
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;

    component.exportCheckpointBundle("cp-2", "Before drums");
    expect(director.exportCheckpointBundle).toHaveBeenCalledWith("cp-2");

    component.exportCurrentProjectBundle();
    expect(director.exportProjectBundle).toHaveBeenCalled();
  });

  it("imports a selected .smuve file through the Director", async () => {
    const file = new File(["bundle"], "set.smuve");
    readProjectFileMock.mockResolvedValue({
      metadata: { id: "project-2", name: "Imported Set" },
      tracks: [],
    });
    const fixture = TestBed.createComponent(AiAssistantComponent);
    const component = fixture.componentInstance;
    const input = document.createElement("input");
    Object.defineProperty(input, "files", { value: [file] });

    await component.onDirectorBundleFile({ target: input } as Event);
    expect(readProjectFileMock).toHaveBeenCalledWith(file);
    expect(director.importProjectBundle).toHaveBeenCalled();
    expect(component.directorStatus()).toContain("Imported");
  });
});
