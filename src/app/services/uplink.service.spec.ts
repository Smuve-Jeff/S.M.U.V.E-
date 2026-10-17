import { TestBed } from '@angular/core/testing';
import { UplinkService } from './uplink.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import { ArtistIdentityService } from './artist-identity.service';
import { AiService } from './ai.service';
import { LoggingService } from './logging.service';
import { EnhancedArtistQuestionnaireEngine } from './enhanced-artist-questionnaire-engine';

const SYNTHESIS = {
  archetype: 'The Architect — precision-driven, technically focused creator',
  signatureTone: 'You communicate with calculated precision and authority.',
  sonicSignature: 'warped tape 808s with choir pads',
  marketPosition: 'Emerging',
  aiPersonaProfile: 'S.M.U.V.E recognizes you as: The Architect.',
  recommendedStrategy: 'Priority: ship the EP.',
  suggestedGenres: ['Ambient', 'Lo-Fi'],
  productionAphorism: 'Craft separates artists from producers.',
};

function makeProfile(): any {
  return JSON.parse(
    JSON.stringify({
      ...initialProfile,
      artistName: 'Nova Vale',
      primaryGenre: 'Electronic',
      musicalJourney: {
        ...initialProfile.musicalJourney,
        signatureSound: 'warped tape 808s with choir pads',
      },
    })
  );
}

describe('UplinkService', () => {
  let service: UplinkService;
  let profile: any;
  let updateProfile: jest.Mock;
  let synthesizePersona: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    profile = makeProfile();
    updateProfile = jest.fn(async (patch: any) => {
      profile = { ...profile, ...patch };
    });
    synthesizePersona = jest.fn(async () => ({ ...SYNTHESIS }));

    TestBed.configureTestingModule({
      providers: [
        UplinkService,
        {
          provide: UserProfileService,
          useValue: { profile: () => profile, updateProfile },
        },
        {
          provide: ArtistIdentityService,
          useValue: { refreshIdentityGraph: jest.fn(async (p: any) => p) },
        },
        {
          provide: AiService,
          useValue: {
            syncKnowledgeBaseWithProfile: jest.fn(async () => ({
              synced: 4,
              total: 4,
            })),
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: EnhancedArtistQuestionnaireEngine,
          useValue: { synthesizePersona },
        },
      ],
    });
    service = TestBed.inject(UplinkService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function runUplink(): Promise<boolean> {
    const pending = service.initiateUplink(profile);
    for (let i = 0; i < 8; i++) {
      await jest.advanceTimersByTimeAsync(1000);
    }
    return pending;
  }

  it('commits the synthesized reading with the completed profile', async () => {
    await expect(runUplink()).resolves.toBe(true);

    expect(synthesizePersona).toHaveBeenCalledTimes(1);
    const committed = updateProfile.mock.calls[0][0];
    expect(committed.musicalJourney.personaSynthesis).toEqual({
      archetype: SYNTHESIS.archetype,
      signatureTone: SYNTHESIS.signatureTone,
      sonicSignature: SYNTHESIS.sonicSignature,
      aiPersonaProfile: SYNTHESIS.aiPersonaProfile,
      recommendedStrategy: SYNTHESIS.recommendedStrategy,
      suggestedGenres: SYNTHESIS.suggestedGenres,
      productionAphorism: SYNTHESIS.productionAphorism,
    });
    // The reading is the proof the questionnaire ran — it must be reported.
    expect(service.status().logs.some((log) => log.includes('S.M.U.V.E READ'))).toBe(
      true
    );
    expect(service.status().message).toContain('READ: The Architect');
  });

  it('still commits the artist’s answers when the reading fails', async () => {
    synthesizePersona.mockRejectedValueOnce(new Error('synthesis offline'));

    await expect(runUplink()).resolves.toBe(true);

    const committed = updateProfile.mock.calls[0][0];
    expect(committed.artistName).toBe('Nova Vale');
    expect(committed.musicalJourney.personaSynthesis).toBeUndefined();
    expect(service.status().stage).toBe('complete');
    expect(service.status().error).toBeUndefined();
  });

  it('refuses an unnamed profile before touching the reading', async () => {
    profile = { ...profile, artistName: 'New Artist' };

    await expect(service.initiateUplink(profile)).resolves.toBe(false);
    expect(synthesizePersona).not.toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(service.status().logs.some((log) => log.includes('VALIDATION_ERROR'))).toBe(
      true
    );
  });
});
