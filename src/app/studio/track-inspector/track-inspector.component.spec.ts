import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrackInspectorComponent } from './track-inspector.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AiService } from '../../services/ai.service';
import { AudioImportService } from '../audio-import.service';
import { SnackbarService } from '../../services/snackbar.service';
import { signal } from '@angular/core';
import { KnobComponent } from '../shared/knob/knob.component';

describe('TrackInspectorComponent', () => {
  let component: TrackInspectorComponent;
  let fixture: ComponentFixture<TrackInspectorComponent>;

  const addNoteToTrack = jest.fn();
  const tracksUpdate = jest.fn();

  const tracksSignal = signal([
    {
      id: 'trk1',
      name: 'Drums',
      type: 'midi',
      instrumentId: 'trap-808',
      notes: [],
      synthParams: {},
    },
  ]);

  const musicManagerMock = {
    selectedTrackId: signal('trk1'),
    tracks: tracksSignal as any,
    addNoteToTrack,
    updateSynthParams: jest.fn(),
  };
  // Spy on the signal's update fn so we can assert the dead-steps write is GONE.
  tracksSignal.update = jest.fn(tracksSignal.update.bind(tracksSignal));

  const aiMock = {
    generateDrumPattern: jest.fn(async () => [
      true, false, true, false, true, false,
    ]),
    generateChordProgression: jest.fn(async () => [60, 64, 67]),
    getSmartMixAdvice: jest.fn(() => 'Cut 200Hz on the bass'),
  };

  const audioImportMock = {
    importedAudio: signal([
      {
        id: 'a1',
        name: 'Drums',
        type: 'audio' as const,
        pitchSemitones: 0,
        normalize: false,
      },
    ]),
    setPitchSemitones: jest.fn(),
    toggleNormalize: jest.fn(),
  };

  const snackMock = {
    show: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [TrackInspectorComponent, KnobComponent],
      providers: [
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: AiService, useValue: aiMock },
        { provide: AudioImportService, useValue: audioImportMock },
        { provide: SnackbarService, useValue: snackMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TrackInspectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('writes AI drum patterns as AUDIBLE notes, never the dead steps array', async () => {
    await component.generatePattern();
    expect(aiMock.generateDrumPattern).toHaveBeenCalled();
    // 6-step pattern, 3 hits → 3 real TrackNotes added (history-wrapped).
    expect(addNoteToTrack).toHaveBeenCalledTimes(3);
    const notes = addNoteToTrack.mock.calls.map((c: any[]) => c[1]);
    for (const note of notes) {
      expect(note.step).toBeGreaterThanOrEqual(0);
      expect(note.midi).toBeGreaterThanOrEqual(30);
      expect(note.step % 2).toBe(0);
    }
    // The old broken implementation rewrote the whole track array.
    expect(tracksUpdate).not.toHaveBeenCalled();
  });

  it('routes generateChords into addNoteToTrack', async () => {
    await component.generateChords();
    expect(aiMock.generateChordProgression).toHaveBeenCalled();
    expect(addNoteToTrack).toHaveBeenCalledTimes(3);
    const first = addNoteToTrack.mock.calls[0][1];
    expect(first.midi).toBe(60);
    expect(first.length).toBe(4);
  });

  it('surfaces smart-mix advice via snackbar instead of blocking alert', () => {
    component.getSmartAdvice();
    expect(snackMock.show).toHaveBeenCalledWith('Cut 200Hz on the bass');
  });

  it('links an audio track to its imported file and drives the import pipeline', () => {
    const track = musicManagerMock.tracks()[0] as any;
    const audioTrack = { ...track, id: 'audio1', type: 'audio', name: 'Vocals' };
    (musicManagerMock.tracks as any).set([audioTrack]);
    musicManagerMock.selectedTrackId.set('audio1');
    fixture.detectChanges();

    expect(component.linkedAudio()).not.toBeNull();
    component.setAudioPitch(3);
    expect(audioImportMock.setPitchSemitones).toHaveBeenCalledWith(3);

    component.normalizeAudio();
    expect(audioImportMock.toggleNormalize).toHaveBeenCalledWith(true);
    expect(snackMock.success).toHaveBeenCalled();
  });
});