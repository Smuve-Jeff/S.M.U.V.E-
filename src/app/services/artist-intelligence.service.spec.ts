import { ArtistIntelligenceService } from './artist-intelligence.service';
import type { UserProfile } from './user-profile.service';

describe('ArtistIntelligenceService', () => {
  let service: ArtistIntelligenceService;

  beforeEach(() => {
    service = new ArtistIntelligenceService();
  });

  it('identifies missing differentiation without judging the genre', () => {
    const report = service.analyze({ primaryGenre: 'Classical' } as UserProfile);

    expect(report.genreContext).toContain('Classical');
    expect(report.genreContext).toContain('not an identity verdict');
    expect(report.differentiationScore).toBe(0);
    expect(report.weaknesses.join(' ')).toContain('distinguish');
    expect(report.nextBestMoves.length).toBeGreaterThan(0);
  });

  it('recognizes a complete creative fingerprint and journey', () => {
    const report = service.analyze({
      artistName: 'North Star',
      primaryGenre: 'Ambient',
      brandVoices: ['intimate'],
      strategicGoals: ['release'],
      musicalJourney: {
        artistNameMeaning: 'A promise to keep moving',
        originStory: 'I recorded field sounds while caring for my family.',
        firstSong: 'Window Light',
        breakthroughMoment: 'A live audience sang the texture back.',
        subgenres: ['drone'],
        musicalInfluences: ['minimalism'],
        signatureSound: 'Tape hiss, bowed metal, and close-mic breath',
        productionPhilosophy: 'Leave room for human imperfection',
        songwritingProcess: 'Collect a sound, then find its emotional center',
        preferredBpmRange: '60-80',
        incomeStreams: ['sync'],
        releaseVelocity: 'quarterly',
        primarySuccessMetric: 'repeat listeners',
        currentFocus: 'finish the next EP',
        collaborationGoals: ['film'],
        visualAesthetic: ['monochrome'],
        contentStrategy: 'studio field notes',
        musicBlueprint: {
          signatureTension: 'stillness versus motion',
          livedWorldDetails: 'kitchen light and train platforms',
          vocalDelivery: 'whispered',
          rhythmicFeel: 'breathing pulse',
          harmonicLanguage: 'open fifths',
          arrangementApproach: 'slow reveal',
          sonicNonNegotiables: 'keep the room tone',
          recordingPriorities: 'natural dynamics',
          mixingPriorities: 'depth over loudness',
          audienceProfile: 'listeners who need quiet focus',
          artisticIntent: 'make space for reflection',
          recognitionCue: 'the room tone before the first note',
        },
      },
    } as UserProfile);

    expect(report.differentiationScore).toBe(100);
    expect(report.strengths.join(' ')).toContain('distinctiveness core');
    expect(report.evidence.length).toBeGreaterThan(0);
  });
});
