import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { ReleasePipelineComponent } from './release-pipeline.component';
import { ReleasePipelineService } from '../../services/release-pipeline.service';
import { CareerPipelineService } from '../../services/career-pipeline.service';
import { NotificationService } from '../../services/notification.service';
import { UserProfileService } from '../../services/user-profile.service';
import type { ReleaseProject } from '../../types/release.types';

/**
 * The workspace used to advertise a fixed "88% sonic cohesion" and run a fake
 * distribution progress bar. Both are gone, so these tests pin the replacement:
 * readiness decides whether delivery is possible, and the handoff only records
 * what the artist states.
 */
describe('ReleasePipelineComponent', () => {
  const track = (title: string) => ({
    id: `trk-${title}`,
    title,
    status: 'Completed' as const,
    stages: {
      instrumental: 'Completed' as const,
      lyrics: 'Completed' as const,
      vocals: 'Completed' as const,
      mixing: 'Completed' as const,
      mastering: 'Completed' as const,
    },
  });

  /** Everything the delivery gates check, recorded honestly. */
  const readyRelease = (): ReleaseProject => ({
    id: 'rel-1',
    name: 'Window Light',
    type: 'Single',
    description: 'One quiet single about leaving.',
    status: 'Admin',
    tracks: [track('Window Light')],
    artworkUrl: 'https://cdn.example/art.png',
    credits: { artistName: 'North Star', proName: 'ASCAP', proIpi: '0011223344', collaborators: [] },
    marketingCampaignId: 'camp-9',
    createdAt: 1,
    updatedAt: 1,
  });

  /** A release with no tracks and no recorded identifiers. */
  const emptyRelease = (): ReleaseProject => ({
    ...readyRelease(),
    name: 'Untitled',
    tracks: [],
    artworkUrl: undefined,
    marketingCampaignId: undefined,
    credits: { artistName: 'North Star', collaborators: [] },
  });

  const profile = () => ({
    artistName: 'North Star',
    primaryGenre: 'Ambient',
    proName: 'ASCAP',
    proIpi: '0011223344',
    settings: { security: { shareProfileAnswersWithAi: false } },
    legalInfrastructure: {
      hasRegisteredWorks: true,
      proAffiliation: 'ASCAP',
      hasStandardSplitSheet: 'In Use',
      isIncorporated: true,
      trademarkStatus: 'Filed',
    },
    catalog: [
      {
        id: 'w1',
        title: 'Window Light',
        isrc: 'US-AAA-25-00001',
        upc: '00123456789012',
        releaseDate: '2025-02-01',
        distributor: 'DistroKid',
        platforms: ['Spotify', 'Apple Music'],
      },
    ],
    marketingCampaigns: [
      {
        id: 'camp-9',
        name: 'Window Push',
        status: 'Draft' as const,
        startDate: '2025-01-10T00:00:00.000Z',
        targetAudience: 'Late-night listeners',
        goals: [],
        platforms: ['Spotify' as const],
        strategyLevel: 'Modern Professional' as const,
        metrics: {
          reach: 0,
          impressions: 0,
          engagement: 0,
          conversions: 0,
          spend: 0,
          roi: 0,
          ctr: 0,
          cpc: 0,
        },
      },
    ],
  });

  let activeRelease: ReturnType<typeof signal<ReleaseProject | null>>;
  let releaseService: {
    activeRelease: typeof activeRelease;
    updateStatus: jest.Mock;
    initializeRelease: jest.Mock;
    addTrack: jest.Mock;
    updateTrackStage: jest.Mock;
    recordSplitReference: jest.Mock;
    recordProRegistration: jest.Mock;
    updateCollaborators: jest.Mock;
    attachCampaign: jest.Mock;
    detachCampaign: jest.Mock;
    linkCatalogWork: jest.Mock;
    unlinkCatalogWork: jest.Mock;
  };
  let notify: { show: jest.Mock };

  const setup = async (
    release: ReleaseProject,
    profileOverride: Record<string, unknown> = profile()
  ) => {
    activeRelease.set(release);
    await TestBed.configureTestingModule({
      imports: [ReleasePipelineComponent],
      providers: [
        provideRouter([]),
        { provide: ReleasePipelineService, useValue: releaseService },
        {
          provide: CareerPipelineService,
          useValue: {
            charterFor: jest.fn().mockReturnValue(null),
            latestCharter: jest.fn().mockReturnValue(null),
            isGenerating: signal(false),
            buildCharter: jest.fn(),
            commitCharter: jest.fn(),
          },
        },
        { provide: NotificationService, useValue: notify },
        { provide: UserProfileService, useValue: { profile: signal(profileOverride) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ReleasePipelineComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  };

  beforeEach(() => {
    activeRelease = signal<ReleaseProject | null>(null);
    releaseService = {
      activeRelease,
      updateStatus: jest.fn().mockResolvedValue(undefined),
      initializeRelease: jest.fn(),
      addTrack: jest.fn(),
      updateTrackStage: jest.fn(),
      recordSplitReference: jest.fn(async (reference: string) => {
        const current = activeRelease();
        if (!current) return;
        activeRelease.set({
          ...current,
          splitSheetRef: reference.trim(),
          splitSheetFor: [...(current.credits?.collaborators ?? [])],
        });
      }),
      updateCollaborators: jest.fn(async (names: string[]) => {
        const current = activeRelease();
        if (!current) return;
        activeRelease.set({
          ...current,
          credits: { ...current.credits, collaborators: names },
        });
      }),
      recordProRegistration: jest.fn(async (proName: string, proIpi: string) => {
        const current = activeRelease();
        if (!current) return;
        activeRelease.set({
          ...current,
          credits: { ...current.credits, proName, proIpi },
        });
      }),
      linkCatalogWork: jest.fn(async (workId: string) => {
        const current = activeRelease();
        if (!current) return;
        activeRelease.set({ ...current, catalogWorkId: workId.trim() });
      }),
      unlinkCatalogWork: jest.fn(async () => {
        const current = activeRelease();
        if (!current) return;
        const next = { ...current };
        delete next.catalogWorkId;
        activeRelease.set(next);
      }),
      attachCampaign: jest.fn(async (campaignId: string) => {
        const current = activeRelease();
        if (!current) return;
        activeRelease.set({ ...current, marketingCampaignId: campaignId.trim() });
      }),
      detachCampaign: jest.fn(async () => {
        const current = activeRelease();
        if (!current) return;
        const next = { ...current };
        delete next.marketingCampaignId;
        activeRelease.set(next);
      }),
    };
    notify = { show: jest.fn() };
  });

  it('will not deliver a release whose blocking checks are unmet', async () => {
    const { component } = await setup(emptyRelease());

    expect(component.canLaunch()).toBe(false);
    expect(component.readiness().blockingGaps.length).toBeGreaterThan(0);
  });

  it('refuses to open the handoff while a gap is blocking', async () => {
    const { component } = await setup(emptyRelease());

    component.openHandoff();

    expect(component.showHandoff()).toBe(false);
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('blocking readiness gaps'),
      'warning'
    );
  });

  it('allows delivery once every gate passes, and only records what the artist states', async () => {
    const { component } = await setup(readyRelease());

    expect(component.canLaunch()).toBe(true);
    component.openHandoff();
    expect(component.showHandoff()).toBe(true);

    await component.markSubmittedToDistributor();

    expect(releaseService.updateStatus).toHaveBeenCalledWith('Distributing');
    expect(component.showHandoff()).toBe(false);
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('cannot confirm delivery'),
      'info'
    );
  });

  it('marks a release live only as an artist-confirmed statement', async () => {
    const { component } = await setup(readyRelease());

    await component.markLiveOnDsps();

    expect(releaseService.updateStatus).toHaveBeenCalledWith('Released');
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('artist-confirmed'),
      'info'
    );
  });

  it('leaves unrecorded identifiers missing instead of filling them in', async () => {
    const { component } = await setup(emptyRelease());

    const pack = component.deliveryPackage()!;

    expect(pack.isrc).toBeNull();
    expect(pack.upc).toBeNull();
    expect(pack.releaseDate).toBeNull();
    expect(pack.distributor).toBeNull();
  });

  it('shows what shipping the release commits the artist to, not only whether it ships', async () => {
    const { component, fixture } = await setup(readyRelease());

    const bridge = component.creativeBridge();
    expect(bridge.status).toBe('assessed');
    expect(bridge.consequences).toHaveLength(6);

    const panel = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="creative-rights"]'
    );
    expect(panel?.textContent).toContain('Rights');
  });

  it('carries collaborator shares into the workspace consequence', async () => {
    const { component } = await setup({
      ...readyRelease(),
      credits: {
        artistName: 'North Star',
        proName: 'ASCAP',
        proIpi: '0011223344',
        collaborators: ['Blue Nine'],
      },
    });

    const rights = component
      .creativeBridge()
      .consequences.find((entry) => entry.dimension === 'rights')!;

    expect(rights.observation).toContain('1 collaborator');
    expect(rights.severity).not.toBe('clear');
  });

  it('settles the rights exposure by recording the split reference on the release', async () => {
    const { component } = await setup({
      ...readyRelease(),
      credits: {
        artistName: 'North Star',
        proName: 'ASCAP',
        proIpi: '0011223344',
        collaborators: ['Blue Nine'],
      },
    });

    const before = component
      .creativeBridge()
      .consequences.find((entry) => entry.dimension === 'rights')!;
    expect(before.severity).toBe('watch');
    expect(component.needsSplitReference()).toBe(true);

    component.splitReferenceDraft.set('splits/window-light-v2.pdf');
    await component.recordSplitReference();

    expect(releaseService.recordSplitReference).toHaveBeenCalledWith(
      'splits/window-light-v2.pdf'
    );
    expect(component.splitReferenceDraft()).toBeNull();
    expect(component.needsSplitReference()).toBe(false);
    const after = component
      .creativeBridge()
      .consequences.find((entry) => entry.dimension === 'rights')!;
    expect(after.severity).toBe('clear');
    expect(after.provenance).toBe('verified');
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('cannot verify the document itself'),
      'info'
    );
  });

  it('prefills the split field with the reference already on file', async () => {
    const { component } = await setup({
      ...readyRelease(),
      splitSheetRef: 'splits/from-catalogue.pdf',
      credits: {
        artistName: 'North Star',
        proName: 'ASCAP',
        proIpi: '0011223344',
        collaborators: ['Blue Nine'],
      },
    });

    expect(component.splitReferenceText()).toBe('splits/from-catalogue.pdf');
    // On file, but nobody recorded who it covers yet.
    expect(component.needsSplitReference()).toBe(true);

    await component.recordSplitReference();

    expect(releaseService.recordSplitReference).toHaveBeenCalledWith(
      'splits/from-catalogue.pdf'
    );
    expect(component.needsSplitReference()).toBe(false);
  });

  it('reopens the split when a collaborator the split does not name joins', async () => {
    const { component } = await setup({
      ...readyRelease(),
      credits: {
        artistName: 'North Star',
        proName: 'ASCAP',
        proIpi: '0011223344',
        collaborators: ['Blue Nine'],
      },
    });

    component.splitReferenceDraft.set('splits/window-light-v2.pdf');
    await component.recordSplitReference();
    expect(component.needsSplitReference()).toBe(false);

    component.collaboratorsDraft.set('Blue Nine, Weiss');
    await component.saveCollaborators();

    const rights = component
      .creativeBridge()
      .consequences.find((entry) => entry.dimension === 'rights')!;
    expect(rights.severity).toBe('blocking');
    expect(rights.observation).toContain('Weiss');
    expect(component.needsSplitReference()).toBe(true);
    expect(releaseService.updateCollaborators).toHaveBeenCalledWith([
      'Blue Nine',
      'Weiss',
    ]);
  });

  it('clears the collaborator list back to a solo credit', async () => {
    const { component } = await setup({
      ...readyRelease(),
      credits: {
        artistName: 'North Star',
        proName: 'ASCAP',
        proIpi: '0011223344',
        collaborators: ['Blue Nine'],
      },
    });

    expect(component.collaboratorsText()).toBe('Blue Nine');
    component.collaboratorsDraft.set('  ');
    await component.saveCollaborators();

    expect(releaseService.updateCollaborators).toHaveBeenCalledWith([]);
    expect(
      component.creativeBridge().consequences.find(
        (entry) => entry.dimension === 'rights'
      )!.severity
    ).toBe('clear');
  });

  it('will not record an empty split reference', async () => {
    const { component } = await setup({
      ...readyRelease(),
      credits: {
        artistName: 'North Star',
        proName: 'ASCAP',
        proIpi: '0011223344',
        collaborators: ['Blue Nine'],
      },
    });

    await component.recordSplitReference();

    expect(releaseService.recordSplitReference).not.toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Enter the split document reference'),
      'warning'
    );
  });

  it('attaches an existing campaign and clears the campaign reading', async () => {
    const { component } = await setup({
      ...readyRelease(),
      marketingCampaignId: undefined,
    });

    const campaignCheck = () =>
      component.readiness().checks.find((check) => check.id === 'campaign')!;
    expect(component.needsCampaign()).toBe(true);
    expect(campaignCheck().state).toBe('not-ready');

    component.campaignDraft.set('camp-9');
    await component.attachCampaign();

    expect(releaseService.attachCampaign).toHaveBeenCalledWith('camp-9');
    expect(component.needsCampaign()).toBe(false);
    expect(campaignCheck().state).toBe('ready');
    expect(component.attachedCampaign()?.name).toBe('Window Push');
    expect(releaseService.initializeRelease).not.toHaveBeenCalled();
  });

  it('will not attach a campaign without a selection', async () => {
    const { component } = await setup({
      ...readyRelease(),
      marketingCampaignId: undefined,
    });

    await component.attachCampaign();

    expect(releaseService.attachCampaign).not.toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Select a campaign'),
      'warning'
    );
  });

  it('detaches a campaign and returns the release to having no plan behind it', async () => {
    const { component } = await setup(readyRelease());
    expect(component.needsCampaign()).toBe(false);

    await component.detachCampaign();

    expect(releaseService.detachCampaign).toHaveBeenCalled();
    expect(component.needsCampaign()).toBe(true);
    expect(
      component.readiness().checks.find((check) => check.id === 'campaign')!.state
    ).toBe('not-ready');
  });

  it('offers a fresh attachment when the referenced campaign is gone', async () => {
    const { component } = await setup({
      ...readyRelease(),
      marketingCampaignId: 'camp-deleted',
    });

    expect(component.attachedCampaign()).toBeNull();
    expect(component.needsCampaign()).toBe(true);
    expect(
      component.readiness().checks.find((check) => check.id === 'campaign')!.state
    ).toBe('not-ready');
  });

  it('points at the Strategy Hub when no campaign exists to attach', async () => {
    const { component } = await setup(
      { ...readyRelease(), marketingCampaignId: undefined },
      { ...profile(), marketingCampaigns: [] }
    );

    expect(component.campaignOptions()).toEqual([]);
    expect(component.needsCampaign()).toBe(true);
  });

  it('records a PRO and IPI so the royalty path stops reading as unknown', async () => {
    const { component } = await setup(
      {
        ...readyRelease(),
        credits: { artistName: 'North Star', collaborators: [] },
      },
      { ...profile(), proName: '', proIpi: '' }
    );

    const before = component
      .creativeBridge()
      .consequences.find((entry) => entry.dimension === 'monetization')!;
    expect(before.severity).toBe('watch');
    expect(component.needsProRegistration()).toBe(true);

    component.proNameDraft.set('BMI');
    component.proIpiDraft.set('0099887766');
    await component.recordProRegistration();

    expect(releaseService.recordProRegistration).toHaveBeenCalledWith(
      'BMI',
      '0099887766'
    );
    const after = component
      .creativeBridge()
      .consequences.find((entry) => entry.dimension === 'monetization')!;
    expect(after.severity).toBe('clear');
    expect(component.needsProRegistration()).toBe(false);
  });

  it('needs both halves of a PRO registration before recording it', async () => {
    const { component } = await setup(
      {
        ...readyRelease(),
        credits: { artistName: 'North Star', collaborators: [] },
      },
      { ...profile(), proName: '', proIpi: '' }
    );

    component.proNameDraft.set('BMI');
    await component.recordProRegistration();

    expect(releaseService.recordProRegistration).not.toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('A PRO and an IPI are both needed'),
      'warning'
    );
  });

  it('keeps a renamed release attached to its linked work', async () => {
    const { component } = await setup({
      ...readyRelease(),
      name: 'Window Light (Single Edit)',
      catalogWorkId: 'w1',
    });

    expect(component.linkedCatalogWork()?.title).toBe('Window Light');
    // Before linking, a renamed release finds nothing by title alone.
    expect(component.deliveryPackage()!.isrc).toBe('US-AAA-25-00001');
    expect(component.deliveryPackage()!.distributor).toBe('DistroKid');
  });

  it('links and unlinks a catalogue work without inventing identifiers', async () => {
    const { component } = await setup({
      ...readyRelease(),
      name: 'Window Light (Single Edit)',
    });

    expect(component.deliveryPackage()!.isrc).toBeNull();
    expect(component.linkedCatalogWork()).toBeNull();

    component.catalogWorkDraft.set('w1');
    await component.linkCatalogWork();

    expect(releaseService.linkCatalogWork).toHaveBeenCalledWith('w1');
    expect(component.deliveryPackage()!.isrc).toBe('US-AAA-25-00001');

    await component.unlinkCatalogWork();

    expect(component.deliveryPackage()!.isrc).toBeNull();
  });

  it('will not link without a selected work', async () => {
    const { component } = await setup(readyRelease());

    await component.linkCatalogWork();

    expect(releaseService.linkCatalogWork).not.toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Select a catalogue work'),
      'warning'
    );
  });

  it('reads identifiers from the matching catalogue record', async () => {
    const { component } = await setup(readyRelease());

    const pack = component.deliveryPackage()!;

    expect(pack.isrc).toBe('US-AAA-25-00001');
    expect(pack.upc).toBe('00123456789012');
    expect(pack.distributor).toBe('DistroKid');
    expect(pack.platforms).toEqual(['Spotify', 'Apple Music']);
  });
});
