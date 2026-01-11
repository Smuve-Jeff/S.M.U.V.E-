import { Component, ChangeDetectionStrategy, signal, computed, inject, effect, OnDestroy } from '@angular/core';
import { AudioEngineService } from '../../services/audio-engine.service';
import { MicrophoneRoutingService, ConnectionType, StudioMicChannelConfig } from '../../services/microphone-routing.service';
import { RecordingFormat, StudioRecordingService } from '../../services/studio-recording.service';
import { UserContextService, MainViewMode } from '../../services/user-context.service';

const CONNECTION_TYPES = ['xlr', 'midi', 'usb', 'line', 'bluetooth', 'wifi'] as const;

type QualityFlag = keyof MasterQualityProfile;

type PluginId = 'compressor' | 'limiter' | 'autoTune';

interface MicChannel {
  id: string;
  label: string;
  level: number;
  muted: boolean;
  pan: number;
  connectionType: ConnectionType;
  phantomPower: boolean;
  latencyMs: number;
  noiseGate: number;
  distortionGuard: number;
  category: 'vocal' | 'instrument' | 'room' | 'custom';
  armed: boolean;
}

interface MasterQualityProfile {
  lowLatencyMode: boolean;
  distortionRemoval: boolean;
  noiseSuppression: boolean;
  phantomPowerBus: boolean;
}

interface PluginControl {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface PluginModule {
  id: PluginId;
  label: string;
  description: string;
  latencyImpact: number;
  enabled: boolean;
  controls: PluginControl[];
  values: Record<string, number>;
}

@Component({
  selector: 'app-studio-interface',
  templateUrl: './studio-interface.component.html',
  styleUrls: ['./studio-interface.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioInterfaceComponent implements OnDestroy {
  readonly connectionTypes = CONNECTION_TYPES;
  readonly qualityFlags: QualityFlag[] = ['lowLatencyMode', 'distortionRemoval', 'noiseSuppression', 'phantomPowerBus'];

  masterVolume = signal(70);
  recording = signal(false);
  qualityProfile = signal<MasterQualityProfile>({
    lowLatencyMode: true,
    distortionRemoval: true,
    noiseSuppression: true,
    phantomPowerBus: false,
  });

  micChannels = signal<MicChannel[]>([
    { id: 'mic-1', label: 'Vocal Booth', level: 70, muted: false, pan: 0, connectionType: 'xlr', phantomPower: true, latencyMs: 3, noiseGate: 35, distortionGuard: 60, category: 'vocal', armed: true },
    { id: 'mic-2', label: 'Ambient Room', level: 65, muted: true, pan: -20, connectionType: 'usb', phantomPower: false, latencyMs: 6, noiseGate: 45, distortionGuard: 50, category: 'room', armed: false },
    { id: 'mic-3', label: 'MIDI Instrument', level: 60, muted: false, pan: 15, connectionType: 'midi', phantomPower: false, latencyMs: 2, noiseGate: 25, distortionGuard: 70, category: 'instrument', armed: false },
  ]);

  pluginRack = signal<PluginModule[]>([
    {
      id: 'compressor',
      label: 'VCA Compressor',
      description: 'Glue vocals and beats with mix-bus ready compression.',
      latencyImpact: 1.5,
      enabled: true,
      controls: [
        { id: 'threshold', label: 'Threshold', min: -40, max: 0, step: 1, unit: 'dB' },
        { id: 'ratio', label: 'Ratio', min: 1, max: 10, step: 0.1, unit: ':' },
        { id: 'attack', label: 'Attack', min: 0.1, max: 30, step: 0.1, unit: 'ms' },
        { id: 'release', label: 'Release', min: 10, max: 600, step: 5, unit: 'ms' },
      ],
      values: { threshold: -18, ratio: 3.5, attack: 5, release: 180 },
    },
    {
      id: 'limiter',
      label: 'Brickwall Limiter',
      description: 'Protect the master bus with invisible headroom management.',
      latencyImpact: 0.5,
      enabled: true,
      controls: [
        { id: 'ceiling', label: 'Ceiling', min: -3, max: 0, step: 0.1, unit: 'dB' },
        { id: 'lookahead', label: 'Lookahead', min: 0, max: 10, step: 0.5, unit: 'ms' },
        { id: 'release', label: 'Release', min: 10, max: 300, step: 5, unit: 'ms' },
      ],
      values: { ceiling: -0.8, lookahead: 4, release: 120 },
    },
    {
      id: 'autoTune',
      label: 'SmartTune Auto-Tune',
      description: 'Studio-grade pitch correction with phantom-powered tracking.',
      latencyImpact: 2.3,
      enabled: false,
      controls: [
        { id: 'retune', label: 'Retune Speed', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'humanize', label: 'Humanize', min: 0, max: 100, step: 1, unit: '%' },
        { id: 'formant', label: 'Formant', min: -12, max: 12, step: 1, unit: 'st' },
      ],
      values: { retune: 35, humanize: 55, formant: 0 },
    },
  ]);

  recordingStatus = computed(() => (this.recording() ? 'Recording' : 'Standby'));
  latencySummary = computed(() => {
    const total = this.micChannels().reduce((acc, c) => acc + c.latencyMs, 0);
    return (total / this.micChannels().length).toFixed(1);
  });
  pluginLoad = computed(() => {
    const plugins = this.pluginRack();
    const active = plugins.filter(p => p.enabled);
    if (plugins.length === 0) return '0%';
    const percentage = (active.length / plugins.length) * 100;
    return `${percentage.toFixed(0)}% active`;
  });
  armedChannelLabels = computed(() => this.micChannels().filter(ch => ch.armed).map(ch => ch.label));

  readonly trackByChannel = (_: number, channel: MicChannel) => channel.id;
  readonly trackByPlugin = (_: number, plugin: PluginModule) => plugin.id;

  private readonly audioEngine = inject(AudioEngineService);
  private readonly micRouter = inject(MicrophoneRoutingService);
  private readonly recordingService = inject(StudioRecordingService);
  private readonly userContext = inject(UserContextService);

  private meterUnsubscribe: (() => void) | null = null;
  private channelMeters = signal<Record<string, number>>({});
  recordingFormats = this.recordingService.getSupportedFormats();
  selectedFormat = signal<RecordingFormat>(this.recordingFormats[0] ?? 'audio/webm;codecs=opus');
  recordingName = signal('Studio Print');
  recordedTakes = this.recordingService.takes;
  elapsedMs = this.recordingService.elapsedMs;
  readonly modeButtons: { id: MainViewMode; label: string; description: string; icon: string }[] = [
    { id: 'player', label: 'Player', description: 'Smart playlists & listening', icon: 'fas fa-music' },
    { id: 'dj', label: 'DJ Deck', description: 'Dual decks, crossfade, scratching', icon: 'fas fa-compact-disc' },
    { id: 'piano-roll', label: 'Piano Roll', description: 'Sequencing + MIDI edit', icon: 'fas fa-sliders-h' },
    { id: 'image-editor', label: 'Image Lab', description: 'Art + cover design', icon: 'fas fa-image' },
    { id: 'video-editor', label: 'Video Lab', description: 'Clips & reels generator', icon: 'fas fa-video' },
    { id: 'networking', label: 'Networking', description: 'Collabs & discovery', icon: 'fas fa-globe' },
    { id: 'tha-spot', label: 'Tha Spot', description: 'Community hub', icon: 'fas fa-users' },
    { id: 'profile', label: 'Profile', description: 'Artist identity builder', icon: 'fas fa-id-card' }
  ];

  constructor() {
    effect(() => {
      this.audioEngine.setMasterOutputLevel(this.masterVolume() / 100);
    });

    // initialize plugin settings on boot
    this.pluginRack().forEach(plugin => this.syncPluginWithEngine(plugin.id, plugin.enabled));

    const profile = this.qualityProfile();
    this.micRouter.setPhantomPowerBus(profile.phantomPowerBus);
    this.micRouter.setNoiseSuppression(profile.noiseSuppression);

    this.initializeChannels();
    this.meterUnsubscribe = this.micRouter.subscribeToMeters((id, level) => {
      this.channelMeters.update(map => ({ ...map, [id]: Math.round(level * 100) }));
    });
  }

  ngOnDestroy(): void {
    this.meterUnsubscribe?.();
  }

  toggleRecording(): void {
    if (this.recording()) {
      this.stopCapture();
    } else {
      this.startCapture();
    }
  }

  goToMode(mode: MainViewMode): void {
    this.userContext.setMainViewMode(mode);
  }

  updateMasterVolume(value: number): void {
    this.masterVolume.set(value);
    this.audioEngine.setMasterOutputLevel(value / 100);
  }

  toggleQualityFlag(flag: QualityFlag): void {
    this.qualityProfile.update(profile => {
      const next = { ...profile, [flag]: !profile[flag] };
      if (flag === 'phantomPowerBus') {
        this.micRouter.setPhantomPowerBus(next.phantomPowerBus);
      }
      if (flag === 'noiseSuppression') {
        this.micRouter.setNoiseSuppression(next.noiseSuppression);
      }
      return next;
    });
  }

  updateChannelLevel(channel: MicChannel, value: number): void {
    this.patchChannel(channel.id, { level: value });
    this.micRouter.setChannelLevel(channel.id, value);
  }

  updateChannelPan(channel: MicChannel, value: number): void {
    this.patchChannel(channel.id, { pan: value });
    this.micRouter.setChannelPan(channel.id, value);
  }

  updateConnection(channel: MicChannel, connectionType: ConnectionType): void {
    this.patchChannel(channel.id, { connectionType });
    this.micRouter.setConnectionType(channel.id, connectionType);
  }

  togglePhantomPower(channel: MicChannel): void {
    const enable = !(channel.phantomPower || this.qualityProfile().phantomPowerBus);
    this.patchChannel(channel.id, { phantomPower: enable });
    this.micRouter.setChannelPhantomPower(channel.id, enable);
  }

  updateLatency(channel: MicChannel, value: number): void {
    this.patchChannel(channel.id, { latencyMs: value });
    this.micRouter.setChannelLatency(channel.id, value);
  }

  updateNoiseGate(channel: MicChannel, value: number): void {
    this.patchChannel(channel.id, { noiseGate: value });
    this.micRouter.setChannelNoiseGate(channel.id, value);
  }

  updateDistortionGuard(channel: MicChannel, value: number): void {
    this.patchChannel(channel.id, { distortionGuard: value });
    this.micRouter.setChannelDistortionGuard(channel.id, value);
  }

  toggleMute(channel: MicChannel): void {
    const muted = !channel.muted;
    this.patchChannel(channel.id, { muted });
    this.micRouter.setMuted(channel.id, muted);
  }

  togglePlugin(plugin: PluginModule): void {
    this.patchPlugin(plugin.id, { enabled: !plugin.enabled });
    this.syncPluginWithEngine(plugin.id, !plugin.enabled);
  }

  updatePluginControl(plugin: PluginModule, controlId: string, value: number): void {
    this.patchPlugin(plugin.id, {
      values: {
        ...plugin.values,
        [controlId]: value,
      },
    });
    this.syncPluginWithEngine(plugin.id, plugin.enabled);
  }

  meterLevelFor(channelId: string): number {
    return this.channelMeters()[channelId] ?? 0;
  }

  formattedElapsed(): string {
    const ms = this.elapsedMs();
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  addChannel(category: MicChannel['category'] = 'custom'): void {
    const newChannel: MicChannel = {
      id: crypto.randomUUID(),
      label: `Channel ${this.micChannels().length + 1}`,
      level: 60,
      muted: false,
      pan: 0,
      connectionType: 'xlr',
      phantomPower: false,
      latencyMs: 4,
      noiseGate: 35,
      distortionGuard: 65,
      category,
      armed: false,
    };
    this.micChannels.update(list => [...list, newChannel]);
    this.setupChannel(newChannel);
  }

  removeChannel(channel: MicChannel): void {
    this.micChannels.update(list => list.filter(ch => ch.id !== channel.id));
    this.micRouter.disposeChannel(channel.id);
  }

  toggleArm(channel: MicChannel): void {
    this.patchChannel(channel.id, { armed: !channel.armed });
  }

  startCapture(): void {
    const armed = this.micChannels().filter(ch => ch.armed && !ch.muted);
    if (armed.length === 0) {
      console.warn('No channels armed for recording.');
      return;
    }
    this.recording.set(true);
    this.micRouter.setRecordingActive(true).catch(console.warn);
    this.recordingService.startRecording(this.selectedFormat(), armed.map(ch => ch.id), this.recordingName()).catch(err => {
      console.error(err);
      this.recording.set(false);
    });
  }

  stopCapture(): void {
    this.recordingService.stopRecording().finally(() => {
      this.recording.set(false);
      this.micRouter.setRecordingActive(false).catch(console.warn);
    });
  }

  downloadTake(take: { blob: Blob; name: string; format: string; id: string }): void {
    const url = URL.createObjectURL(take.blob);
    const link = document.createElement('a');
    link.href = url;
    const extension = this.formatExtension(take.format);
    link.download = `${take.name}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  deleteTake(id: string): void {
    this.recordingService.deleteTake(id);
  }

  formatExtension(format: string): string {
    if (format.includes('mp3')) return 'mp3';
    if (format.includes('wav')) return 'wav';
    if (format.includes('opus')) return 'webm';
    return 'webm';
  }

  private initializeChannels(): void {
    this.micChannels().forEach(channel => this.setupChannel(channel));
  }

  private setupChannel(channel: MicChannel): void {
    const config: StudioMicChannelConfig = {
      id: channel.id,
      label: channel.label,
      level: channel.level,
      pan: channel.pan,
      connectionType: channel.connectionType,
      phantomPower: channel.phantomPower,
      latencyMs: channel.latencyMs,
      noiseGate: channel.noiseGate,
      distortionGuard: channel.distortionGuard,
      muted: channel.muted,
      category: channel.category,
      armed: channel.armed
    };
    this.micRouter.ensureChannel(config).catch(console.warn);
    this.micRouter.setChannelLevel(channel.id, channel.level);
    this.micRouter.setChannelPan(channel.id, channel.pan);
    this.micRouter.setChannelLatency(channel.id, channel.latencyMs);
    this.micRouter.setChannelNoiseGate(channel.id, channel.noiseGate);
    this.micRouter.setChannelDistortionGuard(channel.id, channel.distortionGuard);
    this.micRouter.setMuted(channel.id, channel.muted);
    this.micRouter.setChannelPhantomPower(channel.id, channel.phantomPower);
  }

  private syncPluginWithEngine(pluginId: PluginId, enabled: boolean): void {
    const plugin = this.pluginRack().find(p => p.id === pluginId);
    if (!plugin) return;
    switch (pluginId) {
      case 'compressor':
        this.audioEngine.configureCompressor({
          threshold: plugin.values['threshold'],
          ratio: plugin.values['ratio'],
          attack: plugin.values['attack'] / 1000,
          release: plugin.values['release'] / 1000,
          enabled,
        });
        break;
      case 'limiter':
        this.audioEngine.configureLimiter({
          ceiling: plugin.values['ceiling'],
          lookahead: plugin.values['lookahead'] / 1000,
          release: plugin.values['release'] / 1000,
          enabled,
        });
        break;
      case 'autoTune':
        this.audioEngine.configureAutoTune({
          mix: plugin.values['humanize'] / 100,
          retune: plugin.values['retune'],
          formant: plugin.values['formant'],
          humanize: plugin.values['humanize'],
          enabled,
        });
        break;
    }
  }

  private patchChannel(id: string, patch: Partial<MicChannel>): void {
    this.micChannels.update(channels =>
      channels.map(c => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  private patchPlugin(id: PluginId, patch: Partial<PluginModule>): void {
    this.pluginRack.update(modules =>
        modules.map(module => {
            if (module.id !== id) {
                return module;
            }

            const newValues = patch.values ? { ...module.values, ...patch.values } : module.values;
            return { ...module, ...patch, values: newValues };
        })
    );
  }
}
