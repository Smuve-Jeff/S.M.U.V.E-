import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { PianoRollComponent } from './piano-roll.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';

describe('PianoRollComponent', () => {
  const createComponent = async () => {
    const updates: Array<{
      trackId: number;
      noteId: string;
      patch: Record<string, number>;
    }> = [];
    const adds: Array<{
      trackId: number;
      midi: number;
      step: number;
      length: number;
      velocity: number;
    }> = [];

    const track = {
      id: 1,
      name: 'Lead',
      instrumentId: 'synth',
      notes: [
        { id: 'n1', midi: 126, step: 2, length: 1, velocity: 0.8 },
        { id: 'n2', midi: 64, step: 6, length: 2, velocity: 0.7 },
      ],
      gain: 1,
      pan: 0,
      sendA: 0,
      sendB: 0,
      mute: false,
      solo: false,
      steps: [],
    };

    const mockMusicManager = {
      tracks: signal([track]),
      selectedTrackId: signal(1),
      updateNote: (
        trackId: number,
        noteId: string,
        patch: Record<string, number>
      ) => {
        updates.push({ trackId, noteId, patch });
      },
      addNote: (
        trackId: number,
        midi: number,
        step: number,
        length: number,
        velocity: number
      ) => {
        adds.push({ trackId, midi, step, length, velocity });
      },
      addNoteToTrack: jest.fn(),
      deleteNoteById: jest.fn(),
      clearTrack: jest.fn(),
      ensureTrack: jest.fn(),
      toggleMute: jest.fn(),
      engine: { tempo: signal(120) },
      currentStep: signal(0),
    };

    await TestBed.configureTestingModule({
      imports: [PianoRollComponent],
      providers: [
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AiService, useValue: { generateAiResponse: jest.fn() } },
        { provide: UIService, useValue: { performanceMode: signal(false) } },
        { provide: Router, useValue: { url: '/studio', navigate: jest.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PianoRollComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return { component, updates, adds };
  };

  it('clamps transpose to valid midi range', async () => {
    const { component, updates } = await createComponent();
    component.selectedNoteIds.set(new Set(['n1']));

    component.transposeSelected(12);

    expect(updates).toHaveLength(1);
    expect(updates[0].noteId).toBe('n1');
    expect(updates[0].patch.midi).toBe(127);
  });

  it('sets selected note length with minimum clamp', async () => {
    const { component, updates } = await createComponent();
    component.selectedNoteIds.set(new Set(['n2']));

    component.setSelectedNoteLength(0);

    expect(updates).toHaveLength(1);
    expect(updates[0].noteId).toBe('n2');
    expect(updates[0].patch.length).toBe(1);
  });

  it('duplicates selected notes to next bar', async () => {
    const { component, adds } = await createComponent();
    component.selectedNoteIds.set(new Set(['n2']));

    component.duplicateNextBar();

    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({
      trackId: 1,
      midi: 64,
      step: 22,
      length: 2,
      velocity: 0.7,
    });
  });
});
