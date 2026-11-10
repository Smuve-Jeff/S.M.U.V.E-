import type { StudioSurfaceId } from "../studio-surfaces";

/**
 * The Studio Masterclass curriculum.
 *
 * This file is the single source of truth for the in-Studio guide. It has two
 * jobs:
 *
 *  1. `GUIDE_TRACKS` — three learn-by-doing paths. A "First Loop" for kids and
 *     first-timers, a "Full Song" path that walks a record from empty project to
 *     delivery, and a "Mastery" path for the pro surfaces.
 *  2. `GUIDE_SURFACE_ATLAS` — one entry for every surface the Studio can show.
 *     `studio-guide.data.spec.ts` asserts the atlas covers `STUDIO_SURFACES`
 *     exactly, so a new surface cannot ship undocumented.
 *
 * Copy rules: short sentences, plain words, jargon defined in `GUIDE_GLOSSARY`,
 * and every instruction must name a control that actually exists. The guide
 * never claims a button does something the Studio does not do.
 */

export type GuideTrackId = "first-loop" | "full-song" | "mastery";

export type GuideAutoCheckKind =
  | "transport-started"
  | "starter-loaded"
  | "document-edited"
  | "scene-launched"
  | "project-saved"
  | "metadata-changed"
  | "recording-started"
  | "audio-exported"
  | "collab-started";

export interface GuideLesson {
  /** Unique across every path; also the persisted completion key. */
  id: string;
  track: GuideTrackId;
  title: string;
  /** The stage badge, e.g. "FOUNDATION" or "MIX & POLISH". */
  kicker: string;
  /** Realistic time for a first attempt, in minutes. */
  minutes: number;
  /** One sentence: what the artist can do after this lesson. */
  goal: string;
  /** The kid-friendly explanation. No unexplained jargon. */
  plain: string;
  /** The actual clicks/taps, in order. */
  steps: string[];
  /** The named controls used in this lesson. */
  controls: string[];
  /** The real surface that does the work. */
  target: StudioSurfaceId;
  /** When present, a real Studio action checks this lesson off. */
  autoCheck?: GuideAutoCheckKind;
  /** Label for the "open the tool" button. */
  action: string;
  /** The professional habit this lesson teaches. */
  proTip: string;
  /** Optional: what the result should sound like, in plain words. */
  heard?: string;
}

export interface GuideTrack {
  id: GuideTrackId;
  label: string;
  tagline: string;
  forWho: string;
  minutes: number;
  icon: string;
  accent: string;
  outcome: string;
  lessons: GuideLesson[];
}

export interface GuideSurfaceEntry {
  id: StudioSurfaceId;
  group: string;
  /** What this surface is, in one plain sentence. */
  what: string;
  /** The capabilities worth knowing before opening it. */
  features: string[];
  /** The gestures and interaction model. */
  gestures: string[];
  /** One professional habit to use it well. */
  proTip: string;
}

export interface GuideGlossaryEntry {
  term: string;
  plain: string;
}

export interface GuideShortcut {
  keys: string;
  action: string;
}

const firstLoopLessons: GuideLesson[] = [
  {
    id: "loop-sound",
    track: "first-loop",
    title: "Hear your first sound",
    kicker: "FOUNDATION",
    minutes: 3,
    goal: "Open the Studio, start the clock, and make sound come out.",
    plain:
      "A studio is a very fast clock with sounds attached. The Play button starts the clock. Nothing here is permanent, so you can tap anything without breaking it.",
    steps: [
      "Open Quick Session from the left rail. On a phone, tap the MORE button, then choose Quick Session.",
      "If you see TAP TO ARM AUDIO, tap it once. Browsers are not allowed to play sound until you touch the page.",
      "Press Play (or Space). You may only hear the metronome click at first. That click is the clock, not the song.",
      "Use the − and + buttons beside BPM. Lower BPM is slower and heavier; higher BPM is faster and busier.",
      "Press Stop, then Play again. You are already operating a studio transport.",
    ],
    controls: [
      "Transport: Play / Stop / Record",
      "BPM field with − / + nudges",
      "Metronome (M) and master volume",
      "Project status strip: New session / Unsaved / Saved locally",
    ],
    target: "quick-session",
    action: "Open Quick Session",
    proTip:
      "If you hear nothing, check three things in order: the master volume, the metronome state, and the device's own mute switch. The ARM AUDIO badge tells you the browser is still waiting for a tap.",
    heard: "A steady click — one click per beat, with a stronger click on beat one.",
  },
  {
    id: "loop-groove",
    track: "first-loop",
    title: "Borrow a groove, then make it yours",
    kicker: "FOUNDATION",
    minutes: 4,
    goal: "Load a complete instrumental in one tap and identify its layers.",
    plain:
      "Starting from a finished-sounding loop is not cheating. Producers start from drum patterns, samples and vibes every day. Your job is to change it until it sounds like you.",
    steps: [
      "In Quick Session, find the one-tap starters (House, Trap, Lo-Fi and more). Tap one.",
      "S.M.U.V.E. builds drums, bass, chords and melody at that style's tempo. Press Play.",
      "Look at the channel list. Tap a channel to select it, then press M to mute it. Listen to what disappears.",
      "Bring it back with M, then try S (solo) on the bass, then turn Solo off.",
      "Change one thing immediately: remove a layer, move a note, or lower a volume. Now it is your loop.",
    ],
    controls: [
      "One-tap starters and the CREATE sheet",
      "Channel strips: select, M mute, S solo, volume, record-arm",
      "Scene grid at the bottom of Quick Session",
      "Undo: Ctrl+Z (Cmd+Z on Mac)",
    ],
    target: "quick-session",
    action: "Open Quick Session",
    proTip:
      "Undo is your safety net, not a reset button. If a starter replaces something you liked, press Ctrl+Z immediately. S.M.U.V.E. snapshots an open sketch before loading a starter, so nothing is silently lost.",
    heard: "A full 4- or 8-bar loop with four parts that you can now mute one at a time.",
  },
  {
    id: "loop-drums",
    track: "first-loop",
    title: "Build the beat",
    kicker: "RHYTHM",
    minutes: 5,
    goal: "Program a kick, snare and hi-hat pattern on the 16-step grid.",
    plain:
      "A bar is a musical ruler. It is divided into 16 little steps. A drum pattern is just dots switched on and off along that ruler.",
    steps: [
      "Open Drum Machine from the rail. If the project has more than one drum channel, pick one in the DRUM CHANNEL menu.",
      "Tap steps 1, 5, 9 and 13 on the Kick row. Those are the four floor beats.",
      "Tap steps 5 and 13 on the Snare row. That is the backbeat.",
      "Tap every other step on the closed hi-hat row, then remove two hats to leave a little space.",
      "Press Play. Long-press a lit step to open its probability and ratchet settings. Try lowering one hat to 70% probability.",
      "Move the Swing slider to about 15%. The hats should lean instead of sitting perfectly straight.",
    ],
    controls: [
      "16 drum pads, each with its own row on the step grid",
      "Step grid: tap to toggle; long-press for probability and ratchet",
      "Swing slider and groove templates",
      "AI Style, Randomize, Evolve, Humanize and Euclidean generators",
      "Kit selector, pad inspector, velocity/probability strip",
    ],
    target: "drum-machine",
    action: "Open Drum Machine",
    proTip:
      "The snare is the backbeat. If a kick and snare land on the same step, move the kick — do not move the snare. The snare anchors the listener's sense of time.",
    heard: "A four-on-the-floor pulse with a snare on beats two and four, and hats that breathe.",
  },
  {
    id: "loop-bass",
    track: "first-loop",
    title: "Add the low end",
    kicker: "HARMONY",
    minutes: 4,
    goal: "Draw a simple bassline that locks with the kick instead of fighting it.",
    plain:
      "Bass is the floor of your song. It usually plays the root note of the chord and leaves space for the kick drum. Two or three good notes beat eight busy ones.",
    steps: [
      "Add a bass channel: open the Sounds panel in Quick Session, or add a channel in the Channel Rack.",
      "Open Piano Roll and select the bass track at the top.",
      "Draw one long note on the root note at the start of each bar. Press Play and listen.",
      "Shorten the notes so they stop before a kick hit you want to hear clearly.",
      "Select the notes and use the toolbar's duplicate/transpose tools to repeat the phrase in the next bar, then change the last note.",
    ],
    controls: [
      "Piano Roll: draw, move and resize notes",
      "Note inspector: velocity, length and articulation",
      "Quantise and scale detection",
      "Ghost notes from other tracks",
      "Selection tools: legato, transpose, invert, mirror and velocity ramps",
    ],
    target: "piano-roll",
    action: "Open Piano Roll",
    proTip:
      "Write the bass last in the bar, not first. Find where the kick is not, and put a note there. That conversation between kick and bass is what makes a groove feel alive.",
    heard: "A low note that supports the chords while leaving a clear hole for each kick.",
  },
  {
    id: "loop-chords",
    track: "first-loop",
    title: "Add chords and a melody",
    kicker: "HARMONY",
    minutes: 5,
    goal: "Choose a four-chord progression and write a melody you can hum back.",
    plain:
      "Chords are groups of notes played together. A progression is the order they appear. You do not need theory to start — choose a mood and S.M.U.V.E. gives you the chords.",
    steps: [
      "Open Chords. Pick a mood or progression and load it.",
      "Tap each chord card to hear it. Drag a card left or right to reorder the progression (Alt+Arrow also works from the keyboard).",
      "Set roughly one chord per bar, then loop those four bars.",
      "Open Piano Roll and write a two-bar melody. Use chord tones first, then add one passing note.",
      "Repeat the same melody for the next two bars, but change the final note so the phrase answers itself.",
    ],
    controls: [
      "One-tap progressions and voicings",
      "Chord cards: tap to audition, drag to reorder, Alt+Arrow to move",
      "Mood/key controls",
      "Open in Piano Roll hand-off",
    ],
    target: "chord-editor",
    action: "Open Chords",
    proTip:
      "A melody becomes memorable when it repeats. Write four bars, then repeat them with one changed ending. Repetition is the hook; variation is what keeps it interesting.",
    heard: "A four-bar chord bed with a short melody that sounds like it could be sung.",
  },
  {
    id: "loop-jam",
    track: "first-loop",
    title: "Loop it and jam",
    kicker: "ARRANGE",
    minutes: 4,
    goal: "Launch your patterns as scenes and build a simple drop.",
    plain:
      "A loop is a short piece of music that repeats. A scene is a group of loops on different instruments that start together. Launching scenes is how you perform a beat without stopping.",
    steps: [
      "Make sure each channel has a pattern. The scene grid shows one column per pattern slot.",
      "Turn the transport loop on and set the loop to four or eight bars.",
      "Tap a scene cell to launch that column. All channels that have material in that scene switch together.",
      "Turn on Follow so scenes advance automatically every four or eight bars.",
      "Mute the drums for one bar, then unmute them. That is a build-up and a drop.",
    ],
    controls: [
      "Loop toggle and loop length",
      "Scene grid and scene launch",
      "Follow toggle and follow length",
      "Mute / solo per channel",
      "Session View for the larger clip launcher",
    ],
    target: "quick-session",
    action: "Open Quick Session",
    proTip:
      "A drop feels bigger when you take something away first. Silence for one beat is stronger than adding another sound.",
    heard: "The loop switching sections on the bar line, with one deliberate hole before everything returns.",
  },
  {
    id: "loop-mix",
    track: "first-loop",
    title: "Balance the loop",
    kicker: "MIX",
    minutes: 4,
    goal: "Set levels and pan so every layer can be heard on a phone speaker.",
    plain:
      "Mixing means choosing what is loud, what is quiet, and what sits left or right. Start with the drums, then fit everything else around them.",
    steps: [
      "Open Mixer. Pull the faders down, then bring the drums up first.",
      "Add bass until it feels even with the kick. Add chords, then the melody.",
      "Pan the hats slightly right and the keys slightly left. Keep kick, snare, bass and vocal in the centre.",
      "Watch the meters. The master should hover below the top, not slam into it.",
      "Solo one channel to inspect it, then turn Solo off before you judge the balance again.",
    ],
    controls: [
      "Channel strips: fader, pan, mute, solo, record-arm",
      "Master fader and master meters",
      "AUX A/B sends and VCA bus rack",
      "Pan law and mono-compatibility meter",
      "Insert count and per-strip effects jump",
    ],
    target: "mixer",
    action: "Open Mixer",
    proTip:
      "Mix quiet. If it only sounds good loud, it is too loud. Leave headroom on the master — mastering needs room to work.",
    heard: "Every part audible at once, with the kick and snare still leading.",
  },
  {
    id: "loop-save",
    track: "first-loop",
    title: "Save it and send it",
    kicker: "DELIVER",
    minutes: 3,
    goal: "Save an editable project and export a WAV you can play anywhere.",
    plain:
      "Saving keeps the parts editable. Exporting turns them into one audio file. Do both: one to keep working, one to share.",
    steps: [
      "Press Ctrl+S (Cmd+S on Mac), or tap the save icon. Wait until the status says Saved locally.",
      "Open Export. Choose WAV 24-bit for quality, or a compressed format for a smaller file.",
      "Render the mixdown, then listen from the very start. Check the beginning and the ending.",
      "Export stems if someone else will mix it. Export MIDI if another producer needs your notes.",
      "Download the .smuve project bundle as a backup before closing the session.",
    ],
    controls: [
      "Save, autosave and version history",
      "Export: mixdown, stems, MIDI and share",
      "Format, bit depth and sample rate",
      "Delivery targets and saved presets",
      "Project bundle (.smuve)",
    ],
    target: "export",
    action: "Open Export",
    proTip:
      "Name files with the song, tempo and date — not final_final_3. Future-you will thank present-you.",
    heard: "Your loop as one clean audio file, starting and ending exactly where you meant it to.",
  },
];

const fullSongLessons: GuideLesson[] = [
  {
    id: "song-plan",
    track: "full-song",
    title: "Plan the record before you click",
    kicker: "PRE-PRODUCTION",
    minutes: 10,
    goal: "Choose a reference, a tempo, a key and a target length.",
    plain:
      "A song is easier to finish when you know what finished means. Pick a reference track and decide the feeling before you write a single note.",
    steps: [
      "Choose one commercial reference track in the same lane as your idea. You will use it for balance and loudness, never for copying.",
      "Open Project Details and set the name, genre, BPM and key so every surface agrees.",
      "Sketch the sections on paper: intro, verse, chorus, verse, chorus, bridge, chorus, outro. Give each one a bar count.",
      "Set the transport loop to eight bars. Most modern sections are built in four- or eight-bar blocks.",
      "Decide the target length. A focused three-minute record beats a five-minute one with no ending.",
    ],
    controls: [
      "Project menu and Project Details metadata",
      "Transport BPM, time signature and count-in",
      "Arrangement markers and timeline",
      "Reference-track slot in Mastering",
    ],
    target: "arrangement",
    action: "Open Arrangement",
    proTip:
      "Write the ending before the second verse. Songs that feel unfinished usually had no plan for the last thirty seconds.",
    heard: "Nothing yet — but you now know the shape, tempo and destination of the record.",
  },
  {
    id: "song-session",
    track: "full-song",
    title: "Set up a session you can finish",
    kicker: "SESSION",
    minutes: 8,
    goal: "Build a clean track list with a place for every part.",
    plain:
      "A tidy session is a faster session. Give every sound its own channel and name it before you start writing.",
    steps: [
      "Start a new project or load a starter groove, then open the Channel Rack.",
      "Create and name channels in this order: DRUMS, BASS, KEYS, LEAD, VOX LEAD, VOX DOUBLE, FX.",
      "Pick a real instrument for each channel. Use the Sound Browser to audition presets in context, not in isolation.",
      "Set sensible starting volumes: drums highest, bass close behind, keys and lead lower, vocals on top.",
      "Save once immediately, then let autosave carry the rest. A saved session is a session you can experiment in.",
    ],
    controls: [
      "Channel Rack: add, name, clone, reorder and pick instruments",
      "Sound Browser: presets, tags, favourites and similar sounds",
      "Mixer strips for starting levels",
      "Project save, autosave and version history",
    ],
    target: "channel-rack",
    action: "Open Channel Rack",
    proTip:
      "Colour and name as if a stranger will mix it. That stranger is usually you at 2 a.m., three weeks later.",
    heard: "A silent but organised session, with every part ready to receive notes.",
  },
  {
    id: "song-drums",
    track: "full-song",
    title: "Drums that carry the song",
    kicker: "RHYTHM",
    minutes: 20,
    goal: "Build two related drum patterns and a fill that joins them.",
    plain:
      "The drums are the song's engine. You need a main pattern for the verse, a bigger one for the chorus, and a fill to travel between them.",
    steps: [
      "Program an eight-bar verse pattern with kick, snare and hats. Keep it simple enough to repeat.",
      "Copy the pattern to a second slot. Add energy for the chorus: an extra kick, open hats, or a clap layer.",
      "Make a one- or two-bar fill for the last bar before a section change. A fill is a question; the next section is the answer.",
      "Use Swing and Humanize lightly. Perfect grids sound stiff; too much randomness sounds sloppy.",
      "Audition the two patterns against the bass, not alone. The drums and bass are one system.",
    ],
    controls: [
      "Pattern Copy / Paste and scene slots",
      "Swing, groove templates and Humanize",
      "Probability and ratchet per step",
      "Polymeter/channel length",
      "AI Style generators and Evolve",
    ],
    target: "drum-machine",
    action: "Open Drum Machine",
    proTip:
      "Contrast comes from subtraction. If the chorus adds a clap, consider removing a hat from the verse instead of piling more onto the chorus.",
    heard: "A verse that grooves and a chorus that lifts, joined by a fill that makes sense.",
  },
  {
    id: "song-bass",
    track: "full-song",
    title: "Bass that locks with the kick",
    kicker: "LOW END",
    minutes: 20,
    goal: "Write a bass part that defines the harmony without crowding the kick.",
    plain:
      "The bass tells the listener what the chord is. It also shares the low frequencies with the kick, so the two must take turns.",
    steps: [
      "Find the root note of each chord. Start by placing one root note on the first beat of each chord.",
      "Mute the kick and listen to the bass alone. Then mute the bass and listen to the kick. Note where they collide.",
      "Move or shorten bass notes so the kick has a clear hit. Repetition is good; mud is not.",
      "Add one rhythmic variation in the second half of the phrase so the bass does not loop mechanically.",
      "Set the bass channel's filter and envelope so it has a defined front edge, not a constant rumble.",
    ],
    controls: [
      "Piano Roll note editing and velocity",
      "Slide/portamento notes and articulation",
      "Ghost notes from the drum track",
      "Channel Rack instrument and filter controls",
      "Sidechain options in the Effects Rack",
    ],
    target: "piano-roll",
    action: "Open Piano Roll",
    proTip:
      "If you cannot hear the bass on a phone speaker, the problem is usually the mid-range, not the sub. Add harmonics instead of turning the bass up.",
    heard: "A low-end line you can follow with your foot, with every kick still clearly audible.",
  },
  {
    id: "song-harmony",
    track: "full-song",
    title: "Harmony with movement",
    kicker: "HARMONY",
    minutes: 25,
    goal: "Turn four chords into an eight-bar progression with a lift.",
    plain:
      "Four chords can carry a whole song, but eight bars give you room to surprise the listener. Keep the first four familiar and make the second four move.",
    steps: [
      "Build a four-chord progression that supports the mood. Save it as the verse.",
      "Copy it for the chorus. Change one chord to a higher-energy option, or change the voicing so the top note rises.",
      "Use inversions so the chords move smoothly instead of jumping around.",
      "Give the progression a rhythm: short stabs, sustained pads, or a repeating arpeggio pattern.",
      "Audition the harmony under the melody, then remove any chord tone that fights the vocal.",
    ],
    controls: [
      "One-tap progressions and voicings",
      "Drag-to-reorder chord cards",
      "Inversions and extensions",
      "Chord rhythm and open-in-Piano-Roll hand-off",
      "Key and scale context",
    ],
    target: "chord-editor",
    action: "Open Chords",
    proTip:
      "Voice leading beats fancy chord names. Move the smallest number of notes between chords and the progression will sound professional even if it is simple.",
    heard: "A chord bed that supports the verse and opens up in the chorus.",
  },
  {
    id: "song-topline",
    track: "full-song",
    title: "A melody people can repeat",
    kicker: "TOP LINE",
    minutes: 25,
    goal: "Write a short motif, answer it, and give the song one memorable peak.",
    plain:
      "A melody is a sentence. It needs a beginning, an answer, and one moment that goes higher or further than the rest. Short and singable beats clever and crowded.",
    steps: [
      "Write a four-note motif over the first chord. Play it back and hum it without the track.",
      "Repeat the motif, then change the last note so it answers the first phrase.",
      "Give the chorus a higher peak note. Only one peak — if everything is high, nothing is.",
      "Leave rests. A melody with holes lets the vocal and the listener breathe.",
      "Double the melody with a second instrument or a vocal layer, then decide which one leads.",
    ],
    controls: [
      "Piano Roll draw and note length",
      "Scale detection and quantise",
      "Ghost notes from the chord track",
      "Velocity and articulation",
      "Selection duplicate, transpose and mirror",
    ],
    target: "piano-roll",
    action: "Open Piano Roll",
    proTip:
      "If you cannot hum it after three listens, simplify it. The listener only gets one or two passes before the chorus arrives.",
    heard: "A melody you catch yourself humming after the track stops.",
  },
  {
    id: "song-sound",
    track: "full-song",
    title: "Sound design that fits the record",
    kicker: "SOUND",
    minutes: 30,
    goal: "Shape one signature sound instead of auditioning fifty presets.",
    plain:
      "A preset is a starting point, not a finished sound. The records you love use a few sounds with strong identities, not a hundred sounds fighting for space.",
    steps: [
      "Choose the one part that should define the record: the bass, the lead, or a texture.",
      "Audition presets in the mix at full volume. If a sound only works solo, it is the wrong sound.",
      "Shape it: filter for brightness, ADSR for attack and release, LFO for movement.",
      "Remove low end from anything that is not bass or kick. Give the signature sound its own frequency space.",
      "Save the patch and A/B it against the original preset so you know what you actually changed.",
    ],
    controls: [
      "Synthesizer: oscillators, filter, ADSR, LFO and effects",
      "Sound Browser tags, favourites and similar sounds",
      "Sampler zones, loop and pitch controls",
      "Effects Rack insert chain",
    ],
    target: "synthesizer",
    action: "Open Synthesizer",
    proTip:
      "Design in context, not in solo. A dull-sounding lead alone can be perfect once the drums and vocal arrive.",
    heard: "One sound with a clear personality that does not disappear when the full mix plays.",
  },
  {
    id: "song-vocal",
    track: "full-song",
    title: "Record a vocal that needs less fixing",
    kicker: "VOCALS",
    minutes: 40,
    goal: "Capture three usable takes, comp the best parts, and tune last.",
    plain:
      "The best vocal chain cannot rescue a bad performance. Get the room, the level and the energy right first; fix pitch and tone afterwards.",
    steps: [
      "Open the Tuner and check your starting pitch before recording anything.",
      "In Vocal Suite or Quick Recorder, choose the input, set a comfortable level, and monitor on headphones to avoid feedback.",
      "Turn on a one- or two-bar count-in. Record a full pass, then two more — do not stop at every mistake.",
      "Use the take lane and comp view to choose the best bar from each take. Crossfade the joins.",
      "Only then apply tuning, de-essing, EQ, compression, presence and air. Print or export the comp.",
    ],
    controls: [
      "Input device picker, monitoring and noise gate",
      "Count-in, punch-in and take list",
      "Take lane and vocal comp view",
      "Auto-Tune amount and retune speed",
      "De-esser, exciter, presence/air, compressor and limiter",
    ],
    target: "vocal-suite",
    action: "Open Vocal Suite",
    proTip:
      "Tuning is the last step, never the first. A tuned lazy performance still sounds lazy; an honest performance with light tuning sounds expensive.",
    heard: "A vocal that sits on top of the beat, in tune, with consonants you can understand.",
  },
  {
    id: "song-arrange",
    track: "full-song",
    title: "Arrange sections, not loops",
    kicker: "ARRANGEMENT",
    minutes: 40,
    goal: "Turn patterns into a finished intro, verse, chorus, bridge and outro.",
    plain:
      "Arranging is deciding when each part enters and leaves. The listener needs change every eight bars, but the change can be small.",
    steps: [
      "Place your verse, chorus and bridge patterns on the timeline as clips. Use the marker lane to name each section.",
      "Make every section differ by at least two elements from the one before it. Add, remove, or change an instrument.",
      "Build transitions: a filter sweep, a drum fill, a reversed cymbal, or one bar of near-silence.",
      "Use clip fades and crossfades so audio does not click at the edges.",
      "Add automation for the moments that matter: filter opening into the chorus, vocal delay throwing in the bridge, master volume easing out.",
    ],
    controls: [
      "Timeline clip draw, move, trim, split, duplicate and glue",
      "Clip fades and equal-power crossfades",
      "Markers, track groups and folders",
      "Automation lanes and bezier editor",
      "Take lanes and stem splitter",
    ],
    target: "arrangement",
    action: "Open Arrangement",
    proTip:
      "The first eight bars decide whether anyone hears bar nine. Put the strongest idea in the first thirty seconds, not the last.",
    heard: "A song that travels from one section to the next without repeating the same eight bars for three minutes.",
  },
  {
    id: "song-fx",
    track: "full-song",
    title: "Effects and automation",
    kicker: "POLISH",
    minutes: 35,
    goal: "Use inserts, sends and automation to create depth and movement.",
    plain:
      "Effects do two jobs: they make a sound fit, and they make a song move. Reverb and delay create space; EQ and compression control the fit.",
    steps: [
      "Open the Effects Rack for the vocal. Start with a high-pass filter, then compression, then de-essing, then tone.",
      "Put reverb and delay on AUX sends, not directly on every channel. One shared space sounds more like a record.",
      "Use a short room on drums, a plate on vocals, and a longer delay for one or two moments only.",
      "Automate the effect: open a filter into the chorus, or throw a delay on the last word of a line.",
      "A/B the whole chain with bypass and level matching. If it is better bypassed, remove it.",
    ],
    controls: [
      "Insert slots, parameter controls and bypass",
      "Built-in EQ, compressor, reverb, delay, chorus, saturation and sidechain",
      "AUX A/B sends",
      "Insert A/B and level matching",
      "Automation lanes and bezier curves",
    ],
    target: "effects-rack",
    action: "Open Effects Rack",
    proTip:
      "If you need more than three moves to explain an effect chain, simplify it. Every effect should have a job you can name.",
    heard: "A mix with front-to-back depth, where effects are noticed only when they stop.",
  },
  {
    id: "song-mixmaster",
    track: "full-song",
    title: "Mix, then master",
    kicker: "MIX & MASTER",
    minutes: 45,
    goal: "Balance the record, check it on real systems, then master to a delivery target.",
    plain:
      "Mixing balances the parts. Mastering makes the finished mix loud and consistent for release. They are two separate passes — do not master a mix you have not checked.",
    steps: [
      "Set gain staging first: trim every channel so nothing clips before the fader.",
      "Balance with faders, then pan, then EQ, then compression. Do not reach for an effect before the balance is right.",
      "Check the mix in mono, on a phone speaker, and at low volume. Fix what disappears.",
      "Open Mastering. Choose a delivery target, then render and master. Watch integrated LUFS and true peak.",
      "A/B against your reference with loudness matching, then leave it alone for a day before the final judgement.",
    ],
    controls: [
      "Mixer faders, pan, mute/solo and master",
      "Pan law and mono-compatibility meter",
      "Mastering LUFS, true peak, LRA and correlation meters",
      "Genre presets and delivery targets",
      "Reference A/B and loudness matching",
    ],
    target: "mastering",
    action: "Open Mastering",
    proTip:
      "Do not master in the same hour you mixed. Fresh ears catch the vocal that is too loud and the low end that only works in the car.",
    heard: "A record that holds up quietly, in mono, and next to a commercial release.",
  },
  {
    id: "song-export",
    track: "full-song",
    title: "Deliver the record",
    kicker: "DELIVERY",
    minutes: 15,
    goal: "Export the right files for streaming, collaborators and archiving.",
    plain:
      "Delivery is part of the craft. The right file for the platform, the right stems for a mix engineer, and a backup you can reopen.",
    steps: [
      "Render the final mixdown at 24-bit WAV. Keep this as the archive master.",
      "Export an instrumental and an a cappella if the song may be licensed or remixed.",
      "Export stems for anyone who will mix or master outside S.M.U.V.E.",
      "Export MIDI if the notes need to move to another DAW.",
      "Save the .smuve bundle and copy it somewhere off the device. Then file the release in the pipeline.",
    ],
    controls: [
      "Mixdown format, bit depth and sample rate",
      "Stem export and ZIP packaging",
      "MIDI export and project bundle",
      "Delivery presets and share",
      "Save integrity and version history",
    ],
    target: "export",
    action: "Open Export",
    proTip:
      "Three copies or it is not backed up: the device, the cloud, and one place that is not the same account. A release you cannot reopen is not finished.",
    heard: "A folder of clearly named files that any engineer, platform or future session can use.",
  },
];

const masteryLessons: GuideLesson[] = [
  {
    id: "master-session",
    track: "mastery",
    title: "Launch clips like an instrument",
    kicker: "LIVE WORKFLOW",
    minutes: 15,
    goal: "Perform a arrangement from scenes without pressing stop.",
    plain:
      "Session View lets you fire loops on cue. It is the difference between a song that plays and a song you can perform.",
    steps: [
      "Open Session View. Each row is a channel; each column is a scene.",
      "Set launch quantise so clips start on the next bar, not instantly.",
      "Launch a scene, then swap one clip at a time to keep the groove moving.",
      "Use follow actions to make scenes advance automatically.",
      "Capture the performance as an arrangement so the jam becomes an editable song.",
    ],
    controls: [
      "Scene/clip grid and launch quantise",
      "Scene rename, duplicate and reorder",
      "Follow actions",
      "Per-clip automation points and curves",
      "Level meters",
    ],
    target: "session",
    action: "Open Session View",
    proTip:
      "Change one clip per bar. Changing everything at once sounds like a new song; changing one thing sounds like a remix.",
    heard: "A continuous performance with no silent gaps between sections.",
  },
  {
    id: "master-pads",
    track: "mastery",
    title: "Finger-drum and play keys",
    kicker: "PERFORMANCE",
    minutes: 20,
    goal: "Use pads and a keyboard as real instruments, not as buttons.",
    plain:
      "Pads reward dynamics. Hit the centre for full velocity, the edge for a softer note. The same performance recorded with expression sounds human.",
    steps: [
      "Open Performance or Performer and choose the drum kit or keyboard sound.",
      "Hit a pad at the centre, then at the edge. Listen to the velocity difference.",
      "Long-press a pad to reassign its sound; use MIDI Learn to map a hardware pad or key.",
      "Try smart chords on the keyboard so one key plays a full chord in key.",
      "Record a pass with the arpeggiator or note repeat on, then edit the result in Piano Roll.",
    ],
    controls: [
      "Pad grid with velocity by touch position",
      "Long-press pad reassignment",
      "MIDI Learn per pad",
      "Keyboard with pitch bend and mod wheel",
      "Smart chords, arpeggiator and scene launch",
    ],
    target: "performance",
    action: "Open Performance",
    proTip:
      "Record the performance, not the idea. A slightly imperfect pass with feel beats a quantised pass with none.",
    heard: "Pads and keys with dynamics — loud hits, soft ghost notes, and a human groove.",
  },
  {
    id: "master-sample",
    track: "mastery",
    title: "Chop and map samples",
    kicker: "SAMPLING",
    minutes: 25,
    goal: "Slice a loop, map the slices, and play a new pattern from them.",
    plain:
      "Sampling is taking a piece of sound and making it yours. Chopping a drum loop or a vocal phrase into slices lets you replay it in a new order.",
    steps: [
      "Import an audio file into the Sample Library and audition it.",
      "Open the Sampler. Drop or load the sample and let it detect slices, or place slice markers yourself.",
      "Map slices across the keyboard or pads so each slice has its own note.",
      "Set loop points, crossfade and pitch so the slices do not click.",
      "Play a new pattern from the slices, then record it as notes so it can be edited later.",
    ],
    controls: [
      "Sample Library tags, audition and drag",
      "Sampler zones, round-robin and key mapping",
      "Slice markers and transient detection",
      "Loop points and crossfade",
      "Pitch shift, tempo match and ADSR",
    ],
    target: "sampler",
    action: "Open Sampler",
    proTip:
      "Chop by transient, not by equal divisions. The attack of each hit is what makes a chop feel like a chop.",
    heard: "A familiar sample turned into a new rhythm that no longer sounds like the original loop.",
  },
  {
    id: "master-dj",
    track: "mastery",
    title: "DJ with stems and hot cues",
    kicker: "DJ BOOTH",
    minutes: 20,
    goal: "Beat-match two tracks and perform a transition using stems.",
    plain:
      "A DJ set is arrangement in real time. Hot cues jump to moments; loops extend them; stems let you swap only the drums or only the vocal.",
    steps: [
      "Load a track on deck A and one on deck B. Start deck A.",
      "Use beat-jump and the platter to line up the next track. Watch the waveform and the meters.",
      "Set hot cues on the drop, the vocal and the breakdown so you can jump instantly.",
      "Bring deck B in with the crossfader, then use stem gains to trade the drums or vocal.",
      "Record the set from the master recorder so the performance is not lost.",
    ],
    controls: [
      "Two decks with platters and waveform overviews",
      "Hot cues, loops and beat-jump",
      "Crossfader and channel meters",
      "Stem gains",
      "FX pads, sampler pads and scratch monitor",
    ],
    target: "dj",
    action: "Open DJ Booth",
    proTip:
      "Mix with the mids. If both tracks have huge bass, the transition turns to mud. Trade the low end first.",
    heard: "Two tracks moving as one, with no drop in energy at the switch.",
  },
  {
    id: "master-score",
    track: "mastery",
    title: "Read and export notation",
    kicker: "SCORE",
    minutes: 15,
    goal: "See your MIDI as notation and hand it to a player.",
    plain:
      "The Score view turns your notes into sheet music. It is a bridge between the studio and a real musician.",
    steps: [
      "Open Score View and choose the track or tracks you want to read.",
      "Check enharmonic spelling against the project key so the page is readable.",
      "Play the section and follow the notation to catch notes that look wrong.",
      "Export MusicXML so a notation app or a player can open it.",
      "Print or share the part, then annotate phrasing and dynamics by hand.",
    ],
    controls: [
      "Notation layout and track selection",
      "Key and time-signature context",
      "MusicXML export",
      "Playback follow",
    ],
    target: "score",
    action: "Open Score View",
    proTip:
      "Notation is for the player, not for you. If a rhythm is hard to read, simplify the spelling before you hand it over.",
    heard: "Your notes as a score that a session player could read without a explanation.",
  },
  {
    id: "master-ai",
    track: "mastery",
    title: "Direct the AI band",
    kicker: "AI PRODUCTION",
    minutes: 20,
    goal: "Use generated parts as raw material, then edit them like your own.",
    plain:
      "AI is a fast sketchpad. Ask for a direction, keep what works, and replace what does not. You are still the producer.",
    steps: [
      "Open AI Producer and describe the vibe: genre, tempo, mood and the part you need.",
      "Generate a pass. Audition it against your existing tracks.",
      "Keep the useful bars and delete the rest — do not accept a full arrangement you did not choose.",
      "Edit the generated notes in Piano Roll so the rhythm and voicing fit your song.",
      "Use the AI band for a bass, drum or keys part when you are stuck, then play over it yourself.",
    ],
    controls: [
      "Prompt-guided generation",
      "Style and tempo direction",
      "Generated tracks in the same song document",
      "AI band session musicians",
      "AI Mix Assistant suggestions",
    ],
    target: "ai-produce",
    action: "Open AI Producer",
    proTip:
      "Never let a generator make the decision you cannot explain. If you cannot describe why a part works, you cannot fix it later.",
    heard: "A generated part that sounds intentional because you edited it into your song.",
  },
  {
    id: "master-fx",
    track: "mastery",
    title: "Build professional effect chains",
    kicker: "MIX & POLISH",
    minutes: 25,
    goal: "Use order, parallel processing and sidechain like a mix engineer.",
    plain:
      "The order of effects matters more than the amount. Fix the problem first, then add character, then add space.",
    steps: [
      "Start a vocal chain: high-pass, then compression, then de-esser, then tone, then space.",
      "Put reverb and delay on sends so several channels share one space.",
      "Sidechain the bass to the kick so the low end breathes instead of piling up.",
      "Use parallel compression on drums for energy without losing the transients.",
      "Bypass each insert and level-match before deciding it helps.",
    ],
    controls: [
      "Insert order, bypass and parameter control",
      "EQ, compression, saturation and limiting",
      "Reverb and delay sends",
      "Sidechain routing",
      "A/B level matching and plugin presets",
    ],
    target: "effects-rack",
    action: "Open Effects Rack",
    proTip:
      "Cut before you boost. Most muddy mixes need fewer low mids, not more top end.",
    heard: "A mix that is clearer and louder without any single effect calling attention to itself.",
  },
  {
    id: "master-collab",
    track: "mastery",
    title: "Collaborate without losing work",
    kicker: "WORKFLOW",
    minutes: 15,
    goal: "Share a session, review changes, and keep a recoverable history.",
    plain:
      "Collaboration is a workflow problem before it is a musical one. Decide who owns which part and save versions before big changes.",
    steps: [
      "Save and name the session before inviting anyone. Export a .smuve bundle as a restore point.",
      "Open the share/collaboration controls and copy the studio link.",
      "Agree who edits which tracks. Mute or archive parts you are not working on to avoid confusion.",
      "Use version history to compare before and after a collaborator's pass.",
      "Download the merged result and keep a local copy — never rely on one device as the only home.",
    ],
    controls: [
      "Share link and collaboration session controls",
      "Version history and restore",
      "Save state and autosave",
      "Project bundle export/import",
    ],
    target: "quick-session",
    action: "Open Quick Session",
    proTip:
      "One decision-maker per part. A session with two people changing the same vocal will always end in a lost good take.",
    heard: "A session that two people can open, edit and return without a mystery file appearing.",
  },
  {
    id: "master-speed",
    track: "mastery",
    title: "A keyboard-first workflow",
    kicker: "SPEED",
    minutes: 12,
    goal: "Move through the Studio without hunting for buttons.",
    plain:
      "Speed comes from repetition, not from knowing every feature. Learn five shortcuts and you will work twice as fast.",
    steps: [
      "Learn Space (play/stop), R (record), M (metronome), Ctrl+Z (undo), Ctrl+S (save).",
      "Use Ctrl+E to export and Ctrl+I to open the AI Mix Assistant.",
      "Use Shift+F to turn Stage FX on or off when you need a calmer screen.",
      "Open the command palette / search overlay and jump to a surface by name.",
      "Build one repeatable start-up routine: open project, set tempo, load kit, arm track.",
    ],
    controls: [
      "Global shortcuts: Space, R, M, Ctrl+Z, Ctrl+Shift+Z, Ctrl+S, Ctrl+E, Ctrl+I, Shift+F",
      "Command palette / search overlay",
      "Rail and mobile drawer",
      "Studio Guide and Music Map",
    ],
    target: "quick-session",
    action: "Open Quick Session",
    proTip:
      "Do not learn every shortcut at once. Add one per session until it is automatic.",
    heard: "Less clicking, more listening.",
  },
  {
    id: "master-ears",
    track: "mastery",
    title: "Train your ears and finish more songs",
    kicker: "MASTERY",
    minutes: 20,
    goal: "Build a repeatable listening routine that catches real problems.",
    plain:
      "Professional ears are not magic. They have a checklist and they listen in more than one place.",
    steps: [
      "Check the tuner before recording; pitch drift is easier to prevent than to fix.",
      "Listen once for the vocal, once for the bass, once for the drums. Take notes instead of touching controls.",
      "Check in mono, on a phone, and quietly. Each reveals a different problem.",
      "A/B against your reference with matched loudness so louder does not win.",
      "Finish and release. The next song teaches more than another week on this one.",
    ],
    controls: [
      "Tuner and pitch detection",
      "Mastering reference A/B and loudness matching",
      "Mono monitoring and metering",
      "Metronome and practice tools",
      "Version history",
    ],
    target: "tuner",
    action: "Open Tuner",
    proTip:
      "Keep a written note of every fix you make. A mix revision without notes is just a different mix, not a better one.",
    heard: "The same song revealing different problems in different rooms — and you knowing which ones matter.",
  },
];

/**
 * Lessons that can be checked by observing the real Studio. Lessons without an
 * entry stay manual on purpose: their proof is a listening or judgement call
 * (finger dynamics, DJ transitions, ear training), not a signal this app can
 * honestly measure.
 */
export const GUIDE_AUTO_CHECKS: Readonly<
  Partial<Record<string, GuideAutoCheckKind>>
> = {
  "loop-sound": "transport-started",
  "loop-groove": "starter-loaded",
  "loop-drums": "document-edited",
  "loop-bass": "document-edited",
  "loop-chords": "document-edited",
  "loop-jam": "scene-launched",
  "loop-mix": "document-edited",
  "loop-save": "audio-exported",
  "song-plan": "metadata-changed",
  "song-session": "document-edited",
  "song-drums": "document-edited",
  "song-bass": "document-edited",
  "song-harmony": "document-edited",
  "song-topline": "document-edited",
  "song-sound": "document-edited",
  "song-vocal": "recording-started",
  "song-arrange": "document-edited",
  "song-fx": "document-edited",
  "song-export": "audio-exported",
  "master-session": "scene-launched",
  "master-sample": "document-edited",
  "master-score": "document-edited",
  "master-ai": "document-edited",
  "master-fx": "document-edited",
  "master-collab": "collab-started",
};

export const GUIDE_AUTO_CHECK_LABELS: Readonly<
  Record<GuideAutoCheckKind, string>
> = {
  "transport-started": "Auto-checks when you press Play",
  "starter-loaded": "Auto-checks when a starter groove loads",
  "document-edited": "Auto-checks when you edit this tool",
  "scene-launched": "Auto-checks when you launch a scene",
  "project-saved": "Auto-checks when the project saves",
  "metadata-changed": "Auto-checks when project details change",
  "recording-started": "Auto-checks when recording starts",
  "audio-exported": "Auto-checks when an audio file is exported",
  "collab-started": "Auto-checks when a collaboration session starts",
};

export const GUIDE_TRACKS: GuideTrack[] = [
  {
    id: "first-loop",
    label: "First Loop",
    tagline: "Silence to a loop you can play for a friend.",
    forWho: "Kids, first-timers, and anyone who just wants a beat",
    minutes: 32,
    icon: "looks_one",
    accent: "#ffb800",
    outcome: "A balanced, saved 4–8 bar loop and a WAV you can share.",
    lessons: firstLoopLessons,
  },
  {
    id: "full-song",
    label: "Full Song",
    tagline: "An empty project to a finished, delivered record.",
    forWho: "Artists ready to build a complete composition",
    minutes: 315,
    icon: "library_music",
    accent: "#5dc4c2",
    outcome: "A full arrangement, mixed and mastered, with stems and a backup.",
    lessons: fullSongLessons,
  },
  {
    id: "mastery",
    label: "Studio Mastery",
    tagline: "The pro surfaces and the habits that make them useful.",
    forWho: "Producers who know the basics and want command",
    minutes: 185,
    icon: "workspace_premium",
    accent: "#c084fc",
    outcome: "Live performance, sampling, DJ, notation, AI and effect-chain fluency.",
    lessons: masteryLessons,
  },
];
// Attach the observable action to each lesson in place, so both the path
// renderer and the auto-check service read the same lesson objects.
for (const track of GUIDE_TRACKS) {
  for (const lesson of track.lessons) {
    const autoCheck = GUIDE_AUTO_CHECKS[lesson.id];
    if (autoCheck) lesson.autoCheck = autoCheck;
  }
}

export const ALL_GUIDE_LESSONS: GuideLesson[] = GUIDE_TRACKS.flatMap(
  (track) => track.lessons,
);

export function guideTrack(id: GuideTrackId): GuideTrack {
  const track = GUIDE_TRACKS.find((entry) => entry.id === id);
  if (!track) throw new Error(`Unknown guide track: ${id}`);
  return track;
}

/**
 * One entry per Studio surface, in workflow order. `studio-guide.data.spec.ts`
 * fails if a surface is missing, duplicated or names an unknown target.
 */
export const GUIDE_SURFACE_ATLAS: GuideSurfaceEntry[] = [
  {
    id: "quick-session",
    group: "Create & Jam",
    what: "The one-screen studio for starting fast: transport, tempo, channels, scenes and one-tap starters.",
    features: [
      "Full transport, BPM, metronome, master volume and record",
      "Channel strips with mute, solo, volume and record-arm",
      "Scene grid that edits patterns and launches whole columns",
      "One-tap genre starters that build drums, bass, chords and melody",
      "Sounds and Tools side panels instead of extra screens",
    ],
    gestures: [
      "Tap a channel to select it; tap M or S to mute or solo without selecting",
      "Tap a scene cell to edit that pattern; launch a column from the scene controls",
      "Open Sounds or Tools when you need more, then close the panel to return to the loop",
    ],
    proTip:
      "Treat Quick Session as the cockpit, not the whole plane. Start here, then open the dedicated surface for detail.",
  },
  {
    id: "drum-machine",
    group: "Create & Jam",
    what: "A 16-step rhythm programmer with real drum voices, per-step musicality and kit management.",
    features: [
      "16 pads with kick, snare, hats, percussion and kit swapping",
      "Step grid with per-step probability and ratchet",
      "Swing slider, groove templates and Humanize",
      "AI Style, Randomize, Evolve, Euclidean and fill generators",
      "Polymeter/channel length, pattern copy/paste and takes",
      "Pad inspector with cutoff, resonance, pan, decay and one-shot import",
    ],
    gestures: [
      "Tap a step to toggle it; paint across steps to draw a run",
      "Long-press a lit step for probability and ratchet settings",
      "Tap a pad to select it and audition its voice; drag the velocity/probability bars to shape the row",
      "Tap a bar tab to move between 16-step windows",
    ],
    proTip:
      "Program the kick and snare first, then use probability and ratchet only where the listener expects repetition — the surprise lands harder.",
  },
  {
    id: "piano-roll",
    group: "Create & Jam",
    what: "The note-level editor for melodies, bass, chords and MIDI editing.",
    features: [
      "WebGL note grid with draw, move and resize",
      "Velocity, articulation, slide notes and per-note probability",
      "Ghost notes from other tracks and scale detection",
      "Quantise presets and MIDI file import by drop",
      "Selection tools: legato, clip-to-scale, transpose, invert, mirror, duplicate-to-next-bar and velocity ramps",
      "CC lanes, pitch bend and bezier automation hand-off",
    ],
    gestures: [
      "Drag on empty grid to draw; drag a note to move it; drag its edge to resize",
      "Select notes, then use the toolbar to quantise, transpose or shape velocity",
      "Pinch to zoom and drag the background to pan",
      "Drop a .mid file onto the roll to merge it at the playhead",
    ],
    proTip:
      "Use ghost notes. Seeing the chord and drum parts behind your melody prevents the most common arrangement collision.",
  },
  {
    id: "vocal-suite",
    group: "Create & Jam",
    what: "A dedicated vocal chain for tuning, tone, dynamics and analysis.",
    features: [
      "Elite Auto-Tune with amount and retune-speed control",
      "De-esser, harmonic exciter, presence and air",
      "Compressor and limiter modules",
      "Spectrograph for seeing pitch and resonance",
      "Take envelope, normalize, trim silence and download",
    ],
    gestures: [
      "Enable a module, then drag its amount or frequency control",
      "Toggle Auto-Tune and set retune speed; faster is more modern, slower is more natural",
      "Watch the spectrograph while auditioning to find harsh frequencies",
    ],
    proTip:
      "Tune after comping, not before. Tuning three separate takes separately makes the joins obvious.",
  },
  {
    id: "audio-recorder",
    group: "Create & Jam",
    what: "The quick capture surface for voice memos, instruments and full takes.",
    features: [
      "Input device picker and monitoring",
      "Noise gate with threshold and level meter",
      "Take list with rename, mute, delete and select",
      "Promote-to-take and export to the arrangement",
      "Background-safe finalize and WAV writing",
    ],
    gestures: [
      "Choose the input, set the gate, then press record",
      "Tap a take in the list to audition or promote it",
      "Rename the take before exporting so the arrangement stays readable",
    ],
    proTip:
      "Record a ten-second level check before the real take. Fixing clipping after capture is impossible.",
  },
  {
    id: "tuner",
    group: "Create & Jam",
    what: "A pitch checker for instruments and voices before recording.",
    features: [
      "Live pitch detection and note readout",
      "Mic/input selection",
      "Visual sharp/flat feedback",
      "Works before the transport or a take",
    ],
    gestures: [
      "Open the tuner and play or sing one steady note",
      "Adjust the instrument until the readout centres",
      "Check the octave and the fifth, not just the root note",
    ],
    proTip:
      "Tune quietly and slowly. A tuner follows a stable note; a wobbling one gives a wobbling reading.",
  },
  {
    id: "chord-editor",
    group: "Create & Jam",
    what: "One-tap chord progressions and voicings for writers who do not want a theory lecture.",
    features: [
      "Mood and progression presets",
      "Chord cards with voicings and audition",
      "Drag-to-reorder progression",
      "Keyboard reorder with Alt+Arrow",
      "Open-in-Piano-Roll hand-off",
    ],
    gestures: [
      "Tap a chord card to hear it; drag a card left or right to reorder",
      "Use Alt+Arrow on a focused card to move it without a mouse",
      "Play the progression, then hand it to Piano Roll for rhythm edits",
    ],
    proTip:
      "Write the bass note first, then choose the chord voicing above it. The bass note is what the listener remembers.",
  },
  {
    id: "sound-pad",
    group: "Create & Jam",
    what: "An MPC-style 4×4 pad bank for finger drumming and tonal pads.",
    features: [
      "Real drum voices: kick, snare, hats, congas, bass, 808 and tonal pads",
      "Each pad carries its own preset and MIDI note",
      "Velocity-sensitive pad hits",
      "Pad bank for quick auditioning and performance",
    ],
    gestures: [
      "Tap a pad to play it; hit the centre for full velocity and the edge for softer",
      "Switch pads to different voices from the pad controls",
      "Play along to the transport, then record the part in the arrangement",
    ],
    proTip:
      "Keep the kick and snare on the pads your thumbs reach first. Speed matters more than a perfect layout.",
  },
  {
    id: "synthesizer",
    group: "Create & Jam",
    what: "A full synth voice for shaping sounds rather than just picking presets.",
    features: [
      "Multiple synthesis engines: subtractive, FM, wavetable, granular, physical modelling and advanced",
      "Oscillators, filter, ADSR and LFO",
      "Patch load and save",
      "Beginner/pro control depth",
      "Built-in effects and modulation",
    ],
    gestures: [
      "Load a patch, then drag knobs to shape it",
      "Switch the engine to change the character entirely",
      "Use the beginner toggle when you want fewer controls on screen",
    ],
    proTip:
      "Change one parameter at a time and listen. Random knob-turning teaches nothing; one deliberate move becomes a signature.",
  },
  {
    id: "ai-produce",
    group: "Create & Jam",
    what: "Prompt-guided generation of beats and arrangements that lands as editable tracks.",
    features: [
      "Text direction for style, mood and part",
      "Generated drums, bass, chords and melody ideas",
      "Results arrive in the same song document as your own notes",
      "Audition against the current project",
    ],
    gestures: [
      "Describe the part you need, generate, then audition in context",
      "Keep the bars that work and delete the rest",
      "Open the result in Piano Roll or Drum Machine for real editing",
    ],
    proTip:
      "Use AI to get past the blank page, not to finish the song. The edit is what makes it yours.",
  },
  {
    id: "arrangement",
    group: "Song Builder",
    what: "The full song timeline: clips, sections, automation and the finished structure.",
    features: [
      "Audio, MIDI and automation clips on one timeline",
      "Draw, move, trim, slip, split, duplicate, glue and consolidate clips",
      "Clip fades and equal-power crossfades",
      "Markers, track groups and folders",
      "Take lanes, stem splitter and bounce-to-audio",
      "Pinch zoom and two-finger pan",
    ],
    gestures: [
      "Drag a clip to move it; drag an edge to trim; use the clip toolbar to split or duplicate",
      "Pinch to zoom, two-finger drag to pan",
      "Select two overlapping audio clips and apply a crossfade",
      "Open an automation lane and draw points or curves",
    ],
    proTip:
      "Arrange in eight-bar blocks and make every section differ by at least two elements. That is the difference between a loop and a song.",
  },
  {
    id: "session",
    group: "Song Builder",
    what: "A non-linear clip launcher for jamming and performing without stopping the transport.",
    features: [
      "Scene/clip grid with launch quantise",
      "Scene rename, duplicate and reorder",
      "Follow actions that advance scenes automatically",
      "Per-clip automation points and curves",
      "Level meters",
    ],
    gestures: [
      "Tap a clip to launch it; tap a scene to launch the whole row",
      "Long-press to move or reorder a clip/scene",
      "Set follow actions when you want the set to run hands-free",
    ],
    proTip:
      "Launch on the bar line. Quantised scene changes are what make a live set feel intentional rather than accidental.",
  },
  {
    id: "channel-rack",
    group: "Song Builder",
    what: "The instrument and pattern overview: every channel, its sound and its step sequence.",
    features: [
      "Per-track instrument picker, mute, solo, volume and pan",
      "Clone, reorder and drag-and-drop channels",
      "16-step-per-bar sequencer with paint-drag",
      "Bar windowing and per-step pitch entry",
      "Central view of every pattern in the project",
    ],
    gestures: [
      "Drag channels to reorder them; use the instrument picker to swap sounds",
      "Paint steps across a lane instead of tapping one at a time",
      "Open a channel's editor from its strip",
    ],
    proTip:
      "Order channels the way you hear the song: drums, bass, harmony, lead, vocals. Your eyes should follow the mix.",
  },
  {
    id: "score",
    group: "Song Builder",
    what: "Turns your MIDI into readable notation and exports it for real players.",
    features: [
      "Notation view of the selected track(s)",
      "Key and time-signature context",
      "MusicXML export",
      "Playback follow",
    ],
    gestures: [
      "Select the track to display",
      "Play and follow the notation to catch wrong notes",
      "Export MusicXML for a notation app or session player",
    ],
    proTip:
      "Notation is a communication format. If a player cannot read it at sight, simplify the spelling before handing it over.",
  },
  {
    id: "mixer",
    group: "Mix & Polish",
    what: "The console: levels, pan, sends, routing, buses and honest meters.",
    features: [
      "Channel strips with fader, pan, mute, solo and record-arm",
      "Master fader and master metering",
      "AUX A/B send view with dB readouts",
      "VCA bus rack and routing view",
      "Insert count, per-strip bypass and effects jump",
      "Pan law and mono-compatibility correlation meter",
    ],
    gestures: [
      "Drag a fader; use the keyboard for fine changes",
      "Switch Strips / Sends / Routing views",
      "Solo a strip to inspect it, then turn Solo off before judging the mix",
      "Hold A/B to compare the processed and bypassed chain",
    ],
    proTip:
      "Set gain staging before you touch a fader. A clipped channel cannot be fixed by pulling the master down.",
  },
  {
    id: "effects-rack",
    group: "Mix & Polish",
    what: "Per-channel insert chains for EQ, dynamics, saturation, space and sidechain.",
    features: [
      "Built-in EQ, compressor, limiter, reverb, delay, chorus and saturation",
      "Dynamic rack with worklet-hosted inserts",
      "Per-slot enable, remove, bypass and parameter control",
      "A/B mix and level matching",
      "Sidechain routing",
    ],
    gestures: [
      "Add an insert, then drag its parameters",
      "Bypass one slot to hear exactly what it contributes",
      "Use level matching before deciding a chain is better",
    ],
    proTip:
      "Order: fix, shape, then space. EQ and dynamics before reverb and delay. Space last so it does not get compressed away.",
  },
  {
    id: "dj",
    group: "Mix & Polish",
    what: "A two-deck DJ booth for beat-matching, hot cues, loops and stem transitions.",
    features: [
      "Two decks with platters, waveform overviews and channel meters",
      "Hot cues, loops, beat-jump and FX pads",
      "Crossfader and per-deck gain",
      "Stem gains for drums, bass, vocals and more",
      "Sampler pads and scratch monitor",
      "MIDI clock output",
    ],
    gestures: [
      "Use the platter to nudge; use beat-jump to align phrases",
      "Tap a hot cue to jump; hold a loop pad to extend a section",
      "Trade stem gains instead of slamming the crossfader",
    ],
    proTip:
      "Mix with the mids and trade the low end. Two full basslines at once is mud, not energy.",
  },
  {
    id: "mastering",
    group: "Mix & Polish",
    what: "The final loudness and tone pass, with reference matching and delivery targets.",
    features: [
      "Integrated LUFS, true peak, LRA and correlation meters",
      "Spectrogram and genre presets",
      "Target LUFS and safe ceiling",
      "Offline render-and-master",
      "Reference-track A/B with loudness matching",
      "Delivery targets for streaming, podcast and club",
    ],
    gestures: [
      "Choose a delivery target, then render and master",
      "Import a reference and A/B it with matched loudness",
      "Watch true peak as you raise the limiter",
    ],
    proTip:
      "Loudness is not quality. A dynamic master at −14 LUFS will outlast a crushed one at −8 on every platform.",
  },
  {
    id: "export",
    group: "Mix & Polish",
    what: "The delivery surface: mixdowns, stems, MIDI, project bundles and share.",
    features: [
      "WAV 16-bit and 24-bit at 44.1 or 48 kHz",
      "Compressed formats with selectable bitrate",
      "Stem export as a ZIP",
      "MIDI export",
      "Project bundle (.smuve) for backup and transfer",
      "Delivery presets and release filing",
    ],
    gestures: [
      "Choose format, rate and bit depth, then render",
      "Save a delivery preset for repeat releases",
      "Share the mixdown or file it into the release pipeline",
    ],
    proTip:
      "Keep the 24-bit WAV master. Streaming platforms transcode; your archive should not start from a lossy file.",
  },
  {
    id: "performance",
    group: "Mix & Polish",
    what: "A live pad and keyboard surface for triggering scenes and playing parts.",
    features: [
      "4×4/8×8 pad grids with velocity from touch position",
      "Long-press pad reassignment and MIDI Learn",
      "Keyboard view with pitch bend and mod wheel",
      "Smart chords, arpeggiator and scene launch",
      "Live engine routing and visualiser",
    ],
    gestures: [
      "Hit pads at different positions for velocity; long-press to reassign",
      "Use smart chords to play a full chord from one key",
      "Launch scenes while playing for a live arrangement",
    ],
    proTip:
      "Set up the pads before the show, not during it. Label them so you can find the next hit without looking.",
  },
  {
    id: "sound-browser",
    group: "Sounds & Packs",
    what: "The instrument and preset library, organised for fast auditioning in context.",
    features: [
      "Presets with tags, categories and favourites",
      "Similar-sound suggestions and AI search",
      "Audition before loading",
      "Drag a preset onto a track",
    ],
    gestures: [
      "Search or filter by tag/category",
      "Audition a preset, then drag it to the target track",
      "Favourite the sounds you use often",
    ],
    proTip:
      "Audition at full-mix volume. A preset that sounds thin alone may sit perfectly once the drums arrive.",
  },
  {
    id: "sample-library",
    group: "Sounds & Packs",
    what: "The storage and browsing surface for imported audio and loops.",
    features: [
      "Imported samples and loops with tags",
      "Audition and search",
      "Drag a sample into a track or the sampler",
      "Factory and user content in one place",
    ],
    gestures: [
      "Tap a sample to audition; drag it to the timeline or sampler",
      "Tag and rename imports so future-you can find them",
      "Search by name or category",
    ],
    proTip:
      "Rename samples the moment you import them. A folder of AUDIO_001 files is not a library.",
  },
  {
    id: "sampler",
    group: "Sounds & Packs",
    what: "The slice-and-map instrument for turning audio into playable notes.",
    features: [
      "Zones, key mapping and round-robin",
      "ADSR, loop points and crossfade",
      "Pitch shift and tempo match",
      "Slice markers and transient detection",
      "Drag/drop import",
    ],
    gestures: [
      "Drop a sample, then place slice markers or let the sampler detect them",
      "Map slices across keys or pads",
      "Set loop points and crossfade to remove clicks",
    ],
    proTip:
      "Slice at the attack, then trim the tail. A chop with a click at the front will sound wrong no matter how you sequence it.",
  },
  {
    id: "plugins",
    group: "Sounds & Packs",
    what: "The built-in plugin shelf for extra effects, synths and community packs.",
    features: [
      "Pro studio effects and synthesizers",
      "Community plugin import/export with parameter mapping",
      "Per-slot plugin loading in the Effects Rack",
      "A/B and preset support",
    ],
    gestures: [
      "Browse the shelf, then load a plugin into an insert slot",
      "Import a community plugin and map its parameters",
      "Bypass and A/B before committing",
    ],
    proTip:
      "Collect fewer plugins and learn them deeply. One compressor you understand beats ten you audition forever.",
  },
  {
    id: "performer",
    group: "More Tools",
    what: "A live keyboard and pad layout for performing the selected instrument.",
    features: [
      "Playable keyboard with pitch bend and mod wheel",
      "Velocity-sensitive keys and pads",
      "Smart chords and arpeggiator",
      "MIDI Learn for hardware controls",
      "Scene launch and live routing",
    ],
    gestures: [
      "Play the keyboard or pads; move the bend and mod controls while notes sustain",
      "Map a hardware knob or key with MIDI Learn",
      "Launch scenes without leaving the performance layout",
    ],
    proTip:
      "Record the performance as MIDI, then edit only the mistakes. Do not quantise the feel out of it.",
  },
];

export const GUIDE_GLOSSARY: GuideGlossaryEntry[] = [
  { term: "BPM", plain: "Beats per minute. The speed of the song's clock. 90 is relaxed, 140 is energetic." },
  { term: "Bar", plain: "A musical ruler. In 4/4, one bar holds four beats and sixteen sixteenth-note steps." },
  { term: "Beat", plain: "One tick of the pulse. Four beats usually make one bar." },
  { term: "Step", plain: "The smallest grid slice in the drum machine and sequencer — usually a sixteenth note." },
  { term: "Loop", plain: "A short section that repeats. A loop is the raw material; a song is what you build from it." },
  { term: "Track / channel", plain: "One instrument's lane in the song. Every note lives on a track." },
  { term: "Pattern / clip", plain: "A piece of music on one track. Patterns repeat; clips place them on the timeline." },
  { term: "Scene", plain: "A column of patterns that launch together on different tracks." },
  { term: "Transport", plain: "The Play, Stop and Record controls, plus tempo and position." },
  { term: "Velocity", plain: "How hard a note is played. Soft hits are quieter and darker; hard hits are louder and brighter." },
  { term: "MIDI", plain: "Instructions, not audio — which note, when, how hard and how long. Editable forever." },
  { term: "Audio", plain: "A recorded sound wave. Once captured, its notes cannot be moved like MIDI." },
  { term: "Insert", plain: "An effect placed directly in one channel's signal path." },
  { term: "Send / AUX", plain: "A copy of a channel sent to a shared effect, usually reverb or delay." },
  { term: "Bus", plain: "A channel that several tracks feed into so they can be controlled together." },
  { term: "Gain", plain: "Level. Gain staging means setting healthy levels at every stage so nothing clips." },
  { term: "Pan", plain: "Position between the left and right speaker." },
  { term: "EQ", plain: "Volume control per frequency. Cut mud, remove rumble, add air." },
  { term: "Compression", plain: "Turns down the loudest moments so the quiet ones feel louder and the part sits evenly." },
  { term: "Sidechain", plain: "One sound ducking another. Most often the bass dipping when the kick hits." },
  { term: "ADSR", plain: "A sound's shape: attack (start), decay (fall), sustain (hold), release (tail)." },
  { term: "LFO", plain: "A slow automatic wobble that moves a parameter such as filter or pitch." },
  { term: "Wet / dry", plain: "Wet is the effect; dry is the original. Mix controls how much of each you hear." },
  { term: "Quantise", plain: "Snap notes to the grid so they land exactly in time." },
  { term: "Headroom", plain: "Space left below the maximum level so the mix does not distort." },
  { term: "LUFS", plain: "How loud a finished master feels to streaming platforms. Lower is more dynamic." },
  { term: "True peak", plain: "The real peak after digital-to-analogue conversion. Keep it below the ceiling to avoid distortion." },
  { term: "Stem", plain: "One track or group exported as its own audio file for another engineer to mix." },
  { term: "Master", plain: "The final stereo file delivered to the world." },
  { term: "Reference", plain: "A commercial song you compare against for balance and loudness. Never copy it." },
];

export const GUIDE_SHORTCUTS: GuideShortcut[] = [
  { keys: "Space", action: "Play / pause the transport" },
  { keys: "R", action: "Start or stop recording" },
  { keys: "M", action: "Metronome on / off" },
  { keys: "Ctrl / Cmd + Z", action: "Undo the last edit" },
  { keys: "Ctrl / Cmd + Shift + Z", action: "Redo" },
  { keys: "Ctrl / Cmd + S", action: "Save the project" },
  { keys: "Ctrl / Cmd + E", action: "Export the project bundle" },
  { keys: "Ctrl / Cmd + I", action: "Open the AI Mix Assistant" },
  { keys: "Shift + F", action: "Stage FX on / off (calm mode)" },
  { keys: "Esc", action: "Close the topmost panel or overlay" },
];

/** Lesson count per track, cheap for headers without re-walking the tree. */
export function guideTrackProgress(
  track: GuideTrack,
  isComplete: (lessonId: string) => boolean,
): { done: number; total: number; percent: number } {
  const total = track.lessons.length;
  const done = track.lessons.filter((lesson) => isComplete(lesson.id)).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
