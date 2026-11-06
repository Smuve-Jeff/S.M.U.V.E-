import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { NotificationService } from '../../services/notification.service';
import { SessionSafetyService } from '../../services/session-safety.service';
import { UIService } from '../../services/ui.service';
import { MainViewMode } from '../../services/user-context.service';
import { WorkspaceConfig } from '../../services/workspace-registry';
import {
  GUEST_AI_LOCK_NOTICE,
  isGuestRouteAllowed,
  primaryRouteSegment,
} from '../../services/guest-access';

/**
 * Guest clearance landing page.
 *
 * The single place that explains what a guest session can and cannot open.
 * It is also where the route guard sends a guest who requests an account-only
 * surface, so a blocked navigation always turns into an explanation and an
 * upgrade path rather than a silent bounce.
 */
@Component({
  selector: 'app-guest-access',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guest-access.component.html',
  styleUrls: ['./guest-access.component.css'],
})
export class GuestAccessComponent {
  private authService = inject(AuthService);
  private uiService = inject(UIService);
  private dialog = inject(InteractionDialogService);
  private notificationService = inject(NotificationService);
  private sessionSafety = inject(SessionSafetyService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly guest = this.authService.currentUser;
  readonly isGuest = this.authService.isGuest;
  /** The restricted URL the guard refused, when the guest arrived by redirect. */
  readonly requestedUrl = signal<string>('');
  /** Guests get no AI, and the page has to say so before they hunt for it. */
  readonly aiLockNotice = GUEST_AI_LOCK_NOTICE;

  /**
   * What an account actually adds, at capability level.
   *
   * The workspace registry below answers "which rooms"; this answers "which
   * abilities", because a visitor comparing clearance cares about the AI, the
   * release desk and the vault — not about the names of the routes that host
   * them. AI rows are flagged so the page keeps its one promise: no AI in guest
   * clearance.
   */
  readonly unlocks: ReadonlyArray<{
    icon: string;
    label: string;
    detail: string;
    ai?: boolean;
  }> = [
    {
      icon: 'auto_awesome',
      label: 'S.M.U.V.E. AI Assistant',
      detail:
        'Analysis, coaching, critique and next moves in every room of the app.',
      ai: true,
    },
    {
      icon: 'graphic_eq',
      label: 'AI Session Musicians',
      detail:
        'Neural drummer, bassist and keyboardist improvising over your arrangement.',
      ai: true,
    },
    {
      icon: 'image',
      label: 'Concept Art',
      detail: 'Release and campaign artwork generated from your direction.',
      ai: true,
    },
    {
      icon: 'rocket_launch',
      label: 'Release & Rollout',
      detail:
        'Release plans, ordering, metadata and delivery tracked in one pipeline.',
    },
    {
      icon: 'gavel',
      label: 'Business & Legal Desk',
      detail:
        'Splits, contracts, pricing and revenue strategy with your catalogue in context.',
    },
    {
      icon: 'cloud_done',
      label: 'Vault & Continuity',
      detail:
        'Projects, profile and artist intelligence saved to your account instead of one tab.',
    },
  ];

  private readonly workspaces = computed<WorkspaceConfig[]>(() =>
    this.uiService
      .getViewConfigs()
      .map((view) => this.uiService.getViewConfig(view.mode))
      .filter((view): view is WorkspaceConfig => Boolean(view))
  );

  readonly available = computed(() =>
    this.workspaces().filter(
      (view) =>
        view.mode !== 'hub' && isGuestRouteAllowed(view.routePath)
    )
  );

  readonly locked = computed(() =>
    this.workspaces().filter((view) => !isGuestRouteAllowed(view.routePath))
  );

  /** Label of the refused surface, for the "X needs an account" notice. */
  readonly blockedLabel = computed(() => {
    const segment = primaryRouteSegment(this.requestedUrl());
    if (!segment) return '';
    const known = this.uiService.getViewConfig(segment as MainViewMode)?.label;
    return (
      known ??
      segment
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    );
  });

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.requestedUrl.set(params.get('from') || '');
      });
  }

  open(view: WorkspaceConfig): void {
    this.uiService.navigateToView(view.mode);
  }

  createAccount(): void {
    void this.router.navigate(['/login'], {
      queryParams: { mode: 'register' },
    });
  }

  signIn(): void {
    void this.router.navigate(['/login']);
  }

  openHub(): void {
    void this.router.navigateByUrl('/hub');
  }

  async exitGuestSession(): Promise<void> {
    const risk = this.sessionSafety.exitRisk();
    if (risk) {
      // Guests cannot save at all, so a downloaded .smuve bundle is their only
      // way to keep the set. A half-written live take is not exportable.
      const canExport =
        this.sessionSafety.hasUnsavedChanges() &&
        !this.sessionSafety.isRecording() &&
        !this.sessionSafety.isProjectSaving();

      if (!canExport) {
        const proceed = await this.dialog.confirm({
          title: 'Exit guest session?',
          message: `${risk} Guest sets are never saved to an account — export a backup before leaving.`,
          confirmLabel: 'Exit anyway',
          cancelLabel: 'Keep working',
          tone: 'danger',
        });
        if (!proceed) return;
      } else {
        const choice = await this.dialog.confirmWithAlternate({
          title: 'Exit guest session?',
          message: `${risk} Export a backup before leaving? Guest sets are never saved to an account.`,
          confirmLabel: 'Export backup & exit',
          alternateLabel: 'Exit without export',
          cancelLabel: 'Keep working',
          tone: 'danger',
        });
        if (choice === 'cancel') return;
        if (choice === 'confirm') {
          const result = this.sessionSafety.exportBackup();
          if (!result.ok) {
            this.notificationService.show(
              result.message ??
                'This set could not be exported. You are still in the guest session.',
              'error',
            );
            return;
          }
        }
      }
    }
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}
