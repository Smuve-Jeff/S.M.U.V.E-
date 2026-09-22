import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService } from '../../services/ai.service';
import { AiMusiciansService } from '../ai-musicians.service';

/**
 * The AI band strip — three one-tap toggles for the virtual session players.
 *
 * They improvise over the arrangement during playback (see AiMusiciansService),
 * so the strip carries its own live read-out of the last step they played. It
 * lives in the Studio chrome rather than inside a `.comp-view` so it stays
 * reachable in every workspace and never inherits a restricted `touch-action`.
 */
@Component({
  selector: 'app-ai-band',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-band.component.html',
  styleUrls: ['./ai-band.component.css', '../shared/platform-ux.css'],
})
export class AiBandComponent {
  ai = inject(AiService);
  band = inject(AiMusiciansService);

  toggle(who: 'drummer' | 'bassist' | 'keyboardist'): void {
    this.ai.toggleAIMusician(who);
  }

  engagedCount(): number {
    return this.ai.sessionMusicians.filter((m) =>
      this.ai.isMusicianActive(m.id)
    ).length;
  }
}
