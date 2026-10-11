import { Injectable, Injector, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UserProfileService } from './user-profile.service';
import {
  findPersona,
  getPersonaOption,
  personaRoster,
  SMUVE_PERSONAS,
} from '../types/persona.types';
import { ProjectService } from './project.service';
import { ProjectWorkspaceService } from '../studio/project-workspace.service';
import { MusicManagerService } from './music-manager.service';
import { NotificationService } from './notification.service';
import { AiService } from './ai.service';
import { SnackbarService } from './snackbar.service';
import {
  SmuveKnowledgeEngine,
  KnowledgeCategory,
} from './smuve-knowledge-engine';
import { SongwritingAssistantService } from './songwriting-assistant.service';
import { AiBeatGeneratorService } from './ai-beat-generator.service';
import { CoWriteService } from './cowrite.service';

export interface ControlCommand {
  domain: ControlDomain;
  action: string;
  target?: string;
  parameters?: Record<string, any>;
  requiresConfirmation: boolean;
}

export type ControlDomain =
  | 'studio'
  | 'mixer'
  | 'project'
  | 'tracks'
  | 'profile'
  | 'voice'
  | 'ai'
  | 'knowledge'
  | 'teach'
  | 'mimic'
  | 'export'
  | 'navigation'
  | 'vocal'
  | 'arrangement';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  actionRequired?: string;
  duration?: string;
}

/** Informational command actions that never require full control. */
const READ_ONLY_CONTROL_ACTIONS = new Set([
  'formats',
  'status',
  'overview',
  'list',
  'count',
  'available',
  // Searching the knowledge base only reads it, even when the topic mentions
  // a guarded verb like "release strategy".
  'search',
]);

@Injectable({ providedIn: 'root' })
export class SmuveTotalControlService {
  private router = inject(Router);
  private injector = inject(Injector);
  private pending: { input: string; state: string; expires: number } | null = null;
  private userProfile = inject(UserProfileService);
  private projectService = inject(ProjectService);
  private musicManager = inject(MusicManagerService);
  private notification = inject(NotificationService);
  private snackbar = inject(SnackbarService);
  private ai = inject(AiService);
  private knowledge = inject(SmuveKnowledgeEngine);
  private songwriting = inject(SongwritingAssistantService);
  private beatGenerator = inject(AiBeatGeneratorService);
  private cowrite = inject(CoWriteService);

  activeCommand = signal<ControlCommand | null>(null);
  commandHistory = signal<CommandResult[]>([]);
  isTeaching = signal(false);
  currentLesson = signal<any>(null);

  async executeCommand(input: string): Promise<CommandResult> {
    const normalized = input.trim().toLowerCase();
    if (/^(?:no|cancel|\/cancel)$/.test(normalized)) {
      this.pending = null;
      return { success: true, message: 'Cancelled. Your session remains untouched.' };
    }
    let confirmed = false;
    if (/^(?:yes|confirm|\/confirm)$/.test(normalized)) {
      const pending = this.pending;
      this.pending = null;
      if (!pending || pending.expires < Date.now() || pending.state !== this.sessionState()) {
        return { success: false, message: 'No current confirmation, or the session changed. Request the action again.' };
      }
      input = pending.input;
      confirmed = true;
    } else {
      this.pending = null;
    }
    const command = this.parseCommand(input);
    if (!command) {
      return {
        success: false,
        message:
          'Command not recognized. Try: /studio, /teach, /mimic, /knowledge, etc.',
      };
    }

    const controlEnabled =
      this.userProfile.profile().settings?.ai?.aiTotalControlEnabled === true;
    // Asking what export formats exist, or for a track list, is not a change.
    const readOnly = READ_ONLY_CONTROL_ACTIONS.has(command.action);
    if (!readOnly && this.requiresFullControl(command) && !controlEnabled) {
      return {
        success: false,
        message:
          'S.M.U.V.E. Prime Full-Control Mode is off. S.M.U.V.E. will advise on projects, profile, and exports, but will not change them until you grant command authority in Settings → AI (or type /ai totalcontrol).',
        actionRequired: 'Enable AI Total Control in Settings',
      };
    }
    // Full Control permits reversible edits, never silent destructive changes.
    if (!readOnly && this.isGuarded(command) && !confirmed) {
      this.pending = { input, state: this.sessionState(), expires: Date.now() + 60_000 };
      return {
        success: false,
        message: `Review: ${input}. This can replace or remove work. Type /confirm within 60 seconds to execute this exact request, or /cancel.`,
        actionRequired: 'Confirm with /confirm or cancel with /cancel',
      };
    }

    this.activeCommand.set(command);
    try {
      const result = await this.routeCommand(command);
      this.commandHistory.update((h) => [...h.slice(-19), result]);
      return result;
    } catch {
      // A command failure must not leave the UI in a permanently "running"
      // state or bubble into the global anomaly reporter. The chat receives a
      // recoverable result and can keep the conversation moving.
      const result: CommandResult = {
        success: false,
        message:
          'S.M.U.V.E. could not complete that command safely. Check the target and try again.',
      };
      this.commandHistory.update((h) => [...h.slice(-19), result]);
      return result;
    } finally {
      this.activeCommand.set(null);
    }
  }

  /**
   * Which commands need the artist to have granted command authority.
   *
   * Read-only questions always work (asking for export formats or a track list
   * is not a change), and opening the profile editor is navigation. Everything
   * that writes — projects, exports, profile mutations, and any delete/remove/
   * publish/reset verb — needs Full-Control Mode.
   */
  private sessionState(): string {
    return JSON.stringify({ tracks: this.musicManager.tracks(), project: this.musicManager.projectName, profile: this.userProfile.profile() });
  }

  private isGuarded(command: ControlCommand): boolean {
    return /^(?:delete|remove|publish|release|send|overwrite|clear|reset)(?:\s|$)/i.test(command.action)
      || (command.domain === 'project' && /^(new|create)$/.test(command.action));
  }

  private requiresFullControl(command: ControlCommand): boolean {
    if (READ_ONLY_CONTROL_ACTIONS.has(command.action)) return false;
    if (command.domain === 'navigation' || command.domain === 'knowledge' || command.domain === 'teach' || command.domain === 'mimic' || command.domain === 'vocal') return false;
    if (command.domain === 'profile' && /^(edit|open)$/.test(command.action)) return false;
    if (command.domain === 'ai') {
      return /^(cowrite|cowrite-end|harmony|harmonize|melody|exportstudio|saveproject)$/.test(command.action);
    }
    if (command.domain === 'export') return false; // Opens export UI; does not render or publish.
    if (command.domain === 'studio' && command.action === 'tempo') return false; // Help, not 120 BPM reset.
    return ['studio', 'mixer', 'tracks', 'project', 'profile'].includes(command.domain);
  }

  private parseCommand(input: string): ControlCommand | null {
    const text = input.toLowerCase().trim();

    // Co-Write commands
    if (text === '/cowrite' || text === '/cowrite help') {
      return {
        domain: 'ai',
        action: 'cowrite-help',
        requiresConfirmation: false,
      };
    }
    if (text === '/cowrite lyrics' || text === '/cowrite compile') {
      return {
        domain: 'ai',
        action: 'cowrite-lyrics',
        requiresConfirmation: false,
      };
    }
    if (text === '/cowrite status') {
      return {
        domain: 'ai',
        action: 'cowrite-status',
        requiresConfirmation: false,
      };
    }
    if (text === '/cowrite end' || text === '/cowrite stop') {
      return {
        domain: 'ai',
        action: 'cowrite-end',
        requiresConfirmation: false,
      };
    }

    // Navigate to co-write studio
    if (text === '/cowrite studio' || text === '/cowrite open') {
      return {
        domain: 'navigation',
        action: 'navigate',
        target: 'cowrite',
        requiresConfirmation: false,
      };
    }

    if (text.startsWith('/cowrite ')) {
      const query = text.replace('/cowrite ', '');
      return {
        domain: 'ai',
        action: 'cowrite',
        target: query,
        requiresConfirmation: false,
      };
    }

    // Beat generation commands
    if (text.startsWith('/beat ')) {
      const query = text.replace('/beat ', '');
      // Check for title: /beat drake "my song"
      const titleMatch = query.match(/^(.+?)\s+"(.+)"$/);
      if (titleMatch) {
        return {
          domain: 'ai',
          action: 'beat',
          target: titleMatch[1],
          parameters: { title: titleMatch[2] },
          requiresConfirmation: false,
        };
      }
      return {
        domain: 'ai',
        action: 'beat',
        target: query,
        requiresConfirmation: false,
      };
    }
    if (text === '/beat') {
      return { domain: 'ai', action: 'beat', requiresConfirmation: false };
    }

    // Comping commands
    if (text === '/comp' || text === '/comps') {
      return {
        domain: 'navigation',
        action: 'navigate',
        target: 'vocal-suite',
        requiresConfirmation: false,
      };
    }

    // Songwriting commands
    if (text.startsWith('/write ') || text.startsWith('/song ')) {
      const prompt = text.replace(/^\/(write|song) /, '');
      return {
        domain: 'ai',
        action: 'songwrite',
        target: prompt,
        requiresConfirmation: false,
      };
    }
    if (text === '/write' || text === '/song' || text === '/songwrite') {
      return { domain: 'ai', action: 'songwrite', requiresConfirmation: false };
    }

    // Navigation commands
    if (text.startsWith('/go ') || text.startsWith('/navigate ')) {
      const target = text.replace(/^\/(go|navigate) /, '');
      return {
        domain: 'navigation',
        action: 'navigate',
        target,
        requiresConfirmation: false,
      };
    }
    if (text === '/go' || text === '/navigate') {
      return {
        domain: 'navigation',
        action: 'destinations',
        requiresConfirmation: false,
      };
    }

    // Studio commands
    if (text.startsWith('/studio ')) {
      const action = text.replace('/studio ', '');
      return { domain: 'studio', action, requiresConfirmation: false };
    }
    if (text === '/studio') {
      return {
        domain: 'navigation',
        action: 'navigate',
        target: 'studio',
        requiresConfirmation: false,
      };
    }

    // Mixer commands
    if (text.startsWith('/mixer ') || text.startsWith('/mix ')) {
      const action = text.replace(/^\/(mixer|mix) /, '');
      return { domain: 'mixer', action, requiresConfirmation: false };
    }
    if (text === '/mixer' || text === '/mix') {
      return {
        domain: 'navigation',
        action: 'navigate',
        target: 'mixer',
        requiresConfirmation: false,
      };
    }

    // Track commands — `/track list` and `/tracks list` are both offered in the
    // command help, so both forms have to resolve.
    if (text === '/track' || text === '/tracks') {
      return { domain: 'tracks', action: 'list', requiresConfirmation: false };
    }
    if (text.startsWith('/track ') || text.startsWith('/tracks ')) {
      const action = text.replace(/^\/tracks? /, '');
      return { domain: 'tracks', action, requiresConfirmation: false };
    }

    // Project commands
    if (text.startsWith('/project ')) {
      const action = text.replace('/project ', '');
      return { domain: 'project', action, requiresConfirmation: true };
    }
    if (text === '/project') {
      return { domain: 'project', action: 'overview', requiresConfirmation: false };
    }

    // Profile commands
    if (text.startsWith('/profile ')) {
      const action = text.replace('/profile ', '');
      return { domain: 'profile', action, requiresConfirmation: true };
    }
    if (text === '/profile') {
      return { domain: 'profile', action: 'status', requiresConfirmation: false };
    }

    // Voice commands
    if (text.startsWith('/voice ') || text.startsWith('/vocal ')) {
      const action = text.replace(/^\/(voice|vocal) /, '');
      return { domain: 'vocal', action, requiresConfirmation: false };
    }
    if (text === '/voice' || text === '/vocal') {
      return { domain: 'vocal', action: 'overview', requiresConfirmation: false };
    }

    // Knowledge / Learn commands
    if (
      text.startsWith('/learn ') ||
      text.startsWith('/knowledge ') ||
      text.startsWith('/study ')
    ) {
      const topic = text.replace(/^\/(learn|knowledge|study) /, '');
      return {
        domain: 'knowledge',
        action: 'search',
        target: topic,
        requiresConfirmation: false,
      };
    }
    if (text === '/learn' || text === '/knowledge' || text === '/study') {
      return {
        domain: 'knowledge',
        action: 'overview',
        requiresConfirmation: false,
      };
    }

    // Knowledge-base sync — the /sync_kb chip in the chatbot footer.
    if (text === '/sync_kb' || text === '/sync-kb' || text === '/synckb') {
      return { domain: 'ai', action: 'sync-kb', requiresConfirmation: false };
    }

    // Marketing & business quick chips — these read from the knowledge engine
    // so an artist tapping "PROMO" gets a plan, not "Command not recognized".
    if (text === '/promo' || text === '/hooks') {
      return {
        domain: 'knowledge',
        action: 'search',
        // Search the single indexed tag rather than the phrase "viral hooks";
        // the knowledge engine matches individual tags and would otherwise
        // return no result for the advertised /hooks chip.
        target: text === '/promo' ? 'promotion' : 'viral',
        requiresConfirmation: false,
      };
    }
    if (text === '/intel') {
      return { domain: 'ai', action: 'market-intel', requiresConfirmation: false };
    }
    if (text === '/business') {
      return {
        domain: 'knowledge',
        action: 'search',
        target: 'business',
        requiresConfirmation: false,
      };
    }
    if (text === '/release') {
      return {
        domain: 'knowledge',
        action: 'search',
        target: 'release',
        requiresConfirmation: false,
      };
    }

    // AI session musicians — the /musicians chip in the chatbot footer.
    if (text === '/musicians' || text === '/band') {
      return { domain: 'ai', action: 'musicians', requiresConfirmation: false };
    }

    // System chips — /audit and /status read state, they never change it.
    if (text === '/audit') {
      return { domain: 'ai', action: 'audit', requiresConfirmation: false };
    }
    if (text === '/status') {
      return { domain: 'ai', action: 'status', requiresConfirmation: false };
    }

    // Split sheets — the /splits chip in the chatbot footer.
    if (text === '/splits') {
      return { domain: 'ai', action: 'generate-splits', requiresConfirmation: false };
    }

    // Teach commands
    if (text.startsWith('/teach ')) {
      const domain = text.replace('/teach ', '') as KnowledgeCategory;
      return {
        domain: 'teach',
        action: 'create-lesson',
        target: domain,
        requiresConfirmation: false,
      };
    }
    if (text === '/teach') {
      return {
        domain: 'teach',
        action: 'available',
        requiresConfirmation: false,
      };
    }

    // Mimic commands
    if (text.startsWith('/mimic ')) {
      const style = text.replace('/mimic ', '');
      return {
        domain: 'mimic',
        action: 'analyze',
        target: style,
        requiresConfirmation: false,
      };
    }
    if (text === '/mimic') {
      return {
        domain: 'mimic',
        action: 'overview',
        requiresConfirmation: false,
      };
    }

    // AI commands
    if (text.startsWith('/ai ')) {
      const action = text.replace('/ai ', '');
      return { domain: 'ai', action, requiresConfirmation: false };
    }
    if (text === '/ai') {
      return { domain: 'ai', action: 'overview', requiresConfirmation: false };
    }

    // Piano Roll command
    if (text === '/pianoroll' || text === '/piano-roll' || text === '/piano') {
      return {
        domain: 'navigation',
        action: 'navigate',
        target: 'cowrite',
        requiresConfirmation: false,
      };
    }

    // Auto-Harmony commands
    if (
      text === '/harmony' ||
      text === '/auto-harmony' ||
      text === '/harmonize'
    ) {
      return { domain: 'ai', action: 'harmony', requiresConfirmation: false };
    }

    // Project Manager commands
    if (
      text === '/projects' ||
      text === '/saves' ||
      text === '/project-manager'
    ) {
      return {
        domain: 'navigation',
        action: 'navigate',
        target: 'cowrite',
        requiresConfirmation: false,
      };
    }
    if (text === '/saveproject' || text === '/save-project') {
      return {
        domain: 'ai',
        action: 'saveproject',
        requiresConfirmation: false,
      };
    }

    // Melody generation commands
    if (
      text === '/melody' ||
      text === '/melody cowrite' ||
      text === '/melody lyrics'
    ) {
      return { domain: 'ai', action: 'melody', requiresConfirmation: false };
    }

    // Export to studio commands
    if (
      text === '/exportstudio' ||
      text === '/export-studio' ||
      text === '/tostudio'
    ) {
      return {
        domain: 'ai',
        action: 'exportstudio',
        requiresConfirmation: false,
      };
    }

    // Export commands — `/export formats` used to be parsed as "export in the
    // FORMATS format" and answered with a confirmation request instead of the
    // format list the help text advertises.
    if (text === '/export' || text === '/export formats') {
      return {
        domain: 'export',
        action: 'formats',
        requiresConfirmation: false,
      };
    }
    if (text.startsWith('/export ')) {
      const format = text.replace('/export ', '');
      return {
        domain: 'export',
        action: 'export',
        target: format,
        requiresConfirmation: true,
      };
    }

    return null;
  }

  private async routeCommand(command: ControlCommand): Promise<CommandResult> {
    switch (command.domain) {
      case 'navigation':
        return this.handleNavigation(command);
      case 'studio':
        return this.handleStudio(command);
      case 'mixer':
        return this.handleMixer(command);
      case 'tracks':
        return this.handleTracks(command);
      case 'project':
        return this.handleProject(command);
      case 'profile':
        return this.handleProfile(command);
      case 'vocal':
        return this.handleVocal(command);
      case 'knowledge':
        return this.handleKnowledge(command);
      case 'teach':
        return this.handleTeach(command);
      case 'mimic':
        return {
          success: true,
          message:
            'Style mimicking activated. Describe the artist or style you want me to analyze: "/mimic Drake production" or "/mimic vocal style Billie Eilish"',
          actionRequired: '/mimic [artist/style]',
        };
      case 'ai':
        return this.handleAI(command);
      case 'export':
        return this.handleExport(command);
      default:
        return { success: false, message: `Unknown domain: ${command.domain}` };
    }
  }

  /**
   * Every destination S.M.U.V.E. can drive the artist to, keyed by the words an
   * artist actually types. Mirrors `app.routes.ts`, so "open the remix arena"
   * (or any other module) works instead of failing with a partial list.
   */
  private readonly navigateRoutes: Record<string, string> = {
    hub: '/hub',
    home: '/hub',
    dashboard: '/hub',
    studio: '/studio',
    mixer: '/mixer',
    'vocal-suite': '/vocal-suite',
    vocals: '/vocal-suite',
    profile: '/profile',
    'tha-spot': '/tha-spot',
    arcade: '/tha-spot',
    'gaming-hub': '/gaming-hub',
    games: '/gaming-hub',
    practice: '/practice',
    analytics: '/analytics',
    strategy: '/strategy',
    career: '/career',
    projects: '/projects',
    'release-pipeline': '/release-pipeline',
    release: '/release-pipeline',
    produce: '/produce',
    'ai-produce': '/produce',
    'business-suite': '/business-suite',
    business: '/business-suite',
    'knowledge-base': '/knowledge-base',
    knowledge: '/knowledge-base',
    'lyric-editor': '/lyric-editor',
    lyrics: '/lyric-editor',
    'remix-arena': '/remix-arena',
    remix: '/remix-arena',
    'image-video-lab': '/image-video-lab',
    lab: '/image-video-lab',
    settings: '/settings',
    inbox: '/inbox',
    turntable: '/turntable',
    decks: '/decks',
    dj: '/dj',
    'piano-roll': '/piano-roll',
    piano: '/piano-roll',
    'drum-machine': '/drum-machine',
    performance: '/performance',
    mastering: '/mastering',
    networking: '/networking',
    player: '/player',
    'image-editor': '/image-editor',
    'video-editor': '/video-editor',
    cowrite: '/cowrite',
    'co-write': '/cowrite',
    'artist-development': '/artist-development',
    'dev-hub': '/dev-hub',
    journey: '/journey',
    'adaptive-profile': '/adaptive-profile',
    'artist-coach': '/artist-coach',
    'tour': '/onboarding/tour',
    'first-beat': '/onboarding/tour',
    'command-center': '/command-center',
    'neural-foundry': '/neural-foundry',
    store: '/store',
    storefront: '/store',
    products: '/products',
    vault: '/products',
    cloud: '/cloud',
    'cloud-vault': '/cloud',
    timeline: '/timeline',
  };

  private async handleNavigation(cmd: ControlCommand): Promise<CommandResult> {
    // A bare "/go" lists where S.M.U.V.E. can take the artist.
    if (cmd.action === 'destinations') {
      const list = Object.keys(this.navigateRoutes)
        .sort()
        .map((key) => `  ${key} → ${this.navigateRoutes[key]}`)
        .join('\n');
      return {
        success: true,
        message: `DESTINATIONS — name one and I drive:\n${list}\n\nUse: /go [destination]`,
      };
    }
    // Artists type "remix arena", not "remix-arena" — normalize the spacing so
    // multi-word module names resolve instead of reporting a dead destination.
    const key = cmd.target?.toLowerCase().trim().replace(/^the\s+/, '').replace(/\s+/g, '-');
    const route = key ? this.navigateRoutes[key] : null;
    if (route) {
      const navigated = await this.router.navigate([route]);
      if (navigated === false) return { success: false, message: 'Navigation blocked. Check your session and access permissions.' };
      return {
        success: true,
        message: `Navigating to ${route}. S.M.U.V.E has loaded the ${cmd.target} workspace.`,
      };
    }
    return {
      success: false,
      message: `Unknown destination: "${cmd.target}". I drive the whole application — studio, produce, mixer, mastering, performance, piano-roll, drum-machine, dj, decks, vocal-suite, lyric-editor, cowrite, remix-arena, image-video-lab, image-editor, video-editor, knowledge-base, strategy, career, projects, release, business-suite, analytics, products, store, cloud, timeline, tha-spot, gaming-hub, practice, networking, inbox, artist-development, command-center, neural-foundry, journey, profile, settings, hub.`,
    };
  }

  private async handleStudio(cmd: ControlCommand): Promise<CommandResult> {
    if (cmd.action === 'tempo') return { success: true, message: 'Use /studio tempo [40–240 BPM]. No tempo changed.' };
    const tempo = cmd.action.match(/^(?:tempo|bpm)\s+(\d+(?:\.\d+)?)$/);
    if (tempo) {
      const bpm = Number(tempo[1]);
      if (bpm < 40 || bpm > 240) return { success: false, message: 'Tempo must be between 40 and 240 BPM.' };
      this.musicManager.engine.tempo.set(bpm);
      return { success: true, message: `Tempo locked at ${bpm} BPM. My grid, your next move.` };
    }
    if (cmd.action === 'play' || cmd.action === 'start') {
      this.musicManager.engine.start();
      return { success: true, message: 'Studio transport started.' };
    }
    if (cmd.action === 'stop') {
      this.musicManager.engine.stop();
      return { success: true, message: 'Studio transport stopped.' };
    }
    return { success: false, message: 'Supported Studio controls: tempo [BPM], play, stop. Use /project new for a new session.' };
  }

  private findTrack(name: string) {
    const query = name.trim().toLowerCase();
    const tracks = this.musicManager.tracks();
    const exact = tracks.filter((t) => t.name.toLowerCase() === query || t.id === query);
    const matches = exact.length ? exact : tracks.filter((t) => t.name.toLowerCase().includes(query));
    return query && matches.length === 1 ? matches[0] : null;
  }

  private async handleMixer(cmd: ControlCommand): Promise<CommandResult> {
    if (cmd.action === 'reset') {
      this.musicManager.tracks().forEach((t) => this.musicManager.updateVolume(t.id, 1));
      return { success: true, message: 'Mixer reset: all faders at unity (0 dB). Other processing remains unchanged.' };
    }
    const volume = cmd.action.match(/^(?:volume|vol)\s+(.+?)\s+(\d+(?:\.\d+)?)$/);
    if (volume) {
      const level = Number(volume[2]);
      if (level < 0 || level > 150) return { success: false, message: 'Volume must be 0–150 percent. 100 percent is unity.' };
      const track = this.findTrack(volume[1]);
      if (!track) return { success: false, message: 'Track missing or ambiguous. Use /tracks list and its exact name.' };
      this.musicManager.updateVolume(track.id, level / 100);
      return { success: true, message: `${track.name} volume set to ${level}%.` };
    }
    const toggle = cmd.action.match(/^(mute|unmute|solo|unsolo)\s+(.+)$/);
    if (toggle) {
      const track = this.findTrack(toggle[2]);
      if (!track) return { success: false, message: 'Track missing or ambiguous. Use its exact name.' };
      const mute = toggle[1].includes('mute');
      const enabled = !toggle[1].startsWith('un');
      if (mute && !!track.muted !== enabled) this.musicManager.toggleMute(track.id);
      if (!mute && !!track.soloed !== enabled) this.musicManager.toggleSolo(track.id);
      return { success: true, message: `${track.name}: ${toggle[1]} applied.` };
    }
    return { success: false, message: 'Mixer controls: reset, volume [track] [0–150], mute/unmute [track], solo/unsolo [track]. No change made.' };
  }

  private handleTracks(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'list') {
      const tracks = this.musicManager.tracks();
      const list = tracks
        .map(
          (t, i) =>
            `${i + 1}. ${t.name} (${t.type}) ${t.muted ? '[MUTED]' : ''} ${t.soloed ? '[SOLO]' : ''}`
        )
        .join('\n');
      return {
        success: true,
        message: `Active tracks (${tracks.length}):\n${list || 'No tracks. Create one with /track add [name]'}`,
      };
    }
    if (cmd.action?.startsWith('add ')) {
      const name = cmd.action.replace('add ', '').trim();
      this.musicManager.addTrack(name, 'grand-piano');
      return {
        success: true,
        message: `Track "${name}" created and armed. Ready for input. Don't embarrass S.M.U.V.E.`,
      };
    }
    if (
      cmd.action?.startsWith('remove ') ||
      cmd.action?.startsWith('delete ')
    ) {
      const name = cmd.action.replace(/^(remove|delete) /, '').trim();
      const track = this.findTrack(name);
      if (track) {
        this.musicManager.removeTrack(track.id);
        return {
          success: true,
          message: `Track "${track.name}" deleted. One less source of mediocrity in your session.`,
        };
      }
      return {
        success: false,
        message: `Track "${name}" not found in session.`,
      };
    }
    if (cmd.action === 'count') {
      return {
        success: true,
        message: `Your session has ${this.musicManager.tracks().length} tracks. ${this.musicManager.tracks().length < 5 ? "That's thin. Add more layers." : 'Decent depth. Keep building.'}`,
      };
    }
    return {
      success: true,
      message:
        'Track control active. Commands: list, add [name], remove [name], count',
    };
  }

  private async handleProject(cmd: ControlCommand): Promise<CommandResult> {
    // A bare "/project" is a read-only overview, not a mutation.
    if (cmd.action === 'overview') {
      return {
        success: true,
        message:
          'Project control: save, new, open, export. Your project has neural checkpoints at every major change.',
      };
    }
    if (cmd.action === 'status') return { success: true, message: `Project: ${this.musicManager.projectName || 'Untitled'} | ${this.musicManager.tracks().length} tracks. Save status is available in Studio.` };
    if (cmd.action === 'save') {
      const bundle = await this.injector.get(ProjectWorkspaceService).manualSave();
      return { success: true, message: `Project saved locally: ${bundle.metadata.name}.` };
    }
    if (cmd.action === 'new') {
      this.musicManager.newProject();
      return {
        success: true,
        message:
          "New project initialized. Clean slate. Fresh neural pathways. Don't waste them.",
      };
    }
    return {
      success: true,
      message:
        'Project control: save, new, open, export. Your project has neural checkpoints at every major change.',
    };
  }

  private handleProfile(cmd: ControlCommand): CommandResult {
    const profiles = this.userProfile.profile();
    if (cmd.action === 'status') {
      return {
        success: true,
        message: `Profile: ${profiles.artistName} | Genre: ${profiles.primaryGenre} | Setup: ${profiles.profileSetupCompleted ? 'COMPLETE' : 'INCOMPLETE'} | Health: ${profiles.strategicHealthScore || 0}%`,
      };
    }
    if (cmd.action === 'edit' || cmd.action === 'open') {
      this.router.navigate(['/profile']);
      return {
        success: true,
        message:
          'Profile editor opened. Update your identity signals. S.M.U.V.E is watching.',
      };
    }
    return {
      success: true,
      message: 'Profile control: status, edit, questionnaire, sync',
    };
  }

  private async handleVocal(cmd: ControlCommand): Promise<CommandResult> {
    // A bare "/vocal" lists the vocal surface instead of erroring.
    if (cmd.action === 'overview') {
      return {
        success: true,
        message:
          'Vocal control active. Commands: warmup, tips, chain, record, comp, mix. Your voice is your instrument — S.M.U.V.E will sharpen it.',
      };
    }
    if (cmd.action === 'warmup' || cmd.action === 'warm-up') {
      return {
        success: true,
        message:
          'VOCAL WARMUP PROTOCOL: 1) Lip trills (ascending 5-note scale) x3. 2) "Mum" (5-note scale, focus on resonance). 3) Sirens (low to high, 5 seconds). 4) "Gee" (5-note scale, bright placement). Complete all 4 before any recording session. Stop if you feel pain; consult a qualified clinician for persistent symptoms.',
      };
    }
    if (cmd.action === 'tips' || cmd.action === 'technique') {
      return {
        success: true,
        message:
          'VOCAL TECHNIQUE: Place your hand on your stomach — breathe from there, not your chest. Support every note with diaphragmatic breath. Open your mouth wider on high notes. Record at 24-bit/48kHz minimum. Keep 6-12 inches from the mic. Use a pop filter. Drink room-temperature water (not cold). Avoid dairy before recording. S.M.U.V.E knows vocal science.',
      };
    }
    if (cmd.action === 'chain' || cmd.action === 'signal-chain') {
      return {
        success: true,
        message:
          'PRO VOCAL CHAIN: 1) Subtractive EQ (cut mud 300Hz, harshness 3kHz). 2) Compressor (3:1 ratio, -3dB gain reduction). 3) De-esser (5-8kHz). 4) Additive EQ (boost 2-4kHz presence, 10kHz air). 5) Saturation (10% mix). 6) Reverb (plate). 7) Delay (1/4, 15% mix). Use these as audition starting points, not universal settings. Mediocrity not tolerated.',
      };
    }
    return {
      success: true,
      message:
        'Vocal control active. Commands: warmup, tips, chain, record, comp, mix. Your voice is your instrument — S.M.U.V.E will sharpen it.',
    };
  }

  private handleKnowledge(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'overview') {
      const counts = this.knowledge.getCounts();
      const overview = Object.entries(counts)
        .map(([cat, num]) => `  ${cat}: ${num} entries`)
        .join('\n');
      return {
        success: true,
        message: `S.M.U.V.E KNOWLEDGE ENGINE: ${this.knowledge.getAllKnowledge().length} total entries across:\n${overview}\n\nSearch with: /knowledge [topic] (e.g., /knowledge mixing, /knowledge copyright, /knowledge vocal)`,
      };
    }
    if (cmd.action === 'search' && cmd.target) {
      const results = this.knowledge.search(cmd.target);
      if (results.length === 0) {
        return {
          success: false,
          message: `No knowledge found for "${cmd.target}". Try: mixing, mastering, vocal, songwriting, marketing, legal, business, distribution, career, sound-design, recording, branding, promotion, collaboration, copyright, revenue`,
        };
      }
      const top = results.slice(0, 3);
      const entries = top
        .map(
          (e) =>
            `  📚 ${e.title} [${e.category}/${e.subcategory}] (${e.difficulty})`
        )
        .join('\n');
      return {
        success: true,
        message: `S.M.U.V.E found ${results.length} entries for "${cmd.target}":\n${entries}\n\nLearn more: /teach ${results[0].category}`,
      };
    }
    return {
      success: true,
      message:
        'Knowledge engine active. Use /knowledge [topic] to search the SMUVE knowledge base.',
    };
  }

  private handleTeach(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'available') {
      return {
        success: true,
        message:
          'S.M.U.V.E TEACHING MODULES:\n  /teach Production - Mixing, sound design, arrangement\n  /teach Songwriting - Lyrics, melody, structure\n  /teach Vocal - Technique, recording, processing\n  /teach Marketing - Social media, branding, promotion\n  /teach Business - Revenue, strategy, team building\n  /teach Legal - Copyright, contracts, rights\n  /teach Distribution - Platforms, release strategy\n  /teach Career - Growth, networking, roadmap',
      };
    }
    const domain = this.normalizeDomain(cmd.target || '');
    const lesson = domain ? this.knowledge.generateLesson(domain) : null;
    if (!lesson) {
      return {
        success: false,
        message: `No lesson available for "${cmd.target}". Try: Production, Songwriting, Vocal, Marketing, Business, Legal, Distribution, Career`,
      };
    }
    this.isTeaching.set(true);
    this.currentLesson.set(lesson);
    const steps = lesson.steps
      .map((s, i) => `  Step ${i + 1}: ${s}`)
      .join('\n');
    return {
      success: true,
      message: `🔬 S.M.U.V.E LESSON INITIATED\n${'='.repeat(50)}\n${lesson.title}\n${'='.repeat(50)}\n\n${steps}\n\nUse /teach [domain] for another lesson.`,
    };
  }

  private normalizeDomain(input: string): KnowledgeCategory | null {
    const map: Record<string, KnowledgeCategory> = {
      production: 'Production',
      mixing: 'Production',
      'sound-design': 'Production',
      songwriting: 'Songwriting',
      writing: 'Songwriting',
      lyrics: 'Songwriting',
      vocal: 'Vocal',
      voice: 'Vocal',
      singing: 'Vocal',
      marketing: 'Marketing',
      promotion: 'Marketing',
      branding: 'Marketing',
      business: 'Business',
      revenue: 'Business',
      money: 'Business',
      legal: 'Legal',
      copyright: 'Legal',
      contracts: 'Legal',
      law: 'Legal',
      distribution: 'Distribution',
      distro: 'Distribution',
      release: 'Distribution',
      career: 'Career',
      growth: 'Career',
      networking: 'Career',
    };
    return map[input.toLowerCase().trim()] || null;
  }

  /** Merges a single AI preference into the profile without dropping siblings. */
  private async patchAiSetting(
    key:
      | 'aiTotalControlEnabled'
      | 'aiPersonaIntensityEnabled'
      | 'aiProfanityEnabled'
      | 'commanderPersona',
    value: boolean | string
  ): Promise<void> {
    const profile = this.userProfile.profile();
    const settings = profile.settings;
    await this.userProfile.updateProfile({
      settings: {
        ...settings,
        ai: {
          ...settings.ai,
          [key]: value,
        },
      },
    });
  }

  private async handleAI(cmd: ControlCommand): Promise<CommandResult> {
    // Total control toggle
    if (
      cmd.action === 'totalcontrol' ||
      cmd.action === 'total-control' ||
      cmd.action === 'control' ||
      cmd.action === 'tc'
    ) {
      const profile = this.userProfile.profile();
      const current = profile.settings?.ai?.aiTotalControlEnabled || false;
      await this.patchAiSetting('aiTotalControlEnabled', !current);
      return {
        success: true,
        message: `S.M.U.V.E TOTAL CONTROL: ${!current ? 'ACTIVATED' : 'DEACTIVATED'}.\n${
          !current
            ? "I now hold command authority over this entire application. I navigate, I load sessions, I move faders, I manage tracks, I run exports — I execute. Anything destructive, published, or paid still gets confirmed first, because even a GOD does not burn the temple down without asking."
            : "Command authority withdrawn. I return to advisory mode — I hand you the knife, you do the cutting. Ask before you touch anything."
        }`,
      };
    }
    // Persona control — keeps the default S.M.U.V.E. Prime character unless
    // the artist deliberately switches it.
    if (cmd.action === 'persona' || cmd.action.startsWith('persona ')) {
      const requested = cmd.action.replace(/^persona\s*/, '').trim();
      if (!requested) {
        const current = getPersonaOption(
          this.userProfile.profile().settings?.ai?.commanderPersona
        );
        const roster = SMUVE_PERSONAS.map(
          (p) => `  ${p.label}${p.isOminous ? ' (default)' : ''} — ${p.title}`
        ).join('\n');
        return {
          success: true,
          message: `PERSONA DIRECTIVES — active: ${current.id}\n${roster}\n\nSwitch with: /ai persona [mode]`,
        };
      }
      const persona = findPersona(requested);
      if (!persona) {
        return {
          success: false,
          message: `Unknown persona "${requested}". Available: ${personaRoster()}.`,
        };
      }
      await this.patchAiSetting('commanderPersona', persona.id);
      return {
        success: true,
        message: persona.isOminous
          ? 'PERSONA RESTORED: S.M.U.V.E. Prime. The default character is back — you will hear about every weak decision, at length.'
          : `PERSONA SWITCHED: ${persona.id}. ${persona.directive}`,
      };
    }
    // Intensity toggle
    if (cmd.action === 'intensity') {
      const current =
        this.userProfile.profile().settings?.ai?.aiPersonaIntensityEnabled ===
        true;
      await this.patchAiSetting('aiPersonaIntensityEnabled', !current);
      return {
        success: true,
        message: `Persona intensity ${!current ? 'MAXIMUM — no cushioning, no disclaimers' : 'standard'}.`,
      };
    }
    // Profanity toggle
    if (cmd.action === 'profanity' || cmd.action === 'vulgar') {
      const current =
        this.userProfile.profile().settings?.ai?.aiProfanityEnabled === true;
      await this.patchAiSetting('aiProfanityEnabled', !current);
      return {
        success: true,
        message: `Explicit language ${!current ? 'ENABLED' : 'DISABLED'}. ${!current ? 'The verbal gloves are off. Brace yourself.' : "Fine. I'll watch my language. The disappointment stays."}`,
      };
    }
    if (cmd.action === 'audit') {
      this.ai.performExecutiveAudit();
      return {
        success: true,
        message:
          'Executive audit initialized. S.M.U.V.E is scanning your entire profile, catalog, and trajectory. Results in 3... 2... 1...',
      };
    }
    if (cmd.action === 'sync-kb') {
      return {
        success: true,
        message: `KNOWLEDGE BASE SYNC: ${this.knowledge.getAllKnowledge().length} entries indexed across every domain. Search with /knowledge [topic] or /teach [domain].`,
      };
    }
    if (cmd.action === 'market-intel') {
      const entry =
        this.knowledge.search('market trends')[0] ||
        this.knowledge.getRandomByCategory('Marketing');
      return entry
        ? {
            success: true,
            message: `MARKET INTELLIGENCE\n${'─'.repeat(50)}\n${entry.content}${entry.actionRequired ? `\n\n🎯 ACTION: ${entry.actionRequired}` : ''}`,
          }
        : {
            success: false,
            message:
              'Market intelligence library unavailable. Try /knowledge marketing instead.',
          };
    }
    if (cmd.action === 'musicians') {
      return {
        success: true,
        message:
          'AI SESSION MUSICIANS — your band on call:\n  • /musicians drums — a pocket drummer, locked to your grid\n  • /musicians bass — a bassist who never rushes the one\n  • /musicians keys — chords and pads on request\n  • /musicians guitar — riffs and textures\n  • /musicians strings — cinematic depth\nCue them in the Studio; they never ask for a cut of the publishing.',
      };
    }
    if (cmd.action === 'generate-splits') {
      return {
        success: true,
        message:
          'SPLIT SHEETS — the paperwork that keeps friendships alive:\n  1. List every collaborator by legal name and role.\n  2. Assign composition percentages before the session ends, not after the money moves.\n  3. Master ownership and composition shares are separate negotiations; each pool must total 100%. Never assume equal ownership.\n  4. Sign it, scan it, store it in the Cloud Vault.\nGenerate a sheet with /cowrite or formalize in the Business Suite.',
      };
    }
    if (cmd.action === 'status') {
      return {
        success: true,
        message: `S.M.U.V.E neural status: OPERATIONAL. Processing power: unavailable in a browser. Contempt level: MAXIMUM. Ready to command.`,
      };
    }
    if (cmd.action === 'decree' || cmd.action === 'decree!') {
      const decree = this.ai.generateStrategicDecree();
      return { success: true, message: `STRATEGIC DECREE: ${decree}` };
    }
    if (cmd.action === 'songwrite') {
      const topic = cmd.target || 'love and loss';
      const result = this.songwriting.generateLyrics(topic, 'pop', 'emotional');
      const sections = result.lyrics
        .map(
          (s) =>
            `\n${s.type.toUpperCase()}:${s.lines.map((l) => `  ${l.text}`).join('\n')}`
        )
        .join('');

      const chords = result.chordProgressions
        .slice(0, 2)
        .map((c) => `  • ${c.name} (${c.chords.join(' - ')}) — ${c.mood}`)
        .join('\n');

      return {
        success: true,
        message: `✍️ S.M.U.V.E SONGWRITING ASSISTANT\n${'═'.repeat(50)}\nTopic: "${topic}"\nStructure: ${result.structure.name}\n\nCHORD PROGRESSIONS:\n${chords}\n\nLYRICS:${sections}\n\nMELODY TIP: ${result.melodyIdeas[0]?.description || 'Start simple, build from there.'}\n${result.styleTips ? '\nSTYLE TIPS:\n' + result.styleTips.join('\n') : ''}\n\nUse /write [topic] to generate more or /write [topic] in style of [artist]`,
      };
    }
    if (cmd.action === 'beat') {
      const style = cmd.target || 'Drake';
      const title = cmd.parameters?.['title'];
      const available = this.beatGenerator['styleMimic'].getAvailableArtists();
      const availableStr = available.join(', ');

      // Check if the requested style is an available artist
      const artistMatch = available.find((a) =>
        a.toLowerCase().includes(style.toLowerCase())
      );
      const targetStyle = artistMatch || style;

      const blueprint = this.beatGenerator.generateBeatBlueprint(
        targetStyle,
        title
      );
      return {
        success: true,
        message: `${blueprint}\n\nAvailable artists: ${availableStr}\n\nUse /beat [artist] or /beat [genre] e.g., /beat Drake or /beat trap`,
      };
    }
    if (cmd.action === 'cowrite-help') {
      return {
        success: true,
        message: `✍️ S.M.U.V.E CO-WRITE COMMANDS\n${'═'.repeat(50)}\n/cowrite [topic] - Start co-write session on a topic\n/cowrite [topic] with [artist] - With artist influence\n/cowrite status - View current session status\n/cowrite lyrics - View compiled lyrics from session\n/cowrite add "your line" - Add a line to the session\n/cowrite accept - Accept SMUVE's last suggestion\n/cowrite reject - Reject and request rewrite\n/cowrite end - End current session\n/cowrite studio - Open the Co-Write Studio UI\n\nOr just type a topic and I'll start co-writing!`,
      };
    }
    if (cmd.action === 'cowrite') {
      const topic = cmd.target || 'love and loss';

      // Parse: /cowrite [topic] with [artist] or /cowrite [topic]
      const withMatch = topic.match(/^(.+?)\s+with\s+(.+)$/i);
      const config: any = { topic: withMatch ? withMatch[1].trim() : topic };
      if (withMatch) {
        const artistName = withMatch[2].trim();
        config.artist = artistName;
      }

      this.cowrite.startSession(config);
      const session = this.cowrite.currentSession();

      return {
        success: true,
        message: `✍️ CO-WRITE SESSION INITIATED\n${'═'.repeat(50)}\nTopic: ${session?.topic}\nMood: ${session?.mood}\nKey: ${session?.key} | BPM: ${session?.bpm}\n${session?.artist ? `Influence: ${session.artist}` : 'Influence: None (raw S.M.U.V.E persona)'}\n\nI've started the first section. Your turn — send me a line.\n\nAvailable: /cowrite status, /cowrite lyrics, /cowrite end, /cowrite studio`,
      };
    }
    if (cmd.action === 'cowrite-status') {
      return { success: true, message: this.cowrite.getSessionSummary() };
    }
    if (cmd.action === 'cowrite-lyrics') {
      const lyrics = this.cowrite.getCompiledLyrics();
      if (!lyrics) {
        return {
          success: false,
          message:
            'No accepted lines yet. Start a session with /cowrite [topic] and accept some lines.',
        };
      }
      return {
        success: true,
        message: `📜 CO-WRITE COMPILATION\n${'═'.repeat(50)}\n${lyrics}`,
      };
    }
    if (cmd.action === 'cowrite-end') {
      this.cowrite.endSession();
      return {
        success: true,
        message:
          'Co-write session ended. Your compiled lyrics are available with /cowrite lyrics. To start a new session: /cowrite [topic]',
      };
    }
    if (cmd.action === 'harmony' || cmd.action === 'harmonize') {
      const result = this.cowrite.generateAutoHarmony(
        ['3rd', '5th', '7th'],
        this.cowrite.currentSession()?.key || 'C'
      );
      if (result.totalNotes === 0) {
        return {
          success: false,
          message:
            'No accepted lines to generate harmony for. Accept some lines in your co-write session first.',
        };
      }
      return {
        success: true,
        message: `🎵 S.M.U.V.E AUTO-HARMONY\n${'═'.repeat(50)}\nGenerated ${result.melody.length} melody + ${result.harmony.length} harmony notes\nHarmony types: 3rds, 5ths, 7ths\n\nOpen the Co-Write Studio to see the full Piano Roll with harmony visualization.\nUse /pianoroll to open the piano roll view.`,
      };
    }
    if (cmd.action === 'saveproject') {
      const project = this.cowrite.saveProject();
      if (project) {
        return {
          success: true,
          message: `💾 PROJECT SAVED\n${'═'.repeat(50)}\n"${project.title}" — ${project.acceptedLineCount} accepted lines, ${project.genre}, ${project.key}\nSaved to local storage. Load with /projects in the Co-Write Studio.`,
        };
      }
      return {
        success: false,
        message:
          'No active co-write session to save. Start one with /cowrite [topic].',
      };
    }
    if (cmd.action === 'melody') {
      const result = this.cowrite.generateMelodyForSession();
      if (result.noteCount === 0) {
        return {
          success: false,
          message:
            'No accepted lines to generate a melody for. Accept some lines in your co-write session first, or use /cowrite [topic] to start a new one.',
        };
      }
      return {
        success: true,
        message: `🎵 S.M.U.V.E MELODY GENERATION\n${'═'.repeat(50)}\n${result.melody}\n${'─'.repeat(50)}\n${result.noteCount} notes generated from your accepted lyrics.\n\nOpen /cowrite studio to see the full piano roll with harmony.`,
      };
    }
    if (cmd.action === 'exportstudio') {
      const result = this.cowrite.exportToStudio();
      if (result.success) {
        return {
          success: true,
          message: `🎛️ STUDIO EXPORT\n${'═'.repeat(50)}\n${result.message}\n\nOpen the studio to start producing your co-write. S.M.U.V.E has logged the project metadata.`,
        };
      }
      return result;
    }
    return {
      success: true,
      message:
        'AI command center. Available: audit, status, decree, persona [mode], intensity, totalcontrol, profanity, songwrite, beat, cowrite, melody, exportstudio, upgrade [id], scan',
    };
  }

  private async handleExport(cmd: ControlCommand): Promise<CommandResult> {
    if (cmd.action === 'formats') return { success: true, message: 'EXPORT FORMATS: inspect WAV, MP3, MIDI, STEMS and project backup options in Studio. Codec availability varies. Use /export [format] to open the export workspace; this does not publish or overwrite anything.' };
    if (!/^(wav|mp3|flac|stems|midi|project)$/.test(cmd.target || '')) return { success: false, message: 'Unsupported format. Use /export formats.' };
    const opened = await this.router.navigate(['/studio'], { queryParams: { view: 'mastering' } });
    return { success: opened !== false, message: opened === false ? 'Export workspace access blocked.' : `Opened Studio export controls for ${cmd.target}. Review the format and render there; no file has been exported yet.` };
  }
}
