import { Injectable, computed, inject } from '@angular/core';
import {
  ArtistLifecycleMove,
  ArtistLifecycleSnapshot,
  LIFECYCLE_PHASE_LABEL,
} from '../types/artist-lifecycle.types';
import {
  ArtistToolkitService,
  parseIsoDay,
  toIsoDay,
} from './artist-toolkit.service';

export interface NextBestMoveQueueItem {
  id: string;
  source: 'pathway' | 'release' | 'rights';
  sourceLabel: string;
  phase: string;
  title: string;
  detail: string;
  meta: string;
  actionLabel: string;
  queryParams?: { tab: 'blueprint' | 'rights' };
  /** The toolkit record this queue item can mark complete. */
  toolkitId?: string;
}

/**
 * One ranked queue for every surface that wants to show what comes next.
 *
 * The pathway move always leads. The toolkit's next two release milestones and
 * next two rights tasks then interleave by priority, with any remaining
 * supporting pathway moves filling the last slots. Both the Hub and the mobile
 * workspace tray read this service, so they cannot disagree about the order.
 */
@Injectable({ providedIn: 'root' })
export class NextBestMoveQueueService {
  private readonly toolkit = inject(ArtistToolkitService);

  readonly toolkitSummary = computed(() => {
    const release = this.toolkit.blueprintProgress();
    const rights = this.toolkit.rightsCompletion();
    return `${release.done}/${release.total} release milestones · ${rights.done}/${rights.total} rights steps complete`;
  });

  build(snapshot: ArtistLifecycleSnapshot): NextBestMoveQueueItem[] {
    const queue: NextBestMoveQueueItem[] = [];
    if (snapshot.nextBestMove) {
      queue.push(this.lifecycleItem(snapshot.nextBestMove));
    }
    queue.push(...this.toolkitMoves());

    for (const supporting of snapshot.supportingMoves) {
      if (queue.length >= 5) break;
      queue.push(this.lifecycleItem(supporting));
    }
    return queue.slice(0, 5);
  }

  complete(move: NextBestMoveQueueItem): void {
    if (!move.toolkitId) return;
    if (move.source === 'release') {
      this.toolkit.toggleMilestone(move.toolkitId);
    } else if (move.source === 'rights') {
      this.toolkit.toggleRightsTask(move.toolkitId);
    }
  }

  private toolkitMoves(): NextBestMoveQueueItem[] {
    const today = toIsoDay(new Date());
    const releases = this.toolkit
      .blueprint()
      .milestones.filter((milestone) => !milestone.done)
      .slice(0, 2)
      .map(
        (milestone): NextBestMoveQueueItem => ({
          id: `release:${milestone.id}`,
          source: 'release',
          sourceLabel: 'Release',
          phase: milestone.phase,
          title: milestone.title,
          detail: milestone.detail,
          meta: `Due ${this.formatQueueDay(milestone.dueDate)}${
            milestone.dueDate && milestone.dueDate < today ? ' · overdue' : ''
          }`,
          actionLabel: 'Open blueprint',
          queryParams: { tab: 'blueprint' },
          toolkitId: milestone.id,
        })
      );

    const rights = this.toolkit
      .rightsTasks.filter((task) => !this.toolkit.isRightsTaskDone(task.id))
      .slice(0, 2)
      .map(
        (task): NextBestMoveQueueItem => ({
          id: `rights:${task.id}`,
          source: 'rights',
          sourceLabel: 'Rights',
          phase: task.category,
          title: task.title,
          detail: task.detail,
          meta: 'Rights checklist',
          actionLabel: 'Open checklist',
          queryParams: { tab: 'rights' },
          toolkitId: task.id,
        })
      );

    const interleaved: NextBestMoveQueueItem[] = [];
    const max = Math.max(releases.length, rights.length);
    for (let index = 0; index < max; index++) {
      if (releases[index]) interleaved.push(releases[index]);
      if (rights[index]) interleaved.push(rights[index]);
    }
    return interleaved;
  }

  private lifecycleItem(move: ArtistLifecycleMove): NextBestMoveQueueItem {
    return {
      id: `pathway:${move.id}`,
      source: 'pathway',
      sourceLabel: 'Pathway',
      phase: LIFECYCLE_PHASE_LABEL[move.phase],
      title: move.title,
      detail: move.why,
      meta: 'Artist pathway',
      actionLabel: 'Open pathway',
    };
  }

  private formatQueueDay(isoDay: string): string {
    const date = parseIsoDay(isoDay);
    if (!date) return 'date not set';
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
}
