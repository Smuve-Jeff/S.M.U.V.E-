import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MusicManagerService } from '../../services/music-manager.service';
import { ScoreViewComponent } from './score-view.component';

describe('ScoreViewComponent', () => {
  let fixture: ComponentFixture<ScoreViewComponent>;
  let component: ScoreViewComponent;
  let tracks: ReturnType<typeof signal<any[]>>;

  function createTracks() {
    return [
      {
        id: 'piano-1',
        name: 'Piano',
        type: 'instrument',
        color: '#2ba09c',
        notes: [
          { id: 'n-2', midi: 64, step: 16, length: 8, velocity: 0.5 },
          { id: 'n-1', midi: 60, step: 0, length: 4, velocity: 0.9 },
        ],
      },
      {
        id: 'audio-1',
        name: 'Vocal audio',
        type: 'audio',
        notes: [],
      },
    ];
  }

  beforeEach(() => {
    tracks = signal(createTracks());
    TestBed.configureTestingModule({
      imports: [ScoreViewComponent],
      providers: [
        {
          provide: MusicManagerService,
          useValue: { tracks },
        },
      ],
    });

    fixture = TestBed.createComponent(ScoreViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('projects only MIDI tracks into sorted notation staves', () => {
    expect(component.staves()).toHaveLength(1);
    expect(component.staves()[0].name).toBe('Piano');
    expect(component.staves()[0].notes.map((note) => note.id)).toEqual([
      'n-1',
      'n-2',
    ]);
    expect(component.staves()[0].range).toBe('C4 – E4');
  });

  it('calculates bars from the furthest note while keeping a four-bar minimum', () => {
    expect(component.bars()).toBe(4);
    expect(component.totalNotes()).toBe(2);
    expect(component.barColumns()).toEqual([1, 2, 3, 4]);

    tracks.update((current) => [
      ...current,
      {
        id: 'long-1',
        name: 'Long phrase',
        type: 'instrument',
        notes: [{ id: 'n-long', midi: 72, step: 64, length: 1, velocity: 1 }],
      },
    ]);

    expect(component.bars()).toBe(5);
    expect(component.totalNotes()).toBe(3);
  });

  it('formats pitch, accidentals, duration, and velocity for score notes', () => {
    expect(component.noteName(61)).toBe('C♯');
    expect(component.octave(60)).toBe(4);
    expect(component.isAccidental(61)).toBe(true);
    expect(component.durationLabel(16)).toBe('whole');
    expect(component.durationLabel(2)).toBe('eighth');
    expect(component.durationLabel(1)).toBe('sixteenth');
  });

  it('adds velocity shading: louder notes are more opaque', () => {
    const notes = component.staves()[0].notes;
    const quiet = notes.find((n) => n.id === 'n-2'); // velocity 0.5
    const loud = notes.find((n) => n.id === 'n-1'); // velocity 0.9
    expect(quiet!.velocityOpacity).toBeCloseTo(0.725, 3);
    expect(loud!.velocityOpacity).toBeCloseTo(0.945, 3);
    expect(loud!.velocityOpacity).toBeGreaterThan(quiet!.velocityOpacity);
  });

  it('marks quarter-note rests on beats with no note onset', () => {
    const staff = component.staves()[0];
    // Two notes: n-1 at step 0 (bar 1, beat 1) and n-2 at step 16 (bar 2, beat 1).
    // Bars 1 and 2 each get rests on beats 2–4 → 3 + 3 = 6 rests.
    expect(staff.rests.length).toBe(6);
    expect(staff.rests.every((r) => r.bar === 1 || r.bar === 2)).toBe(true);
    expect(staff.rests.some((r) => r.left > 0)).toBe(true);
  });
});
