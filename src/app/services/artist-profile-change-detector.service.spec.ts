import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistProfileChangeDetectorService } from './artist-profile-change-detector.service';
import { UserProfileService, initialProfile } from './user-profile.service';
import { MusicalDnaService } from './musical-dna.service';
import type { UserProfile } from '../types/profile.types';

describe('ArtistProfileChangeDetectorService', () => {
  let profileSignal: ReturnType<typeof signal<UserProfile>>;
  let recordSignal: jest.Mock;

  beforeEach(() => {
    const base = JSON.parse(JSON.stringify(initialProfile)) as UserProfile;
    profileSignal = signal({
      ...base,
      musicalJourney: {
        ...base.musicalJourney,
        musicBlueprint: {
          ...base.musicalJourney.musicBlueprint,
          rhythmicFeel: '',
          harmonicLanguage: '',
          lyricalThemes: [],
          arrangementApproach: '',
          sonicNonNegotiables: '',
          referenceTracks: [''],
        },
      },
    } as UserProfile);
    recordSignal = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        ArtistProfileChangeDetectorService,
        { provide: UserProfileService, useValue: { profile: profileSignal } },
        { provide: MusicalDnaService, useValue: { recordSignal } },
      ],
    });
  });

  it('records changes to detailed questionnaire signals by musical dimension', async () => {
    TestBed.inject(ArtistProfileChangeDetectorService);
    await TestBed.flushEffects();

    profileSignal.update((profile) => ({
      ...profile,
      musicalJourney: {
        ...profile.musicalJourney,
        musicBlueprint: {
          ...profile.musicalJourney.musicBlueprint,
          rhythmicFeel: 'Loose, swung sixteenths',
          harmonicLanguage: 'Minor ninths with suspended color',
          sonicNonNegotiables: 'Keep the tape hiss audible',
          lyricalThemes: ['night shifts', 'starting over'],
          arrangementApproach: 'Slow build into a hard drop',
        },
      },
    }));
    await TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: 'rhythm', source: 'questionnaire', summary: expect.stringContaining('Loose, swung sixteenths') }),
    );
    expect(recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: 'harmony', summary: expect.stringContaining('Minor ninths') }),
    );
    expect(recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: 'sonics', summary: expect.stringContaining('Keep the tape hiss') }),
    );
    expect(recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: 'writing', summary: expect.stringContaining('night shifts') }),
    );
    expect(recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({ dimension: 'arrangement', summary: expect.stringContaining('Slow build') }),
    );
  });
});
