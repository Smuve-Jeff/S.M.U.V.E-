import { Component, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { UIService } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, ChatbotComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  authService = inject(AuthService);
  uiService = inject(UIService);

  constructor() {
    effect(() => {
      const intensity = this.uiService.visualIntensity();
      document.documentElement.style.setProperty(
        '--cyber-glow-intensity',
        `${intensity}`
      );
      document.documentElement.style.setProperty(
        '--cyber-bg-shift',
        `${intensity * 5}px`
      );
    });
  }

  toggleChatbot() {
    this.uiService.toggleChatbot();
  }
}
