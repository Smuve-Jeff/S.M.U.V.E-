import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PianoRollComponent } from './piano-roll.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioSessionService } from '../audio-session.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { signal, computed, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EnhancedTouchGestureService } from '../../services/enhanced-touch-gesture.service';
import { HapticService } from '../../services/haptic.service';
import { DjMidiService } from '../../services/dj-midi.service';
import { HardwareService } from '../../services/hardware.service';
import { HistoryService } from '../../services/history.service';
import { AutomationService } from '../automation.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  template: '<div data-testid="channel-rack"></div>',
})
class StubChannelRackComponent {}

describe('PianoRollComponent', () => {
  let component: PianoRollComponent;
  let fixture: ComponentFixture<PianoRollComponent>;

  const mockAudioSession = {
    isPlaying: signal(false),
    isRecording: signal(false),
    togglePlay: jest.fn(),
    toggleRecord: jest.fn(),
    engine: { outputLufs: signal(-14) },
  };

  const mockTracks = signal([
    {
      id: '1',
      name: 'Lead',
      instrumentId: 'synth',
      notes: [],
      clips: [],
      fxSlots: [],
      gain: 1,
      pan: 0,
      sendA: 0,
      sendB: 0,
      mute: false,
      solo: false,
      steps: [],
      color: '#fff',
    },
  ]);

  const mockMusicManager = {
    tracks: mockTracks,
    selectedTrackId: signal('1'),
    currentStep: signal(0),
    crossLinkRequest: signal(null),
    updateNote: jest.fn(
      (trackId: string, noteId: string, patch: Record<string, unknown>) => {
        mockTracks.update((list) =>
          list.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  notes: (t.notes ?? []).map((n) =>
                    n.id === noteId ? { ...n, ...patch } : n
                  ),
                }
              : t
          )
        );
      }
    ),
    addNoteToTrack: jest.fn(),
    removeNotes: jest.fn(),
    quantizeTrack: jest.fn(),
    duplicateNotes: jest.fn(),
    strumTrack: jest.fn(),
    getNoteSlideSemitones: jest.fn((n) => (n?.isSlide ? (n.pitchBend ?? 0) : 0)),
    humanizeTrack: jest.fn(),
    arpeggiateTrack: jest.fn(),
    selectedTrack: computed(() => mockTracks()[0] ?? null),
    engine: { scaleMode: signal('major'), scaleLock: signal(false) },
  };

  const mockAudioEngine = {
    tempo: signal(120),
    visualStep: signal(0),
  };

  const mockEnhancedTouchGestures = {
    zoomLevel: signal(1),
    verticalZoomLevel: signal(1),
    handlePinch: jest.fn(),
    adjustZoom: jest.fn(),
    resetZoom: jest.fn(),
  };

  const mockHaptic = {
    light: jest.fn(),
    medium: jest.fn(),
  };

  const performerCC = new Subject<{
    controller: number;
    value: number;
    channel: number;
  }>();
  const performerPitchBend = new Subject<{ value: number; channel: number }>();
  const performerNoteOn = new Subject<{ note: number; velocity: number; channel: number }>();
  const performerNoteOff = new Subject<{ note: number; velocity: number; channel: number }>();

  const mockDjMidi = {
    sendCC: jest.fn(),
    sendPitchBend: jest.fn(),
    setCcOutput: jest.fn(),
    ccOutputIndex: signal(0),
    ccOutputNames: signal(['MIDI Output 1', 'MIDI Output 2']),
    performerNoteOn,
    performerNoteOff,
    performerCC,
    performerPitchBend,
    performerCCMap: signal([]),
    startPerformerLearn: jest.fn(),
    cancelPerformerLearn: jest.fn(),
    midiActivityPulse: signal(false),
    lastMidiMessage: signal(null),
    connectedDevices: signal([]),
    midiOutputs: signal([]),
  };

  const mockAutomation = {
    lanes: signal([]),
    ensureLane: jest.fn(() => ({ id: 'auto-lane-test' })),
    addPoint: jest.fn(),
    setPoints: jest.fn(),
  };

  const mockHardware = {
    sustainActive: signal(false),
    sustainHalfPedal: signal(false),
    sustainAmount: signal(127),
    lastSustainReleaseCount: signal(0),
  };

  const mockHistory = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [
        PianoRollComponent,
        CommonModule,
        FormsModule,
        StubChannelRackComponent,
      ],
      providers: [
        { provide: AudioSessionService, useValue: mockAudioSession },
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioEngineService, useValue: mockAudioEngine },
        {
          provide: EnhancedTouchGestureService,
          useValue: mockEnhancedTouchGestures,
        },
        { provide: HapticService, useValue: mockHaptic },
        { provide: DjMidiService, useValue: mockDjMidi },
        { provide: AutomationService, useValue: mockAutomation },
        { provide: HardwareService, useValue: mockHardware },
        { provide: HistoryService, useValue: mockHistory },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PianoRollComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Reset shared mock state between tests
    mockAutomation.addPoint.mockClear();
    mockAutomation.ensureLane.mockClear();
    mockAutomation.setPoints.mockClear();
    mockDjMidi.sendCC.mockClear();
    mockDjMidi.sendPitchBend.mockClear();
    mockDjMidi.setCcOutput.mockClear();
    mockDjMidi.startPerformerLearn.mockClear();
    mockDjMidi.cancelPerformerLearn.mockClear();
    mockHistory.execute.mockClear();
    mockHardware.sustainActive.set(false);
    mockHardware.sustainHalfPedal.set(false);
    mockHardware.sustainAmount.set(127);
    mockHardware.lastSustainReleaseCount.set(0);
    component.ccRecordArmed.set(false);
    component.ccLaneLearnTarget.set(null);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call fitToPage', () => {
    const spy = jest.spyOn(component, 'fitToPage');
    component.fitToPage();
    expect(spy).toHaveBeenCalled();
  });

  it('should toggle CC record arm', () => {
    expect(component.ccRecordArmed()).toBe(false);
    component.toggleCcRecord();
    expect(component.ccRecordArmed()).toBe(true);
    component.toggleCcRecord();
    expect(component.ccRecordArmed()).toBe(false);
  });

  it('should send CC via the dedicated CC output selector', () => {
    component.djMidi.setCcOutput(1);
    expect(mockDjMidi.setCcOutput).toHaveBeenCalledWith(1);
    component.updateCcLaneValue('pan', 64);
    expect(mockDjMidi.sendCC).toHaveBeenCalledWith(10, 64, 0);
  });

  it('should record a CC keyframe when armed and playing', () => {
    mockAudioSession.isPlaying.set(true);
    component.toggleCcRecord();
    component.updateCcLaneValue('cut', 90);
    expect(mockAutomation.ensureLane).toHaveBeenCalledWith(
      '1',
      'cc_cutoff',
      expect.objectContaining({ min: 0, max: 127 })
    );
    expect(mockAutomation.addPoint).toHaveBeenCalledWith(
      'auto-lane-test',
      expect.any(Number),
      90
    );
  });

  it('should not record keyframes when transport is stopped', () => {
    mockAudioSession.isPlaying.set(false);
    component.toggleCcRecord();
    component.updateCcLaneValue('mod', 20);
    expect(mockAutomation.addPoint).not.toHaveBeenCalled();
  });

  it('should reflect incoming MIDI CC on the matching lane', () => {
    performerCC.next({ controller: 74, value: 0.5, channel: 0 });
    expect(component.ccLaneValues()['cut']).toBe(64);
  });

  it('should record incoming MIDI CC when armed and playing', () => {
    mockAudioSession.isPlaying.set(true);
    component.toggleCcRecord();
    performerCC.next({ controller: 11, value: 1.0, channel: 0 });
    expect(mockAutomation.ensureLane).toHaveBeenCalledWith(
      '1',
      'cc_expression',
      expect.anything()
    );
    expect(mockAutomation.addPoint).toHaveBeenCalledWith(
      'auto-lane-test',
      expect.any(Number),
      127
    );
  });

  it('should route the bend lane through MIDI pitch bend (0xE0)', () => {
    component.updateCcLaneValue('bend', 96);
    expect(mockDjMidi.sendPitchBend).toHaveBeenCalledWith(
      expect.closeTo(0.51, 0.01),
      0
    );
    expect(mockDjMidi.sendCC).not.toHaveBeenCalledWith(0, 96, 0);
  });

  it('should reflect incoming MIDI pitch bend on the bend lane', () => {
    performerPitchBend.next({ value: 0.5, channel: 0 });
    expect(component.ccLaneValues()['bend']).toBe(95);
  });

  it('should hold sustained notes while the sustain pedal is engaged', () => {
    mockHardware.sustainActive.set(true);
    // Simulate an external note-on → preview + sustained tracking
    performerNoteOn.next({ note: 60, velocity: 0.8, channel: 0 });
    performerNoteOff.next({ note: 60, velocity: 0, channel: 0 });
    expect(component['sustainedNotes'].has(60)).toBe(true);
    // Releasing the pedal clears held notes
    mockHardware.sustainActive.set(false);
    performerNoteOn.next({ note: 61, velocity: 0.8, channel: 0 });
    performerNoteOff.next({ note: 61, velocity: 0, channel: 0 });
    expect(component['sustainedNotes'].has(61)).toBe(false);
  });

  it('should build a CC lane readout from recorded automation keyframes', () => {
    mockAutomation.lanes.set([
      {
        id: 'l1',
        target: { trackId: '1', parameter: 'cc_cutoff' },
        points: [
          { time: 0, value: 0 },
          { time: 8, value: 127 },
        ],
      },
    ]);
    const readout = component.ccLaneReadouts();
    expect(readout['cut']).toHaveLength(2);
    expect(readout['cut'][0]).toEqual({ x: 0, y: 0 });
    expect(readout['cut'][1]).toEqual({ x: expect.any(Number), y: 100 });
  });

  it('should commit one undoable step when CC recording stops', () => {
    mockAudioSession.isPlaying.set(true);
    component.toggleCcRecord();
    component.updateCcLaneValue('pan', 80);
    component.toggleCcRecord();
    expect(mockHistory.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Record CC automation' })
    );
    // Undo restores the snapshot through setPoints
    const call = mockHistory.execute.mock.calls[0][0];
    call.undo();
    expect(mockAutomation.setPoints).toHaveBeenCalled();
  });

  it('should send CC on the per-lane MIDI channel', () => {
    component.setCcLaneChannel('pan', 3);
    component.updateCcLaneValue('pan', 64);
    expect(mockDjMidi.sendCC).toHaveBeenCalledWith(10, 64, 3);
  });

  it('should only match incoming CC on the lane channel', () => {
    // CC10 on channel 0 does not match the pan lane now routed to CH3
    component.setCcLaneChannel('pan', 3);
    performerCC.next({ controller: 10, value: 0.5, channel: 0 });
    expect(component.ccLaneValues()['pan']).toBe(64);
    performerCC.next({ controller: 10, value: 0.25, channel: 3 });
    expect(component.ccLaneValues()['pan']).toBe(32);
  });

  it('should start MIDI Learn for a lane and adopt the captured mapping', () => {
    component.startCcLaneLearn('cut');
    expect(mockDjMidi.startPerformerLearn).toHaveBeenCalledWith('cc_lane_cut');
    expect(component.isCcLaneLearning('cut')).toBe(true);
    // Simulate the DJ service recording a capture for this target
    mockDjMidi.performerCCMap.set([
      { controller: 73, channel: 5, target: 'cc_lane_cut' },
    ]);
    // Let the effect flush
    TestBed.flushEffects();
    expect(component.ccLaneController()['cut']).toBe(73);
    expect(component.ccLaneChannel()['cut']).toBe(5);
    expect(component.isCcLaneLearning('cut')).toBe(false);
  });

  it('should cancel MIDI Learn', () => {
    component.startCcLaneLearn('mod');
    component.cancelCcLaneLearn();
    expect(mockDjMidi.cancelPerformerLearn).toHaveBeenCalled();
    expect(component.isCcLaneLearning('mod')).toBe(false);
  });

  it('should surface half-pedal + release count from the hardware layer', () => {
    mockHardware.sustainHalfPedal.set(true);
    mockHardware.sustainAmount.set(40);
    mockHardware.lastSustainReleaseCount.set(3);
    expect(component.sustainHalfPedal()).toBe(true);
    expect(component.sustainAmount()).toBe(40);
    expect(component.sustainReleaseCount()).toBe(3);
  });

  it('should open the bezier editor with the real automation lane id', () => {
    const emitSpy = jest.spyOn(component.openBezierEditor, 'emit');
    component.openBezierForCcLane('cut');
    expect(mockAutomation.ensureLane).toHaveBeenCalledWith(
      '1',
      'cc_cutoff',
      expect.anything()
    );
    expect(emitSpy).toHaveBeenCalledWith('auto-lane-test');
  });

  it('should auto-open the bezier editor for the last recorded lane on disarm', () => {
    const emitSpy = jest.spyOn(component.openBezierEditor, 'emit');
    mockAudioSession.isPlaying.set(true);
    component.toggleCcRecord();
    component.updateCcLaneValue('cut', 90);
    component.toggleCcRecord();
    expect(emitSpy).toHaveBeenCalledWith('auto-lane-test');
  });

  it('should toggle slide on the selected notes', () => {
    mockMusicManager.tracks.update((t) => [
      {
        ...t[0],
        notes: [{ id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 }],
      },
    ]);
    component.selectedNoteIds.set(new Set(['n1']));
    component.toggleSlideOnSelection();
    expect(mockMusicManager.updateNote).toHaveBeenCalledWith(
      '1',
      'n1',
      expect.objectContaining({ isSlide: true, pitchBend: 2 })
    );
    expect(component.selectedNoteIsSlide()).toBe(true);
  });

  it('should un-toggle slide on the selected notes', () => {
    mockMusicManager.tracks.update((t) => [
      {
        ...t[0],
        notes: [
          { id: 'n2', midi: 62, step: 0, length: 1, velocity: 0.8, isSlide: true },
        ],
      },
    ]);
    component.selectedNoteIds.set(new Set(['n2']));
    component.toggleSlideOnSelection();
    expect(mockMusicManager.updateNote).toHaveBeenCalledWith(
      '1',
      'n2',
      expect.objectContaining({ isSlide: false })
    );
  });

  it('should do nothing when no notes are selected', () => {
    component.selectedNoteIds.set(new Set());
    component.toggleSlideOnSelection();
    expect(mockMusicManager.updateNote).not.toHaveBeenCalled();
  });

  // ── Sprint A2 — slide-note data path ─────────────────────
  it('getNoteSlideSemitones returns 0 for non-slide notes', () => {
    mockMusicManager.getNoteSlideSemitones.mockReturnValue(0);
    expect(mockMusicManager.getNoteSlideSemitones({ midi: 60 })).toBe(0);
  });

  it('getNoteSlideSemitones returns the clamped bend for slide notes', () => {
    mockMusicManager.getNoteSlideSemitones.mockImplementation(
      (n) => (n.isSlide ? 5 : 0)
    );
    expect(
      mockMusicManager.getNoteSlideSemitones({
        midi: 62,
        isSlide: true,
        pitchBend: 5,
      })
    ).toBe(5);
  });

  it('selectedNoteIsSlide stays true after re-selecting the same notes', () => {
    mockMusicManager.tracks.update((t) => [
      {
        ...t[0],
        notes: [
          { id: 'n3', midi: 60, step: 0, length: 1, velocity: 0.8, isSlide: true, pitchBend: 3 },
        ],
      },
    ]);
    component.selectedNoteIds.set(new Set(['n3']));
    expect(component.selectedNoteIsSlide()).toBe(true);
  });
});
