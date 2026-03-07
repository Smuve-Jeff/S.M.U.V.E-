import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, AdvisorAdvice } from '../../services/ai.service';

@Component({
  selector: 'app-smuve-advisor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smuve-advisor.component.html',
  styleUrls: ['./smuve-advisor.component.css']
})
export class SmuveAdvisorComponent {
  private aiService = inject(AiService);

  advice = this.aiService.advisorAdvice;
  isOpen = signal(false);

  toggleOpen() {
    this.isOpen.update(v => !v);
  }

  getIcon(type: string): string {
    switch (type) {
      case 'strategy': return 'fa-chess-knight';
      case 'technical': return 'fa-microchip';
      case 'career': return 'fa-rocket';
      case 'task': return 'fa-check-circle';
      default: return 'fa-lightbulb';
    }
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'high': return 'border-emerald-500/50 text-emerald-400';
      case 'medium': return 'border-yellow-500/50 text-yellow-400';
      default: return 'border-slate-500/50 text-slate-400';
    }
  }

  handleAction(item: AdvisorAdvice) {
    if (item.action) {
      item.action();
    }
  }
}
