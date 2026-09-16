import { TestBed } from '@angular/core/testing';
import {
  ArtistPathwayService,
  AREA_LABEL,
  AREA_MEANS,
  AREA_ORDER,
} from './artist-pathway.service';
import { ArtistIdentityService } from './artist-identity.service';
import type { UserProfile } from './user-profile.service';

/**
 * The pathway has one job: take an artist with nothing online and give them the
 * correct next move, in order, without ever skipping a prerequisite.
 */
describe('ArtistPathwayService', () => {
  let service: ArtistPathwayService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ArtistPathwayService] });
    service = TestBed.inject(ArtistPathwayService);
  });

  /** An artist with no official presence at all — the primary audience. */
  const beginner = (): UserProfile =>
    ({ primaryGenre: 'Hip Hop' }) as unknown as UserProfile;

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

  describe('coverage', () => {
    it('covers every area of music exactly once', () => {
      expect(AREA_ORDER.length).toBe(8);
      expect(new Set(AREA_ORDER).size).toBe(8);
      AREA_ORDER.forEach((area) => {
        expect(AREA_LABEL[area]).toBeTruthy();
        expect(AREA_MEANS[area]).toBeTruthy();
      });
    });

    it('defines every area with at least two ordered steps', () => {
      AREA_ORDER.forEach((area) => {
        const steps = service.steps.filter((step) => step.area === area);
        expect(steps.length).toBeGreaterThanOrEqual(2);
        const orders = steps.map((step) => step.order).sort((a, b) => a - b);
        expect(orders).toEqual(steps.map((_, index) => index + 1));
      });
    });

    it('gives every step prose, actions, evidence, effort, and cost', () => {
      service.steps.forEach((step) => {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.outcome.length).toBeGreaterThan(0);
        expect(step.why.length).toBeGreaterThan(0);
        expect(step.actions.length).toBeGreaterThan(0);
        expect(step.evidence.length).toBeGreaterThan(0);
        expect(['one sitting', 'days', 'weeks']).toContain(step.effort);
        expect(['free', 'low', 'paid']).toContain(step.cost);
      });
    });

    it('never references a dependency that does not exist', () => {
      const ids = new Set(service.steps.map((step) => step.id));
      service.steps.forEach((step) => {
        step.requires.forEach((required) => expect(ids.has(required)).toBe(true));
        expect(step.requires).not.toContain(step.id);
      });
    });

    it('keeps the pathway mostly free, because beginners have no budget', () => {
      const free = service.steps.filter((step) => step.cost === 'free');
      expect(free.length / service.steps.length).toBeGreaterThan(0.6);
    });
  });

  describe('a beginner with no presence', () => {
    it('starts with nothing complete and a single ready next action', () => {
      const readout = service.readout(beginner());

      expect(readout.stage).toBe('getting-started');
      expect(readout.completedSteps).toBe(0);
      expect(readout.overall).toBe(0);
      expect(readout.officialAreas).toEqual([]);
      expect(readout.unofficialAreas.length).toBe(8);
      expect(readout.nextAction).not.toBeNull();
      expect(readout.nextAction?.status).toBe('ready');
    });

    it('leads with identity or craft, not with royalties', () => {
      const next = service.readout(beginner()).nextAction!;
      expect(['identity', 'craft']).toContain(next.step.area);
      expect(next.step.title).toBe('Lock the official artist name');
    });

    it('never hands a beginner a step whose prerequisites are unmet', () => {
      const readout = service.readout(beginner());
      readout.steps
        .filter((entry) => entry.status !== 'complete')
        .forEach((entry) => {
          if (entry.status === 'ready' || entry.status === 'in-progress') {
            expect(entry.blockedBy).toEqual([]);
          }
        });
    });

    it('does not offer dashboards, analytics, or PRO registration before a release', () => {
      const readout = service.readout(beginner());
      const byId = new Map(readout.steps.map((entry) => [entry.step.id, entry]));

      ['presence-for-artists', 'presence-analytics', 'presence-distributor'].forEach((id) => {
        const entry = byId.get(id);
        expect(entry?.status).toBe('blocked');
        expect(entry?.blockedBy.length).toBeGreaterThan(0);
      });

      // Nothing ready should mention verifying an account or reading analytics.
      const readyText = readout.steps
        .filter((entry) => entry.status === 'ready')
        .map((entry) => `${entry.step.title} ${entry.step.outcome}`)
        .join(' ')
        .toLowerCase();
      expect(readyText).not.toMatch(/verif|analytics|dashboard|royalt/);
    });

    it('explains exactly which evidence each step is still waiting on', () => {
      const readout = service.readout(beginner());
      const name = readout.steps.find((entry) => entry.step.id === 'identity-name')!;
      expect(name.status).toBe('ready');
      expect(name.needs).toEqual(['Save the artist name on the profile.']);

      const delivery = readout.steps.find((entry) => entry.step.id === 'release-delivery')!;
      expect(delivery.status).toBe('blocked');
      expect(delivery.blockedBy.length).toBeGreaterThan(0);
    });

    it('treats a saved name as the one and only thing a name-only artist has done', () => {
      const readout = service.readout({
        artistName: 'First Take',
        primaryGenre: 'Hip Hop',
      } as unknown as UserProfile);

      expect(readout.completedSteps).toBe(1);
      expect(readout.stage).toBe('building');
      expect(
        readout.steps.find((entry) => entry.step.id === 'identity-name')?.status
      ).toBe('complete');
      expect(service.area('identity', { artistName: 'x' } as any).standing).toBe(
        'in-progress'
      );
    });

    it('reports every area as not yet official with its outstanding work listed', () => {
      const readout = service.readout(beginner());
      expect(readout.officialAreas).toEqual([]);
      readout.areas.forEach((area) => {
        expect(area.standing).toBe('unofficial');
        expect(area.score).toBe(0);
        expect(area.completed).toBe(0);
        expect(area.outstanding.length).toBe(area.total);
      });
    });

    it('gives a short, ordered today list', () => {
      // The queue holds only work the artist can act on now, never padded with
      // blocked steps to hit a length. A brand-new artist has few open doors.
      const today = service.todayList(beginner());
      expect(today.length).toBeGreaterThan(0);
      expect(today.length).toBeLessThanOrEqual(3);
      expect(new Set(today).size).toBe(today.length);
      today.forEach((title) => expect(service.steps.some((s) => s.title === title)).toBe(true));

      // Once doors have opened, the queue fills to its limit.
      const named = { ...(beginner() as any), artistName: 'Named' } as UserProfile;
      expect(service.todayList(named).length).toBeGreaterThan(1);
      expect(service.todayList(named).length).toBeLessThanOrEqual(3);
    });
  });

  describe('a fully official artist', () => {
    it('reports every area official with no next action', () => {
      const readout = service.readout(official());

      const incomplete = readout.steps
        .filter((entry) => entry.status !== 'complete')
        .map((entry) => `${entry.step.id}: ${entry.needs.join(', ')}`);

      expect(incomplete).toEqual([]);
      expect(readout.overall).toBe(100);
      expect(readout.stage).toBe('official');
      expect(readout.nextAction).toBeNull();
      expect(readout.officialAreas.length).toBe(8);
      expect(readout.parallelActions).toEqual([]);
    });

    it('marks each area official and leaves nothing outstanding', () => {
      service.readout(official()).areas.forEach((area) => {
        expect(area.standing).toBe('official');
        expect(area.score).toBe(100);
        expect(area.outstanding).toEqual([]);
      });
    });
  });

  describe('evidence gating', () => {
    it('does not accept a self-declared PRO of "None"', () => {
      const profile: any = official();
      profile.legalInfrastructure = { ...profile.legalInfrastructure, proAffiliation: 'None' };
      profile.proName = '';
      profile.proIpi = '';
      const entry = service
        .readout(profile)
        .steps.find((step) => step.step.id === 'rights-pro')!;
      expect(entry.status).not.toBe('complete');
      expect(entry.needs.join(' ')).toMatch(/PRO/);
    });

    it('refuses to verify a dashboard that has not been verified', () => {
      const profile: any = official();
      profile.officialArtistProfiles = profile.officialArtistProfiles.map((link: any) =>
        link.destinationId === 'spotify-for-artists' ? { ...link, verified: false } : link
      );
      const entry = service
        .readout(profile)
        .steps.find((step) => step.step.id === 'presence-for-artists')!;
      expect(entry.status).toBe('in-progress');
      expect(entry.needs.join(' ')).toMatch(/verif/i);
    });

    it('requires a verified link in each separate category', () => {
      const profile: any = official();
      // Remove only the analytics link; everything else stays official.
      profile.officialArtistProfiles = profile.officialArtistProfiles.filter(
        (link: any) => link.destinationId !== 'chartmetric'
      );
      const readout = service.readout(profile);
      const analytics = readout.steps.find((s) => s.step.id === 'presence-analytics')!;
      expect(analytics.status).not.toBe('complete');
      expect(readout.officialAreas).not.toContain('presence');
    });

    it('treats a documented work as release-metadata complete and a blank one as not', () => {
      const profile: any = official();
      profile.catalog = [{ id: 'w1', title: 'Bare' }];
      const entry = service
        .readout(profile)
        .steps.find((step) => step.step.id === 'release-metadata')!;
      expect(entry.status).toBe('ready');
      expect(entry.needs).toEqual(
        expect.arrayContaining(['the release type', 'the credits', 'a split sheet reference'])
      );

      const done = service
        .readout(official())
        .steps.find((step) => step.step.id === 'release-metadata')!;
      expect(done.status).toBe('complete');
      expect(done.needs).toEqual([]);
    });

    it('counts a performance as complete only above zero', () => {
      const profile: any = official();
      profile.performancesPerYear = '0';
      const none = service
        .readout(profile)
        .steps.find((step) => step.step.id === 'audience-first-show')!;
      expect(none.status).toBe('ready');

      const some = service
        .readout(official())
        .steps.find((step) => step.step.id === 'audience-first-show')!;
      expect(some.status).toBe('complete');
    });

    it('requires a real payout account, not just a PRO', () => {
      const profile: any = official();
      profile.financials = { ...profile.financials, accounts: [] };
      const entry = service
        .readout(profile)
        .steps.find((step) => step.step.id === 'money-accounts')!;
      expect(entry.status).toBe('in-progress');
    });
  });

  describe('reaching official in one area unlocks the next', () => {
    it('turns a blocked step into a ready one as its prerequisite completes', () => {
      const before = service.readout(beginner());
      expect(
        before.steps.find((entry) => entry.step.id === 'release-metadata')?.status
      ).toBe('blocked');

      const withWork: any = beginner();
      withWork.musicalJourney = {};
      withWork.catalog = [{ id: 'w1', title: 'First' }];
      const after = service.readout(withWork);
      const metadata = after.steps.find((entry) => entry.step.id === 'release-metadata')!;
      expect(metadata.status).toBe('ready');
      expect(metadata.blockedBy).toEqual([]);
    });

    it('moves the recommendation forward as evidence arrives', () => {
      const started = service.readout(beginner());
      const named = service.readout({ artistName: 'First Take' } as any);

      expect(started.nextAction?.step.id).toBe('identity-name');
      // Once the name is locked the recommendation advances rather than repeating.
      expect(named.nextAction?.step.id).not.toBe('identity-name');
      expect(named.overall).toBeGreaterThan(started.overall);
      expect(service.readout(official()).nextAction).toBeNull();
    });

    it('ranks a partially finished step above an untouched one in the today list', () => {
      const profile: any = beginner();
      profile.artistName = 'Named';
      profile.musicalJourney = { originStory: 'Started on a borrowed keyboard.' };
      const today = service.todayList(profile);
      // identity-name is complete, so the in-progress story step should appear.
      expect(today).toContain('Write the story only this artist can tell');
      expect(today).not.toContain('Lock the official artist name');
    });
  });

  describe('robustness', () => {
    it('never throws on an empty, null, or hostile profile', () => {
      expect(() => service.readout(null)).not.toThrow();
      expect(() => service.readout(undefined)).not.toThrow();
      expect(() => service.readout({} as UserProfile)).not.toThrow();
      expect(() =>
        service.readout({
          catalog: 'nope',
          team: 5,
          officialArtistProfiles: {},
          financials: 'bad',
          legalInfrastructure: null,
          musicalJourney: 'bad',
          expertise: 'bad',
        } as any)
      ).not.toThrow();
    });

    it('still returns the full pathway for a garbage profile', () => {
      const readout = service.readout({ catalog: 7 } as any);
      expect(readout.steps.length).toBe(service.steps.length);
      expect(readout.areas.length).toBe(8);
      expect(readout.nextAction).not.toBeNull();
    });

    it('exposes single-area views that agree with the full readout', () => {
      const full = service.readout(official());
      AREA_ORDER.forEach((area) => {
        const scoped = service.area(area, official());
        const fromFull = full.areas.find((entry) => entry.area === area)!;
        expect(scoped).toEqual(fromFull);
        expect(service.areaSteps(area, official()).length).toBe(scoped.total);
      });
    });

    it('resolves real destinations for the steps that have one', () => {
      const withDestination = service.steps.filter((step) => step.destinationId);
      expect(withDestination.length).toBeGreaterThan(0);
      withDestination.forEach((step) => {
        const destination = service.destination(step.destinationId);
        expect(destination).not.toBeNull();
        expect(destination?.url).toMatch(/^https:\/\//);
      });
      expect(service.destination(undefined)).toBeNull();
      expect(service.destination('not-a-real-destination')).toBeNull();
    });

    it('reports actionable steps that are all genuinely unblocked', () => {
      const actionable = service.actionable(beginner());
      expect(actionable.length).toBeGreaterThan(0);
      actionable.forEach((entry) => expect(entry.blockedBy).toEqual([]));
    });
  });

  /**
   * Guards, not behaviour tests. Each one exists because a specific class of
   * defect shipped through this service: evidence read from a field no control
   * writes, a self-contradicting priority order, a step pointing at a surface
   * with no field, and synthetic connector rows counted as real accounts.
   */
  describe('guards', () => {
    /**
     * The identity service synthesises one row per connector, so an artist who
     * holds no accounts at all still carries a full `linkedAccounts` array with
     * fabricated handles and follower counts. Any step that treated that array
     * as evidence marked itself complete for a beginner. This builds a genuine
     * first-run artist through the real identity builder and demands that
     * nothing at all is already official.
     */
    it('marks nothing complete for a first-run artist with a real identity snapshot', () => {
      const identity = TestBed.inject(ArtistIdentityService);
      const firstRun = {
        ...(beginner() as any),
        artistIdentity: identity.buildIdentitySnapshot(beginner()),
      } as UserProfile;

      // The synthetic rows really are present, which is what makes this guard
      // meaningful rather than vacuous.
      expect(firstRun.artistIdentity.linkedAccounts.length).toBeGreaterThan(0);

      const readout = service.readout(firstRun);
      expect(
        readout.steps
          .filter((entry) => entry.status === 'complete')
          .map((entry) => entry.step.id)
      ).toEqual([]);
      expect(readout.overall).toBe(0);
      expect(readout.areas.every((area) => area.standing === 'unofficial')).toBe(
        true
      );
    });

    /**
     * Every step must name a surface that really has a control for its evidence.
     * `money-accounts` and `money-budget` read the financial record, and the
     * profile builder only ever displayed those fields — so the hub has to own
     * them or the two steps are unreachable from any screen.
     */
    it('gives every step a real record surface, and keeps the money steps in the hub', () => {
      const surfaces = ['profile', 'questionnaire', 'hub'];
      service.steps.forEach((step) => {
        expect(surfaces).toContain(service.recordIn(step));
      });

      expect(
        service.steps
          .filter((step) => service.recordIn(step) === 'hub')
          .map((step) => step.id)
          .sort()
      ).toEqual(['money-accounts', 'money-budget']);

      // Both money steps require the financial record, never a fabricated one.
      ['money-accounts', 'money-budget'].forEach((id) => {
        const step = service.steps.find((entry) => entry.id === id)!;
        expect(step.evidence).toMatch(/account|budget|revenue/i);
      });
    });

    it('has a requires graph that resolves, contains no cycle, and strands nothing', () => {
      const ids = new Set(service.steps.map((step) => step.id));
      service.steps.forEach((step) => {
        step.requires.forEach((id) => expect(ids.has(id)).toBe(true));
      });

      const byId = new Map(service.steps.map((step) => [step.id, step]));
      const visiting = new Set<string>();
      const visited = new Set<string>();
      const walk = (id: string): void => {
        if (visited.has(id)) return;
        expect(visiting.has(id)).toBe(false);
        visiting.add(id);
        (byId.get(id)?.requires || []).forEach(walk);
        visiting.delete(id);
        visited.add(id);
      };
      service.steps.forEach((step) => walk(step.id));

      expect(visited.size).toBe(service.steps.length);
    });

    /**
     * A link on the wrong step sends an artist to the wrong sign-up page. The
     * destinations that carry real consequences are pinned to their category.
     */
    it('pins each destination-bearing step to the right kind of destination', () => {
      const expected: Array<[string, string]> = [
        ['release-delivery', 'delivery'],
        ['rights-pro', 'pro'],
        ['presence-distributor', 'delivery'],
        ['presence-for-artists', 'for-artists'],
        ['presence-analytics', 'analytics'],
      ];

      expected.forEach(([stepId, category]) => {
        const step = service.steps.find((entry) => entry.id === stepId);
        expect(step).toBeDefined();
        expect(step?.destinationId).toBeTruthy();
        const destination = service.destination(step!.destinationId!);
        expect(destination).not.toBeNull();
        expect(destination?.category).toBe(category);
      });
    });

    /**
     * The hero recommends `nextAction` and the tip queue leads with
     * `todayList()[0]`. Ranking them by different rules inside one panel made
     * them disagree, so an artist was told to finish one thing in the hero and
     * start another in the list directly beneath it.
     */
    it('keeps the recommendation and the top of the today list on the same step', () => {
      const named = { ...(beginner() as any), artistName: 'Named' } as UserProfile;
      const partial = {
        ...(named as any),
        musicalJourney: { originStory: 'A borrowed keyboard in a cold room.' },
      } as UserProfile;

      [beginner(), named, partial, official()].forEach((profile) => {
        const readout = service.readout(profile);
        const today = service.todayList(profile);
        if (readout.nextAction) {
          expect(today[0]).toBe(readout.nextAction.step.title);
        } else {
          expect(today).toEqual([]);
        }
      });
    });

    /**
     * Blocked work is never offered as today's work: the artist cannot act on
     * it, so listing it is busywork. It stays visible in its area card.
     */
    it('never lists a blocked step as today\u2019s work', () => {
      [beginner(), official()].forEach((profile) => {
        const readout = service.readout(profile);
        const titles = service.todayList(profile, readout.steps.length);
        const blocked = readout.steps
          .filter((entry) => entry.status === 'blocked')
          .map((entry) => entry.step.title);
        blocked.forEach((title) => expect(titles).not.toContain(title));
      });
    });
  });
});
