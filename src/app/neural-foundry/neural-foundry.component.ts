import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, UpgradeRecommendation } from '../services/ai.service';
import { MainViewMode } from '../services/user-context.service';
import { UIService } from '../services/ui.service';

@Component({
  selector: 'app-neural-foundry',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './neural-foundry.component.html',
  styleUrls: ['./neural-foundry.component.css'],
})
export class NeuralFoundryComponent {
  private orchestrator = inject(AiService);
  private uiService = inject(UIService);

  availableUpgrades = this.orchestrator.availableUpgrades;
  activeCategory = signal<string>('All');

  /**
   * A dismissed recommendation is no longer a next step. The card used to stay
   * visible with an "unlocked" state that only existed in this browser session.
   */
  private visibleUpgrades = computed(() =>
    this.availableUpgrades().filter(
      (upgrade) =>
        !['dismissed', 'not-relevant'].includes(upgrade.state || '')
    )
  );

  /** Extract unique tool types for filter chips. */
  upgradeCategories = computed(() => {
    const types = new Set(this.visibleUpgrades().map((upgrade) => upgrade.type));
    return ['All', ...Array.from(types)];
  });

  /** Filter visible tools by the selected category. */
  filteredUpgrades = computed(() => {
    const cat = this.activeCategory();
    if (cat === 'All') return this.visibleUpgrades();
    return this.visibleUpgrades().filter((upgrade) => upgrade.type === cat);
  });

  /** Open the real workspace tool this card describes. */
  openUpgrade(upgrade: UpgradeRecommendation): void {
    if (upgrade.toolId) {
      this.uiService.navigateToView(upgrade.toolId as MainViewMode);
    }
  }

  /** Report the stored record only; nothing here grants an unlock. */
  stateLabel(upgrade: UpgradeRecommendation): string {
    switch (upgrade.state) {
      case 'completed':
        return 'Completed';
      case 'acquired':
        return 'Marked acquired';
      case 'saved':
        return 'Saved';
      default:
        return 'Suggested';
    }
  }
}
