/**
 * Lightweight route targets for the shell's "Teach this screen" action.
 *
 * The curriculum itself is large and belongs in the lazily loaded Masterclass
 * chunk. The shell only needs these four fields to build a deep link, so this
 * map is generated from the guide data and kept in sync by
 * `masterclass-route-guide.spec.ts`. Importing the full guide here put ~75 kB
 * of lesson copy in the initial bundle.
 */
export interface MasterclassRouteTarget {
  lessonId: string;
  track: "first-loop" | "full-song" | "mastery" | "cgi" | "whole-app";
  lessonTitle: string;
  trackLabel: string;
}

/** First documented lesson for each Studio surface. */
export const MASTERCLASS_SURFACE_TARGETS: Readonly<Record<string, MasterclassRouteTarget>> = {
  "quick-session": {
    lessonId: "loop-sound",
    track: "first-loop",
    lessonTitle: "Hear your first sound",
    trackLabel: "First Loop",
  },
  "drum-machine": {
    lessonId: "loop-drums",
    track: "first-loop",
    lessonTitle: "Build the beat",
    trackLabel: "First Loop",
  },
  "piano-roll": {
    lessonId: "loop-bass",
    track: "first-loop",
    lessonTitle: "Add the low end",
    trackLabel: "First Loop",
  },
  "chord-editor": {
    lessonId: "loop-chords",
    track: "first-loop",
    lessonTitle: "Add chords and a melody",
    trackLabel: "First Loop",
  },
  "mixer": {
    lessonId: "loop-mix",
    track: "first-loop",
    lessonTitle: "Balance the loop",
    trackLabel: "First Loop",
  },
  "export": {
    lessonId: "loop-save",
    track: "first-loop",
    lessonTitle: "Save it and send it",
    trackLabel: "First Loop",
  },
  "arrangement": {
    lessonId: "song-plan",
    track: "full-song",
    lessonTitle: "Plan the record before you click",
    trackLabel: "Full Song",
  },
  "channel-rack": {
    lessonId: "song-session",
    track: "full-song",
    lessonTitle: "Set up a session you can finish",
    trackLabel: "Full Song",
  },
  "synthesizer": {
    lessonId: "song-sound",
    track: "full-song",
    lessonTitle: "Sound design that fits the record",
    trackLabel: "Full Song",
  },
  "vocal-suite": {
    lessonId: "song-vocal",
    track: "full-song",
    lessonTitle: "Record a vocal that needs less fixing",
    trackLabel: "Full Song",
  },
  "effects-rack": {
    lessonId: "song-fx",
    track: "full-song",
    lessonTitle: "Effects and automation",
    trackLabel: "Full Song",
  },
  "mastering": {
    lessonId: "song-mixmaster",
    track: "full-song",
    lessonTitle: "Mix, then master",
    trackLabel: "Full Song",
  },
  "session": {
    lessonId: "master-session",
    track: "mastery",
    lessonTitle: "Launch clips like an instrument",
    trackLabel: "Studio Mastery",
  },
  "performance": {
    lessonId: "master-pads",
    track: "mastery",
    lessonTitle: "Finger-drum and play keys",
    trackLabel: "Studio Mastery",
  },
  "sampler": {
    lessonId: "master-sample",
    track: "mastery",
    lessonTitle: "Chop and map samples",
    trackLabel: "Studio Mastery",
  },
  "dj": {
    lessonId: "master-dj",
    track: "mastery",
    lessonTitle: "DJ with stems and hot cues",
    trackLabel: "Studio Mastery",
  },
  "score": {
    lessonId: "master-score",
    track: "mastery",
    lessonTitle: "Read and export notation",
    trackLabel: "Studio Mastery",
  },
  "ai-produce": {
    lessonId: "master-ai",
    track: "mastery",
    lessonTitle: "Direct the AI band",
    trackLabel: "Studio Mastery",
  },
  "tuner": {
    lessonId: "master-ears",
    track: "mastery",
    lessonTitle: "Train your ears and finish more songs",
    trackLabel: "Studio Mastery",
  },
};

/** Whole-application chapter opened by each routed workspace. */
export const MASTERCLASS_CHAPTER_TARGETS: Readonly<Record<string, MasterclassRouteTarget>> = {
  "app-hub": {
    lessonId: "app-hub",
    track: "whole-app",
    lessonTitle: "Run the day from Label Hub",
    trackLabel: "Whole App",
  },
  "app-studio": {
    lessonId: "app-studio",
    track: "whole-app",
    lessonTitle: "Studio: idea to master",
    trackLabel: "Whole App",
  },
  "app-create": {
    lessonId: "app-create",
    track: "whole-app",
    lessonTitle: "Write, produce and learn",
    trackLabel: "Whole App",
  },
  "app-career": {
    lessonId: "app-career",
    track: "whole-app",
    lessonTitle: "Career, strategy and evidence",
    trackLabel: "Whole App",
  },
  "app-intelligence": {
    lessonId: "app-intelligence",
    track: "whole-app",
    lessonTitle: "The AI command layer",
    trackLabel: "Whole App",
  },
  "app-lab": {
    lessonId: "app-lab",
    track: "whole-app",
    lessonTitle: "Image & Video Lab",
    trackLabel: "Whole App",
  },
  "app-network": {
    lessonId: "app-network",
    track: "whole-app",
    lessonTitle: "Community and commerce",
    trackLabel: "Whole App",
  },
  "app-business": {
    lessonId: "app-business",
    track: "whole-app",
    lessonTitle: "Release, business and rights",
    trackLabel: "Whole App",
  },
  "app-system": {
    lessonId: "app-system",
    track: "whole-app",
    lessonTitle: "Profile, cloud, timeline and settings",
    trackLabel: "Whole App",
  },
  "app-workflow": {
    lessonId: "app-workflow",
    track: "whole-app",
    lessonTitle: "One record, end to end",
    trackLabel: "Whole App",
  },
  "app-spot": {
    lessonId: "app-spot",
    track: "whole-app",
    lessonTitle: "Tha Spot: play, compete, broadcast",
    trackLabel: "Whole App",
  },
  "app-shell": {
    lessonId: "app-shell",
    track: "whole-app",
    lessonTitle: "Start with the shell",
    trackLabel: "Whole App",
  },
};
