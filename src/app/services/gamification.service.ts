import { Injectable, signal } from '@angular/core';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  timestamp?: number;
}

export interface UserProgress {
  xp: number;
  level: number;
  nextLevelXp: number;
  achievements: Achievement[];
}

@Injectable({
  providedIn: 'root',
})
export class GamificationService {
  private _progress = signal<UserProgress>({
    xp: 0,
    level: 1,
    nextLevelXp: 100,
    achievements: this.getInitialAchievements(),
  });

  readonly progress = this._progress.asReadonly();

  constructor() {}

  addXp(amount: number): void {
    const currentProgress = this._progress();
    const newXp = currentProgress.xp + amount;
    let newLevel = currentProgress.level;
    let nextLevelXp = currentProgress.nextLevelXp;

    while (newXp >= nextLevelXp) {
      newLevel++;
      nextLevelXp = Math.floor(nextLevelXp * 1.5);
    }

    this._progress.set({
      ...currentProgress,
      xp: newXp,
      level: newLevel,
      nextLevelXp,
    });
  }

  unlockAchievement(achievementId: string): void {
    const currentProgress = this._progress();
    const achievement = currentProgress.achievements.find(
      (a) => a.id === achievementId
    );

    if (achievement && !achievement.unlocked) {
      achievement.unlocked = true;
      achievement.timestamp = Date.now();
      this._progress.set({ ...currentProgress });
      this.addXp(50); // Award XP for unlocking an achievement
    }
  }

  private getInitialAchievements(): Achievement[] {
    return [
      {
        id: 'first-track',
        name: 'First Track',
        description: 'Create your first track.',
        unlocked: false,
      },
      {
        id: 'first-collaboration',
        name: 'First Collaboration',
        description: 'Collaborate with another artist.',
        unlocked: false,
      },
      {
        id: 'first-mastering',
        name: 'First Mastering',
        description: 'Master your first track.',
        unlocked: false,
      },
      {
        id: 'first-distribution',
        name: 'First Distribution',
        description: 'Distribute your first track.',
        unlocked: false,
      },
      {
        id: 'level-5',
        name: 'Level 5',
        description: 'Reach level 5.',
        unlocked: false,
      },
      {
        id: 'level-10',
        name: 'Level 10',
        description: 'Reach level 10.',
        unlocked: false,
      },
    ];
  }
}
