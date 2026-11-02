import { Component, computed, inject } from "@angular/core";
import { BeginnerPathService } from "./beginner-path.service";

/**
 * Keeps the current Beginner Mode step visible while the artist is inside a
 * tool. The wizard only exists in the arrangement slot; without this strip the
 * path vanished the moment someone opened the Beat Machine or Recorder.
 *
 * Visibility is the parent's decision (Beginner Mode, and not the arrangement
 * view where the wizard already shows the step), so this component stays a
 * plain readout with no navigation of its own.
 */
@Component({
  selector: "app-beginner-step-hint",
  standalone: true,
  template: `
    <aside class="beginner-step-hint" aria-label="Beginner step">
      <span class="beginner-step-hint-badge">
        Step {{ step().id }} of {{ total() }}
      </span>
      <span class="beginner-step-hint-title">{{ step().title }}</span>
      <span class="beginner-step-hint-do">
        <span class="beginner-step-hint-label">Do this:</span>
        {{ step().description }}
      </span>
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: 0 0 auto;
        padding: 6px 12px 0;
      }

      .beginner-step-hint {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 10px;
        max-width: 900px;
        margin: 0 auto;
        padding: 8px 12px;
        border: 1px solid
          color-mix(in srgb, var(--teal-500, #00e5ff) 32%, transparent);
        border-radius: 10px;
        background: color-mix(
          in srgb,
          var(--ivory-panel, #14192e) 88%,
          transparent
        );
        font-family: var(--font-sans);
        line-height: 1.35;
      }

      .beginner-step-hint-badge {
        flex: 0 0 auto;
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(
          in srgb,
          var(--teal-500, #00e5ff) 18%,
          transparent
        );
        color: var(--teal-400, #66f0ff);
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .beginner-step-hint-title {
        flex: 0 0 auto;
        font-size: 0.82rem;
        font-weight: 900;
        color: var(--espresso-text, #f1f5ff);
      }

      .beginner-step-hint-do {
        flex: 1 1 220px;
        min-width: 0;
        font-size: 0.75rem;
        color: var(--espresso-muted, #94a3c8);
      }

      .beginner-step-hint-label {
        margin-right: 4px;
        font-family: var(--font-mono);
        font-size: 8px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--teal-500, #00e5ff);
      }

      /* Portrait phones: the action moves under the title and is capped at two
         lines, so the strip cannot grow with a long instruction. */
      @media (max-width: 480px) {
        :host {
          padding: 4px 8px 0;
        }

        .beginner-step-hint {
          gap: 2px 8px;
          padding: 6px 10px;
        }

        .beginner-step-hint-do {
          flex-basis: 100%;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      /* Landscape phones: the canvas is ~200px tall, so the step keeps its
         number and title only — one compact row instead of a second header. */
      @media (max-height: 500px) {
        :host {
          padding: 2px 8px 0;
        }

        .beginner-step-hint {
          flex-wrap: nowrap;
          padding: 3px 8px;
          gap: 2px 8px;
        }

        .beginner-step-hint-badge {
          padding: 1px 6px;
          font-size: 8px;
        }

        .beginner-step-hint-title {
          font-size: 0.74rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .beginner-step-hint-do {
          display: none;
        }
      }
    `,
  ],
})
export class BeginnerStepHintComponent {
  private readonly path = inject(BeginnerPathService);

  readonly step = this.path.currentStep;
  readonly total = computed(() => this.path.steps.length);
}
