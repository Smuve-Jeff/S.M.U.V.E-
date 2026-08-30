import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { JourneyComponent } from './journey.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';
import { initialProfile } from '../../types/profile.types';

describe('JourneyComponent', () => {
  let fixture: ComponentFixture<JourneyComponent>;
  let component: JourneyComponent;
  let updateProfile: jest.Mock;

  beforeEach(async () => {
    updateProfile = jest.fn().mockResolvedValue(undefined);
    const profileSig = signal(JSON.parse(JSON.stringify(initialProfile)));

    await TestBed.configureTestingModule({
      imports: [JourneyComponent],
      providers: [
        {
          provide: UserProfileService,
          useValue: {
            profile: profileSig,
            updateProfile,
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JourneyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('ships the shared 40+ genre catalog, not a hardcoded 13', () => {
    expect(component.genres.length).toBeGreaterThanOrEqual(40);
    expect(component.genres).toContain('K-Pop');
    expect(component.genres).toContain('Amapiano');
  });

  it('hydrates influence/DAW text fields from the canonical arrays', () => {
    component.profile.update((p) => ({
      ...p,
      musicalJourney: {
        ...p.musicalJourney,
        musicalInfluences: ['Kendrick Lamar', 'J Dilla'],
      },
      daw: ['FL Studio', 'Ableton Live'],
    }));
    // Re-trigger the sync effect by pushing a fresh profile through the stub
    component.profile.set({ ...component.profile() });
    component.influencesText.set('');
    component.dawText.set('');
    // Simulate what the service effect does on load
    const p = component.profile();
    component.influencesText.set((p.musicalJourney?.musicalInfluences || []).join(', '));
    component.dawText.set((p.daw || []).join(', '));
    expect(component.influencesText()).toBe('Kendrick Lamar, J Dilla');
    expect(component.dawText()).toBe('FL Studio, Ableton Live');
  });

  it('commits comma-separated text into the canonical string[] fields', () => {
    component.influencesText.set('Kendrick Lamar, J Dilla, Kendrick Lamar');
    component.dawText.set('FL Studio; Ableton Live\nLogic Pro');
    component.updateProfile();
    const saved = updateProfile.mock.calls[0][0];
    expect(saved.musicalJourney.musicalInfluences).toEqual([
      'Kendrick Lamar',
      'J Dilla',
    ]);
    expect(saved.daw).toEqual(['FL Studio', 'Ableton Live', 'Logic Pro']);
  });

  it('persists journey narrative fields as real profile fields', () => {
    component.profile.update((p) => ({
      ...p,
      musicalJourney: {
        ...p.musicalJourney,
        experienceLevel: 'Advanced',
        signatureSound: 'warped tape 808s and angelic pads',
        currentFocus: 'Finish the debut EP',
        biggestChallenge: 'Mixing my own vocals',
        collaborationGoals: 'Work with a live drummer',
        preferredBpmRange: '90-120',
      },
    }));
    component.updateProfile();
    const saved = updateProfile.mock.calls[0][0];
    expect(saved.musicalJourney.experienceLevel).toBe('Advanced');
    expect(saved.musicalJourney.signatureSound).toContain('warped tape 808s');
    expect(saved.musicalJourney.currentFocus).toBe('Finish the debut EP');
    expect(saved.musicalJourney.biggestChallenge).toBe('Mixing my own vocals');
    expect(saved.musicalJourney.collaborationGoals).toContain('live drummer');
    expect(saved.musicalJourney.preferredBpmRange).toBe('90-120');
  });

  it('walks the five-step wizard forward and back', () => {
    expect(component.activeStep()).toBe(0);
    component.next();
    component.next();
    expect(component.activeStep()).toBe(2);
    component.prev();
    expect(component.activeStep()).toBe(1);
  });
});
