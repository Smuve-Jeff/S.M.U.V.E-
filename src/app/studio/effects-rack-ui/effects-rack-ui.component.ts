import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-effects-rack-ui',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './effects-rack-ui.component.html',
  styleUrls: ['./effects-rack-ui.component.css']
})
export class EffectsRackUiComponent {
  activeSlot = 1;
}
