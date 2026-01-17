import { Component, input, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppTheme } from '../../services/user-context.service';
import { AudioEngineService } from '../../services/audio-engine.service';

interface SamplePack {
  name: string;
  genre: string;
  samples: { name: string; url: string }[];
}

@Component({
  selector: 'app-sample-library',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sample-library.component.html',
})
export class SampleLibraryComponent {
  theme = input.required<AppTheme>();
  private engine = inject(AudioEngineService);

  samplePacks = signal<SamplePack[]>([
    {
      name: 'Obsidian 808s',
      genre: 'Trap/Dark',
      samples: [
        { name: 'Sub-Zero Kick', url: '/assets/samples/808/kick.mp3' },
        { name: 'Glow Snare', url: '/assets/samples/808/snare.mp3' }
      ]
    },
    {
      name: 'Cyber-Percussion',
      genre: 'Industrial',
      samples: [
        { name: 'Metallic Clap', url: '/assets/samples/studio/clap.mp3' },
        { name: 'Neon Hat', url: '/assets/samples/studio/hhc.mp3' }
      ]
    },
    {
      name: 'Pro-Vault: Beat Pack 1',
      genre: 'Strategic Hip-Hop',
      samples: [
        { name: 'Foundation Loop (140BPM)', url: '/assets/samples/loops/foundation.mp3' },
        { name: 'Midnight Keys', url: '/assets/samples/loops/keys.mp3' }
      ]
    }
  ]);

  async previewSample(url: string) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.engine.getContext().decodeAudioData(arrayBuffer);
      this.engine.playSample(audioBuffer, this.engine.getContext().currentTime, 0.8);
    } catch (e) {
      console.warn('Failed to preview sample:', e);
    }
  }
}
