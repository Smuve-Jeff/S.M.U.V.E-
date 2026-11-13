import { Injectable } from '@angular/core';
import {
  COMPLETE_GUIDE_LESSONS,
  CompleteGuideLesson,
} from '../components/settings/complete-app-guide.lessons';

/**
 * S.M.U.V.E.'s two teaching surfaces.
 *
 * #Teach is an in-app feature walkthrough: it points at a shipped workspace and
 * only repeats instructions that exist in the app guide. #Learn is craft
 * education: the professional mechanics behind directing, acting, music video,
 * podcast/vlog and book publishing. Neither surface writes a lesson for the
 * artist — S.M.U.V.E. is the only teacher.
 */
export interface LearnTrack {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  concepts: readonly string[];
  practice: readonly string[];
  mistake: string;
  route?: string;
  action?: string;
  keywords: readonly string[];
}

export interface TeachTopic {
  lesson: CompleteGuideLesson;
  aliases: readonly string[];
}

/** Search terms that do not appear verbatim in the guide copy. */
const TEACH_ALIASES: Record<string, readonly string[]> = {
  shell: ['app', 'navigation', 'sidebar', 'command palette'],
  hub: ['home', 'dashboard', 'label hub'],
  studio: ['beat', 'record', 'mix', 'master', 'production', 'daw'],
  rhythm: ['drums', 'piano roll', 'performance', 'dj', 'sampler', 'sound pads'],
  create: [
    'lyrics',
    'lyric editor',
    'songwriting',
    'write',
    'composition',
    'cowrite',
    'academy',
    'book',
    'books',
    'writer',
    'writers pad',
    'pages',
    'manuscript',
  ],
  lab: ['image video lab', 'image and video', 'video', 'visuals', 'editing'],
  spot: ['tha spot', 'community', 'games', 'arcade', 'lobby'],
  career: ['strategy', 'analytics', 'profile', 'coach'],
  business: ['business suite', 'release', 'royalties', 'splits', 'rights', 'publishing'],
  intelligence: ['assistant', 'chatbot', 'ai', 'command center', 'voice lab'],
};

export const LEARN_TRACKS: readonly LearnTrack[] = [
  {
    id: 'director',
    title: 'Directing: Build the Visual Argument',
    kicker: 'DIRECTOR · FILM & VIDEO',
    summary:
      'A director does not decorate a script. You decide what the audience looks at, what they feel, and what each shot proves.',
    concepts: [
      'Story spine: want → obstacle → turn → resolution. If a scene does not move that spine, cut it or rewrite it.',
      'Coverage has a job: a master keeps geography, a medium holds performance, a close-up marks a decision, and inserts give the edit control.',
      'Shot size is emphasis. Move in when the character decides; pull out when the world answers.',
      'Screen direction and eyelines are grammar. Crossing the line can read as confusion unless the cut deliberately earns it.',
      'A cut should answer a question, ask a new one, or change the pressure. Cutting on every beat is not direction.',
    ],
    practice: [
      'Write a one-page treatment: beginning, turn, ending, and the single image you want remembered.',
      'Build the shot list by story beat, not by location. Mark the one shot that carries each scene.',
      'Cut a scene on paper before the shoot: name the reason for every cut and the frame you leave on.',
      'On set, protect the performance take first, then the coverage you actually need. Time is a story budget.',
    ],
    mistake:
      'Covering everything so the edit can decide later. Coverage without a point of view produces footage, not a scene.',
    route: '/image-video-lab',
    action: 'Open Image & Video Lab',
    keywords: ['direct', 'directing', 'director', 'film', 'cinema', 'shot', 'coverage'],
  },
  {
    id: 'actor',
    title: 'Acting: Play an Action, Not an Emotion',
    kicker: 'ACTOR · SCREEN PERFORMANCE',
    summary:
      'The camera reads thought. Play a need, put it against an obstacle, and let the audience catch you deciding.',
    concepts: [
      'Objective: what your character wants from the other person in this scene. Make it playable, not an abstraction.',
      'Obstacle: the reason the want cannot be satisfied yet. Without resistance there is no scene.',
      'Action: the verb you play moment to moment — persuade, protect, test, wound, forgive. Emotions are a result, not an instruction.',
      'Given circumstances: who, where, when, what happened before, and what is at stake if this conversation fails.',
      'Listening is half the performance. React to what the other actor actually does, not the line you expected.',
      'On camera, stillness reads. A thought held behind the eyes is often stronger than a gesture added for the back row.',
    ],
    practice: [
      'Break the scene into beats. Give every beat one action verb and one change.',
      'Rehearse two takes with different objectives. The lines stay; the behaviour should not.',
      'Record a self-tape with the lens at eye level, a clean background, and your full body in frame when the scene needs it.',
      'Watch the playback with the sound off. If the story is unreadable in your face and body, the inner action is not landing.',
    ],
    mistake:
      'Indicating the emotion the script names. Playing “sad” is a result; playing “hide the truth from the person I love” gives the camera something to watch.',
    route: '/image-video-lab',
    action: 'Open the camera in Image & Video Lab',
    keywords: ['act', 'acting', 'actor', 'audition', 'self tape', 'performance', 'character'],
  },
  {
    id: 'music-video',
    title: 'Music Videos: Cut the Song, Not the Footage',
    kicker: 'MUSIC VIDEO · VISUAL PRODUCTION',
    summary:
      'The track is the edit. Decide the visual idea, map it to the song’s sections, then shoot only the coverage that serves that map.',
    concepts: [
      'One visual idea that can survive the whole runtime beats five ideas that each last eight bars.',
      'Beat map: mark intro, verse, pre-chorus, hook, bridge and outro. Give each section one visual job and one change.',
      'Performance, narrative and texture are three materials. Mix them deliberately; random intercutting reads as filler.',
      'Cut on motion, lyric emphasis or a new visual question — not on every kick. The song already has a rhythm.',
      'Hero framing matters more than coverage volume: a repeatable look, consistent eyeline, and a performance take with real energy.',
      'Finish for the destination: vertical, square and 16:9 are separate compositions, not the same frame cropped later.',
    ],
    practice: [
      'Write a treatment shorter than one page: concept, world, three images, and how the hook pays it off.',
      'Build a beat map with a shot or transition for each section before you book anything.',
      'Shoot the performance first while energy is high; protect one clean take with no effects or crowd.',
      'Assemble a rough cut with temp titles, then watch it muted. If the story still reads, the visual structure is working.',
    ],
    mistake:
      'Shooting a pile of cool shots and hoping the edit finds a video. Start from the section map; every setup should have a named job.',
    route: '/image-video-lab',
    action: 'Open Image & Video Lab',
    keywords: ['music video', 'video', 'visual', 'treatment', 'beat map', 'youtube'],
  },
  {
    id: 'podcast-vlog',
    title: 'Podcast & Vlog: Earn the Next Minute',
    kicker: 'PODCAST / VLOG · IMAGE & VIDEO LAB',
    summary:
      'An episode is a promise repeated. Say what the viewer gets, deliver one clear idea, and remove everything that delays it.',
    concepts: [
      'Format promise: a listener should know the show’s subject, tone and rhythm within the first thirty seconds.',
      'Cold open with the strongest moment, then context. Do not spend three minutes introducing what the episode is about.',
      'One episode, one through-line. Tangents are only useful if they sharpen the central question.',
      'Audio is the floor: speak across the mic, keep a consistent distance, treat the room, and record a clean backup track.',
      'For video, frame for the platform and light the eyes. A static, well-lit talking head beats roaming handheld coverage with no visual plan.',
      'Edit for attention: cut dead air, false starts and repeated points. Keep pauses that carry meaning.',
      'Publish with a title that states the payoff, a short description, chapters or timestamps, and two vertical clips that work without context.',
    ],
    practice: [
      'Write a one-sentence promise for the episode and a three-beat outline: hook, idea, takeaway.',
      'Record a thirty-second test and listen on phone speakers before the real take.',
      'Mark your best ninety seconds while recording, so the promo clip is a decision rather than a search.',
      'After the edit, watch the first minute with a stranger’s patience. If the promise is not clear, recut the open.',
    ],
    mistake:
      'Recording a long conversation and calling the raw length an episode. Editing is where the show’s point of view is built.',
    route: '/image-video-lab',
    action: 'Open Image & Video Lab',
    keywords: ['podcast', 'vlog', 'interview', 'youtube', 'broadcast', 'episode', 'microphone'],
  },
  {
    id: 'books',
    title: 'Books: Write, Revise, Publish',
    kicker: 'AUTHOR · BOOKS & PUBLISHING',
    summary:
      'A novel is built in passes: premise, structure, scenes, revision, then production. Do not polish sentences while the story is still moving.',
    concepts: [
      'Premise in one sentence: protagonist + want + obstacle + stakes. If you cannot say it, the book does not know what it is yet.',
      'Structure gives the reader a promise: an inciting turn, a midpoint reversal, a low point, a climax, and a changed world.',
      'Every scene needs a goal, conflict and a turn. If nothing changes, it is summary — useful glue, not a scene.',
      'A common adult novel runs roughly 80,000–100,000 words, but genre and audience set the real target. Check the category before you draft to it.',
      'Revision is separate work: structure pass, scene pass, line edit, then proofread. Do not line-edit material you may cut.',
      'Publishing is a business choice. Traditional publishing usually means querying an agent; small press and self-publishing trade different amounts of control, cost and timeline.',
      'Self-publishing needs an editor, a cover that reads at thumbnail size, an ISBN decision, formatting, distribution and a launch plan. Check current terms and costs yourself.',
    ],
    practice: [
      'Write the premise and the ending before chapter one. The ending is the promise the book keeps.',
      'Use the Writer’s Pad: one page per chapter or scene, name each page, and save the manuscript locally as you go.',
      'Finish a messy first draft before a structural edit. A beautiful half-book is still a half-book.',
      'Read each page aloud. If you run out of breath or lose the thread, the sentence is doing too much.',
      'Before publishing, get a developmental edit, a copyedit, a proofread and honest beta readers. Then check imprint, ISBN and distribution terms yourself.',
    ],
    mistake:
      'Rewriting chapter one for months while the ending is still unknown. Draft forward, then fix the whole book with the ending in view.',
    route: '/lyric-editor',
    action: 'Open the Writer’s Pad',
    keywords: ['book', 'books', 'novel', 'author', 'writing', 'publish', 'publishing', 'isbn', 'chapter'],
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanTopic(value: string): string {
  return normalize(
    value.replace(/^(?:me|us|about|on|how to use|how to|the)\s+/i, '')
  );
}

@Injectable({ providedIn: 'root' })
export class SmuveTeachLearnService {
  readonly teachTopics: readonly TeachTopic[] = COMPLETE_GUIDE_LESSONS.map(
    (lesson) => ({
      lesson,
      aliases: TEACH_ALIASES[lesson.id] ?? [],
    })
  );

  readonly learnTracks = LEARN_TRACKS;

  findTeach(query?: string): CompleteGuideLesson | null {
    const topic = cleanTopic(query ?? '');
    if (!topic) return null;

    for (const entry of this.teachTopics) {
      const names = [
        entry.lesson.id,
        entry.lesson.title,
        entry.lesson.workspaceLabel,
        ...entry.aliases,
      ].map(normalize);
      if (
        names.some(
          (name) =>
            name === topic ||
            (topic.length >= 4 && name.includes(topic)) ||
            (name.length >= 4 && topic.includes(name))
        )
      ) {
        return entry.lesson;
      }
    }

    return (
      this.teachTopics.find((entry) => {
        const haystack = normalize(
          [
            entry.lesson.title,
            entry.lesson.kicker,
            entry.lesson.workspaceLabel,
            entry.lesson.summary,
            ...entry.lesson.features,
            ...entry.aliases,
          ].join(' ')
        );
        return topic.split(' ').every((word) => haystack.includes(word));
      })?.lesson ?? null
    );
  }

  findLearn(query?: string): LearnTrack | null {
    const topic = cleanTopic(query ?? '');
    if (!topic) return null;

    for (const track of this.learnTracks) {
      const names = [track.id, track.title, ...track.keywords].map(normalize);
      if (
        names.some(
          (name) =>
            name === topic ||
            (topic.length >= 4 && name.includes(topic)) ||
            (name.length >= 4 && topic.includes(name))
        )
      ) {
        return track;
      }
    }

    return (
      this.learnTracks.find((track) => {
        const haystack = normalize(
          [
            track.title,
            track.kicker,
            track.summary,
            ...track.keywords,
            ...track.concepts,
          ].join(' ')
        );
        return topic.split(' ').every((word) => haystack.includes(word));
      }) ?? null
    );
  }

  formatTeach(lesson: CompleteGuideLesson): string {
    return [
      `#TEACH // ${lesson.title.toUpperCase()}`,
      `${lesson.kicker} · ${lesson.workspaceLabel} · ${lesson.route}`,
      lesson.summary,
      'STEP BY STEP',
      ...lesson.steps.map((step, index) => `${index + 1}. ${step}`),
      'WHAT YOU CAN USE',
      ...lesson.features.map((feature) => `• ${feature}`),
      `THE MISTAKE TO AVOID: ${lesson.mistake}`,
    ].join('\n\n');
  }

  formatLearn(track: LearnTrack): string {
    return [
      `#LEARN // ${track.title.toUpperCase()}`,
      track.kicker,
      track.summary,
      'CORE CONCEPTS',
      ...track.concepts.map((concept) => `• ${concept}`),
      'PUT IT TO WORK',
      ...track.practice.map((step, index) => `${index + 1}. ${step}`),
      `THE PRO MISTAKE: ${track.mistake}`,
      track.action ? `NEXT: ${track.action} — type #teach for an app walkthrough.` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  teachIndex(query?: string): string {
    const requested = query?.trim();
    return [
      requested
        ? `No app module matched “${requested}”.`
        : 'S.M.U.V.E. TEACH — choose the feature you want to operate.',
      'I teach only what is actually shipped in this application. Ask by name:',
      ...this.teachTopics.map(
        ({ lesson }) =>
          `• ${lesson.workspaceLabel} — ${lesson.kicker.toLowerCase()} (${lesson.route})`
      ),
      'Use: #teach studio · #teach image video lab · #teach tha spot · #teach lyrics',
    ].join('\n');
  }

  learnIndex(query?: string): string {
    const requested = query?.trim();
    return [
      requested
        ? `No craft track matched “${requested}”.`
        : 'S.M.U.V.E. LEARN — professional mechanics, not vibes.',
      'Pick the discipline:',
      ...this.learnTracks.map(
        (track) => `• ${track.title} — ${track.kicker.toLowerCase()}`
      ),
      'Use: #learn directing · #learn acting · #learn music videos · #learn podcast · #learn books',
    ].join('\n');
  }
}
