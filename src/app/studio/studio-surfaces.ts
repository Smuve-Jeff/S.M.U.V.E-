/**
 * Every surface the Studio can show, in one place.
 *
 * This list used to be a private member of the classic shell, so the composed
 * `/studio` page could not see it: its own tool panel had drifted into a
 * hand-written subset and a dozen real surfaces ended up with no route at all.
 * One catalogue, read by both shells, is what stops a new view from shipping
 * without a way in.
 *
 * `description` / `primary` are onboarding metadata; `label` and `icon` are what
 * navigation renders.
 */
export type StudioSurfaceId =
  | "arrangement"
  | "session"
  | "piano-roll"
  | "drum-machine"
  | "channel-rack"
  | "mixer"
  | "effects-rack"
  | "vocal-suite"
  | "dj"
  | "performance"
  | "mastering"
  | "ai-produce"
  | "sound-browser"
  | "sound-pad"
  | "synthesizer"
  | "chord-editor"
  | "sampler"
  | "score"
  | "sample-library"
  | "plugins"
  | "audio-recorder"
  | "performer";

export interface StudioSurface {
  id: StudioSurfaceId;
  label: string;
  icon: string;
  description?: string;
  primary?: boolean;
}

export interface StudioSurfaceGroup {
  id: string;
  label: string;
  icon: string;
  description: string;
  views: StudioSurface[];
}

/**
 * Workflow stages, in the order a session moves through them. The `more` group
 * holds surfaces that are real but deliberately absent from a stage rail: the
 * Performer is URL-reaching and appears in the mobile shell only.
 */
export const STUDIO_SURFACE_GROUPS: StudioSurfaceGroup[] = [
  {
    id: "create",
    label: "Create & Jam",
    icon: "auto_awesome",
    description: "Record takes, program drums, play synths & chords",
    views: [
      {
        id: "drum-machine",
        label: "Drum Machine",
        icon: "grid_view",
        description: "Step sequencer & beat builder",
        primary: true,
      },
      {
        id: "piano-roll",
        label: "Piano Roll",
        icon: "piano",
        description: "Keys, melody & note editing",
        primary: true,
      },
      {
        id: "vocal-suite",
        label: "Vocal Suite",
        icon: "mic",
        description: "Auto-pitch & real-time vocal chain",
        primary: true,
      },
      {
        id: "audio-recorder",
        label: "Quick Recorder",
        icon: "mic_external_on",
        description: "Instant voice memo & mic capture",
      },
      {
        id: "chord-editor",
        label: "Chords",
        icon: "music_note",
        description: "1-tap progressions & voicings",
      },
      {
        id: "sound-pad",
        label: "Sound Pads",
        icon: "grid_on",
        description: "MPC-style touch finger drumming",
      },
      {
        id: "synthesizer",
        label: "Synthesizer",
        icon: "waves",
        description: "Analog & wavetable synth voices",
      },
      {
        id: "ai-produce",
        label: "AI Producer",
        icon: "psychology",
        description: "Prompt-guided beat generation",
      },
    ],
  },
  {
    id: "arrange",
    label: "Song Builder",
    icon: "view_quilt",
    description: "Timeline arrangement, loops, patterns & score",
    views: [
      {
        id: "arrangement",
        label: "Arrangement",
        icon: "view_quilt",
        description: "Full song timeline & tracks",
        primary: true,
      },
      {
        id: "session",
        label: "Session View",
        icon: "dashboard",
        description: "Non-linear clip & loop launcher",
      },
      {
        id: "channel-rack",
        label: "Channel Rack",
        icon: "inventory_2",
        description: "Instruments & pattern overview",
      },
      {
        id: "score",
        label: "Score View",
        icon: "music_note",
        description: "Musical notation & sheet export",
      },
    ],
  },
  {
    id: "mix",
    label: "Mix & Polish",
    icon: "tune",
    description: "12-track console, dynamic FX, DJ & mastering",
    views: [
      {
        id: "mixer",
        label: "Mixer",
        icon: "tune",
        description: "12-track fader console & routing",
        primary: true,
      },
      {
        id: "effects-rack",
        label: "Effects Rack",
        icon: "magic_button",
        description: "Dynamic VST audio inserts",
      },
      {
        id: "dj",
        label: "DJ Booth",
        icon: "album",
        description: "Live platter decks & crossfader",
      },
      {
        id: "mastering",
        label: "Mastering",
        icon: "graphic_eq",
        description: "Loudness maximizer & bus limiters",
      },
      {
        id: "performance",
        label: "Performance",
        icon: "interpreter_mode",
        description: "Live performance scene triggers",
      },
    ],
  },
  {
    id: "library",
    label: "Sounds & Packs",
    icon: "library_music",
    description: "Sample packs, instrument presets & audio tools",
    views: [
      {
        id: "sound-browser",
        label: "Sound Browser",
        icon: "queue_music",
        description: "Curated kits, bass & instruments",
      },
      {
        id: "sample-library",
        label: "Sample Library",
        icon: "library_music",
        description: "Imported audio & loop storage",
      },
      {
        id: "sampler",
        label: "Sampler",
        icon: "graphic_eq",
        description: "Sample slicing & key mapping",
      },
      {
        id: "plugins",
        label: "Plugin Store",
        icon: "extension",
        description: "Pro studio effects & synthesizers",
      },
    ],
  },
  {
    id: "more",
    label: "More Tools",
    icon: "widgets",
    description: "Additional studio surfaces",
    views: [
      {
        id: "performer",
        label: "Performer",
        icon: "piano_off",
        description: "Live performance layout & keyboard",
      },
    ],
  },
];

/** Flat list of every surface, grouped order preserved. */
export const STUDIO_SURFACES: StudioSurface[] = STUDIO_SURFACE_GROUPS.flatMap(
  (group) => group.views,
);

const STUDIO_SURFACE_IDS: ReadonlySet<string> = new Set(
  STUDIO_SURFACES.map((surface) => surface.id),
);

/** True when a `?view=` / nav id names a surface this app can render. */
export function isStudioSurfaceId(value: string): value is StudioSurfaceId {
  return STUDIO_SURFACE_IDS.has(value);
}

/**
 * The catalogue entries a caller does *not* already offer.
 *
 * The command palette builds an action per workspace in `WORKSPACE_REGISTRY`,
 * which already covers seven of these surfaces (drum machine, mixer, piano roll,
 * …) as "Open X". Registering those again would put two commands for one
 * destination in the palette, so callers ask this what is still missing.
 */
export function studioSurfacesNotIn(
  covered: readonly string[],
): StudioSurface[] {
  const offered = new Set(covered);
  return STUDIO_SURFACES.filter((surface) => !offered.has(surface.id));
}

/** Lookup by id; undefined for an id that is not in the catalogue. */
export function studioSurface(id: string): StudioSurface | undefined {
  return STUDIO_SURFACES.find((surface) => surface.id === id);
}
