import { Component, ChangeDetectionStrategy, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-user-profile-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-profile-builder.component.html',
  styleUrls: ['./user-profile-builder.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfileBuilderComponent {
  @Output() profileSaved = new EventEmitter<void>();
  artistName = signal('');
  bio = signal('');
  profilePictureUrl = signal<string | null>(null);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => this.profilePictureUrl.set(e.target?.result as string);
      reader.readAsDataURL(input.files[0]);
    }
  }

  saveProfile(): void {
    // In a real application, you would save the profile data to a service.
    // For now, we'll just emit an event to signal that the profile has been "saved".
    this.profileSaved.emit();
  }
}
