import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AiProduceService } from '../../services/ai-produce.service';
import { AiBeatGeneratorService } from '../../services/ai-beat-generator.service';
import { SongwritingAssistantService } from '../../services/songwriting-assistant.service';
import { AiMixAssistantService } from '../../studio/effects/ai-mix-assistant.service';
import { ReleasePipelineService } from '../../services/release-pipeline.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { NotificationService } from '../../services/notification.service';
import { LoggingService } from '../../services/logging.service';

class StubAiBeat {
  generateBeat = jest.fn().mockReturnValue({
    title: 'Stubbed Beat',
    bpm: 140,
    key: 'C#m',
    genre: 'Trap',
    drums: {
      name: 'Trap 808 Roller',
      kick: [],
      snare: [],
      hihat: [],
      clap: [],
      percussion: [],
      bpm: 140,
      swing: 0.5,
      description: 'stubbed',
    },
    bass: { notes: [], pattern: 'root-fifth', style: '808' },
    chords: [
      { chord: 'i', position: 0, duration: 4, velocity: 0.7, inversion: 'root' },
      { chord: 'VI', position: 4, duration: 4, velocity: 0.7, inversion: 'root' },
    ],
    melody: [],
    arrangement: [
      { name: 'Intro', bars: 8, elements: ['hihat'], energy: 0.3, description: 'stubbed intro' },
      { name: 'Verse', bars: 16, elements: ['kick', 'bass'], energy: 0.6, description: 'stubbed verse' },
    ],
    totalBars: 24,
    estimatedDuration: '0:42',
    styleReferences: ['trap'],
    productionNotes: ['test note'],
  });
}

class StubSongwriter {
  generateLyrics = jest.fn().mockReturnValue({
    lyrics: [
      { type: 'verse', lines: [{ text: 'stubbed line', syllableCount: 5 }] },
      { type: 'chorus', lines: [{ text: 'stubbed hook', syllableCount: 5 }] },
    ],
    chordProgressions: [
      { name: 'Trap Minor', chords: ['i', 'VI'], key: 'F#m', mood: 'dark', complexity: 'Basic', usage: 'trap', artists: ['Drake'] },
    ],
    melodyIdeas: [],
    structure: { name: 'Hip-Hop', genre: 'Hip Hop', totalBars: 96, sections: [] },
  });
}

class StubAiMix {
  autoMaster = jest.fn().mockReturnValue([
    'Trap preset engaged.',
    'Target -10 LUFS · -0.3 dBFS ceiling.',
  ]);
  detectGenre = jest.fn().mockReturnValue('trap');
  recommendInstruments = jest.fn().mockReturnValue([
    'sub-commander',
    'trap-808-elite',
    'cyber-stab',
    'synth-lead',
  ]);
}

class StubReleases {
  activeRelease = jest.fn().mockReturnValue(null);
  set = jest.fn();
  initializeRelease = jest.fn().mockImplementation(async (name: string) => {
    this.activeRelease.mockReturnValue({
      id: 'rel-stub',
      name,
      type: 'Single',
      description: '',
      status: 'Planning',
      tracks: [],
      credits: { artistName: 'Stub', proName: '', proIpi: '', collaborators: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  addTrack = jest.fn().mockImplementation(async () => {
    const current = this.activeRelease();
    if (!current) return;
    const updated = {
      ...current,
      tracks: [
        ...current.tracks,
        {
          id: 'trk-stub',
          title: current.name.replace(' (AI Produce)', ''),
          status: 'In Progress',
          stages: {
            instrumental: 'Pending',
            lyrics: 'Pending',
            vocals: 'Pending',
            mixing: 'Pending',
            mastering: 'Pending',
          },
        },
      ],
    };
    this.activeRelease.mockReturnValue(updated);
  });
  updateTrackStage = jest.fn().mockResolvedValue(undefined);
}

class StubMusic {
  addTrack = jest.fn().mockImplementation((name: string) => 't_' + name);
  engine = { tempo: { set: jest.fn(), _: 120 } };
}

class StubNotify {
  show = jest.fn();
}

class StubLogger {
  info = jest.fn();
  error = jest.fn();
}

class StubRouter {
  navigate = jest.fn().mockResolvedValue(true);
}

describe('AiProduceService', () => {
  let sut: AiProduceService;
  let beat: StubAiBeat;
  let songwriter: StubSongwriter;
  let mix: StubAiMix;
  let releases: StubReleases;
  let music: StubMusic;

  beforeEach(() => {
    beat = new StubAiBeat();
    songwriter = new StubSongwriter();
    mix = new StubAiMix();
    releases = new StubReleases();
    music = new StubMusic();
    TestBed.configureTestingModule({
      providers: [
        AiProduceService,
        { provide: AiBeatGeneratorService, useValue: beat },
        { provide: SongwritingAssistantService, useValue: songwriter },
        { provide: AiMixAssistantService, useValue: mix },
        { provide: ReleasePipelineService, useValue: releases },
        { provide: MusicManagerService, useValue: music },
        { provide: NotificationService, useValue: new StubNotify() },
        { provide: LoggingService, useValue: new StubLogger() },
        { provide: Router, useValue: new StubRouter() },
      ],
    });
    sut = TestBed.inject(AiProduceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('applyIdea returns sensible defaults from a thin prompt', () => {
    const idea = sut.applyIdea({ prompt: 'midnight rooftop swing', genre: 'Trap', mood: 'dark' });
    expect(idea.title.length).toBeGreaterThan(0);
    expect(idea.genre).toBe('Trap');
    expect(idea.mood).toBe('dark');
    expect(idea.bpm).toBeGreaterThanOrEqual(120);
    expect(idea.estimatedBars).toBeGreaterThan(0);
  });

  it('run() walks all five stages and lands on "done"', async () => {
    const result = await sut.run({
      prompt: 'midnight rooftop swing',
      genre: 'Trap',
      mood: 'dark',
    });
    expect(result).not.toBeNull();
    expect(result!.idea.title.length).toBeGreaterThan(0);
    expect(result!.beat.title).toBe('Stubbed Beat');
    expect(result!.lyrics.lyrics.length).toBe(2);
    expect(result!.mixReport.length).toBe(2);
    expect(releases.initializeRelease).toHaveBeenCalledTimes(1);
    expect(releases.updateTrackStage).toHaveBeenCalled();
    expect(sut.stage()).toBe('done');
    expect(sut.progress()).toBe(100);
    expect(sut.hasArtifacts()).toBe(true);
  });

  it('cancel() mid-run bails out, leaving a partial result', async () => {
    // Cancel fires from inside the synchronous beat generator. Even though
    // the beat call returns a value, the running stage must flip to
    // 'cancelled', the release stage must NOT execute, and the result must
    // be the partial idea+beat the post-cancel bail captures.
    const cancelImpl = beat.generateBeat.getMockImplementation();
    beat.generateBeat.mockImplementation(() => {
      sut.cancel();
      return cancelImpl!();
    });
    const result = await sut.run({ prompt: 't', genre: 'Pop' });
    expect(result).toBeDefined();
    expect(result!.cancelled).toBe(true);
    expect(sut.stage()).toBe('cancelled');
    expect(sut.appliedReleaseId()).toBeNull();
    expect(releases.initializeRelease).not.toHaveBeenCalled();
    // Idea + beat made it through before cancel; lyrics never reached.
    expect(result!.idea).not.toBeNull();
    expect(result!.lyrics).toBeNull();
    expect(result!.idea!.title.length).toBeGreaterThan(0);
  });

  it('cancel() called when idle is a no-op', () => {
    expect(sut.stage()).toBe('idle');
    sut.cancel();
    expect(sut.stage()).toBe('idle');
    expect(sut.cancelled).toBe(false);
  });

  it('applyToProject creates four tracks with stable role suffixes', () => {
    sut.reset();
    // Force an idea+beat quickly by running then cancelling before mix-master.
    return sut
      .run({ prompt: 'concrete test', genre: 'Trap' })
      .then(() => {
        const before = music.addTrack.mock.calls.length;
        const ids = sut.applyToProject();
        expect(ids.length).toBe(4);
        expect(music.addTrack.mock.calls.length).toBe(before + 4);
        const suffixes = music.addTrack.mock.calls
          .slice(-4)
          .map((c) => c[0].split(' · ')[1]);
        expect(suffixes).toEqual(['Drums', 'Bass', 'Chords', 'Lead']);
        expect(sut.appliedTrackIds().length).toBe(4);
      });
  });

  it('hasArtifacts is false until all three core stages complete', async () => {
    expect(sut.hasArtifacts()).toBe(false);
    await sut.run({ prompt: 'fire', genre: 'Lo-Fi' });
    expect(sut.hasArtifacts()).toBe(true);
  });
});

describe('AiProduceService · helpers', () => {
  let sut: AiProduceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AiProduceService,
        { provide: AiBeatGeneratorService, useValue: new StubAiBeat() },
        { provide: SongwritingAssistantService, useValue: new StubSongwriter() },
        { provide: AiMixAssistantService, useValue: new StubAiMix() },
        { provide: ReleasePipelineService, useValue: new StubReleases() },
        { provide: MusicManagerService, useValue: new StubMusic() },
        { provide: NotificationService, useValue: new StubNotify() },
        { provide: LoggingService, useValue: new StubLogger() },
        { provide: Router, useValue: new StubRouter() },
      ],
    });
    sut = TestBed.inject(AiProduceService);
  });

  it('guessMoodFromPrompt maps hobby keywords to moods', () => {
    expect((sut as any).guessMoodFromPrompt('dark gritty trap')).toBe('dark');
    expect((sut as any).guessMoodFromPrompt('love forever romance')).toBe('romantic');
    expect((sut as any).guessMoodFromPrompt('party hype')).toBe('high-energy');
    expect((sut as any).guessMoodFromPrompt('chill lofi study')).toBe('chill');
    expect((sut as any).guessMoodFromPrompt('sad cry alone')).toBe('sad');
    expect((sut as any).guessMoodFromPrompt('')).toBe('pop');
  });

  it('suggestBpm returns genre-appropriate ranges', () => {
    expect((sut as any).suggestBpm('Trap')).toBeGreaterThanOrEqual(130);
    expect((sut as any).suggestBpm('Pop')).toBeGreaterThanOrEqual(100);
    expect((sut as any).suggestBpm('House')).toBeGreaterThanOrEqual(115);
  });

  it('guessBeatGenre collapses artist dialects to mastering presets', () => {
    expect((sut as any).guessBeatGenre('Trap')).toBe('trap');
    expect((sut as any).guessBeatGenre('Hip Hop')).toBe('trap');
    expect((sut as any).guessBeatGenre('House')).toBe('house');
    expect((sut as any).guessBeatGenre('R&B')).toBe('rnb');
    expect((sut as any).guessBeatGenre('Lo-Fi')).toBe('lo-fi');
    expect((sut as any).guessBeatGenre('Reggaeton')).toBe('reggaeton');
    expect((sut as any).guessBeatGenre('FooBar')).toBe('pop');
  });
});
