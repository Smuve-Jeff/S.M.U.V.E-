import { Component, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BottomNavItem = {
  id: string;
  label: string;
  icon: string;
  badge?: number;
};

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="bottom-nav-bar" [class.hidden]="!visible()">
      <button
        *ngFor="let item of items()"
        class="bottom-nav-item"
        [class.active]="activeId() === item.id"
        (click)="itemClick.emit(item.id)"
        type="button"
      >
        <span class="material-icons">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
        <span class="nav-badge" *ngIf="item.badge">{{ item.badge }}</span>
      </button>
    </nav>
  `,
  styles: [`
    .bottom-nav-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 64px;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      z-index: 1000;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .bottom-nav-bar.hidden {
      transform: translateY(100%);
    }

    .bottom-nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 4px;
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
      min-width: 48px;
      min-height: 48px;
      -webkit-tap-highlight-color: transparent;
    }

    .bottom-nav-item:active {
      transform: scale(0.95);
    }

    .bottom-nav-item.active {
      color: #38bdf8;
    }

    .bottom-nav-item.active::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 32px;
      height: 3px;
      background: #38bdf8;
      border-radius: 0 0 3px 3px;
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
    }

    .material-icons {
      font-size: 24px;
      transition: transform 0.2s ease;
    }

    .bottom-nav-item.active .material-icons {
      transform: scale(1.1);
    }

    .nav-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .nav-badge {
      position: absolute;
      top: 4px;
      right: 8px;
      background: #f43f5e;
      color: white;
      font-size: 9px;
      font-weight: 900;
      padding: 2px 5px;
      border-radius: 10px;
      min-width: 16px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(244, 63, 94, 0.4);
    }

    @media (min-width: 769px) {
      .bottom-nav-bar {
        display: none;
      }
    }
  `]
})
export class BottomNavComponent {
  items = input.required<BottomNavItem[]>();
  activeId = input.required<string>();
  visible = input<boolean>(true);
  itemClick = output<string>();
}
