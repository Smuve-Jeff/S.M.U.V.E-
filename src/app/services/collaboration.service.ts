
import { Injectable, signal } from '@angular/core';
import { WebsocketService } from './websocket.service';
import { AuthUser } from './auth.service';

export interface CollaborationSession {
  sessionId: string;
  participants: AuthUser[];
  projectState: any; // This would be a structured object in a real app
}

@Injectable({
  providedIn: 'root'
})
export class CollaborationService {
  currentSession = signal<CollaborationSession | null>(null);

  constructor(private websocketService: WebsocketService) { }

  startSession(user: AuthUser, projectState: any): string {
    const sessionId = this.generateSessionId();
    this.websocketService.connect(`wss://your-backend.com/ws/collaboration/${sessionId}`);
    const session: CollaborationSession = { sessionId, participants: [user], projectState };
    this.currentSession.set(session);
    this.websocketService.messages.next({ action: 'start', payload: { user, projectState } } as any);
    return sessionId;
  }

  joinSession(sessionId: string, user: AuthUser): void {
    this.websocketService.connect(`wss://your-backend.com/ws/collaboration/${sessionId}`);
    this.websocketService.messages.next({ action: 'join', payload: { user } } as any);
    // In a real app, you'd wait for a confirmation message from the server
    // and then update the session state.
  }

  leaveSession(sessionId: string, userId: string): void {
    this.websocketService.messages.next({ action: 'leave', payload: { userId } } as any);
    this.currentSession.set(null);
    // The WebSocket connection would be closed by the server or by a disconnect method
  }

  sendProjectUpdate(sessionId: string, projectState: any): void {
    this.websocketService.messages.next({ action: 'update', payload: { projectState } } as any);
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
