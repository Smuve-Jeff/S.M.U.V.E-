import { Injectable, inject } from '@angular/core';
import { UserProfile } from './user-profile.service';
import {
  ArtistPathwayService,
  PathwayArea,
  PathwayStepProgress,
} from './artist-pathway.service';
import { ArtistIntelligenceService } from './artist-intelligence.service';
import { ReleaseReadinessService } from './release-readiness.service';
import { ReleaseProject } from '../types/release.types';
import {
  ArtistLifecycleMove,
  ArtistLifecyclePhase,
  ArtistLifecycleRisk,
  ArtistLifecycleSnapshot,
  LIFECYCLE_PHASE_AREAS,
  LIFECYCLE_PHASE_LABEL,
  LIFECYCLE_PHASE_ORDER,
  LifecyclePhaseId,
  LifecycleProvenance,
} from '../types/artist-lifecycle.types';

/**
 * How far the creative profile and the evidenced pathway may drift before the
 * gap itself is worth reporting. This is a directional check on two different
 * percentages, not a metric: it exists to say "you describe a strong artist but
 * have built none of the structure", or the reverse.
 */
const MISMATCH_THRESHOLD = 30;

/**
 * Derives the artist lifecycle snapshot from the systems that already own the
 * underlying facts.
 *
 * This service is deliberately an adapter: it does not score the artist again
 * from raw profile fields, because the pathway and the intelligence report
 * already do that and three competing numbers would eventually disagree. Every
 * phase score is a count of pathway steps, every move comes from the pathway's
 * own ordering, and every signal carries how it was obtained.
 */
@Injectable({ providedIn: 'root' })
export class ArtistLifecycleService {
  private pathway = inject(ArtistPathwayService);
  private intelligence = inject(ArtistIntelligenceService);
  private releaseReadiness = inject(ReleaseReadinessService);

  /** The phase a pathway area belongs to. */
  phaseForArea(area: PathwayArea): LifecyclePhaseId {
    const phase = LIFECYCLE_PHASE_ORDER.find((id) =>
      LIFECYCLE_PHASE_AREAS[id].includes(area)
    );
    // LIFECYCLE_PHASE_AREAS covers all eight areas and the spec enforces it, so
    // this fallback only protects against a future area being added without a
    // home. Grouping it under business is less wrong than throwing.
    return phase ?? 'business';
  }

  /**
   * A full lifecycle read for a saved profile or an unsaved draft. Pass the
   * release from the pipeline to include readiness for it; without one the
   * snapshot reports that no release exists instead of guessing.
   */
  snapshot(
    profile: UserProfile | null | undefined,
    release?: ReleaseProject | null
  ): ArtistLifecycleSnapshot {
    const readout = this.pathway.readout(profile);
    const report = this.intelligence.analyze(
      (profile ?? {}) as UserProfile
    );

    const phases = LIFECYCLE_PHASE_ORDER.map((id) =>
      this.buildPhase(id, readout.steps)
    );

    const nextBestMove = readout.nextAction
      ? this.toMove(readout.nextAction)
      : null;
    const supportingMoves = readout.parallelActions
      .map((entry) => this.toMove(entry))
      .slice(0, 3);

    const risks = this.buildRisks(phases, readout.overall, report.differentiationScore);

    const officialAreas = readout.areas.filter(
      (area) => area.standing === 'official'
    ).length;
    const summary = [
      `${readout.completedSteps} of ${readout.totalSteps} pathway steps are evidenced (${readout.overall}%), and ${officialAreas} of ${readout.areas.length} areas are official.`,
      nextBestMove
        ? `Next best move: ${nextBestMove.title} (${LIFECYCLE_PHASE_LABEL[nextBestMove.phase]}).`
        : 'Every pathway step is complete.',
    ].join(' ');

    return {
      generatedAt: new Date().toISOString(),
      stage: readout.stage,
      overallScore: readout.overall,
      overallProvenance: this.provenanceFor(
        readout.completedSteps,
        readout.totalSteps
      ),
      phases,
      nextBestMove,
      supportingMoves,
      risks,
      releaseReadiness: this.releaseReadiness.assess(profile, release),
      differentiationScore: report.differentiationScore,
      summary,
      provenanceNotes: this.buildProvenanceNotes(
        phases,
        readout.completedSteps,
        readout.totalSteps
      ),
    };
  }

  private buildPhase(
    id: LifecyclePhaseId,
    steps: PathwayStepProgress[]
  ): ArtistLifecyclePhase {
    const areas = LIFECYCLE_PHASE_AREAS[id];
    const phaseSteps = steps.filter((entry) =>
      areas.includes(entry.step.area)
    );
    const total = phaseSteps.length;
    const confirmed = phaseSteps.filter((entry) => entry.status === 'complete');
    const completed = confirmed.length;
    const score = total ? Math.round((completed / total) * 100) : null;
    const blocked = phaseSteps.filter((entry) => entry.status === 'blocked');

    return {
      id,
      label: LIFECYCLE_PHASE_LABEL[id],
      areas,
      // A blocked phase is the only thing called at-risk. An untouched phase is
      // work the artist can start, not a failure.
      status:
        score === 100
          ? 'on-track'
          : blocked.length
            ? 'at-risk'
            : 'needs-attention',
      score,
      provenance: this.provenanceFor(completed, total),
      completed,
      total,
      confirmed: confirmed.map((entry) => entry.step.title),
      gaps: phaseSteps
        .filter((entry) => entry.status !== 'complete')
        .map((entry) => entry.step.title),
      blockedBy: [
        ...new Set(blocked.flatMap((entry) => entry.blockedBy)),
      ],
    };
  }

  /**
   * `missing` rather than "inferred but empty": an artist who has not filled in
   * a phase has not failed it, and nothing about that phase is known yet.
   */
  private provenanceFor(
    completed: number,
    total: number
  ): LifecycleProvenance {
    if (completed === 0 || total === 0) return 'missing';
    return completed === total ? 'verified' : 'inferred';
  }

  private toMove(entry: PathwayStepProgress): ArtistLifecycleMove {
    return {
      id: entry.step.id,
      phase: this.phaseForArea(entry.step.area),
      title: entry.step.title,
      action: entry.nextMove || entry.step.actions[0] || '',
      why: entry.step.why,
      // Moves are chosen from the artist's own profile, never from a platform
      // feed, so they can never be more than inferred.
      provenance: 'inferred',
    };
  }

  private buildRisks(
    phases: ArtistLifecyclePhase[],
    overall: number,
    differentiationScore: number
  ): ArtistLifecycleRisk[] {
    const risks: ArtistLifecycleRisk[] = phases
      .filter((phase) => phase.status === 'at-risk')
      .map((phase) => ({
        kind: 'dependency' as const,
        phase: phase.id,
        message: `${phase.label} cannot advance until ${
          phase.blockedBy.slice(0, 2).join(' and ') || 'its prerequisites'
        } ${phase.blockedBy.length > 1 ? 'are' : 'is'} done.`,
        provenance: 'inferred' as const,
      }));

    const gap = differentiationScore - overall;
    if (Math.abs(gap) >= MISMATCH_THRESHOLD) {
      risks.push({
        kind: 'mismatch',
        phase: null,
        message:
          gap > 0
            ? `The creative profile is ${differentiationScore}% differentiated while only ${overall}% of the pathway is evidenced — the stated direction is ahead of the structure behind it.`
            : `The pathway is ${overall}% evidenced while the creative profile scores ${differentiationScore}% on differentiation — the structure is ahead of the artist's stated point of view.`,
        provenance: 'inferred',
      });
    }

    return risks;
  }

  private buildProvenanceNotes(
    phases: ArtistLifecyclePhase[],
    completedSteps: number,
    totalSteps: number
  ): string[] {
    const notes = [
      'Phase scores count evidenced pathway steps. No streaming, analytics, or royalty feed is connected yet, so nothing here is sampled from a platform.',
    ];
    if (completedSteps === 0 && totalSteps > 0) {
      notes.push(
        'No pathway step is evidenced yet, so every phase is reported as missing rather than assumed to be failing.'
      );
    } else {
      const missing = phases.filter(
        (phase) => phase.provenance === 'missing'
      ).length;
      if (missing) {
        notes.push(
          `${missing} of ${phases.length} phases have no evidence yet and are reported as missing.`
        );
      }
    }
    return notes;
  }
}
