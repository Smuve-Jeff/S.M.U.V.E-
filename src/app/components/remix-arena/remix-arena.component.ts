import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CollaborationService } from '../../services/collaboration.service';
import { StemControlsComponent } from '../stem-controls/stem-controls.component';
import { SampleLibraryComponent } from '../sample-library/sample-library.component';

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
export class RemixArenaComponent {
  collaborationService = inject(CollaborationService);
  code = signal('// S.M.U.V.E REMIX ENGINE\n// Start writing your logic here...\n\nfunction onBeat(step) {\n  if (step % 4 === 0) {\n    playKick();\n  }\n}');

  messages = signal([
    { user: 'System', text: 'Welcome to Remix Arena! Collaboration is now LIVE.' },
    { user: 'SmuveBot', text: 'I am ready to help you mix. Try adding a baseline.' }
  ]);

  newMessage = signal('');

  onCodeChange(newCode: string) {
    this.code.set(newCode);
    // Sync logic would go here
  }

  sendMessage() {
    if (!this.newMessage()) return;
    this.messages.update(m => [...m, { user: 'Me', text: this.newMessage() }]);
    this.newMessage.set('');
  }
}
