import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The S.M.U.V.E brand glyph and voice avatar.
 *
 * It is also the widget's voice indicator: `speaking` / `listening` come from
 * the live speech services, so the mark pulses while S.M.U.V.E. talks and
 * reacts while the artist dictates. Without them the mark was inert and the
 * only sign that voice was working was the text readout above the composer.
 */
@Component({
  selector: 'app-smuve-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smuve-widget.component.html',
  styleUrls: ['./smuve-widget.component.css'],
})
export class SmuveWidgetComponent {
  /** S.M.U.V.E is speaking a reply right now. */
  @Input() speaking = false;
  /** The artist is dictating into the composer right now. */
  @Input() listening = false;

  /**
   * Single state the glyph, its CSS and assistive tech react to. Listening wins
   * over speaking: dictation stops playback first, so it is what the artist is
   * actually doing.
   */
  get voiceState(): 'idle' | 'speaking' | 'listening' {
    if (this.listening) return 'listening';
    return this.speaking ? 'speaking' : 'idle';
  }

  /** The brand mark announces the live voice state, not just the logo. */
  get ariaLabel(): string {
    switch (this.voiceState) {
      case 'listening':
        return 'S.M.U.V.E brand mark — listening to you';
      case 'speaking':
        return 'S.M.U.V.E brand mark — speaking';
      default:
        return 'S.M.U.V.E brand mark';
    }
  }
}
