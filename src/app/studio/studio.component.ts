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
import { UIService } from '../services/ui.service';
import { SynthesizerComponent } from './synthesizer/synthesizer.component';
import { VocalSuiteComponent } from './vocal-suite/vocal-suite.component';

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
    WaveformRendererComponent,
    SynthesizerComponent,
    VocalSuiteComponent
  ],
  templateUrl: './studio.component.html',
  styleUrls: ['./studio.component.css']
})
export class StudioComponent implements OnInit, OnDestroy, AfterViewInit {
  public readonly audioSession = inject(AudioSessionService);
  public readonly audioEngine = inject(AudioEngineService);
  public readonly aiService = inject(AiService);
  public readonly uiService = inject(UIService);
  private readonly route = inject(ActivatedRoute);
  public readonly musicManager = inject(MusicManagerService);

  activeView = signal<'dj' | 'piano-roll' | 'mixer' | 'performance' | 'mastering' | 'vocal-suite'>('dj');
  showMixer = signal(true);
  showRack = signal(true);
  showPianoRoll = signal(false);

  isRecording = this.audioSession.isRecording;

  private animationId: number | null = null;

  ngOnInit() {
    this.route.url.subscribe(url => {
      const path = url[0]?.path;
      if (path === 'dj' || path === 'mixer' || path === 'piano-roll' || path === 'vocal-suite') {
        this.activeView.set(path as any);
      }
    });
  }

  ngAfterViewInit() {}

  ngOnDestroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  constructor() {
    effect(() => {
      const selectedId = this.musicManager.selectedTrackId();
      if (selectedId) {
        if (this.activeView() !== 'dj') {
          this.showPianoRoll.set(true);
        }
      }
    });
  }
}
