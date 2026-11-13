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

interface ExpansionResource {
  label: string;
  url: string;
}

interface ExpansionLane {
  type: BusinessPipelineType;
  label: string;
  kicker: string;
  icon: string;
  description: string;
  assets: string[];
  firstMove: string;
  resources: ExpansionResource[];
}

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

  /**
   * Expansion lanes turn a music catalog into a portfolio of adjacent work.
   * Each lane packages assets the artist can evidence, not projected reach or
   * income, and hands off to the same persisted business-pipeline engine.
   */
  expansionLanes: ExpansionLane[] = [
    {
      type: 'Film & TV',
      label: 'Film & TV',
      kicker: 'ACTING · DIRECTING · SCORING',
      icon: 'movie',
      description:
        'Move performance and story onto screen: acting, directing, scoring, or self-produced video.',
      assets: [
        'A 60–90 second screen reel',
        'Headshots and a reliable self-tape setup',
        'An accurate credits and representation list',
      ],
      firstMove:
        'Cut a tight reel from footage you have rights to use, then put the same credits on IMDbPro and a casting profile.',
      resources: [
        { label: 'SAG-AFTRA', url: 'https://www.sagaftra.org/' },
        { label: 'IMDbPro', url: 'https://pro.imdb.com/' },
        { label: 'Actors Access', url: 'https://actorsaccess.com/' },
        { label: 'Backstage', url: 'https://www.backstage.com/' },
      ],
    },
    {
      type: 'Publishing',
      label: 'Books & Publishing',
      kicker: 'AUTHOR · EDITOR · PUBLISHER',
      icon: 'menu_book',
      description:
        'Turn lyrics, lore, and lived expertise into books, workbooks, essays, or audiobooks.',
      assets: [
        'A finished manuscript or detailed outline',
        'A sample chapter, synopsis, and author bio',
        'A cover, ISBN, and metadata plan',
      ],
      firstMove:
        'Write one chapter that can stand alone, then compare traditional querying with independent publishing before buying an ISBN or cover.',
      resources: [
        {
          label: 'Alliance of Independent Authors',
          url: 'https://www.allianceindependentauthors.org/',
        },
        { label: 'Amazon KDP', url: 'https://kdp.amazon.com/' },
        { label: 'IngramSpark', url: 'https://www.ingramspark.com/' },
        {
          label: 'U.S. ISBN Agency',
          url: 'https://www.myidentifiers.com/',
        },
        { label: 'QueryTracker', url: 'https://querytracker.net/' },
      ],
    },
    {
      type: 'Brand Deals',
      label: 'Brand Deals',
      kicker: 'PARTNERSHIPS · ENDORSEMENTS',
      icon: 'handshake',
      description:
        'Convert a real audience into paid partnerships, with clear deliverables, usage rights, and disclosure.',
      assets: [
        'A media kit built from verified audience data',
        'A deliverables list and rate floor',
        'Disclosure-ready creative and approval workflow',
      ],
      firstMove:
        'Build a one-page media kit from screenshots you can verify, then write down the categories and exclusivity you will not accept.',
      resources: [
        {
          label: 'FTC Endorsement Guides',
          url: 'https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking',
        },
        {
          label: 'FTC Disclosures 101',
          url: 'https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers',
        },
        { label: 'SAG-AFTRA', url: 'https://www.sagaftra.org/' },
      ],
    },
    {
      type: 'Podcasting',
      label: 'Podcasting',
      kicker: 'HOST · PRODUCER · PUBLISHER',
      icon: 'podcasts',
      description:
        'Host an owned audio show that gives fans a reason to return between releases and live dates.',
      assets: [
        'A repeatable episode format and show promise',
        'Cover art, a trailer, and a valid RSS feed',
        'At least three banked episodes',
      ],
      firstMove:
        'Record a trailer and one full episode before choosing a host; the RSS feed, not the platform, is the asset you own.',
      resources: [
        {
          label: 'Spotify for Creators',
          url: 'https://creators.spotify.com/',
        },
        {
          label: 'Apple Podcasts for Creators',
          url: 'https://podcasters.apple.com/',
        },
        { label: 'Podcast Index', url: 'https://podcastindex.org/' },
      ],
    },
    {
      type: 'Live Experiences',
      label: 'Live Experiences',
      kicker: 'PERFORMANCE · HOSTING · TOURING',
      icon: 'stadium',
      description:
        'Build a repeatable show package for venues, promoters, festivals, and independent dates.',
      assets: [
        'An EPK with live video and performance photos',
        'A stage plot, tech rider, and set list',
        'Draw evidence and clear settlement terms',
      ],
      firstMove:
        'Film one full set with clean audio, then package the strongest three songs with a stage plot and a short promoter pitch.',
      resources: [
        {
          label: 'Bandsintown for Artists',
          url: 'https://www.bandsintown.com/for-artists',
        },
        { label: 'Eventbrite', url: 'https://www.eventbrite.com/' },
      ],
    },
    {
      type: 'Sync Licensing',
      label: 'Sync Licensing',
      kicker: 'FILM · TV · GAMES · ADS',
      icon: 'library_music',
      description:
        'Package cleared instrumentals, edits, and stems so a music supervisor can license the catalog without a chase.',
      assets: [
        'Instrumentals, clean edits, and stems',
        'One-stop clearance and signed split sheets',
        'Searchable mood, tempo, and instrumentation metadata',
      ],
      firstMove:
        'Pick five strongest tracks and make each one sync-ready: instrumental, clean edit, 30-second cut, stems, and complete metadata.',
      resources: [
        {
          label: 'Guild of Music Supervisors',
          url: 'https://www.guildofmusicsupervisors.com/',
        },
        { label: 'Musicbed', url: 'https://www.musicbed.com/' },
        { label: 'Songtradr', url: 'https://www.songtradr.com/' },
      ],
    },
  ];

  selectedExpansion = signal<BusinessPipelineType>('Film & TV');

  selectedExpansionLane = computed(
    () =>
      this.expansionLanes.find(
        (lane) => lane.type === this.selectedExpansion()
      ) ?? this.expansionLanes[0]
  );

  selectExpansion(type: BusinessPipelineType): void {
    this.selectedExpansion.set(type);
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
