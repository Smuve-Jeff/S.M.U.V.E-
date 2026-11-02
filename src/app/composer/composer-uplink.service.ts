import { Injectable, computed, inject } from '@angular/core';
import { UserProfileService, UserProfile } from '../services/user-profile.service';
import { readArtistProfile } from '../services/artist-profile-read';
import type { ComposerGate, ComposerBlocker, ComposerPersonalization, GenreProfile } from './composer.types';
import { GENRE_ATLAS, resolveGenre, resolveSubgenres } from './atlas';

/**
 * The uplink gate.
 *
 * S.M.U.V.E.'s interactive composition engine is not a generic beat machine.
 * It tailors every decision to the artist, so it stays locked until the artist
 * profile interview has actually been committed and S.M.U.V.E. has something
 * real to read. The gate explains exactly what is missing and where to fix it,
 * instead of failing silently or inventing a profile.
 */
@Injectable({ providedIn: 'root' })
export class ComposerUplinkService {
  private profiles = inject(UserProfileService);

  readonly profile = this.profiles.profile;

  private readonly primaryGenre = computed<GenreProfile | null>(() => {
    const profile = this.profile();
    return resolveGenre(profile?.primaryGenre);
  });

  /** The primary genre first, then any declared subgenre S.M.U.V.E. can read. */
  readonly allowedGenres = computed<GenreProfile[]>(() => {
    const profile = this.profile();
    const list: GenreProfile[] = [];
    const seen = new Set<string>();
    const primary = this.primaryGenre();
    if (primary) {
      list.push(primary);
      seen.add(primary.id);
    }
    for (const sub of resolveSubgenres(profile?.musicalJourney?.subgenres)) {
      if (!seen.has(sub.id)) {
        list.push(sub);
        seen.add(sub.id);
      }
    }
    return list;
  });

  readonly gate = computed<ComposerGate>(() => {
    const profile = this.profile();
    const read = readArtistProfile(profile);
    const genre = this.primaryGenre();
    const blockers: ComposerBlocker[] = [];

    if (profile?.profileSetupCompleted !== true) {
      blockers.push({
        id: 'interview',
        label: 'Artist profile interview not committed',
        detail:
          'S.M.U.V.E. composes against a profile, not against assumptions. Finish the artist interview so the genre, tempo zone and writing identity are on record.',
        fixRoute: '/profile',
        fixLabel: 'Finish the interview',
      });
    }

    if (!profile?.artistName || profile.artistName === 'New Artist') {
      blockers.push({
        id: 'identity',
        label: 'No artist identity',
        detail:
          'The engine signs every composition to an artist. Set the name you release under before S.M.U.V.E. writes for it.',
        fixRoute: '/profile',
        fixLabel: 'Set artist name',
      });
    }

    if (!profile?.primaryGenre) {
      blockers.push({
        id: 'genre',
        label: 'No primary genre declared',
        detail:
          'Genre is not decoration here — it decides tempo, groove, harmony and arrangement. Declare the genre you actually work in.',
        fixRoute: '/profile',
        fixLabel: 'Declare genre',
      });
    } else if (!genre) {
      blockers.push({
        id: 'genre-unresolved',
        label: `S.M.U.V.E. cannot read “${profile.primaryGenre}” yet`,
        detail:
          'That genre name does not map to a working rule set in the atlas. Pick the closest genre label, or add the specific subgenre so the engine can align.',
        fixRoute: '/profile',
        fixLabel: 'Adjust genre',
      });
    }

    if (profile?.profileSetupCompleted === true && !read.body.hasBody) {
      blockers.push({
        id: 'body',
        label: 'Profile is committed but empty',
        detail:
          'There is no sonic identity, writing blueprint or catalogue evidence for S.M.U.V.E. to adapt to. Fill in the musical body section of the profile.',
        fixRoute: '/profile',
        fixLabel: 'Complete musical body',
      });
    }

    const personalization = this.buildPersonalization(profile, genre);
    const ready = blockers.length === 0 && Boolean(genre);

    return {
      ready,
      genreLabel: genre?.label ?? (profile?.primaryGenre || 'Not declared'),
      genre,
      blockers,
      personalization,
      allowedGenres: this.allowedGenres().map((entry) => entry.label),
    };
  });

  readonly ready = computed(() => this.gate().ready);

  /** Genre catalogue the artist may request; empty until the gate opens. */
  readonly availableGenres = computed(() => {
    const allowed = this.allowedGenres();
    if (!this.gate().ready) return [];
    const primary = this.primaryGenre();
    const rest = GENRE_ATLAS.filter(
      (genre) => !allowed.some((entry) => entry.id === genre.id)
    );
    // The profile genre leads; the rest of the atlas is offered as a deliberate
    // expansion, flagged so the artist knows it is outside their declaration.
    return [
      ...allowed,
      ...(primary
        ? rest.filter(
            (genre) =>
              genre.family === primary.family && !allowed.some((entry) => entry.id === genre.id)
          )
        : []),
    ];
  });

  /** True when the requested genre is inside what the profile declared. */
  isDeclaredGenre(genreId: string): boolean {
    return this.allowedGenres().some((genre) => genre.id === genreId);
  }

  /** Lines S.M.U.V.E. appends to a composition so adaptation is auditable. */
  personalizationLines(genre: GenreProfile): string[] {
    const personalization = this.gate().personalization;
    if (!this.gate().ready) return [];
    const lines: string[] = [];
    if (personalization.signatureSound) {
      lines.push(
        `Your declared signature is “${personalization.signatureSound}”, so the lead is voiced to leave that space open.`
      );
    }
    if (personalization.tempoHint) {
      lines.push(
        `Your tempo zone is ${personalization.tempoHint[0]}–${personalization.tempoHint[1]} BPM; this pass sits at ${genre.bpm[0]}–${genre.bpm[1]} because that is where ${genre.label} actually lives.`
      );
    }
    if (personalization.grooveNote) {
      lines.push(`Profile groove note carried into the pocket: ${personalization.grooveNote}.`);
    }
    if (personalization.harmonyNote) {
      lines.push(`Profile harmonic language applied: ${personalization.harmonyNote}.`);
    }
    if (personalization.arrangementNote) {
      lines.push(`Profile arrangement preference: ${personalization.arrangementNote}.`);
    }
    if (personalization.influences.length) {
      lines.push(
        `Reference lane: ${personalization.influences.slice(0, 3).join(', ')} — used as a direction, never copied.`
      );
    }
    return lines;
  }

  private buildPersonalization(
    profile: UserProfile | null | undefined,
    genre: GenreProfile | null
  ): ComposerPersonalization {
    const journey: any = profile?.musicalJourney ?? {};
    const blueprint: any = journey.musicBlueprint ?? {};

    let tempoHint: [number, number] | null = null;
    const tempoText = String(journey.preferredBpmRange ?? '');
    const tempoMatch = tempoText.match(/(\d{2,3})\s*(?:-|–|to)\s*(\d{2,3})/i);
    if (tempoMatch) {
      const low = Number(tempoMatch[1]);
      const high = Number(tempoMatch[2]);
      if (Number.isFinite(low) && Number.isFinite(high) && low > 30 && high > low) {
        tempoHint = [low, high];
      }
    } else if (/^\d{2,3}$/.test(tempoText.trim())) {
      const bpm = Number(tempoText.trim());
      if (bpm > 30) tempoHint = [bpm - 6, bpm + 6];
    }

    return {
      artistName: profile?.artistName || 'Unnamed artist',
      genre: genre?.label ?? profile?.primaryGenre ?? '',
      subgenres: resolveSubgenres(journey.subgenres).map((entry) => entry.label),
      influences: Array.isArray(journey.musicalInfluences)
        ? journey.musicalInfluences.slice(0, 6)
        : [],
      tempoHint,
      declaredKeys: [],
      vocalRange: String(journey.vocalRange ?? ''),
      signatureSound: String(journey.signatureSound ?? ''),
      grooveNote: String(blueprint.rhythmicFeel ?? ''),
      harmonyNote: String(blueprint.harmonicLanguage ?? ''),
      arrangementNote: String(blueprint.arrangementApproach ?? ''),
      experience: String(journey.experienceLevel ?? ''),
    };
  }
}
