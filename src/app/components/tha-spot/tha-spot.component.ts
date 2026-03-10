import { Component, signal, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIService } from '../../services/ui.service';
import { GameService } from '../../hub/game.service';
import { SafePipe } from '../../shared/pipes/safe.pipe';

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [CommonModule, SafePipe],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css']
})
export class ThaSpotComponent {
  public uiService = inject(UIService);
  private gameService = inject(GameService);

  onlineCount = signal(1243);
  activeTab = signal('arcade');
  selectedGame = signal<any>(null);
  currentScore = signal(0);
  repProgress = signal(35);
  gameStats = signal({ health: 100, multiplier: 1.0 });

  tabs = [
    { id: 'arcade', label: 'The Arcade' },
    { id: 'networking', label: 'Networking Lounge' },
    { id: 'showcase', label: 'Project Showcase' }
  ];

  games = signal([
    { title: 'Tha Battlefield', genre: 'STRATEGY', plays: '45.2K', description: 'Elite tactical warfare simulation.', thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop', url: 'assets/games/battlefield/battlefield.html' },
    { title: 'Remix Arena', genre: 'RHYTHM', plays: '32.1K', description: 'High-energy beat matching combat.', thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2070&auto=format&fit=crop', url: 'assets/games/remix-arena/remixarena.html' },
    { title: 'Neon Beat-Runner', genre: 'ARCADE', plays: '12.8K', description: 'Fast-paced synthwave navigation.', thumbnail: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop', url: 'https://html5.gamedistribution.com/53066d2f440445d38865660682245b78/' }
  ]);

  networkingFeed = signal([
    { username: 'Elite Producer', handle: 'pro_architect', avatar: 'https://i.pravatar.cc/150?u=pro', time: '2m ago', content: 'Just stabilized the neural link. The industrial engine is pushing insane transients today.', likes: 154, replies: 28 },
    { username: 'Neon Knight', handle: 'neon_vortex', avatar: 'https://i.pravatar.cc/150?u=neon', time: '15m ago', content: 'Protocol Omega just initialized my release strategy. Market resonance is off the charts.', likes: 89, replies: 12 }
  ]);

  chatMessages = signal<{user: string, text: string}[]>([]);
  newChatMessage = signal('');

  featuredTracks = signal([
    { title: 'Liquid Obsidian', artist: 'Architect Alpha', cover: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=2070&auto=format&fit=crop', waves: [40, 70, 45, 90, 60, 80, 50, 30, 40, 70, 45, 90, 60, 80, 50, 30] },
    { title: 'Quantum Flux', artist: 'Domain Sage', cover: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070&auto=format&fit=crop', waves: [30, 50, 80, 40, 60, 90, 70, 45, 30, 50, 80, 40, 60, 90, 70, 45] }
  ]);

  @HostListener('window:message', [''])
  onMessage(event: MessageEvent) {
    if (event.data.type === 'GAME_UPDATE') {
      this.currentScore.set(event.data.score || 0);
      this.gameStats.set({
        health: event.data.health || 100,
        multiplier: event.data.multiplier || 1.0
      });
      this.repProgress.set((this.currentScore() % 1000) / 10);
    }
  }

  playGame(game: any) {
    this.selectedGame.set(game);
  }

  closeGame() {
    this.selectedGame.set(null);
    this.currentScore.set(0);
  }

  setActiveTab(tabId: string) {
    this.activeTab.set(tabId);
  }

  sendChatMessage() {
    if (this.newChatMessage()) {
      this.chatMessages.update(m => [...m, { user: 'Executive', text: this.newChatMessage() }]);
      this.newChatMessage.set('');
    }
  }
}
