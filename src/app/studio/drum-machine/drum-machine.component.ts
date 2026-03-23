import { Component, inject, signal, effect, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AiService } from '../../services/ai.service';
import { LoggingService } from '../../services/logging.service';

interface DrumPad {
  id: string;
  name: string;
  type: 'kick' | 'snare' | 'hihat' | 'bass' | 'clap' | 'tom' | 'rim' | 'crash';
  color: string;
  active: boolean;
  params: any;
}

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './drum-machine.component.html',
  styleUrls: ['./drum-machine.component.css']
})
export class DrumMachineComponent implements AfterViewInit {
  private readonly audioEngine = inject(AudioEngineService);
  private readonly aiService = inject(AiService);
  private readonly logger = inject(LoggingService);

  pads = signal<DrumPad[]>([
    { id: 'p1', name: 'KICK', type: 'kick', color: '#ec5b13', active: false, params: { pitch: 150, decay: 0.5, gain: 1.0, punch: 0.5 } },
    { id: 'p2', name: 'SNARE', type: 'snare', color: '#a855f7', active: false, params: { frequency: 250, decay: 0.2, gain: 0.8, snap: 0.6 } },
    { id: 'p3', name: 'HI-HAT (C)', type: 'hihat', color: '#10b981', active: false, params: { frequency: 10000, decay: 0.1, gain: 0.5, crispness: 0.8 } },
    { id: 'p4', name: 'BASS', type: 'bass', color: '#d946ef', active: false, params: { frequency: 55, decay: 0.3, gain: 0.9, sub: 0.7 } },
    { id: 'p5', name: 'CLAP', type: 'snare', color: '#ec5b13', active: false, params: { frequency: 1200, decay: 0.15, gain: 0.7, width: 0.5 } },
    { id: 'p6', name: 'TOM', type: 'kick', color: '#a855f7', active: false, params: { pitch: 100, decay: 0.4, gain: 0.8, thump: 0.4 } },
    { id: 'p7', name: 'RIM', type: 'hihat', color: '#10b981', active: false, params: { frequency: 5000, decay: 0.05, gain: 0.6, click: 0.9 } },
    { id: 'p8', name: 'CRASH', type: 'hihat', color: '#d946ef', active: false, params: { frequency: 8000, decay: 1.5, gain: 0.4, shimmer: 0.6 } },
  ]);

  selectedPad = signal<DrumPad | null>(this.pads()[0]);

  @ViewChild('visualizer') visualizerRef!: ElementRef<HTMLCanvasElement>;

  ngAfterViewInit() {
    this.startVisualizer();
  }

  selectPad(pad: DrumPad) {
    this.selectedPad.set(pad);
  }

  triggerPad(pad: DrumPad) {
    pad.active = true;
    setTimeout(() => pad.active = false, 100);

    const ctx = this.audioEngine.ctx;
    const startTime = ctx.currentTime;
    const dest = this.audioEngine.masterGain;
    const p = pad.params;

    if (pad.type === 'kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(dest);
      osc.frequency.setValueAtTime(p.pitch, startTime);
      osc.frequency.exponentialRampToValueAtTime(0.01, startTime + p.decay);
      gain.gain.setValueAtTime(p.gain, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + p.decay);
      osc.start(startTime);
      osc.stop(startTime + p.decay);

      // Punch component (Transient)
      if (p.punch > 0) {
          const punchOsc = ctx.createOscillator();
          const punchGain = ctx.createGain();
          punchOsc.connect(punchGain);
          punchGain.connect(dest);
          punchOsc.frequency.setValueAtTime(400, startTime);
          punchOsc.frequency.exponentialRampToValueAtTime(100, startTime + 0.02);
          punchGain.gain.setValueAtTime(p.punch * p.gain, startTime);
          punchGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.02);
          punchOsc.start(startTime);
          punchOsc.stop(startTime + 0.02);
      }
    } else if (pad.type === 'snare') {
      // Noise component
      const bufferSize = ctx.sampleRate * p.decay;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000 + (p.snap * 2000);
      const noiseGain = ctx.createGain();
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(dest);
      noiseGain.gain.setValueAtTime(p.gain, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, startTime + p.decay);
      noise.start(startTime);

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(oscGain);
      oscGain.connect(dest);
      osc.frequency.setValueAtTime(p.frequency, startTime);
      oscGain.gain.setValueAtTime(p.gain * 0.5, startTime);
      oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + p.decay);
      osc.start(startTime);
      osc.stop(startTime + p.decay);
    } else if (pad.type === 'hihat') {
      const bufferSize = ctx.sampleRate * p.decay;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = p.frequency;
      bandpass.Q.value = 5 + (p.crispness * 10);
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 7000;
      const gain = ctx.createGain();
      noise.connect(bandpass);
      bandpass.connect(highpass);
      highpass.connect(gain);
      gain.connect(dest);
      gain.gain.setValueAtTime(p.gain * 0.5, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + p.decay);
      noise.start(startTime);
    } else if (pad.type === 'bass') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 * (1 + p.sub), startTime);
      filter.frequency.exponentialRampToValueAtTime(100, startTime + p.decay);
      osc.connect(filter).connect(gain).connect(dest);
      osc.frequency.setValueAtTime(p.frequency, startTime);
      gain.gain.setValueAtTime(p.gain * 0.8, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + p.decay);
      osc.start(startTime);
      osc.stop(startTime + p.decay);
    }
  }

  private startVisualizer() {
    const canvas = this.visualizerRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const analyser = this.audioEngine.getMasterAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2;
        const r = 236;
        const g = 91 + (dataArray[i] / 2);
        const b = 19 + (dataArray[i] / 4);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
  }
}
