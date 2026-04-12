import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PianoRollComponent } from './piano-roll.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';

@Component({
  selector: 'app-channel-rack',
  standalone: true,
  template: '<div data-testid="channel-rack"></div>',
})
class StubChannelRackComponent {}

@Component({
  selector: 'app-mixer',
  standalone: true,
  template: '<div data-testid="mixer"></div>',
})
class StubMixerComponent {}

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  template: '<div data-testid="drum-machine"></div>',
})
class StubDrumMachineComponent {}

@Component({
  selector: 'app-mastering-suite',
  standalone: true,
  template: '<div data-testid="mastering-suite"></div>',
})
class StubMasteringSuiteComponent {}

describe('PianoRollComponent', () => {
  const createComponent = async ({
    route = '/studio',
    compact = true,
  }: {
    route?: string;
    compact?: boolean;
  } = {}) => {
    const audioSessionMock = {
      isPlaying: signal(false),
      togglePlay: jest.fn(),
    };
    const updates: Array<{
      trackId: number;
      noteId: string;
      patch: Record<string, number>;
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
      addNote: jest.fn(),
      addNoteToTrack: jest.fn(),
      removeNote: jest.fn(),
      deleteNoteById: jest.fn(),
      clearTrack: jest.fn(),
      ensureTrack: jest.fn(),
      setInstrument: jest.fn(),
      removeTrack: jest.fn(),
      toggleMute: jest.fn(),
      engine: { tempo: signal(120) },
      currentStep: signal(0),
    };

    await TestBed.configureTestingModule({
      imports: [PianoRollComponent],
      providers: [
        { provide: MusicManagerService, useValue: mockMusicManager },
        { provide: AudioSessionService, useValue: audioSessionMock },
        { provide: AiService, useValue: { generateAiResponse: jest.fn() } },
        { provide: UIService, useValue: { performanceMode: signal(false) } },
        { provide: Router, useValue: { url: route, navigate: jest.fn() } },
      ],
    })
      .overrideComponent(PianoRollComponent, {
        set: {
          imports: [
            CommonModule,
            FormsModule,
            StubChannelRackComponent,
            StubMixerComponent,
            StubDrumMachineComponent,
            StubMasteringSuiteComponent,
          ],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(PianoRollComponent);
    const component = fixture.componentInstance;
    component.isCompactMobile.set(compact);
    fixture.detectChanges();

    return {
      component,
      fixture,
      updates,
      audioSessionMock,
      mockMusicManager,
    };
  };

  it('clamps transpose to valid midi range', async () => {
    const { component, updates } = await createComponent();
    component.selectedNoteIds.set(new Set(['n1']));

    component.transposeSelected(12);

    expect(updates).toHaveLength(1);
    expect(updates[0].noteId).toBe('n1');
    expect(updates[0].patch.midi).toBe(127);
  });

  it('snaps note placement to the selected scale when enabled', async () => {
    const { component, mockMusicManager } = await createComponent();
    component.snapToScale.set(true);

    const midi = 61;
    const y =
      component.getDisplayKeys().indexOf(midi) * component.rowHeight + 1;
    component.onGridMouseDown({
      clientX: 1,
      clientY: y,
      currentTarget: {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      },
    } as unknown as MouseEvent);

    expect(mockMusicManager.addNote).toHaveBeenCalledWith(1, 60, 0);
  });

  it('keeps transposed notes inside the selected scale when scale snap is enabled', async () => {
    const { component, updates } = await createComponent();
    component.snapToScale.set(true);
    component.selectedNoteIds.set(new Set(['n2']));

    component.transposeSelected(2);

    expect(updates).toHaveLength(1);
    expect(updates[0].noteId).toBe('n2');
    expect(updates[0].patch.midi).toBe(66);
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
    const { component, mockMusicManager } = await createComponent();
    component.selectedNoteIds.set(new Set(['n2']));

    component.duplicateNextBar();

    expect(mockMusicManager.addNote).toHaveBeenCalled();
    expect(mockMusicManager.addNote).toHaveBeenCalledWith(1, 64, 22, 2, 0.7);
  });

  it('opens the audio dock when selecting a dock view', async () => {
    const { component } = await createComponent();

    component.setAudioDockView('mastering');

    expect(component.audioDockView()).toBe('mastering');
    expect(component.showAudioDock()).toBe(true);
  });

  it('toggles playback from the toolbar button', async () => {
    const { component, audioSessionMock } = await createComponent();

    component.togglePlay();

    expect(audioSessionMock.togglePlay).toHaveBeenCalled();
  });

  it('toggles the audio dock visibility', async () => {
    const { component } = await createComponent();

    const startingState = component.showAudioDock();
    component.toggleAudioDock();

    expect(component.showAudioDock()).toBe(!startingState);
  });

  it('renders the channel rack in standalone desktop mode', async () => {
    const { fixture } = await createComponent({
      route: '/piano-roll',
      compact: false,
    });

    expect(fixture.nativeElement.querySelector('aside')).toBeTruthy();
  });

  it('renders the selected audio dock module', async () => {
    const { component, fixture } = await createComponent({
      route: '/piano-roll',
    });

    component.showAudioDock.set(true);
    component.audioDockView.set('mixer');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="mixer"]')
    ).toBeTruthy();

    component.audioDockView.set('drum-machine');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="drum-machine"]')
    ).toBeTruthy();

    component.audioDockView.set('mastering');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="mastering-suite"]')
    ).toBeTruthy();
  });

  it('updates project pattern length and timeline cells', async () => {
    const { component } = await createComponent();

    component.setPatternLength(2);
    expect(component.numMeasures).toBe(2);
    expect(component.cells.length).toBe(32);

    component.setPatternLength(99);
    expect(component.numMeasures).toBe(16);
    expect(component.cells.length).toBe(256);
  });

  it('summarizes arrangement bars for the current track', async () => {
    const { component } = await createComponent();

    const bars = component.arrangementBars();

    expect(bars.length).toBe(component.numMeasures);
    expect(bars[0].noteCount).toBe(2);
    expect(bars[1].noteCount).toBe(0);
  });

  it('adds a track with the selected preset and selects it', async () => {
    const { component, mockMusicManager } = await createComponent();
    mockMusicManager.ensureTrack.mockReturnValue(99);
    component.newTrackPresetId.set('grand-piano');

    component.addTrack();

    expect(mockMusicManager.ensureTrack).toHaveBeenCalledWith('grand-piano');
    expect(mockMusicManager.selectedTrackId()).toBe(99);
  });

  it('replaces the selected track instrument from the project track list', async () => {
    const { component, mockMusicManager } = await createComponent();

    component.replaceTrackInstrument(mockMusicManager.tracks()[0], 'synth-pad');

    expect(mockMusicManager.setInstrument).toHaveBeenCalledWith(1, 'synth-pad');
  });

  it('removes a project track and clears note selection', async () => {
    const { component, mockMusicManager } = await createComponent();
    component.selectedNoteIds.set(new Set(['n1']));

    component.removeTrack(1);

    expect(mockMusicManager.removeTrack).toHaveBeenCalledWith(1);
    expect(component.selectedNoteIds().size).toBe(0);
  });

  it('widens grid sizing for narrow and compact viewports', async () => {
    const originalWidth = window.innerWidth;
    const { component } = await createComponent({ compact: false });
    const setWidth = (width: number) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
      });
      (component as any).checkMobile();
    };

    setWidth(500);
    expect(component.rowHeight).toBe(24);
    expect(component.cellWidth).toBe(32);

    setWidth(720);
    expect(component.rowHeight).toBe(24);
    expect(component.cellWidth).toBe(32);

    setWidth(1200);
    expect(component.rowHeight).toBe(24);
    expect(component.cellWidth).toBe(32);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
    (component as any).checkMobile();
  });
});
