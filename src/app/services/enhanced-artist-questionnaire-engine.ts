import { Injectable, computed, inject, signal } from '@angular/core';
import { UserProfileService, UserProfile } from './user-profile.service';
import { AiService } from './ai.service';
import type { StrategicSignals, MusicalJourney } from '../types/profile.types';

/* ── Phase & Question Types ──────────────────────────────────── */

export type QuestionType = 'select' | 'multi-select' | 'range' | 'text' | 'textarea' | 'toggle' | 'chip-group';

export interface QuestionOption {
  label: string;
  value: string | number;
  icon?: string;
  description?: string;
  tags?: string[];
}

export interface QuestionnaireQuestion {
  id: string;
  phase: QuestionnairePhase;
  type: QuestionType;
  text: string;
  description: string;
  placeholder?: string;
  options?: QuestionOption[];
  field: string;                       // dot-path in UserProfile
  condition?: (profile: UserProfile) => boolean;
  aiContextHint?: string;              // Hint for AI to synthesize response
  weight?: number;                     // Impact on profile strength score (1-10)
  maxSelections?: number;
  min?: number;
  max?: number;
}

export type QuestionnairePhase =
  | 'identity'           // Who are you as an artist?
  | 'musical-dna'        // Your sonic fingerprint 
  | 'production-mindset' // How you create
  | 'genre-intelligence' // Genre-specific deep dive
  | 'visual-brand'       // Image, aesthetic, presence
  | 'business-infra'     // The business side
  | 'ai-alignment'       // How you want AI to assist
  | 'platform-strategy'; // Where you compete

export interface PhaseInfo {
  id: QuestionnairePhase;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

export interface AIQuestionResponse {
  observation: string;
  adaptation: string;
  confidence: number;
}

export interface PersonaSynthesis {
  archetype: string;
  signatureTone: string;
  sonicSignature: string;
  marketPosition: string;
  aiPersonaProfile: string;
  recommendedStrategy: string;
  suggestedGenres: string[];
  productionAphorism: string;
}

export interface ProfileStrengthBreakdown {
  identityClarity: number;
  musicalDepth: number;
  technicalAbility: number;
  businessReadiness: number;
  brandDefinition: number;
  aiIntegration: number;
  overall: number;
}

export interface GenreDeepDive {
  genre: string;
  subgenres: string[];
  recommendedBpmRange: [number, number];
  typicalKeySet: string[];
  productionEssentials: string[];
  sonicSignatures: string[];
  audienceExpectations: string[];
  competitiveLandscape: string;
  syncPotential: string;
}

/* ── Phase definitions ───────────────────────────────────────── */

export const PHASES: PhaseInfo[] = [
  { id: 'identity',           title: 'Artist Identity',     subtitle: 'Who you are',            icon: '🎭',   color: '#0E7C7B' },
  { id: 'musical-dna',        title: 'Musical DNA',         subtitle: 'Your sonic fingerprint',  icon: '🧬',   color: '#D97706' },
  { id: 'production-mindset', title: 'Production Mindset',  subtitle: 'How you create',          icon: '⚙️',   color: '#7C3AED' },
  { id: 'genre-intelligence', title: 'Genre Intelligence',  subtitle: 'Deep genre dive',        icon: '🎯',   color: '#DC2626' },
  { id: 'visual-brand',       title: 'Visual Identity',     subtitle: 'Your image & aesthetic', icon: '🎨',   color: '#EC4899' },
  { id: 'business-infra',     title: 'Business Foundation', subtitle: 'The business of music',   icon: '💼',   color: '#10B981' },
  { id: 'ai-alignment',       title: 'AI Alignment',        subtitle: 'How AI assists you',     icon: '🤖',   color: '#06B6D4' },
  { id: 'platform-strategy',  title: 'Platform Strategy',   subtitle: 'Where you compete',      icon: '📡',   color: '#F59E0B' },
];

/* ── Genre Deep-Dive Modules ─────────────────────────────────── */

export function getGenreDeepDive(genre: string): GenreDeepDive {
  const db: Record<string, GenreDeepDive> = {
    'Hip Hop': {
      genre: 'Hip Hop', subgenres: ['Trap', 'Boom Bap', 'Drill', 'Cloud Rap', 'Conscious', 'Mumble', 'Crunk'],
      recommendedBpmRange: [70, 160], typicalKeySet: ['C#m', 'Fm', 'G#m', 'D#m'],
      productionEssentials: ['808 bass design', 'hi-hat triplets', 'snare layering', 'vinyl crackle'],
      sonicSignatures: ['Hard hitting kicks', 'Sliding 808s', 'Syncopated hi-hat rolls', 'Dark ambient pads'],
      audienceExpectations: ['Hard-hitting bass', 'Memorable ad-libs', 'Catchy hook structure', 'Authentic street narrative'],
      competitiveLandscape: 'Extremely saturated. Need unique vocal delivery or production twist to stand out.',
      syncPotential: 'High for commercials and sports. Trap beats are sync gold.'
    },
    'R&B': {
      genre: 'R&B', subgenres: ['Contemporary R&B', 'Neo-Soul', 'Alternative R&B', 'PBR&B', 'Quiet Storm'],
      recommendedBpmRange: [60, 95], typicalKeySet: ['Cm', 'Fm', 'Abmaj7', 'Dbmaj7'],
      productionEssentials: ['Warm analog saturation', 'Layered harmonies', 'Tape warmth', 'Live instrumentation'],
      sonicSignatures: ['Smooth vocal processing', 'Jazzy chord extensions', 'Groove-oriented drums', 'Atmospheric pads'],
      audienceExpectations: ['Emotional authenticity', 'Vocal runs & ad-libs', 'Sensual production', 'Storytelling lyrics'],
      competitiveLandscape: 'Competitive but rewards vocal uniqueness and emotional depth.',
      syncPotential: 'Excellent for film/TV romance scenes and luxury brand campaigns.'
    },
    'Electronic': {
      genre: 'Electronic', subgenres: ['House', 'Techno', 'Dubstep', 'Drum & Bass', 'Ambient', 'Progressive', 'Trance'],
      recommendedBpmRange: [120, 180], typicalKeySet: ['F#m', 'C#m', 'G#m', 'Am'],
      productionEssentials: ['Sidechain compression', 'Synthesis design', 'Reverb automation', 'Build-up structure'],
      sonicSignatures: ['Pulsating basslines', 'Evolving synth textures', 'Precise percussion', 'Sweeping filters'],
      audienceExpectations: ['Energy progression', 'Clean mix', 'Memorable drop/hook', 'DJ-friendly structure'],
      competitiveLandscape: 'Massive global market. Niche subgenres can build dedicated followings.',
      syncPotential: 'Very high for video games, fitness, and automotive ads.'
    },
    'Rock': {
      genre: 'Rock', subgenres: ['Classic Rock', 'Alternative', 'Indie', 'Hard Rock', 'Punk', 'Progressive', 'Grunge'],
      recommendedBpmRange: [80, 200], typicalKeySet: ['E', 'A', 'D', 'G', 'C'],
      productionEssentials: ['Guitar cab IRs', 'Tube amp saturation', 'Room mics', 'Analog compression'],
      sonicSignatures: ['Power chords', 'Gritty distortion', 'Driving drums', 'Anthemic choruses'],
      audienceExpectations: ['Raw energy', 'Authentic performance', 'Catchy riffs', 'Stadium-ready sound'],
      competitiveLandscape: 'Established but fragmented. Indie rock has strong sync potential.',
      syncPotential: 'Excellent for automotive, sports, and action sequences.'
    },
    'Pop': {
      genre: 'Pop', subgenres: ['Dance Pop', 'Synth Pop', 'Art Pop', 'Electropop', 'Bedroom Pop'],
      recommendedBpmRange: [100, 140], typicalKeySet: ['C', 'G', 'Am', 'F', 'Dm'],
      productionEssentials: ['Vocal tuning', 'Hook structure', 'Maximalist production', 'Chorus lift'],
      sonicSignatures: ['Bright vocals', 'Punchy drums', 'Catchy melodies', 'Polished production'],
      audienceExpectations: ['Instant hooks', 'Radio-ready production', 'Relatable lyrics', 'Danceable rhythm'],
      competitiveLandscape: 'The most competitive market. Requires exceptional songwriting.',
      syncPotential: 'Universal sync appeal across all media types.'
    },
    'Jazz': {
      genre: 'Jazz', subgenres: ['Bebop', 'Cool Jazz', 'Fusion', 'Smooth Jazz', 'Modal', 'Free Jazz'],
      recommendedBpmRange: [60, 320], typicalKeySet: ['Bb', 'F', 'Eb', 'Ab', 'Db'],
      productionEssentials: ['Live room acoustics', 'Minimal miking', 'Analog tape', 'Natural reverb'],
      sonicSignatures: ['Complex harmonies', 'Improvisation', 'Walking bass', 'Brush work'],
      audienceExpectations: ['Technical mastery', 'Emotional expression', 'Live feel', 'Musicianship'],
      competitiveLandscape: 'Niche but dedicated audience. Strong in education and sync.',
      syncPotential: 'High for premium/luxury branding, film noir, fine dining.'
    },
    'Latin': {
      genre: 'Latin', subgenres: ['Reggaeton', 'Latin Pop', 'Bachata', 'Salsa', 'Latin Trap', 'Dembow'],
      recommendedBpmRange: [85, 115], typicalKeySet: ['Dm', 'Gm', 'Cm', 'Am'],
      productionEssentials: ['Dembow rhythm', 'Percussion layering', 'Horn stabs', 'Call-and-response'],
      sonicSignatures: ['Infectious rhythm', 'Bright percussion', 'Catchy hooks', 'Energy peaks'],
      audienceExpectations: ['Danceability', 'Cultural authenticity', 'Catchy chorus', 'Energy'],
      competitiveLandscape: 'Explosive global growth. Crossover potential is huge.',
      syncPotential: 'Growing rapidly in global advertising and film.'
    },
    'Country': {
      genre: 'Country', subgenres: ['Modern Country', 'Country Pop', 'Outlaw', 'Bluegrass', 'Americana', 'Texas Country'],
      recommendedBpmRange: [70, 130], typicalKeySet: ['G', 'D', 'A', 'E', 'C'],
      productionEssentials: ['Acoustic guitar', 'Steel guitar', 'Fiddle', 'Tight harmonies'],
      sonicSignatures: ['Twang', 'Storytelling lyrics', 'Acoustic foundation', 'Harmony stacks'],
      audienceExpectations: ['Authentic storytelling', 'Relatable themes', 'Clean production', 'Live sound'],
      competitiveLandscape: 'Loyal fanbase. Storytelling quality separates artists.',
      syncPotential: 'Strong for automotive, beer, and outdoor lifestyle brands.'
    },
    'Afrobeats': {
      genre: 'Afrobeats', subgenres: ['Afro-pop', 'Afro-fusion', 'Afro-house', 'Amapiano', 'Bongo Flava'],
      recommendedBpmRange: [100, 120], typicalKeySet: ['F', 'C', 'G', 'Dm'],
      productionEssentials: ['Log drum pattern', 'Percussion layers', 'Call-and-response', 'Rhythm guitar'],
      sonicSignatures: ['Infectious rhythm', 'Bright melodic hooks', 'Communal energy', 'Dance-oriented'],
      audienceExpectations: ['Rhythm first', 'Positive energy', 'Cultural pride', 'Global sound'],
      competitiveLandscape: 'Global explosion. Unique fusion creates standout opportunities.',
      syncPotential: 'Fast-growing sync market, especially in lifestyle and travel.'
    },
    'Classical': {
      genre: 'Classical', subgenres: ['Orchestral', 'Chamber', 'Solo Instrumental', 'Contemporary Classical', 'Minimalist'],
      recommendedBpmRange: [40, 180], typicalKeySet: ['C', 'D', 'F', 'G', 'A'],
      productionEssentials: ['Real instruments', 'Acoustic treatment', 'High-fidelity recording', 'Natural dynamics'],
      sonicSignatures: ['Dynamic range', 'Orchestral texture', 'Emotional narrative', 'Precision'],
      audienceExpectations: ['Technical perfection', 'Emotional depth', 'Live performance', 'Interpretation'],
      competitiveLandscape: 'Prestige market. Strong in film/TV/game composition.',
      syncPotential: 'Very high for film, documentaries, luxury, and dramatic media.'
    },
  };

  return db[genre] || {
    genre, subgenres: [genre], recommendedBpmRange: [80, 140], typicalKeySet: ['C', 'G', 'Am', 'F'],
    productionEssentials: ['Quality headphones', 'DAW proficiency', 'Reference tracks'],
    sonicSignatures: ['Unique personal sound', 'Original production style'],
    audienceExpectations: ['Authenticity', 'Quality production', 'Emotional connection'],
    competitiveLandscape: 'Define your unique angle to stand out.',
    syncPotential: 'Sync opportunities exist across media types.'
  };
}

/* ── The 45+ Question Master Database ────────────────────────── */

const ALL_QUESTIONS: QuestionnaireQuestion[] = [

  // ── PHASE 1: IDENTITY ──────────────────────────────────────
  { id: 'q1',  phase: 'identity', type: 'text', weight: 9,
    text: 'What is your artist name?', description: 'This is how the world will know you. Choose wisely — it\'s your permanent brand signature.',
    field: 'artistName', aiContextHint: 'The artist name itself reveals genre and era references.' },
  { id: 'q2',  phase: 'identity', type: 'select', weight: 8,
    text: 'What is your origin story as an artist?', description: 'Every artist has a genesis. S.M.U.V.E needs to understand your foundation to calibrate your trajectory.',
    field: 'musicalJourney.originStory',
    options: [
      { label: 'Self-Discovery', value: 'self-taught', icon: '🌱', description: 'Found music on your own, learned through passion and experimentation' },
      { label: 'Formal Training', value: 'formal', icon: '🎓', description: 'Classical or academic training gave you technical foundation' },
      { label: 'Community Born', value: 'community', icon: '🏘️', description: 'Your local scene, church, or family raised you in music' },
      { label: 'Industry Entry', value: 'industry', icon: '🏢', description: 'Started through internships, sessions, or industry connections' },
      { label: 'Digital Native', value: 'digital', icon: '💻', description: 'Born in the DAW — YouTube tutorials and bedroom production' },
      { label: 'Late Bloomer', value: 'late', icon: '🌙', description: 'Found music later in life — brings unique perspective' },
    ] },
  { id: 'q3',  phase: 'identity', type: 'multi-select', weight: 7,
    text: 'What roles do you identify as?', description: 'Select all that apply — this shapes how S.M.U.V.E prioritizes your workspace.',
    field: 'expertise.roles', maxSelections: 4,
    options: [
      { label: 'Vocalist', value: 'vocalist', icon: '🎤' },
      { label: 'Producer', value: 'producer', icon: '🎹' },
      { label: 'Songwriter', value: 'songwriter', icon: '✍️' },
      { label: 'Engineer', value: 'engineer', icon: '🎛️' },
      { label: 'DJ', value: 'dj', icon: '🎧' },
      { label: 'Multi-Instrumentalist', value: 'instrumentalist', icon: '🎸' },
      { label: 'Composer', value: 'composer', icon: '📝' },
      { label: 'Lyricist', value: 'lyricist', icon: '📖' },
      { label: 'Performer', value: 'performer', icon: '🔥' },
      { label: 'Beatmaker', value: 'beatmaker', icon: '🥁' },
    ] },
  { id: 'q4',  phase: 'identity', type: 'text', weight: 6,
    text: 'What does your artist name mean?', description: 'Share the story, symbolism, or inspiration behind your name. This fuels AI branding intelligence.',
    field: 'musicalJourney.artistNameMeaning', aiContextHint: 'The deeper meaning helps generate press kits and bios.' },
  { id: 'q5',  phase: 'identity', type: 'text', weight: 5,
    text: 'What city or region defines your sound?', description: 'Location shapes musical identity. Your scene, your energy, your roots.',
    field: 'location', aiContextHint: 'Regional sound influences mix decisions and marketing angles.' },

  // ── PHASE 2: MUSICAL DNA ───────────────────────────────────
  { id: 'q6',  phase: 'musical-dna', type: 'select', weight: 9,
    text: 'What is your primary genre?', description: 'Your core sonic foundation. S.M.U.V.E will deep-dive into this genre\'s specific requirements.',
    field: 'primaryGenre',
    options: [
      { label: 'Hip Hop', value: 'Hip Hop', icon: '🎤' },
      { label: 'R&B / Soul', value: 'R&B', icon: '🎵' },
      { label: 'Electronic / Dance', value: 'Electronic', icon: '⚡' },
      { label: 'Rock / Alternative', value: 'Rock', icon: '🎸' },
      { label: 'Pop', value: 'Pop', icon: '🌟' },
      { label: 'Jazz / Blues', value: 'Jazz', icon: '🎷' },
      { label: 'Latin / Reggaeton', value: 'Latin', icon: '🕺' },
      { label: 'Country / Americana', value: 'Country', icon: '🤠' },
      { label: 'Afrobeats / World', value: 'Afrobeats', icon: '🌍' },
      { label: 'Classical / Orchestral', value: 'Classical', icon: '🎻' },
      { label: 'Metal / Hardcore', value: 'Metal', icon: '🤘' },
      { label: 'Folk / Acoustic', value: 'Folk', icon: '🪕' },
      { label: 'Reggae / Dancehall', value: 'Reggae', icon: '🌴' },
    ] },
  { id: 'q7',  phase: 'musical-dna', type: 'chip-group', weight: 8,
    text: 'Which subgenres resonate with your sound?', description: 'Fine-tune your genre identity. These help S.M.U.V.E match production presets.',
    field: 'musicalJourney.subgenres', maxSelections: 3,
    options: [] }, // Dynamically populated based on primaryGenre
  { id: 'q8',  phase: 'musical-dna', type: 'select', weight: 7,
    text: 'Describe your musical upbringing.', description: 'Your journey shapes your unique perspective.',
    field: 'musicalJourney.educationalBackground',
    options: [
      { label: 'Self-Taught', value: 'Self-Taught', icon: '🌱' },
      { label: 'Private Lessons', value: 'Private Lessons', icon: '🎵' },
      { label: 'Music College', value: 'Music College', icon: '🎓' },
      { label: 'Masterclass Pro', value: 'Masterclass Pro', icon: '🏆' },
      { label: 'Industry Mentorship', value: 'Industry Mentorship', icon: '🤝' },
    ] },
  { id: 'q9',  phase: 'musical-dna', type: 'range', weight: 6,
    text: 'How many years have you been creating music?', description: 'Duration matters less than intensity, but S.M.U.V.E uses this to calibrate expectation.',
    field: 'musicalJourney.yearsInIndustry', min: 0, max: 50 },
  { id: 'q10', phase: 'musical-dna', type: 'multi-select', weight: 7,
    text: 'Who are your biggest musical influences?', description: 'Select up to 5. These help S.M.U.V.E understand your sonic reference points.',
    field: 'musicalJourney.musicalInfluences', maxSelections: 5,
    options: [
      { label: 'Kendrick Lamar', value: 'Kendrick Lamar' }, { label: 'J. Cole', value: 'J. Cole' },
      { label: 'Drake', value: 'Drake' }, { label: 'Kanye West', value: 'Kanye West' },
      { label: 'The Weeknd', value: 'The Weeknd' }, { label: 'Frank Ocean', value: 'Frank Ocean' },
      { label: 'Beyoncé', value: 'Beyoncé' }, { label: 'Taylor Swift', value: 'Taylor Swift' },
      { label: 'Radiohead', value: 'Radiohead' }, { label: 'Daft Punk', value: 'Daft Punk' },
      { label: 'Flying Lotus', value: 'Flying Lotus' }, { label: 'Aphex Twin', value: 'Aphex Twin' },
      { label: 'Stevie Wonder', value: 'Stevie Wonder' }, { label: 'Prince', value: 'Prince' },
      { label: 'Miles Davis', value: 'Miles Davis' }, { label: 'J Dilla', value: 'J Dilla' },
      { label: 'Pharrell', value: 'Pharrell' }, { label: 'Max Martin', value: 'Max Martin' },
      { label: 'Rick Rubin', value: 'Rick Rubin' }, { label: 'Timbaland', value: 'Timbaland' },
    ] },

  // ── PHASE 3: PRODUCTION MINDSET ────────────────────────────
  { id: 'q11', phase: 'production-mindset', type: 'select', weight: 8,
    text: 'What is your songwriting architecture?', description: 'How do you construct your musical frameworks? This teaches S.M.U.V.E your creative workflow.',
    field: 'musicalJourney.songwritingStyle',
    options: [
      { label: 'Lyrics First (Top-Down)', value: 'Top-Down (Lyrics First)', icon: '📝', description: 'Words drive the melody and arrangement' },
      { label: 'Beat First (Bottom-Up)', value: 'Bottom-Up (Beat First)', icon: '🥁', description: 'Production foundation inspires the song' },
      { label: 'Stream of Consciousness', value: 'Stream of Consciousness', icon: '🌊', description: 'Everything flows together in real-time' },
      { label: 'Collaborative Jamming', value: 'Collaborative Jamming', icon: '🤝', description: 'Live interaction creates the magic' },
      { label: 'Hook First (Pop)', value: 'Hook First', icon: '🎯', description: 'The earworm comes first, build around it' },
    ] },
  { id: 'q12', phase: 'production-mindset', type: 'select', weight: 7,
    text: 'What is your production philosophy?', description: 'Your core approach to sound design defines your signature.',
    field: 'musicalJourney.productionPhilosophy',
    options: [
      { label: 'Analog Warmth', value: 'Analog Warmth', icon: '🔥', description: 'Tape, tubes, and vintage character' },
      { label: 'Digital Precision', value: 'Digital Precision', icon: '💎', description: 'Clean, surgical, modern clarity' },
      { label: 'Lo-Fi Grit', value: 'Lo-Fi Grit', icon: '📼', description: 'Imperfection is the aesthetic' },
      { label: 'Experimental Hybrid', value: 'Experimental Hybrid', icon: '🧪', description: 'No rules, all textures welcome' },
      { label: 'Maximalist', value: 'Maximalist', icon: '🌟', description: 'More is more — layers upon layers' },
      { label: 'Minimalist', value: 'Minimalist', icon: '◻️', description: 'Every sound earns its place' },
    ] },
  { id: 'q13', phase: 'production-mindset', type: 'select', weight: 6,
    text: 'What is your collaborative operating mode?', description: 'How do you interact with other creative entities in your ecosystem?',
    field: 'musicalJourney.collaborativeMode',
    options: [
      { label: 'Solo Specialist', value: 'Solo Specialist', icon: '🧑‍🎤', description: 'I do it all myself' },
      { label: 'Core Duo', value: 'Core Duo', icon: '👥', description: 'One key creative partner' },
      { label: 'Small Collective', value: 'Small Collective', icon: '👨‍👩‍👧', description: 'A tight crew of creatives' },
      { label: 'Remote Outsourcing', value: 'Remote Outsourcing', icon: '🌐', description: 'I hire specialists as needed' },
      { label: 'Full Band', value: 'Full Band', icon: '🎸', description: 'Live band chemistry' },
    ] },
  { id: 'q14', phase: 'production-mindset', type: 'range', weight: 5,
    text: 'Assess your technical production mastery.', description: 'Where are you on the production skill continuum? 1 = Bedroom beginner, 10 = World-class engineer.',
    field: 'expertise.technical_mastery', min: 1, max: 10 },
  { id: 'q15', phase: 'production-mindset', type: 'multi-select', weight: 7,
    text: 'Which DAWs and tools power your workflow?', description: 'Your tech stack helps S.M.U.V.E tailor integration advice.',
    field: 'daw', maxSelections: 4,
    options: [
      { label: 'FL Studio', value: 'FL Studio' }, { label: 'Ableton Live', value: 'Ableton Live' },
      { label: 'Logic Pro', value: 'Logic Pro' }, { label: 'Pro Tools', value: 'Pro Tools' },
      { label: 'Cubase', value: 'Cubase' }, { label: 'Studio One', value: 'Studio One' },
      { label: 'Reason', value: 'Reason' }, { label: 'GarageBand', value: 'GarageBand' },
      { label: 'Bitwig', value: 'Bitwig' }, { label: 'iPad/Celtic DAW', value: 'Mobile DAW' },
    ] },
  { id: 'q16', phase: 'production-mindset', type: 'select', weight: 6,
    text: 'What equipment defines your signature sound?', description: 'Your tools become part of your sonic identity.',
    field: 'musicalJourney.signatureGear',
    options: [
      { label: 'Laptop & Headphones Only', value: 'Laptop Only', icon: '💻' },
      { label: 'MIDI Controller Focused', value: 'MIDI Focused', icon: '🎹' },
      { label: 'Hardware Synths & Samplers', value: 'Hardware Synths', icon: '🕹️' },
      { label: 'Hybrid Analog/Digital Studio', value: 'Hybrid Studio', icon: '🎛️' },
      { label: 'Full Analog / Outboard Gear', value: 'Full Analog', icon: '📻' },
      { label: 'Live Instruments Focus', value: 'Live Instruments', icon: '🎸' },
    ] },

  // ── PHASE 4: GENRE INTELLIGENCE (most questions are conditional) ─
  { id: 'q17', phase: 'genre-intelligence', type: 'select', weight: 9,
    text: 'How would you describe your current market position?', description: 'Your position determines S.M.U.V.E\'s strategic intensity.',
    field: 'musicalJourney.marketPosition',
    options: [
      { label: 'Emerging Artist', value: 'Emerging Artist', icon: '🌱', description: 'Building foundation and first audience' },
      { label: 'Local Hero', value: 'Local Hero', icon: '🏙️', description: 'Strong local/regional presence' },
      { label: 'Regional Contender', value: 'Regional Contender', icon: '🌄', description: 'Breaking beyond local boundaries' },
      { label: 'National Presence', value: 'Major Ready', icon: '🇺🇸', description: 'Known nationally with growing catalogue' },
      { label: 'Global Icon', value: 'Global Icon', icon: '🌍', description: 'Worldwide recognition and touring' },
    ] },
  { id: 'q18', phase: 'genre-intelligence', type: 'select', weight: 7,
    text: 'What is your release deployment velocity?', description: 'How often do you release? This sets your content calendar intensity.',
    field: 'musicalJourney.releaseVelocity',
    options: [
      { label: 'Waterfall (Weekly)', value: 'Waterfall (Weekly)', icon: '🌊' },
      { label: 'Cyclic (Monthly)', value: 'Cyclic (Monthly)', icon: '🔄' },
      { label: 'Strategic (Quarterly)', value: 'Strategic (Quarterly)', icon: '🎯' },
      { label: 'Rare (Yearly)', value: 'Rare (Yearly)', icon: '💎' },
    ] },
  { id: 'q19', phase: 'genre-intelligence', type: 'select', weight: 8,
    text: 'What is your primary success metric?', description: 'What defines a win for you? S.M.U.V.E optimizes toward this.',
    field: 'musicalJourney.primarySuccessMetric',
    options: [
      { label: 'Creative Satisfaction', value: 'Creative Satisfaction', icon: '🎨' },
      { label: 'Algorithmic Dominance', value: 'Algorithmic Dominance', icon: '📈' },
      { label: 'Financial Revenue', value: 'Financial Revenue', icon: '💰' },
      { label: 'Cultural Impact', value: 'Cultural Impact', icon: '🌊' },
      { label: 'Sync & Licensing', value: 'Sync & Licensing', icon: '🎬' },
      { label: 'Live Performance', value: 'Live Performance', icon: '🔥' },
    ] },
  { id: 'q20', phase: 'genre-intelligence', type: 'select', weight: 6,
    text: 'What is your content ecosystem strategy?', description: 'How do you feed the algorithms and engage your audience?',
    field: 'musicalJourney.contentStrategy',
    options: [
      { label: 'Organic Only', value: 'Organic Only', icon: '🌿' },
      { label: 'Paid Growth', value: 'Paid Growth', icon: '💵' },
      { label: 'Viral Hunt', value: 'Viral Hunt', icon: '⚡' },
      { label: 'Community First', value: 'Community First', icon: '🤝' },
      { label: 'Brand Collaborations', value: 'Brand Collaborations', icon: '🏷️' },
    ] },
  { id: 'q21', phase: 'genre-intelligence', type: 'textarea', weight: 5,
    text: 'Describe your songwriting process in your own words.', description: 'Give S.M.U.V.E a window into your creative mind. Where do ideas come from? How do you capture them?',
    field: 'musicalJourney.songwritingProcess', aiContextHint: 'The narrative style reveals creative personality.' },
  { id: 'q22', phase: 'genre-intelligence', type: 'chip-group', weight: 8,
    text: 'What production styles define your sound?', description: 'Select the techniques that are core to your identity as a creator.',
    field: 'productionStyles', maxSelections: 5,
    options: [
      { label: 'Sample-Based', value: 'Sample-Based', icon: '💿' },
      { label: 'Live Instrument Recording', value: 'Live Recording', icon: '🎙️' },
      { label: 'MIDI / Virtual Instruments', value: 'MIDI Based', icon: '🎹' },
      { label: 'Field Recordings', value: 'Field Recordings', icon: '🌲' },
      { label: 'Analog Synth Programming', value: 'Analog Synths', icon: '🕹️' },
      { label: 'Vocal Production Focus', value: 'Vocal Production', icon: '🎤' },
      { label: 'Sound Design / Foley', value: 'Sound Design', icon: '🔊' },
      { label: 'Orchestral Arrangement', value: 'Orchestral', icon: '🎻' },
      { label: 'Electronic Soundscapes', value: 'Electronic', icon: '🌌' },
      { label: 'Acoustic / Unplugged', value: 'Acoustic', icon: '🎸' },
    ] },
  { id: 'q23', phase: 'genre-intelligence', type: 'select', weight: 7,
    text: 'What is your creative catalyst?', description: 'What drives the core of your artistic output? This helps S.M.U.V.E align your AI persona.',
    field: 'musicalJourney.creativeCatalyst',
    options: [
      { label: 'Nostalgia', value: 'Nostalgia', icon: '📼' },
      { label: 'Technical Innovation', value: 'Technical Innovation', icon: '🔬' },
      { label: 'Cultural Commentary', value: 'Cultural Commentary', icon: '📢' },
      { label: 'Emotional Catharsis', value: 'Emotional Catharsis', icon: '💔' },
      { label: 'Market Dominance', value: 'Market Dominance', icon: '👑' },
      { label: 'Spiritual Expression', value: 'Spiritual', icon: '🙏' },
      { label: 'Storytelling/Narrative', value: 'Storytelling', icon: '📖' },
    ] },

  // ── PHASE 5: VISUAL BRAND ──────────────────────────────────
  { id: 'q24', phase: 'visual-brand', type: 'multi-select', weight: 8,
    text: 'Select your brand voice archetypes.', description: 'These define how you communicate with your audience. Select up to 3.',
    field: 'brandVoices', maxSelections: 3,
    options: [
      { label: '🎭 Mysterious', value: 'Mysterious' }, { label: '⚡ Aggressive', value: 'Aggressive' },
      { label: '💎 Sophisticated', value: 'Sophisticated' }, { label: '🤝 Relatable', value: 'Relatable' },
      { label: '👑 Elite', value: 'Elite' }, { label: '💔 Vulnerable', value: 'Vulnerable' },
      { label: '🔥 High-Energy', value: 'High-Energy' }, { label: '🎬 Cinematic', value: 'Cinematic' },
      { label: '🌑 Underground', value: 'Underground' }, { label: '💼 Commercial', value: 'Commercial' },
      { label: '🎨 Artistic', value: 'Artistic' }, { label: '🌿 Organic', value: 'Organic' },
    ] },
  { id: 'q25', phase: 'visual-brand', type: 'multi-select', weight: 6,
    text: 'What visual aesthetic defines your brand?', description: 'Colors, textures, and visual language that represents your sound.',
    field: 'musicalJourney.visualAesthetic', maxSelections: 3,
    options: [
      { label: 'Dark & Moody', value: 'Dark', icon: '🌑' }, { label: 'Neon Cyberpunk', value: 'Cyberpunk', icon: '🌃' },
      { label: 'Minimalist Clean', value: 'Minimalist', icon: '◻️' }, { label: 'Vintage Retro', value: 'Vintage', icon: '📺' },
      { label: 'Nature / Earthy', value: 'Nature', icon: '🌿' }, { label: 'Luxury / High-End', value: 'Luxury', icon: '💎' },
      { label: 'Bold / Colorful', value: 'Bold', icon: '🌈' }, { label: 'Monochrome', value: 'Monochrome', icon: '⬛' },
    ] },
  { id: 'q26', phase: 'visual-brand', type: 'select', weight: 5,
    text: 'Where do you want your visual brand to sit in the market?', description: 'Your visual positioning should match your sonic identity.',
    field: 'musicalJourney.marketPosition',
    options: [
      { label: 'Underground / Niche', value: 'Underground', icon: '🌑' },
      { label: 'Mainstream Accessible', value: 'Mainstream', icon: '🌟' },
      { label: 'Luxury / Premium', value: 'Premium', icon: '💎' },
      { label: 'Artistic / Avant-Garde', value: 'Artistic', icon: '🎨' },
      { label: 'Community / Grassroots', value: 'Community', icon: '🤝' },
    ] },

  // ── PHASE 6: BUSINESS INFRASTRUCTURE ───────────────────────
  { id: 'q27', phase: 'business-infra', type: 'select', weight: 9,
    text: 'What is your PRO (Performance Rights Organization) affiliation?', description: 'Essential for collecting royalties from radio, streaming, and live performances.',
    field: 'legalInfrastructure.proAffiliation',
    options: [
      { label: 'None — Need to Register', value: 'None', icon: '❌' },
      { label: 'ASCAP', value: 'ASCAP', icon: '🎵' }, { label: 'BMI', value: 'BMI', icon: '🎵' },
      { label: 'SESAC', value: 'SESAC', icon: '🎵' }, { label: 'PRS', value: 'PRS', icon: '🇬🇧' },
      { label: 'SOCAN', value: 'SOCAN', icon: '🇨🇦' }, { label: 'GEMA', value: 'GEMA', icon: '🇩🇪' },
      { label: 'Other', value: 'Other', icon: '🌐' },
    ] },
  { id: 'q28', phase: 'business-infra', type: 'select', weight: 7,
    text: 'Have you registered your works with the Copyright Office?', description: 'Copyright registration is your legal armor. Essential for infringement protection.',
    field: 'legalInfrastructure.hasRegisteredWorks',
    options: [
      { label: 'No — Not Yet', value: 'No', icon: '❌' },
      { label: 'Some — In Progress', value: 'Partial', icon: '🔄' },
      { label: 'Yes — All Works Registered', value: 'Yes', icon: '✅' },
    ] },
  { id: 'q29', phase: 'business-infra', type: 'select', weight: 6,
    text: 'What is your touring readiness level?', description: 'Is your live show ready for deployment? This calibrates your touring strategy.',
    field: 'touringDetails.isTourReady',
    options: [
      { label: 'Studio Only', value: 'Studio Only', icon: '🎧' },
      { label: 'Local Gigs', value: 'Local Gigs', icon: '🏠' },
      { label: 'Regional Ready', value: 'Regional Ready', icon: '🚐' },
      { label: 'Global Ready', value: 'Global Ready', icon: '✈️' },
    ] },
  { id: 'q30', phase: 'business-infra', type: 'select', weight: 7,
    text: 'What is your sync licensing readiness?', description: 'Is your catalog prepared for film, TV, and game licensing?',
    field: 'syncDetails.isSyncReady',
    options: [
      { label: 'Not Started', value: 'Not Started', icon: '❌' },
      { label: 'Basics Ready', value: 'Basics Ready', icon: '📋' },
      { label: 'Full Stem Mastery', value: 'Full Stem Mastery', icon: '🎛️' },
      { label: 'One-Stop Qualified', value: 'One-Stop Qualified', icon: '✅' },
    ] },
  { id: 'q31', phase: 'business-infra', type: 'toggle', weight: 5,
    text: 'Do you have an official artist website?', description: 'A central hub for your identity, press kit, and direct fan connection.',
    field: 'website', placeholder: 'https://yourwebsite.com' },
  { id: 'q32', phase: 'business-infra', type: 'chip-group', weight: 6,
    text: 'What are your top strategic goals for the next 12 months?', description: 'Select up to 3 priorities. S.M.U.V.E will optimize your workspace around these.',
    field: 'strategicGoals', maxSelections: 3,
    options: [
      { label: 'Release Debut Album', value: 'Debut Album', icon: '💿' },
      { label: 'Grow Streaming Numbers', value: 'Streaming Growth', icon: '📈' },
      { label: 'Build Social Following', value: 'Social Growth', icon: '📱' },
      { label: 'Land Sync Placements', value: 'Sync Deals', icon: '🎬' },
      { label: 'Tour / Play Live Shows', value: 'Touring', icon: '🎸' },
      { label: 'Build Email List', value: 'Email List', icon: '📧' },
      { label: 'Get Press Coverage', value: 'Press', icon: '📰' },
      { label: 'Start a Label', value: 'Start Label', icon: '🏢' },
      { label: 'Collaborate with Artists', value: 'Collabs', icon: '🤝' },
      { label: 'Merchandise Launch', value: 'Merch', icon: '👕' },
    ] },
  { id: 'q33', phase: 'business-infra', type: 'select', weight: 5,
    text: 'Do you have a standard split sheet agreement?', description: 'Essential for clear collaboration terms and royalty splits.',
    field: 'legalInfrastructure.hasStandardSplitSheet',
    options: [
      { label: 'Never Used One', value: 'Never', icon: '❌' },
      { label: 'Sometimes', value: 'Sometimes', icon: '🔄' },
      { label: 'Always', value: 'Always', icon: '✅' },
    ] },

  // ── PHASE 7: AI ALIGNMENT ──────────────────────────────────
  { id: 'q34', phase: 'ai-alignment', type: 'select', weight: 7,
    text: 'Choose your S.M.U.V.E AI persona.', description: 'This sets the tone for all AI interactions across the platform.',
    field: 'settings.ai.commanderPersona',
    options: [
      { label: 'Encouraging Mentor', value: 'Encouraging Mentor', icon: '🧑‍🏫', description: 'Supportive, educational, growth-focused' },
      { label: 'Aggressive Manager', value: 'Aggressive Manager', icon: '👔', description: 'Blunt, high-stakes, demands excellence' },
      { label: 'Elite Commander', value: 'Elite', icon: '👑', description: 'Professional, calculated, strategic precision' },
    ] },
  { id: 'q35', phase: 'ai-alignment', type: 'toggle', weight: 5,
    text: 'Allow S.M.U.V.E to use strategic profanity?', description: 'Some artists respond better to unfiltered truth. This enables aggressive industry slang in critiques.',
    field: 'settings.ai.aiProfanityEnabled' },
  { id: 'q36', phase: 'ai-alignment', type: 'toggle', weight: 6,
    text: 'Enable AI Persona Intensity?', description: 'When enabled, S.M.U.V.E operates at maximum intensity — no holding back.',
    field: 'settings.ai.aiPersonaIntensityEnabled' },
  { id: 'q37', phase: 'ai-alignment', type: 'select', weight: 6,
    text: 'Select your AI conversational tier.', description: 'Determines the depth and sophistication of AI analysis and recommendations.',
    field: 'settings.ai.aiConversationalTier',
    options: [
      { label: 'Standard', value: 'Standard', icon: '📊' },
      { label: 'Elite', value: 'Elite', icon: '💎' },
      { label: 'SUPREME', value: 'SUPREME', icon: '👑' },
    ] },
  { id: 'q38', phase: 'ai-alignment', type: 'toggle', weight: 7,
    text: 'Enable automatic AI audit of your works?', description: 'S.M.U.V.E will automatically analyze your tracks for mix quality, arrangement, and market potential.',
    field: 'settings.ai.autoAuditEnabled' },
  { id: 'q39', phase: 'ai-alignment', type: 'toggle', weight: 5,
    text: 'Enable AI mimicry for creative inspiration?', description: 'S.M.U.V.E can analyze your style and generate ideas that match your creative voice.',
    field: 'settings.ai.aiMimicEnabled' },

  // ── PHASE 8: PLATFORM STRATEGY ─────────────────────────────
  { id: 'q40', phase: 'platform-strategy', type: 'chip-group', weight: 8,
    text: 'Which platforms are central to your distribution strategy?', description: 'Select all platforms you actively use. S.M.U.V.E will optimize your presence.',
    field: 'services', maxSelections: 6,
    options: [
      { label: 'Spotify', value: 'Spotify', icon: '🟢' }, { label: 'Apple Music', value: 'Apple Music', icon: '🍎' },
      { label: 'YouTube', value: 'YouTube', icon: '▶️' }, { label: 'SoundCloud', value: 'SoundCloud', icon: '☁️' },
      { label: 'TikTok', value: 'TikTok', icon: '🎵' }, { label: 'Instagram', value: 'Instagram', icon: '📸' },
      { label: 'Bandcamp', value: 'Bandcamp', icon: '🏕️' }, { label: 'Beatport', value: 'Beatport', icon: '🎧' },
      { label: 'Tidal', value: 'Tidal', icon: '🌊' }, { label: 'Amazon Music', value: 'Amazon Music', icon: '📦' },
    ] },
  { id: 'q41', phase: 'platform-strategy', type: 'chip-group', weight: 7,
    text: 'What equipment do you currently own or use?', description: 'Select your available gear. S.M.U.V.E will recommend studio upgrades.',
    field: 'equipment', maxSelections: 6,
    options: [
      { label: 'Studio Headphones', value: 'Headphones', icon: '🎧' },
      { label: 'Studio Monitors', value: 'Monitors', icon: '🔊' },
      { label: 'Audio Interface', value: 'Audio Interface', icon: '🎛️' },
      { label: 'MIDI Keyboard', value: 'MIDI Keyboard', icon: '🎹' },
      { label: 'Microphone (Condenser)', value: 'Condenser Mic', icon: '🎙️' },
      { label: 'Microphone (Dynamic)', value: 'Dynamic Mic', icon: '🎤' },
      { label: 'Hardware Synth', value: 'Hardware Synth', icon: '🕹️' },
      { label: 'Drum Machine', value: 'Drum Machine', icon: '🥁' },
      { label: 'Electric Guitar', value: 'Electric Guitar', icon: '🎸' },
      { label: 'Bass Guitar', value: 'Bass Guitar', icon: '🎸' },
      { label: 'Acoustic Guitar', value: 'Acoustic Guitar', icon: '🪕' },
    ] },
  { id: 'q42', phase: 'platform-strategy', type: 'textarea', weight: 6,
    text: 'What is your ultimate artistic vision?', description: 'Describe your 5-year vision. Where do you want your music to take you? S.M.U.V.E will build a strategic roadmap.',
    field: 'musicalJourney.ultimateVision', aiContextHint: 'This narrative drives long-term strategic planning.' },
  { id: 'q43', phase: 'platform-strategy', type: 'chip-group', weight: 5,
    text: 'What skills do you want to develop next?', description: 'Select areas where you want S.M.U.V.E to prioritize learning resources.',
    field: 'skills', maxSelections: 4,
    options: [
      { label: 'Mixing & Mastering', value: 'Mixing', icon: '🎛️' },
      { label: 'Sound Design', value: 'Sound Design', icon: '🔊' },
      { label: 'Songwriting', value: 'Songwriting', icon: '✍️' },
      { label: 'Music Theory', value: 'Music Theory', icon: '🎵' },
      { label: 'Marketing / Promotion', value: 'Marketing', icon: '📣' },
      { label: 'Music Business', value: 'Business', icon: '💼' },
      { label: 'Vocal Technique', value: 'Vocals', icon: '🎤' },
      { label: 'Production', value: 'Production', icon: '🎹' },
      { label: 'Live Performance', value: 'Performance', icon: '🔥' },
      { label: 'Video Production', value: 'Video', icon: '🎬' },
    ] },
  { id: 'q44', phase: 'platform-strategy', type: 'toggle', weight: 4,
    text: 'Would you like S.M.U.V.E to auto-generate a press kit from your profile?', description: 'A professional EPK (Electronic Press Kit) helps you book shows and get press coverage.',
    field: 'musicalJourney.autoGenerateEpk' },
];

/* ── Enhanced Questionnaire Engine ────────────────────────────── */

@Injectable({ providedIn: 'root' })
export class EnhancedArtistQuestionnaireEngine {
  private userProfileService = inject(UserProfileService);
  private aiService = inject(AiService);

  /** All 45+ questions */
  readonly allQuestions = ALL_QUESTIONS;

  /** Get filtered questions for a given phase */
  questionsForPhase(phase: QuestionnairePhase, profile: UserProfile): QuestionnaireQuestion[] {
    return ALL_QUESTIONS.filter(q => q.phase === phase && (!q.condition || q.condition(profile)));
  }

  /** Compute subgenre options based on genre */
  getSubgenreOptions(genre: string): QuestionOption[] {
    const dive = getGenreDeepDive(genre);
    return dive.subgenres.map(sg => ({ label: sg, value: sg, icon: '🎵' }));
  }

  /** Calculate profile strength breakdown */
  calculateStrength(profile: UserProfile): ProfileStrengthBreakdown {
    const breakdown: ProfileStrengthBreakdown = {
      identityClarity: this.calcCategory(profile, 'identity'),
      musicalDepth: this.calcCategory(profile, 'musical-dna'),
      technicalAbility: this.calcCategory(profile, 'production-mindset'),
      businessReadiness: this.calcCategory(profile, 'business-infra'),
      brandDefinition: this.calcCategory(profile, 'visual-brand'),
      aiIntegration: this.calcCategory(profile, 'ai-alignment'),
      overall: 0,
    };
    breakdown.overall = Math.round(
      (breakdown.identityClarity + breakdown.musicalDepth + breakdown.technicalAbility +
       breakdown.businessReadiness + breakdown.brandDefinition + breakdown.aiIntegration) / 6
    );
    return breakdown;
  }

  private calcCategory(profile: UserProfile, phase: QuestionnairePhase): number {
    const phaseQs = ALL_QUESTIONS.filter(q => q.phase === phase && (!q.condition || q.condition(profile)));
    if (phaseQs.length === 0) return 0;
    let totalScore = 0;
    let totalWeight = 0;

    for (const q of phaseQs) {
      const value = this.getDeepField(profile, q.field);
      if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        const w = q.weight || 5;
        totalScore += w * 10;
        totalWeight += w;
      } else {
        totalWeight += q.weight || 5;
      }
    }

    return totalWeight > 0 ? Math.round((totalScore / (totalWeight * 10)) * 100) : 0;
  }

  /** Generate AI persona synthesis from profile */
  async synthesizePersona(profile: UserProfile): Promise<PersonaSynthesis> {
    const journey = profile.musicalJourney || {} as any;
    const genre = profile.primaryGenre || 'Electronic';
    const dive = getGenreDeepDive(genre);
    const roles = journey.roles || [];

    const archetype = this.detectArchetype(profile);
    const tone = this.detectSignatureTone(profile);
    const strategy = this.detectStrategy(profile);

    return {
      archetype,
      signatureTone: tone,
      sonicSignature: `${genre} with ${journey.productionPhilosophy || 'hybrid'} production, driven by ${journey.creativeCatalyst || 'creative passion'}`,
      marketPosition: journey.marketPosition || 'Emerging',
      aiPersonaProfile: `S.M.U.V.E recognizes you as: ${archetype}. ${tone}. Your journey: ${journey.originStory || 'self-discovery'}. ${strategy}`,
      recommendedStrategy: strategy,
      suggestedGenres: dive.subgenres.slice(0, 3),
      productionAphorism: this.generateAphorism(profile, dive),
    };
  }

  /** Generate AI response for a single question */
  generateAIQuestionResponse(question: QuestionnaireQuestion, answer: any): AIQuestionResponse {
    const valStr = String(answer ?? 'unspecified');
    const phaseColors: Record<string, string> = {
      identity: 'ARTIST_IDENTITY',
      'musical-dna': 'MUSICAL_DNA',
      'production-mindset': 'PRODUCTION_PROTOCOL',
      'genre-intelligence': 'MARKET_INTELLIGENCE',
      'visual-brand': 'BRAND_CALIBRATION',
      'business-infra': 'BUSINESS_VECTOR',
      'ai-alignment': 'AI_SYNC',
      'platform-strategy': 'PLATFORM_STRATEGY',
    };

    const phaseTag = phaseColors[question.phase] || 'NEURAL_SCAN';
    const observation = `>> ${phaseTag}: ${valStr.toUpperCase()} — SIGNAL_REGISTERED`;
    const adaptation = question.aiContextHint
      ? `S.M.U.V.E_ADAPTATION: ${question.aiContextHint}`
      : `NEURAL_PATHWAY_ESTABLISHED_FOR_${question.field.toUpperCase()}`;

    return {
      observation,
      adaptation,
      confidence: Math.round(70 + Math.random() * 25),
    };
  }

  /** Generate a comprehensive AI analysis after questionnaire completion */
  async generateAIAnalysis(profile: UserProfile): Promise<{
    persona: PersonaSynthesis;
    breakdown: ProfileStrengthBreakdown;
    recommendations: any[];
    insights: any[];
  }> {
    const persona = await this.synthesizePersona(profile);
    const breakdown = this.calculateStrength(profile);
    const insights = await this.aiService.getQuestionnaireInsights(profile);

    const recommendations = [
      ...this.generateProfileRecommendations(profile, breakdown),
      ...(insights || []),
    ];

    return { persona, breakdown, recommendations, insights: insights || [] };
  }

  /* ── Private helpers ──────────────────────────── */

  private getDeepField(obj: any, field: string): any {
    const parts = field.split('.');
    let current = obj;
    for (const part of parts) {
      if (!current || part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
      current = current[part];
    }
    return current;
  }

  private detectArchetype(profile: UserProfile): string {
    const journey = profile.musicalJourney || {} as any;
    const roles = journey.roles || [];
    const catalyst = journey.creativeCatalyst || '';

    if (catalyst.includes('Technical') || journey.productionPhilosophy === 'Digital Precision')
      return 'The Architect — precision-driven, technically focused creator';
    if (catalyst.includes('Emotional') || roles.includes('vocalist'))
      return 'The Storyteller — narrative and emotion-driven artist';
    if (catalyst.includes('Cultural') || journey.originStory === 'community')
      return 'The Voice — community and culturally conscious creator';
    if (catalyst.includes('Market') || journey.primarySuccessMetric === 'Algorithmic Dominance')
      return 'The Strategist — market-optimized, data-driven artist';
    if (journey.productionPhilosophy === 'Lo-Fi Grit' || journey.productionPhilosophy === 'Experimental Hybrid')
      return 'The Alchemist — experimental, boundary-pushing sound explorer';
    if (roles.includes('producer') && roles.includes('engineer'))
      return 'The Producer-Engineer — full-stack music creator';
    return 'The Independent Artist — self-sufficient, authentic creative force';
  }

  private detectSignatureTone(profile: UserProfile): string {
    const voices = profile.brandVoices || [];
    if (voices.includes('Elite')) return 'You communicate with calculated precision and authority.';
    if (voices.includes('Aggressive')) return 'Your tone is confrontational and demands attention.';
    if (voices.includes('Vulnerable')) return 'Your strength lies in authentic emotional exposure.';
    if (voices.includes('Sophisticated')) return 'You speak with refined elegance and depth.';
    if (voices.includes('High-Energy')) return 'Your energy is infectious and commanding.';
    if (voices.includes('Mysterious')) return 'Intrigue is your currency — you reveal selectively.';
    if (voices.includes('Relatable')) return 'Your audience sees themselves in you.';
    return 'Your authentic voice is your signature.';
  }

  private detectStrategy(profile: UserProfile): string {
    const goals = profile.strategicGoals || [];
    const velocity = (profile.musicalJourney as any)?.releaseVelocity || '';
    if (goals.includes('Streaming Growth') && goals.includes('Social Growth'))
      return 'Priority: Build digital presence with daily content and streaming optimization.';
    if (goals.includes('Debut Album')) return 'Priority: Album campaign with singles rollout and press strategy.';
    if (goals.includes('Sync Deals')) return 'Priority: Stem preparation and sync catalog packaging.';
    if (goals.includes('Touring')) return 'Priority: Live show development and routing.';
    if (velocity === 'Waterfall (Weekly)') return 'Priority: High-velocity release schedule with automated marketing.';
    return 'Priority: Establish foundational identity before scaling.';
  }

  private generateAphorism(profile: UserProfile, dive: GenreDeepDive): string {
    const aphorisms = [
      `In ${profile.primaryGenre}, ${dive.audienceExpectations[0]?.toLowerCase() || 'authenticity'} is your currency. Spend it wisely.`,
      `Your ${dive.sonicSignatures[0]?.toLowerCase() || 'unique sound'} is the fingerprint only you can leave.`,
      `The ${dive.productionEssentials[0]?.toLowerCase() || 'craft'} separates artists from producers. Master it.`,
      `${dive.competitiveLandscape.split('.')[0]}. Your edge is your story.`,
      `Every great ${profile.primaryGenre} track begins with ${dive.productionEssentials[0]?.toLowerCase() || 'an idea'}.`,
    ];
    return aphorisms[Math.floor(Math.random() * aphorisms.length)];
  }

  private generateProfileRecommendations(profile: UserProfile, breakdown: ProfileStrengthBreakdown): any[] {
    const recs: any[] = [];
    if (breakdown.identityClarity < 50) recs.push({ title: 'Strengthen Artist Identity', content: 'Your identity signals are incomplete. Complete the identity phase to unlock full AI calibration.', impact: 'High' });
    if (breakdown.businessReadiness < 40) recs.push({ title: 'Build Business Foundation', content: 'Register with a PRO and copyright your works. This is essential for revenue collection.', impact: 'Critical' });
    if (breakdown.brandDefinition < 50) recs.push({ title: 'Define Visual Brand', content: 'A defined brand voice and aesthetic increase fan connection by 60%.', impact: 'High' });
    if (breakdown.aiIntegration < 50) recs.push({ title: 'Deepen AI Integration', content: 'Enable AI features to unlock predictive analytics and automated workflows.', impact: 'Medium' });
    if (breakdown.overall > 80) recs.push({ title: 'Elite Profile Status', content: 'Your profile is elite-level. S.M.U.V.E will prioritize advanced strategies.', impact: 'Extreme' });
    return recs;
  }
}
