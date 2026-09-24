import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TransportBarComponent } from '../../transport-bar/transport-bar.component';

/**
 * Shared boundary between transport state and project utility actions.
 *
 * The shell owns layout only; TransportBarComponent continues to own audio,
 * recording, tempo, and position state. Consumers can project compact status
 * or project controls into the utility slot without coupling those actions to
 * the transport's internal signals.
 */
@Component({
  selector: 'app-studio-transport-shell',
  standalone: true,
  imports: [TransportBarComponent],
  templateUrl: './studio-transport-shell.component.html',
  styleUrl: './studio-transport-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioTransportShellComponent {}
