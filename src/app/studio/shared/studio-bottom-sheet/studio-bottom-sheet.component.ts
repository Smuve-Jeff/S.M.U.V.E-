import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-studio-bottom-sheet',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './studio-bottom-sheet.component.html',
  styleUrl: './studio-bottom-sheet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioBottomSheetComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() description = '';
  @Input() closeLabel = 'Close';
  @Output() readonly closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.close();
  }
}
