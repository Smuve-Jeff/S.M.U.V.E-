import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';

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

  critiqueRehearsal() {
    alert(
      'S.M.U.V.E Analysis: Your pitch stability is at 88%. I recommend focusing on breath support during the bridge. Your emotional delivery is peak, but watch your tempo in the second verse.'
    );
  }
}
