import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  BroadcastIngestService,
  type DestinationVerification,
  type IngestPlatform,
} from '../../services/broadcast-ingest.service';
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
  rtmpVerification: DestinationVerification | null;
}

/**
 * The complete account list for Settings → Streaming.
 *
 * The account connections and relay destinations live in two account-scoped
 * services; this panel reads those services directly instead of keeping a
 * third copy. The Lab and Tha Spot link here rather than rendering their own
 * account or RTMP forms.
 */
@Component({
  selector: 'app-streaming-accounts-panel',
  standalone: true,
  imports: [RouterLink],
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
        <div class="accounts-actions">
          <button
            type="button"
            class="accounts-sync"
            [disabled]="resyncing() || disconnecting() !== null"
            (click)="resync()"
            title="Re-read linked accounts and saved RTMP destinations"
          >
            {{ resyncing() ? 'SYNCING…' : 'RE-SYNC' }}
          </button>
          @if (showConfigLink()) {
            <a class="accounts-link" [routerLink]="configUrl">
              CONFIGURE RTMP
            </a>
          }
        </div>
      </div>
      <p class="accounts-note">
        Link accounts and save every RTMP URL and key here. Tha Spot and the
        Lab only link to this Settings → Streaming setup; they no longer keep
        their own copy of the configuration.
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
                [disabled]="
                  resyncing() ||
                  platforms.connecting() === row.id ||
                  disconnecting() === row.id
                "
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
              @if (row.connected) {
                <button
                  type="button"
                  class="accounts-button accounts-danger"
                  [disabled]="resyncing() || disconnecting() === row.id"
                  (click)="disconnect(row)"
                  [attr.title]="
                    pendingDisconnect() === row.id
                      ? 'Click again to unlink this provider from your account'
                      : 'Unlink this provider from your account'
                  "
                >
                  {{
                    disconnecting() === row.id
                      ? 'DISCONNECTING…'
                      : pendingDisconnect() === row.id
                        ? 'CONFIRM DISCONNECT'
                        : 'DISCONNECT'
                  }}
                </button>
              }
            }
            @if (row.rtmpReady !== null) {
              <span
                class="accounts-rtmp"
                [class.accounts-rtmp-ready]="
                  row.rtmpReady && row.rtmpVerification === 'verified'
                "
                [class.accounts-rtmp-unverified]="
                  row.rtmpReady && row.rtmpVerification === 'unverified'
                "
              >
                {{ rtmpLabel(row) }}
              </span>
            }
          </li>
        }
      </ul>
      @if (platforms.facebookPagePickerVisible()) {
        <div class="accounts-page" role="group" aria-label="Facebook Page">
          <span class="accounts-name">FACEBOOK PAGE</span>
          @if (platforms.loadingFacebookPages()) {
            <span class="accounts-state">LOADING PAGES…</span>
          }
          @if (platforms.facebookPages().length > 1) {
            <select
              class="accounts-select"
              [value]="platforms.facebookSelectedPageId()"
              [disabled]="platforms.selectingFacebookPage()"
              (change)="changeFacebookPage($event)"
              aria-label="Facebook Page for Live Video"
              title="Which Page receives the Facebook Live Video"
            >
              @for (page of platforms.facebookPages(); track page.id) {
                <option [value]="page.id" [selected]="page.selected">
                  {{ page.name }}{{ page.selected ? ' (CURRENT)' : '' }}
                </option>
              }
            </select>
          } @else if (
            platforms.facebookPages().length === 1 &&
            !platforms.loadingFacebookPages()
          ) {
            <span class="accounts-state">
              {{ platforms.facebookPages()[0].name }} (CURRENT)
            </span>
          } @else if (
            !platforms.loadingFacebookPages() &&
            !platforms.facebookPagesError()
          ) {
            <span class="accounts-warning">
              NO PAGES AVAILABLE — RECONNECT FACEBOOK WITH PAGE ACCESS
            </span>
          }
          @if (platforms.facebookPagesError(); as pageError) {
            <span class="accounts-warning" role="status">{{ pageError }}</span>
            <button
              type="button"
              class="accounts-button"
              [disabled]="platforms.loadingFacebookPages()"
              (click)="platforms.loadFacebookPages()"
            >
              RETRY
            </button>
          }
        </div>
        @if (platforms.facebookPages().length > 1) {
          <p class="accounts-note">
            Facebook Live Video publishes to the selected Page. Changing it
            also updates the Page name shown above.
          </p>
        } @else if (platforms.facebookPages().length === 1) {
          <p class="accounts-note">
            Facebook Live Video publishes to this Page.
          </p>
        }
      }
      @if (ingest.checkError(); as error) {
        <p class="accounts-warning" role="status">{{ error }}</p>
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
      .accounts-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.35rem;
      }
      .accounts-link,
      .accounts-sync {
        flex: none;
        padding: 0.45rem 0.65rem;
        border: 1px solid rgba(16, 185, 129, 0.45);
        border-radius: 0.5rem;
        background: transparent;
        color: #6ee7b7;
        font-size: 0.58rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-decoration: none;
        cursor: pointer;
      }
      .accounts-sync {
        border-color: rgba(148, 163, 184, 0.35);
        color: #cbd5e1;
      }
      .accounts-link:hover,
      .accounts-link:focus-visible,
      .accounts-sync:hover:not(:disabled),
      .accounts-sync:focus-visible:not(:disabled) {
        background: rgba(16, 185, 129, 0.12);
        outline: none;
      }
      .accounts-sync:disabled {
        cursor: progress;
        opacity: 0.6;
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
      .accounts-danger {
        border-color: rgba(248, 113, 113, 0.4);
        color: #fca5a5;
      }
      .accounts-danger:hover:not(:disabled),
      .accounts-danger:focus-visible:not(:disabled) {
        border-color: #ef4444;
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
      .accounts-rtmp-unverified {
        color: #fbbf24;
      }
      .accounts-page {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 0.55rem;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 0.5rem;
      }
      .accounts-select {
        flex: 1;
        min-width: 9rem;
        padding: 0.35rem 0.45rem;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 0.4rem;
        background: #0f172a;
        color: #e2e8f0;
        font: inherit;
        font-size: 0.6rem;
      }
    `,
  ],
})
export class StreamingAccountsPanelComponent {
  readonly platforms = inject(StreamingPlatformsService);
  readonly ingest = inject(BroadcastIngestService);
  /** Off when this panel already sits on the Settings → Streaming page. */
  readonly showConfigLink = input(true);

  /** The complete account + RTMP setup page. */
  readonly configUrl = '/settings/streaming';

  readonly resyncing = signal(false);
  readonly disconnecting = signal<StreamingPlatformId | null>(null);
  /** First click arms disconnect; the second confirms it. */
  readonly pendingDisconnect = signal<StreamingPlatformId | null>(null);

  private readonly oauthRows: {
    id: StreamingPlatformId;
    label: string;
    rtmp: IngestPlatform | null;
  }[] = [
    { id: 'twitch', label: 'TWITCH', rtmp: 'twitch' },
    // YouTube can be linked for account metadata but has no ingest path, so it
    // stays visible here without claiming an RTMP destination.
    { id: 'youtube', label: 'YOUTUBE', rtmp: null },
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
        rtmpReady: entry.rtmp ? !!destinations[entry.rtmp]?.ready : null,
        rtmpVerification: entry.rtmp
          ? (destinations[entry.rtmp]?.verification ?? null)
          : null,
      };
    });
    // The four custom slots are one shared pool, not four equal rows: summarise
    // the ones that are actually set and leave per-slot editing to the RTMP
    // editor directly below this panel on Settings → Streaming.
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
      rtmpVerification:
        readySlots.length === 0
          ? null
          : readySlots.every((platform) => this.ingest.verified(platform.id))
            ? 'verified'
            : 'unverified',
    };
    return [...oauth, custom];
  });

  rtmpLabel(row: AccountRow): string {
    if (!row.rtmpReady) return 'RTMP UNSET';
    if (row.rtmpVerification === 'verified') return 'RTMP VERIFIED';
    if (row.rtmpVerification === 'unverified') return 'RTMP UNVERIFIED';
    return 'RTMP LINKED';
  }

  async connect(row: AccountRow): Promise<void> {
    this.pendingDisconnect.set(null);
    await this.platforms.connect(row.id as StreamingPlatformId);
    // Linking can change the server-resolved push destination (Twitch), so
    // refresh the RTMP readiness this same panel reports.
    await this.ingest.load();
  }

  /** Re-read both halves of the shared state: accounts and destinations. */
  async resync(): Promise<void> {
    if (this.resyncing()) return;
    this.resyncing.set(true);
    this.pendingDisconnect.set(null);
    try {
      await Promise.all([this.platforms.sync(), this.ingest.load()]);
    } finally {
      this.resyncing.set(false);
    }
  }

  /** Keep the Page picker honest: a refused change snaps back to the live one. */
  async changeFacebookPage(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement | null;
    if (!select || this.platforms.selectingFacebookPage()) return;
    const wanted = select.value;
    if (await this.platforms.selectFacebookPage(wanted)) return;
    select.value = this.platforms.facebookSelectedPageId();
  }

  async disconnect(row: AccountRow): Promise<void> {
    if (!row.connected || this.disconnecting()) return;
    const id = row.id as StreamingPlatformId;
    if (this.pendingDisconnect() !== id) {
      this.pendingDisconnect.set(id);
      return;
    }
    this.pendingDisconnect.set(null);
    this.disconnecting.set(id);
    try {
      await this.platforms.disconnect(id);
      // The server may drop a destination that depended on this grant.
      await this.ingest.load();
    } finally {
      this.disconnecting.set(null);
    }
  }
}
