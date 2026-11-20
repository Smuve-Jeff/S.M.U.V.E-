import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  BroadcastIngestService,
  CUSTOM_INGEST_PLATFORMS,
  type CustomIngestPlatform,
} from '../../services/broadcast-ingest.service';

type ManualDestination = 'kick' | 'facebook' | CustomIngestPlatform;

interface DestinationDraft {
  label: string;
  rtmpUrl: string;
  streamKey: string;
}

interface SlotDefinition {
  id: ManualDestination;
  label: string;
  /** Custom slots expose a name field; Kick/Facebook already have one. */
  custom: boolean;
}

const SLOT_DEFINITIONS: readonly SlotDefinition[] = [
  { id: 'kick', label: 'KICK', custom: false },
  { id: 'facebook', label: 'FACEBOOK', custom: false },
  ...CUSTOM_INGEST_PLATFORMS.map((id, index) => ({
    id,
    label: `CUSTOM ${index + 1}`,
    custom: true,
  })),
];

const emptyDrafts = (): Record<ManualDestination, DestinationDraft> => ({
  kick: { label: '', rtmpUrl: '', streamKey: '' },
  facebook: { label: '', rtmpUrl: '', streamKey: '' },
  custom: { label: '', rtmpUrl: '', streamKey: '' },
  custom2: { label: '', rtmpUrl: '', streamKey: '' },
  custom3: { label: '', rtmpUrl: '', streamKey: '' },
  custom4: { label: '', rtmpUrl: '', streamKey: '' },
});

/**
 * Manual RTMP outputs for the Settings → Streaming page.
 *
 * The stream key is write-only: the server never echoes it back, so a saved
 * destination shows its URL/name and asks for the key again before an update.
 * Saving and clearing go through BroadcastIngestService, the same store the Lab
 * and Tha Spot read, so there is still one destination state in the app.
 */
@Component({
  selector: 'app-rtmp-destinations-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rtmp-editor" aria-labelledby="rtmp-editor-title">
      <div class="rtmp-head">
        <div>
          <span class="rtmp-eyebrow">Manual outputs</span>
          <h2 id="rtmp-editor-title">RTMP Destinations</h2>
        </div>
        <p class="rtmp-note">
          Stream keys are never read back. Enter the current key when you save a
          URL or name change.
        </p>
      </div>

      <div class="rtmp-grid">
        @for (slot of slots; track slot.id) {
          <article class="rtmp-card" [class.rtmp-card-ready]="ready(slot.id)">
            <div class="rtmp-card-head">
              <h3>{{ slot.label }}</h3>
              <span
                class="rtmp-state"
                [class.rtmp-state-ready]="ready(slot.id)"
              >
                {{ ready(slot.id) ? 'SAVED' : 'NOT SET' }}
              </span>
            </div>
            <p class="rtmp-detail">
              {{ ready(slot.id) ? detail(slot.id) : 'No RTMP destination saved.' }}
            </p>

            @if (slot.custom) {
              <label class="rtmp-field">
                <span>Name</span>
                <input
                  type="text"
                  [value]="labelValue(slot.id)"
                  (input)="setField(slot.id, 'label', $any($event.target).value)"
                  [attr.aria-label]="slot.label + ' destination name'"
                  autocomplete="off"
                />
              </label>
            }

            <label class="rtmp-field">
              <span>RTMP URL</span>
              <input
                type="url"
                inputmode="url"
                placeholder="rtmps://…"
                [value]="field(slot.id, 'rtmpUrl')"
                (input)="setField(slot.id, 'rtmpUrl', $any($event.target).value)"
                [attr.aria-label]="slot.label + ' RTMP URL'"
                autocomplete="off"
                spellcheck="false"
              />
            </label>

            <label class="rtmp-field">
              <span>Stream key</span>
              <input
                type="password"
                placeholder="Paste the stream key"
                [value]="field(slot.id, 'streamKey')"
                (input)="setField(slot.id, 'streamKey', $any($event.target).value)"
                [attr.aria-label]="slot.label + ' stream key'"
                autocomplete="new-password"
                spellcheck="false"
              />
            </label>

            @if (error(slot.id); as message) {
              <p class="rtmp-error" role="alert">{{ message }}</p>
            }

            <div class="rtmp-actions">
              <button
                type="button"
                class="rtmp-save"
                [disabled]="saving() !== null || !canSave(slot.id)"
                (click)="save(slot.id)"
              >
                {{
                  saving() === slot.id
                    ? 'SAVING…'
                    : ready(slot.id)
                      ? 'UPDATE'
                      : 'SAVE'
                }}
              </button>
              @if (ready(slot.id)) {
                <button
                  type="button"
                  class="rtmp-clear"
                  [disabled]="clearing() !== null || saving() !== null"
                  (click)="clear(slot.id)"
                >
                  {{
                    clearing() === slot.id
                      ? 'CLEARING…'
                      : pendingClear() === slot.id
                        ? 'CONFIRM CLEAR'
                        : 'CLEAR'
                  }}
                </button>
              }
            </div>
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .rtmp-editor {
        display: grid;
        gap: 0.9rem;
        padding: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.45);
      }
      .rtmp-head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 0.5rem 1rem;
      }
      .rtmp-eyebrow {
        display: block;
        color: #64748b;
        font-size: 0.55rem;
        font-weight: 900;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      h2 {
        margin: 0.15rem 0 0;
        color: #e2e8f0;
        font-size: 0.9rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .rtmp-note {
        max-width: 34rem;
        margin: 0;
        color: #94a3b8;
        font-size: 0.66rem;
        line-height: 1.45;
      }
      .rtmp-grid {
        display: grid;
        gap: 0.6rem;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      }
      .rtmp-card {
        display: grid;
        gap: 0.45rem;
        align-content: start;
        padding: 0.7rem;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 0.7rem;
        background: rgba(2, 6, 23, 0.35);
      }
      .rtmp-card-ready {
        border-color: rgba(16, 185, 129, 0.35);
      }
      .rtmp-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      h3 {
        margin: 0;
        color: #e2e8f0;
        font-size: 0.65rem;
        font-weight: 900;
        letter-spacing: 0.1em;
      }
      .rtmp-state {
        color: #f59e0b;
        font-size: 0.52rem;
        font-weight: 900;
        letter-spacing: 0.1em;
      }
      .rtmp-state-ready {
        color: #34d399;
      }
      .rtmp-detail {
        margin: 0;
        color: #94a3b8;
        font-size: 0.6rem;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }
      .rtmp-field {
        display: grid;
        gap: 0.2rem;
      }
      .rtmp-field span {
        color: #64748b;
        font-size: 0.5rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .rtmp-field input {
        width: 100%;
        padding: 0.4rem 0.5rem;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 0.4rem;
        background: rgba(2, 6, 23, 0.7);
        color: #e2e8f0;
        font-size: 0.65rem;
        font-family: inherit;
      }
      .rtmp-field input:focus {
        border-color: #10b981;
        outline: none;
      }
      .rtmp-error {
        margin: 0;
        color: #fca5a5;
        font-size: 0.58rem;
        line-height: 1.4;
      }
      .rtmp-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.1rem;
      }
      .rtmp-save,
      .rtmp-clear {
        padding: 0.38rem 0.6rem;
        border-radius: 0.4rem;
        background: transparent;
        font-size: 0.55rem;
        font-weight: 900;
        letter-spacing: 0.1em;
        cursor: pointer;
      }
      .rtmp-save {
        border: 1px solid rgba(16, 185, 129, 0.5);
        color: #6ee7b7;
      }
      .rtmp-clear {
        border: 1px solid rgba(248, 113, 113, 0.35);
        color: #fca5a5;
      }
      .rtmp-save:disabled,
      .rtmp-clear:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
      .rtmp-save:hover:not(:disabled),
      .rtmp-save:focus-visible:not(:disabled) {
        background: rgba(16, 185, 129, 0.12);
        outline: none;
      }
      .rtmp-clear:hover:not(:disabled),
      .rtmp-clear:focus-visible:not(:disabled) {
        background: rgba(239, 68, 68, 0.1);
        outline: none;
      }
    `,
  ],
})
export class RtmpDestinationsEditorComponent {
  readonly ingest = inject(BroadcastIngestService);
  readonly slots = SLOT_DEFINITIONS;
  readonly drafts = signal<Record<ManualDestination, DestinationDraft>>(
    emptyDrafts(),
  );
  readonly errors = signal<Partial<Record<ManualDestination, string>>>({});
  readonly saving = signal<ManualDestination | null>(null);
  readonly clearing = signal<ManualDestination | null>(null);
  readonly pendingClear = signal<ManualDestination | null>(null);

  field(
    slot: ManualDestination,
    field: keyof DestinationDraft,
  ): string {
    return this.drafts()[slot][field];
  }

  labelValue(slot: ManualDestination): string {
    return this.drafts()[slot].label || this.ingest.platformLabel(slot);
  }

  setField(
    slot: ManualDestination,
    field: keyof DestinationDraft,
    value: string,
  ): void {
    this.drafts.update((current) => ({
      ...current,
      [slot]: { ...current[slot], [field]: value },
    }));
    // Editing after arming CLEAR means the host changed their mind.
    this.pendingClear.set(null);
    this.setError(slot, '');
  }

  ready(slot: ManualDestination): boolean {
    return this.ingest.ready(slot);
  }

  detail(slot: ManualDestination): string {
    const destination = this.ingest.destinations()[slot];
    return destination?.detail?.trim() || 'DESTINATION READY';
  }

  error(slot: ManualDestination): string {
    return this.errors()[slot] ?? '';
  }

  canSave(slot: ManualDestination): boolean {
    return !!(
      this.drafts()[slot].rtmpUrl.trim() &&
      this.drafts()[slot].streamKey.trim()
    );
  }

  async save(slot: ManualDestination): Promise<void> {
    if (this.saving()) return;
    const draft = this.drafts()[slot];
    const rtmpUrl = draft.rtmpUrl.trim();
    const streamKey = draft.streamKey.trim();
    if (!/^rtmps?:\/\/\S+$/i.test(rtmpUrl)) {
      this.setError(slot, 'ENTER AN RTMP OR RTMPS URL');
      return;
    }
    if (!streamKey) {
      this.setError(slot, 'ENTER THE STREAM KEY');
      return;
    }

    this.pendingClear.set(null);
    this.saving.set(slot);
    this.setError(slot, '');
    try {
      const label = slot.startsWith('custom')
        ? draft.label.trim() || this.ingest.platformLabel(slot)
        : slot.toUpperCase();
      const saved = await this.ingest.saveDestination(
        slot,
        rtmpUrl,
        streamKey,
        label,
      );
      if (saved) this.setField(slot, 'streamKey', '');
    } finally {
      this.saving.set(null);
    }
  }

  async clear(slot: ManualDestination): Promise<void> {
    if (this.clearing()) return;
    if (this.pendingClear() !== slot) {
      this.pendingClear.set(slot);
      return;
    }
    this.pendingClear.set(null);
    this.clearing.set(slot);
    try {
      if (!(await this.ingest.clearDestination(slot))) return;
      this.drafts.update((current) => ({
        ...current,
        [slot]: { label: '', rtmpUrl: '', streamKey: '' },
      }));
      this.setError(slot, '');
    } finally {
      this.clearing.set(null);
    }
  }

  private setError(slot: ManualDestination, message: string): void {
    this.errors.update((current) => ({ ...current, [slot]: message }));
  }
}
