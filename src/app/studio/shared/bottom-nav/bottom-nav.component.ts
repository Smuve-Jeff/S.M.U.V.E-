import { Component, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BottomNavItem = {
  id: string;
  label: string;
  icon: string;
  badge?: number;
};

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.css']
})
export class BottomNavComponent {
  items = input.required<BottomNavItem[]>();
  activeId = input.required<string>();
  visible = input<boolean>(true);
  itemClick = output<string>();
}
