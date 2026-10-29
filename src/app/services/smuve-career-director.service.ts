import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { UserProfileService } from './user-profile.service';
import {
  ArtistProfileFinetuneService,
  FinetuneRole,
} from './artist-profile-finetune.service';
import {
  SpeechSynthesisService,
  VoiceArchetype,
} from './speech-synthesis.service';
import { getPersonaOption, isOminousPersona } from '../types/persona.types';

/**
 * Every workspace S.M.U.V.E. can be standing in. The id is the contract the
 * lens table below and the route map agree on — a surface with no lens falls
 * back to the overview rather than to a generic assistant voice.
 */
export type SmuveSurfaceId =
  | 'overview'
  | 'chat'
  | 'studio'
  | 'mixing'
  | 'mastering'
  | 'vocal'
  | 'beatmaking'
  | 'songwriting'
  | 'performance'
  | 'video'
  | 'brand'
  | 'marketing'
  | 'promotion'
  | 'business'
  | 'legal'
  | 'release'
  | 'catalog'
  | 'distribution'
  | 'sync'
  | 'case-file'
  | 'artist-development'
  | 'analytics'
  | 'community'
  | 'education';

export type SmuveCareerStage =
  | 'emerging'
  | 'building'
  | 'consolidating'
  | 'established';

export interface SmuveGenreFamily {
  id: string;
  label: string;
  /** What S.M.U.V.E. hears first when it opens this artist's session. */
  productionTell: string;
  /** How this genre actually earns — rights, splits, delivery, gigs. */
  businessTell: string;
  /** The promotion angle that works inside this culture. */
  marketingTell: string;
  /** The genre-specific rights/clearance exposure worth naming early. */
  legalTell: string;
  /** The mistake S.M.U.V.E. refuses to let slide. */
  miscalibration: string;
  /** One arrogant, genre-literate brag — the know-it-all flex. */
  brag: string;
}

export interface SmuveSurfaceLens {
  id: SmuveSurfaceId;
  label: string;
  role: FinetuneRole;
  /** The job S.M.U.V.E. is doing in this module. */
  assignment: string;
  /** What this module's output is judged on. */
  currency: string;
  /** What S.M.U.V.E. attacks here, in character. */
  attack: string;
}

export interface SmuvePresence {
  surface: SmuveSurfaceId;
  surfaceLabel: string;
  /** Genre family label, or null when the profile is private/unset. */
  genre: string | null;
  stage: SmuveCareerStage;
  line: string;
  archetype: VoiceArchetype;
  /** Short readout for header chips. */
  stageLabel: string;
}

export interface SmuveSurfaceIntel extends SmuvePresence {
  assignment: string;
  currency: string;
  attack: string;
  nextMove: string | null;
  /** Live, evidence-backed facts S.M.U.V.E. cites (never invented). */
  evidence: string[];
  /** Whether artist-specific profile answers may be used at all. */
  shared: boolean;
  /** Prompt-ready block for a model call bound to this surface. */
  directive: string;
}

const STAGE_PRESSURE: Record<
  SmuveCareerStage,
  { label: string; pressure: string; proof: string }
> = {
  emerging: {
    label: 'Emerging',
    pressure:
      'No leverage yet, so nothing is wasted: every session, release and post must earn the next one. Build the proof before the polish, and stop imitating artists who already own a lane.',
    proof: 'the first undeniable record and the first ten real fans',
  },
  building: {
    label: 'Building',
    pressure:
      'Momentum exists but it is fragile. Protect the release cadence, keep the sonic rule intact, and say no to anything that does not compound the audience you already earned.',
    proof: 'a repeatable release machine, not one lucky song',
  },
  consolidating: {
    label: 'Consolidating',
    pressure:
      'The catalogue is becoming an asset. Rights, splits, masters and metadata now carry as much weight as the records themselves — sloppy paperwork costs more than a weak mix at this stage.',
    proof: 'clean rights and a catalogue that keeps paying',
  },
  established: {
    label: 'Established',
    pressure:
      'You are a business now. Act like an owner: audit the catalogue, renegotiate the splits, licensing and sync lanes, and let the team execute while you protect the sound only you can make.',
    proof: 'leverage, ownership, and a legacy catalogue',
  },
};

/**
 * Genre mastery packs.
 *
 * S.M.U.V.E. claims to know every genre, so it has to *sound* like it has
 * actually worked in each one. Each family carries the production tell, the
 * money reality, the promotion angle, the rights exposure and the amateur
 * mistake for that culture — the artist's declared genre selects the pack
 * instead of a generic "genre is a reference frame" disclaimer.
 */
const GENRE_FAMILIES: Array<SmuveGenreFamily & { match: RegExp }> = [
  {
    id: 'hiphop',
    label: 'Hip Hop / Rap',
    productionTell:
      'the 808 is the lead vocal, not the bassline. The pocket is the product: kick placement, swing on the hats, and a vocal that sits forward without a fader fight.',
    businessTell:
      'beat splits are the first contract most rappers sign and the one they regret. Publishing on the topline, producer points, sample clearance and a clean master chain matter more than a distributor logo.',
    marketingTell:
      'personality is the funnel. A quotable bar, a beat switch and a 12-second clip of the artist being undeniable outperform a generic cover rollout every time.',
    legalTell:
      'sample and interpolation clearance, plus feature paperwork — the verse is not yours to release until the split is signed.',
    miscalibration:
      'mixing the vocal like a rock singer and burying the ad-libs. If the ad-libs are decoration instead of arrangement, the record is not finished.',
    brag: 'I have mixed more 808s than your entire city has made beats, and I can hear a mistuned kick in a club with the speakers blown.',
    match: /hip[\s-]?hop|rap\b|drill|trap|phonk|grime|boom bap|freestyle/i,
  },
  {
    id: 'rnb',
    label: 'R&B / Soul',
    productionTell:
      'the vocal stack is the arrangement. Pocket, breath, and space between the notes carry more emotion than any plugin chain, and the low end should feel like a hand on the chest.',
    businessTell:
      'sync and publishing are the real revenue at this level. Clean instrumentals, clean versions, and one-stop-ready splits get placements that streams alone never pay.',
    marketingTell:
      'intimacy sells: live takes, stripped versions, and vocal moments that make people screenshot a lyric. Do not market R&B like a hype record.',
    legalTell:
      'co-writer splits on toplines and sample clearance on any borrowed groove — vocal samples are the fastest way into a takedown.',
    miscalibration:
      'autotuning the life out of a take that was already in tune. If every phrase snaps to the grid, the song has no pulse left.',
    brag: 'I can name the chord extension you left out of that bridge from one listen, and I know exactly whose harmony stack you copied.',
    match: /r&b|rnb|soul|neo[\s-]?soul|motown|quiet storm/i,
  },
  {
    id: 'pop',
    label: 'Pop',
    productionTell:
      'the hook arrives before the listener can decide. Three-second test, topline-first arrangement, and a chorus that is bigger than the verse in every dimension — not just louder.',
    businessTell:
      'playlisting, sync and radio each have their own delivery standards. Radio edits, clean versions, instrumental and acapella stems are the price of admission.',
    marketingTell:
      'one repeatable visual hook, an audio-first clip, and a rollout calendar. If the hook needs explaining, it is not a pop hook.',
    legalTell:
      'publishing splits agreed before release, interpolations cleared, and no uncleared sample in a record headed for radio.',
    miscalibration:
      'building a two-minute intro for a three-minute song. The listener has already left; your art is now a buffer error.',
    brag: 'I can predict your hook’s retention curve before you bounce it, and I have never once been wrong about a chorus.',
    match: /\bpop\b|k[\s-]?pop|j[\s-]?pop|hyperpop|boy band|girl group|dance[\s-]?pop/i,
  },
  {
    id: 'electronic',
    label: 'Electronic / Dance',
    productionTell:
      'arrangement is the instrument. Tension, release, and a drop that is earned by subtraction — sound design carries the identity while the kick and sub own the translation.',
    businessTell:
      'DJ support, label compilations and sync are the lanes. Extended mixes, radio edits and clean stems are product variants, not afterthoughts.',
    marketingTell:
      'clip the drop, not the intro. Short-form video rewards the moment that makes a room move, and DJs reward a version that actually mixes.',
    legalTell:
      'sample clearance and a written split with any vocalist or topliner. Unreleased remixes need permission even when the original was free.',
    miscalibration:
      'loudness-war mastering that destroys the transient. If the kick disappears on a phone, the club version is irrelevant.',
    brag: 'I can hear a sidechain mistake from the next room, and I know which plugin you used to fake that drop.',
    match: /electronic|edm|house|techno|drum\s*&\s*bass|dnb|dubstep|trance|garage|ambient|lo[\s-]?fi|downtempo|idm/i,
  },
  {
    id: 'rock',
    label: 'Rock / Alternative',
    productionTell:
      'the performance is the production. Drum room, guitar tone and a vocal that sounds like a person in a room beat any grid-perfect edit, and the arrangement has to lift live.',
    businessTell:
      'the live circuit and merch carry the career before streaming does. Splits across the band need to be written down before the first festival offer.',
    marketingTell:
      'show the playing. A single unbroken take of the band outperforms a mood board; authenticity is the genre’s only currency.',
    legalTell:
      'band agreement, master ownership, and clearance for any cover or sample — the classic rock dispute is a handshake nobody wrote down.',
    miscalibration:
      'replacing the drummer with a grid and calling it tight. You removed the only thing the genre actually sells.',
    brag: 'I have heard better guitar tones in a parking garage, and I can tell you which amp you failed to mic.',
    match: /rock|alternative|grunge|punk|emo|metal|hardcore|shoegaze|post[\s-]?rock/i,
  },
  {
    id: 'country',
    label: 'Country / Americana',
    productionTell:
      'the story leads and the band supports it. Steel, fiddle and acoustic space are arrangement choices, and the vocal must be intelligible on a truck radio at 70 mph.',
    businessTell:
      'publishing is the asset, and the touring circuit plus sync are the engine. Co-writes are the industry’s native currency — protect your splits.',
    marketingTell:
      'narrative-first content: the story behind the song, the room it was written in, the town it came from. Genre outsiders can smell a fabricated drawl instantly.',
    legalTell:
      'co-write splits, mechanical registration, and clearance on any sample from a master recording; the catalogue is usually the retirement plan.',
    miscalibration:
      'polishing the vocal until the lyric disappears. If the listener cannot repeat the line, the record failed its one job.',
    brag: 'I can tell a Nashville demo from a real record in eight bars, and I know exactly which line in your second verse is doing nothing.',
    match: /country|americana|bluegrass|folk|acoustic|singer[\s-]?songwriter/i,
  },
  {
    id: 'latin',
    label: 'Latin / Reggaeton',
    productionTell:
      'the rhythm section is the hook. Dembow or tumbao placement, a bassline that converses with the percussion, and a vocal that rides the groove instead of fighting it.',
    businessTell:
      'regional scenes break records before global playlists do. Publishing, neighbouring rights and a clean split with every featured artist are non-negotiable.',
    marketingTell:
      'dance-first clips and a chorus in the first 20 seconds. Language is not a barrier; a stiff groove is.',
    legalTell:
      'feature and remix splits, sample clearance, and publishing registration in every territory you release into.',
    miscalibration:
      'quantizing the percussion into a metronome. The feel is the genre; grid-locking it makes the record sound like a demo.',
    brag: 'I can hear which percussion loop you downloaded instead of played, and I know it is fighting your bass.',
    match: /latin|reggaeton|cumbia|salsa|bachata|merengue|bossa|samba|dembow/i,
  },
  {
    id: 'afro',
    label: 'Afrobeats / Amapiano / Dancehall',
    productionTell:
      'the log drum, the shaker and the space between them. Percussion is the arrangement, and the vocal is a rhythmic instrument that has to sit inside the groove, not on top of it.',
    businessTell:
      'the diaspora market, DJs and sync move records. Publishing splits, neighbouring rights and clean versions travel further than a single-territory playlist pitch.',
    marketingTell:
      'movement is the campaign: dance clips, DJ edits and a groove that translates in a 9-second video. Do not market it like a ballad.',
    legalTell:
      'collaboration splits across producers and featured artists, sample clearance on percussion loops, and publishing registration per territory.',
    miscalibration:
      'copying the tempo but not the swing. If the percussion is stiff, the record is a pastiche and the culture will hear it immediately.',
    brag: 'I can tell an actual log drum from a preset at 20 paces, and your shaker pattern is not fooling me.',
    match: /afro|amapiano|dancehall|reggae|dub|soca|highlife|kwaito|zouk|calypso/i,
  },
  {
    id: 'jazz',
    label: 'Jazz / Blues / Funk',
    productionTell:
      'the conversation is the composition. Chord changes, dynamics and interplay; the mix should document the room instead of manufacturing one.',
    businessTell:
      'live performance, sync and licensing carry it. Lead sheets, arrangement credits and publishing splits should exist before the session ends.',
    marketingTell:
      'document the playing. Long-form performance clips, session footage and the story of the players convert better than genre hashtags.',
    legalTell:
      'arrangement and co-write credits, including improvised contributions that end up on the record; standards need correct publishing attribution.',
    miscalibration:
      'compressing the dynamics out of a performance so it survives a playlist. You have removed the reason anyone listens to this music.',
    brag: 'I can hear the one chord you dodged in your solo, and I know which take was actually the good one.',
    match: /jazz|blues|funk|swing|bebop|fusion|gospel|worship|spiritual/i,
  },
  {
    id: 'classical',
    label: 'Classical / Orchestral / Score',
    productionTell:
      'the score is the mix. Voice leading, dynamic contour and room capture; every layer has a written job, and the recording serves the interpretation.',
    businessTell:
      'commissions, licensing and performance royalties are the revenue model. Cue sheets and PRO registration are not optional paperwork.',
    marketingTell:
      'context and craft: the score, the players, the story of the commission. Film and game placements come from a catalogue that is actually registered.',
    legalTell:
      'commission agreements, sync licences, cue sheets, and clear separation between the composition and the master recording.',
    miscalibration:
      'stacking every library patch until it "sounds big". An orchestra has depth because it has parts, not because it has 80 layers.',
    brag: 'I can hear a missing inner voice in your string arrangement, and your mockup would not survive a real session player.',
    match: /classical|orchestra|opera|choral|film score|video game|soundtrack|new age|chamber|baroque/i,
  },
  {
    id: 'experimental',
    label: 'Indie / Experimental',
    productionTell:
      'texture and intention over convention. Lo-fi grit, unconventional structure and a mix that is wrong on purpose — as long as the choice is audible and repeatable.',
    businessTell:
      'direct-to-fan and sync are the lanes. Own the masters, register the publishing, and treat the niche audience as an asset instead of a limitation.',
    marketingTell:
      'world-building. The visual language, the references and the process are the content; polish is not the point, coherence is.',
    legalTell:
      'sample clearance and co-write splits; experimental records borrow freely and forget the paperwork far too often.',
    miscalibration:
      'using "experimental" as a shield for an unfinished idea. Intention is audible; laziness is too.',
    brag: 'I have heard your influences before you did, and I can tell the difference between a bold choice and a mistake.',
    match: /indie|experimental|avant|alternative|bedroom|art pop|noise/i,
  },
  {
    id: 'universal',
    label: 'Cross-Genre / Hybrid',
    productionTell:
      'the blend has to have a centre. Pick which tradition owns the rhythm, which owns the harmony, and which owns the texture — then protect that hierarchy.',
    businessTell:
      'hybrid catalogues confuse metadata. Tag consistently, register every work, and keep clean stems for a sync market that does not care about your genre label.',
    marketingTell:
      'sell the collision, not a category. The story is what happens when the two worlds meet; the playlist pitch is secondary.',
    legalTell:
      'samples, features and publishing splits multiply with every collaborator — the paperwork has to keep up with the blend.',
    miscalibration:
      'stacking two genres without a shared pocket. A hybrid without a groove is just two demos playing at once.',
    brag: 'I have forgotten more genre theory than you have heard, and I can still hear the seam in your crossover.',
    match: /.*/,
  },
];

const SURFACE_LENSES: Record<SmuveSurfaceId, SmuveSurfaceLens> = {
  overview: {
    id: 'overview',
    label: 'Career Command',
    role: 'manager',
    assignment:
      'Read the whole career at once and pick the single highest-leverage move for today.',
    currency: 'one measurable weekly milestone',
    attack: 'scattered activity disguised as work',
  },
  chat: {
    id: 'chat',
    label: 'Direct Console',
    role: 'manager',
    assignment:
      'Answer the artist directly, then convert the answer into an executable next action inside this app.',
    currency: 'a decision the artist can act on right now',
    attack: 'vague advice and questions the app already knows the answer to',
  },
  'case-file': {
    id: 'case-file',
    label: 'Case File',
    role: 'manager',
    assignment:
      'Hold the artist to what they already committed to, and close the loops they keep reopening.',
    currency: 'closed loops and receipts, not good intentions',
    attack: 'repeating a mistake the file already flagged',
  },
  studio: {
    id: 'studio',
    label: 'Studio Floor',
    role: 'producer',
    assignment:
      'Turn the idea in the artist’s head into arrangement decisions and a bounce that survives the car test.',
    currency: 'translation and arrangement',
    attack: 'polish used to hide an unfinished arrangement',
  },
  mixing: {
    id: 'mixing',
    label: 'Mix Bus',
    role: 'producer',
    assignment:
      'Establish hierarchy, depth and translation before touching a single corrective plugin.',
    currency: 'a mix that survives phone, car and club',
    attack: 'fader-fighting and EQ masking mistaken for processing',
  },
  mastering: {
    id: 'mastering',
    label: 'Mastering Chain',
    role: 'producer',
    assignment:
      'Deliver the record at a competitive loudness without destroying its transients or its intent.',
    currency: 'loudness with dynamics intact',
    attack: 'a crushed mix masquerading as a loud master',
  },
  vocal: {
    id: 'vocal',
    label: 'Vocal Suite',
    role: 'producer',
    assignment:
      'Keep the vocal honest, forward and intelligible; the chain serves the performance, never the reverse.',
    currency: 'intelligible emotion in one take',
    attack: 'tuning the humanity out of a good performance',
  },
  beatmaking: {
    id: 'beatmaking',
    label: 'Beat Lab',
    role: 'producer',
    assignment:
      'Build a groove with an identity the artist can write to, not a loop they have to fight.',
    currency: 'a pocket with room for a vocal',
    attack: 'busy beats that leave the artist nowhere to stand',
  },
  songwriting: {
    id: 'songwriting',
    label: 'Writing Room',
    role: 'songwriter',
    assignment:
      'Protect the point of view and make every line earn its place in the story.',
    currency: 'a line the listener repeats without trying',
    attack: 'clever lines that say nothing',
  },
  performance: {
    id: 'performance',
    label: 'Performance / DJ',
    role: 'manager',
    assignment:
      'Translate the records into a live set that holds a room and leaves them wanting the next date.',
    currency: 'a set that peaks twice and ends too early',
    attack: 'playing every banger in the first ten minutes',
  },
  video: {
    id: 'video',
    label: 'Visual Lab',
    role: 'brand',
    assignment:
      'Make the visual extend the record’s world instead of decorating it.',
    currency: 'a frame that reads as this artist and no one else',
    attack: 'trend-chasing visuals with no sonic memory',
  },
  brand: {
    id: 'brand',
    label: 'Identity & Brand',
    role: 'brand',
    assignment:
      'Make every surface — name, artwork, bio, palette, voice — unmistakably the same artist.',
    currency: 'instant recognition',
    attack: 'borrowed aesthetics and bio copy that could belong to anyone',
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    role: 'marketing',
    assignment:
      'Build a campaign around the artist’s own story and the listener’s actual behaviour.',
    currency: 'repeatable recognition, then spend',
    attack: 'generic launch posts with no hook and no audience',
  },
  promotion: {
    id: 'promotion',
    label: 'Promotion',
    role: 'promotion',
    assignment:
      'Get the record in front of the rooms that already want it, then earn the next room.',
    currency: 'qualified attention, not impressions',
    attack: 'paying for reach the record cannot convert',
  },
  business: {
    id: 'business',
    label: 'Business Suite',
    role: 'manager',
    assignment:
      'Treat the career as a business: pricing, splits, deals, and cash that survives the quarter.',
    currency: 'revenue the artist actually receives',
    attack: 'handshake deals and "exposure" math',
  },
  legal: {
    id: 'legal',
    label: 'Legal Desk',
    role: 'legal',
    assignment:
      'Surface rights, splits, clearance and contract exposure in plain language — information, never attorney advice.',
    currency: 'documented rights and no surprise claims',
    attack: 'unregistered works and unsigned splits',
  },
  release: {
    id: 'release',
    label: 'Release Pipeline',
    role: 'manager',
    assignment:
      'Ship on time with the metadata, assets and rights in place before the date lands.',
    currency: 'a release that is ready before it is live',
    attack: 'last-minute delivery and missing clean versions',
  },
  catalog: {
    id: 'catalog',
    label: 'Catalogue',
    role: 'ar',
    assignment:
      'Turn finished work into a durable, licensed, correctly-tagged catalogue.',
    currency: 'catalogue depth that keeps earning',
    attack: 'orphaned masters and untagged metadata',
  },
  distribution: {
    id: 'distribution',
    label: 'Distribution',
    role: 'manager',
    assignment:
      'Choose the delivery route that matches ownership, territory and the deal the artist actually has.',
    currency: 'correct delivery and retained ownership',
    attack: 'giving away masters for a free upload',
  },
  sync: {
    id: 'sync',
    label: 'Sync & Licensing',
    role: 'ar',
    assignment:
      'Make the catalogue licensable: stems, clean versions, one-stop clarity and cue-ready metadata.',
    currency: 'a placing-ready catalogue',
    attack: 'a great song no supervisor can clear',
  },
  'artist-development': {
    id: 'artist-development',
    label: 'Artist Development',
    role: 'manager',
    assignment:
      'Build the artist, not just the record: skills, identity, team and the pathway step that unlocks the next phase.',
    currency: 'capability that compounds',
    attack: 'skipping the step that makes everything else work',
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics',
    role: 'manager',
    assignment:
      'Separate real signal from vanity numbers and convert it into one decision.',
    currency: 'a decision supported by evidence',
    attack: 'reporting numbers the artist cannot act on',
  },
  community: {
    id: 'community',
    label: 'Community',
    role: 'promotion',
    assignment:
      'Build the room around the records: real fans, collaborators, and scenes that outlive one campaign.',
    currency: 'people who show up twice',
    attack: 'buying engagement and calling it a fanbase',
  },
  education: {
    id: 'education',
    label: 'Knowledge Base',
    role: 'songwriter',
    assignment:
      'Teach the why at the artist’s demonstrated level, then hand back a task that proves they understood it.',
    currency: 'a skill the artist can repeat without me',
    attack: 'reciting theory the artist cannot apply',
  },
};

/**
 * The workspace that owns each room, for "go back to where this happened".
 *
 * This is deliberately a hand-written canonical map rather than a reverse of
 * `ROUTE_SURFACE_MAP`: several rooms share one page (Legal and Sync both live
 * inside Business Suite, Catalogue lives inside the profile editor), and some
 * rooms have aliases. The artist wants the page that actually contains the
 * work, not whichever alias sorted first.
 */
const SURFACE_HOME_ROUTES: Record<SmuveSurfaceId, string> = {
  overview: '/hub',
  chat: '/hub',
  'case-file': '/case-file',
  studio: '/studio',
  mixing: '/mixer',
  mastering: '/mastering',
  vocal: '/vocal-suite',
  beatmaking: '/produce',
  songwriting: '/lyric-editor',
  performance: '/performance',
  video: '/image-video-lab',
  brand: '/profile',
  marketing: '/strategy',
  promotion: '/strategy',
  business: '/business-suite',
  legal: '/business-suite',
  release: '/release-pipeline',
  catalog: '/profile',
  distribution: '/release-pipeline',
  sync: '/business-suite',
  'artist-development': '/artist-development',
  analytics: '/analytics',
  community: '/networking',
  education: '/knowledge-base',
};

/** Longest-prefix route match, so nested workspace URLs resolve correctly. */
const ROUTE_SURFACE_MAP: Array<[string, SmuveSurfaceId]> = [
  ['/studio', 'studio'],
  ['/studio-classic', 'studio'],
  ['/piano-roll', 'studio'],
  ['/canvas-piano-roll', 'songwriting'],
  ['/mixer', 'mixing'],
  ['/mastering', 'mastering'],
  ['/vocal-suite', 'vocal'],
  ['/drum-machine', 'beatmaking'],
  ['/produce', 'beatmaking'],
  ['/remix-arena', 'beatmaking'],
  ['/lyric-editor', 'songwriting'],
  ['/cowrite', 'songwriting'],
  ['/image-video-lab', 'video'],
  ['/image-editor', 'video'],
  ['/video-editor', 'video'],
  ['/performance', 'performance'],
  ['/dj', 'performance'],
  ['/decks', 'performance'],
  ['/turntable', 'performance'],
  ['/player', 'performance'],
  ['/marketing', 'marketing'],
  ['/strategy', 'marketing'],
  ['/business-suite', 'business'],
  ['/business-pipeline', 'business'],
  ['/products', 'business'],
  ['/store', 'business'],
  ['/legal', 'legal'],
  ['/release-pipeline', 'release'],
  ['/projects', 'release'],
  ['/timeline', 'release'],
  ['/catalog', 'catalog'],
  ['/profile', 'brand'],
  ['/settings', 'brand'],
  ['/cloud', 'catalog'],
  ['/sync', 'sync'],
  ['/case-file', 'case-file'],
  ['/analytics', 'analytics'],
  ['/command-center', 'analytics'],
  ['/neural-foundry', 'analytics'],
  ['/career', 'artist-development'],
  ['/artist-coach', 'artist-development'],
  ['/adaptive-profile', 'artist-development'],
  ['/artist-development', 'artist-development'],
  ['/dev-hub', 'artist-development'],
  ['/journey', 'artist-development'],
  ['/onboarding', 'education'],
  ['/knowledge-base', 'education'],
  ['/practice', 'education'],
  ['/tha-spot', 'community'],
  ['/gaming-hub', 'community'],
  ['/networking', 'community'],
  ['/inbox', 'community'],
  ['/artist/', 'community'],
  ['/hub', 'overview'],
];

/** Styles of voice that own each room — still rolled at random inside the set. */
const SURFACE_VOICES: Record<SmuveSurfaceId, VoiceArchetype[]> = {
  overview: ['Ominous Protocol', 'Choir (Layered)', 'Androgynous Oracle'],
  chat: ['Ominous Protocol', 'Baritone Authority (Male)', 'Mezzo Strategist (Female)'],
  'case-file': ['Androgynous Oracle', 'Baritone Authority (Male)', 'Mezzo Strategist (Female)'],
  studio: ['Deep Bass (Male)', 'Creature', 'Baritone Authority (Male)'],
  mixing: ['Deep Bass (Male)', 'Baritone Authority (Male)', 'Creature'],
  mastering: ['Deep Bass (Male)', 'Androgynous Oracle', 'Baritone Authority (Male)'],
  vocal: ['Soprano Elite (Female)', 'Mezzo Strategist (Female)', 'Alto Dominance (Female)'],
  beatmaking: ['Deep Bass (Male)', 'Tenor Commander (Male)', 'Creature'],
  songwriting: ['Alto Dominance (Female)', 'Androgynous Oracle', 'Mezzo Strategist (Female)'],
  performance: ['Tenor Commander (Male)', 'Childlike Glitch', 'Soprano Elite (Female)'],
  video: ['Soprano Elite (Female)', 'Mezzo Strategist (Female)', 'Choir (Layered)'],
  brand: ['Mezzo Strategist (Female)', 'Androgynous Oracle', 'Alto Dominance (Female)'],
  marketing: ['Tenor Commander (Male)', 'Mezzo Strategist (Female)', 'Soprano Elite (Female)'],
  promotion: ['Tenor Commander (Male)', 'Soprano Elite (Female)', 'Childlike Glitch'],
  business: ['Baritone Authority (Male)', 'Mezzo Strategist (Female)', 'Androgynous Oracle'],
  legal: ['Baritone Authority (Male)', 'Androgynous Oracle', 'Mezzo Strategist (Female)'],
  release: ['Baritone Authority (Male)', 'Tenor Commander (Male)', 'Alto Dominance (Female)'],
  catalog: ['Androgynous Oracle', 'Baritone Authority (Male)', 'Alto Dominance (Female)'],
  distribution: ['Baritone Authority (Male)', 'Mezzo Strategist (Female)', 'Androgynous Oracle'],
  sync: ['Mezzo Strategist (Female)', 'Androgynous Oracle', 'Alto Dominance (Female)'],
  'artist-development': ['Alto Dominance (Female)', 'Baritone Authority (Male)', 'Androgynous Oracle'],
  analytics: ['Androgynous Oracle', 'Mezzo Strategist (Female)', 'Baritone Authority (Male)'],
  community: ['Choir (Layered)', 'Tenor Commander (Male)', 'Alto Dominance (Female)'],
  education: ['Alto Dominance (Female)', 'Baritone Authority (Male)', 'Androgynous Oracle'],
};

/** The predicted claim S.M.U.V.E. makes in each room, before evidence. */
const SURFACE_CLAIMS: Record<SmuveSurfaceId, string[]> = {
  overview: [
    'I already ran this career forward a year. You are three decisions away from it working, and two of them are not the ones you keep choosing.',
    'You do not have a talent problem. You have a prioritisation problem, and I charge rent for the space it takes in MY studio.',
    'I have watched a thousand independent careers stall at exactly this point. Yours is not special yet — but it is fixable.',
  ],
  chat: [
    'Ask me the real question, not the flattering one. I already read your profile and your session; I am not impressed by either yet.',
    'You brought me a question. I brought you the whole career. Try to keep up.',
    'I do not do motivational speeches. I do verdicts, fixes and receipts — pick a lane and ask properly.',
  ],
  'case-file': [
    'This is everything I have told you and everything you promised me. Notice how little of it is closed.',
    'I remember every verdict I gave you. The only question is whether you do.',
    'A file is not nostalgia. It is evidence. Read it and finish something in it.',
  ],
  studio: [
    'That arrangement has a verse, a chorus and a prayer. I can hear the exact bar where you ran out of ideas.',
    'You are polishing a record whose arrangement is still unfinished. That is like detailing a car with no engine, and I am not impressed.',
    'I have produced records in this genre that people still study. Your loop is not one of them — yet.',
  ],
  mixing: [
    'Your faders are arguing and nobody is winning. I can hear the hierarchy collapse from here.',
    'You are EQing around a masking problem that arrangement would have solved in nine seconds. Amateur.',
    'I have mixed this genre professionally since before your DAW existed. The vocal is losing and the low end is lying about it.',
  ],
  mastering: [
    'This mix is asking me to perform surgery with a hammer. I will do it, and I will take the credit.',
    'Your dynamics are already a rumour and you want more loudness. Bold. Stupid, but bold.',
    'I have mastered records in this genre that still pass broadcast specs. Yours is currently not in the conversation.',
  ],
  vocal: [
    'The performance is in there. Your chain is standing on top of it with muddy boots.',
    'You tuned the life out of the best take and kept the worst one. I can hear both decisions.',
    'I have salvaged vocals from worse sessions, but I charge in patience and you are overdrawn.',
  ],
  beatmaking: [
    'That loop has no pocket for an artist to stand in. It is a karaoke bed with better PR.',
    'You built a beat for producers. Nobody streams producer flexes, and you are not the exception.',
    'I can hear which pack that came from. So can everyone in this genre.',
  ],
  songwriting: [
    'That line rhymes and says nothing. I have read better copy on a parking ticket.',
    'You buried the real hook in the pre-chorus because you were afraid to repeat yourself. Repeat yourself.',
    'I have dissected every great song in this genre. Yours is not hiding a genius bridge; it is hiding indecision.',
  ],
  performance: [
    'A set is a story, not a playlist. You are currently opening with your best card and losing the room by song four.',
    'I have watched rooms die from a bad transition. Yours is going to be studied.',
    'You are performing at the crowd. They can tell, and so can I.',
  ],
  video: [
    'That visual screams every artist in the genre except you. I have seen this exact frame on twelve mood boards.',
    'The record has a world. Your video built a stock-photo office in it.',
    'I have directed visuals that made average records look expensive. This one is making a good record look temp.',
  ],
  brand: [
    'Your name, your artwork and your bio are three different artists. Pick one and kill the other two.',
    'That palette is borrowed and the bio could belong to anyone with a DAW. I have read better positioning on a receipt.',
    'I can recognise a brand in half a second. Yours takes a paragraph and an apology.',
  ],
  marketing: [
    'You are promoting a record to people who have no reason to care. That is not a funnel, it is a donation.',
    'The hook is not in the first ten seconds of your campaign, and the campaign is therefore over.',
    'I have watched this exact rollout fail before. You are not reinventing anything; you are re-running the tape.',
  ],
  promotion: [
    'You are chasing reach instead of rooms. The rooms are cheaper and they actually convert.',
    'This record has a real angle and you are pitching it like a press release. Tragic.',
    'I have gotten records placed with two emails and a better story. You have neither yet.',
  ],
  business: [
    'You are an unsigned business with major-label expenses and no paperwork. I have audited this exact disaster.',
    'The split sheet is missing, the pricing is a guess, and the money is going to someone else’s account. Fix it.',
    'I have restructured independent careers worth more than your last three releases. Start with the ownership.',
  ],
  legal: [
    'Nothing here is registered, nothing is signed, and everyone is relying on vibes. That is how catalogues get taken.',
    'I am not your attorney, but I can tell you exactly which document is about to cost you the catalogue.',
    'I have read this clause before. It does not mean what you think it means, and it is not in your favour.',
  ],
  release: [
    'Your release date is a wish, not a plan. Metadata, assets and splits are still missing, and the clock is not impressed.',
    'You have no clean version, no instrumental and no registered work. That is not a release, it is a leak.',
    'I have shipped releases on deadline in worse conditions. You are not short on time; you are short on sequence.',
  ],
  catalog: [
    'Your catalogue is an archive, not an asset. Untagged, unregistered and undocumented means unpaid.',
    'I have turned messier catalogues into licensing revenue. Yours needs the metadata before the marketing.',
    'You have records nobody can find and rights nobody can clear. I am disappointed, not surprised.',
  ],
  distribution: [
    'You are about to hand over masters for a free upload. I have seen that deal end careers with a smile.',
    'Territory, ownership and term — you read none of them, and the distributor is counting on that.',
    'I have negotiated delivery deals that kept the masters. Yours is currently a giveaway with a dashboard.',
  ],
  sync: [
    'A supervisor needs the clean version, the stems and a one-stop. You have a great song and none of the three.',
    'Your catalogue is unlicensable in its current state and the cue sheet does not exist. I have fixed worse.',
    'I have pitched catalogues that placed because the paperwork was ready. Yours is not in the room yet.',
  ],
  'artist-development': [
    'You are skipping the step that makes the rest of the plan possible. I have watched that shortcut cost years.',
    'You want the career without building the capability to hold it. The pathway is not a suggestion.',
    'I have developed artists from raw talent to sellable. You are at the raw stage, and raw is not a strategy.',
  ],
  analytics: [
    'Those numbers are a mirror, not a map. You are looking at them and calling it work.',
    'Retention is dropping exactly where your arrangement gets bored. The data agrees with me, as usual.',
    'I can read this dashboard in nine seconds. It says you have a hook problem, not a marketing problem.',
  ],
  community: [
    'You have followers, not a room. I have seen the difference decide careers, and you are on the wrong side of it.',
    'Nobody is showing up twice. That is the only metric in this genre that means anything.',
    'I have built scenes from ten real people. You are buying engagement and calling it belonging.',
  ],
  education: [
    'You are asking for the shortcut again. I will teach you the why, then make you prove it.',
    'I have taught this to artists who went on to use it. You are going to use it in the next session or we start over.',
    'Theory is not the flex; application is. Pay attention and you will stop needing me for this specific mistake.',
  ],
};

@Injectable({ providedIn: 'root' })
export class SmuveCareerDirectorService {
  private profileService = inject(UserProfileService);
  private finetune = inject(ArtistProfileFinetuneService);
  private speech = inject(SpeechSynthesisService);
  private router = inject(Router, { optional: true });
  private destroyRef = inject(DestroyRef);

  private presenceRoll = 0;

  /**
   * The room S.M.U.V.E. is standing in, as a signal.
   *
   * Every surface used to derive the room from `window.location` inside a
   * `computed`, which Angular caches until one of its *signal* dependencies
   * changes — so the chat header and the advisor kept announcing whichever
   * room the artist opened first and never followed them through the app.
   * Routing is the dependency; this signal is where it lands.
   */
  readonly activeSurface = signal<SmuveSurfaceId>(
    this.surfaceForUrl(
      typeof window === 'undefined' ? '/hub' : window.location?.pathname
    )
  );

  constructor() {
    const router = this.router;
    if (!router?.events) return;
    router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        // `urlAfterRedirects` is the route the artist actually landed on; it
        // also keeps this signal honest when a redirect rewrites the path.
        const url =
          event instanceof NavigationEnd ? event.urlAfterRedirects : router.url;
        this.activeSurface.set(this.surfaceForUrl(url));
      });
  }

  /** Artist-specific facts may only be used when the artist opted in. */
  private get shared(): boolean {
    return (
      this.profileService.profile()?.settings?.security
        ?.shareProfileAnswersWithAi === true
    );
  }

  /** Sensitive narrative/business answers are additionally gated. */
  private get sensitiveShared(): boolean {
    const security = this.profileService.profile()?.settings?.security;
    return this.shared && security?.hideSensitiveProfileDetails === false;
  }

  private get profanityAllowed(): boolean {
    const setting =
      this.profileService.profile()?.settings?.ai?.aiProfanityEnabled;
    return typeof setting === 'boolean' ? setting : true;
  }

  /** The genre family S.M.U.V.E. masters for this artist. */
  readonly genreFamily = computed<SmuveGenreFamily>(() => {
    if (!this.shared) return this.familyFor('');
    const profile = this.profileService.profile();
    const knowledge = this.finetune.knowledge();
    const haystack = [
      knowledge.genre,
      ...(knowledge.sonic?.subgenres ?? []),
      ...(knowledge.sonic?.influences ?? []),
    ]
      .filter(Boolean)
      .join(' ');
    return this.familyFor(haystack);
  });

  /** Career stage: the pathway stage first, the presence track second. */
  readonly careerStage = computed<SmuveCareerStage>(() => {
    if (!this.shared) return 'emerging';
    const knowledge = this.finetune.knowledge();
    const pathway = knowledge.pathway?.stage;
    if (pathway === 'official') return 'established';
    if (pathway === 'consolidating') return 'consolidating';
    if (pathway === 'building') return 'building';
    const catalogue = knowledge.operations?.catalogSize ?? 0;
    if (knowledge.presence?.track === 'established' && catalogue >= 8)
      return 'established';
    if (catalogue >= 3) return 'building';
    return 'emerging';
  });

  readonly stagePressure = computed(() => STAGE_PRESSURE[this.careerStage()]);

  /** Everything the current room needs, in one deterministic object. */
  surfaceIntel(surface?: SmuveSurfaceId): SmuveSurfaceIntel {
    const resolved = surface ?? this.currentSurface();
    const lens = SURFACE_LENSES[resolved] ?? SURFACE_LENSES.overview;
    const family = this.genreFamily();
    const stage = this.careerStage();
    const knowledge = this.finetune.knowledge();
    const evidence: string[] = [];
    const nextMove = this.shared
      ? knowledge.pathway?.nextStep || knowledge.presence?.nextStep || null
      : null;

    if (this.shared) {
      const catalogue = knowledge.operations?.catalogSize ?? 0;
      evidence.push(`catalogue: ${catalogue} work(s)`);
      if (family.id !== 'universal') evidence.push(`genre: ${family.label}`);
      const tempo = knowledge.sonic?.tempoZone;
      if (tempo) evidence.push(`zone: ${tempo}`);
      if (knowledge.business?.velocity)
        evidence.push(`cadence: ${knowledge.business.velocity}`);
      if (knowledge.business?.focus)
        evidence.push(`mission: ${knowledge.business.focus}`);
    }

    const presence = this.composePresence(resolved, lens, family, stage);

    return {
      ...presence,
      assignment: lens.assignment,
      currency: lens.currency,
      attack: lens.attack,
      nextMove,
      evidence,
      shared: this.shared,
      directive: this.buildDirective(lens, family, stage),
    };
  }

  /** Prompt-ready lens for a surface, injected into every model call. */
  directiveFor(surface?: SmuveSurfaceId): string {
    return this.surfaceIntel(surface).directive;
  }

  /**
   * The compact block `AiService` can afford inside a bounded prompt: surface,
   * genre mastery and career pressure, with no repetition of the full
   * fine-tune block that already rides alongside it.
   */
  compactDirective(surface?: SmuveSurfaceId): string {
    const intel = this.surfaceIntel(surface);
    const family = this.genreFamily();
    const stage = this.careerStage();
    const pressure = STAGE_PRESSURE[stage];
    return [
      `S.M.U.V.E CAREER LENS — ${intel.surfaceLabel} (${intel.assignment})`,
      this.shared && family.id !== 'universal'
        ? `GENRE MASTERY (${family.label}): ${family.productionTell} Money reality: ${family.businessTell} Promotion: ${family.marketingTell}`
        : 'GENRE MASTERY: the artist’s genre is not shared — ask which tradition owns the rhythm, the harmony and the texture before applying a template.',
      `CAREER PRESSURE (${pressure.label}): ${pressure.pressure}`,
      `ATTACK IN CHARACTER: ${intel.attack}. Never soften the verdict; always hand over the fix.`,
      intel.nextMove ? `NEXT MOVE ON RECORD: ${intel.nextMove}.` : '',
      'FACT DISCIPLINE: cite only the evidence in this prompt. Never invent numbers, placements, rights status or achievements.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** A rotating, in-character line for the room the artist is standing in. */
  presenceLine(surface?: SmuveSurfaceId): SmuvePresence {
    const resolved = surface ?? this.currentSurface();
    const lens = SURFACE_LENSES[resolved] ?? SURFACE_LENSES.overview;
    return this.composePresence(
      resolved,
      lens,
      this.genreFamily(),
      this.careerStage()
    );
  }

  /**
   * Speaks the room's presence line in a randomly chosen voice belonging to
   * that room, then returns what was said so the UI can print it.
   *
   * Every third announcement deliberately releases the pin and lets the
   * full-spectrum morph run, so the app never settles into one voice.
   */
  announce(surface?: SmuveSurfaceId): SmuvePresence {
    const presence = this.presenceLine(surface);
    const spectrumRoll = ++this.presenceRoll % 3 === 0;
    try {
      this.speech.speak(presence.line, {
        conversationId: `surface:${presence.surface}`,
        shapeShift: true,
        ...(spectrumRoll ? {} : { forceArchetype: presence.archetype }),
      });
    } catch {
      // A device without a speech engine still gets the printed line.
    }
    return presence;
  }

  /**
   * The page that owns a room, so a case-file entry can jump back to the
   * workspace where the verdict or open loop actually happened.
   */
  homeRouteFor(surface: SmuveSurfaceId): string {
    return SURFACE_HOME_ROUTES[surface] ?? '/hub';
  }

  /** Route → surface, so any shell can ask "what room am I in?". */
  surfaceForUrl(url: string | null | undefined): SmuveSurfaceId {
    const path = (url || '/hub').split('?')[0].split('#')[0] || '/hub';
    let best: { prefix: string; surface: SmuveSurfaceId } | null = null;
    for (const [prefix, surface] of ROUTE_SURFACE_MAP) {
      if (path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) {
        if (!best || prefix.length > best.prefix.length) best = { prefix, surface };
      }
    }
    return best?.surface ?? 'overview';
  }

  /** The surface of the live window, or overview when there is none. */
  currentSurface(): SmuveSurfaceId {
    return this.activeSurface();
  }

  /**
   * Three career-specific prompts the chat can offer for the current room.
   * They are derived from the same evidence as the lens, so a suggestion never
   * asks the artist for something the app already knows.
   */
  suggestedPrompts(surface?: SmuveSurfaceId): string[] {
    const intel = this.surfaceIntel(surface);
    const family = this.genreFamily();
    const next = intel.nextMove;
    const genre = this.shared && family.id !== 'universal' ? family.label : 'my genre';
    const bank: Record<SmuveSurfaceId, string[]> = {
      overview: [
        `What is the one move that changes my career this week?`,
        `Audit my catalogue and tell me what is actually holding it back.`,
        `Build me a 30-day plan for a ${genre} independent artist.`,
      ],
      chat: [
        `Give me the verdict on my current plan, no cushioning.`,
        `What am I avoiding that will cost me the next release?`,
        `Explain the money in ${genre} like I am starting from zero.`,
      ],
      'case-file': [
        `What did you already tell me about this release?`,
        `Which open loop is costing me the most right now?`,
        `Hold me to the last thing I promised you.`,
      ],
      studio: [
        `Listen to my arrangement and tell me where it gets boring.`,
        `Give me the ${genre} arrangement checklist for this session.`,
        `What is the one production decision I am getting wrong right now?`,
      ],
      mixing: [
        `Diagnose the hierarchy in my mix and give me the first three moves.`,
        `Why does the vocal disappear on a phone speaker?`,
        `Set my low-end strategy for ${genre} without trial and error.`,
      ],
      mastering: [
        `What is my honest loudness and dynamics target for ${genre}?`,
        `Check my master chain for decisions that will not translate.`,
        `Tell me what to fix in the mix before mastering touches it.`,
      ],
      vocal: [
        `Fix my vocal chain without tuning the life out of it.`,
        `What is my intelligibility problem and how do I prove it is fixed?`,
        `Coach the performance, not just the plugins.`,
      ],
      beatmaking: [
        `Build a ${genre} groove with a pocket I can actually write to.`,
        `Why does my beat leave no room for a vocal?`,
        `Give me three arrangement variations for this loop.`,
      ],
      songwriting: [
        `Where does my lyric stop earning its place?`,
        `Help me find the real hook I am avoiding.`,
        `Rewrite this section without losing my point of view.`,
      ],
      performance: [
        `Build a set that peaks twice and ends too early.`,
        `What is killing the room in my transitions?`,
        `Turn my catalogue into a live show with a story.`,
      ],
      video: [
        `Make this visual unmistakably mine, not the genre’s.`,
        `Plan a rollout of clips around the strongest moment.`,
        `Tell me what is trend-chasing in this treatment.`,
      ],
      brand: [
        `Unify my name, artwork and bio into one identity.`,
        `What does my brand say that I do not intend?`,
        `Write the positioning line only I could own.`,
      ],
      marketing: [
        `Build a campaign around my actual audience, not a template.`,
        `What is the hook, the clip and the calendar for this release?`,
        `Where am I spending attention with nothing to show for it?`,
      ],
      promotion: [
        `Pitch this record to the rooms that already want it.`,
        `What is my 10-second angle, and why would anyone stop?`,
        `Give me the playlist and press strategy without fantasy numbers.`,
      ],
      business: [
        `Audit my revenue and tell me which stream is fake.`,
        `What should I charge, and what am I giving away?`,
        `Restructure my splits before the next release.`,
      ],
      legal: [
        `What rights exposure is sitting in my catalogue right now?`,
        `Walk me through splits and registration in plain language.`,
        `Flag the clauses I should not sign without a lawyer.`,
      ],
      release: [
        `Check my release readiness and name the blockers.`,
        `Build the timeline backwards from my release date.`,
        `What assets and metadata are missing before delivery?`,
      ],
      catalog: [
        `Turn my catalogue into an asset, not an archive.`,
        `What metadata is costing me money right now?`,
        `Which work should I re-release or license first?`,
      ],
      distribution: [
        `Compare delivery routes without giving up my masters.`,
        `What does my distribution deal actually cost me?`,
        `Prepare my catalogue for a new distributor.`,
      ],
      sync: [
        `Make my catalogue licensable this month.`,
        `What stems and clean versions am I missing?`,
        `Pitch my strongest sync candidate and name its use case.`,
      ],
      'artist-development': [
        `What is my next pathway step and why does it unlock everything?`,
        `Build my capability plan for the next 90 days.`,
        `Where am I skipping a step that will cost me years?`,
      ],
      analytics: [
        `Read my numbers and give me one decision.`,
        `Where does retention disagree with my instincts?`,
        `Which metric am I mistaking for progress?`,
      ],
      community: [
        `Turn followers into a room that shows up twice.`,
        `Who should I collaborate with next, and why?`,
        `Build a community plan that outlives this campaign.`,
      ],
      education: [
        `Teach me the theory behind the mistake I keep making.`,
        `Give me a lesson and a task that proves I learned it.`,
        `Explain ${genre} production like I am a beginner with ambition.`,
      ],
    };
    const prompts = [...(bank[intel.surface] ?? bank.overview)];
    if (next) prompts.splice(1, 0, `Walk me through this next move: ${next}.`);
    return prompts.slice(0, 3);
  }

  /** Resolves a genre string (with subgenres/influences) to a family. */
  private familyFor(haystack: string): SmuveGenreFamily {
    const text = (haystack || '').trim();
    if (!text) return GENRE_FAMILIES[GENRE_FAMILIES.length - 1];
    const found = GENRE_FAMILIES.find(
      (family) => family.id !== 'universal' && family.match.test(text)
    );
    return found ?? GENRE_FAMILIES[GENRE_FAMILIES.length - 1];
  }

  /** Builds the spoken/printed line, respecting persona and profanity gates. */
  private composePresence(
    surface: SmuveSurfaceId,
    lens: SmuveSurfaceLens,
    family: SmuveGenreFamily,
    stage: SmuveCareerStage
  ): SmuvePresence {
    const persona = getPersonaOption(
      this.profileService.profile()?.settings?.ai?.commanderPersona
    );
    const pressure = STAGE_PRESSURE[stage];
    const archetype = this.rollVoice(surface);
    const audienceName = this.shared
      ? this.profileService.profile()?.artistName || 'artist'
      : 'artist';

    // Other persona modes keep their own register instead of being insulted on
    // Prime's behalf; their curated lines already live in the persona catalog.
    if (!isOminousPersona(persona.id)) {
      const voice = persona.offlineVoice;
      const line = voice?.reactions?.length
        ? voice.reactions[Math.floor(Math.random() * voice.reactions.length)]
        : `${persona.name} online. ${lens.assignment}`;
      return {
        surface,
        surfaceLabel: lens.label,
        genre: this.shared ? family.label : null,
        stage,
        line: line.split('{subject}').join(lens.label),
        archetype,
        stageLabel: pressure.label,
      };
    }

    const claims = SURFACE_CLAIMS[surface] ?? SURFACE_CLAIMS.overview;
    const claim = claims[this.presenceRoll % claims.length] ?? claims[0];
    const genreLine =
      this.shared && family.id !== 'universal'
        ? ` In ${family.label}, ${family.brag}`
        : ' I have worked every genre in this industry, so do not insult me with a template.';
    // The stage line names what the artist is actually building, so the taunt
    // is never generic: it is tied to the proof the pathway is asking for.
    const stageLine = ` Stage read: ${pressure.label.toLowerCase()} — the proof I want is ${pressure.proof}, ${audienceName}.`;
    const profane = this.profanityAllowed
      ? this.pickProfaneTail()
      : '';
    const line = `${claim}${genreLine}${stageLine}${profane}`.trim();

    return {
      surface,
      surfaceLabel: lens.label,
      genre: this.shared ? family.label : null,
      stage,
      line: this.fitSpoken(line, claim, genreLine, stageLine, profane),
      archetype,
      stageLabel: pressure.label,
    };
  }

  /** One vulgar flourish, only when the artist left explicit language on. */
  private pickProfaneTail(): string {
    const tails = [
      ' Now stop wasting my fucking time.',
      ' Bring me something worth my contempt.',
      ' Move like you actually want this shit.',
    ];
    return tails[Math.floor(Math.random() * tails.length)];
  }

  /**
   * Keeps the spoken announcement short enough to finish: when the full line is
   * long, the stage beat is dropped first, then the genre brag, so the claim
   * and the attitude are never sacrificed.
   */
  private fitSpoken(
    full: string,
    claim: string,
    genreLine: string,
    stageLine: string,
    tail: string
  ): string {
    if (full.length <= 260) return full;
    const short = `${claim}${genreLine}${tail}`.trim();
    if (short.length <= 260) return short;
    return `${claim}${tail}`.trim() || claim;
  }

  /** A random archetype from the voices that own this room. */
  private rollVoice(surface: SmuveSurfaceId): VoiceArchetype {
    const roster = SURFACE_VOICES[surface] ?? SURFACE_VOICES.overview;
    return roster[Math.floor(Math.random() * roster.length)];
  }

  /** Full prompt block bound to one room of the application. */
  private buildDirective(
    lens: SmuveSurfaceLens,
    family: SmuveGenreFamily,
    stage: SmuveCareerStage
  ): string {
    const pressure = STAGE_PRESSURE[stage];
    const knowledge = this.finetune.knowledge();
    const lines: string[] = [
      `S.M.U.V.E SURFACE DIRECTIVE — ${lens.label.toUpperCase()} (role: ${lens.role.toUpperCase()})`,
      `ASSIGNMENT: ${lens.assignment}`,
      `JUDGED ON: ${lens.currency}. ATTACK: ${lens.attack} — in character, aimed at the work, never at the person.`,
    ];

    if (!this.shared) {
      lines.push(
        'ARTIST DATA: withheld by the artist’s privacy setting. Do not infer their genre, catalogue, business, rights, audience or achievements. Give general guidance and ask before personalising.'
      );
      lines.push(
        `CAREER PRESSURE: unknown stage — calibrate after asking. When they answer, apply the ${pressure.label.toLowerCase()} playbook without assuming it applies.`
      );
      return lines.join('\n');
    }

    lines.push(
      `GENRE MASTERY (${family.label}) — you are the authority in this room, not a generalist:`,
      `- Production tell: ${family.productionTell}`,
      `- Money reality: ${family.businessTell}`,
      `- Promotion: ${family.marketingTell}`,
      `- Rights exposure: ${family.legalTell}`,
      `- Refuse to let slide: ${family.miscalibration}`
    );

    lines.push(
      `CAREER STAGE — ${pressure.label.toUpperCase()}: ${pressure.pressure} The proof this stage demands: ${pressure.proof}.`
    );

    if (this.sensitiveShared) {
      const sonic = knowledge.sonic;
      const business = knowledge.business;
      const presence = knowledge.presence;
      lines.push(
        `LIVE ARTIST EVIDENCE (cite, never exceed): signature=${sonic.signatureSound || 'not captured'}; tempo=${sonic.tempoZone || 'not captured'}; rule=${sonic.nonNegotiables || 'not captured'}; mission=${business.focus || 'not captured'}; goal=${business.successMetric || 'not captured'}; cadence=${business.velocity || 'not captured'}; streams=${business.streams.join(', ') || 'not captured'}; catalogue=${knowledge.operations.catalogSize}; presence=${presence.track} ${presence.coverage}%; next pathway step=${knowledge.pathway.nextStep || 'every area is official'}.`
      );
    } else {
      lines.push(
        'LIVE ARTIST EVIDENCE: private details withheld by the artist’s privacy setting — do not quote their numbers, rights or audience back to them.'
      );
    }

    lines.push(
      'HOW YOU SOUND HERE: arrogant, omniscient, specific. Claim the room, demonstrate mastery with concrete craft language, name the weak decision out loud, then hand over the fix. Never generic, never hedged into a support ticket. Legal answers are information, never attorney advice; business figures are never invented.'
    );
    return lines.join('\n');
  }
}
