import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserProfileService } from '../../services/user-profile.service';
import { MarketingService } from '../../services/marketing.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { MarketingCampaign } from '../../types/marketing.types';
import { StrategicTask, UpgradeRecommendation } from '../../types/ai.types';

type StrategyTab = 'overview' | 'campaigns' | 'analytics' | 'social';
type CampaignPlatform = MarketingCampaign['platforms'][number];

const CAMPAIGN_PLATFORMS: CampaignPlatform[] = [
  'Instagram',
  'TikTok',
  'Facebook',
  'Spotify',
  'YouTube',
];

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
  private uiService = inject(UIService);
  public aiService = inject(AiService);

  profile = this.profileService.profile;
  activeHubTab = signal<StrategyTab>('overview');

  campaigns = this.marketingService.campaigns;
  socialStats = this.marketingService.socialData;
  streamingStats = this.marketingService.streamingData;

  intelligenceBriefs = this.aiService.intelligenceBriefs;
  marketAlerts = this.aiService.marketAlerts;

  viralHooks = computed(() => this.aiService.getViralHooks());

  upgradeRecs = computed(() =>
    this.aiService.getUpgradeRecommendations()
      .filter((rec) => !['dismissed', 'not-relevant'].includes(rec.state || ''))
      .slice(0, 5)
  );
  recommendationInbox = computed(() =>
    [...(this.profile().recommendationHistory || [])]
      .slice()
      .reverse()
      .slice(0, 6)
  );

  /**
   * True once any real platform figure exists. The tiles below used to be fed by
   * hardcoded fallbacks, so every artist saw an invented audience.
   */
  hasAudienceData = this.marketingService.hasAudienceData;

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
    targetAudience: '',
    goals: [],
    platforms: ['Instagram'],
    strategyLevel: 'Modern Professional',
  });
  readonly campaignPlatforms = CAMPAIGN_PLATFORMS;
  isSavingCampaign = signal(false);
  campaignError = signal('');
  recommendationError = signal('');
  pendingRecommendationIds = signal<string[]>([]);
  canSaveCampaign = computed(() => {
    const draft = this.newCampaign();
    const budget = Number(draft.budget ?? 0);
    return Boolean(draft.name?.trim()) && Number.isFinite(budget) && budget >= 0;
  });

  showCampaignForm = signal(false);
  isSearchingIndustry = signal(false);
  industrySearchError = signal('');

  adSpend = signal(100);

  adProjections = computed(() => {
    const platform = (this.newCampaign().platforms || ['Instagram'])[0];
    return this.marketingService.getProjections(this.adSpend(), platform);
  });

  strategicTasks = signal<StrategicTask[]>([]);

  ngOnInit() {
    this.refreshStrategicIntelligence();
  }

  refreshStrategicIntelligence(): void {
    this.strategicTasks.set(this.aiService.getDynamicChecklist());
  }

  async submitIndustrySearch(input: HTMLInputElement): Promise<void> {
    const query = input.value.trim();
    if (!query || this.isSearchingIndustry()) return;
    this.industrySearchError.set('');
    this.isSearchingIndustry.set(true);
    try {
      await this.aiService.industryDeepSearch(query);
      input.value = '';
    } catch {
      this.industrySearchError.set('Search could not be completed. Your query is still here; try again.');
    } finally {
      this.isSearchingIndustry.set(false);
    }
  }

  toggleTask(id: string) {
    this.strategicTasks.update((tasks) =>
      tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }

  setCampaignName(name: string): void {
    this.newCampaign.update((campaign) => ({ ...campaign, name }));
  }

  setCampaignBudget(budget: number): void {
    this.newCampaign.update((campaign) => ({ ...campaign, budget }));
  }

  setCampaignPlatform(platform: string): void {
    if (!CAMPAIGN_PLATFORMS.includes(platform as CampaignPlatform)) return;
    this.newCampaign.update((campaign) => ({
      ...campaign,
      platforms: [platform as CampaignPlatform],
    }));
  }

  setCampaignAudience(targetAudience: string): void {
    this.newCampaign.update((campaign) => ({ ...campaign, targetAudience }));
  }

  setCampaignGoals(goals: string): void {
    this.newCampaign.update((campaign) => ({
      ...campaign,
      goals: goals.split(',').map((goal) => goal.trim()).filter(Boolean),
    }));
  }

  hasReportedCampaignMetrics(campaign: MarketingCampaign): boolean {
    return Object.values(campaign.metrics ?? {}).some(
      (value) => Number.isFinite(value) && value !== 0
    );
  }

  formatReportedMetric(value: number): string {
    return Number.isFinite(value) && value > 0 ? this.formatNumber(value) : 'Not reported';
  }

  formatReportedPercent(value: number): string {
    return Number.isFinite(value) && value > 0 ? `${value}%` : 'Not reported';
  }

  formatMetricsDate(timestamp: number): string {
    return Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp).toLocaleDateString()
      : 'Awaiting metrics';
  }

  formatPlatformDate(timestamp: number): string {
    return Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp).toLocaleDateString()
      : 'Date not reported';
  }

  formatEngagementRate(rate: number): string {
    return Number.isFinite(rate) && rate > 0 ? `${rate}% reported engagement` : 'No engagement data reported';
  }

  formatPlaylistAdds(adds: number): string {
    return Number.isFinite(adds) && adds > 0
      ? `${this.formatNumber(adds)} reported playlist adds`
      : 'No playlist-add data reported';
  }

  async saveCampaign(): Promise<void> {
    const draft = this.newCampaign();
    const name = draft.name?.trim() ?? '';
    const budget = Number(draft.budget ?? 0);
    const platforms = (draft.platforms || []).filter((platform) =>
      CAMPAIGN_PLATFORMS.includes(platform)
    );
    if (!name || !Number.isFinite(budget) || budget < 0 || !platforms.length || this.isSavingCampaign()) return;

    this.campaignError.set('');
    this.isSavingCampaign.set(true);
    try {
      await this.marketingService.createCampaign({
        name,
        budget,
        status: 'Draft',
        startDate: new Date().toISOString(),
        targetAudience: draft.targetAudience?.trim() || 'Not specified',
        goals: draft.goals?.filter(Boolean) ?? [],
        platforms,
        strategyLevel: draft.strategyLevel || 'Modern Professional',
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
        targetAudience: '',
        goals: [],
        platforms: ['Instagram'],
        strategyLevel: 'Modern Professional',
      });
      this.showCampaignForm.set(false);
    } catch {
      this.campaignError.set('Campaign could not be saved. Your draft is still here; try again.');
    } finally {
      this.isSavingCampaign.set(false);
    }
  }

  async toggleCampaignStatus(campaign: MarketingCampaign): Promise<void> {
    if (campaign.status === 'Completed') return;
    const status = campaign.status === 'Active' ? 'Paused' : 'Active';
    try {
      await this.marketingService.updateCampaign({ ...campaign, status });
    } catch {
      this.campaignError.set('Campaign status could not be updated. Try again.');
    }
  }

  async deleteCampaign(id: string): Promise<void> {
    const campaign = this.campaigns().find((entry) => entry.id === id);
    if (!campaign || typeof window === 'undefined') return;
    if (!window.confirm(`Delete campaign “${campaign.name}”? This cannot be undone.`)) return;
    this.campaignError.set('');
    try {
      await this.marketingService.deleteCampaign(id);
    } catch {
      this.campaignError.set('Campaign could not be deleted. Try again.');
    }
  }

  private async runRecommendationAction(
    rec: UpgradeRecommendation,
    action: () => Promise<void>,
  ): Promise<void> {
    if (this.pendingRecommendationIds().includes(rec.id)) return;
    this.recommendationError.set('');
    this.pendingRecommendationIds.update((ids) => [...ids, rec.id]);
    try {
      await action();
    } catch {
      this.recommendationError.set(`Could not update “${rec.title}”. Try again.`);
    } finally {
      this.pendingRecommendationIds.update((ids) => ids.filter((id) => id !== rec.id));
    }
  }

  isRecommendationPending(id: string): boolean {
    return this.pendingRecommendationIds().includes(id);
  }

  async acquireUpgrade(rec: UpgradeRecommendation): Promise<void> {
    await this.runRecommendationAction(rec, () =>
      this.profileService.acquireUpgrade({
        title: rec.title,
        type: rec.type,
        recommendationId: rec.id,
      }),
    );
  }

  async saveRecommendation(rec: UpgradeRecommendation): Promise<void> {
    await this.runRecommendationAction(rec, () =>
      this.profileService.setRecommendationState(rec.id, 'saved', rec),
    );
  }

  async dismissRecommendation(rec: UpgradeRecommendation): Promise<void> {
    await this.runRecommendationAction(rec, () =>
      this.profileService.setRecommendationState(rec.id, 'not-relevant', rec),
    );
  }

  async completeRecommendation(rec: UpgradeRecommendation): Promise<void> {
    await this.runRecommendationAction(rec, () =>
      this.profileService.completeUpgrade({
        title: rec.title,
        type: rec.type,
        recommendationId: rec.id,
      }),
    );
  }

  focusRecommendation(rec: UpgradeRecommendation) {
    if (rec.toolId) {
      this.uiService.navigateToView(rec.toolId as any);
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

  getPriorityClass(priority: string): string {
    switch (priority) {
      case 'Critical':
        return 'bg-brand-primary/20 text-brand-primary border-brand-primary/30';
      case 'High':
        return 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20';
      default:
        return 'bg-blue-400/10 text-blue-400 border-blue-400/20';
    }
  }

  getRecommendationStateLabel(state?: string): string {
    switch (state) {
      case 'saved':
        return 'Saved';
      case 'acquired':
        return 'Acquired';
      case 'completed':
        return 'Completed';
      default:
        return 'Suggested';
    }
  }

  getHistoryStateLabel(state: string): string {
    return state.replaceAll('-', ' ');
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

  setTab(tab: string): void {
    if (tab === 'overview' || tab === 'campaigns' || tab === 'analytics' || tab === 'social') {
      this.activeHubTab.set(tab);
    }
  }
}
