import { TestBed } from '@angular/core/testing';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import { ArtistPathwayService, AREA_ORDER } from './artist-pathway.service';
import {
  LIFECYCLE_PHASE_AREAS,
  LIFECYCLE_PHASE_LABEL,
  LIFECYCLE_PHASE_ORDER,
} from '../types/artist-lifecycle.types';
import type { UserProfile } from './user-profile.service';
import type { ReleaseProject } from '../types/release.types';

/**
 * The lifecycle is a view over the pathway, so these tests mostly check that it
 * never invents anything: no score without steps, no phase without a home, no
 * "at-risk" that is really just "not started".
 */
describe('ArtistLifecycleService', () => {
  let service: ArtistLifecycleService;
  let pathway: ArtistPathwayService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ArtistLifecycleService] });
    service = TestBed.inject(ArtistLifecycleService);
    pathway = TestBed.inject(ArtistPathwayService);
  });

  /** An artist with no official presence at all. */
  const beginner = (): UserProfile =>
    ({ primaryGenre: 'Hip Hop' }) as unknown as UserProfile;

  /** A strong creative point of view with no infrastructure behind it. */
  const creator = (): UserProfile =>
    ({
      primaryGenre: 'Ambient',
      musicalJourney: {
        signatureSound: 'Tape hiss and bowed metal',
        originStory: 'Recorded field sounds while caring for family.',
        artistNameMeaning: 'A promise to keep moving',
        musicBlueprint: {
          signatureTension: 'stillness versus motion',
          livedWorldDetails: 'kitchen light and train platforms',
          sonicNonNegotiables: 'keep the room tone',
          recognitionCue: 'the room tone before the first note',
          artisticIntent: 'make space for reflection',
        },
      },
    }) as unknown as UserProfile;

  /** An artist with everything the pathway asks for. */
  const official = (): UserProfile =>
    ({
      artistName: 'North Star',
      primaryGenre: 'Ambient',
      location: 'Chicago',
      website: 'https://northstar.example',
      pressGallery: ['press-01.png', 'press-02.png'],
      skills: ['Producer', 'Mixer'],
      brandVoices: ['intimate'],
      strategicGoals: ['grow sync placements', 'sell out a hometown show'],
      performancesPerYear: '22',
      proName: 'ASCAP',
      proIpi: '0011223344',
      equipment: ['Condenser Mic', 'Audio Interface'],
      daw: ['Ableton Live'],
      services: ['Stem delivery'],
      expertise: { production: 6, songwriting: 5, marketing: 3, business: 2, legal: 1, performance: 4 },
      catalog: [
        {
          id: 'w1',
          title: 'Window Light',
          isrc: 'US-AAA-25-00001',
          iswc: 'T-123.456.789-0',
          upc: '00123456789012',
          releaseDate: '2025-02-01',
          releaseType: 'Single',
          distributor: 'DistroKid',
          platforms: ['Spotify', 'Apple Music'],
          credits: 'Written and performed by North Star',
          splitSheetRef: 'SPLIT-2025-01',
        },
      ],
      officialArtistProfiles: [
        {
          id: 'distrokid',
          destinationId: 'distrokid',
          url: 'https://distrokid.com/dashboard',
          verified: true,
        },
        {
          id: 'spotify-for-artists',
          destinationId: 'spotify-for-artists',
          url: 'https://artists.spotify.com/northstar',
          verified: true,
        },
        {
          id: 'chartmetric',
          destinationId: 'chartmetric',
          url: 'https://chartmetric.com/artist/northstar',
          verified: true,
        },
        {
          id: 'ascap',
          destinationId: 'ascap',
          url: 'https://www.ascap.com/northstar',
          verified: true,
        },
        {
          id: 'soundexchange',
          destinationId: 'soundexchange',
          url: 'https://www.soundexchange.com/northstar',
          verified: true,
        },
        {
          id: 'the-mlc',
          destinationId: 'the-mlc',
          url: 'https://www.themlc.com/northstar',
          verified: true,
        },
      ],
      artistIdentity: {
        linkedAccounts: [{ platform: 'Instagram' }, { platform: 'TikTok' }, { platform: 'YouTube' }],
      },
      team: [{ name: 'Rae', role: 'Mixer' }],
      financials: {
        accounts: [{ id: 'acc-1' }],
        monthlyBudget: 250,
        totalRevenue: 400,
        pendingPayouts: 0,
        splitSheets: [],
        revenueHistory: [{ month: '2025-01', amount: 120 }],
      },
      legalInfrastructure: {
        hasRegisteredWorks: true,
        proAffiliation: 'ASCAP',
        hasStandardSplitSheet: 'In Use',
        isIncorporated: true,
        trademarkStatus: 'Filed',
      },
      musicalJourney: {
        originStory: 'Recorded field sounds while caring for family.',
        artistNameMeaning: 'A promise to keep moving',
        signatureSound: 'Tape hiss and bowed metal',
        subgenres: ['drone'],
        musicalInfluences: ['minimalism'],
        productionPhilosophy: 'Leave room for human imperfection',
        songwritingProcess: 'Collect a sound, then find its emotional centre',
        preferredBpmRange: '60-80',
        incomeStreams: ['Streaming', 'Bandcamp'],
        releaseVelocity: 'quarterly',
        primarySuccessMetric: 'repeat listeners',
        contentStrategy: 'studio field notes',
        visualAesthetic: ['monochrome'],
        musicBlueprint: {
          signatureTension: 'stillness versus motion',
          livedWorldDetails: 'kitchen light and train platforms',
          vocalDelivery: 'whispered',
          rhythmicFeel: 'breathing pulse',
          harmonicLanguage: 'open fifths',
          arrangementApproach: 'slow reveal',
          sonicNonNegotiables: 'keep the room tone',
          recordingPriorities: ['natural dynamics'],
          mixingPriorities: ['depth'],
          lyricalThemes: ['distance', 'care'],
          audienceProfile: 'listeners who need quiet focus',
          artisticIntent: 'make space for reflection',
          recognitionCue: 'the room tone before the first note',
        },
      },
    }) as unknown as UserProfile;

  const phasesOf = (profile: UserProfile) =>
    service.snapshot(profile).phases;

  describe('phase model', () => {
    it('gives every pathway area exactly one lifecycle phase', () => {
      const assigned = LIFECYCLE_PHASE_ORDER.flatMap(
        (id) => LIFECYCLE_PHASE_AREAS[id]
      );

      expect(new Set(assigned).size).toBe(assigned.length);
      expect([...assigned].sort()).toEqual([...AREA_ORDER].sort());
    });

    it('labels every phase and keeps the declared order', () => {
      expect(service.snapshot(beginner()).phases.map((phase) => phase.id)).toEqual(
        LIFECYCLE_PHASE_ORDER
      );
      LIFECYCLE_PHASE_ORDER.forEach((id) => {
        expect(LIFECYCLE_PHASE_LABEL[id]).toBeTruthy();
        expect(LIFECYCLE_PHASE_AREAS[id].length).toBeGreaterThan(0);
      });
    });

    it('routes each area to the phase that owns it', () => {
      AREA_ORDER.forEach((area) => {
        expect(LIFECYCLE_PHASE_AREAS[service.phaseForArea(area)]).toContain(area);
      });
    });
  });

  describe('an artist with nothing filled in', () => {
    it('reports every phase as missing instead of scoring it from assumption', () => {
      const phases = phasesOf(beginner());

      phases.forEach((phase) => {
        expect(phase.provenance).toBe('missing');
        expect(phase.score).toBe(0);
        expect(phase.completed).toBe(0);
        expect(phase.confirmed).toEqual([]);
      });
    });

    it('survives a null profile', () => {
      const snapshot = service.snapshot(null);

      expect(snapshot.overallScore).toBe(0);
      expect(snapshot.overallProvenance).toBe('missing');
      expect(snapshot.phases.length).toBe(LIFECYCLE_PHASE_ORDER.length);
      expect(snapshot.provenanceNotes.length).toBeGreaterThan(0);
    });

    it('returns exactly one next move, taken from the pathway ordering', () => {
      const snapshot = service.snapshot(beginner());
      const expected = pathway.readout(beginner()).nextAction;

      expect(snapshot.nextBestMove).not.toBeNull();
      expect(snapshot.nextBestMove!.id).toBe(expected!.step.id);
      expect(snapshot.nextBestMove!.phase).toBe(
        service.phaseForArea(expected!.step.area)
      );
      expect(snapshot.nextBestMove!.action.length).toBeGreaterThan(0);
      expect(snapshot.nextBestMove!.why.length).toBeGreaterThan(0);
    });

    it('never repeats the primary move in the supporting list', () => {
      const snapshot = service.snapshot(beginner());

      expect(snapshot.supportingMoves.length).toBeLessThanOrEqual(3);
      expect(snapshot.supportingMoves.map((move) => move.id)).not.toContain(
        snapshot.nextBestMove!.id
      );
      snapshot.supportingMoves.forEach((move) => {
        expect(LIFECYCLE_PHASE_ORDER).toContain(move.phase);
      });
    });
  });

  describe('risk reporting', () => {
    it('calls a phase at-risk only when another phase is holding it up', () => {
      const snapshot = service.snapshot(beginner());
      const readout = pathway.readout(beginner());

      snapshot.phases.forEach((phase) => {
        const blocked = readout.steps.some(
          (entry) =>
            LIFECYCLE_PHASE_AREAS[phase.id].includes(entry.step.area) &&
            entry.status === 'blocked'
        );
        expect(phase.status).toBe(blocked ? 'at-risk' : 'needs-attention');
        if (blocked) expect(phase.blockedBy.length).toBeGreaterThan(0);
      });
    });

    it('explains each blocked phase as a dependency risk', () => {
      const snapshot = service.snapshot(beginner());
      const blockedPhases = snapshot.phases.filter(
        (phase) => phase.status === 'at-risk'
      );

      expect(blockedPhases.length).toBeGreaterThan(0);
      blockedPhases.forEach((phase) => {
        const risk = snapshot.risks.find(
          (entry) => entry.kind === 'dependency' && entry.phase === phase.id
        );
        expect(risk).toBeDefined();
        expect(risk!.message).toContain(phase.label);
      });
    });

    it('flags a creative profile that is ahead of its infrastructure', () => {
      const snapshot = service.snapshot(creator());
      const mismatch = snapshot.risks.find((risk) => risk.kind === 'mismatch');

      expect(snapshot.differentiationScore).toBeGreaterThan(
        snapshot.overallScore + 20
      );
      expect(mismatch).toBeDefined();
      expect(mismatch!.phase).toBeNull();
      expect(mismatch!.message).toContain('ahead of the structure');
    });
  });

  describe('an artist with everything evidenced', () => {
    it('reports every phase on-track and verified', () => {
      const snapshot = service.snapshot(official());

      expect(snapshot.overallScore).toBe(100);
      expect(snapshot.overallProvenance).toBe('verified');
      expect(snapshot.nextBestMove).toBeNull();
      expect(snapshot.supportingMoves).toEqual([]);
      snapshot.phases.forEach((phase) => {
        expect(phase.status).toBe('on-track');
        expect(phase.score).toBe(100);
        expect(phase.provenance).toBe('verified');
        expect(phase.gaps).toEqual([]);
        expect(phase.blockedBy).toEqual([]);
      });
    });

    it('invents no risk when the work and the story agree', () => {
      const snapshot = service.snapshot(official());

      expect(snapshot.risks).toEqual([]);
      expect(snapshot.summary).toContain('100%');
      expect(snapshot.summary).toContain('Every pathway step is complete');
    });

    it('describes what the numbers cannot know', () => {
      const snapshot = service.snapshot(official());

      expect(snapshot.provenanceNotes.join(' ')).toContain(
        'No streaming, analytics, or royalty feed'
      );
    });
  });

  describe('provenance rules', () => {
    const profiles = [beginner, creator, official];

    it('derives provenance from the phase evidence alone', () => {
      profiles.forEach((build) => {
        phasesOf(build()).forEach((phase) => {
          if (phase.completed === 0 || phase.total === 0) {
            expect(phase.provenance).toBe('missing');
          } else if (phase.completed === phase.total) {
            expect(phase.provenance).toBe('verified');
          } else {
            expect(phase.provenance).toBe('inferred');
          }
        });
      });
    });

    it('never claims a sampled platform signal', () => {
      profiles.forEach((build) => {
        const snapshot = service.snapshot(build());
        snapshot.phases.forEach((phase) => {
          expect(phase.provenance).not.toBe('sampled');
        });
        snapshot.risks.forEach((risk) => {
          expect(risk.provenance).not.toBe('sampled');
        });
      });
    });

    it('keeps phase scores inside 0-100 and consistent with their steps', () => {
      profiles.forEach((build) => {
        phasesOf(build()).forEach((phase) => {
          expect(phase.total).toBeGreaterThan(0);
          expect(phase.completed).toBeLessThanOrEqual(phase.total);
          expect(phase.score).toBe(
            Math.round((phase.completed / phase.total) * 100)
          );
          expect(phase.score! >= 0 && phase.score! <= 100).toBe(true);
          expect(phase.confirmed.length + phase.gaps.length).toBe(phase.total);
        });
      });
    });

    it('keeps the summary anchored to pathway counts', () => {
      const snapshot = service.snapshot(beginner());
      const readout = pathway.readout(beginner());

      expect(snapshot.summary).toContain(
        `${readout.completedSteps} of ${readout.totalSteps}`
      );
      expect(snapshot.summary).toContain(`${readout.overall}%`);
      expect(snapshot.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('release readiness', () => {
    const readyRelease = (): ReleaseProject => ({
      id: 'rel-1',
      name: 'Window Light',
      type: 'Single',
      description: 'One quiet single about leaving.',
      status: 'Planning',
      tracks: [
        {
          id: 'trk-1',
          title: 'Window Light',
          status: 'Completed',
          stages: {
            instrumental: 'Completed',
            lyrics: 'Completed',
            vocals: 'Completed',
            mixing: 'Completed',
            mastering: 'Completed',
          },
        },
      ],
      artworkUrl: 'https://cdn.example/art.png',
      credits: {
        artistName: 'North Star',
        proName: 'ASCAP',
        proIpi: '0011223344',
        collaborators: [],
      },
      marketingCampaignId: 'camp-1',
      createdAt: 1,
      updatedAt: 1,
    });

    it('says there is no release instead of scoring an empty one', () => {
      const snapshot = service.snapshot(beginner());

      expect(snapshot.releaseReadiness.status).toBe('no-release');
      expect(snapshot.releaseReadiness.overallScore).toBeNull();
      expect(snapshot.releaseReadiness.verdict).toContain('No release');
    });

    it('adds readiness without disturbing the pathway view', () => {
      const snapshot = service.snapshot(official(), readyRelease());

      expect(snapshot.releaseReadiness.state).toBe('ready');
      expect(snapshot.overallScore).toBe(100);
      expect(snapshot.nextBestMove).toBeNull();
      expect(snapshot.risks).toEqual([]);
    });
  });
});
