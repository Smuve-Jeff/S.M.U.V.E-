import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ArrangementTrack {
  id: string;
  name: string;
  clips: ArrangementClip[];
}

export interface ArrangementClip {
  id: string;
  name: string;
  start: number;
  length: number;
  color: string;
}

@Component({
  selector: 'app-arrangement-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './arrangement-view.component.html',
  styleUrls: ['./arrangement-view.component.css'],
})
export class ArrangementViewComponent {
  bars = Array.from({ length: 64 }, (_, i) => i);
  barWidth = 100;
  gridWidth = 64 * 100;
  playheadPos = 120;

  tracks: ArrangementTrack[] = [
    {
      id: '1',
      name: 'Kick',
      clips: [
        { id: 'c1', name: 'Pattern 1', start: 0, length: 4, color: '#10b981' },
        { id: 'c2', name: 'Pattern 1', start: 8, length: 4, color: '#10b981' },
      ],
    },
    {
      id: '2',
      name: 'Snare',
      clips: [
        { id: 'c3', name: 'Pattern 2', start: 4, length: 4, color: '#8b5cf6' },
      ],
    },
    {
      id: '3',
      name: 'Vocal 01',
      clips: [
        {
          id: 'c4',
          name: 'Verse 1 Recording',
          start: 0,
          length: 16,
          color: '#f59e0b',
        },
      ],
    },
    {
      id: '4',
      name: 'Lead Synth',
      clips: [
        { id: 'c5', name: 'Synth Loop', start: 8, length: 8, color: '#3b82f6' },
      ],
    },
  ];
}
