import { LoggingService } from '../../services/logging.service';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Clip } from '../instrument.service';
import { AudioEngineService } from '../../services/audio-engine.service';

@Component({
  selector: 'app-synthesizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './synthesizer.component.html',
  styleUrls: ['./synthesizer.component.css'],
})
export class SynthesizerComponent implements OnInit {
  private logger = inject(LoggingService);
  private audioEngine = inject(AudioEngineService);
  @Input() clip!: Clip;

  // Default synthesizer parameters
  synthParams: any = {
    oscillator: 'sawtooth' as OscillatorType,
    subOsc: true,
    subType: 'sine' as OscillatorType,
    subGain: 0.3,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.5,
    release: 0.8,
    cutoff: 2000,
    q: 1,
    distortion: 0.1,
  };

  constructor() {}

  ngOnInit(): void {
    if (this.clip && this.clip.synthParams) {
      this.synthParams = { ...this.synthParams, ...this.clip.synthParams };
    }
  }

  updateSynthParam(param: string, value: any) {
    this.synthParams[param] = value;
    this.logger.info(`Updated ${param}: ${value}`);
    if (this.clip) {
      this.clip.synthParams = { ...this.synthParams };
    }

    if (param === 'distortion') {
      this.audioEngine.setSaturation(value);
    }
  }
}
