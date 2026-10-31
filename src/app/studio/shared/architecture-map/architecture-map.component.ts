import { Component, EventEmitter, HostListener, Output } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * Architecture Map — the one-tap mental model of the Studio.
 *
 * Opened from the rail's "Music Map" button. Shows the four layers
 * (Surfaces → Song Document → Engine → Support) and the rule that makes the
 * whole Studio click: every surface edits the SAME song document
 * (MusicManagerService.tracks()); the engine plays whatever that document
 * says. The sheet never navigates on its own — it asks the shell, which owns
 * every view swap — so the CTA is a plain output (`onQuickSession`).
 */
@Component({
  selector: "app-architecture-map",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="arch-map-backdrop" (click)="close.emit()">
      <div
        class="arch-map-sheet"
        (click)="$event.stopPropagation()"
        role="dialog"
        aria-modal="true"
        aria-label="Studio architecture map"
      >
        <header class="arch-map-head">
          <div>
            <h2>How the Studio becomes music</h2>
            <p>One document. Different editors on it. That's the whole design.</p>
          </div>
          <button
            type="button"
            class="arch-map-close"
            aria-label="Close the map"
            (click)="close.emit()"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>

        <div class="arch-map-layers">
          <div class="arch-layer">
            <div class="arch-layer-rank">1</div>
            <div class="arch-layer-body">
              <h3>Surfaces — what you touch</h3>
              <p>Drum Machine, Piano Roll, Mixer, Quick Session… each rail view is a different window onto the same music.</p>
            </div>
          </div>
          <div class="arch-arrow"><span class="material-symbols-outlined">south</span><em>every tap writes here</em></div>
          <div class="arch-layer arch-layer-core">
            <div class="arch-layer-rank">2</div>
            <div class="arch-layer-body">
              <h3>THE SONG DOCUMENT — one truth</h3>
              <p>MusicManagerService holds one <code>tracks()</code> list: every note, pattern and stem you've written. Piano roll, MIDI import, AI producer — every edit ends at this same door.</p>
            </div>
          </div>
          <div class="arch-arrow"><span class="material-symbols-outlined">south</span><em>the engine reads it</em></div>
          <div class="arch-layer">
            <div class="arch-layer-rank">3</div>
            <div class="arch-layer-body">
              <h3>Engine — clock &amp; sound</h3>
              <p>A WebAudio loop turns the document into sound step by step: your tempo, your count-in, your loop. You never touch this — you edit the document above it.</p>
            </div>
          </div>
          <div class="arch-arrow"><span class="material-symbols-outlined">south</span><em>supported by</em></div>
          <div class="arch-layer">
            <div class="arch-layer-rank">4</div>
            <div class="arch-layer-body">
              <h3>Support — everything else</h3>
              <p>Save/load, undo, instruments, AI helpers, export. Bookkeeping that never bypasses the document.</p>
            </div>
          </div>
        </div>

        <section class="arch-map-moves">
          <h3>Making a beat = four moves</h3>
          <ol>
            <li><strong>Set the tempo &amp; tap steps</strong> — Quick Session or the Drum Machine.</li>
            <li><strong>Add melodic layers</strong> — Piano Roll, Chords, Synth: new tracks in the same document.</li>
            <li><strong>Arrange</strong> — drag patterns into a song on the Arrangement timeline.</li>
            <li><strong>Mix &amp; export</strong> — the Mixer adds faders, Export renders. The beat never leaves the document.</li>
          </ol>
        </section>

        <footer class="arch-map-foot">
          <button type="button" class="arch-map-cta" (click)="onQuickSession.emit()">
            <span class="material-symbols-outlined">bolt</span>
            Start a beat in Quick Session
          </button>
          <span class="arch-map-hint">Quick Session thinks the way this map does — one screen over one document.</span>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      .arch-map-backdrop {
        position: fixed;
        inset: 0;
        z-index: 12400;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: rgba(4, 6, 14, 0.82);
        backdrop-filter: blur(10px);
      }
      .arch-map-sheet {
        position: relative;
        width: 100%;
        max-width: 560px;
        max-height: 88vh;
        overflow-y: auto;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: #10131f;
        color: #e9ecf5;
        padding: 20px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
      }
      .arch-map-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
      }
      .arch-map-head h2 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 900;
        letter-spacing: 0.2px;
      }
      .arch-map-head p {
        margin: 6px 0 0;
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #8fa0c6;
      }
      .arch-map-close {
        border: none;
        background: transparent;
        color: #8fa0c6;
        cursor: pointer;
        padding: 4px;
      }
      .arch-map-close:hover {
        color: #fff;
      }

      .arch-map-layers {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .arch-layer {
        display: flex;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
      }
      .arch-layer-core {
        border-color: rgba(93, 196, 194, 0.55);
        background: rgba(93, 196, 194, 0.08);
      }
      .arch-layer-rank {
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font-size: 0.72rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .arch-layer-body h3 {
        margin: 0;
        font-size: 0.82rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .arch-layer-core .arch-layer-body h3 {
        color: #5dc4c2;
      }
      .arch-layer-body p {
        margin: 4px 0 0;
        font-size: 0.8rem;
        line-height: 1.45;
        color: #b9c2d8;
      }
      .arch-layer-body code {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        padding: 1px 5px;
        font-size: 0.76rem;
      }
      .arch-arrow {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: #6b7ba3;
        font-size: 0.66rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        line-height: 1;
        padding: 0;
      }
      .arch-arrow .material-symbols-outlined {
        font-size: 16px;
      }
      .arch-arrow em {
        font-style: normal;
      }

      .arch-map-moves {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px dashed rgba(255, 184, 0, 0.4);
        background: rgba(255, 184, 0, 0.05);
      }
      .arch-map-moves h3 {
        margin: 0 0 8px;
        font-size: 0.72rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #ffb800;
      }
      .arch-map-moves ol {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .arch-map-moves li {
        font-size: 0.82rem;
        color: #c7cfe2;
        line-height: 1.4;
      }

      .arch-map-foot {
        margin-top: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .arch-map-cta {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
        border-radius: 10px;
        padding: 10px 16px;
        background: #5dc4c2;
        color: #06231f;
        font-weight: 900;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        cursor: pointer;
      }
      .arch-map-cta:hover {
        filter: brightness(1.08);
      }
      .arch-map-hint {
        font-size: 0.68rem;
        color: #6b7ba3;
        flex: 1 1 auto;
      }
    `,
  ],
})
export class ArchitectureMapComponent {
  /** Hide the sheet; fired by backdrop click, the ✕, or Escape. */
  @Output() close = new EventEmitter<void>();

  /**
   * Jump-onto-the-beat-path request. The studio shell handles this by
   * calling setActiveView("quick-session") — this component never touches
   * view state itself, matching how every other overlay in the studio defers
   * navigation to the shell.
   */
  @Output() onQuickSession = new EventEmitter<void>();

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.close.emit();
  }
}
