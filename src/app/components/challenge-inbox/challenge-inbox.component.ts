import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  ChallengeInboxService,
  ChallengeRecord,
  AppNotification,
} from '../../services/challenge-inbox.service';
import { SocialNetworkingService } from '../../services/social-networking.service';
import { UserProfileService } from '../../services/user-profile.service';
import { SnackbarService } from '../../services/snackbar.service';
import { TokenService } from '../../services/token.service';
import { APP_SECURITY_CONFIG } from '../../app.security';

type Tab = 'pending' | 'accepted' | 'declined' | 'all';

@Component({
  selector: 'app-challenge-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './challenge-inbox.component.html',
  styleUrls: ['./challenge-inbox.component.css'],
})
export class ChallengeInboxComponent implements OnInit, OnDestroy {
  inbox = inject(ChallengeInboxService);
  social = inject(SocialNetworkingService);
  profileService = inject(UserProfileService);
  snackbarService = inject(SnackbarService);
  tokenService = inject(TokenService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  activeTab = signal<Tab>('pending');
  loading = this.inbox.loading;

  tabs: { id: Tab; label: string }[] = [
    { id: 'pending', label: 'PENDING' },
    { id: 'accepted', label: 'ACCEPTED' },
    { id: 'declined', label: 'DECLINED' },
    { id: 'all', label: 'ALL' },
  ];

  filteredChallenges = computed<ChallengeRecord[]>(() => {
    const tab = this.activeTab();
    const me = this.profileService.profile().id;
    const all = this.inbox.challenges();
    const mine =
      tab === 'all'
        ? all
        : all.filter(
            (c) =>
              c.status === tab &&
              (c.toUserId === me || c.fromUserId === me)
          );
    if (tab === 'all') return mine.filter((c) => c.toUserId === me || c.fromUserId === me);
    return mine.sort((a, b) => b.timestamp - a.timestamp);
  });

  unreadCount = this.inbox.unreadCount;
  pendingCount = this.inbox.pendingCount;
  notifications = this.inbox.notifications;

  private subs: Subscription[] = [];
  private socketBound = false;

  async ngOnInit() {
    // Bind the socket so challenges can fire challenges via socket
    const socket: any = (this.social as any).socket;
    if (socket && !this.socketBound) {
      this.inbox.bindSocket(socket);
      this.socketBound = true;
    }

    // Listen for inbox + notification sync events from server (auto-delivered
    // on register_presence; or via request_inbox_sync).
    if (socket) {
      socket.on('challenge_inbox_sync', (records: ChallengeRecord[]) => {
        this.inbox.onChallengeInboxSync(records);
      });
      socket.on('notification_sync', (records: AppNotification[]) => {
        this.inbox.onNotificationSync(records);
      });
      socket.on('challenge_response', (resp: any) => {
        // Response confirmed for a challenge I sent; refresh
        this.inbox.loadInbox('all').catch(() => {});
        this.snackbarService.info(
          `CHALLENGE RESPONSE: ${resp.status?.toUpperCase() || 'UPDATE'}`
        );
      });
    }

    // Handle deep link: /inbox?challenge=true&gameId=...&from=...
    this.route.queryParamMap.subscribe((params) => {
      const challenge = params.get('challenge');
      if (challenge === 'true') {
        const gameId = params.get('gameId') || '';
        const fromName = params.get('fromName') || 'A rival';
        if (gameId) {
          this.snackbarService.info(
            `INCOMING CHALLENGE FROM ${fromName.toUpperCase()} // ${gameId.toUpperCase()}`
          );
        }
        this.activeTab.set('pending');
      }
    });

    await Promise.all([
      this.inbox.loadInbox('all'),
      this.inbox.loadNotifications(true),
    ]);
  }

  ngOnDestroy() {
    const socket: any = (this.social as any).socket;
    if (socket) {
      socket.off('challenge_inbox_sync');
      socket.off('notification_sync');
      socket.off('challenge_response');
    }
    this.subs.forEach((s) => s.unsubscribe());
  }

  setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  async accept(challenge: ChallengeRecord) {
    await this.inbox.respondToChallenge(challenge.id, 'accepted');
    this.snackbarService.success('CHALLENGE ACCEPTED');
  }

  async decline(challenge: ChallengeRecord) {
    await this.inbox.respondToChallenge(challenge.id, 'declined');
    this.snackbarService.info('CHALLENGE DECLINED');
  }

  async markRead(n: AppNotification) {
    if (n.read) return;
    await this.inbox.markNotificationRead(n.id);
  }

  async refreshAll() {
    await Promise.all([
      this.inbox.loadInbox('all'),
      this.inbox.loadNotifications(false),
    ]);
  }

  relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  isIncoming(c: ChallengeRecord): boolean {
    return c.toUserId === this.profileService.profile().id;
  }

  opponentName(c: ChallengeRecord): string {
    const me = this.profileService.profile().id;
    if (c.toUserId === me) return c.fromUserName || c.fromUserId;
    return c.toUserId;
  }

  formatGameName(gameId: string): string {
    return gameId.toUpperCase().replace(/-/g, ' ');
  }
}
