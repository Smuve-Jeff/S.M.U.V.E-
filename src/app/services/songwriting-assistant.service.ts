import { Injectable, inject } from '@angular/core';
import { SmuveStyleMimicService, StyleProfile } from './smuve-style-mimic.service';
import { AiService } from './ai.service';

export interface LyricLine {
  text: string;
  rhymeClass?: string;
  syllableCount: number;
  emphasis?: 'hook' | 'build' | 'payoff';
}

export interface LyricSection {
  type: 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'intro' | 'outro';
  lines: LyricLine[];
  theme?: string;
  mood?: string;
}

export interface ChordProgression {
  name: string;
  chords: string[];
  key: string;
  mood: string;
  complexity: 'Basic' | 'Intermediate' | 'Advanced';
  usage: string;
  artists: string[];
}

export interface MelodyIdea {
  description: string;
  contour: string;
  rhythm: string;
  range: string;
  technique: string;
  artistExample?: string;
}

export interface SongStructureTemplate {
  name: string;
  sections: { type: string; bars: number; description: string }[];
  totalBars: number;
  genre: string;
}

export interface MelodyNote {
  pitch: number;
  duration: string;
  velocity: number;
  startBeat: number;
  word: string;
}

export interface SongwritingAssistantResult {
  lyrics: LyricSection[];
  chordProgressions: ChordProgression[];
  melodyIdeas: MelodyIdea[];
  structure: SongStructureTemplate;
  styleTips?: string[];
  artistReference?: string;
}

@Injectable({ providedIn: 'root' })
export class SongwritingAssistantService {
  private styleMimic = inject(SmuveStyleMimicService);
  private ai = inject(AiService);

  private readonly chordLibrary: ChordProgression[] = [
    { name: 'The Pop Classic', chords: ['I', 'V', 'vi', 'IV'], key: 'C', mood: 'Uplifting, nostalgic', complexity: 'Basic',
      usage: 'The most common progression in pop music. Used in thousands of hits.', artists: ['Taylor Swift', 'Ed Sheeran', 'Adele'] },
    { name: 'The Dark Queen', chords: ['i', 'VII', 'VI', 'VII'], key: 'Am', mood: 'Dark, dramatic, epic', complexity: 'Basic',
      usage: 'Minor progression with dramatic feel. Perfect for emotional ballads.', artists: ['Billie Eilish', 'Lana Del Rey', 'The Weeknd'] },
    { name: 'Neo Soul Groove', chords: ['i7', 'IV7', 'bVII', 'bIII'], key: 'Dm', mood: 'Smooth, jazzy, warm', complexity: 'Intermediate',
      usage: 'Extended chords create rich, soulful texture. Great for R&B.', artists: ['Erykah Badu', 'D\'Angelo', 'Frank Ocean'] },
    { name: 'Rock Anthem', chords: ['I', 'IV', 'V', 'IV'], key: 'G', mood: 'Energetic, straightforward', complexity: 'Basic',
      usage: 'The 12-bar blues inspired rock progression. Power chords work best.', artists: ['AC/DC', 'The Rolling Stones', 'Green Day'] },
    { name: 'Jazz Standard', chords: ['ii7', 'V7', 'Imaj7', 'V7/ii'], key: 'C', mood: 'Sophisticated, complex', complexity: 'Advanced',
      usage: 'II-V-I progression with secondary dominants. Foundation of jazz harmony.', artists: ['Miles Davis', 'John Coltrane', 'Bill Evans'] },
    { name: 'Trap Minor', chords: ['i', 'II', 'III', 'i'], key: 'F#m', mood: 'Dark, aggressive, modern', complexity: 'Basic',
      usage: 'Standard trap progression on minor keys. Heavy 808s underneath.', artists: ['Drake', 'Future', 'Metro Boomin'] },
    { name: 'Gospel Lift', chords: ['I', 'IV', 'V', 'vi', 'I/III', 'IV', 'V', 'I'], key: 'C', mood: 'Uplifting, soulful, spiritual', complexity: 'Intermediate',
      usage: 'Extended gospel progression with passing chords for emotional lift.', artists: ['Kirk Franklin', 'Aretha Franklin', 'Kanye West'] },
    { name: 'Dream Pop Wash', chords: ['I', 'III', 'IV', 'VI'], key: 'E', mood: 'Ethereal, floating, dreamy', complexity: 'Intermediate',
      usage: 'Major chords moving in whole steps creates floating sensation.', artists: ['Beach House', 'Cocteau Twins', 'Alvvays'] },
    { name: 'Blues Shuffle', chords: ['I7', 'IV7', 'V7'], key: 'A', mood: 'Gritty, soulful, raw', complexity: 'Basic',
      usage: 'Standard 12-bar blues with dominant 7th chords. Foundation of rock, blues, soul.', artists: ['B.B. King', 'Muddy Waters', 'Stevie Ray Vaughan'] },
    { name: 'Minor Epic', chords: ['i', 'VI', 'III', 'VII'], key: 'Am', mood: 'Cinematic, powerful, emotional', complexity: 'Intermediate',
      usage: 'Heroic minor progression used in epic ballads and film scores.', artists: ['Hans Zimmer', 'Adele', 'Coldplay'] },
  ];

  private readonly structureLibrary: SongStructureTemplate[] = [
    { name: 'Modern Pop Standard', genre: 'Pop', totalBars: 128,
      sections: [
        { type: 'intro', bars: 8, description: 'Instrumental hook establishing vibe' },
        { type: 'verse', bars: 16, description: 'First verse, build the story' },
        { type: 'pre-chorus', bars: 8, description: 'Tension builder with rising energy' },
        { type: 'chorus', bars: 16, description: 'Main hook, full energy' },
        { type: 'verse', bars: 16, description: 'Second verse, deepen narrative' },
        { type: 'pre-chorus', bars: 8, description: 'Same tension as first' },
        { type: 'chorus', bars: 16, description: 'Same hook, slightly bigger production' },
        { type: 'bridge', bars: 16, description: 'New chord progression, emotional peak' },
        { type: 'chorus', bars: 16, description: 'Final chorus, biggest production' },
        { type: 'outro', bars: 8, description: 'Fade out or cold stop' },
      ] },
    { name: 'Hip-Hop / Trap', genre: 'Hip Hop', totalBars: 96,
      sections: [
        { type: 'intro', bars: 8, description: 'Minimal beat with a signature sample' },
        { type: 'verse', bars: 16, description: 'First verse bar-heavy, establish flow' },
        { type: 'chorus', bars: 8, description: 'Melodic hook, repetitive and catchy' },
        { type: 'verse', bars: 16, description: 'Second verse, switch flow pattern' },
        { type: 'chorus', bars: 8, description: 'Same hook, ad-libs added' },
        { type: 'verse', bars: 8, description: 'Short third verse, feature or breakdown' },
        { type: 'chorus', bars: 8, description: 'Final hook with all layers' },
        { type: 'outro', bars: 8, description: 'Beat continues with ad-libs, fades' },
      ] },
    { name: 'R&B Slow Jam', genre: 'R&B', totalBars: 112,
      sections: [
        { type: 'intro', bars: 8, description: 'Sparse beat, ambient pads, vocal ad-libs' },
        { type: 'verse', bars: 16, description: 'Smooth vocal delivery, melodic runs' },
        { type: 'pre-chorus', bars: 8, description: 'Building intensity with vocal layering' },
        { type: 'chorus', bars: 16, description: 'Full vocal harmony, emotional release' },
        { type: 'verse', bars: 16, description: 'Second verse, more vocal runs' },
        { type: 'chorus', bars: 16, description: 'Same hook with harmonies' },
        { type: 'bridge', bars: 16, description: 'Key change or modulation, spoken ad-libs' },
        { type: 'chorus', bars: 16, description: 'Final chorus, biggest vocal arrangement' },
      ] },
    { name: 'Singer-Songwriter', genre: 'Folk/Acoustic', totalBars: 96,
      sections: [
        { type: 'intro', bars: 4, description: 'Fingerpicking riff or simple chord strumming' },
        { type: 'verse', bars: 16, description: 'Storytelling verse, intimate delivery' },
        { type: 'chorus', bars: 8, description: 'Louder strumming, singable hook' },
        { type: 'verse', bars: 16, description: 'Second chapter of the story' },
        { type: 'chorus', bars: 8, description: 'Same hook, added harmonies' },
        { type: 'bridge', bars: 16, description: 'New perspective, instrumental peak' },
        { type: 'chorus', bars: 8, description: 'Final chorus with full dynamics' },
        { type: 'outro', bars: 8, description: 'Return to fingerpicking, fade' },
      ] },
    { name: 'Electronic / House', genre: 'Electronic', totalBars: 128,
      sections: [
        { type: 'intro', bars: 16, description: 'Build with filtered drums and atmos' },
        { type: 'verse', bars: 16, description: 'Groove with bass and percussion' },
        { type: 'build-up', bars: 16, description: 'Riser FX, increasing intensity' },
        { type: 'chorus', bars: 16, description: 'Drop — full production, main hook' },
        { type: 'breakdown', bars: 16, description: 'Reduced elements, pads, vocal sample' },
        { type: 'build-up', bars: 16, description: 'Second build with more energy' },
        { type: 'chorus', bars: 16, description: 'Second drop, modified elements' },
        { type: 'outro', bars: 16, description: 'Filtered fade with reverb tail' },
      ] },
    { name: 'Jazz Standard', genre: 'Jazz', totalBars: 64,
      sections: [
        { type: 'intro', bars: 8, description: 'Head arrangement, solo piano/guitar' },
        { type: 'verse', bars: 16, description: 'A section — main theme statement' },
        { type: 'verse', bars: 16, description: 'A\' section — theme varied' },
        { type: 'bridge', bars: 16, description: 'B section — contrasting harmony' },
        { type: 'verse', bars: 16, description: 'Final A section — return to theme' },
      ] },
  ];

  private readonly melodyTechniques: MelodyIdea[] = [
    { description: 'Step-wise motion with occasional leaps', contour: 'Wavy, mostly conjunct with strategic leaps', rhythm: 'Quarter and eighth note dominant', range: 'Within an octave', technique: 'Start on chord tones, use passing tones for tension', artistExample: 'Adele — "Hello"' },
    { description: 'Repetitive hook with slight variations', contour: 'Narrow, hook-centric', rhythm: 'Syncopated, rhythmic emphasis on key words', range: '5th or less', technique: 'Repeat the melodic phrase 3x, change the 4th iteration', artistExample: 'Taylor Swift — "Shake It Off"' },
    { description: 'Wide interval leaps for emotional impact', contour: 'Angular, large jumps', rhythm: 'Half and whole notes on leaps, quick notes in-between', range: 'Octave to 12th', technique: 'Leap up for emotional peak, step down for resolution', artistExample: 'Whitney Houston — "I Will Always Love You"' },
    { description: 'Pentatonic-based melodies', contour: 'Smooth, natural, singer-friendly', rhythm: 'Varied, flexible', range: '6th to octave', technique: 'Use the minor pentatonic for blues/soul, major for pop/folk', artistExample: 'Ed Sheeran — "Thinking Out Loud"' },
    { description: 'Arpeggiated melody (chord tones only)', contour: 'Outlines chord shapes', rhythm: 'Triplet or sixteenth-based', range: 'Wide, covers chord voicings', technique: 'Sing the notes of the underlying chord in sequence', artistExample: 'Drake — "Hold On, We\'re Going Home"' },
    { description: 'Call and response phrasing', contour: 'Binary — two distinct phrases', rhythm: 'Question (rising) then answer (falling)', range: 'Varied', technique: 'First phrase ends unresolved (up), second resolves (down)', artistExample: 'Michael Jackson — "Billie Jean"' },
  ];

  /** Generate a complete songwriting assistant result based on a style and topic */
  generateLyrics(topic: string, style?: string, mood?: string, artist?: string): SongwritingAssistantResult {
    const profile = artist ? this.styleMimic.getStyleProfile(artist) : null;
    const archetype = profile || null;

    // Build lyrics based on the topic, style, and artist influence
    const lyrics = this.buildLyricSections(topic, mood || 'emotional', archetype);

    // Select relevant chord progressions
    const chordProgressions = this.selectChordProgressions(archetype, mood);

    // Select melody ideas
    const melodyIdeas = this.selectMelodyIdeas(archetype);

    // Select structure template
    const structure = this.selectStructure(archetype);

    // Style tips from the artist profile
    const styleTips = archetype ? [
      `🎤 VOCAL APPROACH: ${archetype.vocalCharacteristics.technique.slice(0, 2).join(', ')}`,
      `🎛️ PRODUCTION: ${archetype.productionCharacteristics.signatureElement}`,
      `📝 WRITING: Focus on ${archetype.songwritingCharacteristics.lyricalThemes[0]}`,
    ] : undefined;

    return {
      lyrics,
      chordProgressions,
      melodyIdeas,
      structure,
      styleTips,
      artistReference: archetype?.artistName,
    };
  }

  /** Generate lyrics for specific sections */
  generateLyricBySection(type: LyricSection['type'], topic: string, mood: string, artist?: string): LyricSection {
    const profile = artist ? this.styleMimic.getStyleProfile(artist) : null;
    return this.buildSingleSection(type, topic, mood, profile);
  }

  /** Get chord progressions filtered by mood/artist */
  getChordsByMood(mood: string): ChordProgression[] {
    return this.chordLibrary.filter(c =>
      c.mood.toLowerCase().includes(mood.toLowerCase())
    );
  }

  /** Suggest a structure based on genre */
  suggestStructure(genre: string): SongStructureTemplate {
    const matched = this.structureLibrary.find(s =>
      s.genre.toLowerCase() === genre.toLowerCase()
    );
    return matched || this.structureLibrary[0];
  }

  /** Get melody techniques filtered by style */
  getMelodyIdeas(style?: string): MelodyIdea[] {
    return this.melodyTechniques;
  }

  /** Generate actual MIDI note melody for lyrics */
  generateMelodyForLyrics(lyrics: LyricSection[], key: string = 'C', scale: string = 'major'): MelodyNote[][] {
    const scaleNotes = this.getScaleNotes(key, scale);
    return lyrics.flatMap(section =>
      section.lines.map((line, li) => {
        const words = line.text.split(' ');
        const syllables = this.estimateSyllables(line.text);
        const noteCount = Math.min(syllables, 16);
        const notes: MelodyNote[] = [];

        // Determine contour based on emphasis
        let startIndex: number;
        let direction: number;
        switch (line.emphasis) {
          case 'hook':
            startIndex = 4; // Start on upper notes for hooks
            direction = 0; // Stay centered
            break;
          case 'build':
            startIndex = 2; // Start lower, build up
            direction = 1;
            break;
          case 'payoff':
            startIndex = 5; // Start high, resolve down
            direction = -1;
            break;
          default:
            startIndex = 3;
            direction = 0;
        }

        for (let n = 0; n < noteCount; n++) {
          // Step through scale with contour
          const step = (n * direction) + startIndex + Math.floor(n / 2) * (direction > 0 ? 1 : -1);
          const index = ((step % scaleNotes.length) + scaleNotes.length) % scaleNotes.length;
          const pitch = scaleNotes[index] + 60; // Middle octave

          // Rhythm: quarter notes with occasional eighth notes on emphasized syllables
          const isEmphasized = n === 0 || n === Math.floor(noteCount / 2) || n === noteCount - 1;
          const duration = isEmphasized ? '4n' : '8n';
          const velocity = isEmphasized ? 100 : 75;

          // Accent syllables that carry emotional weight
          const word = words[Math.min(n, words.length - 1)] || '';
          const isAccent = word.match(/^[A-Z]/) || ['!', '?', '.', ','].some(p => word.endsWith(p));

          notes.push({
            pitch,
            duration,
            velocity: isAccent ? Math.min(velocity + 15, 127) : velocity,
            startBeat: n * 0.5,
            word: word.replace(/[^a-zA-Z']/g, ''),
          });
        }

        return notes;
      })
    );
  }

  /** Get the scale notes for a given key */
  private getScaleNotes(key: string, scale: string): number[] {
    const chromaticScale = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const keyIndex = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].indexOf(key);
    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
    const intervals = scale === 'minor' || scale === 'minor' ? minorIntervals : majorIntervals;

    return intervals.map(i => (keyIndex + i) % 12);
  }

  /** Estimate syllable count for text */
  private estimateSyllables(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    return words.reduce((count, word) => {
      word = word.replace(/[^a-zA-Z]/g, '');
      if (word.length <= 3) return count + 1;
      // Count vowel groups
      const vowelGroups = word.match(/[aeiouy]+/gi);
      let sylCount = vowelGroups ? vowelGroups.length : 1;
      // Adjust for silent e
      if (word.endsWith('e') && !word.endsWith('le') && sylCount > 1) sylCount--;
      // Adjust for -le ending
      if (word.endsWith('le') && word.length > 4) sylCount++;
      return count + Math.max(1, sylCount);
    }, 1);
  }

  private buildLyricSections(topic: string, mood: string, profile: StyleProfile | null): LyricSection[] {
    const sections: LyricSection[] = [
      {
        type: 'verse',
        lines: this.generateVerseLines(topic, mood, 1, profile),
        theme: `Setting the scene — ${topic}`,
        mood,
      },
      {
        type: 'chorus',
        lines: this.generateChorusLines(topic, mood, profile),
        theme: `Core hook — ${topic}`,
        mood: mood === 'dark' ? 'empowered' : 'uplifted',
      },
      {
        type: 'verse',
        lines: this.generateVerseLines(topic, mood, 2, profile),
        theme: `Deepening the narrative — consequences and reflection`,
        mood,
      },
      {
        type: 'bridge',
        lines: this.generateBridgeLines(topic, mood, profile),
        theme: `Turning point — new perspective`,
        mood: 'introspective',
      },
      {
        type: 'chorus',
        lines: this.generateChorusLines(topic, mood, profile),
        theme: `Final hook — cathartic release`,
        mood: 'powerful',
      },
    ];
    return sections;
  }

  private generateVerseLines(topic: string, mood: string, num: number, profile: StyleProfile | null): LyricLine[] {
    const templates = profile
      ? this.getArtistVerseTemplates(profile, topic)
      : this.getGenericVerseTemplates(topic, mood);

    // Add verse-number specific flavor
    if (num === 2) {
      templates.push({
        text: `And now I'm facing what I couldn't see before`,
        syllableCount: 12,
        emphasis: 'build',
      });
    }

    return templates.slice(0, 4).map((t, i) => ({
      ...t,
      rhymeClass: i % 2 === 0 ? 'A' : 'B',
    }));
  }

  private generateChorusLines(topic: string, mood: string, profile: StyleProfile | null): LyricLine[] {
    const lines: LyricLine[] = profile
      ? this.getArtistChorusTemplates(profile, topic)
      : [
        { text: `This is the part that I can't escape`, syllableCount: 9, emphasis: 'hook' },
        { text: `The melody that my heart creates`, syllableCount: 9, emphasis: 'hook' },
        { text: `And every time I try to look away`, syllableCount: 10, emphasis: 'build' },
        { text: `It pulls me back — I'm here to stay`, syllableCount: 9, emphasis: 'payoff' },
      ];

    return lines.map((t, i) => ({
      ...t,
      rhymeClass: 'A',
    }));
  }

  private generateBridgeLines(topic: string, mood: string, profile: StyleProfile | null): LyricLine[] {
    return [
      { text: `But what if everything I thought was wrong?`, syllableCount: 10, emphasis: 'build' },
      { text: `What if the story's just begun?`, syllableCount: 8, emphasis: 'build' },
      { text: `I hear a different melody now`, syllableCount: 8, emphasis: 'payoff' },
      { text: `A new verse waiting to be sung`, syllableCount: 8, emphasis: 'payoff' },
    ];
  }

  private getArtistVerseTemplates(profile: StyleProfile, topic: string): LyricLine[] {
    // Generate artist-specific lyrical lines based on their style
    const themes = profile.songwritingCharacteristics.lyricalThemes;
    const vocab = profile.songwritingCharacteristics.vocabularyLevel;

    switch (profile.artistName) {
      case 'Drake':
        return [
          { text: `I've been goin' through it, you don't even know the half`, syllableCount: 12, emphasis: 'build' },
          { text: `They see the wins but never see the aftermath`, syllableCount: 11, emphasis: 'build' },
          { text: `${topic} is heavy, but I carry it like cash`, syllableCount: 11, emphasis: 'payoff' },
          { text: `Another night, another city, another flash`, syllableCount: 10, emphasis: 'build' },
        ];
      case 'The Weeknd':
        return [
          { text: `The neon lights reflect the pain I try to hide`, syllableCount: 12, emphasis: 'build' },
          { text: `Another night, another high to get me by`, syllableCount: 11, emphasis: 'build' },
          { text: `${topic} tastes like the chemicals inside`, syllableCount: 10, emphasis: 'payoff' },
          { text: `I'll lose myself before I let it die`, syllableCount: 10, emphasis: 'build' },
        ];
      case 'J. Cole':
        return [
          { text: `They told me chase the dream, but don't forget the cost`, syllableCount: 12, emphasis: 'build' },
          { text: `Every lesson that I learned, every line I lost`, syllableCount: 11, emphasis: 'build' },
          { text: `${topic} is the truth that they don't want to hear`, syllableCount: 11, emphasis: 'payoff' },
          { text: `But I'll still speak it loud and crystal clear`, syllableCount: 10, emphasis: 'payoff' },
        ];
      case 'Lana Del Rey':
        return [
          { text: `Cigarette smoke and the taste of cheap champagne`, syllableCount: 11, emphasis: 'build' },
          { text: `Driving fast through the valley, calling out your name`, syllableCount: 12, emphasis: 'build' },
          { text: `${topic} tastes like summer fading in the rain`, syllableCount: 11, emphasis: 'payoff' },
          { text: `And I'm still waiting for you down the lane`, syllableCount: 10, emphasis: 'build' },
        ];
      case 'Kendrick Lamar':
        return [
          { text: `I got the weight of the world on my vertebrae`, syllableCount: 12, emphasis: 'build' },
          { text: `Every line I write is born from yesterday`, syllableCount: 11, emphasis: 'build' },
          { text: `${topic} is the truth that I was born to say`, syllableCount: 11, emphasis: 'payoff' },
          { text: `They'll study verses like a eulogy someday`, syllableCount: 11, emphasis: 'payoff' },
        ];
      case 'Amy Winehouse':
        return [
          { text: `They said I'd never learn, but darling here I am`, syllableCount: 12, emphasis: 'build' },
          { text: `With my heart on my sleeve and my head in my hands`, syllableCount: 12, emphasis: 'build' },
          { text: `${topic} is a game I don't understand`, syllableCount: 10, emphasis: 'payoff' },
          { text: `But I'll play it again for the band`, syllableCount: 9, emphasis: 'build' },
        ];
      default:
        return [
          { text: `I've been walking down this road for way too long`, syllableCount: 11, emphasis: 'build' },
          { text: `Carrying the weight of every broken song`, syllableCount: 11, emphasis: 'build' },
          { text: `${topic} is the chapter where I right the wrongs`, syllableCount: 11, emphasis: 'payoff' },
          { text: `And sing until my voice is finally gone`, syllableCount: 10, emphasis: 'build' },
        ];
    }
  }

  private getArtistChorusTemplates(profile: StyleProfile, topic: string): LyricLine[] {
    switch (profile.artistName) {
      case 'Taylor Swift':
        return [
          { text: `And I don't know how to say goodbye to ${topic}`, syllableCount: 12, emphasis: 'hook' },
          { text: `You're the chapter that I've been rewriting in my mind`, syllableCount: 13, emphasis: 'hook' },
          { text: `Every bridge leads back to you and I`, syllableCount: 10, emphasis: 'payoff' },
          { text: `And I love you, I'm sorry, goodbye`, syllableCount: 10, emphasis: 'payoff' },
        ];
      case 'Beyoncé':
        return [
          { text: `I've been through ${topic}, I've seen it all before`, syllableCount: 11, emphasis: 'hook' },
          { text: `But I'm dancing through the fire, hear me roar`, syllableCount: 11, emphasis: 'hook' },
          { text: `I'm taking back the power at the door`, syllableCount: 10, emphasis: 'payoff' },
          { text: `And I won't be broken anymore`, syllableCount: 9, emphasis: 'payoff' },
        ];
      case 'Michael Jackson':
        return [
          { text: `They're talking 'bout ${topic}, can you feel it rise?`, syllableCount: 11, emphasis: 'hook' },
          { text: `The rhythm of the world is in our eyes`, syllableCount: 11, emphasis: 'hook' },
          { text: `We're gonna make a change before the morning light`, syllableCount: 12, emphasis: 'payoff' },
          { text: `Together we can make the wrong things right (hee-hee!)`, syllableCount: 11, emphasis: 'payoff' },
        ];
      case 'Frank Ocean':
        return [
          { text: `${topic} is the current pulling me under`, syllableCount: 11, emphasis: 'hook' },
          { text: `And I'm swimming but I'm going nowhere`, syllableCount: 10, emphasis: 'build' },
          { text: `The water's cold but I've been thinking of you there`, syllableCount: 12, emphasis: 'payoff' },
          { text: `Guess I'm just afloat, pretending that I care`, syllableCount: 11, emphasis: 'payoff' },
        ];
      default:
        return [
          { text: `And this is the heart of ${topic}`, syllableCount: 9, emphasis: 'hook' },
          { text: `The part that I can never change`, syllableCount: 9, emphasis: 'hook' },
          { text: `I'm standing in the open door`, syllableCount: 8, emphasis: 'payoff' },
          { text: `And I won't be the same`, syllableCount: 7, emphasis: 'payoff' },
        ];
    }
  }

  private getGenericVerseTemplates(topic: string, mood: string): LyricLine[] {
    return [
      { text: `I never thought I'd feel this way about ${topic}`, syllableCount: 12, emphasis: 'build' },
      { text: `But here I am, standing in the aftermath`, syllableCount: 11, emphasis: 'build' },
      { text: `The echoes of the words you left behind`, syllableCount: 10, emphasis: 'payoff' },
      { text: `Still ringing through the hollow of my mind`, syllableCount: 10, emphasis: 'build' },
    ];
  }

  private buildSingleSection(type: LyricSection['type'], topic: string, mood: string, profile: StyleProfile | null): LyricSection {
    switch (type) {
      case 'chorus':
        return { type, lines: this.generateChorusLines(topic, mood, profile), theme: `Hook about ${topic}`, mood };
      case 'bridge':
        return { type, lines: this.generateBridgeLines(topic, mood, profile), theme: `Turning point about ${topic}`, mood: 'introspective' };
      default:
        return { type, lines: this.generateVerseLines(topic, mood, 1, profile), theme: `Verse about ${topic}`, mood };
    }
  }

  private selectChordProgressions(profile: StyleProfile | null, mood?: string): ChordProgression[] {
    let pool = this.chordLibrary;

    if (profile) {
      const preferredKeys = profile.productionCharacteristics.keySignature || [];
      const preferredChords = profile.productionCharacteristics.chordVocabulary || [];

      pool = pool.filter(c =>
        preferredChords.some(v => c.name.toLowerCase().includes(v.toLowerCase()) ||
          c.chords.join(' ').toLowerCase().includes(v.toLowerCase()))
      );

      if (pool.length === 0) pool = this.chordLibrary;
    }

    if (mood) {
      const moodFiltered = pool.filter(c =>
        c.mood.toLowerCase().includes(mood.toLowerCase())
      );
      if (moodFiltered.length > 0) pool = moodFiltered;
    }

    return pool.slice(0, 4);
  }

  private selectMelodyIdeas(profile: StyleProfile | null): MelodyIdea[] {
    return this.melodyTechniques.slice(0, 3);
  }

  private selectStructure(profile: StyleProfile | null): SongStructureTemplate {
    if (!profile) return this.structureLibrary[0];

    const genre = profile.genre.toLowerCase();
    const matched = this.structureLibrary.find(s =>
      genre.includes(s.genre.toLowerCase())
    );
    return matched || this.structureLibrary[0];
  }
}
