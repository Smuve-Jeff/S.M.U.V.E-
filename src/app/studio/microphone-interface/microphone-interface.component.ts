import {
  Component,
  Input,
  computed,
  effect,
  inject,
  signal,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioSessionService } from '../audio-session.service';
import { MicrophoneService } from '../../services/microphone.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';

type VocalProfile = 'crystal' | 'broadcast' | 'warmth';

@Component({
  selector: 'app-microphone-interface',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './microphone-interface.component.html',
  styleUrls: ['./microphone-interface.component.css'],
})
export class MicrophoneInterfaceComponent implements OnDestroy {
  private readonly audioSession = inject(AudioSessionService);
  public readonly micService = inject(MicrophoneService);
  public readonly mastering = inject(VocalMasteringService);

  @Input() mode: 'compact' | 'full' = 'full';

  selectedChannelId = signal<string | null>(null);
  inputLevel = signal(0);
  vocalProfile = signal<VocalProfile>('crystal');

  private animationId: number | null = null;

  channels = this.audioSession.micChannels;
  devices = this.micService.availableDevices;
  params = this.mastering.params;

  currentChannel = computed(
    () =>
      this.channels().find((channel) => channel.id === this.selectedChannelId()) ??
      this.channels()[0] ??
      null
  );

  deviceSummary = computed(() => {
    const currentDeviceId =
      this.currentChannel()?.deviceId ?? this.micService.selectedDeviceId();
    return (
      this.devices().find((device) => device.deviceId === currentDeviceId) ??
      this.devices()[0] ??
      null
    );
  });

  signalReadiness = computed(() => {
    if (this.micService.isRecording()) return 'recording';
    if (this.micService.isInitialized()) return 'ready';
    return 'offline';
  });

  clarityScore = computed(() => {
    const params = this.params();
    const airLift = Math.max(0, params.eq.high + 12) * 1.5;
    const presence = Math.max(0, params.eq.mid + 12);
    const exciter = params.exciter.amount * 100;
    const deesser = Math.max(0, (-params.deesser.threshold - 10) * 2);
    return Math.round(Math.min(100, 45 + airLift + presence + exciter + deesser));
  });

  constructor() {
    effect(() => {
      if (this.selectedChannelId()) {
        return;
      }
      const preferredChannel =
        this.channels().find((channel) => channel.armed) ?? this.channels()[0];
      if (preferredChannel) {
        this.selectedChannelId.set(preferredChannel.id);
      }
    });

    this.startMetering();
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  stopTrackSelection(event: Event): void {
    event.stopPropagation();
  }

  selectChannel(channelId: string): void {
    this.selectedChannelId.set(channelId);
  }

  async initializeInterface(deviceId?: string): Promise<void> {
    const activeChannel = this.currentChannel();
    const resolvedDeviceId =
      deviceId ??
      activeChannel?.deviceId ??
      this.micService.selectedDeviceId() ??
      this.devices()[0]?.deviceId;

    if (activeChannel && resolvedDeviceId) {
      this.audioSession.updateChannelDevice(activeChannel.id, resolvedDeviceId);
    }

    await this.micService.initialize(resolvedDeviceId);
    if (activeChannel && !activeChannel.armed) {
      this.audioSession.toggleChannelArm(activeChannel.id);
    }
    this.connectMastering();
  }

  async updateDevice(deviceId: string): Promise<void> {
    await this.initializeInterface(deviceId);
  }

  toggleRecording(): void {
    if (!this.micService.isInitialized()) {
      void this.initializeInterface();
      return;
    }

    if (this.micService.isRecording()) {
      this.micService.stopRecording();
    } else {
      this.micService.startRecording();
    }
  }

  togglePause(): void {
    if (this.micService.isPaused()) {
      this.micService.resumeRecording();
    } else {
      this.micService.pauseRecording();
    }
  }

  toggleMute(): void {
    const activeChannel = this.currentChannel();
    if (activeChannel) {
      this.audioSession.toggleChannelMute(activeChannel.id);
    }
  }

  toggleArm(): void {
    const activeChannel = this.currentChannel();
    if (activeChannel) {
      this.audioSession.toggleChannelArm(activeChannel.id);
    }
  }

  updatePan(value: number): void {
    const activeChannel = this.currentChannel();
    if (activeChannel) {
      this.audioSession.updateChannelPan(activeChannel.id, value);
    }
  }

  applyVocalProfile(profile: VocalProfile): void {
    this.vocalProfile.set(profile);

    if (profile === 'broadcast') {
      this.mastering.updateParams({
        deesser: { ...this.params().deesser, threshold: -20, frequency: 6200 },
        eq: { ...this.params().eq, low: -2, mid: 3, high: 4 },
        exciter: { ...this.params().exciter, amount: 0.18, frequency: 7600 },
        limiter: { ...this.params().limiter, ceiling: -1.2, release: 0.12 },
        multiband: {
          ...this.params().multiband,
          mid: { ...this.params().multiband.mid, threshold: -16, ratio: 3.1 },
        },
      });
      return;
    }

    if (profile === 'warmth') {
      this.mastering.updateParams({
        deesser: { ...this.params().deesser, threshold: -25, frequency: 5800 },
        eq: { ...this.params().eq, low: 2, mid: 1.5, high: 1.5 },
        exciter: { ...this.params().exciter, amount: 0.1, frequency: 6800 },
        limiter: { ...this.params().limiter, ceiling: -1.5, release: 0.16 },
        multiband: {
          ...this.params().multiband,
          mid: { ...this.params().multiband.mid, threshold: -18, ratio: 2.4 },
        },
      });
      return;
    }

    this.mastering.updateParams({
      deesser: { ...this.params().deesser, threshold: -22, frequency: 6500 },
      eq: { ...this.params().eq, low: 0, mid: 2.2, high: 5 },
      exciter: { ...this.params().exciter, amount: 0.16, frequency: 8200 },
      limiter: { ...this.params().limiter, ceiling: -1, release: 0.1 },
      multiband: {
        ...this.params().multiband,
        mid: { ...this.params().multiband.mid, threshold: -17, ratio: 2.8 },
      },
    });
  }

  updatePresence(value: number): void {
    this.mastering.updateParams({
      eq: { ...this.params().eq, mid: value },
    });
  }

  updateAir(value: number): void {
    this.mastering.updateParams({
      eq: { ...this.params().eq, high: value },
    });
  }

  updateDeesser(value: number): void {
    this.mastering.updateParams({
      deesser: { ...this.params().deesser, threshold: value },
    });
  }

  updateExciter(value: number): void {
    this.mastering.updateParams({
      exciter: { ...this.params().exciter, amount: value / 100 },
    });
  }

  capabilityLabel(value: string): string {
    return value.replace(/-/g, ' ');
  }

  private connectMastering(): void {
    const source = this.micService.getAnalyserNode();
    if (source) {
      this.mastering.applyToSource(source);
    }
  }

  private startMetering(): void {
    const tick = () => {
      const analyser = this.micService.getAnalyserNode();
      if (analyser && this.micService.isInitialized()) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const sample = data[i] / 128 - 1;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / data.length);
        this.inputLevel.set(Math.round(Math.min(100, rms * 250)));
      } else {
        this.inputLevel.set(0);
      }

      this.animationId = requestAnimationFrame(tick);
    };

    tick();
  }
}
