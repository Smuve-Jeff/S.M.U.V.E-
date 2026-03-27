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

    return { component, fixture, updates, adds, audioSessionMock };
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

    expect(
      fixture.nativeElement.querySelector('[data-testid="channel-rack"]')
    ).toBeTruthy();
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

  it('widens grid sizing for narrow and compact viewports', async () => {
    const originalWidth = window.innerWidth;
    const { component } = await createComponent({ compact: false });
    const setWidth = (width: number) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
      });
      (component as any).updateViewportFlags();
    };

    setWidth(500);
    expect(component.rowHeight).toBe(30);
    expect(component.cellWidth).toBe(38);

    setWidth(720);
    expect(component.rowHeight).toBe(28);
    expect(component.cellWidth).toBe(34);

    setWidth(1200);
    expect(component.rowHeight).toBe(24);
    expect(component.cellWidth).toBe(32);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    });
    (component as any).updateViewportFlags();
  });
});
