import { Component, OnInit, signal, inject, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AiService } from '../../services/ai.service';
import { GameService } from '../../hub/game.service';
import { UserProfileService, UserProfile } from '../../services/user-profile.service';
import { ReputationService } from '../../services/reputation.service';
import { Game, ShowcaseProject, CollabRequest, ChatMessage, OnlineUser } from '../../hub/hub.models';
import { Subject, timer, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Router } from '@angular/router';
import { SafeResourceUrl, DomSanitizer } from '@angular/platform-browser';

export interface GameRoom {
  id: string;
  gameId: string;
  roomName: string;
  host: string;
  players: number;
  maxPlayers: number;
  status: 'Waiting' | 'In Progress';
}

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
})
export class ThaSpotComponent implements OnInit {
  public aiService = inject(AiService);
  private gameService = inject(GameService);
  public profileService = inject(UserProfileService);
  public reputationService = inject(ReputationService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  // Hub State
  activeTab = signal<'arcade' | 'showcase' | 'networking'>('arcade');

  // Gaming Hub State
  games = signal<Game[]>([]);
  selectedGame = signal<Game | undefined>(undefined);
  activeFilters = signal<{ genre?: string; query?: string }>({});
  sortMode = signal<'Popular' | 'Rating' | 'Newest'>('Popular');

  // PvP & Interactions
  gameRooms = signal<GameRoom[]>([]);
  isGameOverlayActive = signal<boolean>(false);
  safeGameUrl = signal<SafeResourceUrl | null>(null);

  // Live Game Stats
  gameScore = signal<number>(0);
  gameMultiplier = signal<number>(1.0);
  opponentHealth = signal<number>(100);
  crowdHype = signal<number[]>(new Array(5).fill(20));

  // AI Commentary State
  aiCommentary = signal<string>('S.M.U.V.E 3.0: SYSTEM STANDBY. SELECT MISSION.');

  genres = [
    'Shooter',
    'Adventure',
    'Sports',
    'RPG',
    'Classic',
    'Arcade',
    'Puzzle',
    'Arena',
    'Runner',
    'Rhythm',
    'Music Battle',
  ];

  // Showcase State
  showcaseProjects = signal<ShowcaseProject[]>([]);

  // Networking State
  collabRequests = signal<CollabRequest[]>([]);
  chatMessages = signal<ChatMessage[]>([]);
  onlineUsers = signal<OnlineUser[]>([]);
  newChatMessage = signal<string>('');

  // Profile Modal State
  viewingProfile = signal<Partial<UserProfile> | null>(null);

  private searchSubject = new Subject<string>();

  @HostListener('window:message', [''])
  onMessage(event: MessageEvent) {
    if (event.data && event.data.type === 'GAME_UPDATE') {
      const data = event.data.data;
      if (data.score !== undefined) this.gameScore.set(data.score);
      if (data.multiplier !== undefined) this.gameMultiplier.set(data.multiplier);
      if (data.health !== undefined) this.opponentHealth.set(data.health);

      // Update crowd hype based on activity
      if (data.lastAction || data.event) {
          this.crowdHype.update(h => h.map(val => Math.min(100, Math.max(20, val + (Math.random() * 20 - 5)))));
      }

      // If health reaches 0, trigger win
      if (data.health <= 0 && this.isGameOverlayActive()) {
          this.handleGameWin();
      }
    }
  }

  ngOnInit() {
    this.fetchGames();
    this.initializeMockData();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.activeFilters.update((filters) => ({ ...filters, query }));
        this.fetchGames();
      });

    // Simulate AI Commentary
    timer(0, 8000).subscribe(() => {
        if (this.isGameOverlayActive()) {
            this.generateAiCommentary();
        }
    });
  }

  requestAiBuff() {
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'AI_INTERVENTION',
        payload: 'STRATEGIC_OVERDRIVE_ACTIVATED'
      }, '*');
      this.aiCommentary.set('S.M.U.V.E 3.0: STRATEGIC OVERDRIVE INITIATED. MULTIPLIER BOOSTED.');
      this.reputationService.addXp(50);
    }
  }

  processSmuveCommand(command: string) {
    const cmd = command.toLowerCase();
    let response = '';

    if (cmd.includes('status')) {
      response = 'S.M.U.V.E 3.0: SYSTEM OPTIMAL. REPUTATION LVL: ' + this.reputationService.state().level + '. XP: ' + this.reputationService.state().xp;
    } else if (cmd.includes('analyze')) {
      response = 'S.M.U.V.E 3.0: ANALYZING THA SPOT... HIGH CONCENTRATION OF STRATEGIC POTENTIAL DETECTED.';
    } else if (cmd.includes('target')) {
      const users = this.onlineUsers();
      const target = users[Math.floor(Math.random() * users.length)].name;
      response = 'S.M.U.V.E 3.0: OPTIMAL TARGET ACQUIRED: ' + target.toUpperCase() + '. PROCEED WITH CHALLENGE.';
    } else {
      response = 'S.M.U.V.E 3.0: COMMAND RECEIVED. EXECUTING STRATEGIC MANEUVER...';
    }

    this.aiCommentary.set(response);

    const msg: ChatMessage = {
      id: Date.now().toString(),
      user: 'S.M.U.V.E',
      text: response,
      timestamp: new Date(),
      isSystem: true
    };
    this.chatMessages.update(msgs => [...msgs, msg]);
  }

  updateTabInsights() {
    const tab = this.activeTab();
    let insight = '';
    switch(tab) {
      case 'arcade':
        insight = 'S.M.U.V.E 3.0: ARCADE STATS SHOW 85% PvP EFFICIENCY IN THA BATTLEFIELD.';
        break;
      case 'showcase':
        insight = 'S.M.U.V.E 3.0: MARKET TRENDS INDICATE SURGE IN SYNTH-INDUSTRIAL HYBRIDS.';
        break;
      case 'networking':
        insight = 'S.M.U.V.E 3.0: 4 STRATEGIC ALLIANCES IDENTIFIED. BROADCASTING COLLAB REQUESTS.';
        break;
    }
    this.aiCommentary.set(insight);
  }

  initializeMockData() {
    this.showcaseProjects.set([
      {
        id: 's1',
        title: 'Cyber-Neon Dreams',
        creator: 'DJ Zenith',
        type: 'Audio',
        thumbnail: 'https://picsum.photos/seed/cyber/300/200',
        likes: 124,
        plays: 1250,
        tags: ['Synthwave', 'Experimental']
      },
      {
        id: 's2',
        title: 'Strategic Dominance Visuals',
        creator: 'Visual Architect',
        type: 'Video',
        thumbnail: 'https://picsum.photos/seed/visual/300/200',
        likes: 89,
        plays: 450,
        tags: ['Cinematic', 'Abstract']
      }
    ]);

    this.collabRequests.set([
      {
        id: 'c1',
        user: 'RhythmKing',
        role: 'Drummer',
        projectGoal: 'Looking for a vocalist for a heavy industrial track.',
        genres: ['Industrial', 'Techno'],
        timestamp: new Date()
      },
      {
        id: 'c2',
        user: 'VocalVixen',
        role: 'Vocalist',
        projectGoal: 'Need a producer for my upcoming R&B EP.',
        genres: ['R&B', 'Soul'],
        timestamp: new Date()
      }
    ]);

    this.onlineUsers.set([
      { id: 'u1', name: 'S.M.U.V.E', status: 'Idle', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=smuve' },
      { id: 'u2', name: 'DJ Zenith', status: 'Gaming', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zenith' },
      { id: 'u3', name: 'RhythmKing', status: 'Jamming', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=king' },
      { id: 'u4', name: 'BeatMaster', status: 'Gaming', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=beat' },
    ]);

    this.gameRooms.set([
      { id: 'r1', gameId: '1', roomName: 'BATTLE_ROOM_ALPHA', host: 'DJ Zenith', players: 1, maxPlayers: 2, status: 'Waiting' },
      { id: 'r2', gameId: '5', roomName: 'NEON_STRIKE_SQUAD', host: 'RhythmKing', players: 3, maxPlayers: 4, status: 'In Progress' },
    ]);

    this.chatMessages.set([
      { id: 'm1', user: 'SYSTEM', text: 'Welcome to Tha Spot Global Hub.', timestamp: new Date(), isSystem: true },
      { id: 'm2', user: 'DJ Zenith', text: 'Anyone down for a Remix Arena match?', timestamp: new Date() }
    ]);
  }

  fetchGames() {
    this.gameService
      .listGames(this.activeFilters(), this.sortMode())
      .subscribe((games) => this.games.set(games));
  }

  selectGame(game: Game) {
    this.selectedGame.set(game);
    this.isGameOverlayActive.set(true);
    this.safeGameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(game.url));
    this.aiCommentary.set(`S.M.U.V.E 3.0: INITIALIZING ${game.name.toUpperCase()}. TARGET ACQUIRED.`);

    // Reset stats
    this.gameScore.set(0);
    this.gameMultiplier.set(1.0);
    this.opponentHealth.set(100);
    this.crowdHype.set([30, 45, 60, 40, 55]);
  }

  closeGame() {
    this.isGameOverlayActive.set(false);
    this.safeGameUrl.set(null);
    this.selectedGame.set(undefined);
    this.aiCommentary.set('S.M.U.V.E 3.0: MISSION ABORTED. RETURNING TO HUB.');
  }

  challengeUser(user: OnlineUser) {
    const msg: ChatMessage = {
        id: Date.now().toString(),
        user: 'SYSTEM',
        text: `${this.profileService.profile().artistName} challenged ${user.name} to a PvP DUEL!`,
        timestamp: new Date(),
        isSystem: true
    };
    this.chatMessages.update(msgs => [...msgs, msg]);
    this.aiCommentary.set(`S.M.U.V.E 3.0: CHALLENGE ISSUED TO ${user.name.toUpperCase()}. PREPARE FOR DOMINANCE.`);
  }

  joinRoom(room: GameRoom) {
      const game = this.games().find(g => g.id === room.gameId);
      if (game) {
          this.selectGame(game);
      }
  }

  handleGameWin() {
      const msg: ChatMessage = {
          id: Date.now().toString(),
          user: 'SYSTEM',
          text: `${this.profileService.profile().artistName} HAS DOMINATED THE MATCH! REPUTATION INCREASED.`,
          timestamp: new Date(),
          isSystem: true
      };
      this.chatMessages.update(msgs => [...msgs, msg]);
      this.aiCommentary.set("S.M.U.V.E 3.0: VICTORY ATTAINED. STRATEGIC SUPERIORITY CONFIRMED.");
      this.opponentHealth.set(100);
      this.reputationService.addXp(250);
  }

  generateAiCommentary() {
      const quotes = [
          "S.M.U.V.E 3.0: ANALYZING PERFORMANCE... INEFFICIENT BUT PROMISING.",
          "S.M.U.V.E 3.0: YOU ARE PLAYING LIKE A NOVICE. FOCUS.",
          "S.M.U.V.E 3.0: STRATEGIC ADVANTAGE DETECTED. PRESS THE ATTACK.",
          "S.M.U.V.E 3.0: REAL-TIME MULTIPLAYER SYNC... STABLE.",
          "S.M.U.V.E 3.0: THE CROWD IS UNIMPRESSED. EXECUTE A COMBO.",
          "S.M.U.V.E 3.0: OPPONENT VULNERABILITY DETECTED. FINISH THEM."
      ];
      this.aiCommentary.set(quotes[Math.floor(Math.random() * quotes.length)]);
  }

  onSearch(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.searchSubject.next(query);
  }

  setGenre(genre?: string) {
    this.activeFilters.update((filters) => ({
      ...filters,
      genre: this.activeFilters().genre === genre ? undefined : genre,
    }));
    this.fetchGames();
  }

  setActiveTab(tab: 'arcade' | 'showcase' | 'networking') {
    this.activeTab.set(tab);
    this.updateTabInsights();
  }

    sendChatMessage() {
    if (!this.newChatMessage().trim()) return;
    const text = this.newChatMessage().trim();
    let handledAsCommand = false;

    if (text.startsWith('/smuve')) {
        this.processSmuveCommand(text.replace('/smuve', '').trim());
        handledAsCommand = true;
    } else if (text.startsWith('/challenge')) {
        const parts = text.split(' ');
        if (parts.length > 1) {
            const target = parts[1].replace('@', '');
            this.aiCommentary.set("S.M.U.V.E 3.0: SEARCHING FOR " + target.toUpperCase() + "... CHALLENGE BROADCASTED.");
        }
        // Don't mark as handled because we want the challenge text to appear in chat
    }

    if (!handledAsCommand) {
        const msg: ChatMessage = {
          id: Date.now().toString(),
          user: this.profileService.profile().artistName || 'Anonymous',
          text: text,
          timestamp: new Date()
        };
        this.chatMessages.update(msgs => [...msgs, msg]);
    }
    this.newChatMessage.set('');
  }

  toggleAIBassist() {
    if (this.aiService.isAIBassistActive()) {
      this.aiService.stopAIBassist();
    } else {
      this.aiService.startAIBassist();
    }
  }

  toggleAIDrummer() {
    if (this.aiService.isAIDrummerActive()) {
      this.aiService.stopAIDrummer();
    } else {
      this.aiService.startAIDrummer();
    }
  }

  toggleAIKeyboardist() {
    if (this.aiService.isAIKeyboardistActive()) {
      this.aiService.stopAIKeyboardist();
    } else {
      this.aiService.startAIKeyboardist();
    }
  }

  joinJamAs(role: 'Bassist' | 'Drummer' | 'Keyboardist') {
    switch(role) {
      case 'Bassist':
        this.aiService.stopAIBassist();
        break;
      case 'Drummer':
        this.aiService.stopAIDrummer();
        break;
      case 'Keyboardist':
        this.aiService.stopAIKeyboardist();
        break;
    }

    const msg: ChatMessage = {
      id: Date.now().toString(),
      user: 'SYSTEM',
      text: `${this.profileService.profile().artistName} has taken the ${role} slot in the Jam!`,
      timestamp: new Date(),
      isSystem: true
    };
    this.chatMessages.update(msgs => [...msgs, msg]);
  }

  viewProfile(userName: string) {
    this.viewingProfile.set({
      artistName: userName,
      bio: `Strategic collaborator and regular at Tha Spot. Expert in ${userName === 'DJ Zenith' ? 'Electronic Production' : 'Percussion'}.`,
      primaryGenre: userName === 'DJ Zenith' ? 'Electronic' : 'Industrial',
      skills: userName === 'DJ Zenith' ? ['Producer', 'DJ'] : ['Drummer', 'Engineer'],
      careerStage: 'Building Fanbase'
    });
  }

  closeProfile() {
    this.viewingProfile.set(null);
  }

  goToMyProfile() {
    this.router.navigate(['/profile']);
  }
}
