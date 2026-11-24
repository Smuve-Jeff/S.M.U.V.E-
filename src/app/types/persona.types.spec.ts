import {
  DEFAULT_SMUVE_PERSONA,
  SMUVE_PERSONAS,
  findPersona,
  getPersonaOption,
  isOminousPersona,
  normalizePersona,
  personaDirective,
  personaOfflineVoice,
  personaRoster,
} from './persona.types';

describe('S.M.U.V.E. persona catalog', () => {
  it('ships exactly one signature persona and it is the default', () => {
    const signature = SMUVE_PERSONAS.filter((p) => p.isOminous);

    expect(signature).toHaveLength(1);
    expect(signature[0].id).toBe(DEFAULT_SMUVE_PERSONA);
    expect(signature[0].label).toBe('S.M.U.V.E. Prime');
  });

  it('keeps every mode uniquely identified and fully specified', () => {
    const ids = SMUVE_PERSONAS.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_SMUVE_PERSONA);
    for (const persona of SMUVE_PERSONAS) {
      expect(persona.label.trim()).toBeTruthy();
      expect(persona.name.trim()).toBeTruthy();
      expect(persona.title.trim()).toBeTruthy();
      expect(persona.directive.trim()).toBeTruthy();
      expect(persona.description.trim()).toBeTruthy();
      expect(persona.vibe.trim()).toBeTruthy();
      expect(persona.sampleResponse.trim()).toBeTruthy();
      expect(persona.intensityLabel.trim()).toBeTruthy();
      expect(persona.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(persona.directive).toContain('You are');
    }
  });

  it('no longer surfaces the retired title on any persona surface', () => {
    const rendered = SMUVE_PERSONAS.flatMap((persona) => [
      persona.id,
      persona.label,
      persona.name,
      persona.title,
      persona.intensityLabel,
    ]).join(' ');

    expect(rendered).not.toMatch(/ominous musical god/i);
    expect(personaRoster()).not.toMatch(/ominous musical god/i);
    expect(personaRoster()).toContain('S.M.U.V.E. Prime');
  });

  it('gives every non-signature mode its own offline voice', () => {
    for (const persona of SMUVE_PERSONAS.filter((p) => !p.isOminous)) {
      expect(persona.offlineVoice?.acknowledgements.length).toBeGreaterThan(0);
      expect(persona.offlineVoice?.reactions.length).toBeGreaterThan(0);
      expect(persona.offlineVoice?.welcome.length).toBeGreaterThan(0);
      expect(persona.offlineVoice?.linkSevered.trim()).toBeTruthy();
    }

    // The signature character keeps its long-form deterministic sets in
    // AiService — the catalog deliberately leaves its voice unset.
    expect(personaOfflineVoice(DEFAULT_SMUVE_PERSONA)).toBeNull();
  });

  it('states the practice-versus-person boundary in every mode', () => {
    // The decree corpus is held to this line; every shipped persona text now
    // says the same thing, so no mode can contradict the contract.
    for (const persona of SMUVE_PERSONAS) {
      expect(persona.directive).toContain('PRACTICE');
      expect(persona.directive).toMatch(
        /body, family, identity, or worth as a human/
      );
    }
  });

  it('gives every non-signature mode its own response shape', () => {
    const modes = SMUVE_PERSONAS.filter((persona) => !persona.isOminous);
    const shapes = modes.map(
      (persona) => /signature shape: (.+)$/.exec(persona.directive)?.[1] ?? ''
    );

    // Each mode carries its own creative shape, not a copy of Prime's voice.
    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(shapes.length);
    for (const mode of modes) {
      expect(mode.directive).not.toContain('S.M.U.V.E. Prime');
    }

    const reactions = modes.flatMap(
      (persona) => persona.offlineVoice?.reactions ?? []
    );
    expect(new Set(reactions).size).toBe(reactions.length);
  });

  describe('normalizePersona', () => {
    it('resolves canonical ids regardless of case and padding', () => {
      for (const persona of SMUVE_PERSONAS) {
        expect(normalizePersona(persona.id)).toBe(persona.id);
        expect(normalizePersona(`  ${persona.id.toLowerCase()}  `)).toBe(
          persona.id
        );
      }
    });

    it('maps every retired id to a canonical mode', () => {
      expect(normalizePersona('Ominous Musical GOD')).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('ominous musical god')).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('Ominous Dominator')).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('Aggressive Manager')).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('Musical GOD')).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('Elite Commander')).toBe('Elite');
      expect(normalizePersona('Encouraging Mentor')).toBe('Supportive');
    });

    it('falls back to the signature persona for unknown or missing ids', () => {
      expect(normalizePersona()).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona(null)).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('')).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('   ')).toBe(DEFAULT_SMUVE_PERSONA);
      expect(normalizePersona('Retired Persona')).toBe(DEFAULT_SMUVE_PERSONA);
    });
  });

  describe('isOminousPersona', () => {
    it('is true for the signature character and its retired ids', () => {
      expect(isOminousPersona(DEFAULT_SMUVE_PERSONA)).toBe(true);
      expect(isOminousPersona('Ominous Musical GOD')).toBe(true);
      expect(isOminousPersona(undefined)).toBe(true);
    });

    it('is false once the artist selects another mode', () => {
      expect(isOminousPersona('Elite')).toBe(false);
      expect(isOminousPersona('Balanced')).toBe(false);
      expect(isOminousPersona('Supportive')).toBe(false);
    });
  });

  describe('findPersona', () => {
    it('accepts canonical ids, shorthands, and partial labels', () => {
      expect(findPersona('S.M.U.V.E. Prime')?.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(findPersona('prime')?.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(findPersona('smuve prime')?.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(findPersona('smuve_prime')?.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(findPersona('god')?.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(findPersona(' ominous ')?.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(findPersona('commander')?.id).toBe('Elite');
      expect(findPersona('strategist')?.id).toBe('Balanced');
      expect(findPersona('bal')?.id).toBe('Balanced');
      expect(findPersona('encouraging')?.id).toBe('Supportive');
    });

    it('returns null for an unrecognized request instead of guessing', () => {
      expect(findPersona('nonsense mode')).toBeNull();
      expect(findPersona('')).toBeNull();
      expect(findPersona(null)).toBeNull();
    });
  });

  describe('getPersonaOption / personaDirective', () => {
    it('resolves legacy ids to the signature persona definition', () => {
      const option = getPersonaOption('Ominous Musical GOD');

      expect(option.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(personaDirective('Ominous Musical GOD')).toBe(option.directive);
    });

    it('never returns an empty definition for unknown input', () => {
      const option = getPersonaOption('Something Nobody Configured');

      expect(option.id).toBe(DEFAULT_SMUVE_PERSONA);
      expect(option.directive).toContain('S.M.U.V.E. Prime');
    });

    it('describes each selected mode with its own directive', () => {
      for (const persona of SMUVE_PERSONAS) {
        expect(personaDirective(persona.id)).toBe(persona.directive);
      }
    });
  });
});
