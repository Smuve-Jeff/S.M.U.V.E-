import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIService } from '../../../services/ui.service';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="offline-indicator" [class.visible]="!isOnline()">
      <span class="material-icons">cloud_off</span>
      <span class="offline-text">Offline Mode</span>
    </div>
  `,
  styleUrls: ['./offline-indicator.component.css'],
})
export class OfflineIndicatorComponent {
  private uiService = inject(UIService);
  isOnline = this.uiService.isOnline;
}
