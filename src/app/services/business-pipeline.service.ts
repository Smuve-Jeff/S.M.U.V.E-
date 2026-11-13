import { Injectable, effect, inject, signal } from '@angular/core';
import { UserProfileService } from './user-profile.service';
import { LoggingService } from './logging.service';
import {
  BusinessPipeline,
  BusinessPipelineType,
  BusinessStage,
  BusinessStep,
} from '../types/business.types';

/**
 * Progress from stages that are actually complete, not from the stage that is
 * currently open. `currentStageIndex` points at the stage in progress, so a
 * brand new three-stage pipeline used to render 33% before a single step was
 * done — and a finished one could never reach 100% honestly.
 */
export function pipelineProgress(pipeline: BusinessPipeline): number {
  const stages = pipeline?.stages ?? [];
  if (!stages.length) return 0;
  const completed = stages.filter((stage) => stage.status === 'Completed')
    .length;
  return Math.round((completed / stages.length) * 100);
}

/** Every step in a pipeline, in stage order. */
export function pipelineSteps(pipeline: BusinessPipeline): BusinessStep[] {
  return (pipeline?.stages ?? []).flatMap((stage) => stage.steps ?? []);
}

/**
 * The first step the artist can still act on. Stages unlock in order, so this
 * is always a step of the open stage — which is exactly what a card should
 * name instead of forcing the artist to open the pathway to find out.
 */
export function pipelineNextStep(
  pipeline: BusinessPipeline
): BusinessStep | null {
  return (
    pipelineSteps(pipeline).find((step) => step.status !== 'Completed') ?? null
  );
}

@Injectable({
  providedIn: 'root',
})
export class BusinessPipelineService {
  private profileService = inject(UserProfileService);
  private logger = inject(LoggingService);

  activePipelines = signal<BusinessPipeline[]>([]);

  constructor() {
    /*
     * This service is created before profile hydration on a full reload. Read
     * the profile reactively so saved pathways reappear once the real record
     * is installed, instead of keeping the empty pre-load snapshot forever.
     */
    effect(() => this.syncFromProfile());
    // A pre-hydrated profile (tests and restored sessions) must be visible
    // immediately; the effect covers the asynchronous hydration path.
    this.syncFromProfile();
  }

  private syncFromProfile(): void {
    const hydrated = this.profileService.hydrated;
    if (typeof hydrated === 'function' && !hydrated()) return;

    const profile = this.profileService.profile();
    if (Array.isArray((profile as any).businessPipelines)) {
      this.activePipelines.set((profile as any).businessPipelines);
    }
  }

  async initializeModule(
    type: BusinessPipelineType,
    name: string
  ): Promise<string> {
    // Clicking a module again used to stack a second pipeline of the same type,
    // and every further click added another. Reuse the open one instead; a new
    // pipeline is only created once the previous one is completed or archived.
    const open = this.activePipelines().find(
      (pipeline) =>
        pipeline.type === type &&
        (pipeline.status === 'Draft' || pipeline.status === 'Active')
    );
    if (open) {
      this.logger.info(
        `BusinessPipeline: Reusing open ${type} module: ${open.name}`
      );
      return open.id;
    }

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

  /**
   * Removes a finished pipeline from the profile. Open work is refused:
   * deleting it would throw away steps the artist can still finish. Archived
   * pathways count as finished — forcing the artist to restore one first was
   * the only way to delete it.
   */
  async removePipeline(pipelineId: string): Promise<boolean> {
    const pipelines = this.activePipelines();
    const target = pipelines.find((pipeline) => pipeline.id === pipelineId);
    const finished =
      target?.status === 'Completed' || target?.status === 'Archived';
    if (!target || !finished) {
      this.logger.warn(
        `BusinessPipeline: Refused to remove ${pipelineId}; only completed or archived pathways can be removed`
      );
      return false;
    }

    const updated = pipelines.filter((pipeline) => pipeline.id !== pipelineId);
    this.activePipelines.set(updated);
    await this.saveToProfile(updated);
    this.logger.info(
      `BusinessPipeline: Removed completed ${target.type} module: ${target.name}`
    );
    return true;
  }

  /**
   * Renames a pathway. Business infrastructure is named after the real thing —
   * an entity, a label, a website — so the generated default cannot be the only
   * name a pathway ever has. An empty name is refused rather than saved.
   */
  async renamePipeline(pipelineId: string, name: string): Promise<boolean> {
    const trimmed = (name ?? '').trim().slice(0, 80);
    if (!trimmed) {
      this.logger.warn(
        `BusinessPipeline: Refused to rename ${pipelineId} to an empty name`
      );
      return false;
    }

    const pipelines = this.activePipelines();
    const target = pipelines.find((pipeline) => pipeline.id === pipelineId);
    if (!target) return false;
    if (target.name === trimmed) return true;

    const updated = pipelines.map((pipeline) =>
      pipeline.id === pipelineId
        ? { ...pipeline, name: trimmed, updatedAt: Date.now() }
        : pipeline
    );
    this.activePipelines.set(updated);
    await this.saveToProfile(updated);
    this.logger.info(
      `BusinessPipeline: Renamed ${pipelineId} from "${target.name}" to "${trimmed}"`
    );
    return true;
  }

  /** Hides a completed pipeline from the hub without losing its evidence. */
  async archivePipeline(pipelineId: string): Promise<boolean> {
    return this.setFinishedStatus(pipelineId, 'Completed', 'Archived');
  }

  /** Returns an archived pathway to the hub's completed list. */
  async restorePipeline(pipelineId: string): Promise<boolean> {
    return this.setFinishedStatus(pipelineId, 'Archived', 'Completed');
  }

  private async setFinishedStatus(
    pipelineId: string,
    from: BusinessPipeline['status'],
    to: BusinessPipeline['status']
  ): Promise<boolean> {
    const pipelines = this.activePipelines();
    const target = pipelines.find((pipeline) => pipeline.id === pipelineId);
    if (!target || target.status !== from) {
      this.logger.warn(
        `BusinessPipeline: Refused to move ${pipelineId} from ${from} to ${to}`
      );
      return false;
    }

    const updated = pipelines.map((pipeline) =>
      pipeline.id === pipelineId
        ? { ...pipeline, status: to, updatedAt: Date.now() }
        : pipeline
    );
    this.activePipelines.set(updated);
    await this.saveToProfile(updated);
    this.logger.info(`BusinessPipeline: ${from} → ${to}: ${target.name}`);
    return true;
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

      /*
       * Point at the first stage that is still open instead of stepping one
       * forward. Reopening a step in an earlier stage now pulls the pipeline
       * back to that stage, so the timeline cannot claim a reopened stage is
       * merely upcoming (and a finished pipeline cannot stay Completed).
       */
      const openIndex = updatedStages.findIndex(
        (stage) => stage.status !== 'Completed'
      );
      const newIndex =
        openIndex === -1 ? Math.max(0, updatedStages.length - 1) : openIndex;
      if (openIndex !== -1 && updatedStages[openIndex].status === 'Locked') {
        // Replace the stage instead of mutating it: the previous pipeline
        // snapshot still holds this object.
        updatedStages[openIndex] = {
          ...updatedStages[openIndex],
          status: 'In Progress',
        };
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

  /**
   * Illustrative revenue scenarios from money actually recorded on the profile.
   *
   * This is deliberately not a forecast: no market or streaming data is used.
   * The tax reserve and growth steps are fixed, stated assumptions, and callers
   * must present the output as a scenario rather than a prediction.
   */
  calculateRevenueProjections(recorded: { revenue: number }): any {
    const revenue = Number.isFinite(recorded?.revenue)
      ? Math.max(0, recorded.revenue)
      : 0;
    const taxReserveRate = 0.2;
    const net = revenue * (1 - taxReserveRate);
    const growth = [0.1, 0.5, 1.2];

    return {
      recordedRevenue: revenue,
      taxReserve: revenue * taxReserveRate,
      netRevenue: net,
      assumptions: { taxReserveRate, growth },
      forecast: growth.map((rate) => ({
        label: `+${Math.round(rate * 100)}%`,
        estimate: net * (1 + rate),
      })),
    };
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
                  'Protect your assets. An LLC is the bare minimum for a S.M.U.V.E 2.0.',
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
                description:
                  'Define a universal agreement for your collaborators.',
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

      case 'Film & TV':
        return [
          {
            id: 'stg-1',
            name: 'Performance Assets',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Cut a Screen Reel',
                description:
                  'Build a 60–90 second reel with two contrasting scenes, a slate, and footage you have rights to use.',
                status: 'Pending',
                aiGuidance:
                  'Casting looks for range and clarity in the first ten seconds. Use finished footage or a self-produced scene — never someone else’s film without written permission.',
              },
              {
                id: 'step-2',
                title: 'Set the Self-Tape Kit',
                description:
                  'Standardize your phone or camera, tripod, light, clean audio, neutral background, and reader setup.',
                status: 'Pending',
                aiGuidance:
                  'A reliable self-tape beats a perfect one you cannot repeat. Test framing, sound, and file naming before a casting request arrives.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Industry Access',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Build Casting Profiles',
                description:
                  'Create accurate profiles on IMDbPro and a casting site, with matching credits, headshots, and reel links.',
                status: 'Pending',
                aiGuidance:
                  'Compare IMDbPro, Actors Access, and Backstage for your market. Keep every credit truthful and consistent — casting verifies it.',
              },
              {
                id: 'step-4',
                title: 'Map Union and Representation',
                description:
                  'Read union eligibility rules and build a short, targeted list of agents or managers who work your type.',
                status: 'Pending',
                aiGuidance:
                  'Start at sagaftra.org for eligibility and contract rules. Avoid any representative who guarantees work or charges a large upfront fee.',
              },
            ],
          },
          {
            id: 'stg-3',
            name: 'On-Set Business',
            status: 'Locked',
            steps: [
              {
                id: 'step-5',
                title: 'Paper the Booking',
                description:
                  'Confirm rate, dates, credit, usage, cancellation, and who owns the footage before you arrive.',
                status: 'Pending',
                aiGuidance:
                  'A booking text is not a contract. Put the deal points in writing and keep a copy with the call sheet.',
              },
              {
                id: 'step-6',
                title: 'Deliver and Archive',
                description:
                  'Complete the shoot, collect approved footage for your reel, and update your credits and portfolio.',
                status: 'Pending',
                aiGuidance:
                  'Ask for footage rights in advance. Archive the call sheet, contract, and final cut so the credit is easy to verify later.',
              },
            ],
          },
        ];

      case 'Publishing':
        return [
          {
            id: 'stg-1',
            name: 'Manuscript Ready',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Finish the Core Draft',
                description:
                  'Complete the manuscript or a detailed outline, then get structural feedback from trusted readers.',
                status: 'Pending',
                aiGuidance:
                  'A finished, edited sample is more useful than a perfect outline. Write the chapter you would read aloud at a show.',
              },
              {
                id: 'step-2',
                title: 'Protect the Work',
                description:
                  'Keep dated drafts, register the copyright where applicable, and document any collaborators.',
                status: 'Pending',
                aiGuidance:
                  'Registration is not the same as a publisher. Check your local copyright office and keep proof of authorship before sharing full files.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Publishing Route',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Choose the Route',
                description:
                  'Compare traditional querying with independent publishing on rights, royalties, timeline, and control.',
                status: 'Pending',
                aiGuidance:
                  'QueryTracker can organize agent research, while the Alliance of Independent Authors covers the independent route. Do not pay a publisher to read your book.',
              },
              {
                id: 'step-4',
                title: 'Package the Edition',
                description:
                  'Prepare the cover, ISBN, description, categories, and print or ebook files for your chosen route.',
                status: 'Pending',
                aiGuidance:
                  'Compare Amazon KDP, IngramSpark, and Draft2Digital before committing. In the U.S., buy your own ISBN through the official Bowker agency if you are the publisher.',
              },
            ],
          },
          {
            id: 'stg-3',
            name: 'Launch and Rights',
            status: 'Locked',
            steps: [
              {
                id: 'step-5',
                title: 'Launch to Your Audience',
                description:
                  'Plan preorders, advance readers, a launch page, and a direct email or fan-list announcement.',
                status: 'Pending',
                aiGuidance:
                  'Your existing fans are the first market. Tie the book to a release, live show, or podcast episode instead of buying a generic launch list.',
              },
              {
                id: 'step-6',
                title: 'Map Subsidiary Rights',
                description:
                  'Decide who controls audiobook, translation, serial, and screen rights, and record the terms.',
                status: 'Pending',
                aiGuidance:
                  'Do not give away audiobook or screen rights by default. Get contract review before signing an exclusive publishing deal.',
              },
            ],
          },
        ];

      case 'Brand Deals':
        return [
          {
            id: 'stg-1',
            name: 'Proof and Positioning',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Build a Verified Media Kit',
                description:
                  'Assemble actual audience data, past campaign results, audience fit, and examples of your creative work.',
                status: 'Pending',
                aiGuidance:
                  'Use screenshots and platform exports you can verify. Never present projected reach or bought followers as audience evidence.',
              },
              {
                id: 'step-2',
                title: 'Set Your Boundaries',
                description:
                  'List categories you will not promote, exclusivity limits, usage limits, and the minimum rate you can accept.',
                status: 'Pending',
                aiGuidance:
                  'Decide before the pitch. A clear boundary protects your audience and makes negotiation faster.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Deal Terms',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Pitch the Fit',
                description:
                  'Send a short, specific pitch with the audience match, deliverables, timing, and a measurable outcome.',
                status: 'Pending',
                aiGuidance:
                  'Lead with why the brand fits your audience, not a generic follower count. Offer two clear packages instead of a long menu.',
              },
              {
                id: 'step-4',
                title: 'Review the Contract',
                description:
                  'Check deliverables, approval, exclusivity, usage rights, payment schedule, and disclosure obligations.',
                status: 'Pending',
                aiGuidance:
                  'Read the FTC Endorsement Guides and Disclosures 101 before posting. Perpetual usage, broad exclusivity, and unpaid revisions are negotiation points, not defaults.',
              },
            ],
          },
          {
            id: 'stg-3',
            name: 'Deliver and Report',
            status: 'Locked',
            steps: [
              {
                id: 'step-5',
                title: 'Produce with Disclosure',
                description:
                  'Deliver the approved assets with a clear, unavoidable paid-partnership disclosure.',
                status: 'Pending',
                aiGuidance:
                  'Use the platform’s paid-partnership label and a plain-language disclosure in the post itself. A hashtag buried among thirty others is not clear disclosure.',
              },
              {
                id: 'step-6',
                title: 'Report and Invoice',
                description:
                  'Send the agreed screenshots or insights, invoice on time, and archive the final terms and assets.',
                status: 'Pending',
                aiGuidance:
                  'Report only the metrics the campaign actually produced. Save the contract, invoices, and delivery proof for your records.',
              },
            ],
          },
        ];

      case 'Podcasting':
        return [
          {
            id: 'stg-1',
            name: 'Show Design',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Define the Show Promise',
                description:
                  'Name the audience, episode format, length, cadence, and the reason someone returns every week.',
                status: 'Pending',
                aiGuidance:
                  'Audio is a habit. Bank three episodes before launch so the show does not disappear after the first week.',
              },
              {
                id: 'step-2',
                title: 'Build the Show Kit',
                description:
                  'Create cover art, a trailer, a show description, and a consistent intro and outro.',
                status: 'Pending',
                aiGuidance:
                  'Keep the cover readable at thumbnail size and make the trailer a complete 60–90 second story, not a list of guests.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Produce and Publish',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Record a Repeatable Episode',
                description:
                  'Set up local or remote recording, backup tracks, transcript workflow, and a release checklist.',
                status: 'Pending',
                aiGuidance:
                  'Record a local backup even when the platform records remotely. Clean speech and a repeatable edit template matter more than an expensive microphone.',
              },
              {
                id: 'step-4',
                title: 'Own the RSS Feed',
                description:
                  'Publish through a host that gives you a valid RSS feed, then submit the show to the major directories.',
                status: 'Pending',
                aiGuidance:
                  'Spotify for Creators and Apple Podcasts for Creators both accept RSS feeds. Keep the feed URL and episode files exportable so the show can move with you.',
              },
            ],
          },
          {
            id: 'stg-3',
            name: 'Grow and Monetize',
            status: 'Locked',
            steps: [
              {
                id: 'step-5',
                title: 'Build the Audience Loop',
                description:
                  'Use guest swaps, short clips, an email list, and live episode recordings to bring listeners back.',
                status: 'Pending',
                aiGuidance:
                  'Turn every episode into one clip, one email, and one invitation. Do not rely on a single directory to distribute for you.',
              },
              {
                id: 'step-6',
                title: 'Choose a Revenue Model',
                description:
                  'Compare sponsorships, memberships, live shows, and paid bonus episodes using real audience evidence.',
                status: 'Pending',
                aiGuidance:
                  'Price from actual downloads and audience engagement, not a projected listener count. Disclose paid reads and keep sponsor terms in writing.',
              },
            ],
          },
        ];

      case 'Live Experiences':
        return [
          {
            id: 'stg-1',
            name: 'Show Package',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Build the EPK',
                description:
                  'Collect a short bio, performance photos, live video, press quotes, stage plot, and tech rider.',
                status: 'Pending',
                aiGuidance:
                  'Promoters need to picture the show in ten seconds. Lead with live video and a clear draw story, not a full discography.',
              },
              {
                id: 'step-2',
                title: 'Design the Set',
                description:
                  'Build a 30, 45, or 60-minute set with transitions, a closer, and a plan for encores or technical issues.',
                status: 'Pending',
                aiGuidance:
                  'Rehearse the show without backing tracks once. If the laptop dies, the performance still needs to work.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Booking and Terms',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Pitch Real Rooms',
                description:
                  'Build a targeted venue and promoter list with a personalized pitch, links, and evidence of local draw.',
                status: 'Pending',
                aiGuidance:
                  'Use Bandsintown for Artists to organize dates and fan demand, and only claim draw you can document from past shows or ticket data.',
              },
              {
                id: 'step-4',
                title: 'Agree the Deal',
                description:
                  'Put guarantee or door split, deposit, hospitality, cancellation, curfew, and settlement terms in writing.',
                status: 'Pending',
                aiGuidance:
                  'A sold-out room means nothing if the settlement is unclear. Confirm who counts the door and when you get paid before announcing.',
              },
            ],
          },
          {
            id: 'stg-3',
            name: 'Show Day',
            status: 'Locked',
            steps: [
              {
                id: 'step-5',
                title: 'Advance the Date',
                description:
                  'Confirm load-in, soundcheck, parking, merch setup, guest list, and the content capture plan.',
                status: 'Pending',
                aiGuidance:
                  'Send the tech rider and stage plot a week ahead. Assign one person to capture photo and video so the show becomes next season’s evidence.',
              },
              {
                id: 'step-6',
                title: 'Settle and Follow Up',
                description:
                  'Collect payment, reconcile expenses, archive footage, thank the room, and pitch the next market.',
                status: 'Pending',
                aiGuidance:
                  'Update your draw notes immediately after the show. The next promoter will ask what the room actually did.',
              },
            ],
          },
        ];

      case 'Sync Licensing':
        return [
          {
            id: 'stg-1',
            name: 'Sync-Ready Assets',
            status: 'In Progress',
            steps: [
              {
                id: 'step-1',
                title: 'Prepare the Versions',
                description:
                  'Create instrumentals, clean edits, 30- and 60-second cuts, and stems for each priority track.',
                status: 'Pending',
                aiGuidance:
                  'A supervisor should not have to email you for an instrumental. Deliver the full set in one organized folder with consistent file names.',
              },
              {
                id: 'step-2',
                title: 'Clear the Rights',
                description:
                  'Confirm one-stop control or identify every rights holder, and collect signed split sheets and sample clearances.',
                status: 'Pending',
                aiGuidance:
                  'If you cannot clear a sample, prepare an alternate version. A great track with an uncleared loop is not licensable.',
              },
            ],
          },
          {
            id: 'stg-2',
            name: 'Catalog and Pitch',
            status: 'Locked',
            steps: [
              {
                id: 'step-3',
                title: 'Make the Catalog Searchable',
                description:
                  'Tag each track with mood, tempo, key, instrumentation, vocals, and clean or explicit status.',
                status: 'Pending',
                aiGuidance:
                  'Describe the feeling and the arrangement, not just the genre. Supervisors search for “tense minimal pulse,” not “my new single.”',
              },
              {
                id: 'step-4',
                title: 'Pitch Specific Briefs',
                description:
                  'Build a supervisor and library target list and track every submission against the brief it answers.',
                status: 'Pending',
                aiGuidance:
                  'Start with the Guild of Music Supervisors to understand the role, then compare libraries such as Musicbed or Songtradr on exclusivity and commission terms.',
              },
            ],
          },
          {
            id: 'stg-3',
            name: 'License and Deliver',
            status: 'Locked',
            steps: [
              {
                id: 'step-5',
                title: 'Negotiate the License',
                description:
                  'Confirm fee, term, territory, media, exclusivity, credit, and whether the license covers trailers or advertising.',
                status: 'Pending',
                aiGuidance:
                  'A low fee can still be a win, but only if the usage is defined. Do not grant perpetual worldwide rights by accident.',
              },
              {
                id: 'step-6',
                title: 'Deliver the Package',
                description:
                  'Send the licensed master, stems, cue sheet, invoice, and signed confirmation, then archive the deal.',
                status: 'Pending',
                aiGuidance:
                  'Deliver exactly the sample rate and stems the license names. Keep the cue sheet and contract together for royalty tracking.',
              },
            ],
          },
        ];

      default:
        return [];
    }
  }
}
