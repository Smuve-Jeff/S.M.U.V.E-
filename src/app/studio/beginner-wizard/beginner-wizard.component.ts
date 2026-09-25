import {
  Component,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HapticService } from '../../services/haptic.service';

export interface WizardStep {
  id: number;
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  targetView: string;
  accentColor: string;
  tip: string;
}

@Component({
  selector: 'app-beginner-wizard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wizard-shell">
      <!-- Hero header -->
      <header class="wizard-hero">
        <div class="wizard-hero-icon">🎵</div>
        <h1 class="wizard-hero-title">Make Your First Song</h1>
        <p class="wizard-hero-sub">
          Follow these 6 easy steps — no experience needed!
        </p>
        <div class="wizard-progress-track">
          <div
            class="wizard-progress-fill"
            [style.width.%]="progressPercent()"
          ></div>
        </div>
        <span class="wizard-progress-label">
          {{ completedCount() }} of {{ steps.length }} steps done
        </span>
      </header>

      <!-- Step cards -->
      <div class="wizard-cards">
        <button
          *ngFor="let step of steps; let i = index"
          type="button"
          class="wizard-card"
          [class.wizard-card-done]="isStepDone(step.id)"
          [class.wizard-card-active]="
            !isStepDone(step.id) && i === nextStepIndex()
          "
          [style.--card-accent]="step.accentColor"
          (click)="onStepClick(step)"
        >
          <div class="wizard-card-step-badge">
            <span *ngIf="!isStepDone(step.id)">{{ step.id }}</span>
            <span *ngIf="isStepDone(step.id)" class="wizard-check">✓</span>
          </div>
          <div class="wizard-card-icon">{{ step.icon }}</div>
          <div class="wizard-card-body">
            <h3 class="wizard-card-title">{{ step.title }}</h3>
            <p class="wizard-card-subtitle">{{ step.subtitle }}</p>
            <p class="wizard-card-desc">{{ step.description }}</p>
          </div>
          <div class="wizard-card-tip">
            <span class="wizard-tip-icon">💡</span>
            {{ step.tip }}
          </div>
          <div class="wizard-card-cta">
            <span *ngIf="!isStepDone(step.id)">
              {{ i === nextStepIndex() ? 'Start This Step' : 'Do This Later' }}
            </span>
            <span *ngIf="isStepDone(step.id)">Done! ✓</span>
          </div>
        </button>
      </div>

      <!-- Quick actions footer -->
      <footer class="wizard-footer">
        <button
          type="button"
          class="wizard-footer-btn wizard-footer-pro"
          (click)="switchToPro.emit()"
        >
          <span class="material-symbols-outlined">auto_awesome</span>
          I Know What I'm Doing — Show Pro Mode
        </button>
        <button
          type="button"
          class="wizard-footer-btn wizard-footer-reset"
          (click)="resetWizard()"
        >
          <span class="material-symbols-outlined">restart_alt</span>
          Start Over
        </button>
      </footer>
    </div>
  `,
  styleUrls: ['./beginner-wizard.component.css'],
})
export class BeginnerWizardComponent {
  @Output() navigateToView = new EventEmitter<string>();
  @Output() switchToPro = new EventEmitter<void>();

  private haptic = inject(HapticService);

  private readonly STORAGE_KEY = 'smuve_wizard_done';

  steps: WizardStep[] = [
    {
      id: 1,
      key: 'record',
      icon: '🎤',
      title: 'Record Your Voice',
      subtitle: 'Step 1 — Capture your sound',
      description:
        "Hit the big record button and sing, rap, or speak. It's that easy! You can always redo it — every pass becomes a take you can pick from later.",
      targetView: 'audio-recorder',
      accentColor: '#E11D48',
      tip: 'Find a quiet spot and hold your phone about 6 inches from your mouth.',
    },
    {
      id: 2,
      key: 'beat',
      icon: '🥁',
      title: 'Add a Beat',
      subtitle: 'Step 2 — Pick a rhythm',
      description:
        'Choose from ready-made drum patterns or let the AI generate a style. Tap the pads to make your own groove — no music theory needed!',
      targetView: 'drum-machine',
      accentColor: '#F59E0B',
      tip: 'Start with a simple kick-snare pattern. The "Four on the Floor" preset is a great start!',
    },
    {
      id: 3,
      key: 'melody',
      icon: '🎹',
      title: 'Add a Melody',
      subtitle: 'Step 3 — Play some notes',
      description:
        "Use the piano keys to add chords or a melody, or tap notes straight into the piano roll. Don't worry about wrong notes — just experiment! See them as sheet music in Score view.",
      targetView: 'piano-roll',
      accentColor: '#8B5CF6',
      tip: 'Try pressing only the white keys. They all sound good together in C major!',
    },
    {
      id: 4,
      key: 'takes',
      icon: '🎬',
      title: 'Record Takes & Comp',
      subtitle: 'Step 4 — Keep the best pass',
      description:
        'Arm punch-in and record a few takes of your part. Tap a take to make it active, stack a comp, or assign different takes to different bars — like a pro.',
      targetView: 'arrangement',
      accentColor: '#F97316',
      tip: 'Record 3 takes, then tap the best moments from each to build one perfect take.',
    },
    {
      id: 5,
      key: 'mix',
      icon: '🎛️',
      title: 'Mix It Together',
      subtitle: 'Step 5 — Balance your sound',
      description:
        'Slide the volume knobs so nothing is too loud or too quiet. Drop WASM effects into the Effects Rack and polish the whole song in Mastering.',
      targetView: 'mixer',
      accentColor: '#0EA5E9',
      tip: 'Your voice should be the loudest thing. Bring the beat up until it feels right under your voice.',
    },
    {
      id: 6,
      key: 'export',
      icon: '🚀',
      title: 'Export & Share',
      subtitle: 'Step 6 — Ship your song',
      description:
        'Render a pro offline bounce, export as WAV, MP3, M4A or OGG, save a MIDI file, or share straight from the native share sheet.',
      targetView: 'arrangement',
      accentColor: '#10B981',
      tip: 'Export WAV for best quality, MP3 for small files to text, and use Share to send it anywhere in one tap.',
    },
  ];

  doneSteps = signal<Set<number>>(this.loadDoneSteps());

  completedCount = computed(() => this.doneSteps().size);

  progressPercent = computed(
    () => (this.completedCount() / this.steps.length) * 100
  );

  nextStepIndex = computed(() => {
    const done = this.doneSteps();
    const idx = this.steps.findIndex((s) => !done.has(s.id));
    return idx === -1 ? this.steps.length - 1 : idx;
  });

  isStepDone(id: number): boolean {
    return this.doneSteps().has(id);
  }

  onStepClick(step: WizardStep) {
    this.haptic.light();
    this.navigateToView.emit(step.targetView);
    // Mark as done after navigating (user will complete in the view)
    if (!this.isStepDone(step.id)) {
      this.doneSteps.update((set) => {
        const next = new Set(set);
        next.add(step.id);
        this.persistDoneSteps(next);
        return next;
      });
    }
  }

  resetWizard() {
    this.haptic.medium();
    this.doneSteps.set(new Set());
    this.persistDoneSteps(new Set());
  }

  private loadDoneSteps(): Set<number> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  }

  private persistDoneSteps(set: Set<number>) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }
}
