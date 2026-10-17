import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UplinkService } from '../../services/uplink.service';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-uplink-console',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './uplink-console.component.html',
  styleUrls: ['./uplink-console.component.css'],
  animations: [
    trigger('fadeScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95) translateY(10px)' }),
        animate(
          '300ms ease-out',
          style({ opacity: 1, transform: 'scale(1) translateY(0)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ opacity: 0, transform: 'scale(0.95) translateY(10px)' })
        ),
      ]),
    ]),
  ],
})
export class UplinkConsoleComponent {
  uplink = inject(UplinkService);
  close = output<void>();

  status = this.uplink.status;

  /**
   * The profile to retry with. Hosts pass the exact draft they submitted, so a
   * retry re-sends the artist's real answers rather than whatever happens to be
   * in the store at that moment.
   */
  retryPayload = input<any | null>(null);

  retrying = false;

  /**
   * The failure button said RETRY_UPLINK but only closed the overlay, so a
   * rejected commit looked like it retried and silently stopped. It now
   * re-runs the uplink against the same payload when the host supplied one.
   */
  async onComplete(): Promise<void> {
    const stage = this.status().stage;
    if (stage === 'failed' && this.retryPayload() && !this.retrying) {
      this.retrying = true;
      try {
        await this.uplink.initiateUplink(this.retryPayload());
      } finally {
        this.retrying = false;
      }
      return;
    }
    if (stage === 'complete' || stage === 'failed') {
      this.close.emit();
    }
  }
}
