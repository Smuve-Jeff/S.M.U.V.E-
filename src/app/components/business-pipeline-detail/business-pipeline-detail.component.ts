import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BusinessPipelineService } from '../../services/business-pipeline.service';
import { BusinessStep } from '../../types/business.types';
import { MerchDesignLabComponent } from '../business-modules/merch-design-lab.component';
import { LegalTemplateComponent } from '../business-modules/legal-template.component';
import { UserContextService } from '../../services/user-context.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';

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

  constructor() {
    this.route.params.subscribe((params) => {
      this.pipelineId.set(params['id']);
    });
  }

  ngOnInit() {
    this.userContext.setMainViewMode('business-pipeline');
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

  closeAction() {
    this.activeModuleAction.set(null);
  }
}
