import { Injectable, effect, inject } from '@angular/core';
import {
  CommandPaletteService,
  CommandPaletteAction,
} from './command-palette.service';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import { UserProfileService } from './user-profile.service';
import { UIService } from './ui.service';
import { LIFECYCLE_PHASE_LABEL } from '../types/artist-lifecycle.types';
import type { ReleaseProject } from '../types/release.types';

/**
 * Publishes the lifecycle's live state into the command palette: the one move
 * the pathway ranks first, and the phases that cannot advance.
 *
 * These are the same snapshot values the Hub recommends, so the palette can
 * never offer a different next move than the rest of the app. Blocked phases
 * are listed as what they are — dependencies, not tasks — and the action opens
 * the pathway where the blocking step can actually be completed.
 */
@Injectable({ providedIn: 'root' })
export class ArtistLifecycleCommandIntegrationService {
  private palette = inject(CommandPaletteService);
  private lifecycle = inject(ArtistLifecycleService);
  private profileService = inject(UserProfileService);
  private ui = inject(UIService);

  constructor() {
    effect(() => {
      const profile = this.profileService.profile();
      const release =
        (profile.knowledgeBase as { currentRelease?: ReleaseProject } | undefined)
          ?.currentRelease ?? null;
      const snapshot = this.lifecycle.snapshot(profile, release);
      const actions: CommandPaletteAction[] = [];

      const move = snapshot.nextBestMove;
      if (move) {
        actions.push({
          id: 'lifecycle-next-move',
          label: `Next move: ${move.title}`,
          description: `${move.action} — ${LIFECYCLE_PHASE_LABEL[move.phase]}`,
          category: 'Lifecycle',
          keywords: ['next', 'move', 'lifecycle', 'pathway', 'priority'],
          run: () => this.ui.navigateToView('artist-development'),
        });
      }

      // Capped: the palette is a launcher, not a task board. Three blocked
      // phases is enough to show the shape of what is stuck.
      for (const phase of snapshot.phases
        .filter((entry) => entry.status === 'at-risk')
        .slice(0, 3)) {
        actions.push({
          id: `lifecycle-blocked-${phase.id}`,
          label: `Blocked: ${phase.label}`,
          description: `Waiting on ${
            phase.blockedBy.slice(0, 2).join(', ') || 'its prerequisites'
          }`,
          category: 'Lifecycle',
          keywords: ['blocked', 'risk', 'lifecycle', phase.id],
          run: () => this.ui.navigateToView('artist-development'),
        });
      }

      this.palette.setExtensionActions('artist-lifecycle', actions);
    });
  }
}
