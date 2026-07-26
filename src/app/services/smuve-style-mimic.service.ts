import { Injectable } from '@angular/core';

export interface StyleProfile {
  artistName: string;
  genre: string;
  vocalCharacteristics: VocalCharacteristics;
  productionCharacteristics: ProductionCharacteristics;
  songwritingCharacteristics: SongwritingCharacteristics;
}

export interface VocalCharacteristics {
  range: string;
  timbre: string;
  technique: string[];
  signatureEffect: string;
  registerUse: string;
  vibrato: string;
  breathiness: number; // 0-1
}

export interface ProductionCharacteristics {
  typicalBpm: string;
  keySignature: string[];
  drumPattern: string;
  bassStyle: string;
  chordVocabulary: string[];
  signatureElement: string;
  mixStyle: string;
}

export interface SongwritingCharacteristics {
  structure: string;
  lyricalThemes: string[];
  hookStyle: string;
  rhymeComplexity: number; // 0-1
  vocabularyLevel: string;
}

@Injectable({ providedIn: 'root' })
export class SmuveStyleMimicService {
  private readonly styleLibrary: Record<string, StyleProfile> = {
    'Drake': {
      artistName: 'Drake', genre: 'Hip Hop / R&B',
      vocalCharacteristics: {
        range: 'Baritenor (A2-A4)', timbre: 'Warm, conversational, slight nasal edge',
        technique: ['Melismatic runs', 'Speech-singing hybrid', 'Breathy intimacy', 'Call-and-response ad-libs'],
        signatureEffect: 'Heavy reverb + delay on vocals, doubled vocal layers in chorus',
        registerUse: 'Chest voice dominant, occasional falsetto for emphasis',
        vibrato: 'Minimal, natural vibrato', breathiness: 0.7,
      },
      productionCharacteristics: {
        typicalBpm: '70-100', keySignature: ['C#m', 'Fm', 'G#m', 'D#m'],
        drumPattern: 'Minimalist trap with heavy 808 slides, off-beat hi-hats',
        bassStyle: '808 sub-bass with pitch slides and portamento',
        chordVocabulary: ['Minor 7th', 'Minor 9th', 'Suspended chords', 'Jazzy extensions'],
        signatureElement: 'The "Drake pause" — silence before the emotional payoff',
        mixStyle: 'Warm, vocal-forward mix with wide stereo field',
      },
      songwritingCharacteristics: {
        structure: 'Unpredictable, verse-heavy with minimal traditional chorus',
        lyricalThemes: ['Heartbreak', 'Fame isolation', 'Toronto references', 'Relationship nostalgia', 'Vulnerability'],
        hookStyle: 'Melodic rap, repetitive phrases, emotional escalation',
        rhymeComplexity: 0.6, vocabularyLevel: 'Conversational, urban contemporary',
      },
    },
    'Taylor Swift': {
      artistName: 'Taylor Swift', genre: 'Pop / Country Pop',
      vocalCharacteristics: {
        range: 'Mezzo-soprano (G3-E5)', timbre: 'Bright, clear, girl-next-door quality',
        technique: ['Storytelling through phrasing', 'Emotional dynamics', 'Clear diction', 'Bridge building'],
        signatureEffect: 'Double-tracked vocals in chorus, intimate close-mic verses',
        registerUse: 'Chest to mix, controlled head voice', vibrato: 'Pitch-perfect, controlled',
        breathiness: 0.5,
      },
      productionCharacteristics: {
        typicalBpm: '80-130', keySignature: ['C', 'G', 'Am', 'F', 'Dm'],
        drumPattern: 'Driving pop beats with live drum feel, acoustic elements',
        bassStyle: 'Synth-pop bass or live bass guitar', chordVocabulary: ['Major 7th', 'Suspended 4th', 'Plagal motion'],
        signatureElement: 'Bridge = song climax, always', mixStyle: 'Radio-ready, bright and clean',
      },
      songwritingCharacteristics: {
        structure: 'Standard pop with powerful bridge section',
        lyricalThemes: ['Personal storytelling', 'Specific details/naming names', 'Fairytale imagery', 'Revenge/empowerment', 'Nostalgia'],
        hookStyle: 'Melodic, sing-along choruses with repetitive title',
        rhymeComplexity: 0.5, vocabularyLevel: 'Accessible, narrative-driven',
      },
    },
    'Kendrick Lamar': {
      artistName: 'Kendrick Lamar', genre: 'Hip Hop / Conscious Rap',
      vocalCharacteristics: {
        range: 'Tenor (Bb2-C5)', timbre: 'Angular, intense, chameleonic',
        technique: ['Rapid-fire delivery', 'Accent switching', 'Character voices', 'Dynamic intensity'],
        signatureEffect: 'Abrupt stops, layered vocal samples, ad-lib punctuation',
        registerUse: 'Full chest, conversational middle, occasional high-register intensity',
        vibrato: 'Staccato delivery, no vibrato', breathiness: 0.2,
      },
      productionCharacteristics: {
        typicalBpm: '75-110', keySignature: ['Dm', 'Eb', 'F#m', 'Cm'],
        drumPattern: 'Jazz-influenced, irregular hi-hat patterns, live percussion elements',
        bassStyle: '808 + live bass fusion, melodic bass lines',
        chordVocabulary: ['Jazz chords', 'Diminished passing chords', 'Chromatic movement'],
        signatureElement: 'Third-person narrative voice ("Kendrick")',
        mixStyle: 'Raw, aggressive, intentional lo-fi moments',
      },
      songwritingCharacteristics: {
        structure: 'Non-linear, conceptual albums, multi-part songs',
        lyricalThemes: ['Systemic oppression', 'Psychological struggles', 'Spirituality', 'Black identity', 'Storytelling'],
        hookStyle: 'Chanted, repetitive, often political or confrontational',
        rhymeComplexity: 0.95, vocabularyLevel: 'Elite, literary references',
      },
    },
    'Billie Eilish': {
      artistName: 'Billie Eilish', genre: 'Alternative Pop / Electropop',
      vocalCharacteristics: {
        range: 'Soprano (G3-C#6)', timbre: 'Whispery, breathy, ethereal',
        technique: ['Whisper singing', 'Subtle vibrato', 'Intimate close-mic', 'Vocal fry'],
        signatureEffect: 'ASMR-quality close miking, whispered intimacy',
        registerUse: 'Head voice dominant, falsetto for higher passages',
        vibrato: 'Gentle, controlled', breathiness: 0.9,
      },
      productionCharacteristics: {
        typicalBpm: '60-90', keySignature: ['D#m', 'Fm', 'C#m', 'Am'],
        drumPattern: 'Minimalist, trap-influenced, sparse',
        bassStyle: 'Sub-bass with distortion, 808-influenced',
        chordVocabulary: ['Minor', 'Diminished', 'Suspended'], signatureElement: 'Extreme dynamics (whisper → scream)',
        mixStyle: 'Minimalist, vocal-forward, intentional clipping',
      },
      songwritingCharacteristics: {
        structure: 'Verse-chorus with unconventional lengths',
        lyricalThemes: ['Darkness/depression', 'Relationships', 'Mental health', 'Sensory experiences'],
        hookStyle: 'Melodic, rhyming, often darkly humorous',
        rhymeComplexity: 0.4, vocabularyLevel: 'Contemporary, Gen Z vernacular',
      },
    },
    'Kanye West': {
      artistName: 'Kanye West', genre: 'Hip Hop / Experimental',
      vocalCharacteristics: {
        range: 'Baritone (G2-G4)', timbre: 'Gruff, passionate, auto-tuned/processed',
        technique: ['Soul-chopping vocals', 'Auto-tune as instrument', 'Spoken-word', 'Gospel delivery'],
        signatureEffect: 'Heavy auto-tune, pitch-corrected emotional delivery',
        registerUse: 'Chest voice, talk-singing', vibrato: 'Auto-tune warble', breathiness: 0.3,
      },
      productionCharacteristics: {
        typicalBpm: '80-120', keySignature: ['Ab', 'Db', 'Eb', 'Fm'],
        drumPattern: 'Soul-sampled drums, 808 patterns, unconventional percussion',
        bassStyle: 'Gospel-808 hybrid, sub-bass with soul samples',
        chordVocabulary: ['Gospel progressions', 'Soul samples', 'Orchestral'],
        signatureElement: 'Soul vocal samples pitched up, genre-bending',
        mixStyle: 'Bold, abrasive, intentionally imperfect',
      },
      songwritingCharacteristics: {
        structure: 'Unconventional, sample-driven, evolving',
        lyricalThemes: ['Ego/confidence', 'Spirituality', 'Fashion/culture', 'Mental health'],
        hookStyle: 'Chanted, gospel-influenced, repetitive',
        rhymeComplexity: 0.5, vocabularyLevel: 'Bold, declarative',
      },
    },
    'Adele': {
      artistName: 'Adele', genre: 'Pop / Soul',
      vocalCharacteristics: {
        range: 'Mezzo-soprano (B2-E5)', timbre: 'Warm, rich, powerful, soulful',
        technique: ['Powerful belt', 'Emotional phrasing', 'Slide into notes', 'Devastating dynamics'],
        signatureEffect: 'Building emotional intensity through power and release',
        registerUse: 'Chest voice dominant, controlled head voice',
        vibrato: 'Wide, expressive', breathiness: 0.4,
      },
      productionCharacteristics: {
        typicalBpm: '65-90', keySignature: ['C', 'G', 'Am', 'F', 'Dm'],
        drumPattern: 'Live drum feel, minimal percussion, vocal-forward',
        bassStyle: 'Bass guitar, warm and round', chordVocabulary: ['Ballad progressions', 'IV-I movement'],
        signatureElement: 'Space between phrases', mixStyle: 'Warm, dynamic, human',
      },
      songwritingCharacteristics: {
        structure: 'Classic ballad structure with bridge climax',
        lyricalThemes: ['Heartbreak', 'Loss', 'Nostalgia', 'Relationship reflection'],
        hookStyle: 'Powerful, building chorus with repeated title',
        rhymeComplexity: 0.5, vocabularyLevel: 'Emotional, direct',
      },
    },
  };

  private readonly techniqueLibrary: Record<string, string[]> = {
    'melodic rap': ['Mix singing and rapping in the same phrase', 'Use pitch variation on key words', 'Slide between notes in the vocal melody', 'Layer a melodic hook over rhythmic verses'],
    'trap vocals': ['Use ad-libs every 2-4 bars', 'Apply heavy auto-tune (0-100 retune speed)', 'Create call-and-response patterns', 'Layer doubles on the hook'],
    'soul/r&b': ['Vocal runs and melisma', 'Falsetto for emotional peaks', 'Breathy intimacy in verses', 'Gospel-influenced harmonies'],
    'punk/rock': ['Raw, unpolished delivery', 'Intentional pitch imperfection', 'High-energy, shouted choruses', 'Minimal vocal processing'],
    'lo-fi': ['Low-fidelity texture', 'VHS warble effect', 'Muffled proximity effect', 'Room ambience in vocal chain'],
    'folk/acoustic': ['Clear diction and storytelling', 'Natural vibrato', 'Room microphone ambience', 'Minimal effects processing'],
  };

  getAvailableArtists(): string[] {
    return Object.keys(this.styleLibrary);
  }

  getStyleProfile(artist: string): StyleProfile | null {
    const key = Object.keys(this.styleLibrary).find(
      k => k.toLowerCase() === artist.toLowerCase()
    );
    return key ? this.styleLibrary[key] : null;
  }

  searchByGenre(genre: string): StyleProfile[] {
    return Object.values(this.styleLibrary).filter(
      p => p.genre.toLowerCase().includes(genre.toLowerCase())
    );
  }

  generateStyleGuide(artist: string): string | null {
    const profile = this.getStyleProfile(artist);
    if (!profile) return null;

    return `🎤 S.M.U.V.E STYLE ANALYSIS: ${profile.artistName}
${'═'.repeat(50)}

🎵 GENRE: ${profile.genre}

VOCAL ANALYSIS:
  • Range: ${profile.vocalCharacteristics.range}
  • Timbre: ${profile.vocalCharacteristics.timbre}
  • Signature Technique: ${profile.vocalCharacteristics.signatureEffect}
  • Register: ${profile.vocalCharacteristics.registerUse}
  • Key techniques: ${profile.vocalCharacteristics.technique.join(', ')}

PRODUCTION BLUEPRINT:
  • Tempo Range: ${profile.productionCharacteristics.typicalBpm}
  • Key Signatures: ${profile.productionCharacteristics.keySignature.join(', ')}
  • Drum Pattern: ${profile.productionCharacteristics.drumPattern}
  • Bass Style: ${profile.productionCharacteristics.bassStyle}
  • Signature Element: ${profile.productionCharacteristics.signatureElement}
  • Mix Style: ${profile.productionCharacteristics.mixStyle}

SONGWRITING DNA:
  • Structure: ${profile.songwritingCharacteristics.structure}
  • Hook Style: ${profile.songwritingCharacteristics.hookStyle}
  • Lyrical Themes: ${profile.songwritingCharacteristics.lyricalThemes.join(', ')}

TO MIMIC ${profile.artistName.toUpperCase()}:
  1. Vocal: Focus on ${profile.vocalCharacteristics.technique[0]}
  2. Production: Use ${profile.productionCharacteristics.signatureElement}
  3. Writing: Write about ${profile.songwritingCharacteristics.lyricalThemes[0]}
  4. Mix: Aim for ${profile.productionCharacteristics.mixStyle} sound`;
  }

  generateProductionRecipe(artist: string, trackName: string = 'Untitled'): string | null {
    const profile = this.getStyleProfile(artist);
    if (!profile) return null;

    return `🎛️ S.M.U.V.E PRODUCTION RECIPE: "${trackName}" (${profile.artistName}-inspired)
${'═'.repeat(60)}

STEP 1 — DRUMS:
  Style: ${profile.productionCharacteristics.drumPattern}
  Start with kick on 1 and 3, snare on 2 and 4
  Add hi-hats with swing at 55%
  Layer claps on snare hits for impact

STEP 2 — BASS:
  Style: ${profile.productionCharacteristics.bassStyle}
  Root notes following chord progression
  Add variation and slides every 4 bars

STEP 3 — CHORDS/PADS:
  Key: ${profile.productionCharacteristics.keySignature[0]}
  Vocabulary: ${profile.productionCharacteristics.chordVocabulary.join(', ')}
  Use sustained pads with low-pass filter

STEP 4 — MELODY:
  Style inspired by ${profile.artistName}'s melodic approach
  Keep it simple — repetition builds recognition
  Leave space in the arrangement

STEP 5 — VOCALS:
  Apply ${profile.vocalCharacteristics.signatureEffect}
  Create ${profile.vocalCharacteristics.technique[0]} delivery
  Layer doubles on chorus sections

STEP 6 — MIX:
  Aim for: ${profile.productionCharacteristics.mixStyle}
  Reference ${profile.artistName}'s track for tonal balance
  Trust your ears over the meters`;
  }

  getTechnique(category: string): string[] | null {
    const cat = Object.keys(this.techniqueLibrary).find(
      k => k.toLowerCase().includes(category.toLowerCase())
    );
    return cat ? this.techniqueLibrary[cat] : null;
  }

  getAllGenres(): string[] {
    return [...new Set(Object.values(this.styleLibrary).map(p => p.genre))];
  }
}
