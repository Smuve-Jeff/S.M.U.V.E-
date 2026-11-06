import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ArtistAiCoachComponent } from './artist-ai-coach.component';
import {
  UserProfileService,
  initialProfile,
  UserProfile,
} from '../../services/user-profile.service';

describe('ArtistAiCoachComponent', () => {
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
    const fixture = TestBed.createComponent(ArtistAiCoachComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('labels guidance as declared and never schedules a release', () => {
    const text = (render().nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('declared profile');
    expect(text).toContain('Not scheduled');
    expect(text).not.toMatch(/multiply revenue/i);
  });

  it('shows only general guidance when profile answers are private', () => {
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

    const text = (render().nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('General artist guidance');
    expect(text).toContain('Profile answers withheld');
  });
});
