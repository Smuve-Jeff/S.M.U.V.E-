import { TestBed } from '@angular/core/testing';
import { VocalCompSuggesterService } from './vocal-comp-suggester.service';
import { SmartRecordingService } from './smart-recording.service';
import { LoggingService } from '../services/logging.service';

describe('VocalCompSuggesterService', () => {
  let service: VocalCompSuggesterService;
  let smartRecording: any;

  function makeTake(overrides: any = {}) {
    return {
      id: 'take-' + (overrides.takeNumber ?? 1),
      takeNumber: overrides.takeNumber ?? 1,
      label: `Take ${overrides.takeNumber ?? 1}`,
      blob: new Blob(['x']),
      url: 'blob:x',
      durationMs: 5000,
      peakDbL: -6,
      peakDbR: -7,
      regionStartBar: 1,
      regionEndBar: 5,
      isMuted: false,
      isCompSelection: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    smartRecording = {
      compGroups: jest.fn(() => []),
      activeCompGroupId: jest.fn(() => null),
      selectCompTake: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        VocalCompSuggesterService,
        { provide: SmartRecordingService, useValue: smartRecording },
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } },
      ],
    });
    service = TestBed.inject(VocalCompSuggesterService);
  });

  it('returns null when the group does not exist', () => {
    smartRecording.compGroups.mockReturnValue([
      { id: 'g1', takes: [] },
    ]);
    expect(service.suggestBestTake('nope')).toBeNull();
  });

  it('returns null when the group has no usable (non-muted) takes', () => {
    smartRecording.compGroups.mockReturnValue([
      { id: 'g1', takes: [makeTake({ isMuted: true })] },
    ]);
    expect(service.suggestBestTake('g1')).toBeNull();
  });

  it('ranks the healthiest take by dynamics + timing', () => {
    // take-2 is quieter (further from -6 target) and longer (further from median)
    smartRecording.compGroups.mockReturnValue([
      {
        id: 'g1',
        takes: [
          makeTake({ takeNumber: 1, peakDbL: -6, peakDbR: -6, durationMs: 5000, regionStartBar: 1, regionEndBar: 4 }),
          makeTake({ takeNumber: 2, peakDbL: -20, peakDbR: -20, durationMs: 8000, regionStartBar: 1, regionEndBar: 3 }),
        ],
      },
    ]);
    const suggestion = service.suggestBestTake('g1');
    expect(suggestion).not.toBeNull();
    expect(suggestion!.takeId).toBe('take-1');
    expect(suggestion!.score).toBeGreaterThan(0);
    expect(suggestion!.reasons.length).toBeGreaterThan(0);
  });

  it('excludes muted and null-blob takes from the usable set', () => {
    smartRecording.compGroups.mockReturnValue([
      {
        id: 'g1',
        takes: [
          makeTake({ takeNumber: 1, isMuted: true }),
          makeTake({ takeNumber: 2, blob: null }),
          makeTake({ takeNumber: 3 }),
        ],
      },
    ]);
    const suggestion = service.suggestBestTake('g1');
    expect(suggestion!.takeNumber).toBe(3);
    expect(suggestion!.excludedMuted).toBe(2);
  });

  it('survives take metadata that omits region bars (no NaN scores)', () => {
    smartRecording.compGroups.mockReturnValue([
      {
        id: 'g1',
        takes: [
          // Spells like persisted legacy takes: no regionStartBar/EndBar.
          {
            id: 'legacy-1',
            takeNumber: 1,
            label: 'Take 1',
            blob: new Blob(['x']),
            url: 'blob:x',
            durationMs: 4000,
            peakDbL: -7,
            peakDbR: -8,
            isMuted: false,
            isCompSelection: false,
          } as any,
        ],
      },
    ]);
    const suggestion = service.suggestBestTake('g1');
    expect(suggestion).not.toBeNull();
    expect(Number.isFinite(suggestion!.score)).toBe(true);
  });

  it('applies the suggestion by selecting the winning take', () => {
    smartRecording.compGroups.mockReturnValue([
      {
        id: 'g1',
        takes: [
          makeTake({ takeNumber: 1 }),
          makeTake({ takeNumber: 2, peakDbL: -12, peakDbR: -12 }),
        ],
      },
    ]);
    const applied = service.applySuggestion('g1');
    expect(applied).not.toBeNull();
    expect(smartRecording.selectCompTake).toHaveBeenCalledWith('g1', applied!.takeId);
  });

  it('returns null from applySuggestion when nothing is usable', () => {
    smartRecording.compGroups.mockReturnValue([
      { id: 'g1', takes: [makeTake({ isMuted: true })] },
    ]);
    expect(service.applySuggestion('g1')).toBeNull();
    expect(smartRecording.selectCompTake).not.toHaveBeenCalled();
  });
});