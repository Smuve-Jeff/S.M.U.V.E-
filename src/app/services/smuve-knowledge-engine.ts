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
}

export type KnowledgeCategory = 
  | 'Production' | 'Songwriting' | 'Vocal' | 'Marketing' 
  | 'Business' | 'Legal' | 'Distribution' | 'Career';

@Injectable({ providedIn: 'root' })
export class SmuveKnowledgeEngine {
  private readonly knowledgeBase: KnowledgeEntry[] = [
    // ── PRODUCTION DOMAIN (20) ──────────────────────
    { id: 'prod-01', category: 'Production', subcategory: 'Mixing', difficulty: 'Intermediate',
      title: 'Gain Staging Fundamentals', tags: ['mixing', 'levels', 'headroom'],
      content: 'Set all track faders to -6dB before adding any plugins. This gives you 6dB of headroom for EQ boosts and compression makeup gain. Use a VU meter plugin on your master bus to verify levels never exceed 0dB. Proper gain staging prevents digital clipping and ensures your plugins operate in their optimal range.',
      actionRequired: 'Open mixer and set all faders to -6dB, then listen through the mix.' },
    { id: 'prod-02', category: 'Production', subcategory: 'Mixing', difficulty: 'Intermediate',
      title: 'The 3-Band Mix Framework', tags: ['mixing', 'structure', 'eq'],
      content: 'Divide your mix into three frequency zones: BASS (20-250Hz) - kick and bass guitar, share no space. MID (250Hz-4kHz) - vocals, guitars, keys, keep clear of mud at 300Hz. HIGHS (4kHz-20kHz) - cymbals, air, presence, boost 10kHz for sparkle. Always check your mix in mono first. If it disappears in mono, your stereo image has phase problems.',
      actionRequired: 'Create three busses (Low/Mid/High) and route tracks to appropriate groups.' },
    { id: 'prod-03', category: 'Production', subcategory: 'Mixing', difficulty: 'Advanced',
      title: 'Parallel Compression Technique', tags: ['compression', 'parallel', 'dynamics'],
      content: 'Duplicate your drum bus, apply heavy compression (8:1 ratio, fast attack, fast release, -10dB gain reduction), then blend the compressed signal with the original. Start at 20% wet. This preserves the natural transients while adding density and body. The effect should be felt, not heard.',
      actionRequired: 'Create a parallel compression bus on drums at 20% blend.' },
    { id: 'prod-04', category: 'Production', subcategory: 'Mixing', difficulty: 'Expert',
      title: 'Mid/Side EQ for Stereo Width', tags: ['mixing', 'stereo', 'ms-eq'],
      content: 'Use Mid/Side EQ to process the center and sides independently. Cut -2dB at 300Hz on the side channel to reduce muddiness. Boost +2dB at 10kHz on the side channel for air. Keep all frequencies below 200Hz in mono (correlation meter should read +1). The wider your mix sounds, the more impressive it feels on good speakers.',
      actionRequired: 'Apply mid/side EQ: cut mud on sides, keep bass mono.' },
    { id: 'prod-05', category: 'Production', subcategory: 'Sound Design', difficulty: 'Intermediate',
      title: 'Layering Synths for Fullness', tags: ['sound-design', 'synth', 'layering'],
      content: 'Layer three synths for a massive sound: SUB (sine wave, -1 octave, 10% volume), BODY (saw wave, root note, 60% volume), TEXTURE (noise/fm, +1 octave, 30% volume). EQ each layer so they don\'t compete. Use slight detune (5-8 cents) between layers for natural width. The secret is in the blend, not the individual sounds.',
      actionRequired: 'Build a 3-layer synth patch: sub + body + texture.' },
    { id: 'prod-06', category: 'Production', subcategory: 'Sound Design', difficulty: 'Advanced',
      title: 'FM Synthesis Crash Course', tags: ['sound-design', 'fm-synth', 'electronic'],
      content: 'FM synthesis uses one oscillator (modulator) to modulate the pitch of another (carrier). The carrier/modulator ratio determines the timbre. Simple ratios (1:1, 2:1) produce harmonic tones. Complex ratios produce metallic/bell-like sounds. Start with a 2-op FM patch: carrier at 200Hz, modulator at 400Hz with 50% depth. Adjust modulator ratio and depth to sculpt the tone.',
      actionRequired: 'Create a basic 2-operator FM patch and sweep the modulator ratio.' },
    { id: 'prod-07', category: 'Production', subcategory: 'Sound Design', difficulty: 'Beginner',
      title: '808 Bass Design Fundamentals', tags: ['sound-design', '808', 'bass', 'trap'],
      content: 'A great 808 starts with a sine wave at 50-60Hz. Add saturation (Decapitator or Softube Saturation Knob) at 20% mix for harmonic content. Use a pitch envelope: start at +12 semitones, decay to root in 50ms. Layer a click (short percussive sample) on top for attack. Sidechain the 808 to the kick for clean low-end. The 808 should shake the room, not muddy the mix.',
      actionRequired: 'Design an 808 with sine wave + saturation + pitch envelope + click layer.' },
    { id: 'prod-08', category: 'Production', subcategory: 'Arrangement', difficulty: 'Intermediate',
      title: 'The 4-Bar Rule for Arrangements', tags: ['arrangement', 'structure', 'production'],
      content: 'In modern pop and hip-hop, introduce a new element every 4 bars. Bar 1-4: drums + bass. Bar 5-8: add chords/pads. Bar 9-12: add melody/hook. Bar 13-16: full arrangement with vocals. Remove elements every 8 bars for dynamic contrast. The listener\'s brain craves novelty. If nothing changes for 8 bars, you\'ve lost them.',
      actionRequired: 'Analyze your current arrangement: does something new happen every 4-8 bars?' },
    { id: 'prod-09', category: 'Production', subcategory: 'Arrangement', difficulty: 'Expert',
      title: 'Drop/Chorus Energy Architecture', tags: ['arrangement', 'energy', 'drop'],
      content: 'The drop or chorus should be the loudest, widest, most intense section. Pre-drop: remove sub frequencies, high-pass at 100Hz, reduce reverb. This creates anticipation. Drop: reintroduce sub, add reverb, widen the stereo field. Use risers (white noise with rising pitch) and tension builders (increasing snare speed) in the 4 bars before the drop. The energy should peak at the downbeat of the drop.',
      actionRequired: 'Build a pre-drop tension section with high-pass filter + riser + snare build.' },
    { id: 'prod-10', category: 'Production', subcategory: 'Mastering', difficulty: 'Advanced',
      title: 'LUFS Targets for Every Platform', tags: ['mastering', 'loudness', 'lufs'],
      content: 'Each streaming platform has different loudness targets: Spotify -14 LUFS (integrated), Apple Music -16 LUFS, YouTube -13 LUFS, Tidal -14 LUFS, SoundCloud -10 LUFS. Master to -14 LUFS for best cross-platform translation. True Peak should never exceed -1dBTP. Use a loudness meter (YouLean or similar) to verify. Louder is not better — dynamics win.',
      actionRequired: 'Check your master against platform LUFS targets.' },
    { id: 'prod-11', category: 'Production', subcategory: 'Mastering', difficulty: 'Expert',
      title: 'Mastering Chain Architecture', tags: ['mastering', 'chain', 'processing'],
      content: 'Optimal mastering chain: 1) Subtractive EQ (remove resonances), 2) Multiband Compression (glue + balance), 3) Stereo Widener (enhance without phase issues), 4) Harmonic Exciter (add presence), 5) Limiter (max -2dB gain reduction). Always reference commercial tracks in your genre at the same level. A/B compare with the reference every 5 minutes.',
      actionRequired: 'Build a mastering chain: EQ → Multiband → Width → Exciter → Limiter.' },
    { id: 'prod-12', category: 'Production', subcategory: 'Recording', difficulty: 'Intermediate',
      title: 'Home Studio Vocal Recording Setup', tags: ['recording', 'vocal', 'studio'],
      content: 'For professional vocal recordings at home: Use a dynamic mic (SM7B or similar) for untreated rooms. Position mic 6-12 inches from the singer, slightly off-axis to reduce plosives. Use a pop filter. Record at 24-bit/48kHz minimum. Create a "fort" with moving blankets behind the singer to absorb reflections. Record 3-5 takes of each section and comp the best phrases.',
      actionRequired: 'Set up your vocal recording space with proper mic placement and acoustic treatment.' },
    { id: 'prod-13', category: 'Production', subcategory: 'Recording', difficulty: 'Advanced',
      title: 'Recording Electric Guitar Like a Pro', tags: ['recording', 'guitar', 'amp'],
      content: 'For recording guitar: mic placement is everything. Start with an SM57 at 45 degrees, 1 inch from the grill cloth, aimed at the cone edge (not center). The center is brighter, the edge is warmer. Record DI signal simultaneously for re-amping later. Use a DI box to split the signal. Double-track your parts (record the same part twice) for width. Pan L and R.',
      actionRequired: 'Record a guitar part: double-track it, pan L/R, try two mic positions.' },
    { id: 'prod-14', category: 'Production', subcategory: 'Production Workflow', difficulty: 'Beginner',
      title: 'The Creative vs. Critical Cycle', tags: ['workflow', 'creativity', 'process'],
      content: 'Split your production sessions into two modes: CREATIVE (writing, sound selection, arrangement) and CRITICAL (mixing, editing, comping). Never mix while writing. Never write while mixing. Creative mode: turn off your analytical brain, just create. Critical mode: turn off your creative brain, just edit. This separation is the single biggest productivity hack in music production.',
      actionRequired: 'Label your next session as CREATIVE or CRITICAL before starting.' },

    // ── SONGWRITING DOMAIN (15) ────────────────────
    { id: 'song-01', category: 'Songwriting', subcategory: 'Lyrics', difficulty: 'Beginner',
      title: 'The Hook-First Method', tags: ['songwriting', 'hook', 'melody'],
      content: 'Write your hook/chorus FIRST before verses. The chorus is the emotional climax — it should contain the title of your song and the core message. Write 3-4 different hook melodies before choosing one. Record them on your phone. The best hook is often the one that gets stuck in YOUR head. If you can\'t stop humming it, neither will your listeners.',
      actionRequired: 'Write 3 different chorus melodies and choose the catchiest one.' },
    { id: 'song-02', category: 'Songwriting', subcategory: 'Lyrics', difficulty: 'Intermediate',
      title: 'Show, Don\'t Tell in Lyrics', tags: ['songwriting', 'lyrics', 'craft'],
      content: 'Instead of saying "I\'m sad," paint a picture: "Rain on the window, coffee\'s gone cold." Instead of "I love you," show it: "You left your toothbrush at my place." Specific details create universal emotions. Use concrete imagery (objects, actions, places) to convey abstract feelings. The listener supplies their own emotional context when you show them a scene.',
      actionRequired: 'Rewrite a line from your latest song using specific imagery instead of abstract emotion.' },
    { id: 'song-03', category: 'Songwriting', subcategory: 'Lyrics', difficulty: 'Advanced',
      title: 'Rhyme Scheme Architecture', tags: ['songwriting', 'rhyme', 'structure'],
      content: 'Use AABB (couplets) for pop accessibility, ABAB (alternating) for lyrical complexity, or internal rhymes for density. The last word of each line is your power position — make it count. Use multi-syllabic rhymes for sophistication: "medication" / "meditation". Near-rhymes (time/mind) often sound more modern than perfect rhymes. Vary your scheme between sections for contrast.',
      actionRequired: 'Analyze the rhyme scheme of your current lyrics and identify patterns.' },
    { id: 'song-04', category: 'Songwriting', subcategory: 'Melody', difficulty: 'Intermediate',
      title: 'Melody Writing with Chord Tones', tags: ['songwriting', 'melody', 'music-theory'],
      content: 'Your melody should primarily use chord tones (root, 3rd, 5th, 7th of the current chord) for strong, resonant phrases. Non-chord tones (passing tones) create tension that resolves when you land on a chord tone. Write your melody first (scat singing or humming), THEN find the chords that support it. Melody is king — harmony serves the melody, not the other way around.',
      actionRequired: 'Hum a new melody, then find the chords that support it.' },
    { id: 'song-05', category: 'Songwriting', subcategory: 'Melody', difficulty: 'Advanced',
      title: 'Motif Development: The Beethoven Method', tags: ['songwriting', 'motif', 'development'],
      content: 'A motif is a short melodic or rhythmic idea (2-4 notes). Develop it by: SEQUENCE (repeat at different pitch), INVERSION (flip intervals), AUGMENTATION (double the note lengths), DIMINUTION (halve the note lengths). Your entire song can be built from one 3-note motif varied across sections. Listen how Beethoven built entire symphonies from 4 notes.',
      actionRequired: 'Create a 3-note motif and develop it 4 different ways.' },
    { id: 'song-06', category: 'Songwriting', subcategory: 'Structure', difficulty: 'Intermediate',
      title: 'The Modern Song Structure Blueprint', tags: ['songwriting', 'structure', 'format'],
      content: 'Standard modern structure: Intro (4-8 bars) → Verse 1 (16 bars) → Pre-Chorus (4-8 bars) → Chorus (8-16 bars) → Verse 2 (16 bars) → Pre-Chorus → Chorus → Bridge (8-16 bars) → Final Chorus (with variation). The bridge should present a NEW chord progression and lyric angle. The final chorus should feel bigger (add harmonies, percussion, intensity). Keep total length under 3:30 for streaming.',
      actionRequired: 'Map your song to this structure and identify what\'s missing.' },
    { id: 'song-07', category: 'Songwriting', subcategory: 'Collaboration', difficulty: 'Intermediate',
      title: 'Co-Writing Best Practices', tags: ['songwriting', 'collaboration', 'etiquette'],
      content: 'Before a co-write: establish split percentages BEFORE writing (50/50 standard), agree on the song\'s direction (topic, vibe, genre), prepare reference tracks. During: one person drives (produces/records), the other contributes ideas. Switch roles every hour. Record everything. After: send the rough mix within 24 hours. Register the split with your PRO immediately.',
      actionRequired: 'Set up a co-write with clear splits and direction agreed in advance.' },

    // ── VOCAL DOMAIN (12) ──────────────────────────
    { id: 'vocal-01', category: 'Vocal', subcategory: 'Technique', difficulty: 'Beginner',
      title: 'Diaphragmatic Breathing for Singers', tags: ['vocal', 'technique', 'breathing'],
      content: 'Place your hand on your stomach. Breathe in — your stomach should expand, not your chest. This is diaphragmatic breathing. Practice: inhale for 4 counts, hold for 4, exhale for 8. Do this for 5 minutes before singing. This gives you consistent breath support, longer phrases, and better pitch control. Your breath is the engine of your voice — strengthen the engine.',
      actionRequired: 'Practice diaphragmatic breathing: inhale 4, hold 4, exhale 8 for 5 minutes daily.' },
    { id: 'vocal-02', category: 'Vocal', subcategory: 'Technique', difficulty: 'Intermediate',
      title: 'Vocal Fry vs. Falsetto: When to Use Each', tags: ['vocal', 'technique', 'register'],
      content: 'Vocal fry (low, crackly register): use for texture, emphasis, and modern pop/R&B phrasing. Falsetto (high, light register): use for emotional peaks, breathiness, and contrast. The most impactful singers move seamlessly between registers. Practice sliding from fry through chest voice to falsetto in one smooth motion. Register flexibility is the mark of a professional vocalist.',
      actionRequired: 'Practice sliding from fry → chest → falsetto in one smooth motion.' },
    { id: 'vocal-03', category: 'Vocal', subcategory: 'Technique', difficulty: 'Advanced',
      title: 'Mixed Voice: The Holy Grail of Singing', tags: ['vocal', 'mixed-voice', 'advanced'],
      content: 'Mixed voice blends chest resonance (power) with head resonance (range). Find it by: sing an "NG" sound (like "sing") and feel the vibration in your mask (nose/cheek area). Maintain that resonance placement while opening to a vowel. Start on a comfortable note and slide up keeping the "NG" placement. Mixed voice allows you to sing high notes with power, not thin falsetto.',
      actionRequired: 'Find your mixed voice: start with "NG" placement and slide to vowels.' },
    { id: 'vocal-04', category: 'Vocal', subcategory: 'Recording', difficulty: 'Intermediate',
      title: 'Vocal Comping: Constructing the Perfect Take', tags: ['vocal', 'recording', 'comping'],
      content: 'Record 3-5 full takes of each section. Label them Take 1-5. After recording, comp (combine) the best phrases from each take into one perfect vocal. Use the "punch-in" technique: re-record only the phrases that need improvement. Keep track of which take/part you liked. A great vocal is often a composite of multiple takes — nobody sings it perfectly in one pass.',
      actionRequired: 'Record 3 vocal takes and comp the best phrases from each.' },
    { id: 'vocal-05', category: 'Vocal', subcategory: 'Processing', difficulty: 'Advanced',
      title: 'Pro Vocal Chain: Signal Path', tags: ['vocal', 'mixing', 'chain', 'processing'],
      content: 'Professional vocal chain: 1) Subtractive EQ (remove mud at 300Hz, harshness at 3kHz), 2) Compressor (3:1 ratio, -3dB reduction), 3) De-esser (tame S sounds at 5-8kHz), 4) Additive EQ (boost presence at 2-4kHz, air at 10kHz), 5) Saturation (Analog Obsession or similar at 10% mix), 6) Reverb (plate or hall), 7) Delay (1/4 note, 15% mix). EQ before compression for cleaner compression, or after for tonal shaping.',
      actionRequired: 'Build a pro vocal chain: EQ → Compressor → De-esser → EQ → Saturation → FX.' },

    // ── MARKETING DOMAIN (15) ─────────────────────────
    { id: 'mkt-01', category: 'Marketing', subcategory: 'Social Media', difficulty: 'Beginner',
      title: 'The 5-5-5 Content Posting Rule', tags: ['marketing', 'social-media', 'content'],
      content: 'Post 5 pieces of educational content (tips, tutorials, behind-the-scenes), 5 pieces of entertaining content (funny, relatable, trending sounds), and 5 promotional posts (new music, merch, shows) per week. The mix keeps your audience engaged without feeling spammy. Educational and entertaining content builds trust. Promotional content converts that trust into action.',
      actionRequired: 'Plan 15 posts for next week: 5 educational, 5 entertaining, 5 promotional.' },
    { id: 'mkt-02', category: 'Marketing', subcategory: 'Social Media', difficulty: 'Intermediate',
      title: 'TikTok/Reels Algorithm Hacks 2026', tags: ['marketing', 'tiktok', 'algorithm', 'viral'],
      content: 'Post at 7-9am or 7-9pm local time for maximum reach. First 2 seconds must hook: use trending sounds, text overlays, or surprising visuals. Use 3 hashtags max (too many hurts reach). Post consistently (1-2x daily) rather than sporadically. Reply to every comment within 1 hour in the first 24 hours. Completion rate is the #1 algorithm signal — make them watch to the end.',
      actionRequired: 'Create a 15-second hook video following TikTok best practices.' },
    { id: 'mkt-03', category: 'Marketing', subcategory: 'Social Media', difficulty: 'Expert',
      title: 'The Funnel: Discovery to Superfan', tags: ['marketing', 'funnel', 'monetization'],
      content: 'Build a funnel: DISCOVERY (TikTok/Reels/YouTube Shorts) → ENGAGEMENT (Email list + Discord) → CONVERSION (Pre-save, merch, tickets) → RETENTION (VIP content, exclusive access). Each stage requires different content. Discovery: high-entertainment, low-effort. Engagement: valuable, personal. Conversion: urgent, exclusive. Retention: grateful, community-focused.',
      actionRequired: 'Map your current funnel and identify which stage is weakest.' },
    { id: 'mkt-04', category: 'Marketing', subcategory: 'Branding', difficulty: 'Intermediate',
      title: 'Artist Brand Identity Framework', tags: ['marketing', 'branding', 'identity'],
      content: 'Your brand is the intersection of: YOUR STORY (origin, struggles, wins), YOUR SOUND (genre, influences, unique elements), YOUR VISUALS (colors, typography, imagery), YOUR VALUES (what you stand for), YOUR COMMUNITY (who listens and why). Define each clearly. Your brand should be recognisable in 1 second of audio OR 1 glance at an image. Consistency across all platforms multiplies recognition.',
      actionRequired: 'Write a one-paragraph brand statement covering story, sound, visuals, values, and community.' },
    { id: 'mkt-05', category: 'Marketing', subcategory: 'Branding', difficulty: 'Advanced',
      title: 'The Sonic Branding Strategy', tags: ['marketing', 'sonic-branding', 'audio'],
      content: 'Create a signature sonic element listeners recognize instantly: a producer tag, a specific synth sound, a vocal effect, or a production quirk. This is your sonic fingerprint. Use it consistently in intros, outros, and transitions. Think of how you can identify a Metro Boomin beat in 2 seconds. That\'s intentional sonic branding. Your sound should be identifiable within the first 3 seconds of a track.',
      actionRequired: 'Define your "sonic fingerprint" — one element that makes your sound instantly recognizable.' },
    { id: 'mkt-06', category: 'Marketing', subcategory: 'Promotion', difficulty: 'Intermediate',
      title: 'Pre-Save Campaign Architecture', tags: ['marketing', 'pre-save', 'campaign'],
      content: 'Launch a pre-save campaign 3-4 weeks before release. Use ToneDen or FeatureFM. Create a landing page with: 30-second snippet, compelling visual, email capture. Drive traffic: email list first (30% conversion), then social (5-10%). Offer incentive: download a free track or exclusive content. Track conversion rates. Each pre-save is a guaranteed first-day stream for algorithm activation.',
      actionRequired: 'Set up a pre-save campaign with email capture and incentive.' },
    { id: 'mkt-07', category: 'Marketing', subcategory: 'Promotion', difficulty: 'Expert',
      title: 'Playlist Pitching Strategy', tags: ['marketing', 'playlists', 'pitching'],
      content: 'Target curators with 10k-100k followers for 15-30% acceptance rate. Mega-playlists (>1M) accept <2%. Use SubmitHub or Groover for cold pitches. Each pitch must be PERSONALIZED: address curator by name, mention why your track fits THEIR specific playlist, not just any playlist. Send a private SoundCloud link (not public). Follow up once after 2 weeks. Track every submission in a spreadsheet.',
      actionRequired: 'Find 10 curators in your genre and prepare personalized pitches.' },
    { id: 'mkt-08', category: 'Marketing', subcategory: 'Email Marketing', difficulty: 'Intermediate',
      title: 'Email List = Algorithm Insurance', tags: ['marketing', 'email', 'algorithm'],
      content: 'Your email list is the ONLY audience asset you own. DSP algorithms change, social platforms die. Email is forever. Aim to convert 20% of social followers to email subscribers. Offer a free download or exclusive content as incentive. Send monthly updates: new music, behind-the-scenes, personal stories. A 1,000-person email list at 30% open rate = 300 guaranteed first-day streams.',
      actionRequired: 'Set up email capture on your website/landing page and create a welcome sequence.' },

    // ── BUSINESS DOMAIN (10) ─────────────────────────
    { id: 'biz-01', category: 'Business', subcategory: 'Revenue', difficulty: 'Beginner',
      title: 'The Independent Artist Revenue Stack', tags: ['business', 'revenue', 'income'],
      content: 'Multiple revenue streams: STREAMING (15% of income, passive), MERCH (30%, high margin), SYNC LICENSING (25%, high value), LIVE PERFORMANCE (20%, inconsistent), BRAND DEALS (10%, requires audience). Relying ONLY on streaming is financial suicide. The average independent artist makes $0.003 per stream. You need 333,000 streams to earn $1,000. Diversify or die.',
      actionRequired: 'Calculate your current revenue mix and identify missing streams.' },
    { id: 'biz-02', category: 'Business', subcategory: 'Revenue', difficulty: 'Advanced',
      title: 'Publishing Revenue Streams Explained', tags: ['business', 'publishing', 'royalties'],
      content: 'Publishing revenue: PERFORMANCE ROYALTIES (radio, live, streaming — collected by PRO), MECHANICAL ROYALTIES (physical/digital sales — collected by MLC/Harry Fox), SYNC ROYALTIES (TV/film/game placements — negotiated directly). Register with a PRO (ASCAP/BMI/SESAC) for performance. Register with the MLC for mechanical. These are SEPARATE from master royalties. Don\'t leave money on the table.',
      actionRequired: 'Register with a PRO and the MLC if you haven\'t already.' },
    { id: 'biz-07', category: 'Business', subcategory: 'Revenue', difficulty: 'Intermediate',
      title: 'Merch as Your Primary Revenue Driver', tags: ['business', 'merch', 'revenue'],
      content: 'Merch should be 30%+ of your income. Start with 3 items: T-shirt ($25), Hoodie ($50), Hat ($20). Print-on-demand (Printful, Printify) eliminates inventory risk. Sell at shows (highest conversion) and online. Bundle merch with music for higher average order value. Limited drops create urgency. Your merch is not just clothing — it\'s a billboard for your brand.',
      actionRequired: 'Design 3 merch items and set up a print-on-demand store.' },
    { id: 'biz-05', category: 'Business', subcategory: 'Strategy', difficulty: 'Advanced',
      title: 'The 360 Deal: What They Don\'t Tell You', tags: ['business', '360-deal', 'legal'],
      content: 'A 360 deal gives the label a percentage of ALL revenue (touring, merch, sync, publishing) not just recorded music. Standard: 15-25%. NEVER sign without: a reversion clause (rights return after X years), a minimum commitment clause (label must spend $X on marketing), a cap on 360 participation. If a label offers 360, they should be bringing significant value — not just distribution.',
      actionRequired: 'Review any existing deals for 360 clauses and reversion terms.' },
    { id: 'biz-06', category: 'Business', subcategory: 'Strategy', difficulty: 'Intermediate',
      title: 'Building Your Team: When to Hire', tags: ['business', 'team', 'management'],
      content: 'Hire in this order: GRAPHIC DESIGNER (first — visual identity), SOCIAL MEDIA MANAGER (second — consistent content), BOOKING AGENT (third — live shows), PUBLICIST (fourth — press coverage), BUSINESS MANAGER (fifth — finances). Don\'t hire until you can afford to pay them fairly. Equity (percentage of revenue) can substitute for salary early on. Always have a written agreement.',
      actionRequired: 'Identify your first hire and budget for them.' },

    // ── LEGAL DOMAIN (8) ─────────────────────────────
    { id: 'legal-01', category: 'Legal', subcategory: 'Copyright', difficulty: 'Intermediate',
      title: 'Copyright Registration: Complete Guide', tags: ['legal', 'copyright', 'protection'],
      content: 'Copyright exists the moment you create a work, but registration is required to sue for infringement. Register with the US Copyright Office (or your country\'s equivalent). Cost: $45-65 per work. You can register multiple songs as a collection. Registration establishes a public record and enables statutory damages ($750-$30,000 per infringement + legal fees). Without registration, you can only sue for actual damages — which are nearly impossible to prove.',
      actionRequired: 'Register your 3 most valuable tracks with the Copyright Office this week.' },
    { id: 'legal-02', category: 'Legal', subcategory: 'Contracts', difficulty: 'Advanced',
      title: 'The Split Sheet: Your Most Important Document', tags: ['legal', 'splits', 'collaboration'],
      content: 'A split sheet is a written agreement that establishes ownership percentages BEFORE a collaboration. It should specify: track title, date, each contributor\'s name, PRO affiliation, percentage share of publishing AND master, contact info, signatures. Without a split sheet, disputes end up in court (or destroyed relationships). Standard splits: producer 50% master, writers split publishing equally.',
      actionRequired: 'Create a split sheet template and use it for your next collaboration.' },
    { id: 'legal-03', category: 'Legal', subcategory: 'Contracts', difficulty: 'Expert',
      title: 'Producer Agreement Essentials', tags: ['legal', 'producer', 'contract'],
      content: 'A producer agreement should cover: EXCLUSIVITY (is the beat exclusive or leased?), CREDIT (producer name in title/scoring), ROYALTIES (points on master — typically 15-50%), TERM (how long does the agreement last?), TERRITORY (worldwide or limited?), USAGE (streaming, sync, live?). A standard producer lease agreement grants non-exclusive rights for a specific number of streams/units. Exclusive beats cost significantly more.',
      actionRequired: 'Review any producer agreements for exclusivity clauses and royalty terms.' },
    { id: 'legal-04', category: 'Legal', subcategory: 'Rights', difficulty: 'Expert',
      title: 'Sample Clearance: Legal & Affordable', tags: ['legal', 'samples', 'clearance'],
      content: 'Using uncleared samples is risky. Clearance typically costs 50% of the master + 50% of publishing. If a sample is unrecognizable after processing (pitch-shifted, chopped, filtered), it may be legally safe under "de minimis" use — but this is risky. Use royalty-free sample packs (Splice, Loopmasters) for safety. TrackSuite or ClearanceRight can help with the clearance process. A lawsuit can cost $150k+ to defend.',
      actionRequired: 'Audit your current projects for any uncleared samples and process or replace them.' },

    // ── DISTRIBUTION DOMAIN (6) ─────────────────────
    { id: 'dist-01', category: 'Distribution', subcategory: 'Strategy', difficulty: 'Beginner',
      title: 'Distributor Comparison: Who to Use', tags: ['distribution', 'distributor', 'platform'],
      content: 'Distributor comparison: DistroKid ($22/yr, unlimited uploads, easy), TuneCore ($29/yr per single, keeps 0%), CD Baby ($9.99/single, keeps 9% of sales), AWAL (invite-only, takes 15%, offers advances), UnitedMasters (free tier takes 10%, Select tier $59/yr). For beginners: DistroKid or TuneCore. For established: AWAL or UnitedMasters Select. All deliver to Spotify, Apple Music, etc.',
      actionRequired: 'Choose a distributor and upload your next release.' },
    { id: 'dist-02', category: 'Distribution', subcategory: 'Strategy', difficulty: 'Intermediate',
      title: 'Release Day Checklist: 14 Days Out', tags: ['distribution', 'checklist', 'release'],
      content: '14 days before: Submit to Spotify editorial (via Spotify for Artists). 7 days before: Final master approved, ISRC codes assigned, artwork confirmed, pre-save live. 3 days before: Social media campaign begins, email list notified. RELEASE DAY: Post on all platforms, pitch to 20+ playlists, send to all press contacts. 7 days after: Thank supporters, analyze streaming data, start next release cycle.',
      actionRequired: 'Create a release day timeline with all deadlines.' },

    // ── CAREER DOMAIN (6) ──────────────────────────
    { id: 'career-01', category: 'Career', subcategory: 'Growth', difficulty: 'Beginner',
      title: 'The Independent Artist Roadmap', tags: ['career', 'growth', 'roadmap'],
      content: 'Stage 1: FOUNDATION (months 1-6) — Release 5+ tracks, build social presence, define brand. Stage 2: GROWTH (months 6-18) — Release consistently, grow email list, play local shows. Stage 3: MOMENTUM (months 18-36) — First EP/album, regional touring, sync placements. Stage 4: SCALE (years 3-5) — Full team, national touring, label/distribution partnerships. Each stage has different priorities. Don\'t skip stages.',
      actionRequired: 'Identify your current stage and focus on that stage\'s priorities only.' },
    { id: 'career-02', category: 'Career', subcategory: 'Growth', difficulty: 'Intermediate',
      title: 'Networking: Quality > Quantity', tags: ['career', 'networking', 'relationships'],
      content: 'Build 10 deep industry relationships rather than 100 shallow ones. Quality relationships lead to collaborations, playlists, and opportunities. Attend 1-2 industry events per month (conferences, showcases, networking events). Follow up within 24 hours. Provide value before asking for favors. Support their work genuinely. A strong network is your single most valuable career asset — more than talent.',
      actionRequired: 'Reach out to 3 people in your network this week with genuine value, not asks.' },
  ];

  getAllKnowledge(): KnowledgeEntry[] {
    return this.knowledgeBase;
  }

  getByCategory(category: KnowledgeCategory): KnowledgeEntry[] {
    return this.knowledgeBase.filter(e => e.category === category);
  }

  getByTags(tags: string[]): KnowledgeEntry[] {
    return this.knowledgeBase.filter(e => 
      tags.some(t => e.tags.includes(t.toLowerCase()))
    );
  }

  search(query: string): KnowledgeEntry[] {
    const q = query.toLowerCase();
    return this.knowledgeBase.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some(t => t.includes(q)) ||
      e.category.toLowerCase().includes(q) ||
      e.subcategory.toLowerCase().includes(q)
    );
  }

  getRandomByCategory(category: KnowledgeCategory): KnowledgeEntry | null {
    const entries = this.getByCategory(category);
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

  generateLesson(domain: KnowledgeCategory): { title: string; steps: string[]; sourceEntry: KnowledgeEntry } | null {
    const entry = this.getRandomByCategory(domain);
    if (!entry) return null;

    const actionStep = entry.actionRequired ? `ACTION: ${entry.actionRequired}` : null;
    const steps = [
      `STUDY: ${entry.title}`,
      `DIFFICULTY: ${entry.difficulty}`,
      `READ: ${entry.content.substring(0, 200)}...`,
      ...(actionStep ? [actionStep] : []),
      `APPLY: Practice this technique in your current session.`,
      `REVIEW: Listen back and compare with your previous approach.`,
    ];

    return {
      title: `S.M.U.V.E LESSON: ${entry.title}`,
      steps,
      sourceEntry: entry,
    };
  }
}
