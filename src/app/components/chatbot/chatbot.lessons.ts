/**
 * Guided lessons for S.M.U.V.E 2.0, the AI Music Manager.
 *
 * Each lesson points at a control that exists in the assistant drawer. The
 * tutorial is a chaptered walkthrough of the same drawer, not a separate demo
 * screen, and `tutorialAt` is the chapter start in the shipped MP4.
 */
export type ChatLessonTarget =
  | 'launch'
  | 'context'
  | 'commands'
  | 'produce'
  | 'marketing'
  | 'business'
  | 'voice'
  | 'control'
  | 'memory';

export interface ChatLesson {
  id: string;
  number: string;
  title: string;
  kicker: string;
  summary: string;
  goal: string;
  steps: readonly string[];
  mistake: string;
  actionLabel: string;
  target: ChatLessonTarget;
  /** Chapter start in seconds inside the tutorial video. */
  tutorialAt: number;
}

export const CHAT_TUTORIAL_SRC =
  'assets/learn/chat-music-manager-tutorial.mp4';
export const CHAT_PROGRESS_KEY = 'smuve.chat.field-guide.progress.v1';

export const CHAT_LESSONS: readonly ChatLesson[] = [
  {
    id: 'launch',
    number: '01',
    title: 'Open the manager',
    kicker: 'Launch',
    summary:
      'S.M.U.V.E. lives over every workspace as a drawer, so the record and the conversation stay in the same session.',
    goal: 'Open the assistant from the shell and leave without losing the room.',
    steps: [
      'Press the neurology button in the top bar, or the assistant launcher on the Hub.',
      'Read the header: active persona, connection state and the lanes it can operate.',
      'Close with the X or Escape. The transcript stays filed for your account; the workspace stays where it was.',
    ],
    mistake:
      'Opening a new chat for every question and losing the thread. Keep one focused case file per record, then start clean when the case changes.',
    actionLabel: 'Show the assistant header',
    target: 'launch',
    tutorialAt: 0,
  },
  {
    id: 'context',
    number: '02',
    title: 'Brief it with your reality',
    kicker: 'Context',
    summary:
      'The manager reads the room, the career stage and the committed profile before it gives a verdict.',
    goal: 'Make the answer specific to your genre, stage and current next move.',
    steps: [
      'Read the ROOM strip: surface, stage and the next move already on record.',
      'Use a Career Cue when you want a question built from that reading.',
      'Finish the profile before asking for a release or production plan. Partial evidence is labelled partial, not invented.',
    ],
    mistake:
      'Asking "what should I do next" with no genre, stage, budget or release date. The manager can still answer, but it can only give you a foundational answer.',
    actionLabel: 'Show the room read',
    target: 'context',
    tutorialAt: 30.88,
  },
  {
    id: 'commands',
    number: '03',
    title: 'Command the four lanes',
    kicker: 'Commands',
    summary:
      'Production, Marketing, Business and the slash-command system are different desks in the same conversation.',
    goal: 'Reach the right command lane without memorising the whole roster.',
    steps: [
      'Open Production for mix, mastering and session-musician commands.',
      'Open Marketing for release strategy, hooks and promotion; open Business for splits, royalties and contracts.',
      'Type a slash command such as /promo or /splits, or dictate it. The composer is the fastest path to any lane.',
    ],
    mistake:
      'Treating the quick chips as the whole product. They are shortcuts; edit the prompt with your actual deadline, audience and budget before sending.',
    actionLabel: 'Show the command lanes',
    target: 'commands',
    tutorialAt: 61.42,
  },
  {
    id: 'produce',
    number: '04',
    title: 'Produce inside the chat',
    kicker: 'Production',
    summary:
      'Ask for a beat, a composition or a mix in plain language, then carry the result into the studio with one tap.',
    goal: 'Turn one specific production request into a usable session move.',
    steps: [
      'State tempo, key, reference world, arrangement and the job the record has to do.',
      'Send the request and read the reply before accepting an apply action.',
      'Use the one-tap action to open the studio, load the pass or audition the result. Mutating actions require Full Control.',
    ],
    mistake:
      'A vague prompt like "make it sound good". Direction is a decision: tempo, key, texture, space and what the listener should feel.',
    actionLabel: 'Show the production lane',
    target: 'produce',
    tutorialAt: 91.79,
  },
  {
    id: 'marketing',
    number: '05',
    title: 'Turn a release into a plan',
    kicker: 'Marketing',
    summary:
      'The marketing lane builds a runway, hooks and promotion schedule around the release you actually have.',
    goal: 'Leave with a dated sequence, not a mood board.',
    steps: [
      'Give the release date, audience, budget and the channels you can really operate.',
      'Ask for the six-week runway, three hook directions and the assets each post needs.',
      'Make the plan name what ships this week, what waits for playlist feedback and what gets cut if the budget moves.',
    ],
    mistake:
      'Accepting a plan that says "post consistently" without dates, owners or a measurable check. That is decoration, not promotion.',
    actionLabel: 'Show the marketing lane',
    target: 'marketing',
    tutorialAt: 127.27,
  },
  {
    id: 'business',
    number: '06',
    title: 'Protect the work and the money',
    kicker: 'Business',
    summary:
      'Splits, royalties, registration, sync and negotiation live in the business lane, with legal information kept separate from legal advice.',
    goal: 'Put ownership and revenue terms in writing before delivery.',
    steps: [
      'Ask for a split sheet with names, percentages, master ownership and the delivery date.',
      'Audit the revenue streams: distribution, publishing, neighbouring rights and sync.',
      'Ask it to prepare a contract position, then check every claim against the actual agreement and a qualified attorney.',
    ],
    mistake:
      'Treating a confident answer as legal advice. The manager gives information and strategy; it is not your attorney and cannot sign away your rights.',
    actionLabel: 'Show the business lane',
    target: 'business',
    tutorialAt: 154.96,
  },
  {
    id: 'voice',
    number: '07',
    title: 'Hear the manager',
    kicker: 'Voice',
    summary:
      'Voice Lab exposes the tone roster, the full spectrum and a pin for the next reply. The device capability is stated honestly.',
    goal: 'Know how to audition, pin and dictate without fighting a silent browser.',
    steps: [
      'Open Voice Lab from the waveform button and audition a tone, or run the full spectrum.',
      'Pin a tone for the next reply. The register holds while the pitch bands keep moving inside it.',
      'Use the microphone to dictate and the stop control to cut a spoken reply. If the device has no voices, the lab says so instead of faking audio.',
    ],
    mistake:
      'Assuming a silent audition means the feature is broken. Check the capability notice: a browser with no installed speech voices cannot produce the morph.',
    actionLabel: 'Open Voice Lab',
    target: 'voice',
    tutorialAt: 186.7,
  },
  {
    id: 'control',
    number: '08',
    title: 'Give the manager hands',
    kicker: 'Control',
    summary:
      'Full Control lets S.M.U.V.E. execute app actions. Mimic, explicit language and Neural Vault access set the boundaries it works inside.',
    goal: 'Enable real session control without handing over a blank cheque.',
    steps: [
      'Turn on Full Control before accepting an action that changes the session.',
      'Set Mimic Mode for your register, the mood control for explicit language and the lock for Neural Vault writes.',
      'Approve guarded actions deliberately. Navigation and advice can run without control; mutating commands cannot.',
    ],
    mistake:
      'Leaving Full Control on by default and clicking every apply chip. Turn it on for the task, read the receipt and turn it off when the session is done.',
    actionLabel: 'Show Full Control',
    target: 'control',
    tutorialAt: 219.68,
  },
  {
    id: 'memory',
    number: '09',
    title: 'Keep the case file clean',
    kicker: 'Memory',
    summary:
      'The transcript is a working case file with a message counter and a clear action. It is memory, not a backup of your project.',
    goal: 'Use continuity without letting an old thread contaminate the next decision.',
    steps: [
      'Read the memory counter before trusting continuity; it counts the messages in this transcript.',
      'Use Clear when the case changes, then brief the new record in a fresh thread.',
      'Keep this conversation focused. Projects, releases and profile data live in their own stores, not in the chat transcript.',
    ],
    mistake:
      'Treating chat history as a project backup. Clearing the thread or browser storage does not recover an unsaved record; save and export the work itself.',
    actionLabel: 'Show the memory controls',
    target: 'memory',
    tutorialAt: 251.86,
  },
];
