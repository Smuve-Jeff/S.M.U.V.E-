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
  styles: [`
    .offline-indicator {
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%) translateY(-100%);
      background: #78350f;
      color: #fef3c7;
      padding: 8px 16px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      z-index: 1500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .offline-indicator.visible {
      transform: translateX(-50%) translateY(0);
    }
    
    .offline-indicator .material-icons {
      font-size: 16px;
    }
    
    @media (max-width: 768px) {
      .offline-indicator {
        top: calc(8px + env(safe-area-inset-top, 0px));
      }
    }
  `]
})
export class OfflineIndicatorComponent {
  private uiService = inject(UIService);
  isOnline = this.uiService.isOnline;
}
