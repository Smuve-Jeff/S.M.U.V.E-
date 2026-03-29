import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserProfileService } from '../../services/user-profile.service';
import { MarketingService } from '../../services/marketing.service';
import { AiService } from '../../services/ai.service';
import { MarketingCampaign } from '../../types/marketing.types';
import {
  StrategicTask,
} from '../../types/ai.types';

type StrategyTab =
  | 'overview'
  | 'campaigns'
  | 'analytics'
  | 'outreach'
  | 'social';

@Component({
  selector: 'app-strategy-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './strategy-hub.component.html',
  styleUrls: ['./strategy-hub.component.css'],
})
export class StrategyHubComponent implements OnInit {
  private profileService = inject(UserProfileService);
  private marketingService = inject(MarketingService);
  public aiService = inject(AiService);

  profile = this.profileService.profile;
  activeHubTab = signal<StrategyTab>('overview');

  campaigns = this.marketingService.campaigns;
  socialStats = this.marketingService.socialData;
  streamingStats = this.marketingService.streamingData;

  intelligenceBriefs = this.aiService.intelligenceBriefs;
  marketAlerts = this.aiService.marketAlerts;

  viralHooks = this.aiService.getViralHooks();

  upgradeRecs = this.aiService.getUpgradeRecommendations();

  totalFollowers = computed(() =>
    this.socialStats().reduce((sum, s) => sum + s.followers, 0)
  );

  totalStreams = computed(() =>
    this.streamingStats().reduce((sum, s) => sum + s.totalStreams, 0)
  );

  totalMonthlyListeners = computed(() =>
    this.streamingStats().reduce((sum, s) => sum + s.monthlyListeners, 0)
  );

  newCampaign = signal<Partial<MarketingCampaign>>({
    name: '',
    budget: 0,
    status: 'Draft',
    platforms: ['Instagram'],
    strategyLevel: 'Modern Professional',
  });

  showCampaignForm = signal(false);

  adSpend = signal(100);

  adProjections = computed(() => {
    const platform = (this.newCampaign().platforms || ['Instagram'])[0];
    return this.marketingService.getProjections(this.adSpend(), platform);
  });

  strategicTasks = signal<StrategicTask[]>([]);

  ngOnInit() {
    this.refreshStrategicIntelligence();
  }

  refreshStrategicIntelligence() {
    this.strategicTasks.set(this.aiService.getDynamicChecklist());
  }

  toggleTask(id: string) {
    this.strategicTasks.update(tasks =>
      tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
    );
  }

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
        metrics: {
          reach: 0,
          impressions: 0,
          engagement: 0,
          conversions: 0,
          spend: 0,
          roi: 0,
          ctr: 0,
          cpc: 0,
        },
      });
      this.newCampaign.set({
        name: '',
        budget: 0,
        status: 'Draft',
        platforms: ['Instagram'],
        strategyLevel: 'Modern Professional',
      });
      this.showCampaignForm.set(false);
    }
  }

  async deleteCampaign(id: string) {
    await this.marketingService.deleteCampaign(id);
  }

  getImpactColor(impact: string): string {
    switch (impact) {
      case 'Extreme':
        return 'text-brand-primary font-black';
      case 'High':
        return 'text-brand-primary';
      case 'Medium':
        return 'text-yellow-400';
      default:
        return 'text-white';
    }
  }

  getSeverityClass(severity: string): string {
    switch (severity) {
      case 'Critical':
        return 'bg-brand-primary/20 text-brand-primary border-brand-primary/30';
      case 'Warning':
        return 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20';
      default:
        return 'bg-blue-400/10 text-blue-400 border-blue-400/20';
    }
  }

  getCampaignStatusClass(status: string): string {
    switch (status) {
      case 'Active':
        return 'bg-brand-primary/20 text-brand-primary border-brand-primary/30';
      case 'Paused':
        return 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20';
      case 'Completed':
        return 'bg-blue-400/10 text-blue-400 border-blue-400/20';
      default:
        return 'bg-white/5 text-silver-dim border-white/10';
    }
  }

  formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  setTab(tab: string) {
    const validTabs: StrategyTab[] = ['overview', 'campaigns', 'analytics', 'outreach', 'social'];
    if (validTabs.includes(tab as StrategyTab)) {
      this.activeHubTab.set(tab as StrategyTab);
    }
  }
}
