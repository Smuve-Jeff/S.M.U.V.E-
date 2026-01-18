import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CollaborationService, SessionEvent } from '../services/collaboration.service';
import { UserProfileService } from '../services/user-profile.service';
import { AuthUser } from '../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-collaboration-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collaboration-hub.component.html',
  styleUrls: ['./collaboration-hub.component.css']
})
export class CollaborationHubComponent implements OnInit, OnDestroy {
  readonly collaborationService = inject(CollaborationService);
  readonly userProfileService = inject(UserProfileService);

  currentUser: AuthUser | null = null;
  sessionIdToJoin = '';
  private userSubscription!: Subscription;

  ngOnInit(): void {
    this.userSubscription = this.userProfileService.currentUser.subscribe(user => {
      this.currentUser = user;
    });
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }

  startSession(): void {
    if (this.currentUser) {
      // In a real app, the project state would be the actual DAW session data
      const initialProjectState = { tempo: 120, tracks: [] }; 
      const sessionId = this.collaborationService.startSession(this.currentUser, initialProjectState);
      console.log(`Started new collaboration session with ID: ${sessionId}`);
    }
  }

  joinSession(): void {
    if (this.currentUser && this.sessionIdToJoin) {
      this.collaborationService.joinSession(this.sessionIdToJoin, this.currentUser);
    }
  }

  leaveSession(): void {
    this.collaborationService.leaveSession();
  }
  
  // Helper to get a user-friendly name for the event type
  getEventIcon(type: SessionEvent['type']): string {
    switch (type) {
      case 'start': return '🚀';
      case 'join': return '👋';
      case 'leave': return '🚪';
      case 'update': return '🔄';
      default: return '🔔';
    }
  }
}
