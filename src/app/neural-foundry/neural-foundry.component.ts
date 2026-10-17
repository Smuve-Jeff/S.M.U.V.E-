import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, UpgradeRecommendation } from '../services/ai.service';

@Component({
  selector: 'app-neural-foundry',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './neural-foundry.component.html',
  styleUrls: ['./neural-foundry.component.css'],
})
export class NeuralFoundryComponent {
  private orchestrator = inject(AiService);

  availableUpgrades = this.orchestrator.availableUpgrades;
  isProcessing = this.orchestrator.isProcessing;
  activeCategory = signal<string>('All');

  /** Extract unique upgrade types for filter chips */
  upgradeCategories = computed(() => {
    const types = new Set(this.availableUpgrades().map((u) => u.type));
    return ['All', ...Array.from(types)];
  });

  /** Filtered upgrades based on active category */
  filteredUpgrades = computed(() => {
    const cat = this.activeCategory();
    if (cat === 'All') return this.availableUpgrades();
    return this.availableUpgrades().filter((u) => u.type === cat);
  });

  unlock(upgrade: UpgradeRecommendation) {
    if (upgrade.state === ('locked' as any)) {
      this.orchestrator.unlockUpgrade(upgrade.id);
    }
  }

  getUpgradeStatus(upgrade: UpgradeRecommendation): string {
    if (upgrade.state === ('unlocked' as any)) return '[ UNLOCKED ]';
    if (this.isProcessing() && this.orchestrator.isProcessing())
      return '[ PROCESSING ]';
    return `[ ${upgrade.cost} ]`;
  }
}
