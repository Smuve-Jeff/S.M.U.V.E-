/**
 * The complete S.M.U.V.E 2.0 application guide.
 *
 * This is the map of the shipped workspaces, not a feature wish list. Each
 * chapter points at a real route, and `tutorialAt` is the chapter start in the
 * bundled MP4. The companion build script creates the video from the same
 * chapter order.
 */
export interface CompleteGuideLesson {
  id: string;
  number: string;
  title: string;
  kicker: string;
  summary: string;
  features: readonly string[];
  steps: readonly string[];
  mistake: string;
  route: string;
  workspaceLabel: string;
  /** Chapter start in seconds inside the tutorial video. */
  tutorialAt: number;
}

export const COMPLETE_GUIDE_SRC = "assets/learn/complete-app-guide.mp4";
export const COMPLETE_GUIDE_PROGRESS_KEY =
  "smuve.complete-app-guide.progress.v1";
export const COMPLETE_GUIDE_RESUME_KEY =
  "smuve.complete-app-guide.resume.v1";

export const COMPLETE_GUIDE_LESSONS: readonly CompleteGuideLesson[] = [
  {
    id: "shell",
    number: "01",
    title: "Start with the shell",
    kicker: "Orientation",
    summary:
      "The shell is the map of the whole system: workspace families, the command palette, pinned and recent rooms, sync health and the global assistant.",
    features: [
      "Sidebar families: Core, Strategy, Creative, Community, Utility, Artist",
      "Ctrl + K command palette and the Next Best Moves strip",
      "Pinned and recent workspaces for the rooms you repeat",
      "Sync Health, appearance, performance mode and the assistant launcher",
    ],
    steps: [
      "Choose a workspace family in the sidebar, then open the room that matches the job.",
      "Pin the rooms you use every session; recent rooms stay one click below them.",
      "Press Ctrl + K (Cmd + K on Mac) when you know the name, and read Sync Health before you leave.",
    ],
    mistake:
      "Treating each card as a separate app. Every workspace reads the same profile, projects, release state and case file.",
    route: "/hub",
    workspaceLabel: "Label Hub",
    tutorialAt: 0,
  },
  {
    id: "hub",
    number: "02",
    title: "Run the day from Label Hub",
    kicker: "Command",
    summary:
      "Label Hub is the executive cockpit. It puts releases, projects, career signals, assets and the next useful move in one feed.",
    features: [
      "Release and project status in the command center",
      "Career, strategy and audience signals",
      "Recommended next moves and related workspaces",
      "One-tap routes into Studio, Career, Projects and Analytics",
    ],
    steps: [
      "Read the command center before opening a deep tool.",
      "Use the next-move rail to decide which room deserves the session.",
      "Open Projects or Release Pipeline when a card needs an actual decision, not another glance.",
    ],
    mistake:
      "Starting in a deep tool without a current objective. The Hub exists to tell you which room is worth opening today.",
    route: "/hub",
    workspaceLabel: "Label Hub",
    tutorialAt: 36.43,
  },
  {
    id: "studio",
    number: "03",
    title: "Studio: idea to master",
    kicker: "Production",
    summary:
      "Studio is one shell with a dedicated surface for every production stage: quick session, arrangement, channel rack, piano roll, mixer, effects, mastering and export.",
    features: [
      "Beginner Wizard and the full Studio Masterclass",
      "Quick Session, arrangement, session view and channel rack",
      "Piano roll, score, mixer, effects rack and automation",
      "DJ, performance, mastering and named export",
    ],
    steps: [
      "Start a Quick Session or open the Masterclass when you want a guided loop.",
      "Build the arrangement, then balance it in the Mixer and Effects Rack.",
      "Finish in Mastering and export a named master you can play back.",
    ],
    mistake:
      "Mixing before the arrangement is decided. Lock the song first, then balance it; a polished unfinished arrangement is still unfinished.",
    route: "/studio",
    workspaceLabel: "Studio",
    tutorialAt: 63.96,
  },
  {
    id: "rhythm",
    number: "04",
    title: "Rhythm, performance and decks",
    kicker: "Performance",
    summary:
      "The rhythm surfaces cover programming, live launching and DJ transitions, with samplers, pads, synthesizers, tuners and vocal tools alongside them.",
    features: [
      "Drum Machine, Piano Roll and Sampler",
      "Performance grid, scene launch and clip triggering",
      "Dual-deck DJ with hot cues, looping and crossfades",
      "Sound Pads, synthesizer, tuner and Vocal Suite",
    ],
    steps: [
      "Program the groove in Drum Machine or Piano Roll.",
      "Audition sounds in the Sample Library and Sound Browser before committing them.",
      "Rehearse the launch order in Performance or DJ before you record the take.",
    ],
    mistake:
      "Building a live set only in Arrangement view. Rehearse the actual clip launch order and the transitions, not just the timeline.",
    route: "/performance",
    workspaceLabel: "Performance",
    tutorialAt: 94.9,
  },
  {
    id: "create",
    number: "05",
    title: "Write, produce and learn",
    kicker: "Creation",
    summary:
      "Composition Core, AI Produce, Cowrite Studio, Lyric Editor, Practice Space and Music Academy cover the writing and skill-building side of the record.",
    features: [
      "Genre-locked composition and single musical steps",
      "AI Produce from brief to arrangement",
      "Cowrite rooms and lyric editing",
      "Practice drills and Academy programs",
    ],
    steps: [
      "Start with a brief in Composition Core or AI Produce.",
      "Move the idea into Cowrite Studio or Lyric Editor for topline and lyric work.",
      "Use Practice Space and Music Academy to turn a weakness into a repeatable routine.",
    ],
    mistake:
      "Asking AI for a finished record with no genre, reference or constraint. Direction is part of the composition, not a setting you can skip.",
    route: "/composer",
    workspaceLabel: "Composition Core",
    tutorialAt: 126.25,
  },
  {
    id: "lab",
    number: "06",
    title: "Image & Video Lab",
    kicker: "Visuals",
    summary:
      "The Lab carries a release from cover art to a finished cut: production modes, media ingest, timeline, titles, audio, FX, camera capture, projects and export.",
    features: [
      "Film, music video, social and broadcast modes",
      "Timeline, markers and frame-accurate nudging",
      "Title cards, audio bed, FX keyframes and camera capture",
      "Image Editor, Video Editor, named projects and a playable master export",
    ],
    steps: [
      "Choose the destination and delivery preset before ingesting a single clip.",
      "Cut picture first, then add titles, the audio bed and the look.",
      "Save the project and export a master you have played back.",
    ],
    mistake:
      "Cutting a vertical social piece in a 16:9 canvas and fixing it at export. Set the production mode first; the monitor and presets reflow around it.",
    route: "/image-video-lab",
    workspaceLabel: "Image & Video Lab",
    tutorialAt: 161.55,
  },
  {
    id: "spot",
    number: "07",
    title: "Tha Spot: play, compete, broadcast",
    kicker: "Community",
    summary:
      "Tha Spot is the community arcade: discover games, filter the catalogue, join rooms and lobbies, squad up, challenge rivals, split-screen and go live.",
    features: [
      "Catalogue filters, search and recommendations",
      "Rooms, lobbies, squads and rival challenges",
      "Split-screen, spectator reactions and post-run ratings",
      "S.M.U.V.E TV, Jeff Radio and Go Live viewer links",
    ],
    steps: [
      "Pick a cabinet from the catalogue and read the launch options before opening it.",
      "Join or host a lobby, invite a squad, and use split-screen for local play.",
      "Use the Inbox for challenges and the TV or radio guide when you are not playing.",
    ],
    mistake:
      "Opening a game without checking its launch mode. Some cabinets are embedded, some open externally, and some are self-hosted WASM.",
    route: "/tha-spot",
    workspaceLabel: "Tha Spot",
    tutorialAt: 194.51,
  },
  {
    id: "career",
    number: "08",
    title: "Career, strategy and evidence",
    kicker: "Strategy",
    summary:
      "Career Board, Intel Lab, Analytics, Artist Development, Adaptive Profile, Artist Coach and Case File turn profile evidence into decisions you can defend.",
    features: [
      "Career opportunities, momentum and growth priorities",
      "Market intel, strategic audits and release signals",
      "Audience and performance analytics",
      "Adaptive profile, coaching and the Case File record",
    ],
    steps: [
      "Complete the profile before trusting a strategic read.",
      "Use Intel Lab to frame the question and Analytics to check the signal.",
      "Record the decision in the Case File so the next session starts with evidence.",
    ],
    mistake:
      "Treating a projection as a receipt. Separate measured data from a recommendation, and name which one you are acting on.",
    route: "/career",
    workspaceLabel: "Career Board",
    tutorialAt: 226.05,
  },
  {
    id: "business",
    number: "09",
    title: "Release, business and rights",
    kicker: "Business",
    summary:
      "Projects, Release Pipeline, Business Suite, Artist Toolkit and Knowledge Base carry the record through delivery, splits, royalties and rights.",
    features: [
      "Project and release stage tracking",
      "Split sheets, royalty estimates and rights checklists",
      "Contracts, legal documents and business pipelines",
      "Knowledge Base for the decisions you will need again",
    ],
    steps: [
      "Create the project and set the release date before the asset work begins.",
      "Move it through the pipeline and attach everything each stage needs.",
      "Agree splits and check the rights checklist before the master leaves the room.",
    ],
    mistake:
      "Waiting until release week to document ownership. Put the terms in writing before delivery, when everyone still has leverage.",
    route: "/release-pipeline",
    workspaceLabel: "Release Pipeline",
    tutorialAt: 259.91,
  },
  {
    id: "intelligence",
    number: "10",
    title: "The AI command layer",
    kicker: "Intelligence",
    summary:
      "The assistant, Command Center and Neural Foundry share the profile, case file and workspace actions. Voice Lab and Full Control decide how it speaks and acts.",
    features: [
      "Assistant drawer with production, marketing and business lanes",
      "Command Center, strategic decrees and the upgrade queue",
      "Neural Foundry and its workspace tools",
      "Voice Lab, Mimic, Full Control and transcript memory",
    ],
    steps: [
      "Open the assistant from the neurology button or the Hub launcher.",
      "Brief it with genre, stage, budget and a real next move.",
      "Turn on Full Control only for the task, read the receipt, then turn it off.",
    ],
    mistake:
      "Leaving Full Control on and accepting every apply chip. Authority should be temporary, specific and deliberate.",
    route: "/command-center",
    workspaceLabel: "Command Center",
    tutorialAt: 291.86,
  },
  {
    id: "network",
    number: "11",
    title: "Community and commerce",
    kicker: "Network",
    summary:
      "Remix Arena, Cowrite Studio, Challenge Inbox, Storefront and Products connect collaboration, competition and selling without leaving the workspace.",
    features: [
      "Remix Arena and live coding sessions",
      "Cowrite rooms and shared lyric work",
      "Challenge Inbox, notifications and callouts",
      "Storefront, products, Networking and public artist pages",
    ],
    steps: [
      "Use the Inbox to answer challenges and invitations before they expire.",
      "Collaborate in Remix Arena or Cowrite with a clear role and ownership.",
      "Publish products and check the artist page exactly as a fan sees it.",
    ],
    mistake:
      "Sharing a project link without checking permissions. Collaboration is not publication, and a private draft is not a store listing.",
    route: "/remix-arena",
    workspaceLabel: "Remix Arena",
    tutorialAt: 328.08,
  },
  {
    id: "system",
    number: "12",
    title: "Profile, cloud, timeline and settings",
    kicker: "System",
    summary:
      "Profile, Journey, Cloud Vault, Session Timeline and Settings hold identity, history, backups, performance and security for the whole application.",
    features: [
      "Profile, Journey and adaptive identity",
      "Cloud Vault and Session Timeline",
      "Sync Center, auto-save and PWA install",
      "Theme, HUD, performance mode, 2FA and recovery codes",
    ],
    steps: [
      "Commit the profile so every workspace reads the same identity.",
      "Save or export before a risky change, then check Sync Center for the result.",
      "Tune performance and security in Settings, and test the recovery path.",
    ],
    mistake:
      "Treating browser storage as a backup. Save the project and export the master; clearing local storage does not restore unsaved work.",
    route: "/settings",
    workspaceLabel: "Settings",
    tutorialAt: 357.38,
  },
  {
    id: "workflow",
    number: "13",
    title: "One record, end to end",
    kicker: "Workflow",
    summary:
      "A complete release moves through one chain: profile, idea, production, visual, release, promotion and analysis, with the assistant and Case File carrying context.",
    features: [
      "Profile and named project setup",
      "Composition, Studio and visual production",
      "Release pipeline, splits and launch assets",
      "Analytics, Case File verdict and the next move",
    ],
    steps: [
      "Start with the profile and a named project, not an untitled session.",
      "Produce the record, then the visual, then the release assets.",
      "Launch, measure, record the verdict and choose the next move.",
    ],
    mistake:
      "Skipping the handoffs. A great mix with no release plan is a file, not a release, and a release with no record is a guess.",
    route: "/projects",
    workspaceLabel: "Projects",
    tutorialAt: 390.43,
  },
];
