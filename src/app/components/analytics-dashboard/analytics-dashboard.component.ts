import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  AnalyticsService,
  GrowthMetric,
} from '../../services/analytics.service';
import { UserProfileService } from '../../services/user-profile.service';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css'],
})
export class AnalyticsDashboardComponent {
  analytics = inject(AnalyticsService);
  profileService = inject(UserProfileService);

  proData = computed(
    () =>
      this.profileService.profile().proData || {
        ipiNumber: '',
        workIds: [],
        affiliations: [],
      }
  );

  /** Set only when a credential write explicitly reports failure. */
  profileError = signal('');

  /** True once a real source reported at least one figure. */
  hasLiveData = computed(() => this.analytics.hasLiveData());

  /** How many metrics a connected source actually reports. */
  reportedCount = computed(
    () =>
      this.analytics.metrics().filter((metric) => metric.source === 'connected')
        .length
  );

  reportingLabel = computed(() =>
    this.hasLiveData()
      ? `${this.reportedCount()} of ${this.analytics.metrics().length} metrics reported`
      : 'No source connected'
  );

  /**
   * What this page can and cannot evidence.
   *
   * The old "Strategic Insights" card printed three tactics that assumed a
   * named top-listener list and a monthly top streamer — audience facts
   * S.M.U.V.E. has no source for. These statuses state the source position
   * instead of turning missing data into advice.
   */
  evidenceStatus = computed(() => {
    const pro = this.proData();
    const total = this.analytics.metrics().length;
    return [
      {
        id: 'platform',
        label: 'Platform totals',
        ready: this.hasLiveData(),
        detail: this.hasLiveData()
          ? `${this.reportedCount()} of ${total} metrics reported by a connected source.`
          : 'No analytics source is connected, so no total is shown.',
      },
      {
        id: 'listeners',
        label: 'Listener-level records',
        ready: false,
        detail:
          'No listener-level analytics integration is supported, so S.M.U.V.E. names no fans and shows no per-fan streams.',
      },
      {
        id: 'pro',
        label: 'PRO works',
        ready: pro.workIds.length > 0,
        detail: pro.workIds.length
          ? `${pro.workIds.length} work${
              pro.workIds.length === 1 ? '' : 's'
            } on file as self-reported — not verified with a PRO.`
          : 'No works recorded. Add an ISWC or PRO work ID once the registration exists.',
      },
    ];
  });

  /**
   * A metric value, or an em dash while that metric has no source.
   *
   * This used to consult the page-wide `hasLiveData()`, so one connected metric
   * made every other tile print its unavailable zero as a reported figure.
   */
  metricFor(metric: GrowthMetric): string {
    return metric.source === 'connected' ? metric.value.toLocaleString() : '—';
  }

  newWorkTitle = signal('');
  newWorkId = signal('');
  workError = signal('');
  isSavingWork = signal(false);

  async updateIpi(ipi: string) {
    const profile = this.profileService.profile();
    const saved = await this.profileService.updateProfile({
      ...profile,
      proData: {
        ...(profile.proData || { workIds: [], affiliations: [] }),
        ipiNumber: ipi.trim(),
      },
    });
    this.profileError.set(
      saved === false
        ? 'The IPI number could not be saved. Check your connection and try again.'
        : ''
    );
  }

  /**
   * Register a work the artist typed in.
   *
   * The old button added "Untitled Work" with the id "PENDING" and marked it
   * "Verified" — a fake registration for a fake work. Entries are now checked
   * for a title and a real identifier, and stay labelled self-reported until a
   * PRO actually confirms them.
   */
  async registerWork() {
    if (this.isSavingWork()) return;
    const title = this.newWorkTitle().trim();
    const workId = this.newWorkId().trim();

    if (!title) {
      this.workError.set('Add the work title before registering it.');
      return;
    }
    if (!workId) {
      this.workError.set(
        'Add the ISWC or PRO work ID so the registration can be matched later.'
      );
      return;
    }
    const profile = this.profileService.profile();
    const currentPro = profile.proData || {
      ipiNumber: '',
      workIds: [],
      affiliations: [],
    };
    if (
      currentPro.workIds.some(
        (work: any) =>
          String(work.id).trim().toLowerCase() === workId.toLowerCase()
      )
    ) {
      this.workError.set(`${workId} is already registered.`);
      return;
    }

    this.workError.set('');
    this.isSavingWork.set(true);
    try {
      await this.profileService.updateProfile({
        ...profile,
        proData: {
          ...currentPro,
          workIds: [
            ...currentPro.workIds,
            { title, id: workId, status: 'Self-reported' },
          ],
        },
      });
      this.newWorkTitle.set('');
      this.newWorkId.set('');
    } catch {
      this.workError.set('Work could not be saved. Try again.');
    } finally {
      this.isSavingWork.set(false);
    }
  }

  async removeWork(index: number) {
    const profile = this.profileService.profile();
    const currentPro = profile.proData || {
      ipiNumber: '',
      workIds: [],
      affiliations: [],
    };
    await this.profileService.updateProfile({
      ...profile,
      proData: {
        ...currentPro,
        workIds: currentPro.workIds.filter(
          (_: any, workIndex: number) => workIndex !== index
        ),
      },
    });
  }
}
