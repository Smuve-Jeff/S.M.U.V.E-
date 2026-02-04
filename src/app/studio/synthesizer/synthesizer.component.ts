import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Clip } from '../instrument.service';

@Component({
  selector: 'app-synthesizer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './synthesizer.component.html',
  styleUrls: ['./synthesizer.component.css']
})
export class SynthesizerComponent implements OnInit {
  @Input() clip!: Clip;

  // Default synthesizer parameters
  synthParams = {
    oscillator: 'sine',
    attack: 0.01,
    decay: 0.2,
    sustain: 0.5,
    release: 1.0
  };

  constructor() { }

  ngOnInit(): void {
    if (this.clip && this.clip.synthParams) {
      this.synthParams = { ...this.synthParams, ...this.clip.synthParams };
    }
  }

  updateSynthParam(param: string, value: any) {
    this.synthParams[param] = value;
    // Here you would typically update the audio node in real-time
    console.log(`Updated ${param}: ${value}`);
    // This is where you would also save the changes to the clip
    this.clip.synthParams = this.synthParams;
  }
}
