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
      setDeckAdvancedFx: jest.fn(),
      resetDeckAdvancedFx: jest.fn(),
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
      samplerPads: {
        drums: new Array(8).fill(null),
        fx: new Array(8).fill(null),
        vocals: new Array(8).fill(null),
      },
    }));
    mockEngine.getDeckProgress.mockReturnValueOnce({
      position: 48,
      duration: 120,
      isPlaying: false,
      slipPosition: 48,
    });

    service.setSamplerPad('A', 0, 'drums');

    expect(service.deckA().hotCues[0]).toBe(24);
    expect(service.deckA().samplerPads.drums[0]).toBe(48);

    service.clearSamplerPad('A', 0, 'drums');

    expect(service.deckA().hotCues[0]).toBe(24);
    expect(service.deckA().samplerPads.drums[0]).toBeNull();
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
    expect(service.deckA().samplerPads).toEqual({
      drums: new Array(8).fill(null),
      fx: new Array(8).fill(null),
      vocals: new Array(8).fill(null),
    });
    expect(service.deckA().vinylImageUrl).toBe('vinyl://anthem');
  });

  it('autoSync tempo-matches the slave deck to the master', () => {
    service.deckA.update((d: any) => ({ ...d, bpm: 120, duration: 120 }));
    service.deckB.update((d: any) => ({ ...d, bpm: 128, duration: 120 }));
    mockEngine.getDeckProgress.mockReturnValue({
      position: 60,
      duration: 120,
      isPlaying: true,
      slipPosition: 60,
    });

    service.autoSync('B');

    // Master effective BPM 120 → slave rate target = 120 / 128.
    expect(service.deckB().playbackRate).toBeCloseTo(0.9375, 4);
  });

  it('autoSync phase-aligns the slave playhead to the master beat grid', () => {
    service.deckA.update((d: any) => ({ ...d, bpm: 120, duration: 120 }));
    service.deckB.update((d: any) => ({ ...d, bpm: 120, duration: 120 }));
    mockEngine.getDeckProgress
      .mockReturnValueOnce({
        position: 60.35, // beat phase 0.35s within a 0.5s beat
        duration: 120,
        isPlaying: true,
        slipPosition: 60.35,
      })
      .mockReturnValueOnce({
        position: 10, // phase 0
        duration: 120,
        isPlaying: true,
        slipPosition: 10,
      });

    service.autoSync('B');

    expect(mockEngine.seekDeck).toHaveBeenCalledWith('B', expect.any(Number));
    const seekTarget = mockEngine.seekDeck.mock.calls[0][1] as number;
    expect(seekTarget).toBeCloseTo(10.35, 2);
  });

  it('autoSync no-ops when nothing is loaded on the master', () => {
    // Both decks keep their default zero duration.
    service.autoSync('A');
    expect(service.deckA().playbackRate).toBe(1);
    expect(mockEngine.seekDeck).not.toHaveBeenCalled();
  });

  it('setXfCurve accepts valid curves and rejects invalid values', () => {
    service.setXfCurve('cut');
    expect(service.xfCurve()).toBe('cut');
    service.setXfCurve('linear');
    expect(service.xfCurve()).toBe('linear');
    service.setXfCurve('bogus' as any);
    expect(service.xfCurve()).toBe('linear');
  });

  it('setHamster toggles the hamster orientation flag', () => {
    expect(service.hamster()).toBe(false);
    service.setHamster(true);
    expect(service.hamster()).toBe(true);
    service.setHamster(false);
    expect(service.hamster()).toBe(false);
  });

  it('echo/chorus/phaser drive the engine FX bus and reset the previous mode', () => {
    service.setFx('A', 'echo', 0.8);
    expect(mockEngine.resetDeckAdvancedFx).toHaveBeenCalledWith('A');
    expect(mockEngine.setDeckAdvancedFx).toHaveBeenCalledWith(
      'A',
      'delay',
      0.8
    );
    expect(service.deckA().activeFx).toBe('echo');

    service.setFx('A', 'chorus', 0.5);
    expect(mockEngine.setDeckAdvancedFx).toHaveBeenLastCalledWith(
      'A',
      'flanger',
      0.5
    );

    service.setFx('A', 'phaser', 0.2);
    expect(mockEngine.setDeckAdvancedFx).toHaveBeenLastCalledWith(
      'A',
      'phaser',
      0.2
    );
  });

  it('autowah sweeps the deck filter and clamps the depth', () => {
    service.setFx('A', 'autowah', 2);
    // MIN_AUTOWAH_FREQUENCY(350) + clamped 1 * 5500
    expect(mockEngine.setDeckFilter).toHaveBeenCalledWith('A', 350 + 5500);
    expect(service.deckA().fxAmount).toBe(1);
  });

  it('damp applies an EQ profile and restores the base EQ when leaving', () => {
    service.setDeckEq('A', 1, 1, 1);
    service.setFx('A', 'damp', 1);
    // DAMP at full depth: high = 0.2, mid = 0.65, low = 1.1
    expect(mockEngine.setDeckEq).toHaveBeenLastCalledWith('A', 0.2, 0.65, 1.1);

    mockEngine.setDeckEq.mockClear();
    service.setFx('A', 'echo', 0.4);
    expect(mockEngine.setDeckEq).toHaveBeenCalledWith('A', 1, 1, 1);
  });

  it('autowah restores the base filter frequency when leaving the mode', () => {
    service.setDeckFilter('A', 8000);
    service.setFx('A', 'autowah', 1);
    expect(mockEngine.setDeckFilter).toHaveBeenLastCalledWith('A', 350 + 5500);

    mockEngine.setDeckFilter.mockClear();
    service.setFx('A', 'reverb', 0.3);
    expect(mockEngine.setDeckFilter).toHaveBeenCalledWith('A', 8000);
  });

  it('reverb and rotate route through the send buses', () => {
    service.setFx('A', 'reverb', 0.6);
    expect(mockEngine.setDeckSend).toHaveBeenCalledWith('A', 'A', 0.6);

    service.setFx('A', 'rotate', 0.4);
    expect(mockEngine.setDeckSend).toHaveBeenCalledWith('A', 'A', 0.4);
    expect(mockEngine.setDeckSend).toHaveBeenCalledWith('A', 'B', 0.6);
  });

  it('loadDeckBuffer stamps a track id so beat-loop presets can engage', () => {
    const buffer = { duration: 120 } as AudioBuffer;
    service.loadDeckBuffer('A', buffer, 'loop-me.wav');
    expect(service.deckA().track.id).toMatch(/^deck-a-/);
    expect(service.deckA().track.name).toBe('loop-me.wav');

    service.loadDeckBuffer('B', buffer, 'loop-me-b.wav');
    expect(service.deckB().track.id).toMatch(/^deck-b-/);
  });
});
