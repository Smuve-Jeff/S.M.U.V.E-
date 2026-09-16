import { Component, signal, output, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_SMUVE_PERSONA,
  SMUVE_PERSONAS,
  SmuvePersonaOption,
} from '../../types/persona.types';

/** Canonical persona shape — shared with Settings, the Profile Editor, and the prompt builders. */
export type PersonaOption = SmuvePersonaOption;

@Component({
  selector: 'app-persona-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './persona-selector.component.html',
  styleUrls: ['./persona-selector.component.css'],
})
export class PersonaSelectorComponent {
  select = output<PersonaOption>();
  close = output<void>();

  selectedPersona = model<string>(DEFAULT_SMUVE_PERSONA);

  previewText = signal('Give me feedback on my mix');
  previewResponse = signal('');

  readonly personas: PersonaOption[] = SMUVE_PERSONAS;

  get currentPersona(): PersonaOption {
    return (
      this.personas.find((p) => p.id === this.selectedPersona()) ||
      this.personas[0]
    );
  }

  selectPersona(persona: PersonaOption) {
    this.selectedPersona.set(persona.id);
    this.select.emit(persona);
  }

  generatePreview() {
    const persona = this.currentPersona;
    const context = this.previewText();

    const previews: Record<string, string[]> = {
      'Ominous Musical GOD': [
        `"${context}?" You brought me that? The kick is buried under 40Hz of mud, the vocal is drowning, and the whole mix has the energy of a funeral for a career that never started. I am not disappointed. I expected this. Cut the sub, sidechain the kick, compress the vocal bus, and bring it back when it stops embarrassing us both.`,
        `Regarding "${context}": I have heard the future of your catalog, and it is currently a crime scene. Your low-end is flabby, your highs are shards of glass, and your midrange sounds like wasps trapped in a microwave. Fix the balance, automate the vocal, and I will consider allowing it to exist in MY studio.`,
      ],
      Elite: [
        `Regarding "${context}": my analysis indicates 7 critical issues requiring immediate attention. The transient response on your drum bus is inconsistent, your stereo field collapses above 8kHz, and there's a -3dB null in the 200-400Hz range that's robbing your mix of warmth. Recommended actions: recalibrate your compressor attack times, apply mid-side EQ to the 8kHz+ range, and consider parallel compression on the drum bus.`,
        `Assessment of "${context}" complete. Your mix demonstrates fundamental understanding but lacks professional polish. The arrangement is competent but predictable — your listener will lose interest by the second chorus. Structural recommendation: introduce a new harmonic element at the 2:15 mark to re-engage attention. Your vocal chain needs work. Let's discuss.`,
      ],
      Supportive: [
        `I hear what you're going for with "${context}", and there's genuine potential here. Your instincts are in the right place, but the execution needs refinement. Let's work on the mix together — I want you to focus on the relationship between your kick and bass first. They're competing for the same frequencies. Try sidechain compression and let me know what you hear. You've got the foundation of something good here.`,
        `Thanks for asking about "${context}". I can tell you've put work into this, and I respect the effort. Here's what I'm hearing: the arrangement has good bones, but we need to clean up the low-end and give the vocals more presence. Don't be discouraged — every great producer started exactly where you are. Let me walk you through some adjustments that will elevate this significantly.`,
      ],
      Balanced: [
        `On "${context}": the idea is strong, the mix is not there yet. Your kick and bass occupy the same 60–120Hz pocket, the vocal loses the hook line behind the pad, and the chorus never opens up. Try carving 3dB at 200Hz on the pad, automating the vocal up 1.5dB into the chorus, and re-checking on a phone speaker before you commit.`,
        `Here's the honest read on "${context}": arrangement is solid, low-end needs surgery, vocal level drifts across the section. Do the EQ and automation passes first — those two fixes buy you 80% of the improvement. Then we talk about the top end.`,
      ],
    };

    const options = previews[persona.id] || previews['Elite'];
    this.previewResponse.set(
      options[Math.floor(Math.random() * options.length)]
    );
  }
}
