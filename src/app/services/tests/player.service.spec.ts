import { TestBed } from '@angular/core/testing';
import { PlayerService } from '../player.service';
import { DeckService } from '../deck.service';
import { AudioEngineService } from '../audio-engine.service';
import { FileLoaderService } from '../file-loader.service';
import { ExportService } from '../export.service';
import { signal } from '@angular/core';

describe('PlayerService', () => {
  let service: PlayerService;
  let mockDeckService: any;
  let mockAudioEngine: any;
  let originalFetch: typeof globalThis.fetch | undefined;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    mockDeckService = {
      deckA: signal({ isPlaying: false, progress: 0, duration: 100 }),
      togglePlay: jest.fn(),
      loadDeckBuffer: jest.fn(),
    };
    mockAudioEngine = {
      getContext: jest.fn().mockReturnValue({
        sampleRate: 44100,
        decodeAudioData: jest.fn(),
      }),
      getDeck: jest.fn().mockReturnValue({ buffer: {} }),
    };
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;

    TestBed.configureTestingModule({
      providers: [
        PlayerService,
        { provide: DeckService, useValue: mockDeckService },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        { provide: FileLoaderService, useValue: {} },
        { provide: ExportService, useValue: {} },
      ],
    });
    service = TestBed.inject(PlayerService);
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should toggle play on Deck A', () => {
    service.togglePlay();
    expect(mockDeckService.togglePlay).toHaveBeenCalledWith('A');
  });

  it('should calculate progress correctly', () => {
    mockDeckService.deckA.set({ isPlaying: true, progress: 50, duration: 100 });
    expect(service.progress()).toBe(50);
  });

  it('should move to next track', () => {
    const initialIndex = service.currentIndex();
    service.next();
    expect(service.currentIndex()).toBe(initialIndex + 1);
  });

  it('should move to previous track', () => {
    const playlistLength = service.playlist().length;
    service.currentIndex.set(0);
    service.previous();
    expect(service.currentIndex()).toBe(playlistLength - 1);
  });

  it('should toggle shuffle', () => {
    const initial = service.isShuffle();
    service.toggleShuffle();
    expect(service.isShuffle()).toBe(!initial);
  });

  it('should toggle repeat', () => {
    const initial = service.isRepeat();
    service.toggleRepeat();
    expect(service.isRepeat()).toBe(!initial);
  });

  it('auto-loads the current buffered track when repeating', () => {
    const buffer = { duration: 64 } as AudioBuffer;
    service.playlist.set([
      { id: 'repeat-1', title: 'Loop', artist: 'S.M.U.V.E', buffer },
    ]);
    service.isRepeat.set(true);

    service.next();

    expect(mockDeckService.loadDeckBuffer).toHaveBeenCalledWith(
      'A',
      buffer,
      'Loop'
    );
    expect(mockDeckService.togglePlay).toHaveBeenCalledWith('A');
  });

  it('fetches, decodes, and loads url-backed tracks when advancing', async () => {
    const decodedBuffer = { duration: 128 } as AudioBuffer;
    const arrayBuffer = new ArrayBuffer(16);
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(arrayBuffer),
    } as any);
    mockAudioEngine
      .getContext()
      .decodeAudioData.mockResolvedValue(decodedBuffer);
    service.playlist.set([
      { id: 'track-1', title: 'Current', artist: 'A' },
      { id: 'track-2', title: 'Remote', artist: 'B', url: '/audio/remote.wav' },
    ]);

    service.next();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith('/audio/remote.wav');
    expect(mockAudioEngine.getContext().decodeAudioData).toHaveBeenCalledWith(
      arrayBuffer
    );
    expect(mockDeckService.loadDeckBuffer).toHaveBeenCalledWith(
      'A',
      decodedBuffer,
      'Remote'
    );
    expect(mockDeckService.togglePlay).toHaveBeenCalledWith('A');
    expect(service.playlist()[1].buffer).toBe(decodedBuffer);
  });
});
