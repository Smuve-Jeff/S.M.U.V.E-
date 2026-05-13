import {
  Component,
  inject,
  signal,
  effect,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  computed,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MusicManagerService } from '../../services/music-manager.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { MicrophoneService } from '../../services/microphone.service';
import { AiService } from '../../services/ai.service';
import { LoggingService } from '../../services/logging.service';
import { FileLoaderService } from '../../services/file-loader.service';
import { ExportService } from '../../services/export.service';

@Component({
  selector: 'app-drum-machine',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: '<div>Drum Machine</div>',
})
export class DrumMachineComponent implements AfterViewInit, OnDestroy {
  private readonly aiService = inject(AiService);
  pads = signal<any[]>([]);
  hasQuantumDrumEngine = computed(() =>
    this.aiService.isUnlocked('upg-quantum-drum-engine')
  );
  isGenerating = signal(false);

  ngAfterViewInit() {}
  ngOnDestroy() {}

  async generateQuantumGroove() {
    if (!this.hasQuantumDrumEngine()) return;
    this.isGenerating.set(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.isGenerating.set(false);
  }
}
