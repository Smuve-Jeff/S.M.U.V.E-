import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ProfileEditorComponent } from './profile-editor.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';
import { AiService } from '../../services/ai.service';
import { ArtistIdentityService } from '../../services/artist-identity.service';
import { DatabaseService } from '../../services/database.service';
import { OnboardingService } from '../../services/onboarding.service';
import { UplinkService } from '../../services/uplink.service';
import { LoggingService } from '../../services/logging.service';
import { initialProfile, TeamMember, UserProfile } from '../../types/profile.types';

/**
 * Child surfaces are stubbed so the REAL profile template renders without
 * pulling in their dependency graphs — the tests below are about the builder's
 * own wiring (commit feedback, the roster, the connector log), which only the
 * real template exercises.
 */
@Component({
  selector: 'app-form-field',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class FormFieldStub {
  @Input() label = '';
  @Input() description = '';
}

@Component({ selector: 'app-radar-chart', standalone: true, template: '' })
class RadarChartStub {
  @Input() expertise: unknown;
}

@Component({ selector: 'app-catalog-manager', standalone: true, template: '' })
class CatalogManagerStub {}

@Component({ selector: 'app-artist-questionnaire', standalone: true, template: '' })
class ArtistQuestionnaireStub {
  @Output() close = new EventEmitter<void>();
  @Output() complete = new EventEmitter<UserProfile>();
}

@Component({ selector: 'app-persona-selector', standalone: true, template: '' })
class PersonaSelectorStub {
  @Output() select = new EventEmitter<unknown>();
  @Output() close = new EventEmitter<void>();
}

@Component({ selector: 'app-uplink-console', standalone: true, template: '' })
class UplinkConsoleStub {
  @Output() close = new EventEmitter<void>();
}

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'tm-1',
  name: 'Dana',
  role: 'Manager',
  share: 0,
  joinedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('ProfileEditorComponent', () => {
  let profile: ReturnType<typeof signal<UserProfile>>;
  let userProfileService: {
    profile: ReturnType<typeof signal<UserProfile>>;
    addTeamMember: jest.Mock;
    removeTeamMember: jest.Mock;
    exportProfile: jest.Mock;
    importProfile: jest.Mock;
    updateProfile: jest.Mock;
  };
  let uplink: { initiateUplink: jest.Mock; status: jest.Mock };
  let identity: {
    buildIdentitySnapshot: jest.Mock;
    getConnectorMatrix: jest.Mock;
    queueConnectorRefresh: jest.Mock;
  };
  let database: { uploadAsset: jest.Mock };
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const identitySnapshot = () => ({
    fingerprint: {
      trustScore: 72,
      changeSummary: ['No drift detected.'],
      riskFlags: [],
    },
    resolution: { confidenceScore: 85, explainability: ['Matched on name.'] },
    sync: { queueDepth: 0 },
    recommendations: [
      {
        title: 'Claim every profile',
        description: 'Unclaimed handles split your identity graph.',
        actionLabel: 'Claim',
        evidence: ['two unclaimed handles'],
        impactScore: 9,
        confidenceScore: 8,
      },
    ],
  });

  const connectors = [
    {
      connector: 'spotify',
      official: true,
      verification: 'verification: official',
      status: 'live',
      health: 'strong',
      followersOrListeners: 1200,
    },
  ];

  const createComponent = async () => {
    TestBed.resetTestingModule();
    queryParams = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [ProfileEditorComponent],
      providers: [
        { provide: UserProfileService, useValue: userProfileService },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(true),
            currentUser: signal({ id: 'u1', name: 'Nova' }),
          },
        },
        {
          provide: AiService,
          useValue: {
            intelligenceBriefs: signal([
              { title: 'Release window', content: 'Ship in Q3.' },
            ]),
          },
        },
        { provide: ArtistIdentityService, useValue: identity },
        { provide: DatabaseService, useValue: database },
        { provide: OnboardingService, useValue: { shouldShow: () => false } },
        { provide: UplinkService, useValue: uplink },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParams.asObservable(),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    })
      .overrideComponent(ProfileEditorComponent, {
        set: {
          imports: [
            CommonModule,
            FormsModule,
            FormFieldStub,
            RadarChartStub,
            CatalogManagerStub,
            ArtistQuestionnaireStub,
            PersonaSelectorStub,
            UplinkConsoleStub,
          ],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ProfileEditorComponent);
    fixture.detectChanges();

    return {
      fixture,
      component: fixture.componentInstance,
      /** The template only mounts the active pane, as the sidebar drives it. */
      show: (section: string) => {
        fixture.componentInstance.activeSection.set(section);
        fixture.detectChanges();
      },
      buttons: () =>
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('button')
        ),
      button: (text: string) => {
        const match = Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('button')
        ).find((button) => button.textContent?.includes(text));
        if (!match) throw new Error(`No button matching "${text}"`);
        return match as HTMLButtonElement;
      },
      text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
    };
  };

  beforeEach(() => {
    profile = signal<UserProfile>({
      ...initialProfile,
      artistName: 'Nova',
      primaryGenre: 'Hip Hop',
      team: [],
    });
    userProfileService = {
      profile,
      addTeamMember: jest.fn(async () => profile()),
      removeTeamMember: jest.fn(async () => profile()),
      exportProfile: jest.fn(),
      importProfile: jest.fn(async () => true),
      updateProfile: jest.fn(async () => undefined),
    };
    uplink = {
      initiateUplink: jest.fn(async () => true),
      status: jest.fn(() => ({ stage: 'idle', message: '', logs: [] })),
    };
    identity = {
      buildIdentitySnapshot: jest.fn(() => identitySnapshot()),
      getConnectorMatrix: jest.fn(() => connectors),
      queueConnectorRefresh: jest.fn(async (id: string, p: UserProfile) => ({
        ...p,
        queuedFor: id,
      })),
    };
    database = { uploadAsset: jest.fn(async () => 'https://cdn/asset.png') };
    // The upload failure path reports through `alert`, which jsdom does not implement.
    (globalThis as unknown as { alert: unknown }).alert = jest.fn();
  });

  describe('profile module coverage', () => {
    it('navigates every pane and scores it from the draft', async () => {
      const { fixture, component, text } = await createComponent();

      const ids = component.sections.map((section: any) => section.id);
      expect(ids).toEqual([
        'mastery',
        'basic',
        'identity-console',
        'persona',
        'genre-deep-dive',
        'production-tools',
        'catalog',
        'fingerprint',
        'music-history',
        'business',
        'sync-licensing',
        'legal-infrastructure',
        'touring',
        'team',
      ]);
      // The seed profile records 'Not Started' sync state, so the pane scores
      // low but is never silently treated as complete.
      expect(component.sectionCoverage()['sync-licensing'].score).toBeLessThan(40);
      expect(component.sectionCoverage()['sync-licensing'].missing).toContain(
        'one-stop clearance'
      );

      component.activeSection.set('mastery');
      fixture.detectChanges();
      expect(text()).toContain('Profile Mastery');
      expect(text()).toContain('Highest-value next actions');
      expect(text()).toContain('Missing:');
    });

    it('edits the production toolchain elements instead of leaving them unowned', async () => {
      const { fixture, component } = await createComponent();

      component.activeSection.set('production-tools');
      fixture.detectChanges();
      expect(component.coverageFor('production-tools').score).toBeLessThan(100);

      component.toggleChip('equipment', 'Condenser Mic');
      component.toggleChip('daw', 'Ableton Live');
      component.setExpertise('production', 7);
      fixture.detectChanges();

      expect(component.editableProfile().equipment).toContain('Condenser Mic');
      expect(component.editableProfile().daw).toContain('Ableton Live');
      expect(component.expertiseValue('production')).toBe(7);
      expect(component.coverageFor('production-tools').score).toBeGreaterThan(0);
      expect(component.coverageFor('production-tools').missing).not.toContain('DAW');
    });

    it('captures sync readiness and legal infrastructure', async () => {
      const { fixture, component } = await createComponent();

      component.activeSection.set('sync-licensing');
      component.setSyncField('isSyncReady', 'Actively Pitching');
      component.setSyncField('catalogSize', 9);
      component.setSyncFlag('oneStopClearance', true);
      component.setSyncKeywords('late-night drive, hopeful resolve');
      fixture.detectChanges();

      expect(component.syncValue('isSyncReady')).toBe('Actively Pitching');
      expect(component.syncKeywordsText()).toBe('late-night drive, hopeful resolve');
      expect(component.coverageFor('sync-licensing').missing).not.toContain('one-stop clearance');

      component.activeSection.set('legal-infrastructure');
      component.setLegalField('proAffiliation', 'ASCAP');
      component.setLegalFlag('hasRegisteredWorks', true);
      fixture.detectChanges();

      expect(component.legalValue('proAffiliation')).toBe('ASCAP');
      expect(component.coverageFor('legal-infrastructure').missing).toEqual(
        expect.not.arrayContaining(['PRO affiliation', 'registered works'])
      );
    });

    it('marks the module calibrated once every pane is filled in', async () => {
      const { fixture, component } = await createComponent();

      component.editableProfile.update((draft) => ({
        ...draft,
        location: 'Atlanta',
        website: 'https://nova.example',
        avatarImage: 'data:image/png;base64,abc',
        pressGallery: ['press.png'],
        productionStyles: ['Trap'],
        brandVoices: ['Cinematic'],
        strategicGoals: ['sync'],
        careerGoals: ['touring'],
        proName: 'BMI',
        equipment: ['MIDI Keyboard'],
        daw: ['FL Studio'],
        services: ['DistroKid'],
        expertise: { ...(draft.expertise as any), production: 8 },
        catalog: [{ title: 'One', isrc: 'US1', releaseDate: '2025-01-01' }] as any,
        marketingCampaigns: [{ id: 'c1' } as any],
        financials: {
          ...(draft.financials as any),
          accounts: [{}],
          monthlyBudget: 100,
          revenueHistory: [{}],
        },
        syncDetails: {
          isSyncReady: 'Ready',
          hasCleanVersions: true,
          hasInstrumentals: true,
          hasStems: 'Full Multitrack',
          oneStopClearance: true,
          catalogSize: 3,
          preferredKeywords: ['hopeful'],
        } as any,
        legalInfrastructure: {
          hasRegisteredWorks: true,
          proAffiliation: 'BMI',
          hasStandardSplitSheet: 'In Use',
          isIncorporated: true,
          trademarkStatus: 'Filed',
        } as any,
        touringDetails: {
          travelPreference: 'Van',
          regions: ['Southeast'],
          isTourReady: 'Tour Ready',
          hasBackline: 'Yes',
        } as any,
        performancesPerYear: '12',
        team: [member()],
        artistIdentity: {
          ...(draft.artistIdentity as any),
          linkedAccounts: [{}],
          works: [{}],
          resolution: { confidenceScore: 0.9 },
          fingerprint: { genre: 'Hip Hop' },
        },
        genreSpecificData: { tempo: 140 },
      }));
      fixture.detectChanges();

      const coverage = component.sectionCoverage();
      expect(coverage['sync-licensing'].score).toBe(100);
      expect(coverage['legal-infrastructure'].score).toBe(100);
      expect(coverage['production-tools'].score).toBeGreaterThan(60);
      expect(component.mastery().overall).toBeGreaterThan(60);
      expect(component.mastery().weakest.length).toBe(3);
    });
  });

  describe('artist fine-tune preview', () => {
    it('reports the missing signals that block a calibrated fine-tune', async () => {
      const { fixture, component, show, text } = await createComponent();
      show('persona');

      const preview = component.finetunePreview();
      expect(preview.knowledge.state).not.toBe('calibrated');
      expect(preview.knowledge.missing.length).toBeGreaterThan(0);
      expect(preview.roles.length).toBe(5);
      expect(text()).toContain('Artist Fine-Tune Preview');
      expect(text()).toContain('Signals S.M.U.V.E. still needs');
      expect(fixture.nativeElement).toBeTruthy();
    });

    it('rewrites the role directives and anchors as the draft gains artist evidence', async () => {
      const { fixture, component, show, text } = await createComponent();
      show('persona');

      component.editableProfile.update((draft) => ({
        ...draft,
        musicalJourney: {
          ...draft.musicalJourney,
          signatureSound: 'rusted organ and hand claps',
          originStory: 'Raised on a church organ bench.',
          subgenres: ['neo-soul'],
          musicalInfluences: ['gospel'],
          productionPhilosophy: 'Let the room play the song',
          songwritingProcess: 'Write at the organ, finish at the desk',
          preferredBpmRange: '78-92',
          currentFocus: 'finish the organ record',
          primarySuccessMetric: 'repeat listeners',
          releaseVelocity: 'quarterly',
          incomeStreams: ['Bandcamp'],
          visualAesthetic: ['sepia'],
          contentStrategy: 'organ bench clips',
          musicBlueprint: {
            ...draft.musicalJourney?.musicBlueprint,
            artisticIntent: 'make listeners feel held',
            audienceProfile: 'people rebuilding after a loss',
            mixingPriorities: ['Warmth'],
            recordingPriorities: ['Room tone'],
            vocalDelivery: 'unpolished and close',
            rhythmicFeel: 'loose pocket',
            harmonicLanguage: 'gospel ninths',
            arrangementApproach: 'verse-first build',
            lyricalThemes: ['grief', 'gratitude'],
            signatureTension: 'faith against doubt',
            livedWorldDetails: 'organ bench and Sunday traffic',
            sonicNonNegotiables: 'keep the pedal noise',
            recognitionCue: 'the organ swell before the chorus',
          },
        },
      }));
      fixture.detectChanges();

      const preview = component.finetunePreview();
      expect(preview.knowledge.state).not.toBe('foundational');
      expect(preview.knowledge.missing).not.toContain('signature tension');
      expect(preview.knowledge.missing).not.toContain('lived-world details');
      expect(preview.knowledge.differentiators).toContain('faith against doubt');

      const producer = preview.roles.find((r) => r.role === 'producer');
      const legal = preview.roles.find((r) => r.role === 'legal');
      expect(producer?.directive).toContain('rusted organ and hand claps');
      expect(producer?.directive).toContain('keep the pedal noise');
      expect(legal?.directive).toContain('Bandcamp');

      // The preview must be rendered from the draft, not only computed.
      expect(text()).toContain('rusted organ and hand claps');
      expect(text()).toContain('Differentiation anchors in use');
      expect(text()).toContain('faith against doubt');
      expect(text()).toContain('Adaptive tips from this profile');
      expect(preview.tips.join(' ')).toContain('keep the pedal noise');
    });
  });

  describe('online fingerprint pane', () => {
    it('gives a beginner with nothing online an ordered start-here plan', async () => {
      const { fixture, component, show, text } = await createComponent();
      show('fingerprint');

      const readout = component.fingerprintReadout();
      expect(readout.hasFingerprint).toBe(false);
      expect(readout.track).toBe('emerging');
      expect(component.experienceTrackLabel()).toContain('building the first fingerprint');

      const plan = component.fingerprintPlan();
      expect(plan.length).toBeGreaterThan(0);
      expect(plan[0].order).toBe(1);

      expect(text()).toContain('No online fingerprint yet');
      expect(text()).toContain('Online Fingerprint');
      expect(fixture.nativeElement).toBeTruthy();
    });

    it('records, verifies, and removes an official artist link', async () => {
      const { fixture, component, show, text } = await createComponent();
      show('fingerprint');

      component.beginFingerprintLink('spotify-for-artists');
      expect(component.fingerprintUrl).toBe('https://artists.spotify.com');
      component.fingerprintUrl = 'https://artists.spotify.com/nova';
      component.fingerprintVerified = true;
      component.saveFingerprintLink();

      const stored = component.editableProfile().officialArtistProfiles ?? [];
      expect(stored.length).toBe(1);
      expect(stored[0].url).toBe('https://artists.spotify.com/nova');
      expect(stored[0].verified).toBe(true);
      // The add-link form closes and clears once saved.
      expect(component.fingerprintLink).toBeNull();
      expect(component.fingerprintUrl).toBe('');

      fixture.detectChanges();
      expect(component.fingerprintReadout().hasFingerprint).toBe(true);
      expect(component.fingerprintReadout().overall).toBeGreaterThan(0);
      expect(text()).toContain('Verified');

      component.toggleFingerprintVerified('spotify-for-artists', false);
      expect(
        component.editableProfile().officialArtistProfiles?.[0].verified
      ).toBe(false);

      component.removeFingerprintLink('spotify-for-artists');
      expect(component.editableProfile().officialArtistProfiles).toEqual([]);
      expect(component.fingerprintReadout().hasFingerprint).toBe(false);
    });

    it('reports coverage per category without inventing presence', async () => {
      const { component, show } = await createComponent();
      show('fingerprint');

      const groups = component.fingerprintGroups();
      expect(groups.length).toBeGreaterThan(0);
      groups.forEach((group) => {
        expect(group.coverage?.total).toBe(group.destinations.length);
        expect(group.destinations.every((entry) => !entry.link)).toBe(true);
      });

      component.beginFingerprintLink('ascap');
      component.saveFingerprintLink();

      const pro = component.fingerprintGroups().find((group) => group.id === 'pro');
      expect(pro?.coverage?.present).toBe(1);
      expect(
        pro?.destinations.find((entry) => entry.id === 'ascap')?.link?.label
      ).toBe('ASCAP');
    });
  });

  describe('official music history pane', () => {
    it('shows the release record S.M.U.V.E. organises, newest first', async () => {
      const { fixture, component, show, text } = await createComponent();
      component.editableProfile.update((draft) => ({
        ...draft,
        catalog: [
          {
            id: 'old',
            title: 'Old Work',
            releaseDate: '2023-01-01',
            releaseType: 'Single',
          },
          { id: 'new', title: 'New Work', releaseDate: '2025-01-01' },
          { id: 'undated', title: 'Undated Work' },
        ],
      }));
      await show('music-history');

      const releases = component.historyReleases();
      expect(releases.map((entry) => entry.id)).toEqual(['new', 'old', 'undated']);
      expect(component.historyReport().undated).toBe(1);

      expect(component.releaseField('old', 'releaseType')).toBe('Single');
      expect(component.releaseField('old', 'isrc')).toBe('');
      expect(component.releaseTypes).toContain('EP');

      expect(text()).toContain('Official Music History');
      expect(text()).toContain('New Work');
      expect(text()).toContain('Still needed');
      expect(fixture.nativeElement).toBeTruthy();
    });

    it('writes edited identifiers back to the real work record', async () => {
      const { component, show } = await createComponent();
      component.editableProfile.update((draft) => ({
        ...draft,
        catalog: [{ id: 'w1', title: 'Work', releaseDate: '2024-01-01' }],
      }));
      await show('music-history');

      component.updateReleaseField('w1', 'isrc', 'US-CCC-24-00001');
      component.updateReleaseField('w1', 'releaseType', 'EP');
      component.updateReleaseField('w1', 'splitSheetRef', 'SPLIT-24-01');
      component.setReleasePlatforms('w1', ' Spotify , Apple Music ,, ');

      const item: any = (component.editableProfile().catalog || [])[0];
      expect(item.isrc).toBe('US-CCC-24-00001');
      expect(item.releaseType).toBe('EP');
      expect(item.splitSheetRef).toBe('SPLIT-24-01');
      expect(item.platforms).toEqual(['Spotify', 'Apple Music']);
      expect(component.releasePlatformsText('w1')).toBe('Spotify, Apple Music');

      const entry = component.historyReleases().find((r) => r.id === 'w1');
      expect(entry?.missing).not.toContain('ISRC or UPC');
      expect(entry?.missing).not.toContain('release type');
    });

    it('ignores an edit for a work that is no longer in the catalogue', async () => {
      const { component, show } = await createComponent();
      component.editableProfile.update((draft) => (
        { ...draft, catalog: [{ id: 'w1', title: 'Work' }] }
      ));
      await show('music-history');

      expect(() => component.updateReleaseField('missing', 'isrc', 'X')).not.toThrow();
      const catalog: any[] = component.editableProfile().catalog || [];
      expect(catalog.length).toBe(1);
      expect(catalog[0].isrc).toBeUndefined();
    });

    it('points an artist with no works at the pane that creates them', async () => {
      const { component, text } = await createComponent();
      await component.activeSection.set('music-history');

      expect(component.historyReleases()).toEqual([]);
      expect(component.historyReport().averageCompleteness).toBe(0);
    });
  });

  describe('route-driven questionnaire', () => {
    it('reacts when the questionnaire query parameter changes in place', async () => {
      const { fixture, component } = await createComponent();

      expect(component.showQuestionnaire()).toBe(false);
      queryParams.next(convertToParamMap({ questionnaire: '1' }));
      fixture.detectChanges();
      expect(component.showQuestionnaire()).toBe(true);

      queryParams.next(convertToParamMap({}));
      fixture.detectChanges();
      expect(component.showQuestionnaire()).toBe(false);
    });
  });

  describe('commit', () => {
    it('commits the draft through the uplink and reports it in the header', async () => {
      const { fixture, component, button, text } = await createComponent();
      component.editableProfile.update((p) => ({ ...p, location: 'Atlanta' }));

      button('Commit Neural Protocol').click();
      await fixture.whenStable();

      expect(uplink.initiateUplink).toHaveBeenCalledWith(
        expect.objectContaining({ artistName: 'Nova', location: 'Atlanta' })
      );
      expect(component.saveStatus()).toBe('saved');
      expect(text()).toContain('LAST_COMMIT: SAVED');
    });

    it('locks the commit control while the uplink runs and ignores a second commit', async () => {
      const { fixture, component, button, text } = await createComponent();
      let finish: (value: boolean) => void = () => undefined;
      uplink.initiateUplink.mockReturnValue(
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
      );

      button('Commit Neural Protocol').click();
      // A second trigger (the identity console's refresh runs the same commit).
      component.saveProfile();
      await Promise.resolve();
      fixture.detectChanges();

      expect(uplink.initiateUplink).toHaveBeenCalledTimes(1);
      expect(component.saveStatus()).toBe('saving');
      expect(text()).toContain('SYNCING...');
      expect(button('Commit Neural Protocol').disabled).toBe(true);

      finish(true);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.saveStatus()).toBe('saved');
      expect(button('Commit Neural Protocol').disabled).toBe(false);
    });

    it('surfaces a rejected commit instead of leaving the header at READY', async () => {
      const { fixture, component, button, text } = await createComponent();
      uplink.initiateUplink.mockResolvedValue(false);
      uplink.status.mockReturnValue({
        stage: 'failed',
        message: 'TRANSMISSION SEVERED',
        logs: [],
        error: 'GENRE_UNDEFINED: Strategic alignment requires a primary domain.',
      });

      button('Commit Neural Protocol').click();
      await fixture.whenStable();

      expect(component.saveStatus()).toBe('failed');
      expect(text()).toContain('LAST_COMMIT: FAILED');
      expect(text()).toContain('GENRE_UNDEFINED');
    });
  });

  describe('professional team', () => {
    it('deploys a drafted member onto the roster', async () => {
      const { fixture, component, button, text } = await createComponent();
      const withMember = { ...profile(), team: [member()] };
      userProfileService.addTeamMember.mockResolvedValue(withMember);
      component.activeSection.set('team');
      fixture.detectChanges();

      button('Deploy Team Member').click();
      fixture.detectChanges();

      const inputs = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('form input')
      ) as HTMLInputElement[];
      expect(inputs).toHaveLength(2);

      inputs[0].value = 'Dana';
      inputs[0].dispatchEvent(new Event('input'));
      inputs[1].value = 'Manager';
      inputs[1].dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (fixture.nativeElement as HTMLElement)
        .querySelector('form')!
        .dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(userProfileService.addTeamMember).toHaveBeenCalledWith({
        name: 'Dana',
        role: 'Manager',
      });
      expect(component.addingTeamMember()).toBe(false);
      expect(text()).toContain('Dana');
    });

    it('keeps the roster from the store without dropping uncommitted edits', async () => {
      const { fixture, component } = await createComponent();
      const withMember = { ...profile(), team: [member()] };
      userProfileService.addTeamMember.mockResolvedValue(withMember);
      component.editableProfile.update((p) => ({
        ...p,
        location: 'Atlanta',
        team: [],
      }));

      component.teamMemberDraft.set({ name: 'Dana', role: '' });
      await component.deployTeamMember();

      expect(component.editableProfile().team).toHaveLength(1);
      expect(component.editableProfile().location).toBe('Atlanta');
    });

    it('does not deploy a blank name', async () => {
      const { fixture, component, button } = await createComponent();
      component.activeSection.set('team');
      fixture.detectChanges();

      button('Deploy Team Member').click();
      fixture.detectChanges();

      expect(button('Deploy').disabled).toBe(true);

      component.teamMemberDraft.set({ name: '   ', role: '' });
      await component.deployTeamMember();

      expect(userProfileService.addTeamMember).not.toHaveBeenCalled();
    });

    it('removes a member from the roster', async () => {
      const { fixture, component, text } = await createComponent();
      profile.set({ ...profile(), team: [member()] });
      userProfileService.removeTeamMember.mockResolvedValue({
        ...profile(),
        team: [],
      });
      component.activeSection.set('team');
      fixture.detectChanges();
      expect(text()).toContain('Dana');

      const removeButton = (fixture.nativeElement as HTMLElement).querySelector(
        '[aria-label="Remove Dana"]'
      ) as HTMLButtonElement;
      removeButton.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(userProfileService.removeTeamMember).toHaveBeenCalledWith('tm-1');
      expect(text()).not.toContain('Dana');
    });
  });

  describe('identity console', () => {
    it('queues a connector refresh and shows it in the activity log', async () => {
      const { fixture, component, button, text } = await createComponent();
      component.activeSection.set('identity-console');
      fixture.detectChanges();

      button('Queue Refresh').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(identity.queueConnectorRefresh).toHaveBeenCalledWith(
        'spotify',
        expect.any(Object)
      );
      expect(text()).toContain('Connector Activity');
      expect(text()).toContain('SPOTIFY REFRESH QUEUED.');
    });

    it('reports a failed queue instead of failing silently', async () => {
      const { fixture, component, button, text } = await createComponent();
      identity.queueConnectorRefresh.mockRejectedValue(
        new Error('offline queue full')
      );
      component.activeSection.set('identity-console');
      fixture.detectChanges();

      button('Queue Refresh').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text()).toContain('SPOTIFY REFRESH FAILED: offline queue full');
    });
  });

  describe('template health', () => {
    it('renders the risk flags without an unknown ngFor binding', async () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      identity.buildIdentitySnapshot.mockReturnValue({
        ...identitySnapshot(),
        fingerprint: {
          trustScore: 72,
          changeSummary: ['No drift detected.'],
          riskFlags: ['No verified handle on Spotify'],
        },
      });

      const { fixture, component, text } = await createComponent();
      component.activeSection.set('identity-console');
      fixture.detectChanges();

      expect(text()).toContain('No verified handle on Spotify');
      // `track x` is `@for` syntax; inside `*ngFor` it became an unknown
      // `ngForTrack` binding and logged on every render.
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('NG0303');
      errorSpy.mockRestore();
    });
  });

  describe('archive and asset upload', () => {
    it('stops a second upload while the first is still running', async () => {
      const { component } = await createComponent();
      let finish: (url: string) => void = () => undefined;
      database.uploadAsset.mockReturnValue(
        new Promise<string>((resolve) => {
          finish = resolve;
        })
      );
      const file = new File(['bytes'], 'avatar.png', { type: 'image/png' });
      const event = { target: { files: [file] } };

      const first = component.onImageSelected(event, 'avatarImage');
      const second = component.onImageSelected(event, 'headerImage');
      finish('https://cdn/asset.png');
      await Promise.all([first, second]);

      expect(database.uploadAsset).toHaveBeenCalledTimes(1);
      expect(component.editableProfile().avatarImage).toBe(
        'https://cdn/asset.png'
      );
    });

    it('reports an import that could not be read as a profile', async () => {
      const { fixture, text } = await createComponent();
      userProfileService.importProfile.mockResolvedValue(false);

      await fixture.componentInstance.onProfileImport({
        target: { files: [new File(['nope'], 'notes.txt')], value: '' },
      });
      fixture.detectChanges();

      expect(text()).toContain('IMPORT FAILED');
    });

    it('reports a successful import', async () => {
      const { fixture, text } = await createComponent();

      await fixture.componentInstance.onProfileImport({
        target: { files: [new File(['{}'], 'archive.json')], value: '' },
      });
      fixture.detectChanges();

      expect(text()).toContain('ARCHIVE IMPORTED');
    });

    it('reports an export', async () => {
      const { fixture, component, text } = await createComponent();

      component.exportArchive();
      fixture.detectChanges();

      expect(userProfileService.exportProfile).toHaveBeenCalled();
      expect(text()).toContain('ARCHIVE EXPORTED');
    });
  });
});
