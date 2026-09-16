import { TestBed } from '@angular/core/testing';
import {
  UserProfileService,
  normalizeImportedProfile,
} from '../user-profile.service';
import { ProfileStoreService } from '../profile-store.service';
import { DatabaseService } from '../database.service';
import { AuthService } from '../auth.service';
import { LoggingService } from '../logging.service';
import { initialProfile } from '../../types/profile.types';

/**
 * A `.json` archive as the export button produces one. `File.text()` is not
 * implemented in the jsdom version this suite runs on, so the body is attached
 * directly — the service's own logic is what these tests are about.
 */
const archive = (data: unknown, name = 'archive.json'): File => {
  const json = JSON.stringify(data);
  const file = new File([json], name, { type: 'application/json' });
  if (typeof (file as { text?: unknown }).text !== 'function') {
    (file as unknown as { text: () => Promise<string> }).text = async () => json;
  }
  return file;
};

/**
 * The roster and the import path are the two pieces of the profile service the
 * profile builder drives directly: "Deploy Team Member" writes through the
 * roster rules, and "Import Archive" is the only way a profile arrives from
 * outside the app. Neither had coverage.
 */
describe('UserProfileService', () => {
  let service: UserProfileService;
  let savedProfiles: Array<{ profile: any; id: string }>;
  let database: {
    loadUserProfile: jest.Mock;
    saveUserProfile: jest.Mock;
  };

  beforeEach(() => {
    savedProfiles = [];
    TestBed.configureTestingModule({
      providers: [
        UserProfileService,
        ProfileStoreService,
        {
          provide: LoggingService,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            system: jest.fn(),
          },
        },
        // The service resolves auth lazily through the injector, so a plain
        // function mock is enough to key persistence.
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1' }) } },
        {
          provide: DatabaseService,
          useValue: (database = {
            loadUserProfile: jest.fn(async () => null),
            saveUserProfile: jest.fn(async (profile: any, id: string) => {
              savedProfiles.push({ profile, id });
            }),
          }),
        },
      ],
    });
    service = TestBed.inject(UserProfileService);
  });

  describe('team roster', () => {
    it('adds a collaborator with the roster defaults and returns the stored roster', async () => {
      const stored = await service.addTeamMember({ name: '  Dana  ' });

      expect(stored.team).toHaveLength(1);
      expect(stored.team[0]).toMatchObject({
        name: 'Dana',
        role: 'Collaborator',
        share: 0,
      });
      expect(stored.team[0].id).toBeTruthy();
      expect(stored.team[0].joinedAt).toBeTruthy();
    });

    it('keeps the drafted role when one is given', async () => {
      const stored = await service.addTeamMember({
        name: 'Kai',
        role: 'Tour Manager',
      });

      expect(stored.team[0].role).toBe('Tour Manager');
    });

    it('does not add the same name twice', async () => {
      await service.addTeamMember({ name: 'Dana' });
      const stored = await service.addTeamMember({ name: 'dana' });

      expect(stored.team).toHaveLength(1);
    });

    it('ignores a blank name instead of creating a nameless member', async () => {
      const stored = await service.addTeamMember({ name: '   ' });

      expect(stored.team).toHaveLength(0);
    });

    it('removes a member by id — a roster has to be able to shrink', async () => {
      const withMember = await service.addTeamMember({ name: 'Dana' });
      const id = withMember.team[0].id;

      const stored = await service.removeTeamMember(id);

      expect(stored.team).toHaveLength(0);
      // The removal is persisted, not just returned.
      expect(savedProfiles.at(-1)?.profile.team).toEqual([]);
    });

    it('ignores a removal with no id', async () => {
      await service.addTeamMember({ name: 'Dana' });

      const stored = await service.removeTeamMember('');

      expect(stored.team).toHaveLength(1);
    });
  });

  describe('profile import', () => {
    it('seeds a partial archive from the defaults instead of leaving panes broken', () => {
      const normalized = normalizeImportedProfile({
        artistName: 'Nova',
        settings: {} as any,
      });

      expect(normalized.artistName).toBe('Nova');
      expect(normalized.expertise.production).toBe(0);
      expect(normalized.financials.accounts).toEqual([]);
      expect(normalized.touringDetails.travelPreference).toBe('Van');
      expect(normalized.settings.ai.commanderPersona).toBe(
        initialProfile.settings.ai.commanderPersona
      );
    });

    it('keeps every roster a real list even when the archive says null', () => {
      const normalized = normalizeImportedProfile({
        artistName: 'Nova',
        settings: {} as any,
        team: null as any,
        pressGallery: null as any,
      });

      expect(normalized.team).toEqual([]);
      expect(normalized.pressGallery).toEqual([]);
    });

    it('repairs null nested arrays instead of passing them to the editor', () => {
      const normalized = normalizeImportedProfile({
        artistName: 'Nova',
        settings: {} as any,
        financials: {
          ...initialProfile.financials,
          accounts: null as any,
          splitSheets: null as any,
          revenueHistory: null as any,
        },
        touringDetails: { travelPreference: 'Bus', regions: null },
        musicalJourney: {
          ...initialProfile.musicalJourney,
          musicalInfluences: null as any,
          musicBlueprint: {
            ...initialProfile.musicalJourney.musicBlueprint,
            lyricalThemes: null as any,
          },
        },
      });

      expect(normalized.financials.accounts).toEqual([]);
      expect(normalized.financials.splitSheets).toEqual([]);
      expect(normalized.touringDetails.regions).toEqual([]);
      expect(normalized.musicalJourney.musicalInfluences).toEqual([]);
      expect(normalized.musicalJourney.musicBlueprint?.lyricalThemes).toEqual([]);
    });

    it('keeps the archive values that are present', () => {
      const normalized = normalizeImportedProfile({
        artistName: 'Nova',
        settings: { ai: { commanderPersona: 'Elite' } } as any,
        team: [
          {
            id: 'tm-1',
            name: 'Dana',
            role: 'Manager',
            share: 25,
            joinedAt: '2026-01-01',
          },
        ],
      });

      expect(normalized.settings.ai.commanderPersona).toBe('Elite');
      expect(normalized.settings.ai.aiProfanityEnabled).toBe(
        initialProfile.settings.ai.aiProfanityEnabled
      );
      expect(normalized.team).toHaveLength(1);
    });

    it('persists a normalized profile under the active user', async () => {
      const result = await service.importProfile(
        archive({ artistName: 'Nova', settings: {} })
      );

      expect(result).toBe(true);
      expect(service.profile().artistName).toBe('Nova');
      expect(service.profile().team).toEqual([]);
      expect(savedProfiles.at(-1)?.id).toBe('u1');
    });

    it('loads a partial cloud profile through the same normalization boundary', async () => {
      database.loadUserProfile.mockResolvedValueOnce({
        artistName: 'Nova',
        primaryGenre: 'Hip Hop',
        settings: {},
        financials: { accounts: null },
        team: null,
      });

      await service.loadProfile('u1');

      expect(service.profile().artistName).toBe('Nova');
      expect(service.profile().financials.accounts).toEqual([]);
      expect(service.profile().team).toEqual([]);
      expect(service.profile().settings.ai).toBeDefined();
    });

    it('rejects a file that is not a profile', async () => {
      await expect(
        service.importProfile(archive({ team: [] }))
      ).resolves.toBe(false);
    });
  });
});
