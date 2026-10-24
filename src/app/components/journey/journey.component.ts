import {
  Component,
  inject,
  signal,
  computed,
  effect,
  HostListener,
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
export class JourneyComponent {
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
      identified && Boolean(journey.experienceLevel),
      identified && Boolean((p.primaryGenre || '').trim()),
      identified &&
        Boolean(journey.preferredBpmRange) &&
        (p.skills?.length || 0) > 0,
      identified && Boolean((journey.currentFocus || '').trim()),
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

  constructor() {
    effect(() => {
      const p = this.userProfileService.profile();
      this.profile.set({ ...p });
      this.influencesText.set((p.musicalJourney?.musicalInfluences || []).join(', '));
      this.dawText.set((p.daw || []).join(', '));
    });
  }

  next() {
    if (this.activeStep() < this.steps.length - 1) {
      // Auto-save each section as the artist moves on, so walking away can
      // never lose what was typed on an earlier step.
      this.updateProfile();
      this.flashSaved();
      this.activeStep.update((s) => s + 1);
      this.maxStepReached.update((m) => Math.max(m, this.activeStep()));
    }
  }
  prev() {
    if (this.activeStep() > 0) {
      this.updateProfile();
      this.flashSaved();
      this.activeStep.update((s) => s - 1);
    }
  }

  /** Jump to any step already reached; the dossier step stays forward-only. */
  jumpTo(step: number) {
    if (step < 0 || step > this.maxStepReached() || step === this.activeStep())
      return;
    this.updateProfile();
    this.flashSaved();
    this.activeStep.set(step);
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
        this.next();
        event.preventDefault();
      }
    } else if (event.key === 'ArrowLeft') {
      if (this.activeStep() > 0) {
        this.prev();
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

  updateProfile() {
    const p = this.profile();
    const next: UserProfile = {
      ...p,
      musicalJourney: {
        ...p.musicalJourney,
        musicalInfluences: this.toList(this.influencesText()),
      },
      daw: this.toList(this.dawText()),
    };
    this.userProfileService.updateProfile(next);
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

  /**
   * Finalize the dossier: persist everything and confirm the hand-off, then
   * surface the surfaces that consume what was just answered.
   */
  initializeJourney() {
    this.updateProfile();
    this.justSaved.set(false);
    if (this.savedTimer) clearTimeout(this.savedTimer);
    this.savedTimer = null;
    this.initialized.set(true);
  }
}
