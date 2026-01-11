import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { MicrophoneService } from './services/microphone.service';
import { DeckService } from './services/deck.service';
import { UIService } from './services/ui.service';
import { MicrophoneVisualizerComponent } from './components/microphone-visualizer/microphone-visualizer.component';
import { ChatbotModule } from './components/chatbot/chatbot.module';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MicrophoneVisualizerComponent, ChatbotModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  // Dependency Injection
  authService = inject(AuthService);
  microphoneService = inject(MicrophoneService);
  deckService = inject(DeckService);
  uiService = inject(UIService);

  mainViewMode = this.uiService.mainViewMode;
  activeTheme = this.uiService.activeTheme;

  constructor() {}

  getMicAnalyser(): AnalyserNode | undefined {
    return this.microphoneService.getAnalyserNode();
  }

  async toggleChatbot() {
    if (!this.uiService.isChatbotOpen()) {
      await import('./components/chatbot/chatbot.module');
    }
    this.uiService.toggleChatbot();
  }
}
