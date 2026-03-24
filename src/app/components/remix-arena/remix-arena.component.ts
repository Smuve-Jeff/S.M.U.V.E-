import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CollaborationService } from '../../services/collaboration.service';
import { StemControlsComponent } from '../../studio/stem-controls/stem-controls.component';
import { SampleLibraryComponent } from '../../studio/sample-library/sample-library.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { LibraryService } from '../../services/library.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-remix-arena',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StemControlsComponent,
    SampleLibraryComponent,
  ],
  templateUrl: './remix-arena.component.html',
  styleUrls: ['./remix-arena.component.scss'],
})
export class RemixArenaComponent implements OnInit {
  collaborationService = inject(CollaborationService);
  musicManager = inject(MusicManagerService);
  libraryService = inject(LibraryService);
  authService = inject(AuthService);

  code = signal(
    '// S.M.U.V.E 4.2 REMIX ENGINE\n// Start writing your logic here...\n\nfunction onBeat(step) {\n  if (step % 4 === 0) {\n    playKick();\n  }\n}'
  );

  messages = signal([
    {
      user: 'System',
      text: 'Welcome to Remix Arena! Collaboration is now LIVE.',
    },
    {
      user: 'SmuveBot',
      text: 'I am ready to help you mix. Try adding a baseline.',
    },
  ]);

  newMessage = signal('');
  sessionId = signal('');

  ngOnInit() {}

  async startSession() {
    const user = this.authService.currentUser();
    if (user) {
      const id = await this.collaborationService.startSession(user, {
        code: this.code(),
      });
      this.sessionId.set(id);
      this.messages.update((m) => [
        ...m,
        {
          user: 'System',
          text: `Session started: ${id}. Share with peers for P2P sync.`,
        },
      ]);
    }
  }

  async joinSession() {
    const user = this.authService.currentUser();
    const id = prompt('Enter Session ID:');
    if (user && id) {
      await this.collaborationService.joinSession(id, user);
      this.sessionId.set(id);
      this.messages.update((m) => [
        ...m,
        {
          user: 'System',
          text: `Joined session: ${id}. Establishing P2P link...`,
        },
      ]);
    }
  }

  onCodeChange(newCode: string) {
    this.code.set(newCode);
    if (this.sessionId()) {
      this.collaborationService.sendProjectUpdate(this.sessionId(), {
        code: newCode,
      });
    }
  }

  sendMessage() {
    if (!this.newMessage()) return;
    this.messages.update((m) => [
      ...m,
      { user: 'Me', text: this.newMessage() },
    ]);
    this.newMessage.set('');
  }

  remixTrack(track: any) {
    this.musicManager.selectedTrackId.set(track.id);
    this.messages.update((m) => [
      ...m,
      { user: 'System', text: 'Remixing ' + track.name + '...' },
    ]);
  }
}
