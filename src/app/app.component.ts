import { Component, inject, effect, signal, HostListener, computed } from '@angular/core';
import { Component, inject, effect, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { UIService, ViewConfig } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { NotificationToastComponent } from './components/notification-toast/notification-toast.component';
import { SmuveAdvisorComponent } from './components/smuve-advisor/smuve-advisor.component';
import { NotificationService } from './services/notification.service';
import { MainViewMode } from './services/user-context.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ChatbotComponent, NotificationToastComponent, SmuveAdvisorComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  authService = inject(AuthService);
  uiService = inject(UIService);
  notificationService = inject(NotificationService);
  router = inject(Router);

  isSidebarOpen = signal(true);
  isToolsDropdownOpen = signal(false);
  isViewSelectorOpen = signal(false);
  isMobile = signal(false);

  constructor() {
    this.checkMobile();

    effect(() => {
      const isOnline = this.uiService.isOnline();
      if (isOnline) {
        this.notificationService.show('System Online: All features available', 'success', 3000);
      } else {
        this.notificationService.show('System Offline: Some features restricted', 'warning', 0);
      }
    });

    // Update mainViewMode based on current route
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const path = event.urlAfterRedirects.split('/')[1] as MainViewMode;
      if (path && this.uiService.getViewModes().includes(path)) {
        this.uiService.mainViewMode.set(path);
      }

      // Auto-close sidebar on mobile after navigation
      if (this.isMobile()) {
        this.isSidebarOpen.set(false);
      }
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    const wasMobile = this.isMobile();
    this.isMobile.set(window.innerWidth <= 1024);

    // If we just switched to mobile, close sidebar. If we switched to desktop, open it.
    if (!wasMobile && this.isMobile()) {
      this.isSidebarOpen.set(false);
    } else if (wasMobile && !this.isMobile()) {
      this.isSidebarOpen.set(true);
    }
  }

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  toggleToolsDropdown() {
    this.isToolsDropdownOpen.update(v => !v);
  }

  toggleChatbot() {
    this.uiService.toggleChatbot();
  }

  toggleViewSelector() {
    this.isViewSelectorOpen.update(v => !v);
    if (this.isViewSelectorOpen()) {
      this.viewSearchQuery.set('');
    }
  }

  filterViews(query: string) {
    this.viewSearchQuery.set(query);
  }

  navigateToView(mode: MainViewMode) {
    this.uiService.navigateToView(mode);
    this.isViewSelectorOpen.set(false);
  }

  getViewsByCategory(category: string): ViewConfig[] {
    return this.uiService.getViewConfigs().filter(v => v.category === category);
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:click', [''])
  onClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.view-mode-selector')) {
      this.isViewSelectorOpen.set(false);
    }
  }
}
