import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserProfileService } from '../../services/user-profile.service';
import { MarketingService } from '../../services/marketing.service';
import { CommandCenterComponent } from '../command-center/command-center.component';
import { MarketingCampaign } from '../../types/marketing.types';

type StrategyTab = 'overview' | 'campaigns' | 'analytics' | 'outreach' | 'social';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  category: 'pre' | 'day' | 'post';
}

@Component({
  selector: 'app-strategy-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CommandCenterComponent],
  templateUrl: './strategy-hub.component.html',
  styleUrls: ['./strategy-hub.component.css'],
})
export class StrategyHubComponent {
  private profileService = inject(UserProfileService);
  private marketingService = inject(MarketingService);

  profile = this.profileService.profile;
  activeTab = signal<StrategyTab>('overview');

  // Campaign Data
  campaigns = this.marketingService.campaigns;
  socialStats = this.marketingService.socialData;
  streamingStats = this.marketingService.streamingData;

  // New Campaign Form
  newCampaign = signal<Partial<MarketingCampaign>>({
    name: '',
    budget: 0,
    status: 'Draft',
    platforms: ['Instagram'],
    strategyLevel: 'Modern Professional'
  });

  // Overview Data (existing logic)
  adSpend = signal(100);
  estimatedReach = computed(() => this.marketingService.getProjections(this.adSpend(), 'Instagram').reach);
  estimatedConversions = computed(() => this.marketingService.getProjections(this.adSpend(), 'Instagram').conversions);

  trendHooks = signal<string[]>([
    "Start with a question that your genre's audience always asks.",
    "The 'POV: You just found your new favorite artist' transition.",
    "Show the 'Struggle vs Success' timeline of your latest track.",
    'Vibe check: Use high-contrast lighting with your deep bass tracks.',
  ]);

  checklists = signal<ChecklistItem[]>([
    { id: '1', label: 'Register with PRO (ASCAP/BMI)', completed: false, category: 'pre' },
    { id: '2', label: 'Submit to The MLC', completed: false, category: 'pre' },
    { id: '3', label: 'Register with SoundExchange', completed: false, category: 'pre' },
    { id: '4', label: 'Create EPK', completed: false, category: 'pre' },
    { id: '5', label: 'Pitch to Playlists (3 weeks out)', completed: false, category: 'pre' },
    { id: '6', label: 'Social Media Blast', completed: false, category: 'day' },
    { id: '7', label: 'Email Newsletter', completed: false, category: 'day' },
    { id: '8', label: 'Monitor Analytics', completed: false, category: 'post' },
    { id: '9', label: 'Submit for Sync Licensing', completed: false, category: 'post' },
  ]);

  educationalGuides = [
    {
      title: 'Performance Rights Organizations (PROs)',
      content: 'PROs (ASCAP, BMI, SESAC) collect performance royalties whenever your music is played publicly (radio, TV, live venues, streaming).',
    },
    {
      title: 'Marketing Strategy 101',
      content: 'Focus on 80% content creation and 20% direct promotion. Build a community, not just a following.',
    }
  ];

  async saveCampaign() {
    if (this.newCampaign().name) {
      await this.marketingService.createCampaign({
        name: this.newCampaign().name!,
        budget: this.newCampaign().budget || 0,
        status: 'Active',
        startDate: new Date().toISOString(),
        targetAudience: 'Global Listeners',
        goals: ['Brand Awareness'],
        platforms: this.newCampaign().platforms || ['Instagram'],
        strategyLevel: this.newCampaign().strategyLevel || 'Modern Professional',
        metrics: { reach: 0, impressions: 0, engagement: 0, conversions: 0, spend: 0, roi: 0, ctr: 0, cpc: 0 }
      });
      this.resetCampaignForm();
    }
  }

  private resetCampaignForm() {
    this.newCampaign.set({
      name: '',
      budget: 0,
      status: 'Draft',
      platforms: ['Instagram'],
      strategyLevel: 'Modern Professional'
    });
  }

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

  getImpactColor(impact: string): string {
    switch (impact) {
      case 'High': return 'text-emerald-400';
      case 'Medium': return 'text-yellow-400';
      case 'Low': return 'text-slate-400';
      default: return 'text-white';
    }
  }
}
