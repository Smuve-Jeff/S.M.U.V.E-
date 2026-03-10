import { TestBed } from '@angular/core/testing';
import { PlayerService } from './player.service';
import { DeckService } from './deck.service';
import { AudioEngineService } from './audio-engine.service';
import { FileLoaderService } from './file-loader.service';
import { ExportService } from './export.service';

describe('PlayerService', () => {
  let service: PlayerService;
  let deckServiceSpy: any;
  let audioEngineSpy: any;

  beforeEach(() => {
    deckServiceSpy = {
      deckA: jest.fn(() => ({ isPlaying: false, progress: 0, duration: 100 })),
      togglePlay: jest.fn(),
      loadDeckBuffer: jest.fn()
    };

    audioEngineSpy = {
      getContext: jest.fn(() => ({})),
      getDeck: jest.fn(() => ({ buffer: {} }))
    };

    TestBed.configureTestingModule({
      providers: [
        PlayerService,
        { provide: DeckService, useValue: deckServiceSpy },
        { provide: AudioEngineService, useValue: audioEngineSpy },
        { provide: FileLoaderService, useValue: {} },
        { provide: ExportService, useValue: {} }
      ]
    });
    service = TestBed.inject(PlayerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should toggle play', () => {
    service.togglePlay();
    expect(deckServiceSpy.togglePlay).toHaveBeenCalledWith('A');
  });

  it('should move to next track', () => {
    const initialIndex = service.currentIndex();
    service.next();
    expect(service.currentIndex()).toBe(initialIndex + 1);
  });

  it('should move to previous track', () => {
    service.currentIndex.set(0);
    service.previous();
    expect(service.currentIndex()).toBe(service.playlist().length - 1);
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
