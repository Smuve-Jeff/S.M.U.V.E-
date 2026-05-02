import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CollaborationService } from '../../services/collaboration.service';
import { StemControlsComponent } from '../../studio/stem-controls/stem-controls.component';
import { SampleLibraryComponent } from '../../studio/sample-library/sample-library.component';
import { MusicManagerService } from '../../services/music-manager.service';
import { LibraryService } from '../../services/library.service';
import { AuthService } from '../../services/auth.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { UIService } from '../../services/ui.service';

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
export class RemixArenaComponent implements OnInit, OnDestroy {
  collaborationService = inject(CollaborationService);
  musicManager = inject(MusicManagerService);
  libraryService = inject(LibraryService);
  authService = inject(AuthService);
  dialog = inject(InteractionDialogService);
  uiService = inject(UIService);

  code = signal(
    '// S.M.U.V.E 2.0 REMIX ENGINE\n// Start writing your logic here...\n\nfunction onBeat(step) {\n  if (step % 4 === 0) {\n    playKick();\n  }\n}'
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

  challenges = signal([
    { id: 'ch-1', title: 'Midnight Synth Wave', description: 'Create a 4-bar loop using only the Subtractive Synth.', prize: '500 XP' },
    { id: 'ch-2', title: 'Vocal Glitch Mastery', description: 'Remix the lead vocals with aggressive glitch textures.', prize: '1000 XP' }
  ]);

  ngOnInit() {}

  ngOnDestroy() {
    if (this.sessionId()) {
      this.collaborationService.leaveSession(this.sessionId());
    }
  }

  async startSession() {
    const user = this.authService.currentUser();
    if (!user) return;
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

  async joinSession() {
    const user = this.authService.currentUser();
    if (!user) return;
    const id = await this.dialog.prompt({
      title: 'Join Session',
      message: 'Enter the session ID provided by your collaborator:',
      placeholder: 'sess_abc123',
    });
    if (id) {
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

  sendMessage() {
    const text = this.newMessage().trim();
    if (!text) return;
    const user = (this.authService.currentUser() as any)?.email || 'Artist';
    this.messages.update((m) => [...m, { user, text }]);
    this.collaborationService.sendProjectUpdate(this.sessionId(), { message: text });
    this.newMessage.set('');
  }

  remixTrack(track: any) {
    this.messages.update((m) => [
      ...m,
      {
        user: 'System',
        text: `Remixing ${track.name}... Applying neural enhancements.`,
      },
    ]);
    this.musicManager.tracks.update(ts => ts.map(t => t.id === track.id ? {
        ...t,
        gain: Math.min(1.5, t.gain * 1.1),
        pan: (Math.random() * 2 - 1) * 0.5
    } : t));

    const updated = this.musicManager.tracks().find(t => t.id === track.id);
    if (updated) {
        this.musicManager.engine.updateTrack(track.id, {
            gain: updated.gain,
            pan: updated.pan
        });
    }
  }

  onCodeChange(newCode: string) {
    this.code.set(newCode);
    this.collaborationService.sendProjectUpdate(this.sessionId(), {
      code: newCode,
    });
  }

  acceptChallenge(challenge: any) {
    this.messages.update(m => [...m, { user: 'System', text: `Challenge Accepted: ${challenge.title}. Deploying workstation... ` }]);
    this.uiService.navigateToView('studio');
  }
}
