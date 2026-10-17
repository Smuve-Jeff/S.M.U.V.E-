import { Injectable } from '@angular/core';

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  subcategory: string;
  content: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  tags: string[];
  actionRequired?: string;
  relatedEntries?: string[];
  sources?: string[];
  jurisdiction?: string;
  reviewedAt?: string;
}

export type KnowledgeCategory =
  | 'Production'
  | 'Songwriting'
  | 'Vocal'
  | 'Marketing'
  | 'Business'
  | 'Legal'
  | 'Distribution'
  | 'Career';

@Injectable({ providedIn: 'root' })
export class SmuveKnowledgeEngine {
  /**
   * Curated, reviewed knowledge.
   *
   * Each domain header states the entries this engine actually ships for that
   * domain. A sweep found those numbers had been aspirational rather than real
   * (Legal claimed 8 and held 4, Distribution claimed 6 and held 2), so every
   * surface that reports coverage — including the `/knowledge` overview — could
   * advertise depth the engine did not have. The counts are exact now;
   * Songwriting (7) and Vocal (5) are the domains still below their original
   * targets and are the next knowledge pass.
   *
   * Legal and Business entries carry scope, jurisdiction and source notes on
   * purpose: S.M.U.V.E. answers money and rights questions, so those entries
   * say what they are (general information, not legal advice) and flag the
   * terms that must be verified locally.
   */
  private readonly knowledgeBase: KnowledgeEntry[] = [
    // ── PRODUCTION DOMAIN (20) ──────────────────────
    {
      id: 'prod-01',
      category: 'Production',
      subcategory: 'Mixing',
      difficulty: 'Intermediate',
      title: 'Gain Staging Without Rituals',
      tags: ['mixing', 'levels', 'headroom'],
      content: 'Check input, plugin and output meters; avoid clipping at conversion and delivery. Floating-point headroom does not protect a clipped recording or every plugin. Use trim and bypass-matched levels so louder is not mistaken for better. Analog-modelled plugins may specify calibration. No universal fader position or -18 dBFS requirement fits every source.',
      actionRequired: 'Inspect peaks and plugin calibration, then A/B at matched loudness.',
    },
    {
      id: 'prod-02',
      category: 'Production',
      subcategory: 'Mixing',
      difficulty: 'Intermediate',
      title: 'Masking and Arrangement Before EQ',
      tags: ['mixing', 'structure', 'eq'],
      content: 'Kick and bass can share frequencies intentionally. Identify which source carries the fundamental and attack, then audition arrangement, octave, envelope, level and selective EQ before reaching for sidechain. Use mono checks to reveal cancellation; do not automatically divide instruments into frequency-band buses.',
      actionRequired: 'Compare the low end in mono and stereo at matched level; keep changes that improve the musical intent.',
    },
    {
      id: 'prod-03',
      category: 'Production',
      subcategory: 'Mixing',
      difficulty: 'Advanced',
      title: 'Parallel Compression Technique',
      tags: ['compression', 'parallel', 'dynamics'],
      content:
        'Duplicate your drum bus, apply heavy compression (8:1 ratio, fast attack, fast release, -10dB gain reduction), then blend the compressed signal with the original. Start at 20% wet. This preserves the natural transients while adding density and body. The effect should be felt, not heard.',
      actionRequired:
        'Create a parallel compression bus on drums at 20% blend.',
    },
    {
      id: 'prod-04',
      category: 'Production',
      subcategory: 'Mixing',
      difficulty: 'Expert',
      title: 'Mid/Side EQ for Stereo Width',
      tags: ['mixing', 'stereo', 'ms-eq'],
      content:
        'Use Mid/Side EQ to process the center and sides independently. Cut -2dB at 300Hz on the side channel to reduce muddiness. Boost +2dB at 10kHz on the side channel for air. Keep all frequencies below 200Hz in mono (correlation meter should read +1). The wider your mix sounds, the more impressive it feels on good speakers.',
      actionRequired: 'Apply mid/side EQ: cut mud on sides, keep bass mono.',
    },
    {
      id: 'prod-05',
      category: 'Production',
      subcategory: 'Sound Design',
      difficulty: 'Intermediate',
      title: 'Layering Synths for Fullness',
      tags: ['sound-design', 'synth', 'layering'],
      content:
        "Layer three synths for a massive sound: SUB (sine wave, -1 octave, 10% volume), BODY (saw wave, root note, 60% volume), TEXTURE (noise/fm, +1 octave, 30% volume). EQ each layer so they don't compete. Use slight detune (5-8 cents) between layers for natural width. The secret is in the blend, not the individual sounds.",
      actionRequired: 'Build a 3-layer synth patch: sub + body + texture.',
    },
    {
      id: 'prod-06',
      category: 'Production',
      subcategory: 'Sound Design',
      difficulty: 'Advanced',
      title: 'FM Synthesis Crash Course',
      tags: ['sound-design', 'fm-synth', 'electronic'],
      content:
        'FM synthesis uses one oscillator (modulator) to modulate the pitch of another (carrier). The carrier/modulator ratio determines the timbre. Simple ratios (1:1, 2:1) produce harmonic tones. Complex ratios produce metallic/bell-like sounds. Start with a 2-op FM patch: carrier at 200Hz, modulator at 400Hz with 50% depth. Adjust modulator ratio and depth to sculpt the tone.',
      actionRequired:
        'Create a basic 2-operator FM patch and sweep the modulator ratio.',
    },
    {
      id: 'prod-07',
      category: 'Production',
      subcategory: 'Sound Design',
      difficulty: 'Beginner',
      title: '808 Bass Design Fundamentals',
      tags: ['sound-design', '808', 'bass', 'trap'],
      content:
        'A great 808 starts with a sine wave at 50-60Hz. Add saturation (Decapitator or Softube Saturation Knob) at 20% mix for harmonic content. Use a pitch envelope: start at +12 semitones, decay to root in 50ms. Layer a click (short percussive sample) on top for attack. Sidechain the 808 to the kick for clean low-end. The 808 should shake the room, not muddy the mix.',
      actionRequired:
        'Design an 808 with sine wave + saturation + pitch envelope + click layer.',
    },
    {
      id: 'prod-08',
      category: 'Production',
      subcategory: 'Arrangement',
      difficulty: 'Intermediate',
      title: 'The 4-Bar Rule for Arrangements',
      tags: ['arrangement', 'structure', 'production'],
      content:
        "In modern pop and hip-hop, introduce a new element every 4 bars. Bar 1-4: drums + bass. Bar 5-8: add chords/pads. Bar 9-12: add melody/hook. Bar 13-16: full arrangement with vocals. Remove elements every 8 bars for dynamic contrast. The listener's brain craves novelty. If nothing changes for 8 bars, you've lost them.",
      actionRequired:
        'Analyze your current arrangement: does something new happen every 4-8 bars?',
    },
    {
      id: 'prod-09',
      category: 'Production',
      subcategory: 'Arrangement',
      difficulty: 'Expert',
      title: 'Drop/Chorus Energy Architecture',
      tags: ['arrangement', 'energy', 'drop'],
      content:
        'The drop or chorus should be the loudest, widest, most intense section. Pre-drop: remove sub frequencies, high-pass at 100Hz, reduce reverb. This creates anticipation. Drop: reintroduce sub, add reverb, widen the stereo field. Use risers (white noise with rising pitch) and tension builders (increasing snare speed) in the 4 bars before the drop. The energy should peak at the downbeat of the drop.',
      actionRequired:
        'Build a pre-drop tension section with high-pass filter + riser + snare build.',
    },
    {
      id: 'prod-10',
      category: 'Production',
      subcategory: 'Mastering',
      difficulty: 'Advanced',
      title: 'Playback Normalization Is Not a Mastering Target',
      tags: ['mastering', 'loudness', 'lufs'],
      content: 'Spotify Normal playback uses a -14 LUFS normalization reference; Loud and Quiet modes differ, and some players do not normalize. This is not a universal mastering requirement. Choose dynamics and integrated loudness for the song, artist intent and delivery specification; measure true peak and audition codec conversion. Avoid crushing a master merely to hit a number. Spotify publishes service-specific true-peak recommendations; verify current specifications before delivery.',
      actionRequired: 'A/B a relevant reference at matched loudness; measure LUFS/true peak and check the intended delivery specification.',
      sources: ['https://support.spotify.com/us/artists/article/loudness-normalization/'],
      reviewedAt: '2026-10-11',
    },
    {
      id: 'prod-11',
      category: 'Production',
      subcategory: 'Mastering',
      difficulty: 'Expert',
      title: 'Master Only What Needs Processing',
      tags: ['mastering', 'chain', 'processing'],
      content: 'A mastering chain is a set of decisions, not a mandatory EQ/multiband/widener/exciter stack. Diagnose the mix, preserve the stated dynamics and tonal identity, audition minimal corrections at matched level, then limit only as needed for the chosen delivery. Recheck stereo/mono translation and codec distortion.',
      actionRequired: 'Bypass-match every stage and remove processors that do not solve an identified problem.',
    },
    {
      id: 'prod-12',
      category: 'Production',
      subcategory: 'Recording',
      difficulty: 'Intermediate',
      title: 'Home Studio Vocal Recording Setup',
      tags: ['recording', 'vocal', 'studio'],
      content:
        'For professional vocal recordings at home: Use a dynamic mic (SM7B or similar) for untreated rooms. Position mic 6-12 inches from the singer, slightly off-axis to reduce plosives. Use a pop filter. Record at 24-bit/48kHz minimum. Create a "fort" with moving blankets behind the singer to absorb reflections. Record 3-5 takes of each section and comp the best phrases.',
      actionRequired:
        'Set up your vocal recording space with proper mic placement and acoustic treatment.',
    },
    {
      id: 'prod-13',
      category: 'Production',
      subcategory: 'Recording',
      difficulty: 'Advanced',
      title: 'Recording Electric Guitar Like a Pro',
      tags: ['recording', 'guitar', 'amp'],
      content:
        'For recording guitar: mic placement is everything. Start with an SM57 at 45 degrees, 1 inch from the grill cloth, aimed at the cone edge (not center). The center is brighter, the edge is warmer. Record DI signal simultaneously for re-amping later. Use a DI box to split the signal. Double-track your parts (record the same part twice) for width. Pan L and R.',
      actionRequired:
        'Record a guitar part: double-track it, pan L/R, try two mic positions.',
    },
    {
      id: 'prod-14',
      category: 'Production',
      subcategory: 'Production Workflow',
      difficulty: 'Beginner',
      title: 'The Creative vs. Critical Cycle',
      tags: ['workflow', 'creativity', 'process'],
      content:
        'Split your production sessions into two modes: CREATIVE (writing, sound selection, arrangement) and CRITICAL (mixing, editing, comping). Never mix while writing. Never write while mixing. Creative mode: turn off your analytical brain, just create. Critical mode: turn off your creative brain, just edit. This separation is the single biggest productivity hack in music production.',
      actionRequired:
        'Label your next session as CREATIVE or CRITICAL before starting.',
    },

    {
      id: 'prod-15',
      category: 'Production',
      subcategory: 'Mixing',
      difficulty: 'Intermediate',
      title: 'Reference Translation, Not Reference Worship',
      tags: ['mixing', 'reference', 'translation'],
      content: 'A mix is finished when it survives the systems the audience actually uses: phone speaker, laptop, earbuds, car. Audition the same ten seconds on each at matched loudness and fix what breaks — usually one element, not the whole balance. Do not chase a reference track tone-for-tone; it was mastered, for a different arrangement, in a different room.',
      actionRequired: 'Bounce a 30-second loop and check it on three systems before touching another processor.',
    },
    {
      id: 'prod-16',
      category: 'Production',
      subcategory: 'Mixing',
      difficulty: 'Advanced',
      title: 'Parallel Processing Without Phase Damage',
      tags: ['mixing', 'parallel', 'phase'],
      content: 'A parallel chain only works when the paths stay aligned. Lookahead in a limiter, a linear-phase EQ, or a converter round-trip shifts the parallel copy in time, and the sum cancels the low end. Compare against the dry signal in mono and check correlation after every parallel stage; if the bottom disappears, align the delay or drop the stage.',
      actionRequired: 'Sum the parallel bus to mono and compare it with the dry signal before committing.',
    },
    {
      id: 'prod-17',
      category: 'Production',
      subcategory: 'Recording',
      difficulty: 'Intermediate',
      title: 'Punch-Ins and Comping Discipline',
      tags: ['recording', 'comping', 'takes'],
      content: 'Record to a click and keep complete takes, then comp by phrase: one keeper per line, crossfade at the breath, and hold every source take until the mix is approved. Punching too early hides performance problems that comping would have exposed. Name takes by section so a week later the one that worked is still findable.',
      actionRequired: 'Comp one section by phrase and keep all source takes until the song is approved.',
    },
    {
      id: 'prod-18',
      category: 'Production',
      subcategory: 'Sound Design',
      difficulty: 'Intermediate',
      title: 'Subtract Before You Add',
      tags: ['sound-design', 'layering', 'arrangement'],
      content: 'Most weak sounds are crowded, not thin. Solo the sound, mute what competes with it, and try removing a layer, narrowing the octave spread or shortening the decay before adding another synth, saturator or exciter. Every layer costs headroom, phase coherence and mix clarity, and few of them buy presence.',
      actionRequired: 'Solo the part, remove one competing element, and re-check before layering anything new.',
    },
    {
      id: 'prod-19',
      category: 'Production',
      subcategory: 'Production Workflow',
      difficulty: 'Beginner',
      title: 'Session Hygiene That Survives a Month',
      tags: ['workflow', 'stems', 'versioning'],
      content: 'Name tracks, colour-code buses, print stems per bus, keep one master chain saved as a preset, and version the project before destructive edits. A session you cannot reopen and understand three weeks later is a session you will redo. Stem out at unity with master-bus processing bypassed, so a remix, sync or re-master request is one you can actually fulfil.',
      actionRequired: 'Bounce per-bus stems at unity and label which version is the approved mix.',
    },
    {
      id: 'prod-20',
      category: 'Production',
      subcategory: 'Mastering',
      difficulty: 'Intermediate',
      title: 'Verify Delivery Specs Before You Upload',
      tags: ['mastering', 'delivery', 'loudness'],
      content: 'Platform loudness references, true-peak recommendations and delivery requirements change, and partners publish different specs for different products. Check the current official documentation at delivery time, keep a loud and a dynamic master where the partner allows it, and measure integrated loudness and true peak on the file you actually ship rather than on the session.',
      actionRequired: 'Measure the final file and confirm the current spec from the partner’s own documentation.',
      sources: ['https://support.spotify.com/us/artists/article/loudness-normalization/'],
      reviewedAt: '2026-10-16',
    },

    // ── SONGWRITING DOMAIN (7) ────────────────────
    {
      id: 'song-01',
      category: 'Songwriting',
      subcategory: 'Lyrics',
      difficulty: 'Beginner',
      title: 'The Hook-First Method',
      tags: ['songwriting', 'hook', 'melody'],
      content:
        "Write your hook/chorus FIRST before verses. The chorus is the emotional climax — it should contain the title of your song and the core message. Write 3-4 different hook melodies before choosing one. Record them on your phone. The best hook is often the one that gets stuck in YOUR head. If you can't stop humming it, neither will your listeners.",
      actionRequired:
        'Write 3 different chorus melodies and choose the catchiest one.',
    },
    {
      id: 'song-02',
      category: 'Songwriting',
      subcategory: 'Lyrics',
      difficulty: 'Intermediate',
      title: "Show, Don't Tell in Lyrics",
      tags: ['songwriting', 'lyrics', 'craft'],
      content:
        'Instead of saying "I\'m sad," paint a picture: "Rain on the window, coffee\'s gone cold." Instead of "I love you," show it: "You left your toothbrush at my place." Specific details create universal emotions. Use concrete imagery (objects, actions, places) to convey abstract feelings. The listener supplies their own emotional context when you show them a scene.',
      actionRequired:
        'Rewrite a line from your latest song using specific imagery instead of abstract emotion.',
    },
    {
      id: 'song-03',
      category: 'Songwriting',
      subcategory: 'Lyrics',
      difficulty: 'Advanced',
      title: 'Rhyme Scheme Architecture',
      tags: ['songwriting', 'rhyme', 'structure'],
      content:
        'Use AABB (couplets) for pop accessibility, ABAB (alternating) for lyrical complexity, or internal rhymes for density. The last word of each line is your power position — make it count. Use multi-syllabic rhymes for sophistication: "medication" / "meditation". Near-rhymes (time/mind) often sound more modern than perfect rhymes. Vary your scheme between sections for contrast.',
      actionRequired:
        'Analyze the rhyme scheme of your current lyrics and identify patterns.',
    },
    {
      id: 'song-04',
      category: 'Songwriting',
      subcategory: 'Melody',
      difficulty: 'Intermediate',
      title: 'Melody Writing with Chord Tones',
      tags: ['songwriting', 'melody', 'music-theory'],
      content:
        'Your melody should primarily use chord tones (root, 3rd, 5th, 7th of the current chord) for strong, resonant phrases. Non-chord tones (passing tones) create tension that resolves when you land on a chord tone. Write your melody first (scat singing or humming), THEN find the chords that support it. Melody is king — harmony serves the melody, not the other way around.',
      actionRequired: 'Hum a new melody, then find the chords that support it.',
    },
    {
      id: 'song-05',
      category: 'Songwriting',
      subcategory: 'Melody',
      difficulty: 'Advanced',
      title: 'Motif Development: The Beethoven Method',
      tags: ['songwriting', 'motif', 'development'],
      content:
        'A motif is a short melodic or rhythmic idea (2-4 notes). Develop it by: SEQUENCE (repeat at different pitch), INVERSION (flip intervals), AUGMENTATION (double the note lengths), DIMINUTION (halve the note lengths). Your entire song can be built from one 3-note motif varied across sections. Listen how Beethoven built entire symphonies from 4 notes.',
      actionRequired: 'Create a 3-note motif and develop it 4 different ways.',
    },
    {
      id: 'song-06',
      category: 'Songwriting',
      subcategory: 'Structure',
      difficulty: 'Intermediate',
      title: 'The Modern Song Structure Blueprint',
      tags: ['songwriting', 'structure', 'format'],
      content:
        'Standard modern structure: Intro (4-8 bars) → Verse 1 (16 bars) → Pre-Chorus (4-8 bars) → Chorus (8-16 bars) → Verse 2 (16 bars) → Pre-Chorus → Chorus → Bridge (8-16 bars) → Final Chorus (with variation). The bridge should present a NEW chord progression and lyric angle. The final chorus should feel bigger (add harmonies, percussion, intensity). Keep total length under 3:30 for streaming.',
      actionRequired:
        "Map your song to this structure and identify what's missing.",
    },
    {
      id: 'song-07',
      category: 'Songwriting',
      subcategory: 'Collaboration',
      difficulty: 'Intermediate',
      title: 'Co-Writing Best Practices',
      tags: ['songwriting', 'collaboration', 'etiquette'],
      content:
        "Before a co-write: establish split percentages BEFORE writing (50/50 standard), agree on the song's direction (topic, vibe, genre), prepare reference tracks. During: one person drives (produces/records), the other contributes ideas. Switch roles every hour. Record everything. After: send the rough mix within 24 hours. Register the split with your PRO immediately.",
      actionRequired:
        'Set up a co-write with clear splits and direction agreed in advance.',
    },

    // ── VOCAL DOMAIN (5) ──────────────────────────
    {
      id: 'vocal-01',
      category: 'Vocal',
      subcategory: 'Technique',
      difficulty: 'Beginner',
      title: 'Diaphragmatic Breathing for Singers',
      tags: ['vocal', 'technique', 'breathing'],
      content:
        'Place your hand on your stomach. Breathe in — your stomach should expand, not your chest. This is diaphragmatic breathing. Practice: inhale for 4 counts, hold for 4, exhale for 8. Do this for 5 minutes before singing. This gives you consistent breath support, longer phrases, and better pitch control. Your breath is the engine of your voice — strengthen the engine.',
      actionRequired:
        'Practice diaphragmatic breathing: inhale 4, hold 4, exhale 8 for 5 minutes daily.',
    },
    {
      id: 'vocal-02',
      category: 'Vocal',
      subcategory: 'Technique',
      difficulty: 'Intermediate',
      title: 'Vocal Fry vs. Falsetto: When to Use Each',
      tags: ['vocal', 'technique', 'register'],
      content:
        'Vocal fry (low, crackly register): use for texture, emphasis, and modern pop/R&B phrasing. Falsetto (high, light register): use for emotional peaks, breathiness, and contrast. The most impactful singers move seamlessly between registers. Practice sliding from fry through chest voice to falsetto in one smooth motion. Register flexibility is the mark of a professional vocalist.',
      actionRequired:
        'Practice sliding from fry → chest → falsetto in one smooth motion.',
    },
    {
      id: 'vocal-03',
      category: 'Vocal',
      subcategory: 'Technique',
      difficulty: 'Advanced',
      title: 'Mixed Voice: The Holy Grail of Singing',
      tags: ['vocal', 'mixed-voice', 'advanced'],
      content:
        'Mixed voice blends chest resonance (power) with head resonance (range). Find it by: sing an "NG" sound (like "sing") and feel the vibration in your mask (nose/cheek area). Maintain that resonance placement while opening to a vowel. Start on a comfortable note and slide up keeping the "NG" placement. Mixed voice allows you to sing high notes with power, not thin falsetto.',
      actionRequired:
        'Find your mixed voice: start with "NG" placement and slide to vowels.',
    },
    {
      id: 'vocal-04',
      category: 'Vocal',
      subcategory: 'Recording',
      difficulty: 'Intermediate',
      title: 'Vocal Comping: Constructing the Perfect Take',
      tags: ['vocal', 'recording', 'comping'],
      content:
        'Record 3-5 full takes of each section. Label them Take 1-5. After recording, comp (combine) the best phrases from each take into one perfect vocal. Use the "punch-in" technique: re-record only the phrases that need improvement. Keep track of which take/part you liked. A great vocal is often a composite of multiple takes — nobody sings it perfectly in one pass.',
      actionRequired:
        'Record 3 vocal takes and comp the best phrases from each.',
    },
    {
      id: 'vocal-05',
      category: 'Vocal',
      subcategory: 'Processing',
      difficulty: 'Advanced',
      title: 'Pro Vocal Chain: Signal Path',
      tags: ['vocal', 'mixing', 'chain', 'processing'],
      content:
        'Professional vocal chain: 1) Subtractive EQ (remove mud at 300Hz, harshness at 3kHz), 2) Compressor (3:1 ratio, -3dB reduction), 3) De-esser (tame S sounds at 5-8kHz), 4) Additive EQ (boost presence at 2-4kHz, air at 10kHz), 5) Saturation (Analog Obsession or similar at 10% mix), 6) Reverb (plate or hall), 7) Delay (1/4 note, 15% mix). EQ before compression for cleaner compression, or after for tonal shaping.',
      actionRequired:
        'Build a pro vocal chain: EQ → Compressor → De-esser → EQ → Saturation → FX.',
    },

    // ── MARKETING DOMAIN (15) ─────────────────────────
    {
      id: 'mkt-01',
      category: 'Marketing',
      subcategory: 'Social Media',
      difficulty: 'Beginner',
      title: 'Content Cadence That Fits Your Capacity',
      tags: ['marketing', 'social-media', 'content'],
      content: 'Test a sustainable mix of performance, process, story and a clear call to action. Choose cadence from available time, budget, artist boundaries and measured audience response—not a mandatory 15 posts per week. Keep one recognizable sonic or visual cue and measure saves, meaningful replies, permission-based signups and attributable sales.',
      actionRequired: 'Schedule a small content test you can sustain; review the results before increasing volume.',
    },
    {
      id: 'mkt-02',
      category: 'Marketing',
      subcategory: 'Social Media',
      difficulty: 'Intermediate',
      title: 'Short-Form Creative Tests, Not Algorithm Myths',
      tags: ['marketing', 'tiktok', 'algorithm', 'viral'],
      content: 'Treat hooks, length, posting time and formats as testable hypotheses. Platforms change; no fixed hashtag count or posting time guarantees reach. Choose one listener segment, test two openings with the same song excerpt, and compare retention and real listener actions over a stated period. Separate observed metrics from guesses.',
      actionRequired: 'Run two creative variants, log dates and actual results, and keep the stronger listener signal.',
    },
    {
      id: 'mkt-03',
      category: 'Marketing',
      subcategory: 'Social Media',
      difficulty: 'Expert',
      title: 'The Funnel: Discovery to Superfan',
      tags: ['marketing', 'funnel', 'monetization'],
      content:
        'Build a funnel: DISCOVERY (TikTok/Reels/YouTube Shorts) → ENGAGEMENT (Email list + Discord) → CONVERSION (Pre-save, merch, tickets) → RETENTION (VIP content, exclusive access). Each stage requires different content. Discovery: high-entertainment, low-effort. Engagement: valuable, personal. Conversion: urgent, exclusive. Retention: grateful, community-focused.',
      actionRequired:
        'Map your current funnel and identify which stage is weakest.',
    },
    {
      id: 'mkt-04',
      category: 'Marketing',
      subcategory: 'Branding',
      difficulty: 'Intermediate',
      title: 'Artist Brand Identity Framework',
      tags: ['marketing', 'branding', 'identity'],
      content:
        'Your brand is the intersection of: YOUR STORY (origin, struggles, wins), YOUR SOUND (genre, influences, unique elements), YOUR VISUALS (colors, typography, imagery), YOUR VALUES (what you stand for), YOUR COMMUNITY (who listens and why). Define each clearly. Your brand should be recognisable in 1 second of audio OR 1 glance at an image. Consistency across all platforms multiplies recognition.',
      actionRequired:
        'Write a one-paragraph brand statement covering story, sound, visuals, values, and community.',
    },
    {
      id: 'mkt-05',
      category: 'Marketing',
      subcategory: 'Branding',
      difficulty: 'Advanced',
      title: 'The Sonic Branding Strategy',
      tags: ['marketing', 'sonic-branding', 'audio'],
      content:
        "Create a signature sonic element listeners recognize instantly: a producer tag, a specific synth sound, a vocal effect, or a production quirk. This is your sonic fingerprint. Use it consistently in intros, outros, and transitions. Think of how you can identify a Metro Boomin beat in 2 seconds. That's intentional sonic branding. Your sound should be identifiable within the first 3 seconds of a track.",
      actionRequired:
        'Define your "sonic fingerprint" — one element that makes your sound instantly recognizable.',
    },
    {
      id: 'mkt-06',
      category: 'Marketing',
      subcategory: 'Promotion',
      difficulty: 'Intermediate',
      title: 'Pre-Save Campaigns Without False Guarantees',
      tags: ['marketing', 'pre-save', 'campaign'],
      content: 'A pre-save is intent, not a guaranteed listen or royalty. Build a release page with clear consent, a music preview, accurate date and a single call to action. Match the campaign to existing audience size and delivery timing; do not invent conversion rates. Track consented signups, landing-page conversion and post-release activity separately.',
      actionRequired: 'Verify delivered metadata and date, then test a release page with explicit consent.',
    },
    {
      id: 'mkt-07',
      category: 'Marketing',
      subcategory: 'Promotion',
      difficulty: 'Expert',
      title: 'Playlist Pitching and Artificial-Streaming Risk',
      tags: ['marketing', 'playlists', 'pitching'],
      content: 'Pitch only genuinely relevant curators with accurate credits, release context and a listening link. There is no guaranteed acceptance rate. Spotify prohibits third-party services guaranteeing streams or paid guaranteed playlist placement; artificial streams can lead to removed metrics, withheld royalties or distributor action. Legitimate advertising is distinct from purchased or fabricated plays.',
      actionRequired: 'Audit pitches and promotion vendors for guaranteed-stream claims; keep a log and measure genuine listener engagement.',
      sources: ['https://support.spotify.com/us/artists/article/third-party-services-that-guarantee-streams/'],
      reviewedAt: '2026-10-11',
    },
    {
      id: 'mkt-08',
      category: 'Marketing',
      subcategory: 'Email Marketing',
      difficulty: 'Intermediate',
      title: 'Permission-Based Direct Fan Relationships',
      tags: ['marketing', 'email', 'algorithm'],
      content: 'A consent-based email list can reduce platform dependence, but an open is not a stream, and no subscriber count guarantees sales. Respect privacy, unsubscribe and local marketing rules; segment by real engagement. Offer useful music or behind-the-scenes context rather than constant urgency.',
      actionRequired: 'Create a consented welcome sequence and measure actual clicks, replies and conversions.',
    },

    {
      id: 'mkt-09',
      category: 'Marketing',
      subcategory: 'Promotion',
      difficulty: 'Beginner',
      title: 'The Pre-Release Asset Ladder',
      tags: ['promotion', 'release', 'campaign'],
      content: 'Work backwards from the release date: announce, then a hook clip, then a clip from a different section, then the pre-save ask, then release-day action, then the two weeks after. Each rung needs its own asset — the same 15 seconds posted five times is one post, not a campaign — and one consistent action for the audience and the algorithm to learn.',
      actionRequired: 'Write the release date and fill six dated asset slots before launch.',
    },
    {
      id: 'mkt-10',
      category: 'Marketing',
      subcategory: 'Promotion',
      difficulty: 'Beginner',
      title: 'Content Cadence You Can Sustain',
      tags: ['promotion', 'content', 'consistency'],
      content: 'Pick a cadence you can hold on your worst week — one strong post plus a few low-effort stories is a real answer — then batch it and keep three repeatable formats. Missing a week costs nothing; disappearing for a month after burnout costs the audience you already built.',
      actionRequired: 'Batch one week of content and schedule it before the week starts.',
    },
    {
      id: 'mkt-11',
      category: 'Marketing',
      subcategory: 'Advertising',
      difficulty: 'Intermediate',
      title: 'Paid Promotion: Do the Math Before the Spend',
      tags: ['marketing', 'ads', 'budget'],
      content: 'Track cost per result, not impressions: a campaign is worth running only while the cost per save, click or sale stays below what that action earns you. Start at the smallest budget that produces a readable number, target one audience, change one variable at a time, and stop when it stops clearing the bar.',
      actionRequired: 'Define the cost per result that makes the campaign worth running, then test at the smallest readable budget.',
    },
    {
      id: 'mkt-12',
      category: 'Marketing',
      subcategory: 'Audience',
      difficulty: 'Intermediate',
      title: 'Own the Channel, Rent the Platform',
      tags: ['marketing', 'fans', 'email'],
      content: 'Followers are rented; an email list, a community you moderate, or a customer list is owned. Convert by giving a reason to leave the feed — a download, a pre-save, a ticket, a voice note — and measure the conversion rate rather than the follower count. Then measure whether the owned channel actually opens.',
      actionRequired: 'Pick one owned channel, add a single conversion path to it, and measure the rate for two weeks.',
    },
    {
      id: 'mkt-13',
      category: 'Marketing',
      subcategory: 'Playlists',
      difficulty: 'Intermediate',
      title: 'Editorial, Independent and Paid Playlisting Are Different Products',
      tags: ['promotion', 'playlists', 'pitching'],
      content: 'Editorial pitch windows are deadlines you can miss; independent curation is sometimes sold and sometimes not; paid placement is not editorial support, and a guaranteed-numbers service is a fraud risk that can cost the release and the account. Keep pitches personal, keep the timeline realistic, and pitch inside the partner’s own window.',
      actionRequired: 'Pitch editorially inside the window, and check any paid offer against the platform’s own rules first.',
    },
    {
      id: 'mkt-14',
      category: 'Marketing',
      subcategory: 'Branding',
      difficulty: 'Beginner',
      title: 'Consistent Imagery Without a Designer',
      tags: ['branding', 'artwork', 'identity'],
      content: 'Fix two typefaces, a three-colour palette and one crop rule, then reuse them for covers, thumbnails, lyric cards and live visuals. Legibility beats novelty — check the thumbnail at the size it actually appears, and keep the artist name readable when the artwork is 60 pixels wide.',
      actionRequired: 'Write down the palette, the two typefaces and the crop rule, then apply them to the next three assets.',
    },
    {
      id: 'mkt-15',
      category: 'Marketing',
      subcategory: 'Analytics',
      difficulty: 'Advanced',
      title: 'Analytics That Change a Decision',
      tags: ['marketing', 'analytics', 'data'],
      content: 'Ignore total plays. Track saves per stream, skip rate in the first 30 seconds, completion, follower-to-listener ratio and which source actually converted. A number that cannot change what you do next month is entertainment, not evidence — and a dashboard nobody reads is a cost, not a strategy.',
      actionRequired: 'Choose two metrics that map to a decision you can make, and review them after the next release.',
    },

    // ── BUSINESS DOMAIN (10) ─────────────────────────
    {
      id: 'biz-01',
      category: 'Business',
      subcategory: 'Revenue',
      difficulty: 'Beginner',
      title: 'Build an Artist-Specific Revenue Model',
      tags: ['business', 'revenue', 'income'],
      content: 'Map master income, publishing, direct sales, live work, merchandise, services, sync and other genuinely relevant streams. Revenue shares and DSP payouts vary; there is no universal per-stream rate or income mix. Model gross receipts, contractual deductions, recoupment, taxes, costs and net margin separately. Use actual statements and declared capacity before forecasting.',
      actionRequired: 'List current income and costs; identify one achievable experiment and a break-even metric.',
    },
    {
      id: 'biz-02',
      category: 'Business',
      subcategory: 'Revenue',
      difficulty: 'Advanced',
      title: 'Royalties: Rights, Territory and Collection',
      tags: ['business', 'publishing', 'royalties'],
      content: 'Separate composition performance/mechanical income from sound-recording income. In the U.S., PROs administer musical-work performance royalties; The MLC administers eligible digital-audio mechanical uses under the section 115 blanket license, not all worldwide or physical mechanicals. SoundExchange administers qualifying U.S. non-interactive digital sound-recording performance royalties, distinct from interactive master payments through distribution. A publisher/administrator may already collect for you. Other territories differ; do not double-assign administration.',
      actionRequired: 'Confirm your territory, ownership, existing administrators and matching work/recording identifiers before identifying collection gaps.',
      sources: ['https://www.themlc.com/digital-music-royalties-landscape', 'https://www.soundexchange.com/digital-performance-royalties/'],
      reviewedAt: '2026-10-11',
      jurisdiction: 'U.S. example; verify applicable territory',
    },
    {
      id: 'biz-07',
      category: 'Business',
      subcategory: 'Revenue',
      difficulty: 'Intermediate',
      title: 'Merchandise: Demand and Margin Before Inventory',
      tags: ['business', 'merch', 'revenue'],
      content: 'Merch can fit an artist with demonstrated demand, but it is not a mandatory revenue percentage. Price from landed costs, fees, returns, taxes, design and fulfilment; print-on-demand can reduce inventory exposure but has tradeoffs. Validate a small offer with existing fans before expanding.',
      actionRequired: 'Calculate unit contribution margin and validate demand before ordering inventory.',
    },
    {
      id: 'biz-05',
      category: 'Business',
      subcategory: 'Strategy',
      difficulty: 'Advanced',
      title: 'Evaluate Participation Deals With Counsel',
      tags: ['business', '360-deal', 'legal'],
      content: 'Multi-income participation deals vary: review exactly which income is included, deductions, recoupment, audit rights, approvals, term, territory, rights reversion, minimum obligations and termination. No percentage is universally standard. Compare the partner’s written commitments and demonstrated value to a sustainable independent alternative.',
      actionRequired: 'Prepare a clause-by-clause questions list for a qualified music attorney in the governing jurisdiction.',
    },
    {
      id: 'biz-06',
      category: 'Business',
      subcategory: 'Strategy',
      difficulty: 'Intermediate',
      title: 'Hire for the Bottleneck, Not a Fixed Order',
      tags: ['business', 'team', 'management'],
      content: 'Build a team only when a real bottleneck and sustainable budget justify it. An engineer, designer, administrator or booking partner may be the first useful collaborator depending on the artist. Define scope, deliverables, fees, conflicts, ownership and termination in writing; revenue shares and employment rules need jurisdiction-specific review.',
      actionRequired: 'Name the bottleneck, quote the work and compare net benefit before hiring.',
    },

    {
      id: 'biz-03',
      category: 'Business',
      subcategory: 'Revenue',
      difficulty: 'Advanced',
      title: 'Performance, Mechanical and Digital-Performance Are Separate Pools',
      tags: ['business', 'royalties', 'registration'],
      content: 'One song can earn through several systems that do not share a collector: performance royalties for the composition, mechanical royalties for reproduction and distribution, digital-performance royalties for non-interactive use, and master royalties paid by the distributor. Registering with one organisation does not collect the others, and unclaimed income can be forfeited after a deadline. This is general information, not legal advice.',
      actionRequired: 'List which societies and distributors collect for your works today, and name the gaps.',
      sources: ['https://www.copyright.gov/engage/musicians/'],
      reviewedAt: '2026-10-16',
      jurisdiction: 'Verify current rules for your territory',
    },
    {
      id: 'biz-04',
      category: 'Business',
      subcategory: 'Metadata',
      difficulty: 'Intermediate',
      title: 'ISRC Identifies the Recording, UPC Identifies the Release',
      tags: ['business', 'metadata', 'identifiers'],
      content: 'An ISRC is assigned per recording and stays with that audio across releases, territories and platforms; a UPC/EAN identifies a release or product, not a song. Confusing the two creates duplicate catalogue entries, split streams and royalties paid to the wrong party. Keep a sheet mapping recording → ISRC → release → UPC, and refuse a second ISRC for audio you already released.',
      actionRequired: 'Audit one release: does each recording carry exactly one ISRC and each release exactly one UPC?',
    },
    {
      id: 'biz-08',
      category: 'Business',
      subcategory: 'Accounting',
      difficulty: 'Advanced',
      title: 'Read the Statement Before You Bank the Advance',
      tags: ['business', 'royalties', 'contracts'],
      content: 'A royalty statement defines gross versus net, which costs are recoupable, what the percentage applies to and when you may audit. Ask for those definitions in writing before signing, and reconcile each statement against your own play and sales data. Cross-collateralisation and packaging or marketing deductions can leave a genuinely profitable release paying nothing.',
      actionRequired: 'Get recoupable costs, the royalty base and audit rights defined in writing before signing.',
    },
    {
      id: 'biz-09',
      category: 'Business',
      subcategory: 'Strategy',
      difficulty: 'Intermediate',
      title: 'Budget a Release Like a Small P&L',
      tags: ['business', 'budget', 'release'],
      content: 'List expected costs — production, mastering, artwork, video, ads, distribution, legal review — against expected income from streams, sales, sync and live. Decide what the release must return and what you are willing to spend to learn, then fund the line item that removes the biggest uncertainty rather than the one that feels most like a music video.',
      actionRequired: 'Write the three biggest costs and the one you can cut without hurting the campaign.',
    },
    {
      id: 'biz-10',
      category: 'Business',
      subcategory: 'Team',
      difficulty: 'Intermediate',
      title: 'What a Manager or Agent Commission Actually Covers',
      tags: ['business', 'management', 'commission'],
      content: 'Commission rates, which revenue streams they apply to, the term, the territory and the post-term (sunset) clause are all negotiated; there is no universal percentage. Confirm what is included — live, merch, publishing, sync — who pays expenses, and what happens to commissions on deals signed during the term but closing after it. Get it reviewed in your own territory.',
      actionRequired: 'Before signing, get the commission base, exclusions, term and post-term clause in writing.',
      jurisdiction: 'Jurisdiction-specific; have counsel review the term sheet',
    },

    // ── LEGAL DOMAIN (8) ─────────────────────────────
    {
      id: 'legal-01',
      category: 'Legal',
      subcategory: 'Copyright',
      difficulty: 'Intermediate',
      title: 'Copyright: Two Works and Jurisdiction',
      tags: ['legal', 'copyright', 'protection'],
      content: 'In the U.S., original protected expression is copyrighted once fixed; a composition (music/lyrics) and its sound recording are separate works and may have different owners. Registration and enforcement prerequisites, timing and remedies depend on the work and jurisdiction; registration does not automatically establish sole ownership or guarantee damages. Do not quote stale fees as current. This is general information, not a legal opinion.',
      actionRequired: 'Document authorship and ownership separately for composition and master; check the relevant official registration rules with qualified counsel.',
      sources: ['https://www.copyright.gov/engage/musicians/'],
      reviewedAt: '2026-10-11',
      jurisdiction: 'U.S. example; verify applicable territory',
    },
    {
      id: 'legal-02',
      category: 'Legal',
      subcategory: 'Contracts',
      difficulty: 'Advanced',
      title: 'Split Sheets: Separate Composition and Master Pools',
      tags: ['legal', 'splits', 'collaboration'],
      content: 'Record legal names, roles, contacts, work identifiers when known, agreed composition shares and separately negotiated master ownership/royalty terms, credits and signatures. Each ownership pool must total 100%. There is no universal 50% producer share, equal writer default or automatic matching of publishing and master splits. Distinguish producer royalty points from ownership and define recoupment. General information, not a legal opinion.',
      actionRequired: 'Collect each collaborator’s agreed shares and ask counsel to review unresolved ownership before release.',
      reviewedAt: '2026-10-16',
      jurisdiction: 'Verify share and signature rules in your territory',
    },
    {
      id: 'legal-03',
      category: 'Legal',
      subcategory: 'Contracts',
      difficulty: 'Expert',
      title: 'Producer Agreements: Define the Actual Rights',
      tags: ['legal', 'producer', 'contract'],
      content: 'Review exclusive versus non-exclusive use, permitted media, territory, duration, usage limits, credit, sample permissions, master ownership, composition shares, fees, royalty basis, recoupment, approvals and termination. No producer percentage applies universally. A beat lease may restrict sync or monetization even if the audio file is downloadable. General information, not a legal opinion.',
      actionRequired: 'Check the actual license and resolve unclear rights in writing with qualified counsel.',
      reviewedAt: '2026-10-16',
      jurisdiction: 'Verify the applicable territory’s rules with counsel',
    },
    {
      id: 'legal-04',
      category: 'Legal',
      subcategory: 'Rights',
      difficulty: 'Expert',
      title: 'Samples and Interpolations: No Magic Safe Length',
      tags: ['legal', 'samples', 'clearance'],
      content: 'Using existing audio can implicate recording rights and underlying composition rights. Re-recording musical material (interpolation) avoids using the original recording but can still implicate the composition. There is no universal safe number of seconds, pitch-shift or chopping trick; fair use is case-specific and varies by jurisdiction. Sample-pack terms may restrict use, exclusivity or Content ID. Clearance costs and ownership terms are negotiated, not fixed percentages.',
      actionRequired: 'Inventory source material and licenses; get applicable permissions or replace it. Do not treat processing as legal clearance.',
      sources: ['https://www.copyright.gov/engage/musicians/', 'https://www.copyright.gov/help/faq/faq-fairuse.html'],
      reviewedAt: '2026-10-11',
      jurisdiction: 'U.S. example; verify applicable territory',
    },

    {
      id: 'legal-05',
      category: 'Legal',
      subcategory: 'Contracts',
      difficulty: 'Advanced',
      title: 'Red Flags in an Exclusive Deal',
      tags: ['legal', 'contracts', 'rights'],
      content: 'Perpetual all-rights grants with no reversion, recoupment against costs you cannot audit, controlled-composition clauses, cross-collateralisation across unrelated income and options exercisable at the counterparty’s sole discretion are the terms that separate an opportunity from a trap. Weigh each against what you actually receive in return — an advance, marketing spend, distribution or a guaranteed campaign. General information, not a legal opinion.',
      actionRequired: 'Write down the grant, the term, the reversion clause and the recoupment base before signing anything.',
      sources: ['https://www.copyright.gov/engage/musicians/'],
      reviewedAt: '2026-10-16',
      jurisdiction: 'U.S. example; verify applicable territory',
    },
    {
      id: 'legal-06',
      category: 'Legal',
      subcategory: 'Rights',
      difficulty: 'Advanced',
      title: 'Administration Is Not Ownership',
      tags: ['legal', 'publishing', 'administration'],
      content: 'A publishing administration deal collects and administers a share for a term and a commission while ownership stays with the writer — unless the contract assigns the copyright, which some do. Read the term, the territory, the collection scope, the reversion terms and whether the administrator can sign licences on your behalf without approval. General information, not a legal opinion.',
      actionRequired: 'Before signing, separate what is assigned from what is merely administered.',
      reviewedAt: '2026-10-16',
      jurisdiction: 'U.S. example; verify applicable territory',
    },
    {
      id: 'legal-07',
      category: 'Legal',
      subcategory: 'Rights',
      difficulty: 'Intermediate',
      title: 'Clear the Name Before You Release Under It',
      tags: ['legal', 'trademark', 'brand'],
      content: 'A band or brand name can conflict with an existing trademark even when an obvious search finds nothing, because conflicts are class- and territory-specific. Search the relevant registers and the streaming platforms, and get advice before printing merchandise or signing a distribution deal under a name you may not own. General information, not a legal opinion.',
      actionRequired: 'Search the registers and platforms for your artist name, then confirm your rights with counsel.',
      reviewedAt: '2026-10-16',
      jurisdiction: 'Verify in every territory you release or tour in',
    },
    {
      id: 'legal-08',
      category: 'Legal',
      subcategory: 'Rights',
      difficulty: 'Advanced',
      title: 'AI-Generated Elements: Keep the Provenance',
      tags: ['legal', 'ai', 'copyright'],
      content: 'Rules on copyrightability, disclosure and the provenance of training data for AI-generated audio, artwork and lyrics differ by jurisdiction, registry and platform, and they are changing. Record the tool, model, version and prompt for every generated element, and check each partner’s current policy before release. Documentation is cheap at creation time and impossible to reconstruct afterwards. General information, not a legal opinion.',
      actionRequired: 'Log tool, model, version and prompt for every AI-generated element in the release.',
      reviewedAt: '2026-10-16',
      jurisdiction: 'Jurisdiction- and platform-specific; verify current policy before release',
    },

    // ── DISTRIBUTION DOMAIN (6) ─────────────────────
    {
      id: 'dist-01',
      category: 'Distribution',
      subcategory: 'Strategy',
      difficulty: 'Beginner',
      title: 'Choose Distribution by Terms, Not Stale Prices',
      tags: ['distribution', 'distributor', 'platform'],
      content: 'Compare current territory coverage, fees and commissions, payout rules, ownership, takedown/renewal terms, support, metadata correction, fraud policies and any advance recoupment. Verify current terms directly before choosing; do not treat cached prices or invite-only claims as current. Keep master ownership and publishing administration distinct.',
      actionRequired: 'Write your delivery requirements and compare current official terms before entering an agreement.',
    },
    {
      id: 'dist-02',
      category: 'Distribution',
      subcategory: 'Strategy',
      difficulty: 'Intermediate',
      title: 'Release Readiness Before a Countdown',
      tags: ['distribution', 'checklist', 'release'],
      content: 'Build the timeline backwards from verified distributor delivery lead time and editorial pitch deadlines. Approve master, credits, rights, artwork, identifiers and release date before delivery; prepare content and consented fan outreach before launch. No one-size 14-day checklist fits every partner or territory. Evaluate actual first-week evidence rather than automatically starting another release.',
      actionRequired: 'Confirm rights and delivery, then assign realistic dates, owners and a post-release review.',
    },

    {
      id: 'dist-03',
      category: 'Distribution',
      subcategory: 'Metadata',
      difficulty: 'Intermediate',
      title: 'Deliver Metadata With the Audio, Not After',
      tags: ['distribution', 'metadata', 'identifiers'],
      content: 'A delivery needs the recording and its ISRC, the release and its UPC, contributor credits, registered writer names with their societies, agreed splits, artwork that meets the partner’s own spec, and a master that matches the intended product. Missing metadata is the most common reason a release pays late — or pays someone else.',
      actionRequired: 'Build the metadata sheet before delivery, not after the release date is booked.',
    },
    {
      id: 'dist-04',
      category: 'Distribution',
      subcategory: 'Strategy',
      difficulty: 'Intermediate',
      title: 'Direct-to-DSP or Aggregator: Compare the Terms, Not the Hype',
      tags: ['distribution', 'platform', 'ownership'],
      content: 'Fee structure, royalty split, ownership, takedown rules, support and payment thresholds differ between direct platform deals and aggregators. Some take a percentage for a defined term; others charge a flat fee and never own anything. Price both against the current official terms and against the catalogue you actually have.',
      actionRequired: 'Write your non-negotiables — ownership, term, takedown — and compare current official terms against them.',
    },
    {
      id: 'dist-05',
      category: 'Distribution',
      subcategory: 'Release',
      difficulty: 'Beginner',
      title: 'Release Day Is the Start, Not the Finish',
      tags: ['distribution', 'release', 'promotion'],
      content: 'The first week is when platforms, press and the algorithm are paying attention: be reachable, drive the owned channels, put money behind the two assets already performing, and answer everyone who engages. Schedule the week-two follow-up before the release, because the drop in attention afterwards is predictable rather than a verdict on the song.',
      actionRequired: 'Write release-day and week-two tasks with dates before the release goes live.',
    },
    {
      id: 'dist-06',
      category: 'Distribution',
      subcategory: 'Rights',
      difficulty: 'Advanced',
      title: 'Content ID, Covers and Samples at Delivery',
      tags: ['distribution', 'content-id', 'covers'],
      content: 'A cover needs a mechanical licence for the composition even though the recording is yours; a sample needs both the recording and the composition cleared; and a Content ID claim on material you do not own can divert your revenue or mute the release. Declare every third-party element to the distributor before delivery, with the licence details attached.',
      actionRequired: 'Declare covers, samples and borrowed material before upload, with licence details.',
    },

    // ── CAREER DOMAIN (6) ──────────────────────────
    {
      id: 'career-01',
      category: 'Career',
      subcategory: 'Growth',
      difficulty: 'Beginner',
      title: 'Independent Journeys Are Not a Fixed Ladder',
      tags: ['career', 'growth', 'roadmap'],
      content: 'A first recording, sustainable release practice, direct fan relationships, live development and rights administration can progress independently. Age, genre, years active and label affiliation do not prove ability or reach. Choose the next milestone from evidence, artist goals, budget, access needs and time capacity; touring and major-label deals are optional.',
      actionRequired: 'Select one measurable milestone that fits your current evidence and constraints.',
    },
    {
      id: 'career-02',
      category: 'Career',
      subcategory: 'Growth',
      difficulty: 'Intermediate',
      title: 'Networking: Quality > Quantity',
      tags: ['career', 'networking', 'relationships'],
      content:
        'Build 10 deep industry relationships rather than 100 shallow ones. Quality relationships lead to collaborations, playlists, and opportunities. Attend 1-2 industry events per month (conferences, showcases, networking events). Follow up within 24 hours. Provide value before asking for favors. Support their work genuinely. A strong network is your single most valuable career asset — more than talent.',
      actionRequired:
        'Reach out to 3 people in your network this week with genuine value, not asks.',
    },
    {
      id: 'career-03',
      category: 'Career',
      subcategory: 'Live',
      difficulty: 'Intermediate',
      title: 'Small-Room Touring Math',
      tags: ['career', 'touring', 'live'],
      content: 'Before accepting a date, model travel, accommodation, backline, fees and the split against realistic attendance and per-head merchandise. A guarantee protects cash flow on a first visit to a market; a door deal rewards an audience you have already proved. Log what each show actually returned so the next offer is evaluated against evidence rather than enthusiasm.',
      actionRequired: 'Model one show’s break-even attendance before accepting the next date.',
    },
    {
      id: 'career-04',
      category: 'Career',
      subcategory: 'Sync',
      difficulty: 'Advanced',
      title: 'Building a Sync-Ready Catalogue',
      tags: ['career', 'sync', 'licensing'],
      content: 'Supervisors ask for instrumental and clean versions, one-stop clearance, correct metadata, cue-sheet-ready splits and a library that can be searched by mood, tempo and key. That is production work you can do while the release cycle is slow, and it is the reason some catalogues get called a second time.',
      actionRequired: 'Export instrumentals, TV mixes and a tagged metadata sheet for your three strongest tracks.',
    },
    {
      id: 'career-05',
      category: 'Career',
      subcategory: 'Collaboration',
      difficulty: 'Intermediate',
      title: 'Features and Partnerships: Terms Before Verses',
      tags: ['career', 'collaboration', 'splits'],
      content: 'Agree the split, the credit, the delivery format and the release window before anyone writes, and put it in a split sheet the same week. A feature is a rights transaction with a relationship attached; ambiguous terms are what turn a good collaboration into a silent catalogue problem two years later.',
      actionRequired: 'Send a split sheet with credit, shares and deadlines before scheduling the session.',
    },
    {
      id: 'career-06',
      category: 'Career',
      subcategory: 'Growth',
      difficulty: 'Beginner',
      title: 'Sustainable Cadence Beats a Heroic Month',
      tags: ['career', 'burnout', 'cadence'],
      content: 'A release schedule you can repeat, protected writing time and honest capacity beat one intense month followed by silence. Budget recovery like a production cost: a burned-out artist ships nothing, and an unfinished catalogue earns nothing. Choose the cadence you could hold for a year, not the one that impresses this week.',
      actionRequired: 'Set a cadence you could hold for a year, then protect one writing block a week.',
    },
  ];

  getAllKnowledge(): KnowledgeEntry[] {
    return this.knowledgeBase;
  }

  getByCategory(category: KnowledgeCategory): KnowledgeEntry[] {
    return this.knowledgeBase.filter((e) => e.category === category);
  }

  getByTags(tags: string[]): KnowledgeEntry[] {
    return this.knowledgeBase.filter((e) =>
      tags.some((t) => e.tags.includes(t.toLowerCase()))
    );
  }

  search(query: string): KnowledgeEntry[] {
    const tokens = query.toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => !['a', 'the', 'me', 'my', 'to', 'of', 'in', 'and', 'how', 'what', 'is', 'are', 'do', 'i', 'explain', 'teach', 'about', 'please'].includes(t)) || [];
    if (!tokens.length) return [];
    return this.knowledgeBase.map((entry, index) => {
      const heading = `${entry.title} ${entry.tags.join(' ')} ${entry.category} ${entry.subcategory}`.toLowerCase();
      const body = entry.content.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (heading.includes(token) ? 5 : body.includes(token) ? 1 : 0), 0);
      const matches = tokens.filter((token) => heading.includes(token) || body.includes(token)).length;
      return { entry, index, score: matches >= Math.ceil(tokens.length / 2) ? score : 0 };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.entry);
  }

  getRandomByCategory(category: KnowledgeCategory): KnowledgeEntry | null {
    const canonical = ['Production', 'Songwriting', 'Vocal', 'Marketing', 'Business', 'Legal', 'Distribution', 'Career'].find((c) => c.toLowerCase() === String(category).toLowerCase()) as KnowledgeCategory | undefined;
    const entries = canonical ? this.getByCategory(canonical) : [];
    if (entries.length === 0) return null;
    return entries[Math.floor(Math.random() * entries.length)];
  }

  getCounts(): Record<KnowledgeCategory, number> {
    const counts: any = {};
    for (const entry of this.knowledgeBase) {
      counts[entry.category] = (counts[entry.category] || 0) + 1;
    }
    return counts;
  }

  generateLesson(
    domain: KnowledgeCategory
  ): { title: string; steps: string[]; sourceEntry: KnowledgeEntry } | null {
    const entry = this.getRandomByCategory(domain);
    if (!entry) return null;

    const actionStep = entry.actionRequired
      ? `ACTION: ${entry.actionRequired}`
      : null;
    const steps = [
      `STUDY: ${entry.title}`,
      `DIFFICULTY: ${entry.difficulty}`,
      `READ: ${entry.content.substring(0, 200)}...`,
      ...(actionStep ? [actionStep] : []),
      `APPLY: Adapt this to your declared goals, resources and territory.`,
      `REVIEW: Verify evidence and compare against your intended outcome.`,
    ];

    return {
      title: `S.M.U.V.E LESSON: ${entry.title}`,
      steps,
      sourceEntry: entry,
    };
  }
}
