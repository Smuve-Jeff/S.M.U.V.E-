import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';

interface VocalWarmup {
  id: string;
  name: string;
  duration: string;
  description: string;
}

@Component({
  selector: 'app-practice-space',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './practice-space.component.html',
  styleUrls: ['./practice-space.component.css'],
})
export class PracticeSpaceComponent {
  private profileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private speechSynthesisService = inject(SpeechSynthesisService);

  lyrics = signal<string>('');
  memorizeMode = signal(false);
  processedLyrics = signal<string>('');
  isAnalyzing = signal(false);

  warmups: VocalWarmup[] = [
    {
      id: '1',
      name: 'Lip Trills',
      duration: '2 min',
      description: 'Gently blow air through relaxed lips to vibrate them.',
    },
    {
      id: '2',
      name: 'Sirens',
      duration: '3 min',
      description:
        'Slide from your lowest note to your highest and back down on an "ng" sound.',
    },
    {
      id: '3',
      name: 'Tongue Twisters',
      duration: '5 min',
      description: 'Articulate complex phrases clearly at increasing speeds.',
    },
    {
      id: '4',
      name: 'Humming Resonators',
      duration: '2 min',
      description:
        'Hum at different pitches focusing on the vibration in your mask area.',
    },
  ];

  resilienceTools = [
    {
      name: 'Creative Block Breaker',
      icon: 'fa-hammer',
      action: 'RUN AI DRILL',
    },
    {
      name: 'Burnout Diagnostic',
      icon: 'fa-heartbeat',
      action: 'START ASSESSMENT',
    },
    {
      name: 'Stage Presence Coach',
      icon: 'fa-walking',
      action: 'LAUNCH AR SIM',
    },
  ];

  mindsetTip = signal(
    'Industry rejection is just redirection. Keep your output consistent.'
  );

  toggleMemorize() {
    this.memorizeMode.update((v) => !v);
    this.updateProcessedLyrics();
  }

  updateProcessedLyrics() {
    if (!this.memorizeMode()) {
      this.processedLyrics.set(this.lyrics());
      return;
    }

    const processed = this.lyrics()
      .split(' ')
      .map((word) => (word.length > 3 && Math.random() > 0.4 ? '_____' : word))
      .join(' ');

    this.processedLyrics.set(processed);
  }

  async critiqueRehearsal() {
    this.isAnalyzing.set(true);

    try {
      // Simulate AI thinking
      await new Promise(resolve => setTimeout(resolve, 2000));

      const critique = `S.M.U.V.E Rehearsal Audit: Your vocal delivery is technically proficient, but you're playing it too safe. For a ${this.profileService.profile().primaryGenre} track, I need more grit in the bridge. Your pitch stability is solid at 92%, but your timing on the second verse is slightly rushed. Breathe, focus, and attack the next take with more aggression.`;

      this.speechSynthesisService.speak(critique);
    } finally {
      this.isAnalyzing.set(false);
    }
  }
}
