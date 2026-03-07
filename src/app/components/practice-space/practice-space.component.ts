import { Component, signal, inject, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { SpeechSynthesisService } from '../../services/speech-synthesis.service';
import { UpgradeRecommendation } from '../../types/ai.types';

interface PracticeProtocol {
  id: string;
  name: string;
  category: 'Vocal' | 'Performance' | 'Lyric';
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
export class PracticeSpaceComponent implements OnDestroy {
  private profileService = inject(UserProfileService);
  private aiService = inject(AiService);
  private speechSynthesisService = inject(SpeechSynthesisService);

  lyrics = signal<string>('');
  memorizeMode = signal(false);
  processedLyrics = signal<string>('');
  isAnalyzing = signal(false);

  // Metronome State
  bpm = signal(120);
  isMetronomePlaying = signal(false);
  private metronomeInterval: any;
  metronomeVisual = signal(false);

  // Upgrade Recommendations
  upgrades = computed(() => {
    const allUpgrades = this.aiService.getUpgradeRecommendations();
    // Filter for practice-specific keywords or the newly added IDs
    return allUpgrades.filter(u =>
      u.title.toLowerCase().includes('vocal') ||
      u.title.toLowerCase().includes('rehearsal') ||
      u.title.toLowerCase().includes('acoustic') ||
      u.title.toLowerCase().includes('monitor') ||
      u.title.toLowerCase().includes('metronome') ||
      u.title.toLowerCase().includes('interface') ||
      u.type === 'Gear' ||
      u.id.startsWith('u-4')
    ).slice(0, 4);
  });

  protocols: PracticeProtocol[] = [
    {
      id: 'v1',
      name: 'Lip Trills & Resonance',
      category: 'Vocal',
      duration: '5 min',
      description: 'Gently blow air through relaxed lips while sliding through your range. Focus on facial resonance.',
    },
    {
      id: 'v2',
      name: 'Vowel Narrowing',
      category: 'Vocal',
      duration: '8 min',
      description: 'Practice high-register notes on "oo" and "ee" to avoid straining. Shift focus from throat to mask.',
    },
    {
      id: 'p1',
      name: 'Stage Movement & Flow',
      category: 'Performance',
      duration: '15 min',
      description: 'Choreograph your movement for high-energy sections. Practice using the entire stage area.',
    },
    {
      id: 'p2',
      name: 'Microphone Technique',
      category: 'Performance',
      duration: '10 min',
      description: 'Practice proximity effect: closer for intimacy/lows, further for power/belted notes.',
    },
    {
      id: 'l1',
      name: 'Narrative Visualization',
      category: 'Lyric',
      duration: '10 min',
      description: 'Break lyrics into scenes. Visualize the "movie" of your song to anchor the words emotionally.',
    },
    {
      id: 'l2',
      name: 'Backwards Recall',
      category: 'Lyric',
      duration: '5 min',
      description: 'Recite lyrics starting from the last line to the first. Forces deep cognitive storage.',
    }
  ];

  resilienceTools = [
    {
      name: 'Live Set Stress Test',
      icon: 'fa-bolt',
      action: 'START SIMULATION',
      description: 'AI simulates crowd noise and gear failures to test your focus.'
    },
    {
      name: 'Creative Block Breaker',
      icon: 'fa-hammer',
      action: 'RUN AI DRILL',
      description: 'AI-generated writing prompts based on your primary genre.'
    },
    {
      name: 'DIY Rehearsal Protocol',
      icon: 'fa-clipboard-list',
      action: 'GENERATE PLAN',
      description: 'Customized practice schedule for the independent touring artist.'
    },
    {
      name: 'Vocal Health Monitor',
      icon: 'fa-lungs',
      action: 'ANALYZE STRAIN',
      description: 'Uses microphone to detect signs of vocal fatigue or improper technique.'
    },
    {
      name: 'Stage Presence Coach',
      icon: 'fa-walking',
      action: 'LAUNCH AR SIM',
      description: 'Virtual audience feedback based on your webcam movement.'
    }
  ];

  mindsetTip = signal(
    'A rehearsal isn’t for "getting it right." It’s for "getting it so you can’t get it wrong."'
  );

  toggleMetronome() {
    if (this.isMetronomePlaying()) {
      clearInterval(this.metronomeInterval);
      this.isMetronomePlaying.set(false);
      this.metronomeVisual.set(false);
    } else {
      const ms = (60 / this.bpm()) * 1000;
      this.isMetronomePlaying.set(true);
      this.metronomeInterval = setInterval(() => {
        this.metronomeVisual.set(true);
        setTimeout(() => this.metronomeVisual.set(false), 100);
      }, ms);
    }
  }

  updateBpm(newBpm: number) {
    this.bpm.set(Math.max(40, Math.min(250, newBpm)));
    if (this.isMetronomePlaying()) {
      // Simple restart to apply new BPM
      this.toggleMetronome();
      this.toggleMetronome();
    }
  }

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
      await new Promise(resolve => setTimeout(resolve, 2000));

      const genre = this.profileService.profile().primaryGenre || 'Artist';
      const critique = `S.M.U.V.E PERFORMANCE AUDIT: Your vocal stamina is impressive, but your dynamic range in the second verse is flat. For ${genre}, I need more intentional "mic-play"—pull back on the bridge to build tension. Your timing on the hook is locked to the ${this.bpm()}bpm grid, but your stage energy (detected via motion sync) is low. Attack the rehearsal like it's a sold-out stadium. Breathe deep, hydrate, and GO AGAIN.`;

      this.speechSynthesisService.speak(critique);
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  ngOnDestroy() {
    if (this.metronomeInterval) {
      clearInterval(this.metronomeInterval);
    }
  }
}
