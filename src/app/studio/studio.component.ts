import { Component, inject, signal, effect, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TransportBarComponent } from './transport-bar/transport-bar.component';
import { MixerComponent } from './mixer/mixer.component';
import { MasterControlsComponent } from './master-controls/master-controls.component';
import { DjDeckComponent } from './dj-deck/dj-deck.component';
import { ChannelRackComponent } from './channel-rack/channel-rack.component';
import { ArrangementViewComponent } from './arrangement-view/arrangement-view.component';
import { PianoRollComponent } from './piano-roll/piano-roll.component';
import { WaveformRendererComponent } from './waveform-renderer/waveform-renderer.component';
import { AudioSessionService } from './audio-session.service';
import { MusicManagerService } from '../services/music-manager.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AiService } from '../services/ai.service';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [
    CommonModule,
    TransportBarComponent,
    MixerComponent,
    MasterControlsComponent,
    DjDeckComponent,
    ChannelRackComponent,
    ArrangementViewComponent,
    PianoRollComponent,
    WaveformRendererComponent
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css']
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly audioSession = inject(AudioSessionService);
  private readonly audioEngine = inject(AudioEngineService);
  private readonly aiService = inject(AiService);
  private readonly route = inject(ActivatedRoute);
  public readonly musicManager = inject(MusicManagerService);

  activeView = signal<'daw' | 'dj' | 'mastering'>('daw');
  showMixer = signal(true);
  showRack = signal(true);
  showPianoRoll = signal(false);
  showDecreePanel = signal(false);

  isRecording = this.audioSession.isRecording;
  currentDecree = signal<string>("Awaiting Strategic Signal Analysis...");

  private animationId: number | null = null;

  ngOnInit() {
    this.route.url.subscribe(url => {
      const path = url[0]?.path;
      if (path === 'dj') {
        this.activeView.set('dj');
      } else if (path === 'mastering') {
        this.activeView.set('mastering');
      } else {
        this.activeView.set('daw');
      }
    });

    // Initial decree
    setTimeout(() => {
        this.currentDecree.set("COMMAND: Identify your target frequency range immediately. Amateur hour is over.");
    }, 2000);
  }

  ngAfterViewInit() {
    this.startAnalyzer();
  }

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  constructor() {
    effect(() => {
      const selectedId = this.musicManager.selectedTrackId();
      if (selectedId) {
        this.showPianoRoll.set(true);
      }
    });
  }

  toggleView(view: 'daw' | 'dj' | 'mastering') {
    this.activeView.set(view);
    if (view === 'mastering') {
        setTimeout(() => this.startAnalyzer(), 100);
    }
  }

  private startAnalyzer() {
    const canvas = document.getElementById('masterAnalyzerCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = this.audioEngine.getMasterAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (this.activeView() !== 'mastering') return;

      this.animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const width = canvas.width = canvas.clientWidth;
      const height = canvas.height = canvas.clientHeight;

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
        gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.4)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.8)');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();
  }

  executeMastering() {
      this.currentDecree.set("ANALYZING... SIGNAL COMPRESSION RATIOS OPTIMIZED. PEAK CEILING LOCKED AT -0.2DB.");
      this.audioEngine.configureCompressor({
          threshold: -18,
          ratio: 3.5,
          attack: 0.003,
          release: 0.1
      });
      this.audioEngine.configureLimiter({
          ceiling: -0.2,
          release: 0.05
      });
      alert("STRATEGIC DECREE: Audio signals have been optimized for maximum industry impact.");
  }

  generateNewDecree() {
      const decrees = [
          "STRATEGIC DECREE: Your low-end is muddy. Cut everything below 30Hz or face obsolescence.",
          "COMMAND: The vocal transients are weak. Apply aggressive compression immediately.",
          "INTELLIGENCE: High-frequency saturation detected. This is a bold maneuver. Continue.",
          "DECREE: Silence is your strongest weapon. Use it more effectively in the breakdown.",
          "TACTICAL ADVICE: The stereo field is cluttered. Move your percussion to the periphery."
      ];
      const random = decrees[Math.floor(Math.random() * decrees.length)];
      this.currentDecree.set(random);
  }
}
