import {
  ARTIST_ROLES,
  ARTIST_ROLE_CHIPS,
  ARTIST_ROLE_IDS,
  ARTIST_ROLE_LABELS,
  artistRoleForAlias,
} from './artist-role.registry';
import { CHATBOT_COMMANDS, QUICK_COMMANDS } from '../components/chatbot/chatbot.commands';

describe('artist role registry', () => {
  it('covers every expert exactly once with unique lowercase aliases', () => {
    expect(ARTIST_ROLE_IDS.length).toBe(ARTIST_ROLES.length);
    expect(new Set(ARTIST_ROLE_IDS).size).toBe(ARTIST_ROLE_IDS.length);

    const aliases = ARTIST_ROLES.flatMap((definition) => definition.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const alias of aliases) {
      expect(alias).toBe(alias.toLowerCase());
      expect(alias).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('resolves every alias to its role, case-insensitively', () => {
    for (const definition of ARTIST_ROLES) {
      for (const alias of definition.aliases) {
        expect(artistRoleForAlias(alias)?.role).toBe(definition.role);
        expect(artistRoleForAlias(alias.toUpperCase())?.role).toBe(
          definition.role
        );
      }
    }
  });

  it('returns null for text that is not a role', () => {
    expect(artistRoleForAlias('vibes')).toBeNull();
    expect(artistRoleForAlias('')).toBeNull();
    expect(artistRoleForAlias('promo')).toBeNull();
  });

  it('keeps the surface and handoff graph inside the registry', () => {
    for (const definition of ARTIST_ROLES) {
      expect(definition.surface.route).toMatch(/^\/[a-z0-9/-]+$/);
      expect(definition.surface.label.length).toBeGreaterThan(0);

      const next = artistRoleForAlias(definition.nextDesk);
      expect(next).toBeTruthy();
      expect(next?.role).not.toBe(definition.role);
    }
  });

  it('builds quick chips only from curated roles and live aliases', () => {
    expect(ARTIST_ROLE_CHIPS.length).toBeGreaterThan(0);
    expect(ARTIST_ROLE_CHIPS.length).toBeLessThan(ARTIST_ROLES.length);
    for (const chip of ARTIST_ROLE_CHIPS) {
      expect(chip.label).toMatch(/^\/[a-z][a-z0-9-]*$/);
      expect(artistRoleForAlias(chip.label.slice(1))).toBeTruthy();
      expect(chip.description.trim().length).toBeGreaterThan(0);
    }
    expect(ARTIST_ROLE_CHIPS.map((chip) => chip.label)).toContain('/teach');
  });

  it('never shadows an existing chat command with a desk alias', () => {
    const deskChips = new Set(
      ARTIST_ROLE_CHIPS.map((chip) => chip.label.slice(1))
    );
    const reservedSlash = new Set(
      QUICK_COMMANDS.map((command) => command.label)
        .filter((label) => label.startsWith('/'))
        .map((label) => label.slice(1))
        .filter((name) => !deskChips.has(name))
    );
    const reservedWords = new Set(
      CHATBOT_COMMANDS.map((command) => command.command.toLowerCase())
    );

    for (const definition of ARTIST_ROLES) {
      for (const alias of definition.aliases) {
        expect(reservedSlash.has(alias)).toBe(false);
        expect(reservedWords.has(alias)).toBe(false);
      }
    }

    // The promotion plan keeps /promo; the desk is /promotion.
    expect(reservedSlash.has('promo')).toBe(true);
    expect(artistRoleForAlias('promo')).toBeNull();
  });

  it('owns the labels the fine-tune prompt and desks display', () => {
    expect(ARTIST_ROLE_LABELS.ar).toBe('A&R');
    expect(ARTIST_ROLE_LABELS.ceo).toBe('CEO');
    expect(ARTIST_ROLE_LABELS.teacher).toBe('Teacher');
    expect(ARTIST_ROLE_LABELS.manager).toBe('Manager');
    expect(artistRoleForAlias('teach')?.label).toBe('Teacher');
  });
});
