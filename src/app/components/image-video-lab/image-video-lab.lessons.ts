/**
 * Guided lessons for the Image & Video Lab.
 *
 * Each lesson is tied to a real control, not a screenshot. `target` is resolved
 * by the component against the live DOM when the learner presses SHOW ME, and
 * `tutorialAt` is the chapter start in the shipped tutorial MP4.
 */
export type LabLessonTarget =
  | 'modes'
  | 'ingest'
  | 'timeline'
  | 'titles'
  | 'audio'
  | 'fx'
  | 'camera'
  | 'projects'
  | 'export';

export interface LabLesson {
  id: string;
  number: string;
  title: string;
  kicker: string;
  summary: string;
  goal: string;
  steps: readonly string[];
  mistake: string;
  actionLabel: string;
  target: LabLessonTarget;
  /** Chapter start in seconds inside the tutorial video. */
  tutorialAt: number;
}

export const LAB_TUTORIAL_SRC = 'assets/learn/image-video-lab-tutorial.mp4';

export const LAB_LESSONS: readonly LabLesson[] = [
  {
    id: 'destination',
    number: '01',
    title: 'Pick the destination first',
    kicker: 'Setup',
    summary:
      'The production mode sets the frame, the runtime and the delivery preset before you touch a clip.',
    goal: 'Start every edit with a target, not a timeline.',
    steps: [
      'Choose the production mode in Production Upgrade: film, music video, social or broadcast.',
      'Pick the delivery preset that matches where the cut actually ships.',
      'Read the blueprint strip back: runtime, delivery, format and timeline lanes.',
    ],
    mistake:
      'Cutting a vertical social piece in a 16:9 canvas and fixing it at export. Switch the mode first; the monitor and presets reflow around it.',
    actionLabel: 'Show production modes',
    target: 'modes',
    tutorialAt: 0,
  },
  {
    id: 'ingest',
    number: '02',
    title: 'Ingest footage and stills',
    kicker: 'Media',
    summary:
      'Video, photos, generated frames and camera captures all enter through Neural Assets and land on a lane.',
    goal: 'Get one usable take on the timeline with a hold you can predict.',
    steps: [
      'Use Ingest in Neural Assets and pick a video or image from this device.',
      'Set Still hold so a photo occupies the time the edit needs, not a default you have to trim.',
      'Confirm the clip landed, the poster decoded and the duration is what the engine read.',
    ],
    mistake:
      'Assuming a clip is broken because a phone take opens rotated or short. Let the engine read metadata, then trim or stabilize instead of re-importing.',
    actionLabel: 'Show media ingest',
    target: 'ingest',
    tutorialAt: 33.67,
  },
  {
    id: 'timeline',
    number: '03',
    title: 'Cut on the master timeline',
    kicker: 'Edit',
    summary:
      'The timeline is the source of truth: select a clip, move the playhead, then cut, duplicate, delete or nudge by frames.',
    goal: 'Make one clean cut and leave a tail instead of a butted-up seam.',
    steps: [
      'Click a clip to select it and read its start, duration and lane in the toolbar.',
      'Move the playhead to the cut point and use CUT, or nudge the clip by a single frame.',
      'Use markers and beat snap to keep music-driven edits honest.',
    ],
    mistake:
      'Dragging every clip edge to edge. Leave at least one frame of tail so transitions and audio fades have somewhere to resolve.',
    actionLabel: 'Show the timeline',
    target: 'timeline',
    tutorialAt: 66.07,
  },
  {
    id: 'titles',
    number: '04',
    title: 'Cut titles that belong to the edit',
    kicker: 'Text',
    summary:
      'Title Cards are timeline overlays with their own style, position and hold, not text painted onto the monitor.',
    goal: 'Place a lower third that enters and leaves exactly where you cut it.',
    steps: [
      'Type the title and subtitle, then choose style, position and hold.',
      'Park the playhead at the in-point and cut the title in.',
      'Scrub across the hold and confirm it appears on the overlay lane, not for the whole programme.',
    ],
    mistake:
      'Typing a title and expecting it everywhere. A title is cut at the playhead; move the playhead before cutting if it landed in the wrong place.',
    actionLabel: 'Show title cards',
    target: 'titles',
    tutorialAt: 96.64,
  },
  {
    id: 'audio',
    number: '05',
    title: 'Score it on the master bus',
    kicker: 'Sound',
    summary:
      'The audio overlay is decoded onto the master bus, so the preview and the export share the same bed and level.',
    goal: 'Hear the bed under the picture and leave headroom for dialogue.',
    steps: [
      'Add a music or voice bed from this device in Audio Overlay.',
      'Set the level and decide whether the bed loops across the cut.',
      'Play the timeline, then trim picture to the phrase instead of fighting the music with volume.',
    ],
    mistake:
      'Leaving the bed at full level and pushing every clip louder to compensate. Pull the bed down first; the master has one headroom budget.',
    actionLabel: 'Show audio overlay',
    target: 'audio',
    tutorialAt: 126.44,
  },
  {
    id: 'look',
    number: '06',
    title: 'Shape the look, then keyframe it',
    kicker: 'FX',
    summary:
      'Filters, transitions, camera motion, FX dials and keyframes are stored as clip data, so preview and export render the same pass.',
    goal: 'Build one deliberate look and animate a single property.',
    steps: [
      'Select the clip and stage a filter, transition and camera move.',
      'Dial the FX Matrix in small amounts; grade the timeline only after the cut is locked.',
      'Add a keyframe on one property and scrub across it to verify the move.',
    ],
    mistake:
      'Stacking every effect at full strength on the first clip. One look, one motion and one keyframed property reads as direction; five read as noise.',
    actionLabel: 'Show the FX matrix',
    target: 'fx',
    tutorialAt: 156.81,
  },
  {
    id: 'camera',
    number: '07',
    title: 'Capture without leaving the console',
    kicker: 'Capture',
    summary:
      'The live viewfinder and capture shelf record camera takes and screen frames straight into the project.',
    goal: 'Take one framed capture and find it again on the shelf.',
    steps: [
      'Switch the monitor to the camera surface and start the camera.',
      'Check the viewfinder and light before recording a take or grabbing a frame.',
      'Use the capture shelf to locate the shot on the timeline instead of hunting the bin.',
    ],
    mistake:
      'Recording before checking the viewfinder. The operator cannot see the light from behind the lens; confirm the picture first.',
    actionLabel: 'Show the camera surface',
    target: 'camera',
    tutorialAt: 188.31,
  },
  {
    id: 'projects',
    number: '08',
    title: 'Save work you can reopen',
    kicker: 'Projects',
    summary:
      'A project holds the timeline, clip references and Director plans. Saving is explicit; reopening restores the edit behind a gate.',
    goal: 'Save a named project and reopen it with the timeline intact.',
    steps: [
      'Open Projects and save as new with a name you will recognise later.',
      'Wait for the busy state to clear and read the storage notice.',
      'Reopen the project and confirm lanes, titles, audio and the Director plan return.',
    ],
    mistake:
      'Treating autosave as a backup. Clearing browser storage removes local work; save the project you care about and keep the export.',
    actionLabel: 'Show projects',
    target: 'projects',
    tutorialAt: 215.66,
  },
  {
    id: 'export',
    number: '09',
    title: 'Export a master you can trust',
    kicker: 'Delivery',
    summary:
      'Export records the program monitor for the chosen window. Capture length, raster, frame rate and codec are decisions, not defaults.',
    goal: 'Produce a playable file with the right raster and no surprise watermark.',
    steps: [
      'Set Capture, Raster, Rate and Codec in the header before you press export.',
      'Check the export summary and watermark status, then start the render.',
      'Keep the tab in the foreground, wait for the download and play the file back before delivery.',
    ],
    mistake:
      'Asking for a long 4K/60 take and expecting it instantly. Capture runs in real time and the window is capped; rehearse the section first.',
    actionLabel: 'Show export controls',
    target: 'export',
    tutorialAt: 247.89,
  },
];
