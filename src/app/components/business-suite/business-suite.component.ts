import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import {
  BusinessPipelineService,
  pipelineProgress,
} from '../../services/business-pipeline.service';
import {
  BUSINESS_SPINE_PHASES,
  BusinessPipeline,
  BusinessPipelineType,
} from '../../types/business.types';
import { UserContextService } from '../../services/user-context.service';
import { ArtistLifecycleService } from '../../services/artist-lifecycle.service';
import { UserProfileService } from '../../services/user-profile.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { ArtistLifecyclePhase } from '../../types/artist-lifecycle.types';

@Component({
  selector: 'app-business-suite',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './business-suite.component.html',
  styleUrls: ['./business-suite.component.css'],
})
export class BusinessSuiteComponent implements OnInit {
  bizService = inject(BusinessPipelineService);
  router = inject(Router);
  userContext = inject(UserContextService);
  private lifecycleService = inject(ArtistLifecycleService);
  private profileService = inject(UserProfileService);
  private dialog = inject(InteractionDialogService);

  /**
   * The same snapshot the Hub and the pathway read, so this workspace can never
   * report a different business score than the rest of the app.
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

  spineCompleted = computed(() =>
    this.spinePhases().reduce((total, phase) => total + phase.completed, 0)
  );

  spineTotal = computed(() =>
    this.spinePhases().reduce((total, phase) => total + phase.total, 0)
  );

  /** The first business-spine step that can actually be started now. */
  spineNext = computed(() => {
    const tasks = this.lifecycle().tasks.filter((task) =>
      BUSINESS_SPINE_PHASES.includes(task.phase)
    );
    return (
      tasks.find(
        (task) =>
          task.urgency === 'now' &&
          task.status !== 'complete' &&
          task.status !== 'blocked'
      ) ??
      tasks.find(
        (task) => task.status === 'ready' || task.status === 'in-progress'
      ) ??
      null
    );
  });

  /** The career-wide move when it sits outside this workspace, so it is not hidden. */
  careerNextMove = computed(() => {
    const move = this.lifecycle().nextBestMove;
    return move && !BUSINESS_SPINE_PHASES.includes(move.phase) ? move : null;
  });

  spineBlockers = computed(() => [
    ...new Set(this.spinePhases().flatMap((phase) => phase.blockedBy)),
  ]);

  /**
   * A phase with nothing recorded has no score — showing 0% would read as a
   * failed phase rather than one that has not been started.
   */
  phaseScoreLabel(phase: ArtistLifecyclePhase): string {
    return phase.provenance === 'missing' ? 'No evidence' : `${phase.score}%`;
  }

  /** Pipelines on the working grid: archived work is kept but not shown. */
  activePipelines = computed(() =>
    this.bizService
      .activePipelines()
      .filter((pipeline) => pipeline.status !== 'Archived')
  );

  archivedPipelines = computed(() =>
    this.bizService
      .activePipelines()
      .filter((pipeline) => pipeline.status === 'Archived')
  );

  showArchived = signal(false);

  openPathway(): void {
    this.router.navigate(['/artist-development']);
  }

  availableModules: {
    type: BusinessPipelineType;
    icon: string;
    description: string;
    color: string;
  }[] = [
    {
      type: 'Merch',
      icon: 'fas fa-tshirt',
      description: 'Design and deploy a professional merchandise line.',
      color: 'brand-primary',
    },
    {
      type: 'Record Label',
      icon: 'fas fa-building',
      description: 'Establish your legal entity and record label operations.',
      color: 'brand-secondary',
    },
    {
      type: 'Website',
      icon: 'fas fa-globe',
      description: 'Build a high-performance fan portal and landing page.',
      color: 'brand-warning',
    },
    {
      type: 'PRO',
      icon: 'fas fa-copyright',
      description: 'Register with BMI/ASCAP and secure your royalties.',
      color: 'brand-danger',
    },
    {
      type: 'Legal',
      icon: 'fas fa-file-contract',
      description: 'AI-generated contracts and split sheets for protection.',
      color: 'brand-info',
    },
  ];

  ngOnInit() {
    this.userContext.setMainViewMode('business-suite');
  }

  async startModule(type: BusinessPipelineType) {
    const name = `Official ${type} Pathway`;
    const id = await this.bizService.initializeModule(type, name);
    this.router.navigate(['/business-pipeline', id]);
  }

  /** Keeps a finished pathway's evidence without leaving it on the grid. */
  async archivePipeline(pipeline: BusinessPipeline, event?: Event) {
    event?.stopPropagation();
    if (!(await this.bizService.archivePipeline(pipeline.id))) {
      await this.dialog.alert({
        title: 'Pathway not archived',
        message: 'Only a completed pathway can be archived.',
        confirmLabel: 'Got it',
      });
    }
  }

  async restorePipeline(pipeline: BusinessPipeline, event?: Event) {
    event?.stopPropagation();
    if (!(await this.bizService.restorePipeline(pipeline.id))) {
      await this.dialog.alert({
        title: 'Pathway not restored',
        message: 'That pathway is no longer archived.',
        confirmLabel: 'Got it',
      });
    }
  }

  /** Removes a finished pathway from the profile after explicit consent. */
  async removePipeline(pipeline: BusinessPipeline, event?: Event) {
    event?.stopPropagation();
    const confirmed = await this.dialog.confirm({
      title: `Remove ${pipeline.name}?`,
      message:
        'This deletes the completed pathway and its recorded step history from your profile. It cannot be undone.',
      confirmLabel: 'Remove pathway',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!confirmed) return;

    if (!(await this.bizService.removePipeline(pipeline.id))) {
      await this.dialog.alert({
        title: 'Pathway not removed',
        message:
          'Only a completed pathway can be removed. Finish it first, then remove it.',
        confirmLabel: 'Got it',
      });
    }
  }

  /**
   * The card and the pipeline detail must agree on what progress means:
   * stages actually completed, not the stage that happens to be open.
   */
  progress(pipeline: BusinessPipeline): number {
    return pipelineProgress(pipeline);
  }

  /** The open pipeline for a module, so a card can offer to resume it. */
  activePipelineFor(type: BusinessPipelineType): BusinessPipeline | null {
    return (
      this.bizService
        .activePipelines()
        .find(
          (pipeline) =>
            pipeline.type === type && pipeline.status !== 'Completed'
        ) ?? null
    );
  }

  navigateToPipeline(id: string) {
    this.router.navigate(['/business-pipeline', id]);
  }
}
