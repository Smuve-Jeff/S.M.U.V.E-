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
          Follow these 5 easy steps — no experience needed!
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
          [class.wizard-card-active]="!isStepDone(step.id) && i === nextStepIndex()"
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
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }

      .wizard-shell {
        min-height: 100%;
        padding: 1.5rem 1rem 6rem;
        max-width: 860px;
        margin: 0 auto;
      }

      /* ── Hero ──────────────────────────────── */
      .wizard-hero {
        text-align: center;
        padding: 2rem 1rem 1.5rem;
      }

      .wizard-hero-icon {
        font-size: 3rem;
        margin-bottom: 0.5rem;
        animation: wizardBounce 2s ease-in-out infinite;
      }

      @keyframes wizardBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }

      .wizard-hero-title {
        font-size: 1.75rem;
        font-weight: 900;
        color: var(--espresso-text, #F1F5FF);
        letter-spacing: -0.02em;
        margin: 0 0 0.5rem;
      }

      .wizard-hero-sub {
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--espresso-muted, #94A3C8);
        margin: 0 0 1.25rem;
        line-height: 1.4;
      }

      .wizard-progress-track {
        width: 100%;
        max-width: 320px;
        height: 8px;
        background: var(--ivory-line, rgba(180,200,255,0.08));
        border-radius: 99px;
        margin: 0 auto 0.5rem;
        overflow: hidden;
      }

      .wizard-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--teal-500, #0E7C7B), var(--teal-400, #2BA09C));
        border-radius: 99px;
        transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .wizard-progress-label {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--espresso-muted, #94A3C8);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      /* ── Cards grid ────────────────────────── */
      .wizard-cards {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
        margin-top: 1.5rem;
      }

      @media (min-width: 600px) {
        .wizard-cards {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 900px) {
        .wizard-cards {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* ── Individual card ───────────────────── */
      .wizard-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1.25rem;
        background: var(--ivory-panel, #14192E);
        border: 2px solid var(--ivory-line, rgba(180,200,255,0.08));
        border-radius: 16px;
        cursor: pointer;
        text-align: left;
        transition: all 0.25s ease;
        -webkit-tap-highlight-color: transparent;
        min-height: 180px;
        overflow: hidden;
        font-family: inherit;
        color: inherit;
        width: 100%;
      }

      .wizard-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: var(--card-accent, var(--teal-500));
        border-radius: 16px 16px 0 0;
        opacity: 0.5;
        transition: opacity 0.2s;
      }

      .wizard-card:hover,
      .wizard-card-active {
        border-color: var(--card-accent, var(--teal-500));
        transform: translateY(-2px);
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.15),
          0 0 0 1px color-mix(in srgb, var(--card-accent, var(--teal-500)) 20%, transparent);
      }

      .wizard-card:hover::before,
      .wizard-card-active::before {
        opacity: 1;
      }

      .wizard-card-done {
        opacity: 0.7;
        border-color: var(--teal-600, #0A5F5E);
      }

      .wizard-card-done::before {
        background: var(--teal-600, #0A5F5E);
        opacity: 1;
      }

      .wizard-card-step-badge {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--card-accent, var(--teal-500));
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 900;
      }

      .wizard-card-done .wizard-card-step-badge {
        background: var(--teal-600, #0A5F5E);
      }

      .wizard-check {
        font-size: 1rem;
      }

      .wizard-card-icon {
        font-size: 2rem;
        line-height: 1;
      }

      .wizard-card-body {
        flex: 1;
      }

      .wizard-card-title {
        font-size: 1rem;
        font-weight: 800;
        color: var(--espresso-text, #F1F5FF);
        margin: 0 0 0.25rem;
      }

      .wizard-card-subtitle {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--card-accent, var(--teal-500));
        margin: 0 0 0.35rem;
      }

      .wizard-card-desc {
        font-size: 0.8rem;
        font-weight: 400;
        color: var(--espresso-muted, #94A3C8);
        margin: 0;
        line-height: 1.4;
      }

      .wizard-card-tip {
        display: flex;
        align-items: flex-start;
        gap: 0.35rem;
        font-size: 0.7rem;
        font-weight: 500;
        color: var(--espresso-muted, #94A3C8);
        background: rgba(255, 255, 255, 0.03);
        padding: 0.5rem 0.65rem;
        border-radius: 8px;
        line-height: 1.3;
        width: 100%;
        box-sizing: border-box;
      }

      .wizard-tip-icon {
        flex-shrink: 0;
      }

      .wizard-card-cta {
        font-size: 0.75rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--card-accent, var(--teal-500));
        padding-top: 0.25rem;
      }

      .wizard-card-done .wizard-card-cta {
        color: var(--teal-600, #0A5F5E);
      }

      /* ── Footer ────────────────────────────── */
      .wizard-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        gap: 0.75rem;
        padding: 1rem;
        background: linear-gradient(180deg, transparent 0%, var(--ivory-deep, #06091A) 30%);
        z-index: 50;
      }

      .wizard-footer-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.85rem 1rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
        -webkit-tap-highlight-color: transparent;
        min-height: 48px;
        font-family: inherit;
      }

      .wizard-footer-pro {
        background: var(--teal-500, #0E7C7B);
        color: #fff;
      }

      .wizard-footer-pro:hover {
        background: var(--teal-600, #0A5F5E);
      }

      .wizard-footer-reset {
        background: var(--ivory-panel, #14192E);
        color: var(--espresso-muted, #94A3C8);
        border: 1px solid var(--ivory-line, rgba(180,200,255,0.08));
      }

      .wizard-footer-reset:hover {
        border-color: var(--espresso-muted, #94A3C8);
      }

      /* ── Mobile adjustments ────────────────── */
      @media (max-width: 480px) {
        .wizard-shell {
          padding: 1rem 0.75rem 5.5rem;
        }

        .wizard-hero-title {
          font-size: 1.35rem;
        }

        .wizard-card {
          padding: 1rem;
          min-height: 160px;
        }
      }
    `,
  ],
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
        'Hit the big record button and sing, rap, or speak. It\'s that easy! You can always redo it.',
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
        'Choose from ready-made drum patterns. Tap the pads to make your own groove — no music theory needed!',
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
        'Use the piano keys to add chords or a melody. Don\'t worry about wrong notes — just experiment!',
      targetView: 'piano-roll',
      accentColor: '#8B5CF6',
      tip: 'Try pressing only the white keys. They all sound good together in C major!',
    },
    {
      id: 4,
      key: 'mix',
      icon: '🎛️',
      title: 'Mix It Together',
      subtitle: 'Step 4 — Balance your sound',
      description:
        'Slide the volume knobs so nothing is too loud or too quiet. Make your voice and beat blend perfectly.',
      targetView: 'mixer',
      accentColor: '#0EA5E9',
      tip: 'Your voice should be the loudest thing. Bring the beat up until it feels right under your voice.',
    },
    {
      id: 5,
      key: 'export',
      icon: '🚀',
      title: 'Save & Share',
      subtitle: 'Step 5 — Export your song',
      description:
        'Save your creation as an audio file you can share with friends, post on social media, or keep working on!',
      targetView: 'arrangement',
      accentColor: '#10B981',
      tip: 'Export as WAV for best quality, or MP3 if you want a smaller file to text to friends.',
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
