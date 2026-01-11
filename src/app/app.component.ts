
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AiService } from './services/ai.service';
import { AuthService } from './services/auth.service';
import { MicrophoneService } from './services/microphone.service';
import { DeckService } from './services/deck.service';
import { UIService } from './services/ui.service';
import { MicrophoneVisualizerComponent } from './components/microphone-visualizer/microphone-visualizer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    RouterOutlet,
    MicrophoneVisualizerComponent
  ],
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
}
