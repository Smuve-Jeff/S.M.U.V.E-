import { Component, OnInit, signal, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VisualizerComponent } from '../visualizer/visualizer.component';
import { AiService } from '../../services/ai.service';
import { GameService } from '../../hub/game.service';
import { UserProfileService, UserProfile } from '../../services/user-profile.service';
import { Game, ShowcaseProject, CollabRequest, ChatMessage, OnlineUser } from '../../hub/hub.models';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, FormsModule, VisualizerComponent],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css'],
})
export class ThaSpotComponent implements OnInit {
  public aiService = inject(AiService);
  private gameService = inject(GameService);
  public profileService = inject(UserProfileService);
  private router = inject(Router);

  // Hub State
  activeTab = signal<'arcade' | 'showcase' | 'networking'>('arcade');

  // Gaming Hub State
  games = signal<Game[]>([]);
  selectedGame = signal<Game | undefined>(undefined);
  activeFilters = signal<{ genre?: string; query?: string }>({});
  sortMode = signal<'Popular' | 'Rating' | 'Newest'>('Popular');

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

  ngOnInit() {
    this.fetchGames();
    this.initializeMockData();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((query) => {
        this.activeFilters.update((filters) => ({ ...filters, query }));
        this.fetchGames();
      });
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
      { id: 'u3', name: 'RhythmKing', status: 'Jamming', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=king' }
    ]);

    this.chatMessages.set([
      { id: 'm1', user: 'SYSTEM', text: 'Welcome to Tha Spot Global Hub.', timestamp: new Date(), isSystem: true },
      { id: 'm2', user: 'DJ Zenith', text: 'Anyone down for a Remi Arena match?', timestamp: new Date() }
    ]);
  }

  fetchGames() {
    this.gameService
      .listGames(this.activeFilters(), this.sortMode())
      .subscribe((games) => this.games.set(games));
  }

  selectGame(game: Game) {
    this.selectedGame.set(game);
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
  }

  sendChatMessage() {
    if (!this.newChatMessage().trim()) return;

    const msg: ChatMessage = {
      id: Date.now().toString(),
      user: this.profileService.profile().artistName || 'Anonymous',
      text: this.newChatMessage(),
      timestamp: new Date()
    };

    this.chatMessages.update(msgs => [...msgs, msg]);
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
    // In a real app, we'd fetch the user's profile from the service
    // For now, we simulate with mock data
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
