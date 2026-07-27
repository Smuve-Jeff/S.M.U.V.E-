import { Injectable, inject } from '@angular/core';
import {
  SmuveStyleMimicService,
  StyleProfile,
} from './smuve-style-mimic.service';
import { SongwritingAssistantService } from './songwriting-assistant.service';

export interface DrumPatternStep {
  position: number; // 16th note position (0-15 per bar)
  velocity: number; // 0-1
  probability: number; // 0-1 (for ghost notes)
}

export interface DrumPattern {
  kick: DrumPatternStep[];
  snare: DrumPatternStep[];
  hihat: DrumPatternStep[];
  clap: DrumPatternStep[];
  percussion: DrumPatternStep[];
  bpm: number;
  swing: number; // 0-1
  name: string;
  description: string;
}

export interface BassLine {
  notes: {
    pitch: string;
    octave: number;
    position: number;
    duration: number;
    velocity: number;
  }[];
  pattern: string;
  style: string;
}

export interface ChordStab {
  chord: string;
  position: number; // bar position
  duration: number; // bars
  velocity: number;
  inversion: string;
}

export interface MelodyPhrase {
  notes: {
    pitch: string;
    octave: number;
    position: number;
    duration: number;
    velocity: number;
  }[];
  phrase: string;
  style: string;
}

export interface ArrangementSection {
  name: string;
  bars: number;
  elements: string[]; // which elements are active
  energy: number; // 0-1
  description: string;
  transition?: string;
}

export interface FullBeatArrangement {
  title: string;
  bpm: number;
  key: string;
  genre: string;
  drums: DrumPattern;
  bass: BassLine;
  chords: ChordStab[];
  melody: MelodyPhrase[];
  arrangement: ArrangementSection[];
  totalBars: number;
  estimatedDuration: string;
  styleReferences: string[];
  productionNotes: string[];
}

@Injectable({ providedIn: 'root' })
export class AiBeatGeneratorService {
  private styleMimic = inject(SmuveStyleMimicService);
  private songwriting = inject(SongwritingAssistantService);

  /** Generate a full beat arrangement inspired by an artist/style */
  generateBeat(
    style: string,
    title?: string,
    bpm?: number
  ): FullBeatArrangement {
    const profile = this.styleMimic.getStyleProfile(style);
    const genre = profile?.genre || 'Hip Hop';
    const key = this.pickKey(profile);
    const targetBpm = bpm || this.pickBpm(profile);
    const swing = this.pickSwing(genre);

    const drums = this.generateDrums(genre, targetBpm, swing, profile);
    const bass = this.generateBass(key, genre, profile);
    const chords = this.generateChords(key, genre, profile);
    const melody = this.generateMelody(key, genre, profile, chords);
    const arrangement = this.generateArrangement(
      genre,
      drums,
      bass,
      chords,
      melody
    );
    const totalBars = arrangement.reduce((sum, s) => sum + s.bars, 0);
    const estimatedDuration = this.calculateDuration(totalBars, targetBpm);

    return {
      title: title || `${style}-inspired Beat`,
      bpm: targetBpm,
      key,
      genre,
      drums,
      bass,
      chords,
      melody,
      arrangement,
      totalBars,
      estimatedDuration,
      styleReferences: [style],
      productionNotes: this.generateProductionNotes(profile, genre),
    };
  }

  /** Generate drums based on genre and style */
  private generateDrums(
    genre: string,
    bpm: number,
    swing: number,
    profile: StyleProfile | null
  ): DrumPattern {
    const isTrap =
      genre.toLowerCase().includes('trap') ||
      genre.toLowerCase().includes('hip hop');
    const isPop = genre.toLowerCase().includes('pop');
    const isRock = genre.toLowerCase().includes('rock');
    const isElectronic =
      genre.toLowerCase().includes('electronic') ||
      genre.toLowerCase().includes('house');
    const isRnB =
      genre.toLowerCase().includes('r&b') ||
      genre.toLowerCase().includes('soul');
    const isJazz = genre.toLowerCase().includes('jazz');

    const kick: DrumPatternStep[] = [];
    const snare: DrumPatternStep[] = [];
    const hihat: DrumPatternStep[] = [];
    const clap: DrumPatternStep[] = [];
    const percussion: DrumPatternStep[] = [];

    if (isTrap || isRnB) {
      // Trap drums: heavy 808 kick on 1 and 3, triplet hi-hats
      kick.push({ position: 0, velocity: 1.0, probability: 1 });
      kick.push({ position: 4, velocity: 0.3, probability: 0.4 });
      kick.push({ position: 8, velocity: 0.9, probability: 1 });
      kick.push({ position: 12, velocity: 0.5, probability: 0.6 });

      snare.push({ position: 4, velocity: 0.9, probability: 1 });
      snare.push({ position: 12, velocity: 0.85, probability: 1 });
      snare.push({ position: 8, velocity: 0.2, probability: 0.3 }); // ghost note

      // Fast hi-hats with rolls
      for (let i = 0; i < 16; i++) {
        if (i % 2 === 0) {
          hihat.push({
            position: i,
            velocity: 0.5 + Math.random() * 0.3,
            probability: 0.9,
          });
        }
      }
      // Triple roll at end of bar
      hihat.push({ position: 13, velocity: 0.4, probability: 0.7 });
      hihat.push({ position: 14, velocity: 0.35, probability: 0.6 });
      hihat.push({ position: 14.5, velocity: 0.3, probability: 0.5 });

      clap.push({ position: 4, velocity: 0.3, probability: 0.3 });
      clap.push({ position: 12, velocity: 0.3, probability: 0.3 });
    } else if (isPop) {
      // Pop drums: driving four-on-the-floor with variations
      for (let i = 0; i < 4; i++) {
        kick.push({ position: i * 4, velocity: 1.0, probability: 1 });
      }
      snare.push({ position: 4, velocity: 0.9, probability: 1 });
      snare.push({ position: 12, velocity: 0.85, probability: 1 });

      for (let i = 0; i < 16; i++) {
        const vel =
          i % 2 === 0 ? 0.5 + Math.random() * 0.2 : 0.3 + Math.random() * 0.2;
        hihat.push({ position: i, velocity: vel, probability: 0.85 });
      }

      clap.push({ position: 4, velocity: 0.2, probability: 0.3 });
      clap.push({ position: 12, velocity: 0.2, probability: 0.3 });
    } else if (isRock) {
      // Rock drums: live feel with ghost notes
      kick.push({ position: 0, velocity: 1.0, probability: 1 });
      kick.push({ position: 6, velocity: 0.7, probability: 0.8 });
      kick.push({ position: 8, velocity: 0.6, probability: 0.7 });
      kick.push({ position: 14, velocity: 0.5, probability: 0.5 });

      snare.push({ position: 4, velocity: 1.0, probability: 1 });
      snare.push({ position: 12, velocity: 0.95, probability: 1 });
      snare.push({ position: 2, velocity: 0.15, probability: 0.3 });
      snare.push({ position: 10, velocity: 0.15, probability: 0.3 });

      for (let i = 0; i < 16; i++) {
        hihat.push({
          position: i,
          velocity: i % 2 === 0 ? 0.7 : 0.4,
          probability: 0.9,
        });
      }
    } else if (isElectronic) {
      // Four-on-the-floor with offbeat hi-hats
      for (let i = 0; i < 4; i++) {
        kick.push({ position: i * 4, velocity: 1.0, probability: 1 });
      }
      snare.push({ position: 4, velocity: 0.9, probability: 1 });
      snare.push({ position: 12, velocity: 0.9, probability: 1 });

      for (let i = 0; i < 16; i++) {
        hihat.push({
          position: i,
          velocity: 0.4 + Math.random() * 0.3,
          probability: 0.7,
        });
      }
      // Open hi-hat on offbeats
      percussion.push({ position: 2, velocity: 0.5, probability: 0.3 });
      percussion.push({ position: 6, velocity: 0.5, probability: 0.3 });
      percussion.push({ position: 10, velocity: 0.5, probability: 0.3 });
      percussion.push({ position: 14, velocity: 0.5, probability: 0.3 });
    } else if (isJazz) {
      // Jazz swing: ride cymbal pattern, sparse drums
      kick.push({ position: 0, velocity: 0.8, probability: 1 });
      kick.push({ position: 4, velocity: 0.3, probability: 0.4 });
      kick.push({ position: 8, velocity: 0.5, probability: 0.6 });

      snare.push({ position: 4, velocity: 0.4, probability: 0.5 }); // cross-stick
      snare.push({ position: 12, velocity: 0.5, probability: 0.6 });

      for (let i = 0; i < 16; i++) {
        // Swing feel on hi-hats
        const swingOffset = i % 2 ? 0.5 : 0;
        hihat.push({
          position: i + swingOffset,
          velocity: 0.3 + Math.random() * 0.2,
          probability: 0.6,
        });
      }
    } else {
      // Default: simple hip-hop beat
      kick.push({ position: 0, velocity: 1.0, probability: 1 });
      kick.push({ position: 8, velocity: 0.8, probability: 1 });
      kick.push({ position: 12, velocity: 0.5, probability: 0.5 });

      snare.push({ position: 4, velocity: 0.9, probability: 1 });
      snare.push({ position: 12, velocity: 0.85, probability: 1 });

      for (let i = 0; i < 16; i += 2) {
        hihat.push({
          position: i,
          velocity: 0.4 + Math.random() * 0.2,
          probability: 0.8,
        });
      }
    }

    const patternNames: Record<string, string> = {
      trap: 'Trap 808 Roller',
      'hip hop': 'Boom Bap Foundation',
      pop: 'Pop Drive',
      rock: 'Rock Solid',
      electronic: 'Four-on-the-Floor',
      'r&b': 'R&B Groove',
      soul: 'Soul Pocket',
      jazz: 'Jazz Swing',
    };
    const matchedKey = Object.keys(patternNames).find((k) =>
      genre.toLowerCase().includes(k)
    );
    const name = matchedKey ? patternNames[matchedKey] : 'Custom Groove';

    return {
      kick,
      snare,
      hihat,
      clap,
      percussion,
      bpm,
      swing,
      name,
      description: `${genre} drum pattern with ${swing > 0.5 ? 'heavy' : 'subtle'} swing feel`,
    };
  }

  /** Generate bass line based on key and genre */
  private generateBass(
    key: string,
    genre: string,
    profile: StyleProfile | null
  ): BassLine {
    const isTrap =
      genre.toLowerCase().includes('trap') ||
      genre.toLowerCase().includes('hip hop');
    const bassStyle =
      profile?.productionCharacteristics?.bassStyle ||
      '808 sub-bass with melodic lines';

    const noteNames = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const rootIndex = noteNames.indexOf(key.replace('m', '').split('/')[0]);
    const root = noteNames[rootIndex >= 0 ? rootIndex : 0];
    const octave = 1;

    // Generate 1 bar of bass pattern (16 positions)
    const notes: BassLine['notes'] = [];

    if (isTrap) {
      // Trap bass: long 808 slides
      notes.push({
        pitch: root,
        octave,
        position: 0,
        duration: 6,
        velocity: 1.0,
      });
      notes.push({
        pitch: root,
        octave: octave + 1,
        position: 8,
        duration: 2,
        velocity: 0.8,
      });
      notes.push({
        pitch: root,
        octave,
        position: 10,
        duration: 6,
        velocity: 0.6,
      });
    } else {
      // Standard bass: root-fifth pattern
      notes.push({
        pitch: root,
        octave,
        position: 0,
        duration: 4,
        velocity: 1.0,
      });
      notes.push({
        pitch: this.getFifth(root),
        octave,
        position: 4,
        duration: 2,
        velocity: 0.7,
      });
      notes.push({
        pitch: root,
        octave,
        position: 8,
        duration: 4,
        velocity: 0.9,
      });
      notes.push({
        pitch: this.getFifth(root),
        octave,
        position: 12,
        duration: 4,
        velocity: 0.6,
      });
    }

    return { notes, pattern: 'Root-Fifth with syncopation', style: bassStyle };
  }

  /** Generate chord progression based on key and genre */
  private generateChords(
    key: string,
    genre: string,
    profile: StyleProfile | null
  ): ChordStab[] {
    const progressions = this.songwriting.getChordsByMood(
      genre.toLowerCase().includes('dark') ? 'dark' : 'pop'
    );

    // Use artist-preferred chord vocabulary
    const preferred = profile?.productionCharacteristics?.chordVocabulary || [];
    const matched = progressions.filter((p) =>
      preferred.some((v) => p.name.toLowerCase().includes(v.toLowerCase()))
    );
    const selected = matched.length > 0 ? matched[0] : progressions[0];

    // Map numeric chord to actual keys
    const chords: ChordStab[] = [
      {
        chord: selected.chords[0] || 'i',
        position: 0,
        duration: 4,
        velocity: 0.8,
        inversion: 'root',
      },
      {
        chord: selected.chords[1] || 'iv',
        position: 4,
        duration: 4,
        velocity: 0.7,
        inversion: 'root',
      },
      {
        chord: selected.chords[2] || 'v',
        position: 8,
        duration: 4,
        velocity: 0.75,
        inversion: 'root',
      },
      {
        chord: selected.chords[3] || 'iv',
        position: 12,
        duration: 4,
        velocity: 0.7,
        inversion: 'first',
      },
    ];

    return chords;
  }

  /** Generate melody ideas based on key, genre, and artist profile */
  private generateMelody(
    key: string,
    genre: string,
    profile: StyleProfile | null,
    chords: ChordStab[]
  ): MelodyPhrase[] {
    const phrases: MelodyPhrase[] = [
      {
        notes: [
          {
            pitch: key.replace('m', ''),
            octave: 4,
            position: 0,
            duration: 2,
            velocity: 0.8,
          },
          {
            pitch: this.getThird(key),
            octave: 4,
            position: 4,
            duration: 2,
            velocity: 0.7,
          },
          {
            pitch: this.getFifth(key),
            octave: 4,
            position: 8,
            duration: 2,
            velocity: 0.75,
          },
          {
            pitch: this.getSeventh(key),
            octave: 4,
            position: 12,
            duration: 4,
            velocity: 0.6,
          },
        ],
        phrase: 'Main Hook',
        style:
          profile?.songwritingCharacteristics?.hookStyle ||
          'Melodic, repetitive',
      },
      {
        notes: [
          {
            pitch: this.getThird(key),
            octave: 4,
            position: 2,
            duration: 2,
            velocity: 0.6,
          },
          {
            pitch: key.replace('m', ''),
            octave: 4,
            position: 6,
            duration: 2,
            velocity: 0.65,
          },
          {
            pitch: this.getFifth(key),
            octave: 5,
            position: 10,
            duration: 2,
            velocity: 0.7,
          },
        ],
        phrase: 'Variation',
        style: 'Call and response',
      },
    ];

    return phrases;
  }

  /** Generate arrangement structure */
  private generateArrangement(
    genre: string,
    drums: DrumPattern,
    bass: BassLine,
    chords: ChordStab[],
    melody: MelodyPhrase[]
  ): ArrangementSection[] {
    const isTrap =
      genre.toLowerCase().includes('trap') ||
      genre.toLowerCase().includes('hip hop');
    const isPop = genre.toLowerCase().includes('pop');
    const isElectronic = genre.toLowerCase().includes('electronic');

    if (isTrap) {
      return [
        {
          name: 'Intro',
          bars: 8,
          elements: ['hihat', 'percussion'],
          energy: 0.3,
          description: 'Filtered hat pattern builds anticipation',
          transition: 'Riser FX + snare build',
        },
        {
          name: 'Verse',
          bars: 16,
          elements: ['kick', 'snare', 'hihat', 'bass'],
          energy: 0.6,
          description: 'Full drums + bass, minimal melody',
        },
        {
          name: 'Pre-Chorus',
          bars: 8,
          elements: ['all'],
          energy: 0.8,
          description: 'Add melody, energy builds',
          transition: 'Beat switch or fill',
        },
        {
          name: 'Chorus',
          bars: 16,
          elements: ['all'],
          energy: 1.0,
          description: 'Full arrangement, max energy',
          transition: 'Filter sweep down',
        },
        {
          name: 'Verse',
          bars: 16,
          elements: ['kick', 'snare', 'hihat', 'bass'],
          energy: 0.6,
          description: 'Drop back, second verse',
        },
        {
          name: 'Chorus',
          bars: 16,
          elements: ['all'],
          energy: 1.0,
          description: 'Full energy return',
        },
        {
          name: 'Bridge',
          bars: 8,
          elements: ['chords', 'melody'],
          energy: 0.5,
          description: 'Reduced elements, emotional core',
          transition: 'Build with riser',
        },
        {
          name: 'Outro',
          bars: 8,
          elements: ['hihat', 'melody'],
          energy: 0.3,
          description: 'Fade out with main hook',
        },
      ];
    }

    if (isPop) {
      return [
        {
          name: 'Intro',
          bars: 8,
          elements: ['hihat', 'chords'],
          energy: 0.3,
          description: 'Establish vibe with chords',
        },
        {
          name: 'Verse',
          bars: 16,
          elements: ['kick', 'snare', 'hihat', 'bass'],
          energy: 0.5,
          description: 'Rhythm section groove',
        },
        {
          name: 'Pre-Chorus',
          bars: 8,
          elements: ['all'],
          energy: 0.7,
          description: 'Building tension',
          transition: 'Snare roll build',
        },
        {
          name: 'Chorus',
          bars: 16,
          elements: ['all'],
          energy: 1.0,
          description: 'Full arrangement peaks',
        },
        {
          name: 'Verse',
          bars: 16,
          elements: ['kick', 'snare', 'hihat', 'bass'],
          energy: 0.5,
          description: 'Second verse',
        },
        {
          name: 'Chorus',
          bars: 16,
          elements: ['all'],
          energy: 1.0,
          description: 'Bigger production',
        },
        {
          name: 'Bridge',
          bars: 8,
          elements: ['chords', 'melody'],
          energy: 0.4,
          description: 'Emotional breakdown',
          transition: 'Key change riser',
        },
        {
          name: 'Outro',
          bars: 8,
          elements: ['hihat', 'melody'],
          energy: 0.3,
          description: 'Final fade',
        },
      ];
    }

    if (isElectronic) {
      return [
        {
          name: 'Intro',
          bars: 16,
          elements: ['hihat', 'percussion'],
          energy: 0.2,
          description: 'Filtered percussion builds',
        },
        {
          name: 'Build 1',
          bars: 8,
          elements: ['kick', 'hihat', 'percussion'],
          energy: 0.5,
          description: 'Add kick, tension rises',
          transition: 'Riser FX',
        },
        {
          name: 'Drop 1',
          bars: 16,
          elements: ['all'],
          energy: 1.0,
          description: 'Full power drop',
        },
        {
          name: 'Breakdown',
          bars: 16,
          elements: ['chords', 'melody'],
          energy: 0.3,
          description: 'Reduced for impact',
          transition: 'Filter sweep up',
        },
        {
          name: 'Build 2',
          bars: 8,
          elements: ['kick', 'hihat', 'bass'],
          energy: 0.7,
          description: 'Re-introduce rhythm',
          transition: 'Snare build',
        },
        {
          name: 'Drop 2',
          bars: 16,
          elements: ['all'],
          energy: 1.0,
          description: 'Second drop, varied elements',
        },
        {
          name: 'Outro',
          bars: 8,
          elements: ['chords'],
          energy: 0.2,
          description: 'Ambient fade',
        },
      ];
    }

    // Default structure
    return [
      {
        name: 'Intro',
        bars: 4,
        elements: ['hihat'],
        energy: 0.3,
        description: 'Establish groove',
      },
      {
        name: 'Verse',
        bars: 16,
        elements: ['kick', 'snare', 'hihat', 'bass'],
        energy: 0.5,
        description: 'Main section',
      },
      {
        name: 'Chorus',
        bars: 16,
        elements: ['all'],
        energy: 0.9,
        description: 'Peak section',
      },
      {
        name: 'Verse',
        bars: 16,
        elements: ['kick', 'snare', 'hihat', 'bass'],
        energy: 0.5,
        description: 'Second verse',
      },
      {
        name: 'Chorus',
        bars: 16,
        elements: ['all'],
        energy: 0.9,
        description: 'Return to peak',
      },
      {
        name: 'Outro',
        bars: 8,
        elements: ['hihat', 'melody'],
        energy: 0.2,
        description: 'Wind down',
      },
    ];
  }

  /** Generate a text-based beat blueprint for the chatbot */
  generateBeatBlueprint(style: string, title?: string): string {
    const beat = this.generateBeat(style, title);

    const sections = beat.arrangement
      .map(
        (s) =>
          `  ${s.name.padEnd(12)} | ${s.bars.toString().padEnd(4)} bars | ${'█'.repeat(Math.round(s.energy * 10)).padEnd(10)} | ${s.description}`
      )
      .join('\n');

    return `🎵 S.M.U.V.E BEAT GENERATOR
${'═'.repeat(60)}
Title: ${beat.title}
Genre: ${beat.genre}
Key: ${beat.key}
BPM: ${beat.bpm}
Swing: ${Math.round(beat.drums.swing * 100)}%
Duration: ${beat.estimatedDuration}

DRUM PATTERN: ${beat.drums.name}
${beat.drums.description}
• Kick: ${beat.drums.kick.length} hits/bar
• Snare: ${beat.drums.snare.length} hits/bar
• Hi-hat: ${beat.drums.hihat.length} hits/bar
• Claps: ${beat.drums.clap.length} hits/bar

BASS: ${beat.bass.pattern}
Style: ${beat.bass.style}

ARRANGEMENT:
${sections}

🎹 CHORDS: ${beat.chords.map((c) => c.chord).join(' | ')}

PRODUCTION NOTES:
${beat.productionNotes.map((n) => `  • ${n}`).join('\n')}

Use /beat [style] \"title\" to generate more beats.`;
  }

  /** Generate production notes */
  private generateProductionNotes(
    profile: StyleProfile | null,
    genre: string
  ): string[] {
    const notes: string[] = [];

    if (profile) {
      notes.push(
        `Style reference: ${profile.artistName} — ${profile.productionCharacteristics.mixStyle}`
      );
      notes.push(
        `Signature element: ${profile.productionCharacteristics.signatureElement}`
      );
    }

    if (
      genre.toLowerCase().includes('trap') ||
      genre.toLowerCase().includes('hip hop')
    ) {
      notes.push('Sidechain the 808 to the kick for clean low-end');
      notes.push('Use -3dB headroom on the master for mastering headroom');
    } else if (genre.toLowerCase().includes('pop')) {
      notes.push(
        'Keep vocal frequencies clear: cut 300Hz mud, boost 2-4kHz presence'
      );
      notes.push('Reference mixes at -14 LUFS for Spotify compatibility');
    } else if (genre.toLowerCase().includes('electronic')) {
      notes.push('Use filter automation on builds for maximum tension');
      notes.push('Layer white noise risers with reverb throws on transitions');
    } else if (genre.toLowerCase().includes('rock')) {
      notes.push('Double-track guitars for width: pan L and R');
      notes.push('Keep the kick and bass locked together rhythmically');
    }

    notes.push('Let the arrangement breathe — silence is as powerful as sound');
    return notes;
  }

  /** Pick a key signature based on artist profile or genre */
  private pickKey(profile: StyleProfile | null): string {
    if (profile?.productionCharacteristics?.keySignature?.length) {
      return profile.productionCharacteristics.keySignature[0];
    }
    const keys = ['C#m', 'Am', 'F#m', 'Dm', 'Em', 'Cm', 'Gm', 'Bm'];
    return keys[Math.floor(Math.random() * keys.length)];
  }

  /** Pick BPM based on artist profile or genre */
  private pickBpm(profile: StyleProfile | null): number {
    if (profile?.productionCharacteristics?.typicalBpm) {
      const range = profile.productionCharacteristics.typicalBpm.split('-');
      if (range.length === 2) {
        const min = parseInt(range[0]);
        const max = parseInt(range[1]);
        return Math.round((min + max) / 2);
      }
    }
    const bpms = [80, 85, 90, 95, 100, 105, 110, 120, 128, 140];
    return bpms[Math.floor(Math.random() * bpms.length)];
  }

  /** Pick swing amount based on genre */
  private pickSwing(genre: string): number {
    if (genre.toLowerCase().includes('jazz')) return 0.7;
    if (
      genre.toLowerCase().includes('r&b') ||
      genre.toLowerCase().includes('soul')
    )
      return 0.6;
    if (
      genre.toLowerCase().includes('hip hop') ||
      genre.toLowerCase().includes('trap')
    )
      return 0.55;
    if (genre.toLowerCase().includes('pop')) return 0.5;
    if (
      genre.toLowerCase().includes('electronic') ||
      genre.toLowerCase().includes('house')
    )
      return 0.3;
    return 0.5;
  }

  /** Calculate estimated duration from bars and BPM */
  private calculateDuration(totalBars: number, bpm: number): string {
    const totalBeats = totalBars * 4;
    const seconds = (totalBeats / bpm) * 60;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /** Get the fifth of a note */
  private getFifth(note: string): string {
    const notes = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const idx = notes.indexOf(note.replace('m', ''));
    return notes[(idx + 7) % 12];
  }

  /** Get the third of a note */
  private getThird(note: string): string {
    const notes = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const idx = notes.indexOf(note.replace('m', ''));
    const isMinor = note.includes('m');
    return notes[(idx + (isMinor ? 3 : 4)) % 12];
  }

  /** Get the seventh of a note */
  private getSeventh(note: string): string {
    const notes = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ];
    const idx = notes.indexOf(note.replace('m', ''));
    const isMinor = note.includes('m');
    return notes[(idx + (isMinor ? 10 : 11)) % 12];
  }
}
