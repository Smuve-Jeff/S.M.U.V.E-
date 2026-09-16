import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArtistDevelopmentHubComponent } from './artist-development-hub.component';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { UserProfileService } from '../../services/user-profile.service';
import type { UserProfile } from '../../services/user-profile.service';

describe('ArtistDevelopmentHubComponent', () => {
  let profile: ReturnType<typeof signal<UserProfile>>;
  let navigate: jest.Mock;

  const createComponent = async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ArtistDevelopmentHubComponent],
      providers: [
        { provide: UserProfileService, useValue: { profile } },
        { provide: Router, useValue: { navigate: navigate } },
        {
          provide: InteractionDialogService,
          useValue: { confirm: jest.fn(async () => true) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ArtistDevelopmentHubComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
    };
  };

  beforeEach(() => {
    localStorage.clear();
    profile = signal<UserProfile>({ primaryGenre: 'Hip Hop' } as any);
    navigate = jest.fn();
  });

  afterEach(() => localStorage.clear());

  it('opens on the pathway so a new artist sees the route before anything else', async () => {
    const { component, text } = await createComponent();

    expect(component.activePanel()).toBe('pathway');
    expect(text()).toContain('The Official Pathway');
    expect(text()).toContain('No presence to official in every area of music');
  });

  it('shows the single next move for an artist with nothing', async () => {
    const { component, text } = await createComponent();

    const next = component.nextAction();
    expect(next).not.toBeNull();
    expect(next?.status).toBe('ready');
    expect(text()).toContain('Do this next');
    expect(text()).toContain(next!.step.title);
  });

  it('renders all eight areas with their own standing and score', async () => {
    const { component, text } = await createComponent();

    expect(component.pathwayAreas.length).toBe(8);
    component.pathwayAreas.forEach((area) => {
      const standing = component.areaFor(area);
      expect(standing).toBeDefined();
      expect(standing?.label.length).toBeGreaterThan(0);
      expect(text()).toContain(standing!.label);
    });
    expect(text()).toContain('Areas official');
  });

  it('expands an area to reveal its steps, and collapses it again', async () => {
    const { fixture, component, text } = await createComponent();

    // The hero shows only the recommended step; the full area list is closed.
    expect(component.openArea()).toBeNull();
    expect(text()).not.toContain('Start now');

    component.toggleArea('identity');
    fixture.detectChanges();
    expect(component.openArea()).toBe('identity');
    expect(text()).toContain('Lock the official artist name');
    expect(text()).toContain('Start now');

    component.toggleArea('identity');
    fixture.detectChanges();
    expect(component.openArea()).toBeNull();
    expect(text()).not.toContain('Start now');
  });

  it('shows a blocked step with the step that is holding it up', async () => {
    const { fixture, component, text } = await createComponent();

    component.toggleArea('presence');
    fixture.detectChanges();

    const steps = component.areaSteps('presence');
    const blocked = steps.filter((entry) => entry.status === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    blocked.forEach((entry) => expect(entry.blockedBy.length).toBeGreaterThan(0));
    expect(text()).toContain('Needs first:');
  });

  it('exposes real destination links for the steps that have one', async () => {
    const { component } = await createComponent();

    const withDestination = component
      .pathway()
      .steps.filter((entry) => entry.step.destinationId);
    expect(withDestination.length).toBeGreaterThan(0);
    withDestination.forEach((entry) => {
      const destination = component.destinationFor(entry.step);
      expect(destination).not.toBeNull();
      expect(destination?.url).toMatch(/^https:\/\//);
    });
  });

  it('routes the artist to the profile editor to record evidence', async () => {
    const { component } = await createComponent();

    component.openProfileEditor();
    expect(navigate).toHaveBeenCalledWith(['/profile']);
  });

  it('does not fabricate analytics before a release is delivered', async () => {
    const { fixture, component, text } = await createComponent();

    component.activePanel.set('dsp');
    fixture.detectChanges();

    expect(component.hasDeliveredWork()).toBe(false);
    expect(component.dspAnalytics()).toBeNull();
    expect(text()).toContain('No analytics yet');
    expect(text()).toContain('will not show estimated or invented figures');
    // The header card must report zero, never an invented figure.
    expect(component.totalStreams()).toBe(0);
    expect(component.totalFollowers()).toBe(0);
  });

  it('labels illustrative figures once a release exists', async () => {
    localStorage.setItem(
      'smuve_catalog',
      JSON.stringify([
        {
          id: 'rel-1',
          name: 'First Single',
          type: 'Single',
          status: 'Released',
          tracks: [],
          credits: { artistName: 'Nova', collaborators: [] },
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    );

    const { fixture, component, text } = await createComponent();
    component.activePanel.set('dsp');
    fixture.detectChanges();

    expect(component.hasDeliveredWork()).toBe(true);
    expect(component.dspAnalytics()?.source).toBe('sample');
    expect(text()).toContain('Illustrative figures');
  });

  it('reports an official artist as complete in every area', async () => {
    const { component } = await createComponent();

    // Drive an area to official standing to prove the standing logic is wired.
    const identity = component.areaFor('identity');
    expect(identity?.standing).toBe('unofficial');
    expect(component.completionTone(100)).toBe('text-emerald-400');
    expect(component.stepLabel('complete')).toBe('Official');
    expect(component.stepLabel('blocked')).toBe('Blocked');
    expect(component.stepTone('blocked')).toContain('border-white/5');
  });

  it('lists independent moves for an artist with spare capacity', async () => {
    const { component, text } = await createComponent();

    const next = component.nextAction()!;
    const parallel = component.pathway().parallelActions;
    expect(parallel.length).toBeGreaterThan(0);

    parallel.forEach((entry) => {
      // A parallel move is never the recommendation, and never depends on it.
      expect(entry.step.id).not.toBe(next.step.id);
      expect(next.step.requires).not.toContain(entry.step.id);
      expect(entry.step.requires).not.toContain(next.step.id);
      expect(['ready', 'in-progress']).toContain(entry.status);
    });
    expect(text()).toContain('Can run in parallel');
  });
});
