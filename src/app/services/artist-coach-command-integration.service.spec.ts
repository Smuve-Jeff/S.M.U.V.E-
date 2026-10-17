import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ArtistCoachCommandIntegrationService } from './artist-coach-command-integration.service';
import { ArtistAiCoachService } from './artist-ai-coach.service';
import { ArtistCareerExpansionService } from './artist-career-expansion.service';
import { CommandPaletteService } from './command-palette.service';
import { UIService } from './ui.service';

describe('Artist coach palette wiring', () => {
  it('registers immediately, refreshes reactively and runs real navigation', () => {
    const state = signal({ personalized: { releaseStrategy: { nextRelease: { strategy: 'First plan' } }, prioritizedActions: ['Write'] } });
    const expanded = signal({ brandIdentity: { voiceTone: 'Declared voice' }, liveBookingStrategy: { revenueModel: 'Unquoted' } });
    const palette = { setExtensionActions: jest.fn() };
    const ui = { navigateToView: jest.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: ArtistAiCoachService, useValue: { coachState: state } },
      { provide: ArtistCareerExpansionService, useValue: { expandedAdaptationState: expanded } },
      { provide: CommandPaletteService, useValue: palette },
      { provide: UIService, useValue: ui },
    ] });
    TestBed.inject(ArtistCoachCommandIntegrationService);
    TestBed.tick();
    const actions = palette.setExtensionActions.mock.calls.at(-1)![1];
    expect(actions[0].description).toBe('First plan');
    actions[0].run();
    expect(ui.navigateToView).toHaveBeenCalledWith('artist-coach');
    state.set({ personalized: { releaseStrategy: { nextRelease: { strategy: 'Updated plan' } }, prioritizedActions: [] } });
    TestBed.tick();
    const updated = palette.setExtensionActions.mock.calls.at(-1)![1];
    expect(updated[0].description).toBe('Updated plan');
    expect(updated.some((a: any) => a.id === 'coach-action-0')).toBe(false);
  });
});
