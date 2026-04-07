import { Injectable, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import {
  BusinessPipeline,
  BusinessPipelineType,
  BusinessStage,
} from '../types/business.types';

@Injectable({
  providedIn: 'root',
})
export class BusinessPipelineService {
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);

  activePipelines = signal<BusinessPipeline[]>([]);

  constructor() {
    this.loadPipelines();
  }

  private loadPipelines() {
    const profile = this.profileService.profile();
    if ((profile as any).businessPipelines) {
      this.activePipelines.set((profile as any).businessPipelines);
    }
  }

  async initializeModule(
    type: BusinessPipelineType,
    name: string
  ): Promise<string> {
    const newPipeline: BusinessPipeline = {
      id: `biz-${Date.now()}`,
      type,
      name,
      status: 'Active',
      currentStageIndex: 0,
      stages: this.getStagesForType(type),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [...this.activePipelines(), newPipeline];
    this.activePipelines.set(updated);
    await this.saveToProfile(updated);
    this.logger.info(`BusinessPipeline: Initialized ${type} module: ${name}`);
    return newPipeline.id;
  }

  async updateStep(
    pipelineId: string,
    stageId: string,
    stepId: string,
    status: 'Completed' | 'In Progress' | 'Pending'
  ): Promise<void> {
    const pipelines = this.activePipelines();
    const updated = pipelines.map((p) => {
      if (p.id !== pipelineId) return p;

      const updatedStages = p.stages.map((s) => {
        if (s.id !== stageId) return s;

        const updatedSteps = s.steps.map((step) =>
          step.id === stepId ? { ...step, status } : step
        );

        const allStepsDone = updatedSteps.every(
          (st) => st.status === 'Completed'
        );
        return {
          ...s,
          steps: updatedSteps,
          status: (allStepsDone ? 'Completed' : 'In Progress') as any,
        };
      });

      let newIndex = p.currentStageIndex;
      if (
        updatedStages[newIndex]?.status === 'Completed' &&
        newIndex < updatedStages.length - 1
      ) {
        newIndex++;
        updatedStages[newIndex].status = 'In Progress';
      }

      return {
        ...p,
        stages: updatedStages,
        currentStageIndex: newIndex,
        status: (updatedStages.every((st) => st.status === 'Completed')
          ? 'Completed'
          : 'Active') as any,
        updatedAt: Date.now(),
      };
    });

    this.activePipelines.set(updated);
    await this.saveToProfile(updated);
  }

  private async saveToProfile(pipelines: BusinessPipeline[]) {
    const profile = this.profileService.profile();
    await this.profileService.updateProfile({
      ...profile,
      businessPipelines: pipelines,
    } as any);
  }

  private getStagesForType(type: BusinessPipelineType): BusinessStage[] {
    switch (type) {
      case 'Merch':
        return [
          {
            id: 'stg-1',
            name: 'Brand Concept',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Moodboard',
                description: 'Define the visual vibe of your merch line.',
                status: 'Pending',
                aiGuidance:
                  'Elite artists start with a vibe, not just a logo. Use S.M.U.V.E. Vision to curate your moodboard.',
              },
              {
                id: 'step-2',
                title: 'Style Selection',
                description:
                  'Choose between Oversized, Vintage, or Tech-Noir aesthetics.',
                status: 'Pending',
                aiGuidance:
                  'Market trends favor High-Voltage neons this quarter. Choose wisely.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Design Lab',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'AI Mockups',
                description:
                  'Generate high-fidelity designs using S.M.U.V.E. Lab.',
                status: 'Pending',
                aiGuidance:
                  'I will generate 3 options based on your sonic profile. Pick the one that screams "Iconic".',
                actionType: 'Design',
              },
            ],
          },
          {
            id: 'stg-3',
            name: 'Logistics',
            status: 'Locked',
            steps: [
              {
                id: 'step-4',
                title: 'Vendor Setup',
                description:
                  'Connect with Print-on-Demand or bulk manufacturers.',
                status: 'Pending',
                aiGuidance:
                  'Efficiency is king. I recommend starting with POD to test the market.',
              },
            ],
          },
        ];

      case 'Record Label':
        return [
          {
            id: 'stg-1',
            name: 'Identity',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Brand Mission',
                description: 'Define what your label stands for.',
                status: 'Pending',
                aiGuidance:
                  'A label is a promise. What are you promising your future roster?',
              },
              {
                id: 'step-2',
                title: 'Visual Identity',
                description: 'Logo and official assets.',
                status: 'Pending',
                aiGuidance:
                  'Keep it clean, keep it authoritarian. The label logo should command respect.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Legal Foundation',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Business Structure',
                description: 'Form an LLC or Corp.',
                status: 'Pending',
                aiGuidance:
                  'Protect your assets. An LLC is the bare minimum for a S.M.U.V.E 1.0.',
                actionType: 'External',
              },
              {
                id: 'step-4',
                title: 'EIN Registration',
                description: 'Get your Federal Tax ID.',
                status: 'Pending',
                aiGuidance: 'You cannot scale without a Tax ID. Do it now.',
              },
            ],
          },
        ];

      case 'PRO':
        return [
          {
            id: 'stg-1',
            name: 'Affiliation',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'PRO Selection',
                description: 'Choose BMI, ASCAP, or SESAC.',
                status: 'Pending',
                aiGuidance:
                  'BMI is generally preferred for newcomers due to low barriers. ASCAP has superior tech interfaces.',
              },
              {
                id: 'step-2',
                title: 'Registration Portal',
                description: 'Submit your official application.',
                status: 'Pending',
                aiGuidance:
                  'Provide your real name and Stage Name accurately. Consistency is non-negotiable.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Data Sync',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'IPI Acquisition',
                description: 'Receive and verify your IPI number.',
                status: 'Pending',
                aiGuidance:
                  'Your IPI is your professional fingerprint. Store it in the Analytics Vault immediately.',
              },
              {
                id: 'step-4',
                title: 'Works Registration',
                description: 'Register your catalog.',
                status: 'Pending',
                aiGuidance:
                  'Unregistered songs are unpaid songs. Register everything.',
              },
            ],
          },
        ];

      case 'Website':
        return [
          {
            id: 'stg-1',
            name: 'Infrastructure',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Domain Selection',
                description: 'Claim your .com or .io territory.',
                status: 'Pending',
                aiGuidance:
                  'Your domain name is your digital flag. Avoid dashes if possible.',
              },
              {
                id: 'step-2',
                title: 'Hosting Setup',
                description: 'Secure high-performance hosting.',
                status: 'Pending',
                aiGuidance:
                  'Elite sites require zero latency. I suggest a CDN-backed hosting provider.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Design Lab',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Layout Generation',
                description: 'AI-assisted design for your home page.',
                status: 'Pending',
                aiGuidance:
                  'Focus on your latest release. The hero section must convert visitors into fans.',
                actionType: 'Design',
              },
            ],
          },
        ];

      case 'Legal':
        return [
          {
            id: 'stg-1',
            name: 'Contract Suite',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Split Sheets',
                description: 'Define percentages for your collaborators.',
                status: 'Pending',
                aiGuidance:
                  "Handshakes don't pay the bills. Paperwork does. Get everyone to sign split sheets before the master is done.",
                actionType: 'Template',
              },
              {
                id: 'step-2',
                title: 'Work-for-Hire',
                description: 'Standard agreements for session musicians.',
                status: 'Pending',
                aiGuidance:
                  'Maintain total control. Every contractor must sign a Work-for-Hire agreement.',
                actionType: 'Template',
              },
            ],
          },
        ];

      default:
        return [];
    }
  }
}
