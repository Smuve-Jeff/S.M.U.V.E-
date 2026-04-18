import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExpertiseLevels } from '../../types/profile.types';

@Component({
  selector: 'app-radar-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './radar-chart.component.html',
  styleUrls: ['./radar-chart.component.css']
})
export class RadarChartComponent {
  @Input() set expertise(value: ExpertiseLevels) {
    this._expertise.set(value);
  }

  private _expertise = signal<ExpertiseLevels | null>(null);

  labels = [
    { key: 'production', label: 'Production' },
    { key: 'songwriting', label: 'Songwriting' },
    { key: 'marketing', label: 'Marketing' },
    { key: 'business', label: 'Business' },
    { key: 'legal', label: 'Legal' },
    { key: 'performance', label: 'Performance' }
  ];

  points = computed(() => {
    const data = this._expertise();
    if (!data) return '';

    const center = 100;
    const radius = 80;
    const angleStep = (Math.PI * 2) / this.labels.length;

    return this.labels.map((l, i) => {
      const val = (data as any)[l.key] || 0;
      const normalizedVal = (val / 10) * radius;
      const x = center + normalizedVal * Math.cos(i * angleStep - Math.PI / 2);
      const y = center + normalizedVal * Math.sin(i * angleStep - Math.PI / 2);
      return `${x},${y}`;
    }).join(' ');
  });

  gridCircles = [20, 40, 60, 80];

  gridLines = computed(() => {
    const center = 100;
    const radius = 80;
    const angleStep = (Math.PI * 2) / this.labels.length;

    return this.labels.map((_, i) => {
      const x = center + radius * Math.cos(i * angleStep - Math.PI / 2);
      const y = center + radius * Math.sin(i * angleStep - Math.PI / 2);
      return { x1: center, y1: center, x2: x, y2: y };
    });
  });

  labelPositions = computed(() => {
    const center = 100;
    const radius = 95;
    const angleStep = (Math.PI * 2) / this.labels.length;

    return this.labels.map((l, i) => {
      const x = center + radius * Math.cos(i * angleStep - Math.PI / 2);
      const y = center + radius * Math.sin(i * angleStep - Math.PI / 2);
      return { x, y, label: l.label };
    });
  });
}
