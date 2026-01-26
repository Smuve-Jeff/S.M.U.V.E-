import { Component, inject } from '@angular/core';
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
  code = '// Your remix code here';

  constructor() {}

  onCodeChange(_newCode: string) {
    // Placeholder for future collaboration code sync
  }
}
