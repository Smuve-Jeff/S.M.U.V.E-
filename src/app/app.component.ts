import { Component, inject, signal, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { UIService } from './services/ui.service';
import { AuthService } from './services/auth.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { NotificationToastComponent } from './components/notification-toast/notification-toast.component';
import { SmuveAdvisorComponent } from './components/smuve-advisor/smuve-advisor.component';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    ChatbotComponent,
    NotificationToastComponent,
    SmuveAdvisorComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  public uiService = inject(UIService);
  public authService = inject(AuthService);
  private router = inject(Router);

  isSidebarOpen = signal(true);
  isMobile = signal(false);

  ngOnInit() {
    this.checkMobile();
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const path = event.urlAfterRedirects.split('/')[1];
      if (path && this.uiService.getViewModes().includes(path as any)) {
        this.uiService.mainViewMode.set(path as any);
      }
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.checkMobile();
  }

  private checkMobile() {
    if (typeof window !== 'undefined') {
      const mobile = window.innerWidth < 1024;
      this.isMobile.set(mobile);
      if (mobile) this.isSidebarOpen.set(false);
    }
  }

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  navigateToView(mode: any) {
    this.uiService.navigateToView(mode);
    if (this.isMobile()) this.isSidebarOpen.set(false);
  }
}
