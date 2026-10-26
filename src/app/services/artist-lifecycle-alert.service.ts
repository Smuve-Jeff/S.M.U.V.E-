import { Injectable, effect, inject, signal } from '@angular/core';
import { UserProfile, UserProfileService } from './user-profile.service';
import { ArtistLifecycleService } from './artist-lifecycle.service';
import { ReleaseProject } from '../types/release.types';
import {
  ArtistLifecyclePhase,
  ArtistLifecycleSnapshot,
  ArtistLifecycleTask,
  LifecyclePhaseId,
} from '../types/artist-lifecycle.types';

/**
 * What changed, in the terms the artist can act on. These are transitions, not
 * standing advice: the advisor and the pathway already own "what to do". This
 * layer exists to answer "what changed since you last looked".
 */
export type LifecycleAlertKind =
  | 'blocked'
  | 'unblocked'
  | 'next-move'
  | 'mismatch'
  | 'release';

export interface LifecycleAlert {
  id: string;
  kind: LifecycleAlertKind;
  /** `warning` is something the artist should look at; `info` is progress. */
  severity: 'warning' | 'info';
  phase: LifecyclePhaseId | null;
  title: string;
  message: string;
  /**
   * The exact snapshot values that raised this alert — step titles, blocking
   * steps, scores. Nothing here is generated prose about the artist; it is the
   * evidence the lifecycle already checked.
   */
  evidence: string[];
  /** Where the artist can act on it. */
  actionRoute: string;
  raisedAt: string;
}

const MAX_VISIBLE_ALERTS = 4;
const PATHWAY_ROUTE = '/artist-development';
const RELEASE_ROUTE = '/release-pipeline';

/**
 * Watches the lifecycle snapshot and reports only transitions.
 *
 * The first snapshot after hydration is a silent baseline: an artist opening the
 * app should not be greeted by a stack of alerts about state that was already
 * true last time. After that, a phase becoming blocked, a block clearing, the
 * next best move changing, a new profile/pathway mismatch, or a release
 * readiness change raises exactly one alert each, carrying the snapshot values
 * that triggered it.
 *
 * A change made while the app was closed is reported once at startup, by
 * comparing against the snapshot saved with the profile; the stored snapshot is
 * then refreshed so the same change is not raised again. Alerts are in-app:
 * nothing is pushed to a device, emailed, or sent anywhere, and no alert is
 * raised from data the app does not have.
 */
@Injectable({ providedIn: 'root' })
export class ArtistLifecycleAlertService {
  private profileService = inject(UserProfileService);
  private lifecycle = inject(ArtistLifecycleService);

  private previous: ArtistLifecycleSnapshot | null = null;
  private sequence = 0;

  private readonly visible = signal<LifecycleAlert[]>([]);

  /** Newest first, capped. Empty until something actually changes. */
  readonly alerts = this.visible.asReadonly();

  constructor() {
    effect(() => {
      // A placeholder profile is not the artist's state; diffing against it
      // would report a change the artist never made.
      if (!this.profileService.hydrated()) return;
      const profile = this.profileService.profile();
      const release =
        (profile.knowledgeBase as { currentRelease?: ReleaseProject } | undefined)
          ?.currentRelease ?? null;
      const snapshot = this.lifecycle.snapshot(profile, release);

      if (this.previous) {
        this.report(this.diff(this.previous, snapshot), snapshot);
        this.previous = snapshot;
        return;
      }

      /*
       * First read of this session. The profile carries the snapshot from its
       * last save, so comparing against it reports what changed while the app
       * was closed — a cloud restore, another device, or a restored backup.
       * Without a usable saved snapshot the first read is a silent baseline.
       */
      const stored = this.storedBaseline(profile);
      this.previous = snapshot;
      if (!stored) return;

      const alerts = this.diffSafely(stored, snapshot);
      if (!alerts.length) return;
      this.report(alerts, snapshot);
      // Mark the change as reported, so the next launch is quiet instead of
      // re-raising an alert the artist already saw.
      this.refreshStoredBaseline();
    });
  }

  /** Removes one alert. Ids are unique, so a dismissal is never undone. */
  dismiss(id: string): void {
    this.visible.update((alerts) => alerts.filter((alert) => alert.id !== id));
  }

  /**
   * Compares a snapshot with the last one observed and publishes any
   * transitions. Called by the constructor's effect; public so a caller holding
   * its own snapshot (for example a test) can advance the baseline without
   * waiting for Angular's effect scheduling.
   */
  observe(snapshot: ArtistLifecycleSnapshot): void {
    if (!this.previous) {
      this.previous = snapshot;
      return;
    }

    this.report(this.diff(this.previous, snapshot), snapshot);
    this.previous = snapshot;
  }

  private report(
    raised: Omit<LifecycleAlert, 'id' | 'raisedAt'>[],
    snapshot: ArtistLifecycleSnapshot
  ): void {
    if (!raised.length) return;
    const alerts = raised.map((alert) => ({
      ...alert,
      id: `lifecycle-alert-${++this.sequence}`,
      raisedAt: snapshot.generatedAt,
    }));
    this.visible.update((current) =>
      [...alerts.reverse(), ...current].slice(0, MAX_VISIBLE_ALERTS)
    );
  }

  /**
   * The snapshot saved with the profile, if it is shaped enough to diff. Legacy
   * records predate fields this comparison reads, and a malformed one must not
   * take the watcher down on startup.
   */
  private storedBaseline(profile: UserProfile | null | undefined): ArtistLifecycleSnapshot | null {
    const stored = profile?.artistLifecycleSnapshot as
      | ArtistLifecycleSnapshot
      | undefined;
    if (!stored || typeof stored !== 'object') return null;
    if (!Array.isArray(stored.phases) || !stored.phases.length) return null;
    if (!Array.isArray(stored.risks)) return null;
    if (!Array.isArray(stored.tasks)) return null;
    if (!stored.releaseReadiness || typeof stored.releaseReadiness !== 'object') {
      return null;
    }
    if (typeof stored.overallScore !== 'number') return null;
    return stored;
  }

  private diffSafely(
    previous: ArtistLifecycleSnapshot,
    current: ArtistLifecycleSnapshot
  ): Omit<LifecycleAlert, 'id' | 'raisedAt'>[] {
    try {
      return this.diff(previous, current);
    } catch {
      // A saved snapshot from an older schema is not worth a crash or a guess.
      return [];
    }
  }

  /**
   * Re-saves the profile so its stored snapshot matches what was just reported.
   * The save recomputes the snapshot from the same profile; it is not a second
   * source of state. Missing on hosts that supply a read-only profile service.
   */
  private refreshStoredBaseline(): void {
    const persist = (this.profileService as Partial<UserProfileService>)
      .updateProfile;
    if (typeof persist !== 'function') return;
    void Promise.resolve(persist.call(this.profileService, {})).catch(
      () => undefined
    );
  }

  private diff(
    previous: ArtistLifecycleSnapshot,
    current: ArtistLifecycleSnapshot
  ): Omit<LifecycleAlert, 'id' | 'raisedAt'>[] {
    return [
      ...this.blockedAlerts(previous, current),
      ...this.unblockedAlerts(previous, current),
      ...this.nextMoveAlerts(previous, current),
      ...this.mismatchAlerts(previous, current),
      ...this.releaseAlerts(previous, current),
    ];
  }

  private blockedAlerts(
    previous: ArtistLifecycleSnapshot,
    current: ArtistLifecycleSnapshot
  ): Omit<LifecycleAlert, 'id' | 'raisedAt'>[] {
    return current.phases
      .filter(
        (phase) =>
          phase.status === 'at-risk' &&
          this.phaseIn(previous, phase.id)?.status !== 'at-risk'
      )
      .map((phase) => ({
        kind: 'blocked' as const,
        severity: 'warning' as const,
        phase: phase.id,
        title: `${phase.label} is now blocked`,
        message: `Nothing in ${phase.label} can advance until ${
          this.list(phase.blockedBy)
        } ${phase.blockedBy.length > 1 ? 'are' : 'is'} done.`,
        evidence: [...phase.blockedBy, ...phase.gaps.slice(0, 2)],
        actionRoute: PATHWAY_ROUTE,
      }));
  }

  private unblockedAlerts(
    previous: ArtistLifecycleSnapshot,
    current: ArtistLifecycleSnapshot
  ): Omit<LifecycleAlert, 'id' | 'raisedAt'>[] {
    return current.phases
      .filter(
        (phase) =>
          phase.status !== 'at-risk' &&
          this.phaseIn(previous, phase.id)?.status === 'at-risk'
      )
      .map((phase) => ({
        kind: 'unblocked' as const,
        severity: 'info' as const,
        phase: phase.id,
        title: `${phase.label} is unblocked`,
        message: `${phase.completed} of ${phase.total} steps in ${phase.label} are now evidenced.`,
        // The dependency that was resolved is the interesting part.
        evidence: this.phaseIn(previous, phase.id)?.blockedBy.length
          ? this.phaseIn(previous, phase.id)!.blockedBy
          : phase.confirmed.slice(-2),
        actionRoute: PATHWAY_ROUTE,
      }));
  }

  private nextMoveAlerts(
    previous: ArtistLifecycleSnapshot,
    current: ArtistLifecycleSnapshot
  ): Omit<LifecycleAlert, 'id' | 'raisedAt'>[] {
    const move = current.nextBestMove;
    if (!move || move.id === previous.nextBestMove?.id) return [];

    const task = current.tasks.find((entry) => entry.id === move.id);
    const replaced = previous.nextBestMove?.title;
    return [
      {
        kind: 'next-move',
        severity: 'info',
        phase: move.phase,
        title: `Next move: ${move.title}`,
        message: this.moveMessage(move.why, replaced),
        evidence: this.taskEvidence(task),
        actionRoute: PATHWAY_ROUTE,
      },
    ];
  }

  private mismatchAlerts(
    previous: ArtistLifecycleSnapshot,
    current: ArtistLifecycleSnapshot
  ): Omit<LifecycleAlert, 'id' | 'raisedAt'>[] {
    const known = new Set(previous.risks.map((risk) => risk.message));
    // Dependency risks are already reported as blocked phases above; reporting
    // them twice would make one problem look like two.
    return current.risks
      .filter((risk) => risk.kind === 'mismatch' && !known.has(risk.message))
      .map((risk) => ({
        kind: 'mismatch' as const,
        severity: 'warning' as const,
        phase: risk.phase,
        title: 'The profile and the pathway have drifted apart',
        message: risk.message,
        evidence: [
          `Creative differentiation: ${current.differentiationScore}%`,
          `Pathway evidence: ${current.overallScore}%`,
        ],
        actionRoute: PATHWAY_ROUTE,
      }));
  }

  private releaseAlerts(
    previous: ArtistLifecycleSnapshot,
    current: ArtistLifecycleSnapshot
  ): Omit<LifecycleAlert, 'id' | 'raisedAt'>[] {
    const before = previous.releaseReadiness;
    const after = current.releaseReadiness;
    if (
      before.status !== 'assessed' ||
      after.status !== 'assessed' ||
      before.releaseId !== after.releaseId ||
      before.state === after.state ||
      after.state === 'insufficient-data'
    ) {
      return [];
    }

    const improved =
      this.readinessRank(after.state) > this.readinessRank(before.state);
    return [
      {
        kind: 'release',
        severity: improved ? 'info' : 'warning',
        phase: 'release',
        title: improved
          ? `${after.releaseName} moved to ${after.state}`
          : `${after.releaseName} lost readiness`,
        message: after.verdict,
        evidence: improved
          ? after.checks
              .filter((check) => check.state === 'ready')
              .map((check) => check.label)
          : after.blockingGaps.length
            ? after.blockingGaps
            : after.checks
                .filter((check) => check.state === 'not-ready')
                .map((check) => check.label),
        actionRoute: RELEASE_ROUTE,
      },
    ];
  }

  private phaseIn(
    snapshot: ArtistLifecycleSnapshot,
    id: LifecyclePhaseId
  ): ArtistLifecyclePhase | undefined {
    return snapshot.phases.find((phase) => phase.id === id);
  }

  private taskEvidence(task: ArtistLifecycleTask | undefined): string[] {
    if (!task) return [];
    return task.evidenceNeeded.length
      ? task.evidenceNeeded.slice(0, 3)
      : [`${task.title} is now the highest-priority open step.`];
  }

  private moveMessage(why: string, replaced?: string): string {
    return replaced
      ? `${why} This replaces "${replaced}" as the highest-priority open step.`
      : why;
  }

  private list(items: string[]): string {
    if (!items.length) return 'its prerequisites';
    const shown = items.slice(0, 2).map((item) => `"${item}"`);
    return items.length > 2
      ? `${shown.join(', ')} and ${items.length - 2} more`
      : shown.join(' and ');
  }

  private readinessRank(state: 'ready' | 'almost' | 'not-ready' | 'insufficient-data'): number {
    return { ready: 3, almost: 2, 'not-ready': 1, 'insufficient-data': 0 }[state];
  }
}
