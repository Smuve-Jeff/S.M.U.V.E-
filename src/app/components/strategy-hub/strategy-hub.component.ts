import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserProfileService } from '../../services/user-profile.service';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  category: 'pre' | 'day' | 'post';
}

@Component({
  selector: 'app-strategy-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './strategy-hub.component.html',
  styleUrls: ['./strategy-hub.component.css'],
})
export class StrategyHubComponent {
  private profileService = inject(UserProfileService);
  profile = this.profileService.profile;

  // Marketing Tools logic
  adSpend = signal(100);
  estimatedReach = computed(() => this.adSpend() * 15);
  estimatedConversions = computed(() => Math.floor(this.adSpend() * 0.2));

  trendHooks = signal<string[]>([
    "Start with a question that your genre's audience always asks.",
    "The 'POV: You just found your new favorite artist' transition.",
    "Show the 'Struggle vs Success' timeline of your latest track.",
    'Vibe check: Use high-contrast lighting with your deep bass tracks.',
  ]);

  checklists = signal<ChecklistItem[]>([
    {
      id: '1',
      label: 'Register with PRO (ASCAP/BMI)',
      completed: false,
      category: 'pre',
    },
    { id: '2', label: 'Submit to The MLC', completed: false, category: 'pre' },
    {
      id: '3',
      label: 'Register with SoundExchange',
      completed: false,
      category: 'pre',
    },
    { id: '4', label: 'Create EPK', completed: false, category: 'pre' },
    {
      id: '5',
      label: 'Pitch to Playlists (3 weeks out)',
      completed: false,
      category: 'pre',
    },
    { id: '6', label: 'Social Media Blast', completed: false, category: 'day' },
    { id: '7', label: 'Email Newsletter', completed: false, category: 'day' },
    { id: '8', label: 'Monitor Analytics', completed: false, category: 'post' },
    {
      id: '9',
      label: 'Submit for Sync Licensing',
      completed: false,
      category: 'post',
    },
  ]);

  educationalGuides = [
    {
      title: 'Performance Rights Organizations (PROs)',
      content:
        'PROs (ASCAP, BMI, SESAC) collect performance royalties whenever your music is played publicly (radio, TV, live venues, streaming).',
    },
    {
      title: 'The MLC (Mechanical Licensing Collective)',
      content:
        'The MLC collects mechanical royalties from digital service providers (DSPs) like Spotify and Apple Music for the use of musical works.',
    },
    {
      title: 'SoundExchange',
      content:
        'SoundExchange collects non-interactive digital performance royalties for featured artists and copyright owners.',
    },
    {
      title: 'Marketing Strategy 101',
      content:
        'Focus on 80% content creation and 20% direct promotion. Build a community, not just a following.',
    },
    {
      title: 'Apple Music for Artists',
      content:
        'Gain deep insights into your listeners demographics and which playlists are driving your streams.',
    },
    {
      title: 'Spotify for Artists',
      content:
        'The gold standard for direct-to-fan communication and playlist pitching. Verify early to unlock the "Marquee" tool.',
    },
    {
      title: 'YouTube for Artists',
      content:
        'Consolidate your channel, VEVO, and personal accounts into one Official Artist Channel (OAC) for better SEO.',
    },
    {
      title: 'Sync Licensing Mastery',
      content:
        'Pitch your music to music supervisors for TV, films, and games. Ensure your metadata is clean and you have high-quality instrumentals ready.',
    },
    {
      title: 'Publishing & Admin',
      content:
        'Collect your songwriter and publisher royalties globally. Register with a Publishing Administrator (like Songtrust) to capture mechanicals.',
    },
    {
      title: 'International Royalties',
      content:
        'Your music travels. Ensure your PRO is part of the CISAC network to collect performance royalties from every territory automatically.',
    },
  ];

  toggleItem(id: string) {
    this.checklists.update((items) =>
      items.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  }

  progress = computed(() => {
    const total = this.checklists().length;
    const completed = this.checklists().filter((i) => i.completed).length;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  });
}
