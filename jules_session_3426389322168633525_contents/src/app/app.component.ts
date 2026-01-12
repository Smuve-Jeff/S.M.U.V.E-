import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import WOW from 'wow.js';
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
export class AppComponent implements OnInit {
  authService = inject(AuthService);
  uiService = inject(UIService);

  ngOnInit() {
    new WOW().init();
  }

  toggleChatbot() {
    this.uiService.toggleChatbot();
  }
}
