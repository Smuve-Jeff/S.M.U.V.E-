import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserProfileService } from '../services/user-profile.service';
import { UIService, MainViewMode } from '../services/ui.service';
import { AiService } from '../services/ai.service';
import { AudioEngineService } from '../services/audio-engine.service';
import { AfterViewInit } from '@angular/core';
import { NotificationService } from '../services/notification.service';
import { PlayerService } from '../services/player.service';
import { SafePipe } from '../shared/pipes/safe.pipe';

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SafePipe],
  templateUrl: './hub.component.html',
  styleUrls: ['./hub.component.css'],
})
export class HubComponent implements OnInit, OnDestroy, AfterViewInit {
  private router = inject(Router);
  public uiService = inject(UIService);
  public profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  private audioEngine = inject(AudioEngineService);
  private notificationService = inject(NotificationService);
  public playerService = inject(PlayerService);

  private animFrame: number | null = null;
  visualizerData = signal<number[]>(new Array(60).fill(10));

  currentDecree = computed(() => {
    const decrees = this.aiService.strategicDecrees();
    return decrees.length > 0 ? decrees[0] : null;
  });

  constructor() {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.startVisualizer();
  }

  private startVisualizer() {
    const analyser = this.audioEngine.getAnalyser();
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      if (this.playerService.isPlaying()) {
        analyser.getByteFrequencyData(dataArray);

        const newData = [];
        const step = Math.floor(bufferLength / 60);
        for (let i = 0; i < 60; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          const average = sum / step;
          newData.push(Math.max(10, (average / 255) * 100));
        }
        this.visualizerData.set(newData);
      } else {
        const idle = this.visualizerData().map(v => Math.max(10, v * 0.95 + Math.random() * 4));
        this.visualizerData.set(idle);
      }
      this.animFrame = requestAnimationFrame(update);
    };
    update();
  }

  navigateToLink(id: string) {
    this.uiService.navigateToView(id as any);
  }

  ngOnDestroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}
