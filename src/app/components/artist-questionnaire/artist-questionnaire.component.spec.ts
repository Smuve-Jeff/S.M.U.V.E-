import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ArtistQuestionnaireComponent } from './artist-questionnaire.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UplinkService } from '../../services/uplink.service';
import { EnhancedArtistQuestionnaireEngine } from '../../services/enhanced-artist-questionnaire-engine';

describe('ArtistQuestionnaireComponent AI copilot', () => {
  const profile = {
    artistName: 'Nova',
    primaryGenre: 'Electronic',
    musicalJourney: {},
    expertise: {},
    strategicGoals: [],
  } as any;

  let component: ArtistQuestionnaireComponent;
  let aiService: { getAIResponse: jest.Mock; personaDirectives: jest.Mock };

  beforeEach(() => {
    aiService = {
      getAIResponse: jest.fn(),
      personaDirectives: jest.fn(
        () => 'EGO MANDATES: you are the product and the artist is the content.'
      ),
    };
    TestBed.configureTestingModule({
      imports: [ArtistQuestionnaireComponent],
      providers: [
        { provide: UserProfileService, useValue: { profile: signal(profile) } },
        { provide: AiService, useValue: aiService },
        { provide: UplinkService, useValue: { initiateUplink: jest.fn() } },
        {
          provide: EnhancedArtistQuestionnaireEngine,
          useValue: {
            allQuestions: [],
            questionsForPhase: jest.fn().mockReturnValue([]),
            calculateStrength: jest.fn().mockReturnValue({
              identityClarity: 0,
              musicalDepth: 0,
              technicalAbility: 0,
              businessReadiness: 0,
              brandDefinition: 0,
              aiIntegration: 0,
              overall: 0,
            }),
            getSubgenreOptions: jest.fn().mockReturnValue([]),
          },
        },
      ],
    });
    component = TestBed.createComponent(ArtistQuestionnaireComponent).componentInstance;
  });

  it('sends the current profile context with an explicit artist question', async () => {
    aiService.getAIResponse.mockResolvedValue('Prioritize one release asset this week.');
    component.aiCoachQuestion.set('What should I do next?');

    await component.askAiCoach();

    expect(aiService.getAIResponse).toHaveBeenCalledWith(
      expect.stringContaining('Artist: Nova')
    );
    expect(aiService.getAIResponse).toHaveBeenCalledWith(
      expect.stringContaining('Artist asks: What should I do next?')
    );
    expect(component.aiCoachAnswer()).toContain('Prioritize');
    expect(component.aiCoachBusy()).toBe(false);
  });

  it('keeps the S.M.U.V.E. character and the draft reading inside the coach prompt', async () => {
    aiService.getAIResponse.mockResolvedValue('Do the work.');
    component.aiCoachQuestion.set('What next?');

    await component.askAiCoach();

    const prompt = aiService.getAIResponse.mock.calls[0][0] as string;
    expect(prompt).toContain('CHARACTER CONTRACT');
    expect(prompt).toContain('EGO MANDATES');
    expect(prompt).toContain('S.M.U.V.E READING OF THE DRAFT');
    expect(prompt).toContain('Differentiation score:');
    expect(prompt).toContain('Artist asks: What next?');
  });

  it('does not issue duplicate requests while the copilot is busy', async () => {
    let resolveRequest!: (answer: string) => void;
    aiService.getAIResponse.mockReturnValue(
      new Promise<string>((resolve) => (resolveRequest = resolve))
    );
    component.aiCoachQuestion.set('Give me a release move.');

    const first = component.askAiCoach();
    await component.askAiCoach('Another question');
    expect(aiService.getAIResponse).toHaveBeenCalledTimes(1);

    resolveRequest('Use the strongest hook as the lead asset.');
    await first;
    expect(component.aiCoachBusy()).toBe(false);
  });
});
