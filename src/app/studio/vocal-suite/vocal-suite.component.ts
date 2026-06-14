import {
  Component,
  signal,
  inject,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIService } from '../../services/ui.service';
import { MicrophoneService } from '../../services/microphone.service';
import { StudioRecordingEngineService } from '../studio-recording-engine.service';
import { VocalMasteringService } from '../../services/vocal-mastering.service';
import { VocalAiService } from '../../services/vocal-ai.service';
import { AiService } from '../../services/ai.service';
import { UplinkService } from '../../services/uplink.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UplinkConsoleComponent } from '../../components/uplink-console/uplink-console.component';
import { FormsModule } from '@angular/forms';
import { MicrophoneInterfaceComponent } from '../microphone-interface/microphone-interface.component';
import { AudioSessionService } from '../audio-session.service';
import { PitchCorrectionService } from '../pitch-correction.service';

type ViewMode = 'pipeline' | 'console';
type PipelineStep = 'setup' | 'record' | 'edit' | 'master';

@Component({
  selector: 'app-vocal-suite',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MicrophoneInterfaceComponent,
    UplinkConsoleComponent,
  ],
  templateUrl: './vocal-suite.component.html',
  styleUrls: ['./vocal-suite.component.css'],
})
export class VocalSuiteComponent implements AfterViewInit, OnDestroy {
  public readonly uiService = inject(UIService);
  public readonly micService = inject(MicrophoneService);
  public readonly recordingEngine = inject(StudioRecordingEngineService);
  public readonly mastering = inject(VocalMasteringService);
  public readonly vocalAi = inject(VocalAiService);
  public readonly aiService = inject(AiService);
  public readonly pitchCorrection = inject(PitchCorrectionService);
  private uplinkService = inject(UplinkService);
  private profileService = inject(UserProfileService);
  public readonly audioSession = inject(AudioSessionService);
  showUplink = signal(false);

  @ViewChild('spectrograph') spectrographRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('waveformCanvas') waveformRef!: ElementRef<HTMLCanvasElement>;

  viewMode = signal<ViewMode>('pipeline');
  currentStep = signal<PipelineStep>('setup');

  isBypassed = signal(false);
  activeMasteringTab = signal<'eq' | 'comp' | 'exciter' | 'limiter'>('eq');

  private animationId?: number;
  private ctx2d?: CanvasRenderingContext2D;
  private waveformCtx?: CanvasRenderingContext2D;

  private waveformData: number[] = [];

  recordingTimeFormatted = computed(() => {
    const s = Math.floor(this.recordingEngine.recordingTime());
    const m = Math.floor(s / 60);
    const secs = s % 60;
    const ms = Math.floor((this.recordingEngine.recordingTime() % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  });

  constructor() {
    effect(() => {
      this.mastering.updateNodes();
    });
  }

  ngAfterViewInit() {
    this.initCanvases();
    this.startVisualization();
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  private initCanvases() {
    if (this.spectrographRef) {
      this.ctx2d = this.spectrographRef.nativeElement.getContext('2d')!;
    }
    if (this.waveformRef) {
      this.waveformCtx = this.waveformRef.nativeElement.getContext('2d')!;
    }
  }

  setStep(step: PipelineStep) {
    this.currentStep.set(step);
    if (step === 'record' && !this.recordingEngine.isInitialized()) {
      this.initializeMic();
    }
  }

  async initializeMic() {
    const deviceId = this.micService.selectedDeviceId();
    const success = await this.recordingEngine.initialize(
      deviceId || undefined
    );
    if (success) {
      const node = this.recordingEngine.getAnalyserNode();
      if (node) {
        this.mastering.applyToSource(node);
      }
    }
  }

  toggleRecording() {
    this.audioSession.toggleRecord();
  }

  private startVisualization() {
    const draw = () => {
      this.drawSpectrograph();
      this.drawWaveform();
      this.animationId = requestAnimationFrame(draw);
    };
    draw();
  }

  private drawSpectrograph() {
    const canvas = this.spectrographRef?.nativeElement;
    if (!canvas || !this.ctx2d || !this.recordingEngine.isInitialized()) return;

    const analyser = this.recordingEngine.getAnalyserNode();
    if (!analyser) return;

    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    this.ctx2d.clearRect(0, 0, width, height);

    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * height;
      const gradient = this.ctx2d.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#0d0d0d');
      gradient.addColorStop(0.2, '#ec5b13');
      gradient.addColorStop(0.6, '#a855f7');
      gradient.addColorStop(1, '#10b981');

      this.ctx2d.fillStyle = gradient;
      this.ctx2d.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  private drawWaveform() {
    const canvas = this.waveformRef?.nativeElement;
    if (!canvas || !this.waveformCtx) return;

    const analyser = this.recordingEngine.getAnalyserNode();
    if (this.recordingEngine.isRecording() && analyser) {
      const dataArray = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0 - 1;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      this.waveformData.push(rms);
      if (this.waveformData.length > 500) this.waveformData.shift();
    }

    const width = canvas.width;
    const height = canvas.height;
    this.waveformCtx.clearRect(0, 0, width, height);

    this.waveformCtx.beginPath();
    this.waveformCtx.strokeStyle = '#a855f7';
    this.waveformCtx.lineWidth = 2;

    const step = width / 500;
    for (let i = 0; i < this.waveformData.length; i++) {
      const x = i * step;
      const barH = this.waveformData[i] * height * 2;
      this.waveformCtx.fillStyle = '#a855f7';
      this.waveformCtx.fillRect(
        x,
        (height - barH) / 2,
        step - 1,
        Math.max(2, barH)
      );
    }
    this.waveformCtx.stroke();
  }

  async playTake(take: any) {
    const blobs = await this.recordingEngine['localStorage'].getItem('audio_blobs', take.id);
    if (blobs && blobs.blob) {
      const url = URL.createObjectURL(blobs.blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      void audio.play().catch(() => URL.revokeObjectURL(url));
    }
  }

  async deleteTake(take: any) {
    if (confirm()) {
      this.recordingEngine.takes.update(ts => ts.filter(t => t.id !== take.id));
      await this.recordingEngine['localStorage'].deleteItem('audio_blobs', take.id);
    }
  }

  async downloadRecording() {
    const blob = this.recordingEngine.recordedBlob();
    if (blob) {
      this.showUplink.set(true);
      const success = await this.uplinkService.initiateUplink(
        this.profileService.profile()
      );

      if (success) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SMUVE_Vocal_${Date.now()}.wav`;
        a.click();
      }
    }
  }
}
