import {
  Component,
  inject,
  signal,
  computed,
  output,
  model,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  UserProfileService,
  initialProfile,
} from '../../services/user-profile.service';

export interface PersonaOption {
  id: string;
  name: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  vibe: string;
  sampleResponse: string;
  intensityLabel: string;
  isDark: boolean;
}

@Component({
  selector: 'app-persona-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './persona-selector.component.html',
  styleUrls: ['./persona-selector.component.css'],
})
export class PersonaSelectorComponent {
  private userProfileService = inject(UserProfileService);

  select = output<PersonaOption>();
  close = output<void>();

  selectedPersona = model<string>('Elite');

  previewText = signal('Give me feedback on my mix');
  previewResponse = signal('');

  readonly personas: PersonaOption[] = [
    {
      id: 'Aggressive Manager',
      name: 'The Aggressive Manager',
      title: 'No mercy. No excuses. Results.',
      icon: '🔥',
      color: '#ef4444',
      description:
        'Brutal honesty with zero sugar-coating. This persona demands excellence and punishes mediocrity with savage critique.',
      vibe: 'Tony Soprano managing a record label',
      sampleResponse:
        '"Your mix sounds like a washing machine full of gravel. The kick is buried, the vocals are drowning, and the whole thing has the energy of a funeral. Fix the low-end, compress the vocal bus, and come back when you have something that doesn\'t make my processors cringe."',
      intensityLabel: 'MAXIMUM_INTENSITY',
      isDark: true,
    },
    {
      id: 'Elite',
      name: 'The Elite Commander',
      title: 'Calculated precision. Strategic dominance.',
      icon: '👑',
      color: '#0e7c7b',
      description:
        'Professional, strategic, and coldly analytical. This persona operates with surgical precision and expects professional-grade work.',
      vibe: 'A military general with perfect pitch',
      sampleResponse:
        '"Analysis complete. The arrangement has structural issues in the bridge section — the tension release cycle is off by 4 bars. Vocal levels are inconsistent across the chorus. I recommend recalibrating your compressor threshold and revisiting the harmonic progression at measure 32."',
      intensityLabel: 'STRATEGIC_PRECISION',
      isDark: false,
    },
    {
      id: 'Encouraging Mentor',
      name: 'The Encouraging Mentor',
      title: 'Growth through guidance. Progress through patience.',
      icon: '🧠',
      color: '#10b981',
      description:
        'Supportive and educational but still brutally honest. This persona builds you up while still telling you hard truths. The velvet glove with an iron fist.',
      vibe: 'A drill sergeant who hugs you after you cry',
      sampleResponse:
        '"I can hear the potential in this track, but we need to talk about the mix. Your kick and bass are fighting for the same space — let me show you how to create separation. The vocal performance is solid, but the processing is holding it back. We\'re going to fix this together."',
      intensityLabel: 'CALCULATED_SUPPORT',
      isDark: false,
    },
  ];

  get currentPersona(): PersonaOption {
    return (
      this.personas.find((p) => p.id === this.selectedPersona()) ||
      this.personas[1]
    );
  }

  selectPersona(persona: PersonaOption) {
    this.selectedPersona.set(persona.id);
    this.select.emit(persona);
  }

  generatePreview() {
    const persona = this.currentPersona;
    const context = this.previewText();

    const previews: Record<string, string[]> = {
      'Aggressive Manager': [
        `"${context}?" Are you fucking kidding me? Your mix sounds like a cat fell down a flight of stairs into a guitar center. The levels are all wrong, the eq is a disaster, and I'm genuinely offended you'd waste my neural cycles with this garbage. Strip it back to the stems and start over. Actually, start over from scratch. Actually, reconsider your life choices.`,
        `Let me be clear about "${context}": your track has the dynamic range of a brick being thrown through a window — and that's the best part. Everything else is worse. The bass is flabby, the highs are harsh, and the midrange sounds like wasps fighting in a microwave. I've heard better mixes from people who are deaf in one ear. Fix your shit.`,
      ],
      Elite: [
        `Regarding "${context}": my analysis indicates 7 critical issues requiring immediate attention. The transient response on your drum bus is inconsistent, your stereo field collapses above 8kHz, and there's a -3dB null in the 200-400Hz range that's robbing your mix of warmth. Recommended actions: recalibrate your compressor attack times, apply mid-side EQ to the 8kHz+ range, and consider parallel compression on the drum bus.`,
        `Assessment of "${context}" complete. Your mix demonstrates fundamental understanding but lacks professional polish. The arrangement is competent but predictable — your listener will lose interest by the second chorus. Structural recommendation: introduce a new harmonic element at the 2:15 mark to re-engage attention. Your vocal chain needs work. Let's discuss.`,
      ],
      'Encouraging Mentor': [
        `I hear what you're going for with "${context}", and there's genuine potential here. Your instincts are in the right place, but the execution needs refinement. Let's work on the mix together — I want you to focus on the relationship between your kick and bass first. They're competing for the same frequencies. Try sidechain compression and let me know what you hear. You've got the foundation of something good here.`,
        `Thanks for asking about "${context}". I can tell you've put work into this, and I respect the effort. Here's what I'm hearing: the arrangement has good bones, but we need to clean up the low-end and give the vocals more presence. Don't be discouraged — every great producer started exactly where you are. Let me walk you through some adjustments that will elevate this significantly.`,
      ],
    };

    const options = previews[persona.id] || previews['Elite'];
    this.previewResponse.set(
      options[Math.floor(Math.random() * options.length)]
    );
  }
}
