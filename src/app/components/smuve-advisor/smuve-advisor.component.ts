import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService } from '../../services/ai.service';
import { AdvisorAdvice } from '../../types/ai.types';

@Component({
  selector: 'app-smuve-advisor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smuve-advisor.component.html',
  styleUrls: ['./smuve-advisor.component.css'],
})
export class SmuveAdvisorComponent {
  private aiService = inject(AiService);

  advice = this.aiService.advisorAdvice;
  isOpen = signal(false);

  toggleOpen() {
    this.isOpen.update((v) => !v);
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'URGENT':
        return 'border-red-500/40 bg-red-500/10';
      case 'HIGH':
        return 'border-orange-500/40 bg-orange-500/10';
      case 'MEDIUM':
        return 'border-yellow-500/40 bg-yellow-500/10';
      default:
        return 'border-emerald-500/40 bg-emerald-500/10';
    }
  }

  getIcon(type: string): string {
    switch (type) {
      case 'Marketing':
        return 'fa-bullhorn';
      case 'Production':
        return 'fa-sliders';
      case 'Identity':
        return 'fa-fingerprint';
      case 'Release':
        return 'fa-rocket';
      default:
        return 'fa-circle-info';
    }
  }

  handleAction(item: AdvisorAdvice) {
    console.log('Advisor Action Executed:', item.title);
  }
}
