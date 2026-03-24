import { Component, signal, inject, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';

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

  currentTick = signal(0);
  metronomeActive = signal(false);
  private metronomeInterval: any;

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
      this.metronomeInterval = setInterval(() => {
        this.currentTick.update((t) => (t + 1) % 4);
      }, 500);
    } else {
      clearInterval(this.metronomeInterval);
      this.currentTick.set(0);
    }
  }

  acquireUpgrade(upgrade: any) {
    this.profileService.acquireUpgrade({
      title: upgrade.title,
      type: upgrade.type,
    });
  }

  ngOnDestroy() {
    if (this.metronomeInterval) clearInterval(this.metronomeInterval);
  }
}
