import { Component, inject, output } from '@angular/core';
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

  onComplete() {
    if (
      this.status().stage === 'complete' ||
      this.status().stage === 'failed'
    ) {
      this.close.emit();
    }
  }
}
