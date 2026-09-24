import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-studio-inspector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './studio-inspector.component.html',
  styleUrl: './studio-inspector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioInspectorComponent {
  @Input() title = 'Inspector';
  @Input() eyebrow = '';
  @Input() open = true;
  @Input() collapsible = true;
  @Output() readonly openChange = new EventEmitter<boolean>();

  toggle(): void {
    if (!this.collapsible) return;
    this.open = !this.open;
    this.openChange.emit(this.open);
  }
}
