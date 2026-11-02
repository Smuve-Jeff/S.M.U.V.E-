import {
  Component,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { HapticService } from "../../services/haptic.service";
import {
  BEGINNER_SONG_STEPS,
  BeginnerPathService,
} from "./beginner-path.service";

export type { WizardStep } from "./beginner-path.service";

@Component({
  selector: "app-beginner-wizard",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="wizard-shell">
      @if (progressError()) {
        <!-- Progress that did not reach storage must not look finished. -->
        <p class="wizard-progress-error" role="status">
          {{ progressError() }}
        </p>
      }

      <!-- Hero header -->
      <header class="wizard-hero">
        <div class="wizard-hero-icon">
          <span class="material-symbols-outlined" aria-hidden="true">graphic_eq</span>
        </div>
        <h1 class="wizard-hero-title">Make Your First Song</h1>
        <p class="wizard-hero-sub">
          Six small steps. Do one thing, tap Done, and the next step appears.
          At the end you have a whole song.
        </p>
        <div
          class="wizard-progress-track"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="progressPercent()"
          [attr.aria-label]="
            'Song path: ' + completedCount() + ' of ' + steps.length + ' steps done'
          "
        >
          <div
            class="wizard-progress-fill"
            [style.width.%]="progressPercent()"
          ></div>
        </div>
        <span class="wizard-progress-label">
          Step {{ currentStep().id }} of {{ steps.length }} ·
          {{ completedCount() }} done
        </span>
      </header>

      <!-- The whole path at a glance. Tap a word to jump; nothing is marked
           done until its step is finished. -->
      <nav class="wizard-path" aria-label="All six steps">
        <button
          *ngFor="let s of steps"
          type="button"
          class="wizard-path-step"
          [class.wizard-path-done]="isStepDone(s.id)"
          [class.wizard-path-current]="s.id === currentStep().id"
          [attr.aria-current]="s.id === currentStep().id ? 'step' : null"
          [attr.aria-label]="
            'Step ' + s.id + ': ' + s.title + (isStepDone(s.id) ? ' (done)' : '')
          "
          (click)="goToStep(s.id)"
        >
          <span class="wizard-path-dot" aria-hidden="true">
            {{ isStepDone(s.id) ? "✓" : s.id }}
          </span>
          <span class="wizard-path-label">{{ s.short }}</span>
        </button>
      </nav>

      <!-- One step at a time: a kid should never have to choose between six
           cards or work out which one comes first. -->
      <section class="wizard-cards" aria-live="polite">
        <article
          class="wizard-card wizard-card-active"
          [style.--card-accent]="currentStep().accentColor"
        >
          <div class="wizard-card-top">
            <div class="wizard-card-icon">
              <span class="material-symbols-outlined" aria-hidden="true">{{
                currentStep().icon
              }}</span>
            </div>
            <div class="wizard-card-step-badge" aria-hidden="true">
              <span>{{ currentStep().id }}</span>
            </div>
          </div>

          <div class="wizard-card-body">
            <p class="wizard-card-subtitle">{{ currentStep().subtitle }}</p>
            <h2 class="wizard-card-title">{{ currentStep().title }}</h2>

            <p class="wizard-card-desc">
              <span class="wizard-label">Do this:</span>
              {{ currentStep().description }}
            </p>

            <p class="wizard-example">
              <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
              <span>
                <span class="wizard-label">Sounds like:</span>
                {{ currentStep().example }}
              </span>
            </p>

            <div class="wizard-card-tip">
              <span
                class="wizard-tip-icon material-symbols-outlined"
                aria-hidden="true"
                >lightbulb</span
              >
              {{ currentStep().tip }}
            </div>
          </div>

          <div class="wizard-card-actions">
            <button
              type="button"
              class="wizard-do"
              (click)="openStep()"
            >
              <span class="material-symbols-outlined" aria-hidden="true"
                >arrow_outward</span
              >
              {{ currentStep().action }}
            </button>
            <button type="button" class="wizard-next" (click)="completeAndAdvance()">
              {{
                allDone()
                  ? "Done — my song is finished"
                  : isLastStep()
                    ? "I did this — finish"
                    : "I did this — next step"
              }}
            </button>
          </div>
        </article>

        @if (allDone()) {
          <p class="wizard-finish" role="status">
            That's a whole song — beat, melody, voice, order, mix and a saved
            copy. Tap SHOW PRO MODE whenever you want the full studio; your
            steps stay ticked.
          </p>
        }
      </section>

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
  styleUrls: ["./beginner-wizard.component.css"],
})
export class BeginnerWizardComponent {
  @Output() navigateToView = new EventEmitter<string>();
  @Output() switchToPro = new EventEmitter<void>();

  private haptic = inject(HapticService);

  private readonly STORAGE_KEY = "smuve_wizard_done";

  /**
   * The song, in the order it is actually made. Each step names one action,
   * shows what the result sounds like in plain words, and opens the real tool —
   * so the path teaches the whole process instead of describing it.
   */
  steps = BEGINNER_SONG_STEPS;

  private readonly beginnerPath = inject(BeginnerPathService);

  constructor() {
    // The in-tool hint shows the same step the wizard is on, including after
    // a jump from the path strip.
    this.beginnerPath.select(this.currentStep().id);
  }

  doneSteps = signal<Set<number>>(this.loadDoneSteps());
  /** Set when this device refused to store wizard progress. */
  readonly progressError = signal<string | null>(null);

  /** Which step is on screen. Resumes where the artist left off. */
  stepIndex = signal(this.firstUnfinishedIndex());

  currentStep = computed(() => this.steps[this.stepIndex()]);

  isLastStep = computed(() => this.stepIndex() === this.steps.length - 1);

  completedCount = computed(() => this.doneSteps().size);

  allDone = computed(() => this.completedCount() === this.steps.length);

  progressPercent = computed(
    () => (this.completedCount() / this.steps.length) * 100,
  );

  isStepDone(id: number): boolean {
    return this.doneSteps().has(id);
  }

  /** Jump anywhere on the path without claiming the step is finished. */
  goToStep(id: number) {
    const index = this.steps.findIndex((s) => s.id === id);
    if (index === -1) return;
    this.haptic.light();
    this.stepIndex.set(index);
    this.beginnerPath.select(id);
  }

  /** Open the real Studio tool for the step on screen. */
  openStep() {
    this.haptic.light();
    this.navigateToView.emit(this.currentStep().targetView);
  }

  /** Tick this step, store the tick, then show the next unfinished step. */
  completeAndAdvance() {
    this.haptic.medium();
    this.markDone(this.currentStep().id);
    const next = this.steps.findIndex(
      (step, index) =>
        index > this.stepIndex() && !this.doneSteps().has(step.id),
    );
    if (next !== -1) {
      this.stepIndex.set(next);
    } else if (!this.isLastStep()) {
      this.stepIndex.set(this.stepIndex() + 1);
    }
    this.beginnerPath.select(this.currentStep().id);
  }

  resetWizard() {
    this.haptic.medium();
    this.doneSteps.set(new Set());
    this.persistDoneSteps(new Set());
    this.stepIndex.set(0);
    this.beginnerPath.select(this.steps[0].id);
  }

  private markDone(id: number) {
    if (this.isStepDone(id)) return;
    const next = new Set(this.doneSteps());
    next.add(id);
    this.doneSteps.set(next);
    this.persistDoneSteps(next);
  }

  /** First step without a tick; the last step when everything is done. */
  private firstUnfinishedIndex(): number {
    const done = this.doneSteps();
    const index = this.steps.findIndex((step) => !done.has(step.id));
    return index === -1 ? this.steps.length - 1 : index;
  }

  private loadDoneSteps(): Set<number> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  }

  /**
   * Persist completed steps. Storage can refuse (quota, private mode); when it
   * does the artist must be told, or finished steps silently reset on reload.
   */
  private persistDoneSteps(set: Set<number>) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(Array.from(set)));
      if (this.progressError()) this.progressError.set(null);
    } catch {
      this.progressError.set(
        "Progress could not be saved on this device. Finished steps may reset after a reload.",
      );
    }
  }
}
