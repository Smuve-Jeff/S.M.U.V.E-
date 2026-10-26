import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistLifecycleAlertService } from './artist-lifecycle-alert.service';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import type { UserProfile } from '../types/profile.types';

/**
 * These tests are about restraint as much as detection: an artist opening the
 * app must see nothing until something actually changes, and every alert must
 * quote the snapshot values that raised it.
 */
describe('ArtistLifecycleAlertService', () => {
  const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
    JSON.parse(JSON.stringify({ ...initialProfile, ...overrides })) as UserProfile;

  /** An artist with a saved name, so the identity phase starts unblocked. */
  const named = (): UserProfile => profile({ artistName: 'Nova' });

  /** The same artist with the name cleared, which blocks the identity phase. */
  const unnamed = (): UserProfile => profile({ artistName: '' });

  let lifecycle: ArtistLifecycleService;

  const configure = (hydrated: boolean) => {
    const profileSignal = signal(named());
    TestBed.configureTestingModule({
      providers: [
        ArtistLifecycleAlertService,
        {
          provide: UserProfileService,
          useValue: { profile: profileSignal, hydrated: signal(hydrated) },
        },
      ],
    });
    lifecycle = TestBed.inject(ArtistLifecycleService);
    return { service: TestBed.inject(ArtistLifecycleAlertService), profileSignal };
  };

  it('stays silent on the first snapshot instead of announcing existing state', () => {
    const { service } = configure(false);

    service.observe(lifecycle.snapshot(named()));

    expect(service.alerts()).toEqual([]);
  });

  it('raises a blocked phase, quoting the step that is holding it up', () => {
    const { service } = configure(false);
    service.observe(lifecycle.snapshot(named()));

    const blocked = lifecycle.snapshot(unnamed());
    service.observe(blocked);

    const alert = service.alerts().find((entry) => entry.kind === 'blocked');
    expect(alert).toBeDefined();
    expect(alert!.phase).toBe('identity');
    expect(alert!.severity).toBe('warning');

    const identity = blocked.phases.find((phase) => phase.id === 'identity')!;
    expect(identity.status).toBe('at-risk');
    // The evidence is the snapshot's own blocking titles, not invented prose.
    expect(identity.blockedBy.length).toBeGreaterThan(0);
    expect(alert!.evidence[0]).toBe(identity.blockedBy[0]);
    expect(alert!.message).toContain(identity.blockedBy[0]);
  });

  it('reports the phase clearing once the missing evidence is added', () => {
    const { service } = configure(false);
    service.observe(lifecycle.snapshot(unnamed()));

    service.observe(lifecycle.snapshot(named()));

    const alert = service.alerts().find((entry) => entry.kind === 'unblocked');
    expect(alert).toBeDefined();
    expect(alert!.phase).toBe('identity');
    expect(alert!.severity).toBe('info');
    expect(alert!.message).toContain('evidenced');
  });

  it('announces the new next move with the evidence it needs', () => {
    const { service } = configure(false);
    service.observe(lifecycle.snapshot(unnamed()));

    const moved = lifecycle.snapshot(named());
    service.observe(moved);

    const alert = service.alerts().find((entry) => entry.kind === 'next-move');
    expect(alert).toBeDefined();
    const task = moved.tasks.find((entry) => entry.id === moved.nextBestMove?.id)!;
    expect(alert!.title).toContain(task.title);
    if (task.evidenceNeeded.length) {
      expect(alert!.evidence).toContain(task.evidenceNeeded[0]);
    }
  });

  it('does not repeat itself when the snapshot has not changed', () => {
    const { service } = configure(false);
    service.observe(lifecycle.snapshot(named()));
    service.observe(lifecycle.snapshot(unnamed()));

    const afterChange = service.alerts().length;
    expect(afterChange).toBeGreaterThan(0);

    service.observe(lifecycle.snapshot(unnamed()));
    expect(service.alerts()).toHaveLength(afterChange);
  });

  it('keeps a dismissed alert dismissed', () => {
    const { service } = configure(false);
    service.observe(lifecycle.snapshot(named()));
    service.observe(lifecycle.snapshot(unnamed()));

    const [first] = service.alerts();
    service.dismiss(first.id);

    expect(service.alerts().map((alert) => alert.id)).not.toContain(first.id);
    service.observe(lifecycle.snapshot(unnamed()));
    expect(service.alerts().map((alert) => alert.id)).not.toContain(first.id);
  });

  describe('across sessions', () => {
    const configureWith = (value: UserProfile) => {
      const profileSignal = signal(value);
      const updateProfile = jest.fn().mockResolvedValue(undefined);
      TestBed.configureTestingModule({
        providers: [
          ArtistLifecycleAlertService,
          {
            provide: UserProfileService,
            useValue: {
              profile: profileSignal,
              hydrated: signal(true),
              updateProfile,
            },
          },
        ],
      });
      lifecycle = TestBed.inject(ArtistLifecycleService);
      return {
        service: TestBed.inject(ArtistLifecycleAlertService),
        profileSignal,
        updateProfile,
      };
    };

    /** A snapshot computed from a profile, as the last save would have stored it. */
    const storedSnapshot = (value: UserProfile) => {
      TestBed.configureTestingModule({ providers: [] });
      const snapshotter = TestBed.inject(ArtistLifecycleService);
      const snapshot = snapshotter.snapshot(value);
      TestBed.resetTestingModule();
      return snapshot;
    };

    it('reports a change that happened while the app was closed', async () => {
      const stored = storedSnapshot(named());
      const { service, updateProfile } = configureWith({
        ...unnamed(),
        artistLifecycleSnapshot: stored,
      } as UserProfile);

      await TestBed.flushEffects();

      const blocked = service
        .alerts()
        .find((alert) => alert.kind === 'blocked' && alert.phase === 'identity');
      expect(blocked).toBeDefined();
      expect(blocked!.evidence.length).toBeGreaterThan(0);
      // The reported change is folded into the saved baseline, so the next
      // launch does not raise the same alert again.
      expect(updateProfile).toHaveBeenCalled();
    });

    it('stays quiet when the saved snapshot matches the current state', async () => {
      const stored = storedSnapshot(named());
      const { service, updateProfile } = configureWith({
        ...named(),
        artistLifecycleSnapshot: stored,
      } as UserProfile);

      await TestBed.flushEffects();

      expect(service.alerts()).toEqual([]);
      expect(updateProfile).not.toHaveBeenCalled();
    });

    it('ignores a saved snapshot from an older or broken schema', async () => {
      const legacy = {
        generatedAt: '2025-01-01T00:00:00.000Z',
        overallScore: 0,
        phases: 'not-an-array',
      } as unknown as UserProfile['artistLifecycleSnapshot'];

      const { service, updateProfile } = configureWith({
        ...unnamed(),
        artistLifecycleSnapshot: legacy,
      } as UserProfile);

      await TestBed.flushEffects();

      // No crash, no guessed alert, and no baseline write.
      expect(service.alerts()).toEqual([]);
      expect(updateProfile).not.toHaveBeenCalled();
    });
  });

  it('watches the saved profile only after it is hydrated', async () => {
    const { service, profileSignal } = configure(true);
    expect(service.alerts()).toEqual([]);

    // The placeholder profile is not diffed: no alerts on startup.
    await TestBed.flushEffects();
    expect(service.alerts()).toEqual([]);

    profileSignal.update((current) => ({ ...current, artistName: '' }));
    await TestBed.flushEffects();

    expect(service.alerts().length).toBeGreaterThan(0);
    expect(service.alerts().every((alert) => alert.evidence.length > 0)).toBe(true);
  });
});
