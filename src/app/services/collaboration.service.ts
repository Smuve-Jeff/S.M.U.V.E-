import { LoggingService } from './logging.service';
import { Injectable, signal, inject, effect } from '@angular/core';
import { AuthUser } from './auth.service';
import { MusicManagerService } from './music-manager.service';
    });

@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private logger = inject(LoggingService);
  private musicManager = inject(MusicManagerService);
    });

  currentSession = signal<any>(null);
  private isRemoteUpdate = false;

  constructor() {
    // Sync local changes to remote
    effect(() => {
        const session = this.currentSession();
        if (!session || this.isRemoteUpdate) return;

        const snapshot = this.musicManager.snapshotProject();
        this.social.sendPartyMessage(JSON.stringify({ type: 'PROJECT_SYNC', payload: snapshot }));
    });

    // Listen for remote changes via Social Service (Party messages)
    effect(() => {
        const msgs = this.social.roomMessages();
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.message.startsWith('{"type":"PROJECT_SYNC"')) {
            try {
                const data = JSON.parse(lastMsg.message);
                if (data.fromUserId !== this.social.currentPartyId()) { // Simple check
                   this.applyRemoteUpdate(data.payload);
                }
            } catch(e) {}
        }
    });
  }

  private applyRemoteUpdate(snapshot: any) {
    this.isRemoteUpdate = true;
    this.musicManager.loadProject(snapshot);
    setTimeout(() => this.isRemoteUpdate = false, 100);
  }

  async startSession(user: AuthUser, projectState: any): Promise<string> {
    const sessionId = this.generateSecureId();
    this.logger.system(`INITIALIZING COLLABORATION SESSION: ${sessionId}`);
    this.social.createParty('studio_' + sessionId);
    this.currentSession.set({ sessionId, participants: [user], projectState });
    return sessionId;
  }

  async joinSession(sessionId: string, user: AuthUser): Promise<void> {
    this.logger.system(`JOINING COLLABORATION SESSION: ${sessionId}`);
    this.social.joinParty(sessionId);
    this.currentSession.set({ sessionId, participants: [user] });
  }


  sendProjectUpdate(sessionId: string, projectState: any): void {
    const session = this.currentSession();
    if (session && session.sessionId === sessionId) {
      this.social.sendPartyMessage(JSON.stringify({ type: 'PROJECT_SYNC', payload: projectState }));
    }
  }

  leaveSession(): void {
    const session = this.currentSession();
    if (session) {
        this.social.leaveParty();
        this.currentSession.set(null);
        this.logger.system(`LEFT SESSION: ${session.sessionId}`);
    }
  }

  private generateSecureId(): string {
    return Math.random().toString(36).substring(7);
  }
}
