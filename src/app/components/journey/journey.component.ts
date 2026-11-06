import {
  Component,
  inject,
  signal,
  computed,
  effect,
  HostListener,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  UserProfileService,
  UserProfile,
} from '../../services/user-profile.service';
import { AuthService } from '../../services/auth.service';
import { ALL_GENRES } from '../../services/enhanced-artist-questionnaire-engine';

@Component({
  selector: 'app-journey',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './journey.component.html',
  styleUrls: ['./journey.component.css'],
})
export class JourneyComponent implements OnDestroy {
  private userProfileService = inject(UserProfileService);
  private authService = inject(AuthService);

  isAuthenticated = this.authService.isAuthenticated;
  profile = signal<UserProfile>({ ...this.userProfileService.profile() });

  activeStep = signal(0);
  steps = [
    { title: 'The Origin', subtitle: 'Where it all began' },
    { title: 'The Sound', subtitle: 'Defining your frequency' },
    { title: 'Production DNA', subtitle: 'Your creative toolkit' },
    { title: 'The Vision', subtitle: 'Mapping the future' },
    { title: 'The Legacy', subtitle: 'Finalizing the dossier' },
  ];

  /** Highest step reached this session — earlier steps stay clickable. */
  maxStepReached = signal(0);

  /** Signals that the wizard auto-saved the current step's answers. */
  justSaved = signal(false);
  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  /** Shows once the dossier is initialized, with hand-off actions. */
  initialized = signal(false);

  /** Set when a profile write is explicitly reported as failed. */
  saveError = signal('');

  /**
   * Per-step completeness, computed from the live profile so the header dots
   * and the footer counter only ever state what is actually answered.
   */
  stepComplete = computed<boolean[]>(() => {
    const p = this.profile();
    const journey = p.musicalJourney || ({} as UserProfile['musicalJourney']);
    // A fresh profile ships the placeholder name and the default genre. Those
    // are not answers the artist gave, so nothing counts as complete until
    // they have claimed the dossier with a real name.
    const identified =
      Boolean((p.artistName || '').trim()) &&
      (p.artistName || '').trim() !== 'New Artist';
    return [
      identified &&
        Boolean(journey.experienceLevel) &&
        Boolean(journey.originStory) &&
        Boolean(journey.artistNameMeaning),
      identified && Boolean((p.primaryGenre || '').trim()),
      identified &&
        Boolean(journey.preferredBpmRange) &&
        (p.skills?.length || 0) > 0 &&
        Boolean(journey.productionPhilosophy),
      identified &&
        Boolean((journey.currentFocus || '').trim()) &&
        Boolean(journey.releaseVelocity) &&
        Boolean(journey.contentStrategy) &&
        (journey.incomeStreams?.length || 0) > 0,
      false,
    ];
  });

  completedCount = computed(
    () => this.stepComplete().filter(Boolean).length
  );

  // Genre options — shared with the Artist DNA Uplink questionnaire so the
  // catalog can never drift between the two surfaces.
  readonly genres = ALL_GENRES;

  // Free-text inputs that map onto canonical string[] profile fields.
  // (musicalJourney.musicalInfluences and daw are arrays; the wizard edits
  // them as comma-separated text so the profile model stays clean.)
  influencesText = signal('');
  dawText = signal('');

  // BPM range presets
  readonly bpmRanges = [
    { label: 'Slow & Chill (60-90 BPM)', value: '60-90' },
    { label: 'Mid-Tempo (90-120 BPM)', value: '90-120' },
    { label: 'Upbeat (120-140 BPM)', value: '120-140' },
    { label: 'High Energy (140-180 BPM)', value: '140-180' },
    { label: 'Variable / All Tempos', value: 'variable' },
  ];

  // Production style options
  readonly productionStyles = [
    'Minimalist',
    'Layered/Complex',
    'Live Instrumentation',
    'Sample-Heavy',
    'Synthesizer-Driven',
    'Hybrid/Mixed',
  ];

  // Experience levels
  readonly experienceLevels = [
    'Beginner',
    'Intermediate',
    'Advanced',
    'Professional',
  ];

  // Skills
  readonly availableSkills = [
    'Vocalist',
    'Producer',
    'Songwriter',
    'DJ',
    'Engineer',
    'Musician',
    'Manager',
  ];

  // Canonical option values shared with the artist questionnaire, so the two
  // surfaces can never record different vocabularies for the same field.
  readonly originStories = [
    { label: 'Self-Discovery', value: 'self-taught', description: 'learned on your own' },
    { label: 'Formal Training', value: 'formal', description: 'classical or academic' },
    { label: 'Community Born', value: 'community', description: 'scene, church or family' },
    { label: 'Industry Entry', value: 'industry', description: 'sessions and connections' },
    { label: 'Digital Native', value: 'digital', description: 'born in the DAW' },
    { label: 'Late Bloomer', value: 'late', description: 'found music later' },
  ];

  readonly productionPhilosophies = [
    'Analog Warmth',
    'Digital Precision',
    'Lo-Fi Grit',
    'Experimental Hybrid',
    'Maximalist',
    'Minimalist',
  ];

  readonly releaseVelocities = [
    'Waterfall (Weekly)',
    'Cyclic (Monthly)',
    'Strategic (Quarterly)',
    'Rare (Yearly)',
  ];

  readonly contentStrategies = [
    'Organic Only',
    'Paid Growth',
    'Viral Hunt',
    'Community First',
    'Brand Collaborations',
  ];

  readonly successMetrics = [
    'Creative Satisfaction',
    'Algorithmic Dominance',
    'Financial Revenue',
    'Cultural Impact',
    'Sync & Licensing',
    'Live Performance',
  ];

  readonly incomeStreamOptions = [
    { label: 'Streaming Royalties', value: 'Streaming' },
    { label: 'Sync & Licensing', value: 'Sync Licensing' },
    { label: 'Live Shows / Touring', value: 'Live Shows' },
    { label: 'Merch', value: 'Merch' },
    { label: 'Beat / Production Sales', value: 'Beat Sales' },
    { label: 'Session Work', value: 'Session Work' },
    { label: 'Teaching / Coaching', value: 'Teaching' },
    { label: 'Patreon / Fan Subscriptions', value: 'Fan Subscriptions' },
    { label: 'Sample Packs', value: 'Sample Packs' },
    { label: 'Brand Deals', value: 'Brand Deals' },
    { label: 'Distribution Services', value: 'Distribution' },
    { label: 'Publishing / Placements', value: 'Publishing' },
  ];

  constructor() {
    effect(() => {
      const p = this.userProfileService.profile();
      this.profile.set(this.cloneProfile(p));
      this.influencesText.set((p.musicalJourney?.musicalInfluences || []).join(', '));
      this.dawText.set((p.daw || []).join(', '));
    });
  }

  ngOnDestroy() {
    if (this.savedTimer) clearTimeout(this.savedTimer);
  }

  /**
   * `ngModel` writes straight into the object it is bound to. Copy the nested
   * objects the wizard edits, or typing would mutate the service's live
   * profile before the artist ever saves the step.
   */
  private cloneProfile(p: UserProfile): UserProfile {
    return {
      ...p,
      musicalJourney: {
        ...p.musicalJourney,
        musicalInfluences: [...(p.musicalJourney?.musicalInfluences || [])],
      },
      skills: [...(p.skills || [])],
      productionStyles: [...(p.productionStyles || [])],
      daw: [...(p.daw || [])],
    };
  }

  async next() {
    if (this.activeStep() < this.steps.length - 1) {
      // Save each section as the artist moves on, but only claim success after
      // the profile service confirms the write.
      this.activeStep.update((s) => s + 1);
      this.maxStepReached.update((m) => Math.max(m, this.activeStep()));
      if (await this.updateProfile()) this.flashSaved();
    }
  }
  async prev() {
    if (this.activeStep() > 0) {
      this.activeStep.update((s) => s - 1);
      if (await this.updateProfile()) this.flashSaved();
    }
  }

  /** Jump to any step already reached; the dossier step stays forward-only. */
  async jumpTo(step: number) {
    if (step < 0 || step > this.maxStepReached() || step === this.activeStep())
      return;
    this.activeStep.set(step);
    if (await this.updateProfile()) this.flashSaved();
  }

  private flashSaved() {
    this.justSaved.set(true);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.justSaved.set(false), 1600);
  }

  /**
   * Arrow-key navigation between sections. Guarded against form controls so
   * moving a caret in a text field never steals the interaction.
   */
  @HostListener('document:keydown', ['$event'])
  onArrowKey(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.key === 'ArrowRight') {
      if (this.activeStep() < this.steps.length - 1) {
        void this.next();
        event.preventDefault();
      }
    } else if (event.key === 'ArrowLeft') {
      if (this.activeStep() > 0) {
        void this.prev();
        event.preventDefault();
      }
    }
  }

  /** Split comma-separated text into a trimmed, de-duplicated string array. */
  private toList(text: string): string[] {
    return Array.from(
      new Set(
        text
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
  }

  /**
   * Persist the wizard's current answers. The profile service reports a failed
   * or skipped write as `false`; the UI must not flash a saved state then.
   */
  async updateProfile(): Promise<boolean> {
    const p = this.profile();
    const next: UserProfile = {
      ...p,
      musicalJourney: {
        ...p.musicalJourney,
        musicalInfluences: this.toList(this.influencesText()),
      },
      daw: this.toList(this.dawText()),
    };
    const saved = await this.userProfileService.updateProfile(next);
    if (saved === false) {
      this.saveError.set(
        'Your changes were not saved. They stay in this session — check your connection and try again.'
      );
      return false;
    }
    this.saveError.set('');
    return true;
  }

  toggleSkill(skill: string) {
    this.profile.update((p) => {
      const skills = p.skills || [];
      const index = skills.indexOf(skill);
      if (index > -1) {
        return { ...p, skills: skills.filter((s) => s !== skill) };
      } else {
        return { ...p, skills: [...skills, skill] };
      }
    });
  }

  hasSkill(skill: string): boolean {
    return (this.profile().skills || []).includes(skill);
  }

  toggleProductionStyle(style: string) {
    this.profile.update((p) => {
      const styles: string[] = p.productionStyles || [];
      const index = styles.indexOf(style);
      if (index > -1) {
        return { ...p, productionStyles: styles.filter((s) => s !== style) };
      } else {
        return { ...p, productionStyles: [...styles, style] };
      }
    });
  }

  hasProductionStyle(style: string): boolean {
    return (this.profile().productionStyles || []).includes(style);
  }

  toggleIncomeStream(stream: string) {
    this.profile.update((p) => {
      const streams = p.musicalJourney?.incomeStreams || [];
      return {
        ...p,
        musicalJourney: {
          ...p.musicalJourney,
          incomeStreams: streams.includes(stream)
            ? streams.filter((entry) => entry !== stream)
            : [...streams, stream],
        },
      };
    });
  }

  hasIncomeStream(stream: string): boolean {
    return (this.profile().musicalJourney?.incomeStreams || []).includes(stream);
  }

  /**
   * Finalize the dossier: persist everything and confirm the hand-off, then
   * surface the surfaces that consume what was just answered.
   */
  async initializeJourney() {
    const saved = await this.updateProfile();
    this.justSaved.set(false);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = null;
    this.initialized.set(saved);
  }
}
