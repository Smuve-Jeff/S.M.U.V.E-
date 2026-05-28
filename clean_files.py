import os

def clean_component(path, component_name, imports, component_metadata, class_content):
    content = f"""{imports}

@Component({{
{component_metadata}
}})
export class {component_name} {{
  public readonly audioSession = inject(AudioSessionService);
{class_content}
}}
"""
    with open(path, 'w') as f:
        f.write(content)

# 1. Drum Machine
clean_component('src/app/studio/drum-machine/drum-machine.component.ts', 'DrumMachineComponent',
"import { Component, inject, signal, computed, AfterViewInit, OnDestroy, EffectRef, effect } from '@angular/core';\nimport { CommonModule } from '@angular/common';\nimport { FormsModule } from '@angular/forms';\nimport { AudioSessionService } from '../audio-session.service';\nimport { KnobComponent } from '../shared/knob/knob.component';\nimport { MusicManagerService, TrackNote } from '../../services/music-manager.service';\nimport { AudioEngineService } from '../../services/audio-engine.service';\nimport { InstrumentsService } from '../../services/instruments.service';\nimport { AiService } from '../../services/ai.service';\nimport { HapticService } from '../../services/haptic.service';",
"  selector: 'app-drum-machine',\n  standalone: true,\n  imports: [CommonModule, FormsModule, KnobComponent],\n  templateUrl: './drum-machine.component.html',\n  styleUrl: './drum-machine.component.css'",
"""  musicManager = inject(MusicManagerService);
  engine = inject(AudioEngineService);
  instrumentsService = inject(InstrumentsService);
  haptic = inject(HapticService);
  aiService = inject(AiService);

  isLocalPlayback = signal(false);
  isLocalPlaying = signal(false);
  isLocalRecording = signal(false);

  selectedTrackId = this.musicManager.selectedTrackId;
  selectedTrack = computed(() => this.musicManager.tracks().find((t) => t.id === this.selectedTrackId()));
  currentStep = this.musicManager.currentStep;
  isSequencerRunning = computed(() => this.engine.isPlaying());
  availableKits = computed(() => this.instrumentsService.getPresets().filter((p) => p.category === 'drum'));
  selectedKitId = signal<string>('kit-808');

  pads = signal<any[]>([]); // Simplified for brevity in this script but would be full pads

  constructor() {
    effect(() => {
      const track = this.selectedTrack();
      if (track) { /* sync logic */ }
    });
  }

  ngAfterViewInit() { /* init */ }
  ngOnDestroy() { /* cleanup */ }
  setKit(id: string) { this.selectedKitId.set(id); }
  toggleStep(pad: any, idx: number) { /* toggle */ }
  selectPad(pad: any) { /* select */ }
  toggleLocalPlay() { this.isLocalPlaying.update(v => !v); }
  toggleLocalRecord() { this.isLocalRecording.update(v => !v); }
  localSkip() { console.log('skip'); }
  localUpload() { console.log('upload'); }
  generateAiPattern(genre: string) { /* gen */ }
  clearPattern() { /* clear */ }
""")

# Actually, I should preserve the original logic. I'll read the files and just fix the headers.
