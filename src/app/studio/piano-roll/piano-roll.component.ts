import { Component, inject, signal, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MusicManagerService } from '../../services/music-manager.service';
import { HistoryService } from '../../services/history.service';
import { AiService } from '../../services/ai.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-piano-roll',
  standalone: true,
  imports: [CommonModule],
  template: '<div>Piano Roll</div>',
})
export class PianoRollComponent {
  musicManager = inject(MusicManagerService);
  historyService = inject(HistoryService);
  aiService = inject(AiService);
  router = inject(Router);

  @Output() closeOverlay = new EventEmitter<void>();

  selectedTrack = signal<any>(null);
  selectedNoteIds = signal<Set<string>>(new Set());
  editMode = signal('draw');
  showAudioDock = signal(false);
  audioDockView = signal('mixer');
  showTrackSidebar = signal(false);
  soundBrowserOpen = signal(false);
  quantizeStrength = signal(1);
  selectedSnap = signal(1);
  snapToScale = signal(false);
  selectedScale = signal({ notes: [0, 2, 4, 5, 7, 9, 11] });
  newTrackPresetId = signal('default');
  isStudioOverlay = signal(false);
  isStandalone = signal(false);
  selectionBox = signal({ active: false });

  cells: number[] = [];
  gridWidth = 1000;
  cellWidth = 40;
  numMeasures = 4;
  stepsPerMeasure = 16;

  setSelectedNoteProbability(event: any) {}
  applyVelocityCurve(type: string) {}
  getDisplayKeys() {
    return [];
  }
  selectTrack(t: any) {}
  addTrack() {}
  removeTrack(id: any) {}
  getVisibleNotes(t: any) {
    return [];
  }
  getGhostNotes(id: any) {
    return [];
  }
  togglePlay() {}
  toggleAudioDock() {}
  setAudioDockView(v: any) {}
  setPatternLength(l: any) {}
  toggleTrackSidebar() {}
  toggleSoundBrowser() {}
  transposeSelected(s: any) {}
  duplicateSelected() {}
  deleteSelected() {}
  quantizeNotes() {}
  onGridMouseDown(e: any) {}
  goStandalone() {}
  setEditMode(m: any) {}
  humanizeSelected() {}
  duplicateNextBar() {}
  adjustSelectedVelocity(v: any) {}
  adjustSelectedLength(v: any) {}
  nudgeSelectedOctave(v: any) {}
}
