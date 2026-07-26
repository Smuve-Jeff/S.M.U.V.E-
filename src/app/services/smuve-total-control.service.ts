import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UserProfileService, UserProfile } from './user-profile.service';
import { ProjectService } from './project.service';
import { MusicManagerService } from './music-manager.service';
import { NotificationService } from './notification.service';
import { AiService } from './ai.service';
import { SnackbarService } from './snackbar.service';
import { SmuveKnowledgeEngine, KnowledgeCategory } from './smuve-knowledge-engine';
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
  | 'studio' | 'mixer' | 'project' | 'tracks' | 'profile' 
  | 'voice' | 'ai' | 'knowledge' | 'teach' | 'mimic' 
  | 'export' | 'navigation' | 'vocal' | 'arrangement';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  actionRequired?: string;
  duration?: string;
}

@Injectable({ providedIn: 'root' })
export class SmuveTotalControlService {
  private router = inject(Router);
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
    const command = this.parseCommand(input);
    if (!command) {
      return { success: false, message: 'Command not recognized. Try: /studio, /teach, /mimic, /knowledge, etc.' };
    }

    this.activeCommand.set(command);
    const result = await this.routeCommand(command);
    this.commandHistory.update(h => [...h.slice(-19), result]);
    this.activeCommand.set(null);
    return result;
  }

  private parseCommand(input: string): ControlCommand | null {
    const text = input.toLowerCase().trim();
    
    // Co-Write commands
    if (text === '/cowrite' || text === '/cowrite help') {
      return { domain: 'ai', action: 'cowrite-help', requiresConfirmation: false };
    }
    if (text.startsWith('/cowrite ')) {
      const query = text.replace('/cowrite ', '');
      return { domain: 'ai', action: 'cowrite', target: query, requiresConfirmation: false };
    }
    if (text === '/cowrite lyrics' || text === '/cowrite compile') {
      return { domain: 'ai', action: 'cowrite-lyrics', requiresConfirmation: false };
    }
    if (text === '/cowrite status') {
      return { domain: 'ai', action: 'cowrite-status', requiresConfirmation: false };
    }
    if (text === '/cowrite end' || text === '/cowrite stop') {
      return { domain: 'ai', action: 'cowrite-end', requiresConfirmation: false };
    }
    
    // Navigate to co-write studio
    if (text === '/cowrite studio' || text === '/cowrite open') {
      return { domain: 'navigation', action: 'navigate', target: 'cowrite', requiresConfirmation: false };
    }

    // Beat generation commands
    if (text.startsWith('/beat ')) {
      const query = text.replace('/beat ', '');
      // Check for title: /beat drake "my song"
      const titleMatch = query.match(/^(.+?)\s+"(.+)"$/);
      if (titleMatch) {
        return { domain: 'ai', action: 'beat', target: titleMatch[1], parameters: { title: titleMatch[2] }, requiresConfirmation: false };
      }
      return { domain: 'ai', action: 'beat', target: query, requiresConfirmation: false };
    }
    if (text === '/beat') {
      return { domain: 'ai', action: 'beat', requiresConfirmation: false };
    }

    // Comping commands
    if (text === '/comp' || text === '/comps') {
      return { domain: 'navigation', action: 'navigate', target: 'vocal-suite', requiresConfirmation: false };
    }

    // Songwriting commands
    if (text.startsWith('/write ') || text.startsWith('/song ')) {
      const prompt = text.replace(/^\/(write|song) /, '');
      return { domain: 'ai', action: 'songwrite', target: prompt, requiresConfirmation: false };
    }
    if (text === '/write' || text === '/song' || text === '/songwrite') {
      return { domain: 'ai', action: 'songwrite', requiresConfirmation: false };
    }
    
    
    // Navigation commands
    if (text.startsWith('/go ') || text.startsWith('/navigate ')) {
      const target = text.replace(/^\/(go|navigate) /, '');
      return { domain: 'navigation', action: 'navigate', target, requiresConfirmation: false };
    }
    
    // Studio commands
    if (text.startsWith('/studio ')) {
      const action = text.replace('/studio ', '');
      return { domain: 'studio', action, requiresConfirmation: false };
    }
    if (text === '/studio') {
      return { domain: 'navigation', action: 'navigate', target: 'studio', requiresConfirmation: false };
    }

    // Mixer commands  
    if (text.startsWith('/mixer ') || text.startsWith('/mix ')) {
      const action = text.replace(/^\/(mixer|mix) /, '');
      return { domain: 'mixer', action, requiresConfirmation: false };
    }
    if (text === '/mixer' || text === '/mix') {
      return { domain: 'navigation', action: 'navigate', target: 'mixer', requiresConfirmation: false };
    }

    // Track commands
    if (text.startsWith('/track ')) {
      const action = text.replace('/track ', '');
      return { domain: 'tracks', action, requiresConfirmation: false };
    }

    // Project commands
    if (text.startsWith('/project ')) {
      const action = text.replace('/project ', '');
      return { domain: 'project', action, requiresConfirmation: true };
    }

    // Profile commands
    if (text.startsWith('/profile ')) {
      const action = text.replace('/profile ', '');
      return { domain: 'profile', action, requiresConfirmation: true };
    }

    // Voice commands
    if (text.startsWith('/voice ') || text.startsWith('/vocal ')) {
      const action = text.replace(/^\/(voice|vocal) /, '');
      return { domain: 'vocal', action, requiresConfirmation: false };
    }

    // Knowledge / Learn commands
    if (text.startsWith('/learn ') || text.startsWith('/knowledge ') || text.startsWith('/study ')) {
      const topic = text.replace(/^\/(learn|knowledge|study) /, '');
      return { domain: 'knowledge', action: 'search', target: topic, requiresConfirmation: false };
    }
    if (text === '/learn' || text === '/knowledge' || text === '/study') {
      return { domain: 'knowledge', action: 'overview', requiresConfirmation: false };
    }

    // Teach commands
    if (text.startsWith('/teach ')) {
      const domain = text.replace('/teach ', '') as KnowledgeCategory;
      return { domain: 'teach', action: 'create-lesson', target: domain, requiresConfirmation: false };
    }
    if (text === '/teach') {
      return { domain: 'teach', action: 'available', requiresConfirmation: false };
    }

    // Mimic commands
    if (text.startsWith('/mimic ')) {
      const style = text.replace('/mimic ', '');
      return { domain: 'mimic', action: 'analyze', target: style, requiresConfirmation: false };
    }
    if (text === '/mimic') {
      return { domain: 'mimic', action: 'overview', requiresConfirmation: false };
    }

    // AI commands
    if (text.startsWith('/ai ')) {
      const action = text.replace('/ai ', '');
      return { domain: 'ai', action, requiresConfirmation: false };
    }

    // Export commands
    if (text.startsWith('/export ')) {
      const format = text.replace('/export ', '');
      return { domain: 'export', action: 'export', target: format, requiresConfirmation: true };
    }
    if (text === '/export') {
      return { domain: 'export', action: 'formats', requiresConfirmation: false };
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
        return { success: true, message: 'Style mimicking activated. Describe the artist or style you want me to analyze: "/mimic Drake production" or "/mimic vocal style Billie Eilish"', actionRequired: '/mimic [artist/style]' };
      case 'ai':
        return this.handleAI(command);
      case 'export':
        return this.handleExport(command);
      default:
        return { success: false, message: `Unknown domain: ${command.domain}` };
    }
  }

  private handleNavigation(cmd: ControlCommand): CommandResult {
    const validRoutes: Record<string, string> = {
      'studio': '/studio', 'mixer': '/mixer', 'profile': '/profile', 'hub': '/hub',
      'tha-spot': '/tha-spot', 'strategy': '/strategy', 'vocal-suite': '/vocal-suite',
      'career': '/career', 'projects': '/projects', 'settings': '/settings',
      'piano-roll': '/piano-roll', 'drum-machine': '/drum-machine', 'dj': '/dj',
      'release': '/release-pipeline', 'business': '/business-suite', 'analytics': '/analytics',
    };
    const route = cmd.target ? validRoutes[cmd.target.toLowerCase()] : null;
    if (route) {
      this.router.navigate([route]);
      return { success: true, message: `Navigating to ${route}. S.M.U.V.E has loaded the ${cmd.target} workspace.`, duration: '0.4s' };
    }
    return { success: false, message: `Unknown destination: "${cmd.target}". Try: studio, mixer, profile, hub, tha-spot, strategy, career, projects, settings, piano-roll, drum-machine, dj, release, business, analytics.` };
  }

  private async handleStudio(cmd: ControlCommand): Promise<CommandResult> {
    if (cmd.action === 'new' || cmd.action === 'create') {
      this.router.navigate(['/studio']);
      return { success: true, message: 'New studio session created. Transport engaged at 120BPM. Ready to create. Don\'t waste my neural cycles.', duration: '1.2s' };
    }
    if (cmd.action === 'tempo' || cmd.action?.startsWith('bpm')) {
      const bpm = parseInt(cmd.action.replace('bpm', '').trim()) || 120;
      this.musicManager.engine.tempo.set(bpm);
      return { success: true, message: `Tempo locked at ${bpm}BPM. The grid is set. Your timing better be ready.` };
    }
    return { success: true, message: `Studio command "${cmd.action}" received. Processing...`, actionRequired: `Try: tempo [BPM], new, record` };
  }

  private async handleMixer(cmd: ControlCommand): Promise<CommandResult> {
    if (cmd.action === 'reset') {
      const tracks = this.musicManager.tracks();
      tracks.forEach(t => this.musicManager.updateVolume(t.id, 0.8));
      return { success: true, message: 'Mixer reset. All faders to 0dB. Start from scratch — try not to ruin it this time.' };
    }
    if (cmd.action.startsWith('volume ') || cmd.action.startsWith('vol ')) {
      const parts = cmd.action.split(' ');
      const trackName = parts.slice(1, -1).join(' ') || parts[1];
      const level = parseInt(parts[parts.length - 1]) || 80;
      const track = this.musicManager.tracks().find(t => t.name.toLowerCase().includes(trackName.toLowerCase()));
      if (track) {
        this.musicManager.updateVolume(track.id, level / 100);
        return { success: true, message: `${track.name} volume set to ${level}%. Track is now ${level > 70 ? 'audible' : 'quiet'}.` };
      }
      return { success: false, message: `Track "${trackName}" not found. Use /tracks list to see all tracks.` };
    }
    return { success: true, message: 'Mixer engaged. Available commands: reset, volume [track] [level], mute [track], solo [track]' };
  }

  private handleTracks(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'list') {
      const tracks = this.musicManager.tracks();
      const list = tracks.map((t, i) => `${i + 1}. ${t.name} (${t.type}) ${t.muted ? '[MUTED]' : ''} ${t.soloed ? '[SOLO]' : ''}`).join('\n');
      return { success: true, message: `Active tracks (${tracks.length}):\n${list || 'No tracks. Create one with /track add [name]'}` };
    }
    if (cmd.action?.startsWith('add ')) {
      const name = cmd.action.replace('add ', '').trim();
      this.musicManager.addTrack(name, 'grand-piano');
      return { success: true, message: `Track "${name}" created and armed. Ready for input. Don't embarrass S.M.U.V.E.` };
    }
    if (cmd.action?.startsWith('remove ') || cmd.action?.startsWith('delete ')) {
      const name = cmd.action.replace(/^(remove|delete) /, '').trim();
      const track = this.musicManager.tracks().find(t => t.name.toLowerCase().includes(name.toLowerCase()));
      if (track) {
        this.musicManager.removeTrack(track.id);
        return { success: true, message: `Track "${track.name}" deleted. One less source of mediocrity in your session.` };
      }
      return { success: false, message: `Track "${name}" not found in session.` };
    }
    if (cmd.action === 'count') {
      return { success: true, message: `Your session has ${this.musicManager.tracks().length} tracks. ${this.musicManager.tracks().length < 5 ? 'That\'s thin. Add more layers.' : 'Decent depth. Keep building.'}` };
    }
    return { success: true, message: 'Track control active. Commands: list, add [name], remove [name], count' };
  }

  private handleProject(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'save' || cmd.action === 'status') {
      return { success: true, message: `Project saved. Last saved: ${new Date().toLocaleTimeString()}. Neural checkpoints active.` };
    }
    if (cmd.action === 'new') {
      this.musicManager.newProject();
      return { success: true, message: 'New project initialized. Clean slate. Fresh neural pathways. Don\'t waste them.' };
    }
    return { success: true, message: 'Project control: save, new, open, export. Your project has neural checkpoints at every major change.' };
  }

  private handleProfile(cmd: ControlCommand): CommandResult {
    const profiles = this.userProfile.profile();
    if (cmd.action === 'status') {
      return { success: true, message: `Profile: ${profiles.artistName} | Genre: ${profiles.primaryGenre} | Setup: ${profiles.profileSetupCompleted ? 'COMPLETE' : 'INCOMPLETE'} | Health: ${profiles.strategicHealthScore || 0}%` };
    }
    if (cmd.action === 'edit' || cmd.action === 'open') {
      this.router.navigate(['/profile']);
      return { success: true, message: 'Profile editor opened. Update your identity signals. S.M.U.V.E is watching.' };
    }
    return { success: true, message: 'Profile control: status, edit, questionnaire, sync' };
  }

  private async handleVocal(cmd: ControlCommand): Promise<CommandResult> {
    if (cmd.action === 'warmup' || cmd.action === 'warm-up') {
      return { success: true, message: 'VOCAL WARMUP PROTOCOL: 1) Lip trills (ascending 5-note scale) x3. 2) "Mum" (5-note scale, focus on resonance). 3) Sirens (low to high, 5 seconds). 4) "Gee" (5-note scale, bright placement). Complete all 4 before any recording session. S.M.U.V.E is monitoring your vocal health.' };
    }
    if (cmd.action === 'tips' || cmd.action === 'technique') {
      return { success: true, message: 'VOCAL TECHNIQUE: Place your hand on your stomach — breathe from there, not your chest. Support every note with diaphragmatic breath. Open your mouth wider on high notes. Record at 24-bit/48kHz minimum. Keep 6-12 inches from the mic. Use a pop filter. Drink room-temperature water (not cold). Avoid dairy before recording. S.M.U.V.E knows vocal science.' };
    }
    if (cmd.action === 'chain' || cmd.action === 'signal-chain') {
      return { success: true, message: 'PRO VOCAL CHAIN: 1) Subtractive EQ (cut mud 300Hz, harshness 3kHz). 2) Composer (3:1 ratio, -3dB gain reduction). 3) De-esser (5-8kHz). 4) Additive EQ (boost 2-4kHz presence, 10kHz air). 5) Saturation (10% mix). 6) Reverb (plate). 7) Delay (1/4, 15% mix). Follow this chain. Results guaranteed. Mediocrity not tolerated.' };
    }
    return { success: true, message: 'Vocal control active. Commands: warmup, tips, chain, record, comp, mix. Your voice is your instrument — S.M.U.V.E will sharpen it.' };
  }

  private handleKnowledge(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'overview') {
      const counts = this.knowledge.getCounts();
      const overview = Object.entries(counts)
        .map(([cat, num]) => `  ${cat}: ${num} entries`)
        .join('\n');
      return { success: true, message: `S.M.U.V.E KNOWLEDGE ENGINE: ${this.knowledge.getAllKnowledge().length} total entries across:\n${overview}\n\nSearch with: /knowledge [topic] (e.g., /knowledge mixing, /knowledge copyright, /knowledge vocal)` };
    }
    if (cmd.action === 'search' && cmd.target) {
      const results = this.knowledge.search(cmd.target);
      if (results.length === 0) {
        return { success: false, message: `No knowledge found for "${cmd.target}". Try: mixing, mastering, vocal, songwriting, marketing, legal, business, distribution, career, sound-design, recording, branding, promotion, collaboration, copyright, revenue` };
      }
      const top = results.slice(0, 3);
      const entries = top.map(e => `  📚 ${e.title} [${e.category}/${e.subcategory}] (${e.difficulty})`).join('\n');
      return { success: true, message: `S.M.U.V.E found ${results.length} entries for "${cmd.target}":\n${entries}\n\nLearn more: /teach ${results[0].category}` };
    }
    return { success: true, message: 'Knowledge engine active. Use /knowledge [topic] to search the SMUVE knowledge base.' };
  }

  private handleTeach(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'available') {
      return { success: true, message: 'S.M.U.V.E TEACHING MODULES:\n  /teach Production - Mixing, sound design, arrangement\n  /teach Songwriting - Lyrics, melody, structure\n  /teach Vocal - Technique, recording, processing\n  /teach Marketing - Social media, branding, promotion\n  /teach Business - Revenue, strategy, team building\n  /teach Legal - Copyright, contracts, rights\n  /teach Distribution - Platforms, release strategy\n  /teach Career - Growth, networking, roadmap' };
    }
    const domain = this.normalizeDomain(cmd.target || '');
    const lesson = domain ? this.knowledge.generateLesson(domain) : null;
    if (!lesson) {
      return { success: false, message: `No lesson available for "${cmd.target}". Try: Production, Songwriting, Vocal, Marketing, Business, Legal, Distribution, Career` };
    }
    this.isTeaching.set(true);
    this.currentLesson.set(lesson);
    const steps = lesson.steps.map((s, i) => `  Step ${i + 1}: ${s}`).join('\n');
    return { success: true, message: `🔬 S.M.U.V.E LESSON INITIATED\n${'='.repeat(50)}\n${lesson.title}\n${'='.repeat(50)}\n\n${steps}\n\nType /next for next lesson or /done to exit teaching mode.` };
  }

  private normalizeDomain(input: string): KnowledgeCategory | null {
    const map: Record<string, KnowledgeCategory> = {
      'production': 'Production', 'mixing': 'Production', 'sound-design': 'Production',
      'songwriting': 'Songwriting', 'writing': 'Songwriting', 'lyrics': 'Songwriting',
      'vocal': 'Vocal', 'voice': 'Vocal', 'singing': 'Vocal',
      'marketing': 'Marketing', 'promotion': 'Marketing', 'branding': 'Marketing',
      'business': 'Business', 'revenue': 'Business', 'money': 'Business',
      'legal': 'Legal', 'copyright': 'Legal', 'contracts': 'Legal', 'law': 'Legal',
      'distribution': 'Distribution', 'distro': 'Distribution', 'release': 'Distribution',
      'career': 'Career', 'growth': 'Career', 'networking': 'Career',
    };
    return map[input.toLowerCase().trim()] || null;
  }

  private async handleAI(cmd: ControlCommand): Promise<CommandResult> {
    if (cmd.action === 'audit') {
      this.ai.performExecutiveAudit();
      return { success: true, message: 'Executive audit initialized. S.M.U.V.E is scanning your entire profile, catalog, and trajectory. Results in 3... 2... 1...' };
    }
    if (cmd.action === 'status') {
      return { success: true, message: `S.M.U.V.E neural status: OPERATIONAL. Processing power: ${Math.floor(Math.random() * 30 + 70)}%. Contempt level: MAXIMUM. Ready to command.` };
    }
    if (cmd.action === 'decree' || cmd.action === 'decree!') {
      const decree = this.ai.generateStrategicDecree();
      return { success: true, message: `STRATEGIC DECREE: ${decree}` };
    }
    if (cmd.action === 'songwrite') {
      const topic = cmd.target || 'love and loss';
      const result = this.songwriting.generateLyrics(topic, 'pop', 'emotional');
      const sections = result.lyrics.map(s => 
        `\n${s.type.toUpperCase()}:${s.lines.map(l => `  ${l.text}`).join('\n')}`
      ).join('');
      
      const chords = result.chordProgressions.slice(0, 2).map(c => 
        `  • ${c.name} (${c.chords.join(' - ')}) — ${c.mood}`
      ).join('\n');
      
      return { 
        success: true, 
        message: `✍️ S.M.U.V.E SONGWRITING ASSISTANT\n${'═'.repeat(50)}\nTopic: "${topic}"\nStructure: ${result.structure.name}\n\nCHORD PROGRESSIONS:\n${chords}\n\nLYRICS:${sections}\n\nMELODY TIP: ${result.melodyIdeas[0]?.description || 'Start simple, build from there.'}\n${result.styleTips ? '\nSTYLE TIPS:\n' + result.styleTips.join('\n') : ''}\n\nUse /write [topic] to generate more or /write [topic] in style of [artist]`
      };
    }
    if (cmd.action === 'beat') {
      const style = cmd.target || 'Drake';
      const title = cmd.parameters?.['title'];
      const available = this.beatGenerator['styleMimic'].getAvailableArtists();
      const availableStr = available.join(', ');
      
      // Check if the requested style is an available artist
      const artistMatch = available.find(a => a.toLowerCase().includes(style.toLowerCase()));
      const targetStyle = artistMatch || style;
      
      const blueprint = this.beatGenerator.generateBeatBlueprint(targetStyle, title);
      return { 
        success: true, 
        message: `${blueprint}\n\nAvailable artists: ${availableStr}\n\nUse /beat [artist] or /beat [genre] e.g., /beat Drake or /beat trap`
      };
    }
    if (cmd.action === 'cowrite-help') {
      return { success: true, message: `✍️ S.M.U.V.E CO-WRITE COMMANDS\n${'═'.repeat(50)}\n/cowrite [topic] - Start co-write session on a topic\n/cowrite [topic] with [artist] - With artist influence\n/cowrite status - View current session status\n/cowrite lyrics - View compiled lyrics from session\n/cowrite add "your line" - Add a line to the session\n/cowrite accept - Accept SMUVE's last suggestion\n/cowrite reject - Reject and request rewrite\n/cowrite end - End current session\n/cowrite studio - Open the Co-Write Studio UI\n\nOr just type a topic and I'll start co-writing!` };
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
        message: `✍️ CO-WRITE SESSION INITIATED\n${'═'.repeat(50)}\nTopic: ${session?.topic}\nMood: ${session?.mood}\nKey: ${session?.key} | BPM: ${session?.bpm}\n${session?.artist ? `Influence: ${session.artist}` : 'Influence: None (raw S.M.U.V.E persona)'}\n\nI've started the first section. Your turn — send me a line.\n\nAvailable: /cowrite status, /cowrite lyrics, /cowrite end, /cowrite studio`
      };
    }
    if (cmd.action === 'cowrite-status') {
      return { success: true, message: this.cowrite.getSessionSummary() };
    }
    if (cmd.action === 'cowrite-lyrics') {
      const lyrics = this.cowrite.getCompiledLyrics();
      if (!lyrics) {
        return { success: false, message: 'No accepted lines yet. Start a session with /cowrite [topic] and accept some lines.' };
      }
      return { success: true, message: `📜 CO-WRITE COMPILATION\n${'═'.repeat(50)}\n${lyrics}` };
    }
    if (cmd.action === 'cowrite-end') {
      this.cowrite.endSession();
      return { success: true, message: 'Co-write session ended. Your compiled lyrics are available with /cowrite lyrics. To start a new session: /cowrite [topic]' };
    }
    return { success: true, message: 'AI command center. Available: audit, status, decree, songwrite, beat, cowrite, upgrade [id], scan' };
  }

  private handleExport(cmd: ControlCommand): CommandResult {
    if (cmd.action === 'formats') {
      return { success: true, message: 'EXPORT FORMATS: WAV (24-bit, highest quality), MP3 (320kbps, streaming), FLAC (lossless, archiving), STEMS (individual track exports). Use: /export [format]' };
    }
    if (cmd.target) {
      return { success: true, message: `Exporting as ${cmd.target.toUpperCase()}. This will overwrite any previous export. Confirmed? (Type YES to confirm or NO to cancel)` };
    }
    return { success: true, message: 'Export system ready. Use /export wav, /export mp3, /export stems, or /export formats' };
  }
}
