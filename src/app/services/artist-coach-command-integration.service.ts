import { Injectable, effect, inject } from '@angular/core';
import { CommandPaletteService, CommandPaletteAction } from './command-palette.service';
import { ArtistAiCoachService } from './artist-ai-coach.service';
import { ArtistCareerExpansionService } from './artist-career-expansion.service';
import { UIService } from './ui.service';

/** Reactive coaching actions using the same palette contract as every workspace. */
@Injectable({ providedIn: 'root' })
export class ArtistCoachCommandIntegrationService {
  private palette = inject(CommandPaletteService);
  private coach = inject(ArtistAiCoachService);
  private career = inject(ArtistCareerExpansionService);
  private ui = inject(UIService);

  constructor() {
    effect(() => {
      const state = this.coach.coachState();
      const expanded = this.career.expandedAdaptationState();
      const actions: CommandPaletteAction[] = [
        { id: 'coach-release-strategy', label: 'Coach: Next Release Strategy', description: state.personalized.releaseStrategy.nextRelease.strategy, category: 'Artist', run: () => this.ui.navigateToView('artist-coach') },
        { id: 'coach-brand-identity', label: 'Coach: Brand & Positioning', description: expanded.brandIdentity.voiceTone, category: 'Artist', run: () => this.ui.navigateToView('adaptive-profile') },
        { id: 'coach-live-strategy', label: 'Coach: Live Booking Strategy', description: expanded.liveBookingStrategy.revenueModel, category: 'Artist', run: () => this.ui.navigateToView('artist-coach') },
        ...state.personalized.prioritizedActions.slice(0, 3).map((action, i) => ({ id: `coach-action-${i}`, label: `Coach: ${action}`, description: `Profile-derived priority ${i + 1}`, category: 'Artist', run: () => this.ui.navigateToView('artist-coach') })),
      ];
      this.palette.setExtensionActions('artist-coach', actions);
    });
  }
}
