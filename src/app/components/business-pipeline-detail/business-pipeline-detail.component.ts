import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  BusinessPipelineService,
  pipelineProgress,
} from '../../services/business-pipeline.service';
import {
  BUSINESS_SPINE_PHASES,
  BusinessStage,
  BusinessStep,
} from '../../types/business.types';
import { MerchDesignLabComponent } from '../business-modules/merch-design-lab.component';
import { LegalTemplateComponent } from '../business-modules/legal-template.component';
import { UserContextService } from '../../services/user-context.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { ArtistLifecycleService } from '../../services/artist-lifecycle.service';
import { UserProfileService } from '../../services/user-profile.service';
import { ArtistLifecyclePhase } from '../../types/artist-lifecycle.types';

@Component({
  selector: 'app-business-pipeline-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MerchDesignLabComponent,
    LegalTemplateComponent,
  ],
  templateUrl: './business-pipeline-detail.component.html',
  styleUrls: ['./business-pipeline-detail.component.css'],
})
export class BusinessPipelineDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private bizService = inject(BusinessPipelineService);
  private userContext = inject(UserContextService);
  private dialog = inject(InteractionDialogService);
  private router = inject(Router);
  private lifecycleService = inject(ArtistLifecycleService);
  private profileService = inject(UserProfileService);

  pipelineId = signal<string | null>(null);
  activeModuleAction = signal<'Design' | 'Template' | null>(null);

  pipeline = computed(() => {
    const id = this.pipelineId();
    return this.bizService.activePipelines().find((p) => p.id === id);
  });

  currentStage = computed(() => {
    const p = this.pipeline();
    if (!p) return null;
    return p.stages[p.currentStageIndex];
  });

  /**
   * The same evidence read the Business Suite shows — the panel must not
   * invent a second score for the artist's rights, business, or money work.
   */
  lifecycle = computed(() => {
    const profile = this.profileService.profile();
    return this.lifecycleService.snapshot(
      profile,
      (profile.knowledgeBase as any)?.currentRelease ?? null
    );
  });

  spinePhases = computed(() =>
    this.lifecycle().phases.filter((phase) =>
      BUSINESS_SPINE_PHASES.includes(phase.id)
    )
  );

  /** Progression of this pipeline, counted from completed stages. */
  pipelinePercent = computed(() => {
    const pipeline = this.pipeline();
    return pipeline ? pipelineProgress(pipeline) : 0;
  });

  completedStageCount = computed(
    () =>
      this.pipeline()?.stages.filter((stage) => stage.status === 'Completed')
        .length ?? 0
  );

  constructor() {
    this.route.params.subscribe((params) => {
      this.pipelineId.set(params['id']);
    });
  }

  ngOnInit() {
    this.userContext.setMainViewMode('business-pipeline');
  }

  /**
   * Timeline state for one stage. Completed stages read as done, the open stage
   * as current, everything after it as upcoming — the timeline used to draw
   * every stage up to `currentStageIndex` as if it were finished.
   */
  stageState(stage: BusinessStage): 'complete' | 'current' | 'upcoming' {
    if (stage.status === 'Completed') return 'complete';
    const pipeline = this.pipeline();
    return pipeline?.stages[pipeline.currentStageIndex]?.id === stage.id
      ? 'current'
      : 'upcoming';
  }

  /** A phase with nothing recorded has no score — not a failed 0%. */
  phaseScoreLabel(phase: ArtistLifecyclePhase): string {
    return phase.provenance === 'missing' ? 'No evidence' : `${phase.score}%`;
  }

  phasePercent(phase: ArtistLifecyclePhase): number {
    return phase.provenance === 'missing' || phase.score === null
      ? 0
      : phase.score;
  }

  completeStep(step: BusinessStep) {
    const p = this.pipeline();
    const s = this.currentStage();
    if (p && s) {
      this.bizService.updateStep(p.id, s.id, step.id, 'Completed');
    }
  }

  performAction(step: BusinessStep) {
    if (step.actionType === 'Design') {
      this.activeModuleAction.set('Design');
    } else if (step.actionType === 'Template') {
      this.activeModuleAction.set('Template');
    } else {
      void this.dialog.alert({
        title: `${step.actionType} Queued`,
        message:
          'This business action is being prepared. Keep moving through the pipeline while we connect the relevant module.',
        confirmLabel: 'Got it',
      });
    }
  }

  /** Hand the artist to the coach surface rather than faking advice here. */
  askForGuidance() {
    void this.router.navigate(['/artist-coach']);
  }

  /**
   * A progress audit built from this pipeline's own steps. No projected
   * revenue or invented metrics: just what is actually complete.
   */
  generateWeeklyAudit() {
    const p = this.pipeline();
    if (!p) return;
    const stages = p.stages ?? [];
    const steps = stages.flatMap((stage: any) => stage.steps ?? []);
    const done = steps.filter((step: any) => step.status === 'Completed').length;
    const next = steps.find((step: any) => step.status !== 'Completed');
    void this.dialog.alert({
      title: `${p.name} audit`,
      message:
        `${done} of ${steps.length} steps complete across ` +
        `${stages.length} stage${stages.length === 1 ? '' : 's'}.` +
        (next ? ` Next up: ${next.title}.` : ' Every step is complete.'),
      confirmLabel: 'Got it',
    });
  }

  closeAction() {
    this.activeModuleAction.set(null);
  }
}
