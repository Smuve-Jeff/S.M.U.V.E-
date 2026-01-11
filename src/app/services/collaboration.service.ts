import { Injectable, signal } from '@angular/core';
import { WebsocketService } from './websocket.service';
import { UserProfile } from './user-profile.service';

export interface CollaborationSession {
  sessionId: string;
  host: UserProfile;
  participants: UserProfile[];
  projectState: any; // This will hold the entire project's state
}

@Injectable({
  providedIn: 'root'
})
export class CollaborationService {
  private session = signal<CollaborationSession | null>(null);
  public currentSession = this.session.asReadonly();

  constructor(private websocketService: WebsocketService) {
    this.websocketService.getMessages().subscribe(message => {
      // Handle incoming collaborative messages
      this.handleIncomingAction(message);
    });
  }

  // Method to start a new session
  startSession(host: UserProfile, project: any) {
    const sessionId = this.generateSessionId();
    const newSession: CollaborationSession = {
      sessionId,
      host,
      participants: [host],
      projectState: project
    };
    this.session.set(newSession);
    this.websocketService.sendMessage({ type: 'session_start', payload: newSession });
  }

  // Method to join an existing session
  joinSession(sessionId: string, user: UserProfile) {
    this.websocketService.sendMessage({ type: 'session_join', payload: { sessionId, user } });
  }

  // Method to leave the session
  leaveSession(sessionId: string, userId: string) {
    this.websocketService.sendMessage({ type: 'session_leave', payload: { sessionId, userId } });
    this.session.set(null);
  }

  // Send an action to other collaborators
  sendAction(action: any) {
    const currentSession = this.session();
    if (currentSession) {
      this.websocketService.sendMessage({
        type: 'project_action',
        payload: { 
          sessionId: currentSession.sessionId,
          action 
        }
      });
    }
  }

  private handleIncomingAction(message: any) {
    switch (message.type) {
      case 'session_joined':
        this.session.update(s => s ? ({ ...s, participants: [...s.participants, message.payload.user] }) : s);
        break;
      case 'session_left':
        this.session.update(s => s ? ({ ...s, participants: s.participants.filter(p => p.id !== message.payload.userId) }) : s);
        break;
      case 'project_state_update':
        this.session.update(s => s ? ({ ...s, projectState: message.payload }) : s);
        break;
      case 'project_action':
        // Here we would apply the incoming action to our local project state
        // This is where the core logic for state synchronization will go
        console.log('Received action:', message.payload.action);
        break;
    }
  }

  private generateSessionId(): string {
    return `collab_${Math.random().toString(36).substr(2, 9)}`;
  }
}
