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
  private speechService = inject(SpeechSynthesisService);

  lyrics = signal<string>('');
  memorizeMode = signal(false);

  processedLyrics = signal<string>('');

  private updateProcessedLyrics() {
    if (!this.memorizeMode()) {
      this.processedLyrics.set(this.lyrics());
      return;
    }

    const processed = this.lyrics()
      .split(' ')
      .map((word) => (word.length > 3 && Math.random() > 0.7 ? '_____' : word))
      .join(' ');

    this.processedLyrics.set(processed);
  }

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
  }

  async critiqueRehearsal() {
    this.mindsetTip.set(
      'S.M.U.V.E is analyzing your rehearsal performance data...'
    );

    try {
      const profile = this.profileService.profile();
      const prompt = `Provide a "Legendary Strategic Commander" critique for a rehearsal by the artist: ${profile.artistName}.
      Genre: ${profile.primaryGenre}
      Focus: Live Performance and Rehearsal Critique.

      Give exactly 3 blunt, assertive, and highly technical tips. One must be about breath/vocal technique, one about stage presence, and one about mindset.
      Be authoritative.`;

      const response = await this.aiService.generateContent({
        model: AiService.CHAT_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const feedback = response.text;
      this.mindsetTip.set(feedback);

      // Use the service's built-in glitch speak for that "AI Commander" feel
      this.speechService.speak(feedback);

      this.aiService.addStrategicDecree(
        `Rehearsal Critique issued for ${profile.artistName}. Technical correction active.`
      );
    } catch (error) {
      console.error('Critique failed:', error);
      this.mindsetTip.set(
        'S.M.U.V.E: Intelligence link disrupted. Standard Protocol: Do not settle for mediocrity.'
      );
    }
  }
}
