import { TestBed } from "@angular/core/testing";
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

describe("AiAssistantComponent voice communication", () => {
  let recognition: any;
  let synthesis: any;
  let profileService: any;
  let ai: any;

  beforeEach(async () => {
    recognition = {
      isSupported: jest.fn(() => true),
      isListening: jest.fn(() => false),
      capability: jest.fn(() => "ready"),
      capabilityMessage: jest.fn(() => "Microphone unavailable"),
      startListening: jest.fn(),
      stopListening: jest.fn(),
    };
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
      ],
    }).compileComponents();
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
});
