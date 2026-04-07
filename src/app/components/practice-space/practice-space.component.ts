import { Component, signal, inject, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { AudioEngineService } from '../../services/audio-engine.service';

@Component({
  selector: 'app-practice-space',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './practice-space.component.html',
  styleUrls: ['./practice-space.component.css'],
})
export class PracticeSpaceComponent implements OnDestroy {
  public profileService = inject(UserProfileService);
  public aiService = inject(AiService);
  public uiService = inject(UIService);
  private audioEngine = inject(AudioEngineService);

  currentTick = signal(0);
  metronomeActive = signal(false);
  metronomeBpm = signal(120);
  metronomeAudioEnabled = signal(true);
  private metronomeInterval: any;
  private audioContext: AudioContext | null = null;

  recommendedUpgrades = computed(() =>
    this.aiService.getUpgradeRecommendations().slice(0, 3)
  );

  protocols = signal<any[]>([
    {
      id: '1',
      title: 'Vocal Resonance',
      category: 'VOCAL',
      duration: '10m',
      description: 'Focus on harmonic placement.',
      icon: 'fa-microphone',
      difficulty: 'Intermediate',
    },
    {
      id: '2',
      title: 'Stage Presence',
      category: 'PERFORMANCE',
      duration: '15m',
      description: 'Choreographed energy control.',
      icon: 'fa-walking',
      difficulty: 'Advanced',
    },
    {
      id: '3',
      title: 'Lyric Memory',
      category: 'COGNITIVE',
      duration: '5m',
      description: 'Rapid recall drill.',
      icon: 'fa-brain',
      difficulty: 'Expert',
    },
  ]);

  toggleMetronome() {
    this.metronomeActive.update((v) => !v);
    if (this.metronomeActive()) {
      const bpm = Math.max(40, Math.min(240, this.metronomeBpm()));
      const intervalMs = 60000 / bpm;
      let beatCount = 0;
      this.metronomeInterval = setInterval(() => {
        this.currentTick.update((t) => (t + 1) % 4);
        if (this.metronomeAudioEnabled()) {
          this.playMetronomeClick(beatCount % 4 === 0);
        }
        beatCount++;
      }, intervalMs);
    } else {
      clearInterval(this.metronomeInterval);
      this.currentTick.set(0);
    }
  }

  private playMetronomeClick(isDownbeat: boolean) {
    if (!this.audioContext) {
      this.audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    }

    const ctx = this.audioContext;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const vca = ctx.createGain();

    // Higher pitch for downbeat
    osc.frequency.value = isDownbeat ? 1200 : 800;
    osc.type = 'sine';

    const now = ctx.currentTime;
    vca.gain.setValueAtTime(0, now);
    vca.gain.linearRampToValueAtTime(0.5, now + 0.002);
    vca.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(vca).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  updateBpm(event: Event) {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(val) && val >= 40 && val <= 240) {
      this.metronomeBpm.set(val);
      // Restart metronome if active to apply new BPM
      if (this.metronomeActive()) {
        this.toggleMetronome();
        this.toggleMetronome();
      }
    }
  }

  toggleMetronomeAudio() {
    this.metronomeAudioEnabled.update((v) => !v);
  }

  acquireUpgrade(upgrade: any) {
    this.profileService.acquireUpgrade({
      title: upgrade.title,
      type: upgrade.type,
    });
  }

  ngOnDestroy() {
    if (this.metronomeInterval) clearInterval(this.metronomeInterval);
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
