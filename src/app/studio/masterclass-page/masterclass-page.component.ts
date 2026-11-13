import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  StudioGuideComponent,
  type GuideStateChange,
} from '../studio-guide/studio-guide.component';
import {
  guideDeepLinkParams,
  parseGuideDeepLink,
  type GuideTab,
} from '../studio-guide/studio-guide-deep-link';
import type { GuideTrackId } from '../studio-guide/studio-guide.data';
import type { StudioSurfaceId } from '../studio-surfaces';

/**
 * The Masterclass as a routed workspace.
 *
 * The curriculum lives in `StudioGuideComponent`, so the overlay and this page
 * cannot drift. This shell owns only URL state and the handoff back to the real
 * Studio surfaces.
 */
@Component({
  selector: 'app-masterclass-page',
  standalone: true,
  imports: [CommonModule, StudioGuideComponent],
  templateUrl: './masterclass-page.component.html',
  styleUrls: ['./masterclass-page.component.css'],
})
export class MasterclassPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly tab = signal<GuideTab>('learn');
  readonly track = signal<GuideTrackId>('first-loop');
  readonly lesson = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const state = parseGuideDeepLink(
          params.get('guide'),
          params.get('lesson')
        );
        if (!state) {
          // No request, or an invalid one: open the first path cleanly rather
          // than leaving stale state from the previous URL.
          this.tab.set('learn');
          this.track.set('first-loop');
          this.lesson.set(null);
          return;
        }
        this.tab.set(state.tab);
        this.track.set(state.track);
        this.lesson.set(state.lessonId);
      });
  }

  onStateChange(state: GuideStateChange): void {
    this.tab.set(state.tab);
    this.track.set(state.track);
    this.lesson.set(state.lessonId);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: guideDeepLinkParams(state.tab, state.track, state.lessonId),
      replaceUrl: true,
    });
  }

  backToStudio(): void {
    void this.router.navigate(['/studio']);
  }

  openStudioSurface(surface: StudioSurfaceId): void {
    void this.router.navigate(['/studio'], {
      queryParams: { view: surface },
    });
  }

  /** Whole-application lessons open their real workspace route. */
  openWorkspace(path: string): void {
    void this.router.navigate([path]);
  }

  /** Academy program picks open the Academy pre-selected to that program. */
  openAcademyProgram(programId: string): void {
    void this.router.navigate(['/academy'], {
      queryParams: { program: programId },
    });
  }

  /** The overlay's starter action; the page still lands in the real Studio. */
  openStudioQuickStart(): void {
    void this.router.navigate(['/studio'], {
      queryParams: { view: 'quick-session' },
    });
  }
}
