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
  /** Optional deep-link state for the workspace route (for example a panel). */
  queryParams?: Readonly<Record<string, string>>;
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
      "3D live stage: drop-in performers, a saved library, mood and colour",
    ],
    steps: [
      "Program the groove in Drum Machine or Piano Roll.",
      "Audition sounds in the Sample Library and Sound Browser before committing them.",
      "Rehearse the launch order in Performance or DJ before you record the take.",
      "Press 3D STAGE in Performance, drop a .glb performer or pick one from LIBRARY, cue a move, then press PADS to return.",
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
      "Composition Core, AI Produce, Songwriting Studio, Practice Space and Music Academy cover the writing and skill-building side of the record — instruments and vocals, acting and directing, music business and legal, plus marketing and promotion.",
    features: [
      "Genre-locked composition and single musical steps",
      "AI Produce from brief to arrangement",
      "Songwriting Studio: Writer's Pad pages and co-write rooms",
      "Practice drills and Academy programs",
      "Academy career paths: acting, directing, music business and legal, marketing and promotion",
    ],
    steps: [
      "Start with a brief in Composition Core or AI Produce.",
      "Move the idea into the Songwriting Studio for topline and lyric work — solo pages or a co-write room.",
      "Use Practice Space and Music Academy to turn a weakness into a repeatable routine — including acting, directing, business, legal and promotion drills when the song needs a career skill.",
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
      "Tha Spot is the community arcade: discover games, join rooms and lobbies, squad up, challenge rivals, split-screen and broadcast. The pre-flight console sets quality, source, local preview and audio before GO LIVE, while streaming accounts and RTMP destinations are configured only in Settings → Streaming.",
    features: [
      "Catalogue filters, search and recommendations",
      "Rooms, lobbies, squads and rival challenges",
      "Split-screen, spectator reactions and post-run ratings",
      "S.M.U.V.E TV, Jeff Radio and Go Live viewer links",
      "Pre-flight console: quality, capture source, local preview, mic and game audio",
      "Broadcast Push for destinations configured in Settings → Streaming",
    ],
    steps: [
      "Pick a cabinet from the catalogue and read the launch options before opening it.",
      "Join or host a lobby, invite a squad, and use split-screen for local play.",
      "Use the Inbox for challenges and the TV or radio guide when you are not playing.",
      "In Tha Spot's LIVE tab, set PRE-FLIGHT: quality (SMOOTH 480p, HD 720p, FULL 1080p), source (CAMERA, SCREEN or CAM + SCREEN with its PIP button), then START PREVIEW to check framing while the readout says LOCAL ONLY — NOT ON AIR.",
      "Set AUDIO with MIC / MIC MUTED and GAME ONLY, then open STREAMING SETUP → OPEN SETTINGS to configure accounts and destinations. Prove the relay with BROADCAST PUSH CHECK and SELF-TEST. A relay with recording off warns that the show will not be kept.",
      "In Settings → Streaming, connect Twitch, Kick or Facebook, and save any RTMP URL and key there. To add a custom target, use one of the four CUSTOM rows in Settings, enter a name, the platform's RTMPS URL and stream key, then press SAVE. The key stays server-side and is never shown again.",
      "Return to Tha Spot, press GO LIVE, select a configured destination, and confirm. Remove a destination in Settings → Streaming to forget its key and reset its fields.",
    ],
    mistake:
      "Opening a game without checking its launch mode. Some cabinets are embedded, some open externally, and some are self-hosted WASM.",
    route: "/tha-spot",
    queryParams: { panel: "broadcast" },
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
      "Remix Arena, the Songwriting Studio co-write room, Challenge Inbox, Storefront and Products connect collaboration, competition and selling without leaving the workspace.",
    features: [
      "Remix Arena and live coding sessions",
      "Co-write rooms and shared lyric work",
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

/**
 * S.M.U.V.E.'s spoken chapter script.
 *
 * The bundled walkthrough video cannot be re-rendered from the browser, so the
 * guide carries its narration as data: one introduction, one line per feature
 * (highlighted as it is spoken) and a closing habit. The overlay reads it in
 * the voice spectrum, which means every chapter is teachable in real time even
 * when the video is missing, blocked or on a slow connection.
 */
export interface ChapterNarration {
  /** Opening transmission: what this chapter gives the artist. */
  intro: string;
  /** One spoken line per chapter feature, in the same order. */
  features: readonly string[];
  /** The habit this chapter is really teaching. */
  closing: string;
}

export const COMPLETE_GUIDE_NARRATION: Readonly<
  Record<string, ChapterNarration>
> = {
  shell: {
    intro:
      "S.M.U.V.E. Complete application guide. Chapter one, the shell. One interface, every room in the system, and one map that does not change shape under you.",
    features: [
      "The sidebar sorts every room into six families: Core, Strategy, Creative, Community, Utility and Artist. Choose the family first, then the room that matches the job in front of you.",
      "Control K opens the command palette from anywhere, and the Next Best Moves strip tells you what the system would do next. Use both when you already know the outcome you want, not just the name of a tool.",
      "Pin the rooms you repeat and they stay at the top. Recent workspaces sit one line below, so yesterday's session is one click away instead of a search.",
      "The top bar carries sync health, appearance, performance mode, the inbox and the assistant. Read sync health before a long session; a device that is behind does not save what you think it saved.",
    ],
    closing:
      "Do not treat each card as a separate app. Every room reads the same profile, projects, release state and case file. That is the entire point of the shell.",
  },
  hub: {
    intro:
      "Chapter two, Label Hub. This is the cockpit, not the studio: it tells you which room deserves your session before you open one.",
    features: [
      "The command center reports release and project status first, because a record that is stuck at delivery is a different problem from one that is stuck at the mix.",
      "Career, strategy and audience signals sit beside the records, so a release decision is made with the market in view instead of in isolation.",
      "Recommended next moves name the work the system believes is most valuable now, and related workspaces keep the obvious follow-up one click away.",
      "One-tap routes carry you into Studio, Career, Projects and Analytics without losing the card you were reading. Open the deep tool only after the Hub tells you which one matters.",
    ],
    closing:
      "Reading the Hub is not progress. Use it to choose one objective, then leave it and do the work in the room it names.",
  },
  studio: {
    intro:
      "Chapter three, Studio. One production shell, a dedicated surface for every stage, and a curriculum that explains them while you work.",
    features: [
      "The Beginner Wizard starts a session with you, and the Studio Masterclass teaches the whole system in the same window. Both are real surfaces, not videos pretending to be one.",
      "Quick Session, Arrangement, Session View and Channel Rack carry a record from a loop to a structure. Quick Session is the cockpit; the others are the detail.",
      "Piano Roll, Score, Mixer, Effects Rack and automation are the note, notation, balance and tone stages. Finish one stage before opening the next.",
      "DJ, Performance, Mastering and Export deliver the record. Name the export, play it back away from the session, then call it finished.",
    ],
    closing:
      "Do not mix while you are still writing. Every stage changes the one after it, and a mix built on a moving arrangement is a guess.",
  },
  rhythm: {
    intro:
      "Chapter four, rhythm, performance and decks. Program it, play it, launch it, and now put a performer on a lit stage while you do.",
    features: [
      "Drum Machine, Piano Roll and Sampler do the programming: steps, notes and slices that stay editable forever.",
      "The Performance grid launches scenes and clips without stopping the transport. Rehearse the order you will actually launch in.",
      "The dual-deck DJ booth gives you hot cues, loops and crossfades, so a transition is planned instead of hoped for.",
      "Sound Pads, the synthesizer, the tuner and Vocal Suite cover touch performance and capture. Tune before the take, not after it.",
      "The 3D live stage sits beside the pads in Performance. Drop a glb performer or pick one from the library, choose a mood and colour, and the stage moves with the master output while you keep playing.",
    ],
    closing:
      "A live set built only in Arrangement view is not a live set. Rehearse the launch order, the transitions and the stage before anyone is watching.",
  },
  create: {
    intro:
      "Chapter five, write, produce and learn. The idea comes before the session, and the craft is a discipline you can practise.",
    features: [
      "Composition Core and AI Produce turn a brief into musical steps you can edit. Genre is a constraint, not a cage: pick one and move.",
      "AI Produce lands its result in the same song document as your own notes, so generated bars are raw material, not a finished record.",
      "The Songwriting Studio holds Writer's Pad pages and co-write rooms. Write the topline and the lyric before you produce the arrangement around them.",
      "Practice drills and Academy programs turn a weakness into a routine. A program is a sequence; a drill is the repeat that makes it stick.",
      "Academy career paths cover acting, directing, music business and legal, marketing and promotion. The craft is part of the release, not a hobby beside it.",
    ],
    closing:
      "Do not produce a song you have not written. A great arrangement around an empty idea is expensive decoration.",
  },
  lab: {
    intro:
      "Chapter six, Image and Video Lab. This is the visual room: cover art, a music video, a social cut or a broadcast package, built from the same timeline logic as the record.",
    features: [
      "Film, music video, social and broadcast modes set the canvas and the delivery expectations before you ingest anything. Choose the destination first.",
      "The timeline, markers and frame-accurate nudging give you the same precision on picture that the arrangement gives you on sound.",
      "Title cards, the audio bed, FX keyframes and camera capture are the look and the sound of the cut. Picture first, then titles, then the polish.",
      "The Image Editor, the Video Editor, named projects and a playable master export close the loop. If the master does not play outside the Lab, it is not delivered.",
    ],
    closing:
      "Never export a master you have not played back from the beginning. A still frame looks finished; a cut can still be wrong.",
  },
  spot: {
    intro:
      "Chapter seven, Tha Spot. Discovery, lobbies, squads and live broadcast: the community arcade, with a pre-flight console that keeps a bad show off the air.",
    features: [
      "Catalogue filters, search and recommendations find the cabinet that fits the session. Read the launch options before you open one.",
      "Rooms, lobbies, squads and rival challenges are how players find each other. Join with a role, not just a click.",
      "Split-screen, spectator reactions and post-run ratings make the match worth watching, not only worth playing.",
      "S.M.U.V.E TV, Jeff Radio and the Go Live viewer links are the surfaces for everyone who is not holding a controller.",
      "The pre-flight console sets quality, capture source, local preview, mic and game audio. It is a rehearsal room, not a stage.",
      "Broadcast Push sends to the destinations you configured in Settings, Streaming. That Settings page is the only account and RTMP surface in the app.",
    ],
    closing:
      "Going live is the one action you cannot undo. Preview locally, prove the relay, then press the button.",
  },
  career: {
    intro:
      "Chapter eight, career, strategy and evidence. Decisions you can defend beat instincts you cannot explain.",
    features: [
      "The Career Board shows opportunities, momentum and growth priorities. Read the board before you choose a campaign.",
      "Intel Lab frames the question and reads the market; strategic audits and release signals tell you whether the timing is real.",
      "Audience and performance analytics check the signal against what actually happened after the release.",
      "The adaptive profile, Artist Coach and Case File turn each decision into evidence the next session can use.",
    ],
    closing:
      "A strategy with no recorded outcome is a mood. Write the verdict into the Case File or you will repeat the experiment.",
  },
  business: {
    intro:
      "Chapter nine, release, business and rights. This is where a finished record becomes a delivered asset with ownership that survives contact with the industry.",
    features: [
      "Project and release stage tracking keeps the delivery chain honest: a record cannot skip a stage just because the mix sounds good.",
      "Split sheets, royalty estimates and rights checklists exist to be filled before the release, not argued about after the first payment.",
      "Contracts, legal documents and business pipelines hold the paperwork in the same workspace as the record it describes.",
      "The Knowledge Base keeps the decisions you will need again, so the second release is faster than the first.",
    ],
    closing:
      "Never deliver a master with an unsigned split. Ownership is cheaper to agree before money exists.",
  },
  intelligence: {
    intro:
      "Chapter ten, the AI command layer. The assistant, the Command Center and the Neural Foundry share one profile and one case file, and they act on real workspaces.",
    features: [
      "The assistant drawer carries production, marketing and business lanes. Brief it with genre, stage, budget and a real next move.",
      "The Command Center holds strategic decrees and the upgrade queue: the decisions that change the plan, not the ones that change the colour.",
      "The Neural Foundry exposes workspace tools you can run, so an answer can become an edit instead of a paragraph.",
      "Voice Lab, Mimic, Full Control and transcript memory decide how S.M.U.V.E speaks and how far it can act. Full Control is a task setting, never a default.",
    ],
    closing:
      "Turn on Full Control for one job, read the receipt, then turn it off. An assistant with standing authority is a risk with a friendly voice.",
  },
  network: {
    intro:
      "Chapter eleven, community and commerce. Collaboration, competition and selling without leaving the workspace.",
    features: [
      "Remix Arena and live coding sessions are for building in public with other artists. Read the ownership terms before you open a session.",
      "Co-write rooms and shared lyric work keep attribution visible while the song is being written, which is exactly when it is easy to lose.",
      "The Challenge Inbox, notifications and callouts are time-boxed. Answer them while they are live or let them expire deliberately.",
      "The Storefront, products, Networking and public artist pages are the commercial face of the profile. Check them as a fan sees them, not as the owner.",
    ],
    closing:
      "Sharing a project link is not publishing it. Collaboration is not distribution, and a private draft is not a store listing.",
  },
  system: {
    intro:
      "Chapter twelve, profile, cloud, timeline and settings. Identity, history, backups and security for the whole application.",
    features: [
      "Profile, Journey and the adaptive identity are what every other room reads. Commit the profile once instead of re-describing yourself in each tool.",
      "Cloud Vault and Session Timeline hold history and backups. A backup you have never restored is a hope, not a backup.",
      "Sync Center, auto-save and PWA install keep the browser and the installed app in agreement. Check the result of a save, not the intention.",
      "Theme, HUD, performance mode, two-factor authentication and recovery codes are the machine's ergonomics and its lock. Test the recovery path before you need it.",
    ],
    closing:
      "Browser storage is not a backup. Save the project and export the master; clearing local data does not restore unsaved work.",
  },
  workflow: {
    intro:
      "Chapter thirteen, one record end to end. This is the chain every release follows, and the handoffs are where records are lost.",
    features: [
      "Profile and a named project come first. An untitled session is a sketch that will not survive the week.",
      "Composition, Studio and visual production turn the idea into a record and a picture of it.",
      "The release pipeline, splits and launch assets prepare the delivery while the record is still open, so nothing is invented on release day.",
      "Analytics, the Case File verdict and the next move close the loop. Measure what shipped, write the verdict, then choose the next objective.",
    ],
    closing:
      "A great mix with no release plan is a file. A release with no record is a guess. Follow the chain and finish in order.",
  },
};

/** The spoken script for a chapter, when one has been written. */
export function chapterNarration(
  lessonId: string,
): ChapterNarration | null {
  return COMPLETE_GUIDE_NARRATION[lessonId] ?? null;
}
