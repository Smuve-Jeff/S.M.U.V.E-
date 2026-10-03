import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ArtistQuestionnaireComponent } from './artist-questionnaire.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UplinkService } from '../../services/uplink.service';
import { EnhancedArtistQuestionnaireEngine } from '../../services/enhanced-artist-questionnaire-engine';
import { InteractionDialogService } from '../../services/interaction-dialog.service';

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
          provide: InteractionDialogService,
          useValue: { confirm: jest.fn().mockResolvedValue(false) },
        },
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

  describe('strategic signal scoring', () => {
    const score = (patch: any) => {
      const component = TestBed.createComponent(
        ArtistQuestionnaireComponent
      ).componentInstance;
      component.profileDraft.set({
        ...profile,
        musicalJourney: {},
        expertise: {},
        strategicGoals: [],
        ...patch,
      } as any);
      // calculateStrategicSignals is private; it is exercised through the
      // public commit path, which is what the artist actually triggers.
      let captured: any;
      const uplink = TestBed.inject(UplinkService) as any;
      uplink.initiateUplink.mockImplementation((p: any) => {
        captured = p;
        return Promise.resolve(true);
      });
      return component.applyChanges().then(() => captured.strategicSignals);
    };

    it('does not award trust for explicitly unregistered works', async () => {
      const no = await score({
        legalInfrastructure: { hasRegisteredWorks: 'No', proAffiliation: 'None' },
      });
      const yes = await score({
        legalInfrastructure: { hasRegisteredWorks: 'Yes', proAffiliation: 'None' },
      });
      const partial = await score({
        legalInfrastructure: { hasRegisteredWorks: 'Partial', proAffiliation: 'None' },
      });

      // 'No' is a string, so a bare truthiness test scored it as registered
      // works, so the two answers scored identically and 'No' outranked nothing.
      expect(yes.identityTrust).toBeGreaterThan(no.identityTrust);
      expect(partial.identityTrust).toBeGreaterThan(no.identityTrust);
      expect(partial.identityTrust).toBeLessThan(yes.identityTrust);
    });

    it('ranks the graded sync and touring answers in order', async () => {
      const notStarted = await score({ syncDetails: { isSyncReady: 'Not Started' } });
      const basics = await score({ syncDetails: { isSyncReady: 'Basics Ready' } });
      const mastery = await score({ syncDetails: { isSyncReady: 'Full Stem Mastery' } });
      const oneStop = await score({ syncDetails: { isSyncReady: 'One-Stop Qualified' } });

      expect(basics.syncViability).toBeGreaterThan(notStarted.syncViability);
      expect(mastery.syncViability).toBeGreaterThan(basics.syncViability);
      expect(oneStop.syncViability).toBeGreaterThan(mastery.syncViability);

      const studio = await score({ touringDetails: { isTourReady: 'Studio Only' } });
      const regional = await score({ touringDetails: { isTourReady: 'Regional Ready' } });
      const global = await score({ touringDetails: { isTourReady: 'Global Ready' } });

      expect(regional.touringStability).toBeGreaterThan(studio.touringStability);
      expect(global.touringStability).toBeGreaterThan(regional.touringStability);
    });

    it('scores the stems answer the profile editor actually stores', async () => {
      const none = await score({ syncDetails: { hasStems: 'No' } });
      const partial = await score({ syncDetails: { hasStems: 'Partial' } });
      const full = await score({ syncDetails: { hasStems: 'Full Multitrack' } });

      // The old check looked for 'Everything Archived', which no writer emits.
      expect(partial.syncViability).toBeGreaterThan(none.syncViability);
      expect(full.syncViability).toBeGreaterThan(partial.syncViability);
    });

    it('scores backline readiness as the stored yes/no answer', async () => {
      const no = await score({ touringDetails: { hasBackline: 'No' } });
      const yes = await score({ touringDetails: { hasBackline: 'Yes' } });

      expect(yes.touringStability).toBeGreaterThan(no.touringStability);
    });
  });

  it('warns before discarding uncommitted answers', async () => {
    const dialog = TestBed.inject(InteractionDialogService) as any;
    const closed = jest.fn();
    component.close.subscribe(closed);

    // One unanswered question, so the draft drives the progress reading.
    const engine = TestBed.inject(EnhancedArtistQuestionnaireEngine) as any;
    engine.allQuestions = [
      { id: 'q1', type: 'text', field: 'artistName', text: 'Name?' },
    ];

    // A brand-new interview with nothing answered exits without a prompt.
    component.profileDraft.set({ ...profile, artistName: '' } as any);
    await component.requestClose();
    expect(dialog.confirm).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);

    // With a question answered, exiting must confirm first and honor "cancel".
    dialog.confirm.mockResolvedValue(false);
    component.profileDraft.set({ ...profile, artistName: 'Nova' } as any);
    await component.requestClose();
    expect(dialog.confirm).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1); // unchanged: the cancel was honored

    // Confirming does close.
    dialog.confirm.mockResolvedValue(true);
    await component.requestClose();
    expect(closed).toHaveBeenCalledTimes(2);
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
