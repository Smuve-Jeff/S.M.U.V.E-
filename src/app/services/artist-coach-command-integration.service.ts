import { Injectable, inject, computed } from '@angular/core';
import { CommandPaletteService, Command } from './command-palette.service';
import { ArtistAiCoachService } from './artist-ai-coach.service';
import { ArtistCareerExpansionService } from './artist-career-expansion.service';
import { UserProfileService } from './user-profile.service';

/**
 * Bridges the adaptive artist coach system into the S.M.U.V.E. command stack.
 * When an artist opens the command palette, personalized coaching prompts
 * and AI-guided actions surface as commands.
 */
@Injectable({ providedIn: 'root' })
export class ArtistCoachCommandIntegrationService {
  private commandPalette = inject(CommandPaletteService);
  private coachService = inject(ArtistAiCoachService);
  private careerExpansion = inject(ArtistCareerExpansionService);
  private profileService = inject(UserProfileService);

  private readonly COACH_COMMAND_PREFIX = '🎯 Coach: ';

  constructor() {
    this.registerCoachCommands();
  }

  private registerCoachCommands() {
    // Re-register on coach state change
    computed(() => {
      const coachState = this.coachService.coachState();
      const expandedState = this.careerExpansion.expandedAdaptationState();
      this.updateCommandsFromCoach(coachState, expandedState);
    }).run = () => this.updateCommandsFromCoach(this.coachService.coachState(), this.careerExpansion.expandedAdaptationState());
  }

  private updateCommandsFromCoach(coachState: any, expandedState: any) {
    if (!coachState || !expandedState) return;

    const commands: Command[] = [];

    // Release strategy command
    commands.push({
      id: 'coach-release-strategy',
      label: `${this.COACH_COMMAND_PREFIX}Next Release Strategy`,
      description: `${coachState.personalized.releaseStrategy.nextRelease.type} release targeting ${expandedState.careerStage.label} stage`,
      category: 'artist',
      action: () => {
        // Copy strategy to clipboard or open coach
        const strategy = `\n${JSON.stringify(coachState.personalized.releaseStrategy, null, 2)}`;
        navigator.clipboard.writeText(strategy);
      },
      icon: 'rocket_launch',
    });

    // Next actions command
    coachState.personalized.prioritizedActions.slice(0, 3).forEach((action: string, idx: number) => {
      commands.push({
        id: `coach-action-${idx}`,
        label: `${this.COACH_COMMAND_PREFIX}${action.substring(0, 50)}...`,
        description: `Priority action #${idx + 1}`,
        category: 'artist',
        action: () => {
          // Navigate to relevant surface or open coach
          console.log(`Action: ${action}`);
        },
        icon: 'check_circle',
      });
    });

    // Brand positioning command
    commands.push({
      id: 'coach-brand-identity',
      label: `${this.COACH_COMMAND_PREFIX}Brand & Positioning`,
      description: `${expandedState.brandIdentity.marketPosition} · ${expandedState.brandIdentity.voiceTone}`,
      category: 'artist',
      action: () => {
        console.log('Brand Identity:', expandedState.brandIdentity);
      },
      icon: 'palette',
    });

    // Live booking strategy command
    commands.push({
      id: 'coach-live-strategy',
      label: `${this.COACH_COMMAND_PREFIX}Live Booking Strategy`,
      description: `${expandedState.liveBookingStrategy.typicalDuration} sets · ${expandedState.liveBookingStrategy.revenueModel}`,
      category: 'artist',
      action: () => {
        console.log('Live Booking:', expandedState.liveBookingStrategy);
      },
      icon: 'live_music',
    });

    // Coaching priorities command
    commands.push({
      id: 'coach-priorities',
      label: `${this.COACH_COMMAND_PREFIX}Coaching Priorities (${expandedState.coachingPriorities.length})`,
      description: `${expandedState.coachingPriorities[0] || 'View all coaching priorities'}`,
      category: 'artist',
      action: () => {
        console.log('Priorities:', expandedState.coachingPriorities);
      },
      icon: 'assignment',
    });

    // Register all commands
    commands.forEach((cmd) => {
      try {
        this.commandPalette.registerCommand(cmd);
      } catch (e) {
        // Command may already be registered; ignore
      }
    });
  }
}
