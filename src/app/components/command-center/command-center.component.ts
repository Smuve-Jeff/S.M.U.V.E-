import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AiService } from '../../services/ai.service';
import { ReputationService } from '../../services/reputation.service';
import { AiMusicianService } from '../../services/ai-musician.service';

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './command-center.component.html',
  styleUrls: ['./command-center.component.css'],
})
export class CommandCenterComponent {
  aiService = inject(AiService);
  reputationService = inject(ReputationService);
  aiMusicianService = inject(AiMusicianService);

  decrees = this.aiService.strategicDecrees;
  repState = this.reputationService.state;

  toggleBassist() {
    const active = !this.aiMusicianService.bassistEnabled();
    if (active) this.aiService.startAIBassist();
    else this.aiService.stopAIBassist();
  }

  toggleDrummer() {
    const active = !this.aiMusicianService.drummerEnabled();
    if (active) this.aiService.startAIDrummer();
    else this.aiService.stopAIDrummer();
  }

  toggleKeyboardist() {
    const active = !this.aiMusicianService.keyboardistEnabled();
    if (active) this.aiService.startAIKeyboardist();
    else this.aiService.stopAIKeyboardist();
  }
}
