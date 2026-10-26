import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import { ArtistLifecycleCommandIntegrationService } from './artist-lifecycle-command-integration.service';
import { CommandPaletteService, CommandPaletteAction } from './command-palette.service';
import { UIService } from './ui.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import { BusinessPipelineService } from './business-pipeline.service';
import { UserContextService } from './user-context.service';
import { BusinessSuiteComponent } from '../components/business-suite/business-suite.component';
import type { UserProfile } from '../types/profile.types';
import type { ReleaseProject } from '../types/release.types';

/**
 * The blueprint's acceptance rule is that every surface works from one
 * lifecycle read. Each surface derives from the same service, but they can
 * still drift by passing a different profile — or forgetting the release — so
 * this sweep compares them against each other rather than against themselves.
 */
describe('Lifecycle next move agreement across surfaces', () => {
  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  const release = (): ReleaseProject => ({
    id: 'rel-1',
    name: 'Window Light',
    type: 'Single',
    description: 'First single',
    status: 'Production',
    tracks: [],
    credits: { artistName: 'Nova', collaborators: [] },
    createdAt: 0,
    updatedAt: 0,
  });

  const setup = (value: UserProfile) => {
    const profileSignal = signal(value);
    const palette = { setExtensionActions: jest.fn() };
    TestBed.configureTestingModule({
      imports: [BusinessSuiteComponent],
      providers: [
        provideRouter([]),
        { provide: UserProfileService, useValue: { profile: profileSignal } },
        { provide: CommandPaletteService, useValue: palette },
        { provide: UIService, useValue: { navigateToView: jest.fn() } },
        { provide: BusinessPipelineService, useValue: { activePipelines: signal([]) } },
        { provide: UserContextService, useValue: { setMainViewMode: jest.fn() } },
      ],
    });

    const lifecycle = TestBed.inject(ArtistLifecycleService);
    TestBed.inject(ArtistLifecycleCommandIntegrationService);
    const fixture = TestBed.createComponent(BusinessSuiteComponent);
    fixture.detectChanges();

    const paletteMove = (): CommandPaletteAction | undefined => {
      TestBed.tick();
      const actions: CommandPaletteAction[] = palette.setExtensionActions.mock.calls.at(-1)![1];
      return actions.find((action) => action.id === 'lifecycle-next-move');
    };

    return { profileSignal, lifecycle, fixture, paletteMove };
  };

  it('offers the same move in the palette and the business workspace', () => {
    const { profileSignal, lifecycle, paletteMove, fixture } = setup(profile());

    const move = lifecycle.snapshot(profileSignal()).nextBestMove!;
    expect(move).not.toBeNull();

    const paletteAction = paletteMove();
    expect(paletteAction?.label).toBe(`Next move: ${move.title}`);

    const suite = fixture.componentInstance;
    expect(suite.lifecycle().nextBestMove?.id).toBe(move.id);
    // The business workspace either owns the move or names it as elsewhere —
    // never silently drops it.
    const owned = suite.spineNext();
    const elsewhere = suite.careerNextMove();
    expect(owned?.id === move.id || elsewhere?.id === move.id).toBe(true);
  });

  it('moves every surface together when the profile changes', () => {
    const { profileSignal, lifecycle, paletteMove, fixture } = setup(profile());

    const before = lifecycle.snapshot(profileSignal()).nextBestMove!;
    expect(paletteMove()?.label).toBe(`Next move: ${before.title}`);

    // Recording the owned website completes the step the pathway ranks first.
    profileSignal.update(
      (current) =>
        ({ ...current, website: 'https://nova.example' }) as UserProfile
    );
    TestBed.tick();

    const after = lifecycle.snapshot(profileSignal()).nextBestMove!;
    expect(after.id).not.toBe(before.id);
    expect(paletteMove()?.label).toBe(`Next move: ${after.title}`);

    fixture.detectChanges();
    expect(fixture.componentInstance.lifecycle().nextBestMove?.id).toBe(after.id);
  });

  it('passes the pipeline release to the shared snapshot, not just the profile', () => {
    const withRelease = profile();
    (withRelease as any).knowledgeBase = {
      ...(withRelease as any).knowledgeBase,
      currentRelease: release(),
    };
    const { lifecycle, fixture } = setup(withRelease);

    const snapshot = lifecycle.snapshot(
      withRelease,
      (withRelease.knowledgeBase as any).currentRelease
    );
    expect(snapshot.releaseReadiness.status).toBe('assessed');
    expect(snapshot.releaseReadiness.releaseId).toBe('rel-1');

    // The workspace read is release-aware too, so its readiness cannot disagree
    // with the release pipeline it is describing.
    expect(fixture.componentInstance.lifecycle().releaseReadiness.releaseId).toBe(
      'rel-1'
    );
  });
});
