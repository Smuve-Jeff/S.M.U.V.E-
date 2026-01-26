import { Injectable, signal } from '@angular/core';

export interface ReputationState {
  level: number;
  xp: number;
  totalXp: number;
  title: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReputationService {
  private readonly XP_PER_LEVEL = 1000;

  state = signal<ReputationState>({
    level: 1,
    xp: 0,
    totalXp: 0,
    title: 'Novice Producer',
  });

  addXp(amount: number): void {
    this.state.update((s) => {
      let newXp = s.xp + amount;
      let newLevel = s.level;
      const newTotalXp = s.totalXp + amount;

      while (newXp >= this.XP_PER_LEVEL) {
        newXp -= this.XP_PER_LEVEL;
        newLevel++;
      }

      return {
        ...s,
        xp: newXp,
        level: newLevel,
        totalXp: newTotalXp,
        title: this.calculateTitle(newLevel),
      };
    });
  }

  private calculateTitle(level: number): string {
    if (level >= 50) return 'Legendary Strategic Commander';
    if (level >= 30) return 'Platinum Architect';
    if (level >= 20) return 'Studio Maestro';
    if (level >= 10) return 'Rising Talent';
    return 'Novice Producer';
  }
}
