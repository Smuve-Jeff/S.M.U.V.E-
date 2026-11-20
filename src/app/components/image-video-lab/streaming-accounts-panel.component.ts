import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { BroadcastIngestService, type IngestPlatform } from '../../services/broadcast-ingest.service';
import {
  StreamingPlatformsService,
  type StreamingPlatformId,
} from '../../services/streaming-platforms.service';

interface AccountRow {
  id: string;
  label: string;
  state: string;
  connected: boolean;
  connectable: boolean;
  rtmpReady: boolean | null;
}

/**
 * One streaming-account list shared by the Lab and Tha Spot.
 *
 * The account connections and the relay destinations already live in two
 * account-scoped services; this panel reads those services directly instead of
 * keeping a third copy. A host can link Twitch/Kick/Facebook here or in Tha
 * Spot and both surfaces show the same state, while RTMP keys stay in the
 * server-side Broadcast Push config that both link to.
 */
@Component({
  selector: 'app-streaming-accounts-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="accounts" aria-labelledby="lab-streaming-accounts-title">
      <div class="accounts-head">
        <div>
          <span class="accounts-eyebrow">Shared account list</span>
          <h4 id="lab-streaming-accounts-title" class="accounts-title">
            Streaming Accounts
          </h4>
        </div>
        <a class="accounts-link" [href]="configUrl" target="_blank" rel="noopener">
          CONFIGURE RTMP
        </a>
      </div>
      <p class="accounts-note">
        The same connections Tha Spot's Broadcast Push reads. Link an account
        here or there; save Kick, Facebook and custom RTMP keys in the shared
        Broadcast Push config.
      </p>
      <ul class="accounts-list">
        @for (row of rows(); track row.id) {
          <li class="accounts-row">
            <span class="accounts-name">{{ row.label }}</span>
            <span class="accounts-state" [class.accounts-state-on]="row.connected">
              {{ row.state }}
            </span>
            @if (row.connectable) {
              <button
                type="button"
                class="accounts-button"
                [disabled]="platforms.connecting() === row.id"
                (click)="connect(row)"
              >
                {{
                  platforms.connecting() === row.id
                    ? 'CONNECTING…'
                    : row.connected
                      ? 'RECONNECT'
                      : 'CONNECT'
                }}
              </button>
            }
            @if (row.rtmpReady !== null) {
              <span
                class="accounts-rtmp"
                [class.accounts-rtmp-ready]="row.rtmpReady"
              >
                {{ row.rtmpReady ? 'RTMP READY' : 'RTMP UNSET' }}
              </span>
            }
          </li>
        }
      </ul>
      @if (ingest.checkError(); as error) {
        <p class="accounts-warning" role="status">{{ error }}</p>
      }
      @if (showSettingsLink()) {
        <a class="accounts-settings" [href]="settingsUrl">
          ALL STREAMING SETTINGS →
        </a>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .accounts {
        display: grid;
        gap: 0.65rem;
        padding: 0.9rem;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 0.75rem;
        background: rgba(15, 23, 42, 0.55);
      }
      .accounts-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .accounts-eyebrow {
        display: block;
        color: #64748b;
        font-size: 0.55rem;
        font-weight: 900;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .accounts-title {
        margin: 0.15rem 0 0;
        color: #e2e8f0;
        font-size: 0.85rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .accounts-link {
        flex: none;
        padding: 0.45rem 0.65rem;
        border: 1px solid rgba(16, 185, 129, 0.45);
        border-radius: 0.5rem;
        color: #6ee7b7;
        font-size: 0.58rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-decoration: none;
      }
      .accounts-link:hover,
      .accounts-link:focus-visible {
        background: rgba(16, 185, 129, 0.12);
        outline: none;
      }
      .accounts-note,
      .accounts-warning {
        margin: 0;
        color: #94a3b8;
        font-size: 0.66rem;
        line-height: 1.45;
      }
      .accounts-warning {
        color: #fbbf24;
      }
      .accounts-settings {
        justify-self: start;
        color: #64748b;
        font-size: 0.55rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-decoration: none;
      }
      .accounts-settings:hover,
      .accounts-settings:focus-visible {
        color: #6ee7b7;
        outline: none;
      }
      .accounts-list {
        display: grid;
        gap: 0.35rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .accounts-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 0.55rem;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 0.5rem;
      }
      .accounts-name {
        min-width: 6.5rem;
        color: #e2e8f0;
        font-size: 0.62rem;
        font-weight: 900;
        letter-spacing: 0.1em;
      }
      .accounts-state {
        flex: 1;
        min-width: 7rem;
        color: #94a3b8;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .accounts-state-on {
        color: #6ee7b7;
      }
      .accounts-button {
        padding: 0.35rem 0.55rem;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 0.4rem;
        background: transparent;
        color: #e2e8f0;
        font-size: 0.56rem;
        font-weight: 900;
        letter-spacing: 0.1em;
        cursor: pointer;
      }
      .accounts-button:disabled {
        cursor: progress;
        opacity: 0.6;
      }
      .accounts-button:hover:not(:disabled),
      .accounts-button:focus-visible:not(:disabled) {
        border-color: #10b981;
        outline: none;
      }
      .accounts-rtmp {
        color: #f59e0b;
        font-size: 0.55rem;
        font-weight: 900;
        letter-spacing: 0.08em;
      }
      .accounts-rtmp-ready {
        color: #34d399;
      }
    `,
  ],
})
export class StreamingAccountsPanelComponent {
  readonly platforms = inject(StreamingPlatformsService);
  readonly ingest = inject(BroadcastIngestService);
  /** Off when this panel already sits on the Settings → Streaming page. */
  readonly showSettingsLink = input(true);

  /** Where the full RTMP rows and keys live; the same editor Tha Spot opens. */
  readonly configUrl = '/tha-spot?panel=broadcast';
  /** Shared Settings page that wraps this panel for Lab and Tha Spot. */
  readonly settingsUrl = '/settings/streaming';

  private readonly oauthRows: {
    id: StreamingPlatformId;
    label: string;
    rtmp: IngestPlatform;
  }[] = [
    { id: 'twitch', label: 'TWITCH', rtmp: 'twitch' },
    { id: 'kick', label: 'KICK', rtmp: 'kick' },
    { id: 'facebook', label: 'FACEBOOK', rtmp: 'facebook' },
  ];

  readonly rows = computed<AccountRow[]>(() => {
    const connections = this.platforms.connections();
    const destinations = this.ingest.destinations();
    const oauth = this.oauthRows.map((entry) => {
      const connection = connections[entry.id];
      const name = connection?.displayName?.trim();
      return {
        id: entry.id,
        label: entry.label,
        state: connection ? (name ? `LINKED · ${name}` : 'LINKED') : 'NOT LINKED',
        connected: !!connection,
        connectable: true,
        rtmpReady: !!destinations[entry.rtmp]?.ready,
      };
    });
    // The four custom slots are one shared pool, not four equal rows: summarise
    // the ones that are actually set and leave the per-slot editing to the
    // Broadcast Push config this panel links to. That keeps the shared panel
    // short enough to live inside the Lab's stream console.
    const customSlots = this.ingest.platforms.filter((platform) =>
      platform.id.startsWith('custom'),
    );
    const readySlots = customSlots.filter((platform) =>
      this.ingest.ready(platform.id),
    );
    const custom: AccountRow = {
      id: 'custom-rtmp',
      label: 'CUSTOM RTMP',
      state: readySlots.length
        ? `SET · ${readySlots
            .map((platform) => this.ingest.platformLabel(platform.id))
            .join(', ')}`
        : 'NO SLOTS SET',
      connected: readySlots.length > 0,
      connectable: false,
      rtmpReady: readySlots.length > 0,
    };
    return [...oauth, custom];
  });

  connect(row: AccountRow): void {
    void this.platforms.connect(row.id as StreamingPlatformId);
  }
}
