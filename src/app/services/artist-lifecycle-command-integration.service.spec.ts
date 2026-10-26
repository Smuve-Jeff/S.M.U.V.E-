import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistLifecycleCommandIntegrationService } from './artist-lifecycle-command-integration.service';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import { CommandPaletteService, CommandPaletteAction } from './command-palette.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import { UIService } from './ui.service';
import type { UserProfile } from '../types/profile.types';

/**
 * The palette is another surface for the same lifecycle, so these tests hold it
 * to the same rule as the Hub: it may only offer the pathway's own next move,
 * and a blocked phase is described as a dependency, never as work to do.
 */
describe('Artist lifecycle palette wiring', () => {
  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  const actionsAfterTick = (
    palette: { setExtensionActions: jest.Mock },
    tick: () => void
  ): CommandPaletteAction[] => {
    tick();
    return palette.setExtensionActions.mock.calls.at(-1)![1];
  };

  const setup = (value: UserProfile) => {
    const profileSignal = signal(value);
    const palette = { setExtensionActions: jest.fn() };
    const ui = { navigateToView: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: UserProfileService, useValue: { profile: profileSignal } },
        { provide: CommandPaletteService, useValue: palette },
        { provide: UIService, useValue: ui },
      ],
    });
    TestBed.inject(ArtistLifecycleCommandIntegrationService);
    return {
      profileSignal,
      palette,
      ui,
      lifecycle: TestBed.inject(ArtistLifecycleService),
      tick: () => TestBed.tick(),
    };
  };

  it('offers the pathway next move with the phase that owns it', () => {
    const { palette, ui, lifecycle, profileSignal, tick } = setup(profile());
    const actions = actionsAfterTick(palette, tick);

    const move = lifecycle.snapshot(profileSignal()).nextBestMove!;
    const next = actions.find((action) => action.id === 'lifecycle-next-move')!;
    expect(next).toBeDefined();
    expect(next.label).toBe(`Next move: ${move.title}`);
    expect(next.description).toContain(move.action);
    expect(next.category).toBe('Lifecycle');

    next.run();
    expect(ui.navigateToView).toHaveBeenCalledWith('artist-development');
  });

  it('describes blocked phases as dependencies rather than tasks', () => {
    const { palette, lifecycle, profileSignal, tick } = setup(profile());
    const actions = actionsAfterTick(palette, tick);
    const snapshot = lifecycle.snapshot(profileSignal());

    const blocked = actions.filter((action) => action.id.startsWith('lifecycle-blocked-'));
    const atRisk = snapshot.phases.filter((phase) => phase.status === 'at-risk');
    expect(atRisk.length).toBeGreaterThan(0);
    expect(blocked.length).toBe(Math.min(3, atRisk.length));
    for (const action of blocked) {
      const phase = snapshot.phases.find(
        (entry) => action.id === `lifecycle-blocked-${entry.id}`
      )!;
      expect(phase.status).toBe('at-risk');
      expect(action.label).toBe(`Blocked: ${phase.label}`);
      expect(action.description).toContain(phase.blockedBy[0]);
      expect(action.description.startsWith('Waiting on')).toBe(true);
    }
  });

  it('republishes when the profile changes instead of caching the first read', () => {
    const { palette, ui, profileSignal, tick } = setup(profile());
    const before = actionsAfterTick(palette, tick);

    profileSignal.update((current) => ({ ...current, artistName: '' }) as UserProfile);
    const after = actionsAfterTick(palette, tick);

    const identityBlocked = after.find(
      (action) => action.id === 'lifecycle-blocked-identity'
    );
    expect(identityBlocked).toBeDefined();
    expect(before.some((action) => action.id === 'lifecycle-blocked-identity')).toBe(
      false
    );
    identityBlocked!.run();
    expect(ui.navigateToView).toHaveBeenCalledWith('artist-development');
  });

  it('publishes under its own extension key so it cannot overwrite coach actions', () => {
    const { palette, tick } = setup(profile());
    tick();

    expect(palette.setExtensionActions).toHaveBeenCalledWith(
      'artist-lifecycle',
      expect.any(Array)
    );
  });
});
