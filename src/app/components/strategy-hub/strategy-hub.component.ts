import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserProfileService } from '../../services/user-profile.service';
import { MarketingService } from '../../services/marketing.service';
import { AiService } from '../../services/ai.service';
import { CommandCenterComponent } from '../command-center/command-center.component';
import { MarketingCampaign } from '../../types/marketing.types';
import {
  StrategicTask,
  IntelligenceBrief,
  MarketAlert,
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
  imports: [CommonModule, FormsModule, RouterModule, CommandCenterComponent],
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

  newCampaign = signal<Partial<MarketingCampaign>>({
    name: '',
    budget: 0,
    status: 'Draft',
    platforms: ['Instagram'],
    strategyLevel: 'Modern Professional',
  });

  adSpend = signal(100);
  strategicTasks = signal<StrategicTask[]>([]);

  ngOnInit() {
    this.refreshStrategicIntelligence();
  }

  refreshStrategicIntelligence() {
    this.strategicTasks.set(this.aiService.getDynamicChecklist());
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
        strategyLevel: 'Modern Professional',
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
    }
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
}
