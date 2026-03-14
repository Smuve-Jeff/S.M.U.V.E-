import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIService } from '../../services/ui.service';

@Component({
  selector: 'app-vocal-suite',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vocal-suite.component.html',
  styleUrls: ['./vocal-suite.component.css']
})
export class VocalSuiteComponent {
  public readonly uiService = inject(UIService);

  activeSubView = signal<'vocal-chain' | 'ai-pitch' | 'spatial' | 'analyzer'>('vocal-chain');
  systemLoad = signal({ cpu: 24, ram: 4.2 });
  isBypassed = signal(false);

  // AI Pitch Signals
  correctionSpeed = signal(80);
  humanizeFactor = signal(15);
  currentPitch = signal(440.0);

  // Metering Signals
  loudness = signal(-14.2);
  peakLevel = signal(-0.1);
  pitchDeviation = signal(1.2);

  vocalChainModules = signal([
    { id: 'input', name: 'Titanium Pre-Amp', type: 'Input Stage', value: 45, detail: '+4.2dB' },
    { id: 'dynamics', name: 'FET Compressor', type: 'Dynamics', detail: '4:1 | 0.1ms' },
    { id: 'tone', name: 'Surgical EQ', type: 'Tone', detail: '6/12 Bands' }
  ]);

  setSubView(view: any) {
    this.activeSubView.set(view);
  }

  toggleBypass() {
    this.isBypassed.update(v => !v);
  }
}
