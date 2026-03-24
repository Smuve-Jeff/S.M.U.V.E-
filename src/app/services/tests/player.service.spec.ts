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
});
