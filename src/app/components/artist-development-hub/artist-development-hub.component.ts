import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ArtistDevelopmentService, ProRegistration, WorkRegistration, DspAnalytics, SocialAccount, DigitalFingerprint } from '../../services/artist-development.service';
import { ReleaseProject, ProductionTrack, ReleaseType } from '../../types/release.types';

@Component({
  selector: 'app-artist-development-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './artist-development-hub.component.html',
  styles: [`
    :host { display: block; background: #020617; min-height: 100vh; }
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.2); border-radius: 2px; }
    .score-ring { transition: stroke-dashoffset 1s ease; }
  `]
})
export class ArtistDevelopmentHubComponent implements OnInit {
  private dev = inject(ArtistDevelopmentService);
  private router = inject(Router);

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
  workForm = signal<Partial<WorkRegistration>>({ role: 'Writer' as any, sharePercentage: 100 });
  showWorkForm = signal(false);

  // Social form
  socialHandleInput = signal('');
  socialUrlInput = signal('');
  editingSocialIndex = signal<number | null>(null);

  readonly SOCIAL_PLATFORMS = this.dev.SOCIAL_PLATFORMS;

  // Computed
  platformCount = computed(() => this.socialAccounts().filter(a => a.connected).length);
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

  readonly organizationOptions = ['BMI', 'ASCAP', 'SESAC', 'SOCAN', 'PRS', 'GEMA', 'Other'] as const;

  ngOnInit() {
    this.dev.loadAll();
    if (!this.dspAnalytics()) this.dev.generateDspAnalytics();
  }

  setPanel(panel: 'fingerprint' | 'pro' | 'dsp' | 'social' | 'catalog' | 'release') {
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
      registrationDate: form.registrationDate || new Date().toISOString().split('T')[0],
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
      iswc: form.iswc || `T-${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
      title: form.title || '',
      role: form.role as any || 'Writer',
      sharePercentage: form.sharePercentage || 100,
      registrationDate: form.registrationDate || new Date().toISOString().split('T')[0],
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
    this.dev.connectSocialAccount(index, handle, url || `https://${this.socialAccounts()[index].platform.toLowerCase().replace(/ /g, '')}.com/${handle}`);
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
    this.newReleaseForm.set({ name: '', type: 'Single', description: '', status: 'Planning', tracks: [], credits: { artistName: '', collaborators: [] }, createdAt: Date.now(), updatedAt: Date.now() });
  }

  selectRelease(id: string) {
    this.dev.selectRelease(id);
    this.setPanel('release');
  }

  deleteRelease(id: string) {
    if (confirm('Delete this release from your catalog?')) {
      this.dev.removeRelease(id);
    }
  }

  getReleaseStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'Planning': 'edit_note',
      'Production': 'music_note',
      'Visuals': 'image',
      'Admin': 'description',
      'Distributing': 'cloud_upload',
      'Released': 'check_circle',
    };
    return icons[status] || 'help_outline';
  }

  getReleaseStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'Planning': 'text-amber-400',
      'Production': 'text-brand-primary',
      'Visuals': 'text-violet-400',
      'Admin': 'text-slate-400',
      'Distributing': 'text-cyan-400',
      'Released': 'text-emerald-400',
    };
    return colors[status] || 'text-slate-500';
  }

  getStageColor(stage: string): string {
    const colors: Record<string, string> = {
      'Completed': 'bg-emerald-500',
      'In Progress': 'bg-amber-500',
      'Pending': 'bg-slate-600',
    };
    return colors[stage] || 'bg-slate-700';
  }

  updateTrackStage(releaseId: string, trackId: string, stage: string) {
    const statuses: ('Pending' | 'In Progress' | 'Completed')[] = ['Pending', 'In Progress', 'Completed'];
    const track = this.selectedRelease()?.tracks.find(t => t.id === trackId);
    if (!track) return;
    const currentIdx = statuses.indexOf(track.stages[stage]);
    const nextStatus = statuses[(currentIdx + 1) % statuses.length];
    this.dev.updateTrackStatus(releaseId, trackId, stage, nextStatus);
  }

  // ── DSP Analytics ─────────────────────────────────────

  refreshDsp() {
    this.dev.generateDspAnalytics();
  }

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

  formatDate(d: string): string {
    if (!d || d === 'N/A') return 'N/A';
    try { return new Date(d).toLocaleDateString(); } catch { return d; }
  }

  // Expose Math for template usage
  Math = Math;
}
