import {
  Component,
  inject,
  signal,
  computed,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudioRecordingEngineService } from '../studio-recording-engine.service';
import { RecordingLimiterService } from '../recording-limiter.service';
import { WaveformRendererComponent } from '../waveform-renderer/waveform-renderer.component';

@Component({
  selector: 'app-recording-waveform',
  standalone: true,
  imports: [CommonModule, WaveformRendererComponent],
  templateUrl: './recording-waveform.component.html',
  styleUrls: ['./recording-waveform.component.css'],
})
export class RecordingWaveformComponent implements OnDestroy {
  private readonly recordingEngine = inject(StudioRecordingEngineService);
  private readonly limiter = inject(RecordingLimiterService);

  isRecording = this.recordingEngine.isRecording;
  recordingTime = this.recordingEngine.recordingTime;

  /** Rolling live PCM fed to the waveform renderer while capturing. */
  waveformData = signal<Float32Array | null>(null);

  /** Headroom meter / limiting state sourced from the limiter service. */
  headroomPercent = this.limiter.headroomPercent;
  peakInputDb = this.limiter.peakInputDb;
  isLimiting = this.limiter.isLimitingActive;
  limiterEnabled = this.limiter.enabled;

  /** Captured length in seconds (drives the waveform playhead/width). */
  durationSeconds = computed(() => this.recordingEngine.recordingTime());

  recordingTimeFormatted = computed(() => {
    const totalSeconds = Math.floor(this.recordingTime());
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const tenths = Math.floor((this.recordingTime() % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}.${tenths}`;
  });

  private raf: number | null = null;
  private lastUpdate = 0;
  private static readonly FRAME_BUDGET_MS = 33; // ~30fps
  private sampleBuf = new Float32Array(0);
  private readonly capSamples = 48000 * 20; // keep last 20s of live waveform

  ngAfterViewInit() {
    this.startSampling();
  }

  ngOnDestroy() {
    this.stopSampling();
  }

  resetWaveform() {
    this.sampleBuf = new Float32Array(0);
    this.waveformData.set(null);
  }

  toggleLimiter() {
    this.limiter.setEnabled(!this.limiter.enabled());
  }

  private startSampling() {
    if (this.raf !== null) return;
    const frame = new Float32Array(2048);
    const tick = (timestamp: number) => {
      if (timestamp - this.lastUpdate >= RecordingWaveformComponent.FRAME_BUDGET_MS) {
        const analyser = this.recordingEngine.getAnalyserNode();
        if (this.recordingEngine.isRecording() && analyser) {
          analyser.getFloatTimeDomainData(frame);
          this.appendSamples(frame);
        } else if (!this.recordingEngine.isRecording() && this.sampleBuf.length > 0) {
          // Keep the final captured waveform visible after stopping.
          this.waveformData.set(this.sampleBuf);
        }
        this.lastUpdate = timestamp;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopSampling() {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private appendSamples(frame: Float32Array) {
    let newLen = this.sampleBuf.length + frame.length;
    if (newLen > this.capSamples) {
      newLen = this.capSamples;
    }
    const next = new Float32Array(newLen);
    const from = Math.max(0, this.sampleBuf.length - (newLen - frame.length));
    const copied = Math.min(this.sampleBuf.length - from, newLen - frame.length);
    if (copied > 0) next.set(this.sampleBuf.subarray(from, from + copied));
    next.set(frame, copied);
    this.sampleBuf = next;
    this.waveformData.set(next);
  }
}