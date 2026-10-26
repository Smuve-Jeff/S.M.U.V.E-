import { Component, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { BusinessPipelineService } from '../../services/business-pipeline.service';
import { BusinessPipelineType } from '../../types/business.types';
import { UserContextService } from '../../services/user-context.service';
import { ArtistLifecycleService } from '../../services/artist-lifecycle.service';
import { UserProfileService } from '../../services/user-profile.service';
import {
  ArtistLifecyclePhase,
  LifecyclePhaseId,
} from '../../types/artist-lifecycle.types';

/** The phases that this workspace is accountable for. */
const SPINE_PHASES: LifecyclePhaseId[] = ['rights', 'business', 'money'];

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
    this.lifecycle().phases.filter((phase) => SPINE_PHASES.includes(phase.id))
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
      SPINE_PHASES.includes(task.phase)
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
    return move && !SPINE_PHASES.includes(move.phase) ? move : null;
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

  navigateToPipeline(id: string) {
    this.router.navigate(['/business-pipeline', id]);
  }
}
