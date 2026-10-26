import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { AdvisorAdvice } from '../../types/ai.types';
import { UserContextService } from '../../services/user-context.service';
import { CommandPaletteService } from '../../services/command-palette.service';
import {
  ArtistLifecycleAlertService,
  LifecycleAlert,
} from '../../services/artist-lifecycle-alert.service';

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
export class SmuveAdvisorComponent implements OnInit {
  private aiService = inject(AiService);
  private userContext = inject(UserContextService);
  private router = inject(Router);
  private commandPalette = inject(CommandPaletteService);
  private lifecycleAlerts = inject(ArtistLifecycleAlertService);

  advice = this.aiService.advisorAdvice;

  /**
   * Transitions the lifecycle watcher observed. These sit beside the standing
   * advice so the artist can tell "what to do" from "what changed", and each
   * one carries the snapshot values that raised it.
   */
  transitions = this.lifecycleAlerts.alerts;
  isOpen = signal(false);

  ngOnInit() {
    // Populate from the lifecycle before the artist opens the panel, so the
    // advisor has an evidence-backed recommendation ready instead of an empty
    // shell that only fills in after a manual refresh.
    this.refreshAdvice();
  }

  /**
   * Toggles the visibility of the advisor panel. Opening it re-reads the
   * lifecycle so advice reflects work done since the panel last closed.
   */
  toggleOpen() {
    const opening = !this.isOpen();
    if (opening) this.refreshAdvice();
    this.isOpen.set(opening);
  }

  /**
   * Rebuilds the advice queue from the current lifecycle snapshot: the primary
   * evidence-backed next move, any blocked phases, and release-readiness gaps.
   */
  refreshAdvice() {
    this.aiService.refreshAdvisorAdvice?.();
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
   * Dismisses a piece of advice (removes it from the active queue).
   * @param item The AdvisorAdvice object to dismiss.
   */
  dismissAdvice(item: AdvisorAdvice) {
    // Prefer the service so the dismissal survives the next lifecycle refresh;
    // the local update keeps the drawer correct if a host provides no service.
    this.aiService.dismissAdvisorAdvice?.(item.id);
    this.aiService.advisorAdvice.update((list) =>
      list.filter((candidate) => candidate?.id !== item.id)
    );
  }

  trackById(_index: number, item: AdvisorAdvice): string | number {
    return item?.id ?? _index;
  }

  trackAlertId(_index: number, alert: LifecycleAlert): string {
    return alert.id;
  }

  /** Opens the workspace that owns the change, then closes the drawer. */
  openTransition(alert: LifecycleAlert): void {
    this.lifecycleAlerts.dismiss(alert.id);
    this.isOpen.set(false);
    this.router.navigateByUrl(alert.actionRoute);
  }

  dismissTransition(id: string): void {
    this.lifecycleAlerts.dismiss(id);
  }
}
