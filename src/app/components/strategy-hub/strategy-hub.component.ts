import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UserProfileService } from '../../services/user-profile.service';
import {
  MANUAL_SOCIAL_PLATFORMS,
  MANUAL_STREAMING_PLATFORMS,
  MarketingService,
} from '../../services/marketing.service';
import type { AudienceTrend } from '../../services/marketing.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import {
  ManualAudienceMetric,
  MarketingCampaign,
} from '../../types/marketing.types';
import {
  AdvisorAdvice,
  StrategicTask,
  UpgradeRecommendation,
} from '../../types/ai.types';

type StrategyTab = 'overview' | 'campaigns' | 'analytics' | 'social';
type CampaignPlatform = MarketingCampaign['platforms'][number];
type MetricNumberField =
  | 'followers'
  | 'engagementRate'
  | 'monthlyListeners'
  | 'totalStreams';

interface ManualMetricDraft {
  kind: 'social' | 'streaming';
  platform: string;
  weekOf: string;
  followers: number | null;
  engagementRate: number | null;
  monthlyListeners: number | null;
  totalStreams: number | null;
  note: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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
  private router = inject(Router);
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

  /** Weekly figures the artist recorded by hand — no integration required. */
  manualMetrics = this.marketingService.manualMetrics;
  hasManualMetrics = this.marketingService.hasManualMetrics;
  monthOverMonth = this.marketingService.monthOverMonth;

  /** Only the metrics that actually have a like-for-like comparison to show. */
  growthCards = computed(() => {
    const growth = this.monthOverMonth();
    const cards: { key: string; label: string; trend: AudienceTrend }[] = [];
    if (growth.followers) {
      cards.push({ key: 'followers', label: 'Followers', trend: growth.followers });
    }
    if (growth.monthlyListeners) {
      cards.push({
        key: 'listeners',
        label: 'Monthly listeners',
        trend: growth.monthlyListeners,
      });
    }
    return cards;
  });

  metricDraft = signal<ManualMetricDraft>({
    kind: 'social',
    platform: MANUAL_SOCIAL_PLATFORMS[0],
    weekOf: this.weekStart(),
    followers: null,
    engagementRate: null,
    monthlyListeners: null,
    totalStreams: null,
    note: '',
  });
  manualMetricStatus = signal<'idle' | 'saving' | 'saved'>('idle');
  manualMetricError = signal('');

  metricPlatforms = computed<readonly string[]>(() =>
    this.metricDraft().kind === 'social'
      ? MANUAL_SOCIAL_PLATFORMS
      : MANUAL_STREAMING_PLATFORMS
  );

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

  strategicTasks = signal<StrategicTask[]>([]);

  /**
   * The same evidence-linked advice the advisor drawer shows, so the two
   * surfaces can never disagree about what comes first. Lifecycle orders are
   * derived from the profile on read, so this updates as evidence lands.
   */
  lifecycleAdvice = computed(() => this.aiService.lifecycleAdvisorAdvice());
  lifecycleSnapshot = computed(() => this.aiService.lifecycleSnapshot());

  ngOnInit() {
    this.refreshStrategicIntelligence();
  }

  refreshStrategicIntelligence(): void {
    this.strategicTasks.set(this.aiService.getDynamicChecklist());
    // Keep the advisor queue in step with the panel instead of letting the
    // drawer hold a stale list from the last time it was opened.
    this.aiService.refreshAdvisorAdvice();
  }

  /**
   * Lifecycle orders carry their own destination because the evidence behind
   * them lives on a specific surface. Completion is never toggled here — the
   * pathway decides that from the recorded evidence, so a checkbox would lie.
   */
  openLifecycleAdvice(item: AdvisorAdvice): void {
    const action = item.action;
    if (action?.type === 'navigate' && action.payload) {
      void this.router.navigate([action.payload]);
    }
  }

  adviceTone(priority: AdvisorAdvice['priority']): string {
    switch (priority) {
      case 'high':
        return 'border-brand-primary/40 bg-brand-primary/10';
      case 'medium':
        return 'border-amber-500/30 bg-amber-500/5';
      default:
        return 'border-white/10 bg-white/5';
    }
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

  /** Monday of the week containing `date`, as `YYYY-MM-DD`. */
  private weekStart(date = new Date()): string {
    const monday = new Date(date);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    // Local date parts, not toISOString: a UTC conversion shifts the Monday for
    // artists east of Greenwich.
    const month = String(monday.getMonth() + 1).padStart(2, '0');
    const day = String(monday.getDate()).padStart(2, '0');
    return `${monday.getFullYear()}-${month}-${day}`;
  }

  setMetricKind(kind: 'social' | 'streaming'): void {
    const platforms =
      kind === 'social' ? MANUAL_SOCIAL_PLATFORMS : MANUAL_STREAMING_PLATFORMS;
    this.metricDraft.update((draft) => ({
      ...draft,
      kind,
      platform: platforms[0],
      followers: null,
      engagementRate: null,
      monthlyListeners: null,
      totalStreams: null,
    }));
    this.manualMetricStatus.set('idle');
    this.manualMetricError.set('');
  }

  setMetricPlatform(platform: string): void {
    if (!this.metricPlatforms().includes(platform)) return;
    this.metricDraft.update((draft) => ({ ...draft, platform }));
    this.manualMetricStatus.set('idle');
  }

  setMetricWeek(weekOf: string): void {
    this.metricDraft.update((draft) => ({ ...draft, weekOf }));
    this.manualMetricStatus.set('idle');
  }

  setMetricNumber(field: MetricNumberField, value: number | null): void {
    const parsed =
      value === null || value === undefined || String(value) === ''
        ? null
        : Number(value);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    this.metricDraft.update((draft) => ({ ...draft, [field]: parsed }));
    this.manualMetricStatus.set('idle');
  }

  setMetricNote(note: string): void {
    this.metricDraft.update((draft) => ({ ...draft, note }));
    this.manualMetricStatus.set('idle');
  }

  async saveManualMetric(): Promise<void> {
    if (this.manualMetricStatus() === 'saving') return;
    const draft = this.metricDraft();
    this.manualMetricError.set('');
    this.manualMetricStatus.set('saving');
    try {
      const social = draft.kind === 'social';
      const saved = await this.marketingService.recordManualMetric({
        weekOf: draft.weekOf,
        kind: draft.kind,
        platform: draft.platform as ManualAudienceMetric['platform'],
        followers: social ? draft.followers ?? undefined : undefined,
        engagementRate: social ? draft.engagementRate ?? undefined : undefined,
        monthlyListeners: social
          ? undefined
          : draft.monthlyListeners ?? undefined,
        totalStreams: social ? undefined : draft.totalStreams ?? undefined,
        note: draft.note,
      });
      if (!saved) {
        this.manualMetricStatus.set('idle');
        this.manualMetricError.set(
          'Enter at least one figure and a valid week (engagement stays between 0 and 100).'
        );
        return;
      }
      this.manualMetricStatus.set('saved');
      this.metricDraft.update((current) => ({
        ...current,
        followers: null,
        engagementRate: null,
        monthlyListeners: null,
        totalStreams: null,
        note: '',
      }));
    } catch {
      this.manualMetricStatus.set('idle');
      this.manualMetricError.set(
        'The week could not be saved. Your figures are still here; try again.'
      );
    }
  }

  async removeManualMetric(id: string): Promise<void> {
    try {
      await this.marketingService.removeManualMetric(id);
    } catch {
      this.manualMetricError.set('The recorded week could not be removed.');
    }
  }

  /** `YYYY-MM` as a month name, without locale drift in tests or exports. */
  monthLabel(month: string | null, short = false): string {
    if (!month) return '';
    const [year, index] = month.split('-').map(Number);
    const name = MONTH_NAMES[index - 1];
    return name ? `${short ? name.slice(0, 3) : name} ${year}` : month;
  }

  /**
   * "TikTok (Nov 2026), Facebook (Oct 2026)" — the one-month platforms.
   *
   * Entries are non-breaking, so a phone wraps after a comma rather than inside
   * "Facebook (Aug 2026)"; only the ", " separators may break.
   */
  recordedOnceLabel(): string {
    return this.monthOverMonth()
      .recordedOnce.map(({ platform, month }) =>
        `${platform} (${this.monthLabel(month, true)})`.replaceAll(' ', '\u00a0')
      )
      .join(', ');
  }

  formatDelta(value: number): string {
    return `${value >= 0 ? '+' : '−'}${this.formatNumber(Math.abs(value))}`;
  }

  formatTrendPercent(percent: number | null): string {
    return percent === null
      ? 'from a zero baseline'
      : `${percent >= 0 ? '+' : ''}${percent}%`;
  }

  formatManualMetric(entry: ManualAudienceMetric): string {
    if (entry.kind === 'social') {
      const parts = [`${this.formatNumber(entry.followers ?? 0)} followers`];
      if (entry.engagementRate) parts.push(`${entry.engagementRate}% engagement`);
      return parts.join(' · ');
    }
    return `${this.formatNumber(entry.monthlyListeners ?? 0)} monthly listeners · ${this.formatNumber(entry.totalStreams ?? 0)} streams`;
  }

  /**
   * An unset budget is rendered as unset, never as $0.00 — the artist may not
   * have decided on spend yet, and that is different from allocating nothing.
   */
  formatBudget(budget?: number | null): string {
    if (budget === undefined || budget === null || !Number.isFinite(budget)) {
      return 'Not set';
    }
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(budget);
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
      const saved = await this.marketingService.createCampaign({
        name,
        // A blank or zero field means the artist has not set spend, so the
        // campaign is stored without a budget rather than with a $0 claim.
        budget: budget > 0 ? budget : undefined,
        status: 'Draft',
        startDate: new Date().toISOString(),
        targetAudience: draft.targetAudience?.trim() || 'Not specified',
        goals: draft.goals?.filter(Boolean) ?? [],
        platforms,
        strategyLevel: draft.strategyLevel || 'Modern Professional',
        // Required storage shape; the card hides these until a source reports
        // real figures, so a zero is never presented as performance.
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
      if (saved === false) {
        this.campaignError.set(
          'Campaign could not be saved. Your draft is still here; try again.'
        );
        return;
      }
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
    this.campaignError.set('');
    const status = campaign.status === 'Active' ? 'Paused' : 'Active';
    try {
      const saved = await this.marketingService.updateCampaign({
        ...campaign,
        status,
      });
      if (saved === false) {
        this.campaignError.set(
          'Campaign status could not be updated. Try again.'
        );
      }
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
      const saved = await this.marketingService.deleteCampaign(id);
      if (saved === false) {
        this.campaignError.set('Campaign could not be deleted. Try again.');
      }
    } catch {
      this.campaignError.set('Campaign could not be deleted. Try again.');
    }
  }

  private async runRecommendationAction(
    rec: UpgradeRecommendation,
    action: () => Promise<unknown>,
  ): Promise<void> {
    if (this.pendingRecommendationIds().includes(rec.id)) return;
    this.recommendationError.set('');
    this.pendingRecommendationIds.update((ids) => [...ids, rec.id]);
    try {
      const result = await action();
      if (result === false) {
        this.recommendationError.set(
          `Could not update “${rec.title}”. Try again.`
        );
      }
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
