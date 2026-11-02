import { Injectable, computed, signal } from "@angular/core";

export interface WizardStep {
  id: number;
  key: string;
  icon: string;
  title: string;
  /** One-word label for the path strip. */
  short: string;
  subtitle: string;
  description: string;
  /** A concrete thing the artist makes, so "do it right" has a picture. */
  example: string;
  targetView: string;
  accentColor: string;
  tip: string;
  /** Verb-first label for the button that opens the real tool. */
  action: string;
}

const DONE_STORAGE_KEY = "smuve_wizard_done";

/**
 * The whole first-song path, in the order a song is actually made. Shared by
 * the wizard and by the in-tool hint so the two can never teach different
 * steps.
 */
export const BEGINNER_SONG_STEPS: WizardStep[] = [
  {
    id: 1,
    key: "beat",
    icon: "album",
    title: "Pick a Beat",
    short: "Beat",
    subtitle: "Step 1 · The drums",
    description:
      "Open the Beat Machine and tap any drum pad. Or tap Generate Style and let it pick a groove for you.",
    example: "Kick on 1, 2, 3 and 4. Snare on 2 and 4. That is already a beat.",
    targetView: "drum-machine",
    accentColor: "#F59E0B",
    tip: "You cannot break anything. Undo is always one tap away.",
    action: "Open the Beat Machine",
  },
  {
    id: 2,
    key: "melody",
    icon: "piano",
    title: "Add a Melody",
    short: "Melody",
    subtitle: "Step 2 · The tune",
    description:
      "Open the Piano and press white keys. Every white key already fits the song, so nothing sounds wrong.",
    example: "Press C, then E, then G. Those three sound happy together.",
    targetView: "piano-roll",
    accentColor: "#8B5CF6",
    tip: "Only use white keys while you learn — they all sound good together.",
    action: "Open the Piano",
  },
  {
    id: 3,
    key: "voice",
    icon: "mic",
    title: "Sing or Rap on It",
    short: "Voice",
    subtitle: "Step 3 · Your words",
    description:
      "Open the Recorder, press the big Record button, say your words, then press Stop.",
    example: "Say “la la la” over the beat. That counts as a vocal.",
    targetView: "audio-recorder",
    accentColor: "#E11D48",
    tip: "A quiet room and a phone about six inches away sounds best.",
    action: "Open the Recorder",
  },
  {
    id: 4,
    key: "arrangement",
    icon: "view_timeline",
    title: "Put It in Order",
    short: "Order",
    subtitle: "Step 4 · The shape",
    description:
      "Open the Arrangement and drag your blocks into rows: drums first, then your voice.",
    example:
      "Beat for 8 bars, voice for 8 bars, then the beat again. That is a song shape.",
    targetView: "arrangement",
    accentColor: "#F97316",
    tip: "Short songs are real songs. Eight bars is plenty for your first one.",
    action: "Open the Arrangement",
  },
  {
    id: 5,
    key: "mix",
    icon: "tune",
    title: "Make It Sound Good",
    short: "Mix",
    subtitle: "Step 5 · The balance",
    description:
      "Open the Mixer and move the sliders until your voice is the loudest thing and the beat sits under it.",
    example: "Voice at the top, drums a little lower, everything else lower still.",
    targetView: "mixer",
    accentColor: "#0EA5E9",
    tip: "If you have to shout to hear your voice, the beat is too loud.",
    action: "Open the Mixer",
  },
  {
    id: 6,
    key: "share",
    icon: "rocket_launch",
    title: "Save and Share",
    short: "Share",
    subtitle: "Step 6 · Keep it forever",
    description:
      "Open the Arrangement, tap Save, then tap Share to send your song to a friend.",
    example: "Choose WAV for the best sound, or MP3 to text it easily.",
    targetView: "arrangement",
    accentColor: "#10B981",
    tip: "Saving keeps your song on this device. Sharing makes a copy you can send.",
    action: "Open Save & Share",
  },
];

/**
 * Which step the artist is on, shared across views. The wizard owns the ticks;
 * this service owns the position, so leaving the wizard for the Beat Machine
 * no longer loses the thread.
 */
@Injectable({ providedIn: "root" })
export class BeginnerPathService {
  readonly steps = BEGINNER_SONG_STEPS;
  readonly stepIndex = signal(this.firstUnfinishedIndex());
  readonly currentStep = computed(
    () => this.steps[this.stepIndex()] ?? this.steps[0],
  );

  /** Move the shared pointer without changing what is ticked. */
  select(id: number): void {
    const index = this.steps.findIndex((step) => step.id === id);
    if (index !== -1 && index !== this.stepIndex()) this.stepIndex.set(index);
  }

  /** First step without a tick; the last step when everything is done. */
  private firstUnfinishedIndex(): number {
    const done = this.readDoneSteps();
    const index = this.steps.findIndex((step) => !done.has(step.id));
    return index === -1 ? this.steps.length - 1 : index;
  }

  private readDoneSteps(): Set<number> {
    try {
      const raw = localStorage.getItem(DONE_STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw) as number[]);
    } catch {
      // Unreadable progress is treated as no progress; the wizard reports
      // write failures on its own.
    }
    return new Set();
  }
}
