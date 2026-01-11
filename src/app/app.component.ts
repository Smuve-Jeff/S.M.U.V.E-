import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { UIService } from './services/ui.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { HubComponent } from './hub/hub.component';
import { Game, Challenge, CommunityPost } from './hub/hub.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ChatbotComponent, HubComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  // Dependency Injection
  authService = inject(AuthService);
  uiService = inject(UIService);

  games: Game[] = [];
  challenges: Challenge[] = [];
  communityPosts: CommunityPost[] = [];

  constructor() {}

  ngOnInit() {
    this.loadHubData();
  }

  loadHubData() {
    // Mock data for now
    this.games = [
      { id: '1', title: 'Beat Match Master', description: 'Match the tempo of a random track.', icon: 'fas fa-headphones-alt' },
      { id: '2', title: 'EQ-IQ Challenge', description: 'Guess the EQ settings of a track.', icon: 'fas fa-sliders-h' },
      { id: '3', title: 'Live Remix Royale', description: 'Compete in a live remixing battle.', icon: 'fas fa-crown' },
    ];

    this.challenges = [
      { id: '1', title: 'Weekly Top Remixer', description: 'Submit your best remix this week.', prize: 'Exclusive Sample Pack' },
      { id: '2', title: 'Mashup Mania', description: 'Create a mashup of three given tracks.', prize: 'SMUVE Pro Subscription' },
    ];

    this.communityPosts = [
      { id: '1', author: 'DJ-Ignite', content: 'Just dropped a new fire trance mix! Check it out on my profile.', timestamp: new Date() },
      { id: '2', author: 'VinylVixen', content: 'Anyone have tips for scratching over a high-BPM track?', timestamp: new Date() },
      { id: '3', author: 'BassJunkie', content: 'That new filter update is a game changer! Loving the resonance controls.', timestamp: new Date() },
    ];
  }

  toggleChatbot() {
    this.uiService.toggleChatbot();
  }
}
