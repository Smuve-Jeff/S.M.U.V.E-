import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
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
      providers: [
        provideRouter([]),
        { provide: UserProfileService, useValue: { profile } },
      ],
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

  it('explains that genre advice is held until the interview is committed', () => {
    const element = render().nativeElement as HTMLElement;
    const text = element.textContent ?? '';

    expect(text).toContain('Genre advice is held');
    expect(text).toContain('committed and accepted');
    expect(text).toContain('not a read of your genre');
    // The held banner is the only place the hold is stated; the warnings card
    // must not repeat the sentence.
    expect(
      text.match(/Genre-specific tempo, structure and mix advice/g)
    ).toHaveLength(1);

    const link = element.querySelector('.held-note a') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/profile');
    expect(link?.textContent).toContain('Finish the artist interview');
  });

  it('drops the held note once the interview is committed', () => {
    profile.update((current) => ({
      ...current,
      artistName: 'Test Artist',
      primaryGenre: 'Country',
      profileSetupCompleted: true,
    }));

    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.held-note')).toBeNull();
    expect(element.textContent).toContain('Country Profile');
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
