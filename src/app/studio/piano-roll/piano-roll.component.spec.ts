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

  const mockMusicManager = {
    tracks: signal([
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
      },
    ]),
    selectedTrackId: signal('1'),
    currentStep: signal(0),
    crossLinkRequest: signal(null),
    updateNote: jest.fn(),
    addNoteToTrack: jest.fn(),
    removeNotes: jest.fn(),
    quantizeTrack: jest.fn(),
    duplicateNotes: jest.fn(),
    strumTrack: jest.fn(),
    humanizeTrack: jest.fn(),
    arpeggiateTrack: jest.fn(),
    selectedTrack: signal({ id: '1', name: 'Lead', notes: [], color: '#fff' }),
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

  const mockDjMidi = {
    sendCC: jest.fn(),
    setCcOutput: jest.fn(),
    ccOutputIndex: signal(0),
    ccOutputNames: signal(['MIDI Output 1', 'MIDI Output 2']),
    performerNoteOn: { next: jest.fn() },
    performerNoteOff: { next: jest.fn() },
    performerCC,
    midiActivityPulse: signal(false),
    lastMidiMessage: signal(null),
    connectedDevices: signal([]),
    midiOutputs: signal([]),
  };

  const mockAutomation = {
    ensureLane: jest.fn(() => ({ id: 'auto-lane-test' })),
    addPoint: jest.fn(),
  };

  beforeEach(async () => {
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PianoRollComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Reset shared mock state between tests
    mockAutomation.addPoint.mockClear();
    mockAutomation.ensureLane.mockClear();
    mockDjMidi.sendCC.mockClear();
    mockDjMidi.setCcOutput.mockClear();
    component.ccRecordArmed.set(false);
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
});
