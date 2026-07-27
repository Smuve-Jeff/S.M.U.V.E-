import { Injectable, inject, signal } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';
import { StudioRecordingEngineService } from './studio-recording-engine.service';
import { LoggingService } from '../services/logging.service';
import { SnackbarService } from '../services/snackbar.service';

export type RecordableComponent =
  | 'arrangement'
  | 'drum-machine'
  | 'sampler'
  | 'vocal-suite'
  | 'audio-recorder'
  | 'performer'
  | 'mixer';

export interface ComponentRecordingConfig {
  componentId: RecordableComponent;
  label: string;
  icon: string;
  /** Whether this component can capture MIDI */
  supportsMidi: boolean;
  /** Whether this component uses external audio input */
  usesInput: boolean;
}

@Injectable({ providedIn: 'root' })
export class ComponentRecordingService {
  private audioEngine = inject(AudioEngineService);
  private recordingEngine = inject(StudioRecordingEngineService);
  private logger = inject(LoggingService);
  private snackbar = inject(SnackbarService);

  /** The currently active component recording source */
  activeSource = signal<RecordableComponent | null>(null);

  /** Whether we are currently recording */
  isRecording = signal(false);

  /** Recording duration in seconds */
  recordingDuration = signal(0);

  private durationInterval: ReturnType<typeof setInterval> | null = null;

  /** Available recordable components with their configs */
  readonly componentConfigs: ComponentRecordingConfig[] = [
    {
      componentId: 'arrangement',
      label: 'Arrangement',
      icon: 'view_quilt',
      supportsMidi: true,
      usesInput: false,
    },
    {
      componentId: 'drum-machine',
      label: 'Drum Machine',
      icon: 'grid_view',
      supportsMidi: true,
      usesInput: false,
    },
    {
      componentId: 'sampler',
      label: 'Sampler',
      icon: 'library_music',
      supportsMidi: false,
      usesInput: true,
    },
    {
      componentId: 'vocal-suite',
      label: 'Vocal Suite',
      icon: 'mic',
      supportsMidi: false,
      usesInput: true,
    },
    {
      componentId: 'audio-recorder',
      label: 'Audio Recorder',
      icon: 'mic_external_on',
      supportsMidi: false,
      usesInput: true,
    },
    {
      componentId: 'performer',
      label: 'Performer',
      icon: 'interpreter_mode',
      supportsMidi: true,
      usesInput: true,
    },
    {
      componentId: 'mixer',
      label: 'Mixer',
      icon: 'tune',
      supportsMidi: false,
      usesInput: true,
    },
  ];

  /** Get config for a specific component */
  getConfig(id: RecordableComponent): ComponentRecordingConfig | undefined {
    return this.componentConfigs.find((c) => c.componentId === id);
  }

  /** Set the active recording source component */
  setActiveSource(component: RecordableComponent) {
    this.activeSource.set(component);
    this.snackbar.info(`Recording source: ${this.getConfig(component)?.label}`);
  }

  /** Start recording from the active source */
  async startRecording(): Promise<boolean> {
    if (this.isRecording()) return false;

    const source = this.activeSource();
    if (!source) {
      this.snackbar.warning('Select a recording source first');
      return false;
    }

    const config = this.getConfig(source);
    if (!config) return false;

    try {
      // For input-based sources, initialize with microphone
      if (config.usesInput) {
        const ok = await this.recordingEngine.initialize();
        if (!ok) {
          this.snackbar.error('Could not access microphone');
          return false;
        }
      }

      this.recordingEngine.startRecording();
      this.isRecording.set(true);
      this.audioEngine.isRecording.set(true);
      this.recordingDuration.set(0);

      this.durationInterval = setInterval(() => {
        this.recordingDuration.update((d) => d + 1);
      }, 1000);

      this.snackbar.info(`Recording ${config.label}...`);
      return true;
    } catch (e) {
      this.logger.error('Component recording start failed', e);
      this.snackbar.error('Recording failed to start');
      return false;
    }
  }

  /** Stop recording */
  async stopRecording(): Promise<void> {
    if (!this.isRecording()) return;

    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }

    try {
      await this.recordingEngine.stopRecording();
    } catch (e) {
      this.logger.warn('Recording stop warning', e);
    }

    this.isRecording.set(false);
    this.audioEngine.isRecording.set(false);
    this.snackbar.success(
      `Recording finished (${this.formatDuration(this.recordingDuration())})`
    );
  }

  /** Toggle recording on/off */
  async toggleRecording(): Promise<void> {
    if (this.isRecording()) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /** Format seconds to mm:ss */
  private formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
