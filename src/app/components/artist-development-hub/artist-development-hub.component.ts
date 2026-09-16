import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ArtistDevelopmentService,
  ArtistDevelopmentPanel,
  ProRegistration,
  WorkRegistration,
  DspAnalytics,
  SocialAccount,
  DigitalFingerprint,
} from '../../services/artist-development.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import {
  ArtistPathwayService,
  PathwayArea,
  PathwayAreaStanding,
  PathwayRecordSurface,
  PathwayStepProgress,
  AREA_ORDER,
} from '../../services/artist-pathway.service';
import { UserProfileService } from '../../services/user-profile.service';
import {
  ReleaseProject,
  ProductionTrack,
  ReleaseType,
} from '../../types/release.types';

/** Every expandable card in this hub, owned by the service so they cannot drift. */
type HubPanel = ArtistDevelopmentPanel;

@Component({
  selector: 'app-artist-development-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './artist-development-hub.component.html',
  styles: [
    `
      :host {
        display: block;
        background: #020617;
        min-height: 100vh;
      }
      .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(168, 85, 247, 0.2);
        border-radius: 2px;
      }
      .score-ring {
        transition: stroke-dashoffset 1s ease;
      }
    `,
  ],
})
export class ArtistDevelopmentHubComponent implements OnInit {
  private dev = inject(ArtistDevelopmentService);
  private router = inject(Router);
  private dialog = inject(InteractionDialogService);
  private pathwayService = inject(ArtistPathwayService);
  private userProfile = inject(UserProfileService);

  /**
   * The pathway is computed from the saved profile, so it stays honest: steps
   * complete because the underlying evidence exists, never because a box was
   * ticked in this hub.
   */
  pathway = computed(() => this.pathwayService.readout(this.userProfile.profile()));

  readonly pathwayAreas = AREA_ORDER;

  /** Which area card is expanded in the pathway panel. */
  openArea = signal<PathwayArea | null>(null);

  toggleArea(area: PathwayArea) {
    this.openArea.set(this.openArea() === area ? null : area);
  }

  areaSteps(area: PathwayArea): PathwayStepProgress[] {
    return this.pathway().steps.filter((entry) => entry.step.area === area);
  }

  areaFor(area: PathwayArea): PathwayAreaStanding | undefined {
    return this.pathway().areas.find((entry) => entry.area === area);
  }

  /** The single recommended move, rendered as the hero of the pathway panel. */
  nextAction() {
    return this.pathway().nextAction;
  }

  /**
   * The ordered queue behind the hero, from the same ordering rule, so the two
   * can only ever agree about what comes first.
   */
  nextQueue = computed(() =>
    this.pathwayService.todayList(this.userProfile.profile(), 3)
  );

  completionTone(score: number): string {
    if (score === 100) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-slate-400';
  }

  stepTone(status: PathwayStepProgress['status']): string {
    switch (status) {
      case 'complete':
        return 'border-emerald-500/40 bg-emerald-500/5';
      case 'in-progress':
        return 'border-amber-500/40 bg-amber-500/5';
      case 'ready':
        return 'border-violet-500/40 bg-violet-500/5';
      default:
        return 'border-white/5 bg-black/20';
    }
  }

  stepLabel(status: PathwayStepProgress['status']): string {
    switch (status) {
      case 'complete':
        return 'Official';
      case 'in-progress':
        return 'In progress';
      case 'ready':
        return 'Start now';
      default:
        return 'Blocked';
    }
  }

  /** Real sign-up page for a step, taken from the fingerprint registry. */
  destinationFor(step: PathwayStepProgress['step']) {
    return this.pathwayService.destination(step.destinationId);
  }

  /** Open the profile pane that owns the evidence a step is waiting on. */
  openProfileEditor() {
    this.router.navigate(['/profile']);
  }

  // Signals from service
  activePanel = this.dev.activePanel;
  proRegistrations = this.dev.proRegistrations;
  workRegistrations = this.dev.workRegistrations;
  dspAnalytics = this.dev.dspAnalytics;
  socialAccounts = this.dev.socialAccounts;
  digitalFingerprint = this.dev.digitalFingerprint;
  isScanning = this.dev.isScanning;

  // PRO form
  proForm = signal<Partial<ProRegistration>>({ organization: 'BMI' as any });
  showProForm = signal(false);
  workForm = signal<Partial<WorkRegistration>>({
    role: 'Writer' as any,
    sharePercentage: 100,
  });
  showWorkForm = signal(false);

  // Social form
  socialHandleInput = signal('');
  socialUrlInput = signal('');
  editingSocialIndex = signal<number | null>(null);

  readonly SOCIAL_PLATFORMS = this.dev.SOCIAL_PLATFORMS;

  // Computed
  platformCount = computed(
    () => this.socialAccounts().filter((a) => a.connected).length
  );
  totalStreams = computed(() => this.dspAnalytics()?.totalStreams || 0);
  totalFollowers = computed(() => this.dspAnalytics()?.totalFollowers || 0);
  trustScore = computed(() => this.digitalFingerprint()?.trustScore || 0);
  scoreColor = computed(() => {
    const s = this.trustScore();
    if (s >= 80) return '#10b981';
    if (s >= 50) return '#f59e0b';
    return '#ef4444';
  });

  // Catalog & Release
  catalog = this.dev.catalog;
  selectedRelease = this.dev.selectedRelease;
  showAddRelease = this.dev.showAddRelease;
  newReleaseForm = this.dev.newReleaseForm;

  readonly organizationOptions = [
    'BMI',
    'ASCAP',
    'SESAC',
    'SOCAN',
    'PRS',
    'GEMA',
    'Other',
  ] as const;

  ngOnInit() {
    this.dev.loadAll();
    // Only produce figures for releases that exist — an artist with nothing out
    // must not be shown invented listener counts.
    if (!this.dspAnalytics()) this.dev.generateDspAnalytics();
  }

  setPanel(panel: HubPanel) {
    this.activePanel.set(this.activePanel() === panel ? null : panel);
  }

  // ── PRO Registry ──────────────────────────────────────

  addProRegistration() {
    const form = this.proForm();
    if (!form.organization) return;
    this.dev.addProRegistration({
      organization: form.organization as any,
      membershipId: form.membershipId || '',
      ipiNumber: form.ipiNumber || '',
      caeNumber: form.caeNumber || '',
      publisher: form.publisher || '',
      publisherIpi: form.publisherIpi || '',
      registrationDate:
        form.registrationDate || new Date().toISOString().split('T')[0],
      status: form.status || 'active',
      territories: form.territories || ['Worldwide'],
    });
    this.showProForm.set(false);
    this.proForm.set({ organization: 'BMI' as any });
  }

  removePro(org: string) {
    this.dev.removeProRegistration(org);
  }

  addWorkRegistration() {
    const form = this.workForm();
    if (!form.title) return;
    this.dev.addWorkRegistration({
      iswc:
        form.iswc ||
        `T-${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
      title: form.title || '',
      role: (form.role as any) || 'Writer',
      sharePercentage: form.sharePercentage || 100,
      registrationDate:
        form.registrationDate || new Date().toISOString().split('T')[0],
      registeredWith: form.registeredWith || ['BMI'],
    });
    this.showWorkForm.set(false);
    this.workForm.set({ role: 'Writer' as any, sharePercentage: 100 });
  }

  // ── Social Links ──────────────────────────────────────

  connectSocial(index: number) {
    const handle = this.socialHandleInput().trim();
    const url = this.socialUrlInput().trim();
    if (!handle) return;
    this.dev.connectSocialAccount(
      index,
      handle,
      url ||
        `https://${this.socialAccounts()[index].platform.toLowerCase().replace(/ /g, '')}.com/${handle}`
    );
    this.socialHandleInput.set('');
    this.socialUrlInput.set('');
    this.editingSocialIndex.set(null);
  }

  disconnectSocial(index: number) {
    this.dev.disconnectSocialAccount(index);
  }

  startEditSocial(index: number) {
    this.editingSocialIndex.set(index);
    const acct = this.socialAccounts()[index];
    this.socialHandleInput.set(acct.handle);
    this.socialUrlInput.set(acct.url);
  }

  // ── Catalog Management ──────────────────────────────

  addRelease() {
    const form = this.newReleaseForm();
    if (!form.name) return;
    this.dev.addRelease({
      id: this.dev.generateReleaseId(),
      name: form.name || '',
      type: (form.type as ReleaseType) || 'Single',
      description: form.description || '',
      status: (form.status as ReleaseProject['status']) || 'Planning',
      tracks: form.tracks || [],
      credits: form.credits || { artistName: '', collaborators: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      artworkUrl: form.artworkUrl || '',
      visualsUrl: form.visualsUrl || '',
    });
    this.showAddRelease.set(false);
    this.newReleaseForm.set({
      name: '',
      type: 'Single',
      description: '',
      status: 'Planning',
      tracks: [],
      credits: { artistName: '', collaborators: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  selectRelease(id: string) {
    this.dev.selectRelease(id);
    this.setPanel('release');
  }

  async deleteRelease(id: string) {
    const confirmed = await this.dialog.confirm({
      title: 'Delete Release',
      message: 'Delete this release from your catalog?',
      confirmLabel: 'Delete Release',
      cancelLabel: 'Keep Release',
      tone: 'danger',
    });
    if (confirmed) {
      this.dev.removeRelease(id);
    }
  }

  getReleaseStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      Planning: 'edit_note',
      Production: 'music_note',
      Visuals: 'image',
      Admin: 'description',
      Distributing: 'cloud_upload',
      Released: 'check_circle',
    };
    return icons[status] || 'help_outline';
  }

  getReleaseStatusColor(status: string): string {
    const colors: Record<string, string> = {
      Planning: 'text-amber-400',
      Production: 'text-brand-primary',
      Visuals: 'text-violet-400',
      Admin: 'text-slate-400',
      Distributing: 'text-cyan-400',
      Released: 'text-emerald-400',
    };
    return colors[status] || 'text-slate-500';
  }

  getStageColor(stage: string): string {
    const colors: Record<string, string> = {
      Completed: 'bg-emerald-500',
      'In Progress': 'bg-amber-500',
      Pending: 'bg-slate-600',
    };
    return colors[stage] || 'bg-slate-700';
  }

  updateTrackStage(releaseId: string, trackId: string, stage: string) {
    const statuses: ('Pending' | 'In Progress' | 'Completed')[] = [
      'Pending',
      'In Progress',
      'Completed',
    ];
    const track = this.selectedRelease()?.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const currentIdx = statuses.indexOf(track.stages[stage]);
    const nextStatus = statuses[(currentIdx + 1) % statuses.length];
    this.dev.updateTrackStatus(releaseId, trackId, stage, nextStatus);
  }

  // ── DSP Analytics ─────────────────────────────────────

  refreshDsp() {
    this.dev.generateDspAnalytics();
  }

  // ── Money & Royalties ─────────────────────────────────
  //
  // The pathway's money steps require a monthly budget, at least one revenue
  // record, and at least one payout account. Those fields were displayed in the
  // profile but had no writer anywhere in the app, so two steps could never be
  // completed from any UI. This panel is their owner.

  payoutForm = signal({ provider: '', accountName: '', balance: 0 });
  revenueForm = signal({ month: '', amount: 0 });

  financials = computed<any>(
    () => (this.userProfile.profile()?.financials as any) || {}
  );

  payoutAccounts = computed<any[]>(() => {
    const accounts = this.financials()?.accounts;
    return Array.isArray(accounts) ? accounts : [];
  });

  revenueHistory = computed<any[]>(() => {
    const history = this.financials()?.revenueHistory;
    return Array.isArray(history) ? history : [];
  });

  monthlyBudget = computed<number>(() => {
    const value = Number(this.financials()?.monthlyBudget);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });

  revenueTotal = computed<number>(() =>
    this.revenueHistory().reduce(
      (sum: number, entry: any) => sum + (Number(entry?.amount) || 0),
      0
    )
  );

  updatePayoutForm(field: string, value: any): void {
    this.payoutForm.update((form) => ({ ...form, [field]: value }));
  }

  updateRevenueForm(field: string, value: any): void {
    this.revenueForm.update((form) => ({ ...form, [field]: value }));
  }

  /**
   * Financial writes merge into the stored block. `accounts` and
   * `revenueHistory` are edited by index, so replacing the whole object would
   * drop the fields this panel does not render.
   */
  private writeFinancials(patch: Record<string, any>): void {
    void this.userProfile.updateFinancials(patch);
  }

  /** Stored as a number, never the raw string an input hands back. */
  setMonthlyBudget(value: any): void {
    const parsed = Number(value);
    this.writeFinancials({
      monthlyBudget: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
    });
  }

  addPayoutAccount(): void {
    const form = this.payoutForm();
    const provider = String(form.provider || '').trim();
    const accountName = String(form.accountName || '').trim();
    if (!provider || !accountName) return;
    const balance = Number(form.balance);
    this.writeFinancials({
      accounts: [
        ...this.payoutAccounts(),
        {
          id: `acct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          provider,
          accountName,
          balance: Number.isFinite(balance) ? balance : 0,
          status: 'active',
        },
      ],
    });
    this.payoutForm.set({ provider: '', accountName: '', balance: 0 });
  }

  removePayoutAccount(index: number): void {
    this.writeFinancials({
      accounts: this.payoutAccounts().filter((_, i) => i !== index),
    });
  }

  addRevenueEntry(): void {
    const form = this.revenueForm();
    const month = String(form.month || '').trim();
    if (!month) return;
    const amount = Number(form.amount);
    this.writeFinancials({
      revenueHistory: [
        ...this.revenueHistory(),
        { month, amount: Number.isFinite(amount) ? amount : 0 },
      ],
    });
    this.revenueForm.set({ month: '', amount: 0 });
  }

  removeRevenueEntry(index: number): void {
    this.writeFinancials({
      revenueHistory: this.revenueHistory().filter((_, i) => i !== index),
    });
  }

  // ── Pathway record routing ────────────────────────────
  //
  // Each step names the surface that actually holds a control for its evidence.
  // A single CTA that always went to the profile editor left the artist hunting
  // for fields that live in the questionnaire, or that only exist here.

  recordSurface(
    step: PathwayStepProgress['step']
  ): PathwayRecordSurface {
    return this.pathwayService.recordIn(step);
  }

  recordLabel(step: PathwayStepProgress['step']): string {
    switch (this.recordSurface(step)) {
      case 'questionnaire':
        return 'Answer in the artist DNA';
      case 'hub':
        return 'Record it here';
      default:
        return 'Record this in the profile';
    }
  }

  /** Open a panel unconditionally, unlike the toggle used by the card headers. */
  openPanel(panel: HubPanel) {
    this.activePanel.set(panel);
  }

  recordStep(step: PathwayStepProgress['step']): void {
    switch (this.recordSurface(step)) {
      case 'questionnaire':
        this.router.navigate(['/profile'], {
          queryParams: { questionnaire: '1' },
        });
        return;
      case 'hub':
        this.openPanel(this.hubPanelFor(step));
        return;
      default:
        this.openProfileEditor();
    }
  }

  /** The hub panel that owns a step, when the hub owns the step at all. */
  private hubPanelFor(
    step: PathwayStepProgress['step']
  ): Extract<HubPanel, 'money' | 'pro' | 'catalog'> {
    if (step.area === 'money') return 'money';
    if (step.area === 'rights') return 'pro';
    return 'catalog';
  }

  /** True once a work has actually been delivered, so numbers can be trusted. */
  hasDeliveredWork = computed(() => this.dev.hasDeliveredWork());

  // ── Fingerprint ───────────────────────────────────────

  scanNow() {
    this.dev.scanFingerprint();
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }

  formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  /**
   * Template-safe stream-bar height in px. Angular template expressions compile
   * identifiers as context property reads, so the global Math is NOT accessible
   * from templates — `{{ Math.max(...) }}` throws at runtime.
   */
  streamBarPx(streams: number, total: number): number {
    return Math.max(3, (streams / Math.max(1, total)) * 100);
  }

  formatDate(d: string): string {
    if (!d || d === 'N/A') return 'N/A';
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return d;
    }
  }

  // Expose Math for template usage
  Math = Math;
}
