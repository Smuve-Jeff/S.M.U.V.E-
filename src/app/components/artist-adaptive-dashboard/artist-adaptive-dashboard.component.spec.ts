import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistAdaptiveDashboardComponent } from './artist-adaptive-dashboard.component';
import {
  UserProfileService,
  initialProfile,
  UserProfile,
} from '../../services/user-profile.service';

describe('ArtistAdaptiveDashboardComponent', () => {
  let profile: ReturnType<typeof signal<UserProfile>>;

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  const baseProfile = (): UserProfile => {
    const seeded = clone(initialProfile);
    seeded.settings.security = {
      ...seeded.settings.security,
      shareProfileAnswersWithAi: true,
    };
    return seeded;
  };

  beforeEach(() => {
    profile = signal(baseProfile());
    TestBed.configureTestingModule({
      providers: [{ provide: UserProfileService, useValue: { profile } }],
    });
  });

  const render = () => {
    const fixture = TestBed.createComponent(ArtistAdaptiveDashboardComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('names readiness as declared and shows the evidence it reads', () => {
    const element = render().nativeElement as HTMLElement;
    const text = element.textContent ?? '';

    expect(text).toContain('Declared Live Readiness');
    expect(text).toContain('Declared Sync Asset Readiness');
    expect(text).toContain('What This Adaptation Reads');
    expect(text).toContain('not verified bookings');
    expect(element.querySelector('.dna-signature')).not.toBeNull();
  });

  it('withholds the musical DNA when profile answers are private from AI', () => {
    profile.update((current) => ({
      ...current,
      settings: {
        ...current.settings,
        security: {
          ...current.settings.security,
          shareProfileAnswersWithAi: false,
        },
      },
    }));

    const element = render().nativeElement as HTMLElement;

    expect(element.textContent).toContain('Withheld');
    expect(element.querySelector('.dna-signature')).toBeNull();
  });
});
