import { Component, signal, inject, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { MixerComponent } from './mixer/mixer.component';
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { MasterControlsComponent } from './master-controls/master-controls.component';
import { AudioEngineService } from '../services/audio-engine.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AiService } from '../services/ai.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    CommonModule,
    TransportBarComponent,
    ArrangementViewComponent,
    ChannelRackComponent,
    MixerComponent,
    DjDeckComponent,
    PianoRollComponent,
    MasterControlsComponent
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css']
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  private audioEngine = inject(AudioEngineService);
  private musicManager = inject(MusicManagerService);
  public aiService = inject(AiService);
  private route = inject(ActivatedRoute);

  activeView = signal<'daw' | 'dj' | 'mastering'>('daw');
  showRack = signal(true);
  showMixer = signal(true);
  showPianoRoll = signal(false);
  currentDecree = signal<any | null>(null);

  private animFrame: number | null = null;

  ngOnInit() {
    this.route.url.subscribe(segments => {
      const path = segments[0]?.path;
      if (path === 'dj') this.activeView.set('dj');
    });

    const decrees = this.aiService.strategicDecrees();
    if (decrees.length > 0) {
      this.currentDecree.set(decrees[0]);
    }
  }

  ngAfterViewInit() {
    this.startMasterAnalysis();
  }

  private startMasterAnalysis() {
    const canvas = document.getElementById('masterAnalyzerCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = this.audioEngine.getAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (this.activeView() === 'mastering') {
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillStyle = `rgba(244, 133, 37, ${dataArray[i] / 255 + 0.1})`;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      }
      this.animFrame = requestAnimationFrame(draw);
    };
    draw();
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  toggleView(view: 'daw' | 'dj' | 'mastering') {
    this.activeView.set(view);
  }

  executeMastering() {
  }
}
