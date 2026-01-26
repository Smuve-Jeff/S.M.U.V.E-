import { Injectable, signal } from '@angular/core';
import * as Tone from 'tone';

@Injectable({
  providedIn: 'root',
})
export class InstrumentService {
  private synth: Tone.PolySynth;
  readonly midiInputs = signal<MIDIInput[]>([]);
  private activeMidiInput: MIDIInput | null = null;

  constructor() {
    this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
    this.setupMidi();
  }

  private async setupMidi() {
    if (navigator.requestMIDIAccess) {
      try {
        const midiAccess = await navigator.requestMIDIAccess();
        const inputs = Array.from(midiAccess.inputs.values());
        this.midiInputs.set(inputs);

        midiAccess.onstatechange = (event) => {
          const updatedInputs = Array.from(midiAccess.inputs.values());
          this.midiInputs.set(updatedInputs);
          console.log('MIDI state changed:', event);
        };
      } catch (error) {
        console.error('Could not access MIDI devices.', error);
      }
    } else {
      console.warn('Web MIDI API is not supported in this browser.');
    }
  }

  connectToMidiDevice(inputId: string) {
    const input = this.midiInputs().find((i) => i.id === inputId);
    if (input) {
      // Disconnect from any previously connected device
      if (this.activeMidiInput) {
        this.activeMidiInput.onmidimessage = null;
      }

      this.activeMidiInput = input;
      this.activeMidiInput.onmidimessage = this.handleMidiMessage.bind(this);
      console.log(`Connected to MIDI device: ${input.name}`);
    } else {
      console.error(`MIDI device with ID ${inputId} not found.`);
    }
  }

  private handleMidiMessage(event: MIDIMessageEvent) {
    const [command, note, velocity] = event.data;
    // Command 144 is note on, 128 is note off
    if (command === 144 && velocity > 0) {
      this.playNote(this.midiNoteToFrequency(note), '8n', velocity / 127);
    } else if (command === 128 || (command === 144 && velocity === 0)) {
      this.releaseNote(this.midiNoteToFrequency(note));
    }
  }

  playNote(
    note: Tone.Unit.Frequency,
    duration?: Tone.Unit.Time,
    velocity?: number
  ) {
    this.synth.triggerAttack(note, Tone.now(), velocity);
    if (duration) {
      this.synth.triggerRelease(
        note,
        Tone.now() + Tone.Time(duration).toSeconds()
      );
    }
  }

  releaseNote(note: Tone.Unit.Frequency) {
    this.synth.triggerRelease(note, Tone.now());
  }

  // Helper to convert MIDI note number to frequency
  private midiNoteToFrequency(note: number): Tone.Unit.Frequency {
    return Tone.Frequency(note, 'midi').toFrequency();
  }
}
