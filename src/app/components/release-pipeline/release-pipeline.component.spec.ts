import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { ReleasePipelineComponent } from './release-pipeline.component';
import { ReleasePipelineService } from '../../services/release-pipeline.service';
import type { PlannedDateReconciliation } from '../../services/release-pipeline.service';
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
  let reconciliationHistory: ReturnType<
    typeof signal<PlannedDateReconciliation[]>
  >;
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
    createCatalogWorkFromRelease: jest.Mock;
    recordDeliveryMetadata: jest.Mock;
    setPlannedReleaseDate: jest.Mock;
    copyPlannedDateToCatalogue: jest.Mock;
    reconciliationHistory: typeof reconciliationHistory;
    restoreReconciliation: jest.Mock;
    clearPlannedDateReconciliationHistory: jest.Mock;
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
    reconciliationHistory = signal<PlannedDateReconciliation[]>([]);
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
      createCatalogWorkFromRelease: jest.fn(async () => ({
        workId: 'cat-new',
        created: true,
      })),
      recordDeliveryMetadata: jest
        .fn()
        .mockResolvedValue({ workId: 'w1', recorded: ['ISRC', 'platforms'] }),
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
      setPlannedReleaseDate: jest.fn(async (date: string) => {
        const current = activeRelease();
        if (!current) return;
        const next = { ...current };
        const trimmed = date.trim();
        if (trimmed) next.plannedReleaseDate = trimmed;
        else delete next.plannedReleaseDate;
        activeRelease.set(next);
      }),
      copyPlannedDateToCatalogue: jest.fn(async () => {
        const current = activeRelease();
        if (!current) return null;
        const date = current.plannedReleaseDate || '2099-01-01';
        reconciliationHistory.update((history) => [
          {
            id: `rec-${history.length + 1}`,
            releaseId: current.id,
            workId: 'w1',
            workTitle: 'Window Light',
            plannedDate: date,
            previousCatalogueDate: '2025-02-01',
            appliedAt: '2026-11-06T10:00:00.000Z',
          },
          ...history,
        ]);
        return { workId: 'w1', date };
      }),
      reconciliationHistory,
      restoreReconciliation: jest.fn(async (id: string) => {
        reconciliationHistory.update((history) =>
          history.map((entry) =>
            entry.id === id
              ? { ...entry, restoredAt: '2026-11-06T11:00:00.000Z' }
              : entry
          )
        );
        return 'restored';
      }),
      clearPlannedDateReconciliationHistory: jest.fn(() => {
        const releaseId = activeRelease()?.id;
        const before = reconciliationHistory().length;
        reconciliationHistory.update((history) =>
          history.filter((entry) => entry.releaseId !== releaseId)
        );
        return before - reconciliationHistory().length;
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

  it('creates a catalogue work and says what is still unrecorded', async () => {
    const { component } = await setup({
      ...readyRelease(),
      name: 'Window Light (Single Edit)',
    });

    await component.createCatalogWork();

    expect(releaseService.createCatalogWorkFromRelease).toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Identifiers, date, and distributor are still unrecorded'),
      'info'
    );
  });

  it('prefills the identifier fields from the work the release reads', async () => {
    const { component } = await setup(readyRelease());

    expect(component.catalogWork()?.id).toBe('w1');
    expect(component.isrcText()).toBe('US-AAA-25-00001');
    expect(component.distributorText()).toBe('DistroKid');
    expect(component.platformsText()).toBe('Spotify, Apple Music');
  });

  it('records entered identifiers and says what is still a gap', async () => {
    const { component } = await setup(readyRelease());

    component.setDeliveryDraft('upc', '00123456789099');
    component.setDeliveryDraft('platforms', ' Spotify , Bandcamp , ');
    await component.saveDeliveryMetadata();

    expect(releaseService.recordDeliveryMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        upc: '00123456789099',
        platforms: ['Spotify', 'Bandcamp'],
      })
    );
    expect(component.deliveryDraft()).toEqual({});
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Anything left blank is still reported as a gap'),
      'info'
    );
  });

  it('says nothing was recorded when every field is left blank', async () => {
    releaseService.recordDeliveryMetadata.mockResolvedValueOnce({
      workId: 'w1',
      recorded: [],
    });
    const { component } = await setup(readyRelease());

    await component.saveDeliveryMetadata();

    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Nothing was entered'),
      'warning'
    );
  });

  it('says when it linked an existing work instead of creating one', async () => {
    releaseService.createCatalogWorkFromRelease.mockResolvedValueOnce({
      workId: 'w1',
      created: false,
    });
    const { component } = await setup(readyRelease());

    await component.createCatalogWork();

    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('already matches this release'),
      'info'
    );
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

  it('asks for confirmation before copying the planned date onto the catalogue', async () => {
    const { component, fixture } = await setup({
      ...readyRelease(),
      plannedReleaseDate: '2099-01-01',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(component.plannedDateMismatch()).not.toBeNull();
    const action = el.querySelector(
      '[data-testid="reconcile-date"]'
    ) as HTMLButtonElement;
    expect(action).toBeTruthy();

    action.click();
    fixture.detectChanges();

    // The first click only opens the confirmation; nothing is written yet.
    expect(component.showDateReconciliation()).toBe(true);
    expect(releaseService.copyPlannedDateToCatalogue).not.toHaveBeenCalled();
    expect(
      el.querySelector('[data-testid="reconcile-date-confirm"]')
    ).toBeTruthy();

    await component.confirmDateReconciliation();

    expect(releaseService.copyPlannedDateToCatalogue).toHaveBeenCalledTimes(1);
    expect(component.showDateReconciliation()).toBe(false);
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Catalogue date updated to 2099-01-01'),
      'info'
    );

    fixture.detectChanges();
    expect(component.dateReconciliationUndo()).not.toBeNull();
    expect(
      el.querySelector('[data-testid="undo-date-reconcile"]')
    ).toBeTruthy();
    const historyPanel = el.querySelector(
      '[data-testid="reconciliation-history"]'
    );
    expect(historyPanel?.textContent).toContain(
      'Date reconciliation history (1)'
    );
    expect(historyPanel?.textContent).toContain('2025-02-01 → 2099-01-01');
    expect(historyPanel?.textContent).not.toContain('Time not recorded');

    const entryId = component.reconciliationHistory()[0].id;
    await component.undoDateReconciliation();

    expect(releaseService.restoreReconciliation).toHaveBeenCalledWith(entryId);
    expect(component.dateReconciliationUndo()).toBeNull();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('restored to 2025-02-01'),
      'info'
    );
    fixture.detectChanges();
    expect(historyPanel?.textContent).toContain('Restored');
  });

  it('lists more than the last reconciliation and restores a chosen entry', async () => {
    reconciliationHistory.set([
      {
        id: 'rec-2',
        releaseId: 'rel-1',
        workId: 'w1',
        workTitle: 'Window Light',
        plannedDate: '2099-06-01',
        previousCatalogueDate: '2099-01-01',
        appliedAt: '2026-11-06T10:05:00.000Z',
      },
      {
        id: 'rec-1',
        releaseId: 'rel-1',
        workId: 'w1',
        workTitle: 'Window Light',
        plannedDate: '2099-01-01',
        previousCatalogueDate: '2025-02-01',
        appliedAt: '2026-11-06T10:00:00.000Z',
      },
      {
        id: 'rec-other',
        releaseId: 'rel-other',
        workId: 'w1',
        workTitle: 'Window Light',
        plannedDate: '2099-01-01',
        appliedAt: '2026-11-06T10:00:00.000Z',
      },
    ]);
    const { component, fixture } = await setup({
      ...readyRelease(),
      plannedReleaseDate: '2099-06-01',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(component.reconciliationHistory()).toHaveLength(2);
    const entries = el.querySelectorAll(
      '[data-testid="reconciliation-history-entry"]'
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain('2099-06-01');
    expect(entries[1].textContent).toContain('2099-01-01');
    expect(
      el.querySelectorAll('[data-testid="restore-reconciliation"]')
    ).toHaveLength(2);

    await component.restoreHistoryEntry('rec-1');

    expect(releaseService.restoreReconciliation).toHaveBeenCalledWith('rec-1');
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('restored to 2025-02-01'),
      'info'
    );
    fixture.detectChanges();
    expect(entries[1].textContent).toContain('Restored');
    expect(
      el.querySelectorAll('[data-testid="restore-reconciliation"]')
    ).toHaveLength(1);
  });

  it('requires confirmation before clearing this release history', async () => {
    reconciliationHistory.set([
      {
        id: 'rec-1',
        releaseId: 'rel-1',
        workId: 'w1',
        workTitle: 'Window Light',
        plannedDate: '2099-01-01',
        previousCatalogueDate: '2025-02-01',
        appliedAt: '2026-11-06T10:00:00.000Z',
      },
    ]);
    const { component, fixture } = await setup({
      ...readyRelease(),
      plannedReleaseDate: '2099-01-01',
    });
    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector(
      '[data-testid="reconciliation-history"]'
    ) as HTMLDetailsElement;
    panel.open = true;

    (
      el.querySelector(
        '[data-testid="clear-reconciliation-history"]'
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(
      releaseService.clearPlannedDateReconciliationHistory
    ).not.toHaveBeenCalled();
    expect(
      el.querySelector('[data-testid="clear-reconciliation-confirm"]')
    ).toBeTruthy();

    (
      el.querySelector(
        '[data-testid="clear-reconciliation-cancel"]'
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      releaseService.clearPlannedDateReconciliationHistory
    ).not.toHaveBeenCalled();
    expect(component.showHistoryClearConfirmation()).toBe(false);

    (
      el.querySelector(
        '[data-testid="clear-reconciliation-history"]'
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (
      el.querySelector(
        '[data-testid="clear-reconciliation-confirm-button"]'
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(
      releaseService.clearPlannedDateReconciliationHistory
    ).toHaveBeenCalledTimes(1);
    expect(component.reconciliationHistory()).toHaveLength(0);
    expect(
      el.querySelector('[data-testid="reconciliation-history"]')
    ).toBeNull();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining(
        'Catalogue dates and the planned date were not changed'
      ),
      'info'
    );
  });

  it('cancels the date reconciliation without writing', async () => {
    const { component } = await setup({
      ...readyRelease(),
      plannedReleaseDate: '2099-01-01',
    });

    component.requestDateReconciliation();
    component.cancelDateReconciliation();

    expect(component.showDateReconciliation()).toBe(false);
    expect(releaseService.copyPlannedDateToCatalogue).not.toHaveBeenCalled();
  });

  it('warns when the planned date disagrees with the catalogue date', async () => {
    const { component, fixture } = await setup({
      ...readyRelease(),
      plannedReleaseDate: '2099-01-01',
    });

    expect(component.timingCheck()?.gaps.join(' ')).toContain(
      'differs from the catalogue date'
    );
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="planned-window"]')
        ?.textContent
    ).toContain('differs from the catalogue date');
  });

  it('records a planned date and scores timing from it', async () => {
    const { component } = await setup(readyRelease());

    // The catalogue date is in the past, so timing is scored down, not unknown.
    expect(component.timingCheck()?.score).toBe(0);

    component.plannedDateDraft.set('2099-01-01');
    await component.savePlannedReleaseDate();

    expect(releaseService.setPlannedReleaseDate).toHaveBeenCalledWith(
      '2099-01-01'
    );
    expect(component.plannedDateDraft()).toBeNull();
    expect(component.timingCheck()?.score).toBe(100);
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('Timing is scored from the runway'),
      'info'
    );
  });

  it('clears the planned date and falls back to the catalogue date', async () => {
    const { component } = await setup({
      ...readyRelease(),
      plannedReleaseDate: '2099-01-01',
    });
    expect(component.timingCheck()?.score).toBe(100);

    component.plannedDateDraft.set('');
    await component.savePlannedReleaseDate();

    expect(releaseService.setPlannedReleaseDate).toHaveBeenCalledWith('');
    expect(component.timingCheck()?.score).toBe(0);
    expect(component.timingCheck()?.evidence.join(' ')).toContain(
      'Catalogue date 2025-02-01'
    );
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('falls back to the catalogue date'),
      'info'
    );
  });

  it('refuses an unreadable planned date', async () => {
    const { component } = await setup(readyRelease());

    component.plannedDateDraft.set('next spring');
    await component.savePlannedReleaseDate();

    expect(releaseService.setPlannedReleaseDate).not.toHaveBeenCalled();
    expect(notify.show).toHaveBeenCalledWith(
      expect.stringContaining('YYYY-MM-DD'),
      'warning'
    );
  });
});
