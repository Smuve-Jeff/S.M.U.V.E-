import { Component, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-fab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fab.component.html',
  styleUrls: ['./fab.component.css'],
})
export class FabComponent {
  icon = input<string>('add');
  label = input<string>('');
  color = input<string>('primary');
  position = input<'bottom-right' | 'bottom-left'>('bottom-right');
  visible = input<boolean>(true);
  fabClick = output<void>();
}
