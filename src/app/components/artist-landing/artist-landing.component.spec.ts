import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ArtistLandingComponent } from './artist-landing.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { ArtistOnlineFingerprintService } from '../../services/artist-online-fingerprint.service';
import { EnhancedArtistQuestionnaireEngine } from '../../services/enhanced-artist-questionnaire-engine';
import type { UserProfile } from '../../types/profile.types';

describe('ArtistLandingComponent', () => {
  let profile: ReturnType<typeof signal<UserProfile>>;

  const createComponent = async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ArtistLandingComponent],
      providers: [
        { provide: UserProfileService, useValue: { profile } },
        { provide: AiService, useValue: { getUpgradeRecommendations: () => [] } },
        {
          provide: ArtistOnlineFingerprintService,
          useClass: ArtistOnlineFingerprintService,
        },
        {
          provide: EnhancedArtistQuestionnaireEngine,
          useValue: {
            calculateStrength: () => ({
              identityClarity: 0,
              musicalDepth: 0,
              technicalAbility: 0,
              businessReadiness: 0,
              brandDefinition: 0,
              aiIntegration: 0,
            }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ArtistLandingComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      text: () => (fixture.nativeElement as HTMLElement).textContent ?? '',
      anchors: () =>
        Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll('a')
        ),
    };
  };

  beforeEach(() => {
    localStorage.clear();
    profile = signal<UserProfile>({ artistName: 'Nova' } as UserProfile);
  });

  afterEach(() => localStorage.clear());

  /**
   * The page used to decide which platforms the artist is on by reading
   * `profile.services` — the production services chip group ("Stem delivery",
   * "Mixing") — so it advertised Spotify, Apple and TikTok buttons for artists
   * who had never claimed them, and every one of those buttons pointed at "#".
   */
  describe('public platform links', () => {
    it('shows no platform buttons for an artist with nothing recorded', async () => {
      const { component, text, anchors } = await createComponent();

      expect(component.socialLinks()).toEqual([]);
      expect(anchors().length).toBe(0);
      expect(text()).toContain('Online');
      expect(text()).toContain('Fingerprint');
    });

    it('does not treat the services chip list as platform presence', async () => {
      profile.set({
        artistName: 'Nova',
        services: ['Spotify', 'Apple Music', 'TikTok'],
      } as unknown as UserProfile);

      const { component, anchors } = await createComponent();

      expect(component.socialLinks()).toEqual([]);
      expect(anchors().length).toBe(0);
    });

    it('renders the links the artist recorded, pointing at their own URLs', async () => {
      profile.set({
        artistName: 'Nova',
        website: 'https://novaflux.example.com',
        officialArtistProfiles: [
          {
            id: 'spotify-for-artists',
            destinationId: 'spotify-for-artists',
            url: 'https://artists.spotify.com/nova',
            verified: true,
          },
          {
            id: 'chartmetric',
            destinationId: 'chartmetric',
            url: 'https://chartmetric.com/artist/nova',
            verified: false,
          },
        ],
      } as unknown as UserProfile);

      const { component, text, anchors } = await createComponent();

      const labels = component.socialLinks().map((link) => link.label);
      expect(labels).toContain('Spotify for Artists');
      expect(labels).toContain('Chartmetric');
      expect(labels).toContain('Website');

      const hrefs = anchors().map((anchor) => anchor.getAttribute('href'));
      expect(hrefs).toContain('https://artists.spotify.com/nova');
      expect(hrefs).toContain('https://chartmetric.com/artist/nova');
      expect(hrefs).toContain('https://novaflux.example.com');
      // Every rendered link is navigable: no dead "#" buttons on a public page.
      expect(hrefs.every((href) => href && href.startsWith('https://'))).toBe(
        true
      );
      expect(text()).toContain('Spotify for Artists');
    });

    it('drops an unusable address rather than printing a dead button', async () => {
      profile.set({
        artistName: 'Nova',
        officialArtistProfiles: [
          {
            id: 'spotify-for-artists',
            destinationId: 'spotify-for-artists',
            url: '',
          },
          {
            id: 'chartmetric',
            destinationId: 'chartmetric',
            url: 'not-a-url',
          },
        ],
      } as unknown as UserProfile);

      const { component } = await createComponent();

      expect(component.socialLinks()).toEqual([]);
    });

    it('lists each address once, even when recorded twice', async () => {
      profile.set({
        artistName: 'Nova',
        officialArtistProfiles: [
          {
            id: 'spotify-for-artists',
            destinationId: 'spotify-for-artists',
            url: 'https://artists.spotify.com/nova',
            verified: true,
          },
          {
            id: 'spotify-again',
            destinationId: 'spotify-for-artists',
            url: 'https://artists.spotify.com/nova',
          },
        ],
      } as unknown as UserProfile);

      const { component } = await createComponent();

      const spotify = component
        .socialLinks()
        .filter((link) => link.label === 'Spotify for Artists');
      expect(spotify.length).toBe(1);
    });
  });
});
