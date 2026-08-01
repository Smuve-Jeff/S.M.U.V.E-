import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionViewComponent } from './session-view.component';
import { AudioSessionService } from '../audio-session.service';
import { MusicManagerService } from '../../services/music-manager.service';
import { HapticService } from '../../services/haptic.service';
import { SnackbarService } from '../../services/snackbar.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { signal } from '@angular/core';

describe('SessionViewComponent', () => {
  let component: SessionViewComponent;
  let fixture: ComponentFixture<SessionViewComponent>;
  let audioSessionMock: any;
  let hapticMock: { light: jest.Mock; medium: jest.Mock; heavy: jest.Mock };
  let snackbarMock: {
    info: jest.Mock;
    success: jest.Mock;
    warning: jest.Mock;
    error: jest.Mock;
  };

  beforeEach(async () => {
    localStorage.clear();
    hapticMock = { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() };
    snackbarMock = {
      info: jest.fn(),
      success: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
    };

    const engineMock = {
      tempo: jest.fn(() => 120),
      visualStep: jest.fn(() => 0),
      isPlaying: jest.fn(() => false),
      start: jest.fn(),
      stop: jest.fn(),
    } as any;

    audioSessionMock = {
      isPlaying: signal(false),
      togglePlay: jest.fn(),
      engine: engineMock,
      micChannels: signal([]),
    };

    const musicManagerMock = {
      tracks: signal([]),
      ensureTrack: jest.fn(),
    } as any;

    await TestBed.configureTestingModule({
      imports: [SessionViewComponent],
      providers: [
        { provide: HapticService, useValue: hapticMock },
        { provide: SnackbarService, useValue: snackbarMock },
        { provide: AudioSessionService, useValue: audioSessionMock },
        { provide: MusicManagerService, useValue: musicManagerMock },
        { provide: AudioEngineService, useValue: engineMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with defaults: quantization off, follow-on off, no queue', () => {
    expect(component.launchQuantize()).toBe('none');
    expect(component.followOnEnabled()).toBe(false);
    expect(component.queuedClipIds().size).toBe(0);
  });

  it('should expose quantize options', () => {
    expect(component.quantizeOptions).toEqual([
      'none',
      '1bar',
      '2bar',
      '4bar',
    ]);
  });

  it('should launch a scene immediately when quantization is off', () => {
    const scene = component.scenes()[0];
    component.launchScene(scene);
    expect(component.activeSceneId()).toBe(scene.id);
    expect(
      component.clips().filter((c) => c.sceneId === scene.id)
    ).toHaveLength(3);
    expect(
      component.clips().filter((c) => c.sceneId === scene.id && c.isPlaying)
    ).toHaveLength(3);
  });

  it('should queue a scene when quantization is on', () => {
    jest.useFakeTimers();
    component.launchQuantize.set('1bar');
    audioSessionMock.isPlaying.set(true);
    const scene = component.scenes()[1];
    component.launchScene(scene);
    // Queued, not yet playing
    expect(component.queuedClipIds().size).toBeGreaterThan(0);
    expect(component.activeSceneId()).toBeNull();
    // After the bar boundary, the scene commits
    jest.runAllTimers();
    expect(component.activeSceneId()).toBe(scene.id);
    jest.useRealTimers();
  });

  it('should stop all clips and clear the queue', () => {
    component.launchScene(component.scenes()[0]);
    component.queuedClipIds.set(new Set(['c1']));
    component.stopAll();
    expect(component.activeSceneId()).toBeNull();
    expect(component.queuedClipIds().size).toBe(0);
    expect(component.clips().every((c) => !c.isPlaying)).toBe(true);
    expect(snackbarMock.info).toHaveBeenCalledWith('Session stopped');
  });

  it('should trigger a clip with velocity and toggle its playing state', () => {
    const clip = component.clips()[0];
    component.triggerClip(clip, 0.5);
    expect(component.clips()[0].isPlaying).toBe(true);
    expect(component.clips()[0].velocity).toBe(0.5);
  });

  it('should add scenes with unique ids', () => {
    const before = component.scenes().length;
    component.addScene();
    expect(component.scenes().length).toBe(before + 1);
  });

  it('should save and load presets', () => {
    component.presetNameInput.set('Test Preset');
    component.savePreset();
    expect(component.savedPresets().some((p) => p.name === 'Test Preset')).toBe(
      true
    );
    // Mutate, then load back
    component.scenes.update((s) => s.slice(0, 2));
    component.loadPreset('Test Preset');
    expect(component.scenes().length).toBeGreaterThan(2);
  });

  it('should add automation points to a clip', () => {
    component.toggleAutomation('c1');
    component.addAutomationPoint('c1');
    const clip = component.clips().find((c) => c.id === 'c1');
    expect(clip?.automation?.length).toBe(1);
  });

  it('should compute clip tracks from music manager tracks', () => {
    const tracks = component.clipTracks();
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0].id).toBe('t1');
  });

  it('should follow-on to the next scene when enabled', () => {
    jest.useFakeTimers();
    component.followOnEnabled.set(true);
    component.launchScene(component.scenes()[0]);
    // Intro's longest clip is 8 bars @120bpm = 16s. Advance just past that
    // single follow-on hop (NOT runAllTimers — that would cascade through
    // every scene to the outro and reset activeSceneId to null).
    jest.advanceTimersByTime(16001);
    // Follow-on advances to scene 1 (Verse)
    expect(component.activeSceneId()).toBe('verse');
    jest.useRealTimers();
  });
});
