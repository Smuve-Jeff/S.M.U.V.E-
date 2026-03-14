import { LoggingService } from './logging.service';
import { Injectable, signal, inject } from '@angular/core';
import { WebsocketService } from './websocket.service';
import { AuthUser } from './auth.service';

export interface CollaborationSession {
  sessionId: string;
  participants: AuthUser[];
  projectState: any;
}

@Injectable({
  providedIn: 'root',
})
export class CollaborationService {
  private logger = inject(LoggingService);
  private websocketService = inject(WebsocketService);

  currentSession = signal<CollaborationSession | null>(null);

  constructor() {}

  startSession(user: AuthUser, projectState: any): string {
    const sessionId = this.generateSessionId();
    const wsUrl = `wss://api.smuve.io/v4/collab/${sessionId}`;

    this.logger.system(`INITIALIZING COLLABORATION UPLINK: ${wsUrl}`);

    // In demo mode, we use a mock loopback if connection fails
    this.websocketService.connect(wsUrl);

    const session: CollaborationSession = {
      sessionId,
      participants: [user],
      projectState,
    };
    this.currentSession.set(session);

    this.websocketService.messages.next({
      action: 'start',
      payload: { user, projectState },
    } as any);

    return sessionId;
  }

  joinSession(sessionId: string, user: AuthUser): void {
    const wsUrl = `wss://api.smuve.io/v4/collab/${sessionId}`;
    this.logger.system(`JOINING EXTERNAL SESSION: ${sessionId}`);

    this.websocketService.connect(wsUrl);
    this.websocketService.messages.next({
      action: 'join',
      payload: { user },
    } as any);
  }

  leaveSession(sessionId: string, userId: string): void {
    this.websocketService.messages.next({
      action: 'leave',
      payload: { userId },
    } as any);
    this.currentSession.set(null);
  }

  sendProjectUpdate(sessionId: string, projectState: any): void {
    this.websocketService.messages.next({
      action: 'update',
      payload: { projectState },
    } as any);
  }

  private generateSessionId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
