import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ChannelRackComponent } from './channel-rack.component';
import { MusicManagerService } from '../../services/music-manager.service';

describe('ChannelRackComponent step lane', () => {
  let component: ChannelRackComponent;
  let fixture: ComponentFixture<ChannelRackComponent>;
  let addNote: jest.Mock;
  let removeNotes: jest.Mock;

  const makeTrack = (overrides: any = {}) => ({
    id: 'track-1',
    name: 'Lead',
    type: 'midi',
    instrumentId: 'grand-piano',
    muted: false,
    soloed: false,
    volume: 0.8,
    gain: 0.8,
    pan: 0,
    clips: [],
    notes: [] as any[],
    steps: new Array(64).fill(false),
    fxSlots: [],
    sendA: 0,
    sendB: 0,
    effects: [],
    patternSlots: [],
    activePatternSlotId: null,
    ...overrides,
  });

  const tracks = signal<any[]>([]);
  const visualStep = signal(0);
  const isPlaying = signal(false);

  beforeEach(async () => {
    addNote = jest.fn();
    removeNotes = jest.fn();
    tracks.set([makeTrack()]);

    await TestBed.configureTestingModule({
      imports: [ChannelRackComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: {
            tracks,
            selectedTrackId: signal<string | null>(null),
            engine: { visualStep, isPlaying },
            removeTrack: jest.fn(),
            ensureTrack: jest.fn(),
            setInstrument: jest.fn(),
            toggleMute: jest.fn(),
            toggleSolo: jest.fn(),
            updateVolume: jest.fn(),
            updateTrackPan: jest.fn(),
            addTrack: jest.fn(),
            addNoteToTrack: addNote,
            removeNotes,
          },
        },
      ],
    })
      .overrideComponent(ChannelRackComponent, {
        set: { template: '<div></div>' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChannelRackComponent);
    component = fixture.componentInstance;
  });

  it('creates with the window on bar 1 when stopped', () => {
    expect(component.windowStart()).toBe(0);
  });

  it('adds an audible note at the cell step with the modal track pitch', () => {
    const track = makeTrack({
      notes: [
        { id: 'n1', midi: 48, step: 0, length: 1, velocity: 0.8 },
        { id: 'n2', midi: 48, step: 2, length: 1, velocity: 0.8 },
        { id: 'n3', midi: 72, step: 4, length: 1, velocity: 0.8 },
      ],
    });
    tracks.set([track]);

    component.toggleStepCell(track, 6);
    expect(addNote).toHaveBeenCalledWith(
      'track-1',
      expect.objectContaining({ step: 6, midi: 48 })
    );
  });

  it('falls back to middle C when the track has no notes yet', () => {
    const track = makeTrack();
    expect(component.pitchForNewNote(track)).toBe(60);
  });

  it('removes every note on a cell that is already lit', () => {
    const track = makeTrack({
      notes: [
        { id: 'n1', midi: 60, step: 0, length: 1, velocity: 0.8 },
        { id: 'n2', midi: 64, step: 0, length: 1, velocity: 0.8 },
      ],
    });
    tracks.set([track]);

    component.toggleStepCell(track, 0);
    expect(removeNotes).toHaveBeenCalledWith('track-1', ['n1', 'n2']);
    expect(addNote).not.toHaveBeenCalled();
  });

  it('lights a cell only when an audible note starts there', () => {
    const track = makeTrack({
      notes: [{ id: 'n1', midi: 60, step: 3.5, length: 1, velocity: 0.8 }],
    });
    expect(component.cellLit(track, 3)).toBe(true);
    expect(component.cellLit(track, 4)).toBe(false);
  });

  it('pages the editing window to later bars when stopped', () => {
    component.nudgeBar(1);
    expect(component.stepBar()).toBe(1);
    expect(component.windowStart()).toBe(16);

    component.setBar(tracks()[0], 3);
    expect(component.windowStart()).toBe(48);
  });

  it('rides the playhead while playing and returns to the paged bar on stop', () => {
    component.stepBar.set(1);
    isPlaying.set(true);
    visualStep.set(40);
    expect(component.windowStart()).toBe(32);

    isPlaying.set(false);
    visualStep.set(40);
    expect(component.windowStart()).toBe(16);
  });

  it('grows bar count to cover composed notes (min four bars)', () => {
    expect(component.barCount(tracks()[0])).toBe(4);
    tracks.set([
      makeTrack({
        notes: [
          { id: 'n1', midi: 60, step: 70, length: 1, velocity: 0.8 },
        ],
      }),
    ]);
    expect(component.barCount(tracks()[0])).toBe(5);
  });
});
