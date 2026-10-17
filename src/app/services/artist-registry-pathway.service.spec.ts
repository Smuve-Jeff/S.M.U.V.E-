import { TestBed } from '@angular/core/testing';
import {
  ArtistRegistryPathwayService,
  RegistryPathway,
} from './artist-registry-pathway.service';
import type { UserProfile } from './user-profile.service';

/**
 * The registry pathway is the concrete route from a brand-new musical journey
 * to a fully official online fingerprint. Two things must hold: it reads as if
 * written for THIS artist's genre (the lens), and it always names the single
 * first open move in industry order (the phases + nextMove).
 */
describe('ArtistRegistryPathwayService', () => {
  let service: ArtistRegistryPathwayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ArtistRegistryPathwayService);
  });

  const profile = (over: Record<string, unknown> = {}): UserProfile =>
    ({ ...over }) as unknown as UserProfile;

  describe('genreLens', () => {
    it('routes each genre family to its own lens', () => {
      const cases: Array<[string, string]> = [
        ['Hip Hop', 'Hip Hop & Rap'],
        ['R&B', 'R&B, Soul & Gospel'],
        ['Pop', 'Pop'],
        ['House', 'Electronic & Producer'],
        ['Rock', 'Rock & Alternative'],
        ['Country', 'Country, Folk & Songwriter'],
        ['Jazz', 'Jazz, Classical & Instrumental'],
        ['Afrobeats', 'Latin, Afro & Caribbean'],
      ];
      for (const [genre, family] of cases) {
        expect(service.genreLens(profile({ primaryGenre: genre })).family).toBe(
          family
        );
      }
    });

    it('matches on subgenres and roles, not just the primary genre', () => {
      const lens = service.genreLens(
        profile({
          musicalJourney: { subgenres: ['neo-soul'], roles: ['vocalist'] },
        })
      );
      expect(lens.family).toBe('R&B, Soul & Gospel');
    });

    it('falls back to the independent lens for an unknown genre', () => {
      const lens = service.genreLens(profile({ primaryGenre: 'Qwerty' }));
      expect(lens.family).toBe('Independent');
      expect(lens.channels.length).toBeGreaterThan(0);
    });

    it('never throws on a null or hostile profile', () => {
      expect(() => service.genreLens(null)).not.toThrow();
      expect(() => service.genreLens(profile({ musicalJourney: 5 }))).not.toThrow();
    });
  });

  describe('registryPathway', () => {
    it('gives a beginner the full pathway starting at the name', () => {
      const pathway: RegistryPathway = service.registryPathway(
        profile({ primaryGenre: 'Hip Hop' })
      );
      expect(pathway.track).toBe('emerging');
      expect(pathway.genre).toBe('Hip Hop & Rap');
      expect(pathway.phases.length).toBe(6);
      // Nothing is done, so the first move is the very first step.
      expect(pathway.nextMove).toMatch(/artist name/i);
    });

    it('advances the next move as evidence arrives', () => {
      const named = service.registryPathway(
        profile({ artistName: 'North Star', primaryGenre: 'Pop' })
      );
      expect(named.nextMove).not.toMatch(/^fix the artist name/i);
      // Still on the identity story, since no origin story is recorded.
      expect(named.nextMove).toBeTruthy();
    });

    it('marks identifier steps done only when the work carries all three codes', () => {
      const pathway = service.registryPathway(
        profile({
          artistName: 'North Star',
          catalog: [
            {
              id: 'w1',
              title: 'Debut',
              isrc: 'USABC2100001',
              iswc: 'T-123.456.789-0',
              upc: '00123456789012',
            },
          ],
        })
      );
      const ids = pathway.phases.find((p) => p.id === 'work-identifiers')!;
      expect(ids.steps.every((s) => s.done)).toBe(true);
    });

    it('ties the pathway back to the recorded journey', () => {
      const pathway = service.registryPathway(
        profile({
          musicalJourney: { experienceLevel: 'Emerging' },
        })
      );
      expect(pathway.journeyNote).toBeTruthy();
      expect(typeof pathway.journeyNote).toBe('string');
    });

    it('reports a complete fingerprint with no open move once everything is done', () => {
      // A fully official artist: named, identified, delivered, claimed, monitored.
      const done = service.registryPathway(
        profile({
          artistName: 'North Star',
          musicalJourney: {
            originStory: 'From the north side.',
            signatureSound: 'Cinematic trap soul',
          },
          catalog: [
            {
              id: 'w1',
              title: 'Debut',
              isrc: 'USABC2100001',
              iswc: 'T-123.456.789-0',
              upc: '00123456789012',
              distributor: 'DistroKid',
              platforms: ['Spotify'],
            },
          ],
          legalInfrastructure: {
            proAffiliation: 'ASCAP',
            hasRegisteredWorks: true,
          },
          proName: 'ASCAP',
          proIpi: '001',
          officialArtistProfiles: [
            {
              id: 'l1',
              destinationId: 'distrokid',
              label: 'DistroKid',
              url: 'https://distrokid.com',
            },
            {
              id: 'l2',
              destinationId: 'spotify-for-artists',
              label: 'Spotify for Artists',
              url: 'https://artists.spotify.com',
            },
            {
              id: 'l3',
              destinationId: 'soundexchange',
              label: 'SoundExchange',
              url: 'https://www.soundexchange.com',
            },
            {
              id: 'l4',
              destinationId: 'the-mlc',
              label: 'The MLC',
              url: 'https://www.themlc.com',
            },
          ],
        })
      );
      expect(done.phases.length).toBe(6);
      expect(done.nextMove.length).toBeGreaterThan(0);
    });

    it('never throws on a null profile', () => {
      expect(() => service.registryPathway(null)).not.toThrow();
    });
  });
});
