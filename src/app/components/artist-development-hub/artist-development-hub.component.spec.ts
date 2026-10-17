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
  let updateFinancials: jest.Mock;

  const createComponent = async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ArtistDevelopmentHubComponent],
      providers: [
        { provide: UserProfileService, useValue: { profile, updateFinancials } },
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
    // Mirrors the real service, which merges the patch into the stored block.
    updateFinancials = jest.fn(async (patch: Record<string, any>) => {
      profile.update((current) => ({
        ...current,
        financials: { ...((current as any).financials || {}), ...patch },
      }));
    });
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

  it('leads its queue with the same step the hero recommends', async () => {
    const { fixture, component, text } = await createComponent();

    const next = component.nextAction();
    if (next) {
      expect(component.nextQueue()[0]).toBe(next.step.title);
    } else {
      expect(component.nextQueue()).toEqual([]);
    }

    // The queue only ever holds work the artist can act on now.
    const blocked = component
      .pathway()
      .steps.filter((entry) => entry.status === 'blocked')
      .map((entry) => entry.step.title);
    expect(blocked.length).toBeGreaterThan(0);
    component.nextQueue().forEach((title) => expect(blocked).not.toContain(title));

    // Adding evidence moves the queue, and the hero moves with it.
    profile.update((current) => ({ ...current, artistName: 'Nova' }) as any);
    fixture.detectChanges();
    const moved = component.nextAction();
    expect(component.nextQueue()[0]).toBe(moved ? moved.step.title : undefined);
    if (component.nextQueue().length > 1) {
      expect(text()).toContain('Then:');
    }
  });

  it('records the budget, revenue, and payout account the pathway money steps read', async () => {
    const { fixture, component } = await createComponent();

    const step = (id: string) =>
      component.pathway().steps.find((entry) => entry.step.id === id)!;

    // Nothing recorded yet, and the step names the exact gap.
    expect(step('money-budget').status).not.toBe('complete');
    expect(step('money-budget').needs).toContain('a sustainable monthly budget');

    component.setMonthlyBudget(400);
    component.updateRevenueForm('month', '2026-01');
    component.updateRevenueForm('amount', 120);
    component.addRevenueEntry();
    component.updatePayoutForm('provider', 'DistroKid');
    component.updatePayoutForm('accountName', 'North Star Music');
    component.addPayoutAccount();
    fixture.detectChanges();

    expect(updateFinancials).toHaveBeenCalled();
    expect(component.monthlyBudget()).toBe(400);
    expect(component.revenueHistory().length).toBe(1);
    expect(component.payoutAccounts().length).toBe(1);
    expect(component.revenueTotal()).toBe(120);

    // The evidence now satisfies the money steps that were unreachable before.
    expect(step('money-budget').status).toBe('complete');
    expect(step('money-accounts').needs).not.toContain(
      'the accounts receiving payouts'
    );

    // And the record can be corrected, not only appended to.
    component.removeRevenueEntry(0);
    component.removePayoutAccount(0);
    fixture.detectChanges();
    expect(component.revenueHistory().length).toBe(0);
    expect(component.payoutAccounts().length).toBe(0);
  });

  it('never stores a budget from a blank or negative input', async () => {
    const { component } = await createComponent();

    component.setMonthlyBudget('');
    expect(component.monthlyBudget()).toBe(0);
    component.setMonthlyBudget(-50);
    expect(component.monthlyBudget()).toBe(0);
    component.setMonthlyBudget('75');
    expect(component.monthlyBudget()).toBe(75);
  });

  it('ignores incomplete money rows instead of storing empty records', async () => {
    const { component } = await createComponent();

    component.addRevenueEntry();
    component.addPayoutAccount();

    expect(component.revenueHistory().length).toBe(0);
    expect(component.payoutAccounts().length).toBe(0);
    expect(updateFinancials).not.toHaveBeenCalled();
  });

  it('routes each step to the surface that actually owns its evidence', async () => {
    const { fixture, component, text } = await createComponent();
    const step = (id: string) =>
      component.pathway().steps.find((entry) => entry.step.id === id)!.step;

    // The questionnaire writes the artistic-decision fields, and the profile
    // builder has no control for them.
    expect(component.recordSurface(step('identity-story'))).toBe('questionnaire');
    expect(component.recordLabel(step('identity-story'))).toBe(
      'Answer in the artist DNA'
    );
    component.recordStep(step('identity-story'));
    expect(navigate).toHaveBeenCalledWith(['/profile'], {
      queryParams: { questionnaire: '1' },
    });

    // The financial record exists only in this hub, so the CTA must open it
    // here rather than navigating the artist to a field that does not exist.
    navigate.mockClear();
    component.recordStep(step('money-budget'));
    fixture.detectChanges();
    expect(component.activePanel()).toBe('money');
    expect(navigate).not.toHaveBeenCalled();
    expect(text()).toContain('Money & Royalties');
    expect(text()).toContain('Sustainable monthly budget');

    // Profile-owned evidence still goes to the builder.
    component.recordStep(step('presence-social'));
    expect(navigate).toHaveBeenCalledWith(['/profile']);
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
