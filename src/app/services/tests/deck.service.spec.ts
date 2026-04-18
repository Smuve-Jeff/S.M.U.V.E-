import { TestBed } from '@angular/core/testing';
import { DeckService } from '../deck.service';
import { AudioEngineService } from '../audio-engine.service';

describe('DeckService', () => {
  let service: DeckService;
  let mockEngine: any;

  beforeEach(() => {
    const deckState = {
      A: {
        isPlaying: false,
        rate: 1,
        position: 0,
        duration: 120,
        hotCues: new Array(8).fill(null),
      },
      B: {
        isPlaying: false,
        rate: 1,
        position: 0,
        duration: 120,
        hotCues: new Array(8).fill(null),
      },
    };

    mockEngine = {
      setCrossfader: jest.fn(),
      setDeckRate: jest.fn((deck: 'A' | 'B', rate: number) => {
        deckState[deck].rate = rate;
      }),
      playDeck: jest.fn((deck: 'A' | 'B') => {
        deckState[deck].isPlaying = true;
      }),
      pauseDeck: jest.fn((deck: 'A' | 'B') => {
        deckState[deck].isPlaying = false;
      }),
      jumpToHotCue: jest.fn((deck: 'A' | 'B', slot: number) => {
        const cue = deckState[deck].hotCues[slot];
        if (cue !== null) deckState[deck].position = cue;
      }),
      getDeckProgress: jest.fn((deck: 'A' | 'B') => ({
        position: deckState[deck].position,
        duration: deckState[deck].duration,
        isPlaying: deckState[deck].isPlaying,
        slipPosition: deckState[deck].position,
      })),
      getDeck: jest.fn((deck: 'A' | 'B') => deckState[deck]),
      setSlipMode: jest.fn(),
      loadDeck: jest.fn(),
      setHotCue: jest.fn(),
      clearHotCue: jest.fn(),
      setDeckEq: jest.fn(),
      setDeckFilter: jest.fn(),
      setDeckSend: jest.fn(),
      setDeckGain: jest.fn(),
      setDeckStemGain: jest.fn(),
      seekDeck: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        DeckService,
        { provide: AudioEngineService, useValue: mockEngine },
      ],
    });

    service = TestBed.inject(DeckService);
  });

  it('updates play state immediately when toggling playback', () => {
    service.togglePlay('A');
    expect(service.deckA().isPlaying).toBe(true);

    service.togglePlay('A');
    expect(service.deckA().isPlaying).toBe(false);
  });

  it('syncs deck progress immediately after toggling playback', () => {
    mockEngine.getDeckProgress.mockReturnValue({
      position: 14,
      duration: 120,
      isPlaying: true,
      slipPosition: 14,
    });
    mockEngine.getDeck.mockReturnValue({ rate: 1.1 });

    service.togglePlay('A');

    expect(service.deckA().progress).toBe(14);
    expect(service.deckA().playbackRate).toBe(1.1);
    expect(service.deckA().isPlaying).toBe(true);
  });

  it('syncs playback rate and progress from the audio engine', () => {
    mockEngine.getDeck.mockReturnValueOnce({ rate: 1.25 });
    mockEngine.getDeckProgress.mockReturnValueOnce({
      position: 32,
      duration: 180,
      isPlaying: true,
      slipPosition: 32,
    });

    mockEngine.getDeck.mockReturnValueOnce({ rate: 0.9 });
    mockEngine.getDeckProgress.mockReturnValueOnce({
      position: 12,
      duration: 90,
      isPlaying: false,
      slipPosition: 12,
    });

    service.syncProgress();

    expect(service.deckA().playbackRate).toBe(1.25);
    expect(service.deckA().progress).toBe(32);
    expect(service.deckA().duration).toBe(180);
    expect(service.deckA().isPlaying).toBe(true);
    expect(service.deckB().playbackRate).toBe(0.9);
    expect(service.deckB().progress).toBe(12);
    expect(service.deckB().duration).toBe(90);
    expect(service.deckB().isPlaying).toBe(false);
  });

  it('updates deck progress after jumping to a hot cue', () => {
    mockEngine.getDeck.mockImplementation((deck: 'A' | 'B') => {
      if (deck === 'A') {
        return {
          isPlaying: false,
          rate: 1,
          position: 48,
          duration: 120,
          hotCues: [48, null, null, null, null, null, null, null],
        };
      }

      return {
        isPlaying: false,
        rate: 1,
        position: 0,
        duration: 120,
        hotCues: new Array(8).fill(null),
      };
    });
    mockEngine.getDeckProgress.mockImplementation((deck: 'A' | 'B') => ({
      position: deck === 'A' ? 48 : 0,
      duration: 120,
      isPlaying: false,
      slipPosition: deck === 'A' ? 48 : 0,
    }));

    service.jumpToHotCue('A', 0);

    expect(service.deckA().progress).toBe(48);
  });

  it('clears a hot cue slot in state and engine', () => {
    service.deckA.update((d) => ({
      ...d,
      hotCues: [12, null, null, null, null, null, null, null],
    }));

    service.clearHotCue('A', 0);

    expect(mockEngine.clearHotCue).toHaveBeenCalledWith('A', 0);
    expect(service.deckA().hotCues[0]).toBeNull();
  });

  it('stores sampler pads separately from cue hot cues', () => {
    service.deckA.update((d) => ({
      ...d,
      hotCues: [24, null, null, null, null, null, null, null],
      samplerPads: new Array(8).fill(null),
    }));
    mockEngine.getDeckProgress.mockReturnValueOnce({
      position: 48,
      duration: 120,
      isPlaying: false,
      slipPosition: 48,
    });

    service.setSamplerPad('A', 0);

    expect(service.deckA().hotCues[0]).toBe(24);
    expect(service.deckA().samplerPads[0]).toBe(48);

    service.clearSamplerPad('A', 0);

    expect(service.deckA().hotCues[0]).toBe(24);
    expect(service.deckA().samplerPads[0]).toBeNull();
  });

  it('loads deck buffers and resets progress-sensitive state', () => {
    const buffer = { duration: 245 } as AudioBuffer;
    service.deckA.update((d) => ({
      ...d,
      progress: 32,
      hotCues: [12, 24, null, null, null, null, null, null],
      samplerPads: [4, null, null, null, null, null, null, null],
    }));

    service.loadDeckBuffer('A', buffer, 'anthem.wav', 'vinyl://anthem');

    expect(mockEngine.loadDeck).toHaveBeenCalledWith('A', buffer);
    expect(service.deckA().track.name).toBe('anthem.wav');
    expect(service.deckA().duration).toBe(245);
    expect(service.deckA().progress).toBe(0);
    expect(service.deckA().hotCues).toEqual(new Array(8).fill(null));
    expect(service.deckA().samplerPads).toEqual(new Array(8).fill(null));
    expect(service.deckA().vinylImageUrl).toBe('vinyl://anthem');
  });
});
