import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StreamingAccountsPanelComponent } from '../image-video-lab/streaming-accounts-panel.component';
import { RtmpDestinationsEditorComponent } from './rtmp-destinations-editor.component';

/**
 * Settings → Streaming: the one place that wraps the shared account panel.
 *
 * Both the Image & Video Lab and Tha Spot link here instead of owning their own
 * account forms. The panel reads the same server-backed stores those surfaces
 * use, so a connection made here appears in both immediately.
 */
@Component({
  selector: 'app-streaming-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StreamingAccountsPanelComponent, RtmpDestinationsEditorComponent],
  template: `
    <div class="streaming-settings-page">
      <div class="settings-shell">
        <header class="settings-head">
          <a class="back-link" href="/settings">← EXECUTIVE SETTINGS</a>
          <span class="eyebrow">Settings / Streaming</span>
          <h1>Streaming Setup</h1>
          <p class="lede">
            The complete streaming setup. Link Twitch, Kick or Facebook, then
            save Kick, Facebook or custom RTMP destinations below — the Image
            &amp; Video Lab and Tha Spot read the same connections and keys.
          </p>
          <div class="surface-jumps">
            <a class="jump" href="/image-video-lab">IMAGE &amp; VIDEO LAB</a>
            <a class="jump jump-accent" href="/tha-spot">THA SPOT</a>
          </div>
        </header>

        <section class="panel-shell" aria-label="Streaming accounts">
          <app-streaming-accounts-panel [showConfigLink]="false" />
        </section>

        <app-rtmp-destinations-editor />

        <section class="settings-help">
          <h2>How the shared setup works</h2>
          <ul>
            <li>
              Twitch, Kick and Facebook links are stored against your account,
              not against one editor. Signing into another account reloads only
              that account's connections.
            </li>
            <li>
              Kick, Facebook and custom RTMP keys are saved in the editor above.
              Keys are write-only: the saved URL and name stay visible, but an
              update asks for the key again.
            </li>
            <li>
              GO LIVE still verifies every selected destination before it issues
              a stream row, so an unlinked account or missing key stops the
              broadcast instead of leaving a ghost live row.
            </li>
          </ul>
        </section>

        <footer class="settings-foot">
          <a href="/settings">BACK TO SETTINGS</a>
          <a href="/image-video-lab">OPEN IMAGE &amp; VIDEO LAB</a>
          <a href="/tha-spot">OPEN THA SPOT</a>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .streaming-settings-page {
        min-height: 100%;
        padding: clamp(1rem, 4vw, 2.5rem);
        background:
          radial-gradient(
            circle at 15% 0%,
            rgba(16, 185, 129, 0.12),
            transparent 55%
          ),
          #020617;
        color: #e2e8f0;
      }
      .settings-shell {
        display: grid;
        gap: 1.25rem;
        width: min(880px, 100%);
        margin: 0 auto;
      }
      .settings-head {
        display: grid;
        gap: 0.55rem;
      }
      .back-link,
      .eyebrow,
      .jump,
      .settings-foot a {
        font-size: 0.6rem;
        font-weight: 900;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        text-decoration: none;
      }
      .back-link {
        color: #64748b;
      }
      .back-link:hover,
      .back-link:focus-visible {
        color: #6ee7b7;
        outline: none;
      }
      .eyebrow {
        margin-top: 0.4rem;
        color: #10b981;
      }
      h1 {
        margin: 0;
        font-size: clamp(1.5rem, 4vw, 2.1rem);
        font-weight: 900;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .lede {
        max-width: 62ch;
        margin: 0;
        color: #94a3b8;
        font-size: 0.85rem;
        line-height: 1.6;
      }
      .surface-jumps {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.4rem;
      }
      .jump {
        padding: 0.5rem 0.7rem;
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 0.5rem;
        color: #cbd5e1;
      }
      .jump:hover,
      .jump:focus-visible {
        border-color: #10b981;
        color: #6ee7b7;
        outline: none;
      }
      .jump-accent {
        border-color: rgba(16, 185, 129, 0.45);
        color: #6ee7b7;
      }
      .panel-shell {
        padding: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.45);
      }
      .settings-help {
        padding: 1rem 1.15rem;
        border: 1px solid rgba(148, 163, 184, 0.14);
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.28);
      }
      .settings-help h2 {
        margin: 0 0 0.6rem;
        font-size: 0.72rem;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #cbd5e1;
      }
      .settings-help ul {
        display: grid;
        gap: 0.55rem;
        margin: 0;
        padding-left: 1.1rem;
        color: #94a3b8;
        font-size: 0.75rem;
        line-height: 1.55;
      }
      .settings-foot {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.25rem;
        padding-top: 0.35rem;
      }
      .settings-foot a {
        color: #64748b;
      }
      .settings-foot a:hover,
      .settings-foot a:focus-visible {
        color: #6ee7b7;
        outline: none;
      }
    `,
  ],
})
export class StreamingSettingsComponent {}
