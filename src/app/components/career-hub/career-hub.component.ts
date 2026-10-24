import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RadarChartComponent } from '../radar-chart/radar-chart.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiAuditService } from '../../services/ai-audit.service';
import { BusinessPipelineService } from '../../services/business-pipeline.service';
import {
  CareerPitch,
  CareerPitchStatus,
  CareerVenue,
  VenueBookingStatus,
} from '../../types/career.types';
import { ProfessionalFinancials } from '../../types/profile.types';

interface ActivityEntry {
  id: string;
  icon: string;
  title: string;
  detail: string;
  at: number;
}

interface TrajectoryPoint {
  x: number;
  y: number;
  score: number;
  timestamp: number;
}

const EMPTY_FINANCIALS: ProfessionalFinancials = {
  accounts: [],
  monthlyBudget: 0,
  totalRevenue: 0,
  pendingPayouts: 0,
  splitSheets: [],
  revenueHistory: [],
};

const PITCH_STATUSES: CareerPitchStatus[] = [
  'Pending',
  'Reviewing',
  'Signed',
  'Passed',
];

const VENUE_STATUS_FLOW: VenueBookingStatus[] = [
  'Available',
  'Pending',
  'Confirmed',
];

@Component({
  selector: 'app-career-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RadarChartComponent],
  templateUrl: './career-hub.component.html',
  styleUrls: ['./career-hub.component.css'],
})
export class CareerHubComponent {
  private userProfileService = inject(UserProfileService);
  private aiAuditService = inject(AiAuditService);
  private businessPipelineService = inject(BusinessPipelineService);

  profile = this.userProfileService.profile;

  financials = computed<ProfessionalFinancials>(
    () => this.profile().financials ?? EMPTY_FINANCIALS
  );

  /**
   * Pitch pipeline and live circuit used to be seeded with invented labels,
   * demo links and rooms, so every artist opened the hub to somebody else's
   * career. They now read from the profile and start empty.
   */
  pitches = computed<CareerPitch[]>(() => this.profile().careerPitches ?? []);
  venues = computed<CareerVenue[]>(() => this.profile().careerVenues ?? []);

  readonly pitchStatuses = PITCH_STATUSES;
  readonly pitchFilters: { key: CareerPitchStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'Pending', label: 'Pending' },
    { key: 'Reviewing', label: 'Reviewing' },
    { key: 'Signed', label: 'Signed' },
    { key: 'Passed', label: 'Passed' },
  ];

  pitchFilter = signal<CareerPitchStatus | 'all'>('all');

  pitchCounts = computed<Record<CareerPitchStatus | 'all', number>>(() => {
    const all = this.pitches();
    const counts = {
      all: all.length,
      Pending: 0,
      Reviewing: 0,
      Signed: 0,
      Passed: 0,
    } as Record<CareerPitchStatus | 'all', number>;
    for (const pitch of all) counts[pitch.status] += 1;
    return counts;
  });

  filteredPitches = computed<CareerPitch[]>(() => {
    const filter = this.pitchFilter();
    const all = this.pitches();
    return filter === 'all' ? all : all.filter((p) => p.status === filter);
  });

  newLabel = signal('');
  newDemo = signal('');
  pitchError = signal('');
  isSavingPitch = signal(false);

  newVenueName = signal('');
  newVenueLocation = signal('');
  newVenueCapacity = signal<number | null>(null);
  venueError = signal('');

  splitTitle = signal('');
  splitCollaborator = signal('');
  splitPercent = signal(50);
  splitError = signal('');
  expandedSplitId = signal<string | null>(null);

  isRecordingAudit = signal(false);
  auditError = signal('');

  strategicAudit = computed(() =>
    this.aiAuditService.calculateStrategicHealth(this.profile())
  );

  /** Real money already recorded on the profile — never a made-up quarter. */
  trackedRevenue = computed(() =>
    Number.isFinite(this.financials().totalRevenue)
      ? this.financials().totalRevenue
      : 0
  );

  hasRevenue = computed(() => this.trackedRevenue() > 0);

  pendingPayouts = computed(() =>
    Number.isFinite(this.financials().pendingPayouts)
      ? this.financials().pendingPayouts
      : 0
  );

  openPitchCount = computed(
    () => this.pitchCounts().Pending + this.pitchCounts().Reviewing
  );

  revenueForecast = computed(() => {
    if (!this.hasRevenue()) return [];
    const dna = { streams: this.financials().totalRevenue * 250 };
    const projection =
      this.businessPipelineService.calculateRevenueProjections(dna);
    return projection.forecast.map((f: any) => ({
      month: f.month,
      amount: f.estimate,
    }));
  });

  /**
   * The positioning chart used to draw a fixed curve everyone shared. It now
   * plots the audit scores the artist actually recorded, oldest first.
   */
  trajectory = computed<{
    line: string;
    area: string;
    points: TrajectoryPoint[];
  } | null>(() => {
    const entries = [...(this.profile().auditHistory ?? [])]
      .filter((entry) => Number.isFinite(entry?.score))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-6);
    if (entries.length < 2) return null;

    const width = 1000;
    const height = 300;
    const pad = 30;
    const points: TrajectoryPoint[] = entries.map((entry, index) => {
      const x = pad + (index / (entries.length - 1)) * (width - pad * 2);
      const score = Math.max(0, Math.min(100, entry.score));
      const y = height - pad - (score / 100) * (height - pad * 2);
      return {
        x: Math.round(x),
        y: Math.round(y),
        score,
        timestamp: entry.timestamp,
      };
    });
    const line = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
      .join(' ');
    const area = `${line} L${points[points.length - 1].x} ${height} L${
      points[0].x
    } ${height} Z`;
    return { line, area, points };
  });

  /**
   * The "real-time" feed was three fixed cards. It is now built from the
   * pitches, split sheets and audits on the profile, newest first.
   */
  activityFeed = computed<ActivityEntry[]>(() => {
    const entries: ActivityEntry[] = [];

    for (const pitch of this.pitches()) {
      entries.push({
        id: `pitch-${pitch.id}`,
        icon: 'outbox',
        title: `Pitch to ${pitch.labelName}`,
        detail: `${pitch.status} • ${pitch.date}`,
        at: pitch.updatedAt ?? 0,
      });
    }

    (this.financials().splitSheets ?? []).forEach((split, index) => {
      if (!split?.title) return;
      entries.push({
        id: `split-${index}-${split.id ?? split.title}`,
        icon: 'gavel',
        title: `Split sheet: ${split.title}`,
        detail: `${split.status ?? 'Draft'} • ${
          split.splits?.length ?? 0
        } parties`,
        at: Number(split.updatedAt) || 0,
      });
    });

    (this.profile().auditHistory ?? []).forEach((audit, index) => {
      if (!Number.isFinite(audit?.timestamp)) return;
      entries.push({
        id: `audit-${index}-${audit.timestamp}`,
        icon: 'analytics',
        title: 'Strategic audit recorded',
        detail: `${audit.score}% readiness`,
        at: audit.timestamp,
      });
    });

    return entries
      .filter((entry) => Number.isFinite(entry.at) && entry.at > 0)
      .sort((a, b) => b.at - a.at)
      .slice(0, 5);
  });

  setPitchFilter(filter: CareerPitchStatus | 'all') {
    this.pitchFilter.set(filter);
  }

  async submitToLabel() {
    if (this.isSavingPitch()) return;
    const labelName = this.newLabel().trim();
    const demoUrl = this.normalizeUrl(this.newDemo());

    if (!labelName) {
      this.pitchError.set('Add the label or curator name before submitting.');
      return;
    }
    if (!demoUrl) {
      this.pitchError.set(
        'Add a demo link starting with http:// or https:// so the recipient can open it.'
      );
      return;
    }
    const duplicate = this.pitches().some(
      (pitch) =>
        pitch.labelName.trim().toLowerCase() === labelName.toLowerCase() &&
        pitch.status !== 'Passed'
    );
    if (duplicate) {
      this.pitchError.set(
        `${labelName} already has an open pitch. Update that one instead of sending a duplicate.`
      );
      return;
    }

    const now = Date.now();
    const pitch: CareerPitch = {
      id: `pitch-${now}-${Math.random().toString(36).slice(2, 8)}`,
      labelName,
      demoUrl,
      date: new Date(now).toISOString().slice(0, 10),
      status: 'Pending',
      updatedAt: now,
    };

    this.pitchError.set('');
    this.isSavingPitch.set(true);
    try {
      await this.persistPitches([pitch, ...this.pitches()]);
      this.newLabel.set('');
      this.newDemo.set('');
    } finally {
      this.isSavingPitch.set(false);
    }
  }

  async setPitchStatus(id: string, status: CareerPitchStatus) {
    if (!PITCH_STATUSES.includes(status)) return;
    const next = this.pitches().map((pitch) =>
      pitch.id === id ? { ...pitch, status, updatedAt: Date.now() } : pitch
    );
    await this.persistPitches(next);
  }

  async recallPitch(pitch: CareerPitch) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Recall the pitch to “${pitch.labelName}”? It will be removed from the pipeline.`
      )
    ) {
      return;
    }
    await this.persistPitches(
      this.pitches().filter((entry) => entry.id !== pitch.id)
    );
  }

  async addVenue() {
    const name = this.newVenueName().trim();
    const location = this.newVenueLocation().trim();
    const capacity = Number(this.newVenueCapacity());

    if (!name) {
      this.venueError.set('Add the venue name.');
      return;
    }
    if (!location) {
      this.venueError.set('Add the city or region for this room.');
      return;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      this.venueError.set('Capacity must be a number greater than zero.');
      return;
    }
    if (
      this.venues().some(
        (venue) =>
          venue.name.trim().toLowerCase() === name.toLowerCase() &&
          venue.location.trim().toLowerCase() === location.toLowerCase()
      )
    ) {
      this.venueError.set(`${name} (${location}) is already tracked.`);
      return;
    }

    const venue: CareerVenue = {
      id: `venue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      location,
      capacity: Math.round(capacity),
      bookingStatus: 'Available',
    };

    this.venueError.set('');
    try {
      await this.userProfileService.updateProfile({
        careerVenues: [...this.venues(), venue],
      });
      this.newVenueName.set('');
      this.newVenueLocation.set('');
      this.newVenueCapacity.set(null);
    } catch {
      this.venueError.set('Venue could not be saved. Try again.');
    }
  }

  async cycleVenueStatus(venue: CareerVenue) {
    const index = VENUE_STATUS_FLOW.indexOf(venue.bookingStatus);
    const bookingStatus =
      VENUE_STATUS_FLOW[(index + 1) % VENUE_STATUS_FLOW.length];
    try {
      await this.userProfileService.updateProfile({
        careerVenues: this.venues().map((entry) =>
          entry.id === venue.id ? { ...entry, bookingStatus } : entry
        ),
      });
    } catch {
      this.venueError.set('Booking status could not be updated. Try again.');
    }
  }

  async removeVenue(venue: CareerVenue) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Stop tracking “${venue.name}”?`)
    ) {
      return;
    }
    try {
      await this.userProfileService.updateProfile({
        careerVenues: this.venues().filter((entry) => entry.id !== venue.id),
      });
    } catch {
      this.venueError.set('Venue could not be removed. Try again.');
    }
  }

  async generateSplitSheet() {
    const title = this.splitTitle().trim();
    const collaborator = this.splitCollaborator().trim();
    const percent = Number(this.splitPercent());

    if (!title) {
      this.splitError.set('Add the track title.');
      return;
    }
    if (!collaborator) {
      this.splitError.set("Add the collaborator's name.");
      return;
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      this.splitError.set('Your share must be between 0 and 100 percent.');
      return;
    }

    const now = Date.now();
    const newSplit = {
      id: `split-${now}`,
      workId: `work-${Math.random().toString(36).slice(2, 9)}`,
      title,
      status: 'Draft',
      splits: [
        {
          role: 'Primary Artist',
          percentage: percent,
          name: this.profile().artistName || 'You',
        },
        {
          role: 'Collaborator',
          percentage: 100 - percent,
          name: collaborator,
        },
      ],
      totalPercentage: 100,
      updatedAt: now,
    };

    this.splitError.set('');
    try {
      await this.userProfileService.updateProfile({
        financials: {
          ...this.financials(),
          splitSheets: [newSplit, ...(this.financials().splitSheets ?? [])],
        },
      });
      this.splitTitle.set('');
      this.splitCollaborator.set('');
      this.splitPercent.set(50);
      this.expandedSplitId.set(newSplit.id);
    } catch {
      this.splitError.set('Split sheet could not be saved. Try again.');
    }
  }

  toggleSplitDetails(id: string) {
    this.expandedSplitId.update((current) => (current === id ? null : id));
  }

  /**
   * Persist the live audit so the trajectory chart and the activity feed have
   * real history to plot. The score is the same one shown on screen.
   */
  async recordAudit() {
    if (this.isRecordingAudit()) return;
    this.auditError.set('');
    this.isRecordingAudit.set(true);
    try {
      await this.userProfileService.recordAudit({ ...this.strategicAudit() });
    } catch {
      this.auditError.set('Audit could not be saved. Try again.');
    } finally {
      this.isRecordingAudit.set(false);
    }
  }

  private async persistPitches(pitches: CareerPitch[]) {
    try {
      await this.userProfileService.updateProfile({ careerPitches: pitches });
    } catch {
      this.pitchError.set('Pitch pipeline could not be saved. Try again.');
    }
  }

  /** Accept only absolute http(s) links with a real host. */
  private normalizeUrl(value: string): string | null {
    const trimmed = (value || '').trim();
    if (!trimmed) return null;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!url.hostname.includes('.')) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  formatCurrency(value: number): string {
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  }

  pitchStatusClass(status: CareerPitchStatus): string {
    switch (status) {
      case 'Signed':
        return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
      case 'Reviewing':
        return 'bg-brand-warning/10 text-brand-warning border-brand-warning/20';
      case 'Passed':
        return 'bg-white/5 text-slate-500 border-white/10';
      default:
        return 'bg-brand-muted/10 text-brand-muted border-brand-muted/20';
    }
  }

  venueStatusClass(status: VenueBookingStatus): string {
    switch (status) {
      case 'Confirmed':
        return 'bg-brand-primary/10 text-brand-primary border-brand-primary/20';
      case 'Pending':
        return 'bg-brand-warning/10 text-brand-warning border-brand-warning/20';
      default:
        return 'bg-white/5 text-slate-400 border-white/10';
    }
  }
}
