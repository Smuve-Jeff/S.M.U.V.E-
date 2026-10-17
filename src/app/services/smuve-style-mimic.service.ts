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
    Drake: {
      artistName: 'Drake',
      genre: 'Hip Hop / R&B',
      vocalCharacteristics: {
        range: 'Baritenor (A2-A4)',
        timbre: 'Warm, conversational, slight nasal edge',
        technique: [
          'Melismatic runs',
          'Speech-singing hybrid',
          'Breathy intimacy',
          'Call-and-response ad-libs',
        ],
        signatureEffect:
          'Heavy reverb + delay on vocals, doubled vocal layers in chorus',
        registerUse: 'Chest voice dominant, occasional falsetto for emphasis',
        vibrato: 'Minimal, natural vibrato',
        breathiness: 0.7,
      },
      productionCharacteristics: {
        typicalBpm: '70-100',
        keySignature: ['C#m', 'Fm', 'G#m', 'D#m'],
        drumPattern: 'Minimalist trap with heavy 808 slides, off-beat hi-hats',
        bassStyle: '808 sub-bass with pitch slides and portamento',
        chordVocabulary: [
          'Minor 7th',
          'Minor 9th',
          'Suspended chords',
          'Jazzy extensions',
        ],
        signatureElement:
          'The "Drake pause" — silence before the emotional payoff',
        mixStyle: 'Warm, vocal-forward mix with wide stereo field',
      },
      songwritingCharacteristics: {
        structure: 'Unpredictable, verse-heavy with minimal traditional chorus',
        lyricalThemes: [
          'Heartbreak',
          'Fame isolation',
          'Toronto references',
          'Relationship nostalgia',
          'Vulnerability',
        ],
        hookStyle: 'Melodic rap, repetitive phrases, emotional escalation',
        rhymeComplexity: 0.6,
        vocabularyLevel: 'Conversational, urban contemporary',
      },
    },
    'Taylor Swift': {
      artistName: 'Taylor Swift',
      genre: 'Pop / Country Pop',
      vocalCharacteristics: {
        range: 'Mezzo-soprano (G3-E5)',
        timbre: 'Bright, clear, girl-next-door quality',
        technique: [
          'Storytelling through phrasing',
          'Emotional dynamics',
          'Clear diction',
          'Bridge building',
        ],
        signatureEffect:
          'Double-tracked vocals in chorus, intimate close-mic verses',
        registerUse: 'Chest to mix, controlled head voice',
        vibrato: 'Pitch-perfect, controlled',
        breathiness: 0.5,
      },
      productionCharacteristics: {
        typicalBpm: '80-130',
        keySignature: ['C', 'G', 'Am', 'F', 'Dm'],
        drumPattern: 'Driving pop beats with live drum feel, acoustic elements',
        bassStyle: 'Synth-pop bass or live bass guitar',
        chordVocabulary: ['Major 7th', 'Suspended 4th', 'Plagal motion'],
        signatureElement: 'Bridge = song climax, always',
        mixStyle: 'Radio-ready, bright and clean',
      },
      songwritingCharacteristics: {
        structure: 'Standard pop with powerful bridge section',
        lyricalThemes: [
          'Personal storytelling',
          'Specific details/naming names',
          'Fairytale imagery',
          'Revenge/empowerment',
          'Nostalgia',
        ],
        hookStyle: 'Melodic, sing-along choruses with repetitive title',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Accessible, narrative-driven',
      },
    },
    'Kendrick Lamar': {
      artistName: 'Kendrick Lamar',
      genre: 'Hip Hop / Conscious Rap',
      vocalCharacteristics: {
        range: 'Tenor (Bb2-C5)',
        timbre: 'Angular, intense, chameleonic',
        technique: [
          'Rapid-fire delivery',
          'Accent switching',
          'Character voices',
          'Dynamic intensity',
        ],
        signatureEffect:
          'Abrupt stops, layered vocal samples, ad-lib punctuation',
        registerUse:
          'Full chest, conversational middle, occasional high-register intensity',
        vibrato: 'Staccato delivery, no vibrato',
        breathiness: 0.2,
      },
      productionCharacteristics: {
        typicalBpm: '75-110',
        keySignature: ['Dm', 'Eb', 'F#m', 'Cm'],
        drumPattern:
          'Jazz-influenced, irregular hi-hat patterns, live percussion elements',
        bassStyle: '808 + live bass fusion, melodic bass lines',
        chordVocabulary: [
          'Jazz chords',
          'Diminished passing chords',
          'Chromatic movement',
        ],
        signatureElement: 'Third-person narrative voice ("Kendrick")',
        mixStyle: 'Raw, aggressive, intentional lo-fi moments',
      },
      songwritingCharacteristics: {
        structure: 'Non-linear, conceptual albums, multi-part songs',
        lyricalThemes: [
          'Systemic oppression',
          'Psychological struggles',
          'Spirituality',
          'Black identity',
          'Storytelling',
        ],
        hookStyle: 'Chanted, repetitive, often political or confrontational',
        rhymeComplexity: 0.95,
        vocabularyLevel: 'Elite, literary references',
      },
    },
    'Billie Eilish': {
      artistName: 'Billie Eilish',
      genre: 'Alternative Pop / Electropop',
      vocalCharacteristics: {
        range: 'Soprano (G3-C#6)',
        timbre: 'Whispery, breathy, ethereal',
        technique: [
          'Whisper singing',
          'Subtle vibrato',
          'Intimate close-mic',
          'Vocal fry',
        ],
        signatureEffect: 'ASMR-quality close miking, whispered intimacy',
        registerUse: 'Head voice dominant, falsetto for higher passages',
        vibrato: 'Gentle, controlled',
        breathiness: 0.9,
      },
      productionCharacteristics: {
        typicalBpm: '60-90',
        keySignature: ['D#m', 'Fm', 'C#m', 'Am'],
        drumPattern: 'Minimalist, trap-influenced, sparse',
        bassStyle: 'Sub-bass with distortion, 808-influenced',
        chordVocabulary: ['Minor', 'Diminished', 'Suspended'],
        signatureElement: 'Extreme dynamics (whisper → scream)',
        mixStyle: 'Minimalist, vocal-forward, intentional clipping',
      },
      songwritingCharacteristics: {
        structure: 'Verse-chorus with unconventional lengths',
        lyricalThemes: [
          'Darkness/depression',
          'Relationships',
          'Mental health',
          'Sensory experiences',
        ],
        hookStyle: 'Melodic, rhyming, often darkly humorous',
        rhymeComplexity: 0.4,
        vocabularyLevel: 'Contemporary, Gen Z vernacular',
      },
    },
    'The Weeknd': {
      artistName: 'The Weeknd',
      genre: 'R&B / Pop / Synthwave',
      vocalCharacteristics: {
        range: 'Tenor (C3-C5)',
        timbre: 'Dark, airy, falsetto-driven, melancholic',
        technique: [
          'Falsetto runs',
          'Melismatic delivery',
          'Intimate whisper verses',
          'Powerful chest-to-falsetto transitions',
        ],
        signatureEffect:
          'Heavy reverb/delay throws, layered harmonies, digital distortion on climaxes',
        registerUse: 'Falsetto dominant, chest voice for grounding',
        vibrato: 'Controlled, expressive',
        breathiness: 0.75,
      },
      productionCharacteristics: {
        typicalBpm: '80-110',
        keySignature: ['Dm', 'Am', 'F', 'Cm'],
        drumPattern:
          '80s-inspired drum machines (808, LinnDrum), trap hi-hats, minimalist rhythm section',
        bassStyle:
          'Synth bass with reverb, deep sub-bass lines, arpeggiated bass patterns',
        chordVocabulary: [
          'Minor 7th',
          'Diminished',
          'Suspended 2nd',
          'Jazz-influenced voicings',
        ],
        signatureElement:
          'Dark synthwave textures, cinematic pads, haunting vocal layers',
        mixStyle: 'Dark, atmospheric, vocal-forward with wide stereo synths',
      },
      songwritingCharacteristics: {
        structure: 'Verse-chorus with extended bridges, cinematic outros',
        lyricalThemes: [
          'Hedonism and consequences',
          'Drug-induced romance',
          'Fame isolation',
          'Self-destruction',
          'Nostalgia for innocence',
        ],
        hookStyle: 'Melodic falsetto hook, repetitive and hypnotic',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Atmospheric, sensory, film noir aesthetic',
      },
    },
    Beyoncé: {
      artistName: 'Beyoncé',
      genre: 'Pop / R&B / Afrofuturism',
      vocalCharacteristics: {
        range: 'Mezzo-soprano (E3-F5)',
        timbre: 'Rich, powerful, soulful, commanding',
        technique: [
          'Powerful belt',
          'Vocal agility and runs',
          'Dynamic control (whisper to roar)',
          'Call-and-response phrasing',
        ],
        signatureEffect:
          'Layered harmonies, sudden dynamic drops, vocal stacking in choruses',
        registerUse: 'Full chest, mixed voice, controlled head voice',
        vibrato: 'Wide, dramatic',
        breathiness: 0.3,
      },
      productionCharacteristics: {
        typicalBpm: '80-120',
        keySignature: ['Bm', 'F#m', 'Em', 'Am'],
        drumPattern:
          'Hard-hitting 808s, syncopated percussion, marching band elements',
        bassStyle: '808 sub-bass with distortion, live bass sections',
        chordVocabulary: [
          'Gospel progressions',
          'Minor with major 7th',
          'Jazz harmonies',
        ],
        signatureElement: 'The pause before the drop — silence as impact',
        mixStyle: 'Monumental, polished, every element has room to breathe',
      },
      songwritingCharacteristics: {
        structure: 'Dynamic section contrasts, extended codas, bridge climax',
        lyricalThemes: [
          'Female empowerment',
          'Black excellence',
          'Marriage and motherhood',
          'Self-worth',
          'Cultural commentary',
        ],
        hookStyle: 'Anthemic, chant-like, easily crowd-sung',
        rhymeComplexity: 0.6,
        vocabularyLevel: 'Powerful, declarative, poetic',
      },
    },
    Prince: {
      artistName: 'Prince',
      genre: 'Funk / Pop / Rock / R&B',
      vocalCharacteristics: {
        range: 'Countertenor (A2-C6)',
        timbre: 'Androgynous, electric, ecstatic, vulnerable',
        technique: [
          'Extreme register shifts',
          'Sexualized delivery',
          'Gospel-influenced screams',
          'Falsetto wizardry',
        ],
        signatureEffect:
          'Sudden octave jumps, intimate-to-explosive dynamics, guitar-like vocal licks',
        registerUse: 'Full spectrum — baritone to whistle register',
        vibrato: 'Rapid, expressive',
        breathiness: 0.4,
      },
      productionCharacteristics: {
        typicalBpm: '90-130',
        keySignature: ['Am', 'Dm', 'G', 'C', 'Bb'],
        drumPattern: 'LinnDrum kick heavy, funk syncopation, live drum fills',
        bassStyle: 'Slapped/fingerstyle funk bass, melodic bass lines',
        chordVocabulary: [
          'Dominant 7th',
          '9th chords',
          'Diminished passing',
          'Blues progressions',
        ],
        signatureElement:
          'One-man-band production — all instruments played by Prince',
        mixStyle: 'Dry, punchy, every instrument cut and separated',
      },
      songwritingCharacteristics: {
        structure:
          'Extended jams, unexpected key changes, long instrumental sections',
        lyricalThemes: [
          'Sexuality and liberation',
          'Spirituality',
          'Love and heartbreak',
          'Social commentary',
          'Party anthems',
        ],
        hookStyle: 'Witty, double-entendre, unforgettable melodic phrases',
        rhymeComplexity: 0.7,
        vocabularyLevel: 'Provocative, poetic, playful',
      },
    },
    'Michael Jackson': {
      artistName: 'Michael Jackson',
      genre: 'Pop / Funk / Rock / Soul',
      vocalCharacteristics: {
        range: 'Tenor (C3-C5)',
        timbre:
          'Bright, clear, instantly recognizable, childlike innocence to raw power',
        technique: [
          'Vocal percussion and beatboxing',
          'Emotional sighs and grunts',
          'Vocal staccato',
          'Crisp diction',
        ],
        signatureEffect:
          'Vocal stabs (hee-hee, shamone), breathy intros, powerful chorus belts',
        registerUse: 'Chest voice with mixed head, occasional falsetto',
        vibrato: 'Vibrato on held notes, controlled',
        breathiness: 0.35,
      },
      productionCharacteristics: {
        typicalBpm: '100-130',
        keySignature: ['F#m', 'Dm', 'Cm', 'Gm', 'Am'],
        drumPattern:
          'LinnDrum and live drums, syncopated percussion, iconic drum intros',
        bassStyle: 'Funk slap bass, synth bass layers, melodic bass hooks',
        chordVocabulary: [
          'Minor with major 7th',
          'Diminished',
          'Chromatic passing',
          'Gospel cadences',
        ],
        signatureElement: 'Iconic intro hooks, breakdown sections, key changes',
        mixStyle: 'Perfectionist — every sound meticulously crafted and placed',
      },
      songwritingCharacteristics: {
        structure:
          'Classic pop with extended instrumental breakdowns, coda, spoken sections',
        lyricalThemes: [
          'Peace and unity',
          'Social justice',
          'Love and romance',
          'Global awareness',
          'Dance anthems',
        ],
        hookStyle: 'Irresistible, simple, repetitive, instantly memorable',
        rhymeComplexity: 0.4,
        vocabularyLevel: 'Universal, accessible, emotional',
      },
    },
    'Frank Ocean': {
      artistName: 'Frank Ocean',
      genre: 'Alternative R&B / Art Pop',
      vocalCharacteristics: {
        range: 'Tenor (C3-B4)',
        timbre: 'Vulnerable, breathy, warm, intimate',
        technique: [
          'Storytelling delivery',
          'Melismatic runs',
          'Pitch-perfect subtlety',
          'Conversational phrasing',
        ],
        signatureEffect:
          'Vocal doubles with slight detune, reverb-drenched ambiance, layered harmonies',
        registerUse: 'Floating tenor with falsetto peaks',
        vibrato: 'Minimal, natural',
        breathiness: 0.8,
      },
      productionCharacteristics: {
        typicalBpm: '60-100',
        keySignature: ['C#m', 'Abm', 'F#', 'B'],
        drumPattern:
          'Minimalist, programmed with live elements, sparse percussion',
        bassStyle: 'Sub-bass, warm synth bass, minimal but impactful',
        chordVocabulary: [
          'Jazzy 7ths',
          'Extended chords',
          'Unconventional progressions',
        ],
        signatureElement:
          'Atmospheric interludes, voice memos in tracks, narrative arcs',
        mixStyle:
          'Spacious, ethereal, vocal-forward with immersive soundscapes',
      },
      songwritingCharacteristics: {
        structure: 'Non-linear, story-driven, songs that feel like short films',
        lyricalThemes: [
          'Unrequited love',
          'Identity and sexuality',
          'Nostalgia',
          'Isolation',
          'Existential wonder',
        ],
        hookStyle:
          'Subtle, melodic, often the bridge hits harder than the chorus',
        rhymeComplexity: 0.8,
        vocabularyLevel: 'Poetic, introspective, cinematic',
      },
    },
    Radiohead: {
      artistName: 'Radiohead',
      genre: 'Alternative Rock / Electronic / Art Rock',
      vocalCharacteristics: {
        range: 'Tenor (G2-B4)',
        timbre: 'Haunting, vulnerable, ethereal, otherworldly',
        technique: [
          'Falsetto vulnerability',
          'Spoken-word intensity',
          'Dynamic contrast (whisper to scream)',
          'Extended vocal techniques',
        ],
        signatureEffect: 'Reverse reverb, tremolo, layered ghostly harmonies',
        registerUse: 'Floating tenor with dramatic falsetto',
        vibrato: 'Slight, emotional',
        breathiness: 0.6,
      },
      productionCharacteristics: {
        typicalBpm: '70-130',
        keySignature: ['Am', 'Cm', 'Dm', 'Em', 'Fm'],
        drumPattern:
          'Unconventional time signatures, electronic percussion, live drums with heavy processing',
        bassStyle:
          'Fretless/effects-laden bass, synth bass, melodic counterpoint',
        chordVocabulary: [
          'Unconventional progressions',
          'Whole tone',
          'Chromatic',
          'Atonal elements',
        ],
        signatureElement:
          'Genre-defying production, electronic manipulation of organic sounds',
        mixStyle: 'Atmospheric, dense, every listen reveals new details',
      },
      songwritingCharacteristics: {
        structure:
          'Unconventional, evolving compositions, no verse-chorus formula',
        lyricalThemes: [
          'Alienation',
          'Technology anxiety',
          'Political despair',
          'Environmentalism',
          'Existential dread',
        ],
        hookStyle:
          'Melancholic, haunting, often the riff is the hook not the vocal',
        rhymeComplexity: 0.7,
        vocabularyLevel: 'Abstract, literary, introspective',
      },
    },
    'Amy Winehouse': {
      artistName: 'Amy Winehouse',
      genre: 'Soul / R&B / Jazz',
      vocalCharacteristics: {
        range: 'Contralto (F3-E5)',
        timbre: 'Deep, smoky, raw, emotionally devastating',
        technique: [
          'Jazz phrasing',
          'Vocal improvisation',
          'Grit and growl',
          'Swing delivery',
        ],
        signatureEffect:
          'Vocal wobble, bent notes, raw unpolished moments left in',
        registerUse: 'Chest-dominant vocal, deep contralto',
        vibrato: 'Wide, jazz-influenced',
        breathiness: 0.3,
      },
      productionCharacteristics: {
        typicalBpm: '70-120',
        keySignature: ['Dm', 'Am', 'Gm', 'Cm'],
        drumPattern:
          'Retro soul/doo-wop drum patterns, swing rhythms, live drums',
        bassStyle: 'Upright/walking bass lines, jazz-influenced',
        chordVocabulary: [
          'Jazz progressions',
          'Minor 6th',
          'Diminished 7th',
          'II-V-I resolutions',
        ],
        signatureElement:
          '60s girl group aesthetic, modern production under vintage arrangements',
        mixStyle: 'Warm, analog, vocal-forward with vintage compression',
      },
      songwritingCharacteristics: {
        structure: 'Classic songwriting with jazz complexity, standard forms',
        lyricalThemes: [
          'Toxic relationships',
          'Addiction',
          'Self-destruction',
          'Love and loss',
          'Nostalgia',
        ],
        hookStyle: 'Melodic, jazz-influenced, emotionally direct',
        rhymeComplexity: 0.6,
        vocabularyLevel: 'Conversational, brutally honest, Cockney charm',
      },
    },
    'Tyler, The Creator': {
      artistName: 'Tyler, The Creator',
      genre: 'Hip Hop / Alternative / Jazz Rap',
      vocalCharacteristics: {
        range: 'Baritone (G1-A4)',
        timbre: 'Gruff, expressive, chameleonic, theatrical',
        technique: [
          'Character voices',
          'Pitch-shifted vocals',
          'Rapid delivery',
          'Singing/rap hybrid',
        ],
        signatureEffect:
          'Pitch-shifted alter egos, squeaky ad-libs, dramatic delivery shifts',
        registerUse: 'Deep chest voice to high-pitched character voices',
        vibrato: 'None to minimal',
        breathiness: 0.25,
      },
      productionCharacteristics: {
        typicalBpm: '70-160',
        keySignature: ['Ab', 'Db', 'E', 'F#m'],
        drumPattern:
          'Jazz drum samples, heavy kicks, off-kilter percussion, Neptunes-style beats',
        bassStyle: '808 sub-bass with distortion, synth bass, jazz fusion',
        chordVocabulary: [
          'Jazz chords',
          'Major 7th',
          'Diminished',
          'Whole step movement',
        ],
        signatureElement:
          'Genre-bending, saxophone solos, horror movie aesthetics',
        mixStyle: 'Bold, colorful, intentionally rough around the edges',
      },
      songwritingCharacteristics: {
        structure: 'Thematic albums, narrative arcs, songs that evolve',
        lyricalThemes: [
          'Identity',
          'Growth and maturity',
          'Loneliness',
          'Creative expression',
          'Childhood trauma',
        ],
        hookStyle: 'Melodic sung hooks with rap verses, unexpected turns',
        rhymeComplexity: 0.7,
        vocabularyLevel: 'Raw, confessional, imaginative',
      },
    },
    'Lana Del Rey': {
      artistName: 'Lana Del Rey',
      genre: 'Alternative Pop / Dream Pop / Americana',
      vocalCharacteristics: {
        range: 'Mezzo-soprano (G3-E5)',
        timbre: 'Vintage, breathy, melancholic, sultry',
        technique: [
          'Lounge-style phrasing',
          'Dramatic delivery',
          'Vintage vocal fry',
          'Storytelling through spoken sections',
        ],
        signatureEffect:
          'Cinematic reverb/delay, layered ghostly vocals, tape saturation',
        registerUse: 'Chest to head, heavy use of low register',
        vibrato: 'Wide, dramatic',
        breathiness: 0.8,
      },
      productionCharacteristics: {
        typicalBpm: '60-90',
        keySignature: ['Am', 'F', 'C', 'G', 'Dm'],
        drumPattern:
          'Trip-hop beats, slow hip-hop percussion, cinematic drum layers',
        bassStyle: 'Warm sub-bass, upright bass samples, slow bass lines',
        chordVocabulary: [
          'Vintage progressions',
          'Minor with major 7th',
          'Baroque pop harmonies',
        ],
        signatureElement:
          'Cinematic strings, vintage Americana samples, spoken intros/outros',
        mixStyle: 'Lush, vintage-warm, cinematic, vocal-forward',
      },
      songwritingCharacteristics: {
        structure: 'Cinematic songwriting, extended outros, intro verses',
        lyricalThemes: [
          'Tragic romance',
          'American nostalgia',
          'Fame and disillusionment',
          'Old Hollywood',
          'Summer faded',
        ],
        hookStyle: 'Melancholic, melodic, cinematic and sweeping',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Poetic, nostalgic, vintage-inflected',
      },
    },
    'Stevie Wonder': {
      artistName: 'Stevie Wonder',
      genre: 'Soul / Funk / Pop / R&B',
      vocalCharacteristics: {
        range: 'Tenor (E3-C#6)',
        timbre: 'Joyful, powerful, instantly soulful, genuinely emotional',
        technique: [
          'Vocal improvisation',
          'Scat singing',
          'Call-and-response',
          'Gospel fervor',
        ],
        signatureEffect:
          'Clavinet-inspired vocal riffs, harmonica-like vocal runs, joyful ad-libs',
        registerUse: 'Full range, chest to high falsetto',
        vibrato: 'Wide, expressive',
        breathiness: 0.2,
      },
      productionCharacteristics: {
        typicalBpm: '90-130',
        keySignature: ['C', 'F', 'G', 'Bb', 'Eb'],
        drumPattern: 'Live drumming, syncopated funk patterns, iconic breaks',
        bassStyle: 'Funk bass, synth bass (key bass), melodic bass hooks',
        chordVocabulary: [
          'Jazz harmonies',
          'II-V-I',
          'Diminished passing',
          'Blues changes',
        ],
        signatureElement:
          'Pioneering use of synthesizers, clavinet, harmonica, multi-instrumentalist',
        mixStyle: 'Warm, full-band, live instrumentation feel',
      },
      songwritingCharacteristics: {
        structure: 'Extended song forms, instrumental sections, key changes',
        lyricalThemes: [
          'Love and unity',
          'Social consciousness',
          'Celebration of life',
          'Spirituality',
          'Optimism',
        ],
        hookStyle: 'Uplifting, melodic, easily memorable and singable',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Joyful, universal, heartfelt',
      },
    },
    'J. Cole': {
      artistName: 'J. Cole',
      genre: 'Hip Hop / Conscious Rap',
      vocalCharacteristics: {
        range: 'Baritone (G1-G4)',
        timbre: 'Smooth, deliberate, introspective, storytelling-focused',
        technique: [
          'Multi-syllabic rhyme patterns',
          'Storytelling delivery',
          'Sung-rap hybrid',
          'Emotional inflection',
        ],
        signatureEffect:
          'Vocal doubling on key phrases, minimal effects, raw delivery',
        registerUse: 'Comfortable baritone, occasional tenor reach',
        vibrato: 'Minimal',
        breathiness: 0.3,
      },
      productionCharacteristics: {
        typicalBpm: '80-100',
        keySignature: ['Am', 'Em', 'Fm', 'Dm', 'Cm'],
        drumPattern:
          'Boom-bap revival, 808 with soul samples, minimal percussion',
        bassStyle: '808 sub-bass with soul sample bass, melodic bass',
        chordVocabulary: [
          'Soul samples',
          'Minor progressions',
          'Piano-based chords',
        ],
        signatureElement:
          'Soul-sampled production, piano-driven beats, narrative third verse',
        mixStyle: 'Warm, organic, sample-based, vocal-clear',
      },
      songwritingCharacteristics: {
        structure: 'Extended verses, narrative albums, third verse climax',
        lyricalThemes: [
          'Struggle and perseverance',
          'Fatherhood',
          'Social commentary',
          'Self-reflection',
          'Dreams and ambition',
        ],
        hookStyle: 'Sung-rap hook, introspective and melodic',
        rhymeComplexity: 0.85,
        vocabularyLevel: 'Storytelling, conversational, vivid detail',
      },
    },
    'Kanye West': {
      artistName: 'Kanye West',
      genre: 'Hip Hop / Experimental',
      vocalCharacteristics: {
        range: 'Baritone (G2-G4)',
        timbre: 'Gruff, passionate, auto-tuned/processed',
        technique: [
          'Soul-chopping vocals',
          'Auto-tune as instrument',
          'Spoken-word',
          'Gospel delivery',
        ],
        signatureEffect: 'Heavy auto-tune, pitch-corrected emotional delivery',
        registerUse: 'Chest voice, talk-singing',
        vibrato: 'Auto-tune warble',
        breathiness: 0.3,
      },
      productionCharacteristics: {
        typicalBpm: '80-120',
        keySignature: ['Ab', 'Db', 'Eb', 'Fm'],
        drumPattern:
          'Soul-sampled drums, 808 patterns, unconventional percussion',
        bassStyle: 'Gospel-808 hybrid, sub-bass with soul samples',
        chordVocabulary: ['Gospel progressions', 'Soul samples', 'Orchestral'],
        signatureElement: 'Soul vocal samples pitched up, genre-bending',
        mixStyle: 'Bold, abrasive, intentionally imperfect',
      },
      songwritingCharacteristics: {
        structure: 'Unconventional, sample-driven, evolving',
        lyricalThemes: [
          'Ego/confidence',
          'Spirituality',
          'Fashion/culture',
          'Mental health',
        ],
        hookStyle: 'Chanted, gospel-influenced, repetitive',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Bold, declarative',
      },
    },
    Adele: {
      artistName: 'Adele',
      genre: 'Pop / Soul',
      vocalCharacteristics: {
        range: 'Mezzo-soprano (B2-E5)',
        timbre: 'Warm, rich, powerful, soulful',
        technique: [
          'Powerful belt',
          'Emotional phrasing',
          'Slide into notes',
          'Devastating dynamics',
        ],
        signatureEffect:
          'Building emotional intensity through power and release',
        registerUse: 'Chest voice dominant, controlled head voice',
        vibrato: 'Wide, expressive',
        breathiness: 0.4,
      },
      productionCharacteristics: {
        typicalBpm: '65-90',
        keySignature: ['C', 'G', 'Am', 'F', 'Dm'],
        drumPattern: 'Live drum feel, minimal percussion, vocal-forward',
        bassStyle: 'Bass guitar, warm and round',
        chordVocabulary: ['Ballad progressions', 'IV-I movement'],
        signatureElement: 'Space between phrases',
        mixStyle: 'Warm, dynamic, human',
      },
      songwritingCharacteristics: {
        structure: 'Classic ballad structure with bridge climax',
        lyricalThemes: [
          'Heartbreak',
          'Loss',
          'Nostalgia',
          'Relationship reflection',
        ],
        hookStyle: 'Powerful, building chorus with repeated title',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Emotional, direct',
      },
    },
    SZA: {
      artistName: 'SZA',
      genre: 'Alternative R&B / Neo Soul',
      vocalCharacteristics: {
        range: 'Mezzo-soprano (F3-E5)',
        timbre: 'Warm, breathy, sultry, emotionally textured',
        technique: [
          'Vocal runs and ad-lib layers',
          'Whisper-to-belt dynamics',
          'Unconventional phrasing',
          'Layered harmonies',
        ],
        signatureEffect: 'Airy vocal doubling with heavy reverb tails',
        registerUse: 'Chest to mix, floating head voice',
        vibrato: 'Subtle, controlled',
        breathiness: 0.85,
      },
      productionCharacteristics: {
        typicalBpm: '70-110',
        keySignature: ['G#m', 'F#m', 'Bm', 'Dm'],
        drumPattern: 'Wonky R&B drums, sparse trap hi-hats, live percussion',
        bassStyle: 'Deep sub-bass with warm midrange, 808 slides',
        chordVocabulary: [
          'Minor 9th',
          'Jazzy extensions',
          'Suspended chords',
          'Unexpected modulations',
        ],
        signatureElement: 'Atmospheric space — silence and texture between phrases',
        mixStyle: 'Warm, intimate, vocal-forward with soft distortion',
      },
      songwritingCharacteristics: {
        structure: 'Stream-of-consciousness, freeform verses',
        lyricalThemes: [
          'Insecurity',
          'Self-worth',
          'Messy relationships',
          'Growth and healing',
        ],
        hookStyle: 'Melodic repetition with emotional specificity',
        rhymeComplexity: 0.7,
        vocabularyLevel: 'Introspective, conversational, poetic',
      },
    },
    'Travis Scott': {
      artistName: 'Travis Scott',
      genre: 'Hip Hop / Trap / Psychedelic',
      vocalCharacteristics: {
        range: 'Tenor (Bb2-C5)',
        timbre: 'Auto-tuned, distorted, ecstatic, chaotic',
        technique: [
          'Auto-tune as primary instrument',
          'Melodic mumble-rapping',
          'Ad-lib punctuation (it!, yeah!, straight up)',
          'Dynamic screams and whispers',
        ],
        signatureEffect: 'Heavy auto-tune with distortion, layered ad-libs',
        registerUse: 'Chest with pitched falsetto peaks',
        vibrato: 'Auto-tune warble',
        breathiness: 0.4,
      },
      productionCharacteristics: {
        typicalBpm: '130-160',
        keySignature: ['F#m', 'Cm', 'G#m', 'Dm'],
        drumPattern: 'Dark trap with hard 808s, triplets, cymbal swells',
        bassStyle: '808 sub-bass with distortion and pitch bends',
        chordVocabulary: [
          'Minor',
          'Phrygian',
          'Horror-movie ambience',
          'Chromatic movement',
        ],
        signatureElement: 'Cinematic drops, stadium-rage energy, vocoder choirs',
        mixStyle: 'Loud, aggressive, bass-forward with airy synths',
      },
      songwritingCharacteristics: {
        structure: 'Rage-anthem format with chantable hooks',
        lyricalThemes: [
          'Astroworld imagery',
          'Hedonism',
          'Fame and isolation',
          'Nostalgia',
        ],
        hookStyle: 'Chanted, repetitive, built for festivals',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Urban slang, atmospheric, associative',
      },
    },
    Eminem: {
      artistName: 'Eminem',
      genre: 'Hip Hop / Horrorcore',
      vocalCharacteristics: {
        range: 'Tenor (A2-C5)',
        timbre: 'Nasal, angry, comedic, razor-sharp',
        technique: [
          'Rapid-fire double-time delivery',
          'Multisyllabic rhyme schemes',
          'Character voices and accents',
          'Comedic sound effects',
        ],
        signatureEffect: 'Machine-gun syllable stacking, internal rhyme acrobatics',
        registerUse: 'Chest dominant with high-intensity yell register',
        vibrato: 'None — staccato attack',
        breathiness: 0.1,
      },
      productionCharacteristics: {
        typicalBpm: '70-180',
        keySignature: ['Cm', 'Am', 'Em', 'Dm'],
        drumPattern: 'Boom-bap meets modern trap, hard-hitting snares',
        bassStyle: 'Driving basslines, horror-movie strings',
        chordVocabulary: [
          'Minor keys',
          'Dissonant stabs',
          'Dramatic orchestral hits',
        ],
        signatureElement: 'Wordplay density — the verse IS the hook',
        mixStyle: 'Vocal-forward, aggressive, punchy',
      },
      songwritingCharacteristics: {
        structure: 'Dense multi-verse storytelling, no wasted bars',
        lyricalThemes: [
          'Inner demons',
          'Industry warfare',
          'Fatherhood',
          'Social commentary',
        ],
        hookStyle: 'Memorable sing-song choruses contrasting furious verses',
        rhymeComplexity: 1.0,
        vocabularyLevel: 'Elite, technical, witty',
      },
    },
    Rihanna: {
      artistName: 'Rihanna',
      genre: 'Pop / R&B / Dancehall',
      vocalCharacteristics: {
        range: 'Contralto (A2-E5)',
        timbre: 'Sultry, raspy, commanding, island-flavored',
        technique: [
          'Vocal fry swagger',
          'Melodic hooks',
          'Dancehall toasting',
          'Attitude-driven delivery',
        ],
        signatureEffect: 'Raspy edge with delayed vocal throws',
        registerUse: 'Low chest with clean belted choruses',
        vibrato: 'Minimal',
        breathiness: 0.35,
      },
      productionCharacteristics: {
        typicalBpm: '90-130',
        keySignature: ['Fm', 'Cm', 'Gm', 'Dm'],
        drumPattern: 'Dancehall riddims, pop percussion, reggaeton bounce',
        bassStyle: 'Pulsing synth bass, dancehall sub-bass',
        chordVocabulary: [
          'Minor',
          'Dancehall progressions',
          'EDM drops',
        ],
        signatureElement: 'The beat drops on the hook — maximal radio impact',
        mixStyle: 'Polished, radio-ready, bassy',
      },
      songwritingCharacteristics: {
        structure: 'Pop-verse with explosive choruses',
        lyricalThemes: [
          'Empowerment',
          'Love and lust',
          'Party anthems',
          'Independence',
        ],
        hookStyle: 'Simple, universal, instantly singable',
        rhymeComplexity: 0.4,
        vocabularyLevel: 'Direct, confident, accessible',
      },
    },
    'Bruno Mars': {
      artistName: 'Bruno Mars',
      genre: 'Pop / Funk / R&B / Soul',
      vocalCharacteristics: {
        range: 'Tenor (Bb2-C5)',
        timbre: 'Smooth, dynamic, playful, retro-soul',
        technique: [
          'Falsetto gymnastics',
          'Funk yelps and runs',
          'Retro crooning',
          'Dynamic control',
        ],
        signatureEffect: 'Playful vocal licks over live-band energy',
        registerUse: 'Full range — chest to soaring falsetto',
        vibrato: 'Expressive, controlled',
        breathiness: 0.3,
      },
      productionCharacteristics: {
        typicalBpm: '100-128',
        keySignature: ['Cm', 'Am', 'Fm', 'Gm'],
        drumPattern: 'Live funk drums, throwback percussion, tight pocket',
        bassStyle: 'Slap funk bass, live horns, Motown warmth',
        chordVocabulary: [
          'Funk grooves',
          'Retro soul',
          'Disco progressions',
        ],
        signatureElement: 'Live instrumentation — the band is the star',
        mixStyle: 'Warm analog feel, horn-forward, punchy',
      },
      songwritingCharacteristics: {
        structure: 'Classic pop-song craft with retro flair',
        lyricalThemes: [
          'Romance',
          'Celebration',
          'Nostalgia',
          'Fun and dancing',
        ],
        hookStyle: 'Melodic, joyful, throwback sing-along',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Playful, universal, warm',
      },
    },
    'Ariana Grande': {
      artistName: 'Ariana Grande',
      genre: 'Pop / R&B',
      vocalCharacteristics: {
        range: 'Soprano (C3-E6)',
        timbre: 'Bright, agile, crystalline, powerful',
        technique: [
          'Whistle register peaks',
          'Melismatic runs',
          'Light vocal fry',
          'Powerful belts',
        ],
        signatureEffect: 'Vocal acrobatics with breathy intimacy',
        registerUse: 'Chest to head to whistle — full spectrum',
        vibrato: 'Fast, controlled',
        breathiness: 0.5,
      },
      productionCharacteristics: {
        typicalBpm: '85-140',
        keySignature: ['Gm', 'Am', 'Cm', 'Fm'],
        drumPattern: 'Trap-pop with 808s, crisp snares, glossy percussion',
        bassStyle: '808 sub-bass with R&B warmth',
        chordVocabulary: [
          'Minor progressions',
          'Trap-pop',
          'Gospel-influenced',
        ],
        signatureElement: 'The key-change run — vocal pyrotechnics as climax',
        mixStyle: 'Glossy, modern, vocal-forward',
      },
      songwritingCharacteristics: {
        structure: 'Modern pop with dynamic bridges',
        lyricalThemes: [
          'Self-love',
          'Heartbreak',
          'Empowerment',
          'Gratitude',
        ],
        hookStyle: 'Huge melodic hooks with vocal runs',
        rhymeComplexity: 0.5,
        vocabularyLevel: 'Contemporary, sweet, direct',
      },
    },
  };

  private readonly techniqueLibrary: Record<string, string[]> = {
    'melodic rap': [
      'Mix singing and rapping in the same phrase',
      'Use pitch variation on key words',
      'Slide between notes in the vocal melody',
      'Layer a melodic hook over rhythmic verses',
    ],
    'trap vocals': [
      'Use ad-libs every 2-4 bars',
      'Apply heavy auto-tune (0-100 retune speed)',
      'Create call-and-response patterns',
      'Layer doubles on the hook',
    ],
    'soul/r&b': [
      'Vocal runs and melisma',
      'Falsetto for emotional peaks',
      'Breathy intimacy in verses',
      'Gospel-influenced harmonies',
    ],
    'punk/rock': [
      'Raw, unpolished delivery',
      'Intentional pitch imperfection',
      'High-energy, shouted choruses',
      'Minimal vocal processing',
    ],
    'lo-fi': [
      'Low-fidelity texture',
      'VHS warble effect',
      'Muffled proximity effect',
      'Room ambience in vocal chain',
    ],
    'folk/acoustic': [
      'Clear diction and storytelling',
      'Natural vibrato',
      'Room microphone ambience',
      'Minimal effects processing',
    ],
  };

  getAvailableArtists(): string[] {
    return Object.keys(this.styleLibrary);
  }

  getStyleProfile(artist: string): StyleProfile | null {
    const key = Object.keys(this.styleLibrary).find(
      (k) => k.toLowerCase() === artist.toLowerCase()
    );
    return key ? this.styleLibrary[key] : null;
  }

  searchByGenre(genre: string): StyleProfile[] {
    return Object.values(this.styleLibrary).filter((p) =>
      p.genre.toLowerCase().includes(genre.toLowerCase())
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

  generateProductionRecipe(
    artist: string,
    trackName: string = 'Untitled'
  ): string | null {
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
    const cat = Object.keys(this.techniqueLibrary).find((k) =>
      k.toLowerCase().includes(category.toLowerCase())
    );
    return cat ? this.techniqueLibrary[cat] : null;
  }

  getAllGenres(): string[] {
    return [...new Set(Object.values(this.styleLibrary).map((p) => p.genre))];
  }
}
