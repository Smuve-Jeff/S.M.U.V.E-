import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './skeleton.component.html',
  styleUrls: ['./skeleton.component.css'],
})
export class SkeletonComponent {
  type = input<'text' | 'card' | 'preset' | 'track' | 'circle'>('text');
  width = input<string>('100%');
  height = input<string>('20px');
  count = input<number>(1);

  get items(): number[] {
    return Array(this.count()).fill(0);
  }
}
