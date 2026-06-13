import { Injectable, inject } from '@angular/core';
import { MusicManagerService } from './music-manager.service';
import { LoggingService } from './logging.service';

export interface ProjectTemplate {
  id: string;
  name: string;
  bpm: number;
  tracks: { name: string; instrumentId: string; type: 'midi' | 'audio' }[];
}

@Injectable({
  providedIn: 'root',
})
export class ProjectTemplateService {
  private musicManager = inject(MusicManagerService);
  private logger = inject(LoggingService);

  templates: ProjectTemplate[] = [
    {
      id: 'trap-elite',
      name: 'Trap Elite',
      bpm: 140,
      tracks: [
        { name: '808 Bass', instrumentId: 'trap-808-elite', type: 'midi' },
        { name: 'Dark Keys', instrumentId: 'grand-piano', type: 'midi' },
        { name: 'Cyber Lead', instrumentId: 'cyber-stab', type: 'midi' },
        { name: 'Drums', instrumentId: 'trap-808-elite', type: 'midi' },
      ],
    },
    {
      id: 'rnb-platinum',
      name: 'R&B Platinum',
      bpm: 92,
      tracks: [
        { name: 'P-Bass', instrumentId: 'p-bass-elite', type: 'midi' },
        { name: 'Ethereal Keys', instrumentId: 'neon-shimmer', type: 'midi' },
        { name: 'Strat Guitar', instrumentId: 'strat-elite-clean', type: 'midi' },
        { name: 'Vocal Lead', instrumentId: 'grand-piano', type: 'midi' },
      ],
    },
    {
      id: 'synthwave-retro',
      name: 'Synthwave Retro',
      bpm: 115,
      tracks: [
        { name: 'Analog Pad', instrumentId: 'ethereal-wind', type: 'midi' },
        { name: 'Sub Bass', instrumentId: 'sub-commander', type: 'midi' },
        { name: 'Neon Lead', instrumentId: 'neon-shimmer', type: 'midi' },
        { name: 'Cyber Drums', instrumentId: 'cyber-stab', type: 'midi' },
      ],
    }
  ];

  applyTemplate(templateId: string) {
    const template = this.templates.find(t => t.id === templateId);
    if (!template) return;

    this.musicManager.tracks.set([]);
    template.tracks.forEach(t => {
      this.musicManager.addTrack(t.name, t.instrumentId);
    });
    this.musicManager.engine.tempo.set(template.bpm);
    this.logger.info(`ProjectTemplateService: Applied template ${template.name}`);
  }
}
