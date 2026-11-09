import type {
  ContributorRole,
  ReleaseType,
  RightsTaskDefinition,
  ToolkitGuide,
} from '../types/artist-toolkit.types';

export const RELEASE_TYPES: ReleaseType[] = [
  'Single',
  'EP',
  'Album',
  'Mixtape',
];

export const CONTRIBUTOR_ROLES: ContributorRole[] = [
  'Songwriter',
  'Producer',
  'Featured artist',
  'Composer',
  'Publisher',
];

export const RIGHTS_CATEGORIES = [
  'Copyright',
  'Publishing',
  'Recordings',
  'Release',
  'Money',
  'Live',
  'Sync',
] as const;

/**
 * A rights and money checklist for an independent artist.
 *
 * Deliberately US-first because the collecting bodies below are statutory US
 * organisations; the copy tells artists elsewhere to use their local society.
 * No task files anything on the artist's behalf — each one links to the
 * official body so the artist keeps control of their own registrations.
 */
export const RIGHTS_TASKS: RightsTaskDefinition[] = [
  {
    id: 'copyright-register',
    category: 'Copyright',
    title: 'Register the song and the recording',
    detail:
      'Copyright exists when the work is fixed, but in the US a registration is what lets you sue for infringement and claim statutory damages. Register the composition (lyrics + melody) and the sound recording separately.',
    links: [
      { label: 'U.S. Copyright Office', url: 'https://www.copyright.gov/' },
    ],
  },
  {
    id: 'copyright-evidence',
    category: 'Copyright',
    title: 'Keep the deposit and dated evidence',
    detail:
      'Save the final WAV, lyrics, project file and dated drafts in one folder. Registration asks for a deposit copy, and a clear paper trail settles most collaboration disputes before they reach a lawyer.',
  },
  {
    id: 'copyright-name',
    category: 'Copyright',
    title: 'Check the artist name before merch',
    detail:
      'A trademark is separate from copyright. Search the name and logo before printing merch or signing a distributor deal, and register the mark you actually use in commerce.',
    links: [{ label: 'USPTO trademark search', url: 'https://www.uspto.gov/' }],
  },
  {
    id: 'pro-join',
    category: 'Publishing',
    title: 'Join one performing rights organisation',
    detail:
      'A PRO collects public-performance royalties for the composition — streams, radio, TV, venues and broadcasts. Join one (BMI, ASCAP or SESAC in the US); joining more than one is not allowed for the same writer.',
    links: [
      { label: 'BMI', url: 'https://www.bmi.com/' },
      { label: 'ASCAP', url: 'https://www.ascap.com/' },
      { label: 'SESAC', url: 'https://www.sesac.com/' },
    ],
  },
  {
    id: 'pro-register-works',
    category: 'Publishing',
    title: 'Register every work',
    detail:
      'Register each song with your PRO using the final title, writer legal names, shares and publisher details. An unregistered work is invisible to the collection system no matter how many streams it gets.',
  },
  {
    id: 'mlc-join',
    category: 'Publishing',
    title: 'Join The MLC for US mechanicals',
    detail:
      'The Mechanical Licensing Collective pays self-administered songwriters, composers and publishers the US streaming and download mechanical royalties owed under the blanket licence. Membership is free.',
    links: [{ label: 'The MLC', url: 'https://www.themlc.com/' }],
  },
  {
    id: 'publishing-admin',
    category: 'Publishing',
    title: 'Decide who administers publishing',
    detail:
      'Self-administration keeps control and margin but takes admin work. A publishing administrator or publisher can collect faster, usually for a term and a percentage. Read the term, reversion clause and what happens to your catalogue if you leave.',
  },
  {
    id: 'isrc',
    category: 'Recordings',
    title: 'Get an ISRC for every recording',
    detail:
      'The ISRC is the recording’s permanent identity across DSPs, YouTube Content ID and royalty statements. Distributors usually assign one per track; keep the codes in your catalogue so a re-release never becomes a new, unmatched recording.',
    links: [{ label: 'ISRC (IFPI)', url: 'https://isrc.ifpi.org/' }],
  },
  {
    id: 'soundexchange',
    category: 'Recordings',
    title: 'Register with SoundExchange',
    detail:
      'SoundExchange collects US digital-performance royalties for the sound recording — the artist and rights-owner side that PROs do not pay. Register both as the performing artist and as the rights owner.',
    links: [
      { label: 'SoundExchange', url: 'https://www.soundexchange.com/' },
    ],
  },
  {
    id: 'neighboring-rights',
    category: 'Recordings',
    title: 'Check neighboring rights outside the US',
    detail:
      'Many countries pay a separate neighboring-rights royalty for the recording. Ask your distributor or a neighboring-rights society what they collect, and make sure you have not assigned that income away in a distribution deal.',
  },
  {
    id: 'release-distributor',
    category: 'Release',
    title: 'Choose a distributor and read the exit terms',
    detail:
      'Compare fees, payout thresholds, territory coverage, takedown process and what happens to your ISRCs and UPC if you leave. You should be able to take your catalogue and your identifiers with you.',
  },
  {
    id: 'release-metadata',
    category: 'Release',
    title: 'Lock metadata before delivery',
    detail:
      'Correct legal names, featured credits, explicit flags, songwriter splits, artwork specs and lyrics all affect matching and payment. Fixing metadata after release is slower than checking it once before delivery.',
  },
  {
    id: 'release-lead-time',
    category: 'Release',
    title: 'Deliver at least four weeks early',
    detail:
      'Editorial playlist pitching and store ingestion both need lead time. Four weeks is the common minimum; six gives you room to fix artwork or metadata rejections without moving the date.',
  },
  {
    id: 'release-splits',
    category: 'Release',
    title: 'Sign splits before the money arrives',
    detail:
      'A written split sheet signed by every contributor — including featured artists, producers and outside writers — prevents the “we’ll sort it out later” dispute that freezes royalties. Record publishing and IPI details at the same time.',
  },
  {
    id: 'money-account',
    category: 'Money',
    title: 'Keep music money separate',
    detail:
      'Use a dedicated account and card for music income and expenses. It makes tax time, distributor reconciliation and any future label or investor conversation dramatically simpler.',
  },
  {
    id: 'money-statements',
    category: 'Money',
    title: 'Reconcile statements every month',
    detail:
      'Match distributor, PRO, MLC and SoundExchange statements to the catalogue. Missing stores, unmatched ISRCs and unregistered works usually show up as a line that is simply absent.',
  },
  {
    id: 'money-tax',
    category: 'Money',
    title: 'Plan for tax and collaborator paperwork',
    detail:
      'Royalties are taxable income. Set aside a percentage as they arrive, keep receipts, and collect the tax forms your jurisdiction requires from paid collaborators. Ask a local accountant before your first profitable year.',
  },
  {
    id: 'live-contract',
    category: 'Live',
    title: 'Get the gig in writing',
    detail:
      'A booking email is not a contract. Confirm the fee, deposit, payment timing, set length, curfew, production provided, merchandise cut, cancellation terms and who covers travel.',
  },
  {
    id: 'live-licence',
    category: 'Live',
    title: 'Check who licenses the performance',
    detail:
      'Venues normally hold the public-performance licence for the compositions performed there. Confirm it for festivals, pop-ups and streamed sets, where the responsibility can shift to the performer or broadcaster.',
  },
  {
    id: 'live-budget',
    category: 'Live',
    title: 'Build a break-even budget before routing',
    detail:
      'Add fee, door split, merch, travel, lodging, crew, backline and a contingency. If the route does not break even at a realistic turnout, change the route before you announce it.',
  },
  {
    id: 'sync-one-stop',
    category: 'Sync',
    title: 'Know who controls both sides',
    detail:
      'A sync licence needs the composition (publisher/writer) and the master (recording owner). If you control both, you are one-stop and far easier to license. If not, know exactly who to call and get their clearance terms in writing.',
  },
  {
    id: 'sync-versions',
    category: 'Sync',
    title: 'Prepare sync-ready versions',
    detail:
      'Keep instrumental, clean, TV-mix and stems for every sync candidate. Music supervisors work on deadlines and will pass on a song they cannot license and deliver quickly.',
  },
  {
    id: 'sync-pitch',
    category: 'Sync',
    title: 'Build a one-sheet and cue sheet',
    detail:
      'A one-sheet names the song, writer, publisher, master owner, contacts and links in one page. A cue sheet records what was used, where and for how long, and is how broadcast royalties get paid.',
  },
];

export const TOOLKIT_GUIDES: ToolkitGuide[] = [
  {
    id: 'first-90-days',
    title: 'Your first 90 days',
    summary:
      'A calm sequence for an artist starting from zero: finish the work, fix the rights, then release into a plan instead of a hope.',
    steps: [
      'Finish and archive three songs before choosing a single. Options are leverage.',
      'Register with one PRO, join The MLC and SoundExchange, and write down your IPI and account numbers.',
      'Create a catalogue sheet: title, ISRC, ISWC, UPC, writers, splits, release date, distributor.',
      'Set a release date at least eight weeks out and work backwards from it.',
      'Spend the lead time on 20 real fans, not 20,000 passive impressions.',
    ],
  },
  {
    id: 'release-without-label',
    title: 'Release without a label',
    summary:
      'You do not need permission to release. You need clean metadata, a distributor, signed splits and a reason for anyone to care.',
    steps: [
      'Pick the strongest song, not the most recent one.',
      'Lock the master and get it mastered for streaming loudness and a separate DJ/club version if it needs one.',
      'Deliver four to six weeks early with correct credits and explicit flags.',
      'Pitch editorial playlists before delivery, then pitch curators, blogs and radio with a short personal note.',
      'Plan release-day content and a follow-up week before the song is live.',
    ],
  },
  {
    id: 'streams-to-living',
    title: 'Turn streams into a living',
    summary:
      'Streaming is one revenue line. A durable independent career stacks several small, repeatable ones.',
    steps: [
      'Treat streaming as discovery, not a salary: use it to prove demand.',
      'Sell something owned — merch, vinyl, tickets, sample packs, direct downloads — where the margin is yours.',
      'License the catalogue for sync and content creation with clear one-stop terms.',
      'Play live at a break-even-or-better budget and use every show to grow the mailing list.',
      'Review statements monthly and follow the missing money: unregistered works, unmatched ISRCs, unclaimed neighbouring rights.',
    ],
  },
  {
    id: 'team-without-ownership',
    title: 'Build a team that does not own you',
    summary:
      'Managers, producers and lawyers should make your career bigger without taking permanent control of it.',
    steps: [
      'Hire for a specific problem and a defined term, not for a feeling.',
      'Never sign an exclusive publishing or recording deal without a music lawyer who represents you.',
      'Keep a reversion clause: rights and masters should come back on a defined date or condition.',
      'Put splits and producer points in writing before the session, not after the hit.',
      'Keep your own copies of every contract, split sheet, statement and registration.',
    ],
  },
  {
    id: 'live-and-paid',
    title: 'Play live and get paid',
    summary:
      'A good show is a product. Route it, budget it, contract it and film it.',
    steps: [
      'Build a 20-minute set that works with or without a full band.',
      'Confirm fee, deposit, curfew, production and merch terms in writing.',
      'Budget the whole route, including the shows that lose money.',
      'Capture one vertical clip and one full-song live video at every stop.',
      'Turn every attendee into a mailing-list subscriber before they leave.',
    ],
  },
  {
    id: 'sync-without-giving-away',
    title: 'Sync without giving away the song',
    summary:
      'A sync can pay more than a year of streams, but only if the rights are clear and the deliverables are ready.',
    steps: [
      'Know who owns the master and the composition, and whether you are one-stop.',
      'Keep instrumentals, clean edits, stems and an alternate mix ready.',
      'Price the licence by term, territory, media and exclusivity — not by vibe.',
      'Get the deal in writing, including whether it is exclusive and for how long.',
      'Deliver a cue sheet with every placement and follow up on the performance royalties.',
    ],
  },
];
