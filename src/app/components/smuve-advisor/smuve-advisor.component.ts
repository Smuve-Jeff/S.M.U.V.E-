import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { AdvisorAdvice } from '../../types/ai.types';
import { UserContextService } from '../../services/user-context.service';
import { CommandPaletteService } from '../../services/command-palette.service';

// We assume AdvisorAdvice might have a structure like this:
// export interface AdvisorAdvice {
//   id: string;
//   title: string;
//   description: string;
//   priority: 'high' | 'medium' | 'low';
//   action?: {
//     type: 'navigate' | 'command';
//     payload: string;
//   };
// }

@Component({
  selector: 'app-smuve-advisor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smuve-advisor.component.html',
  styleUrls: ['./smuve-advisor.component.css'],
})
export class SmuveAdvisorComponent {
  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  private router = inject(Router);
  private commandPalette = inject(CommandPaletteService);

  advice = this.aiService.advisorAdvice;
  isOpen = signal(false);

  /**
   * Toggles the visibility of the advisor panel.
   */
  toggleOpen() {
    this.isOpen.update((v) => !v);
  }

  /**
   * Requests a new set of advice from the AI service.
   * This method is a placeholder and assumes a corresponding method exists on AiService.
   */
  refreshAdvice() {
    // Assuming aiService has a method to refresh advice
    // this.aiService.refreshAdvisorAdvice();
  }

  /**
   * Determines the display color based on advice priority.
   * @param priority The priority level ('high', 'medium', or other).
   * @returns Tailwind CSS classes for color and background.
   */
  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high':
        return 'text-red-400 border-red-400/30 bg-red-400/10';
      case 'medium':
        return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
      default:
        return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10';
    }
  }

  /**
   * Executes a suggested action from an advice item.
   * This implementation assumes the 'action' property structure on AdvisorAdvice.
   * @param item The AdvisorAdvice object containing the action.
   */
  executeAction(item: AdvisorAdvice) {
    // Casting to `any` because the 'action' property is an assumption.
    const action = (item as any).action;

    if (!action) {
      return;
    }

    switch (action.type) {
      case 'navigate':
        this.router.navigate([action.payload]);
        break;
      case 'command':
        this.commandPalette.executeCommandById(action.payload);
        break;
      default:
        console.warn(`Unknown advisor action type: ${action.type}`);
    }

    // After executing, hide the panel and potentially dismiss the advice.
    this.isOpen.set(false);
    this.dismissAdvice(item);
  }

  /**
   * Dismisses a piece of advice.
   * This method is a placeholder and assumes a corresponding method exists on AiService.
   * @param item The AdvisorAdvice object to dismiss.
   */
  dismissAdvice(item: AdvisorAdvice) {
    // Assuming aiService can handle dismissing advice.
    // this.aiService.dismissAdvisorAdvice((item as any).id);
  }
}
