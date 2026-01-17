import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';

interface Submission {
  labelName: string;
  demoUrl: string;
  status: 'Pending' | 'Reviewing' | 'Rejected' | 'Accepted';
  date: string;
}

interface Venue {
  name: string;
  location: string;
  capacity: string;
  bookingStatus: string;
}

@Component({
  selector: 'app-career-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './career-hub.component.html',
  styleUrls: ['./career-hub.component.css']
})
export class CareerHubComponent {
  private profileService = inject(UserProfileService);
  profile = this.profileService.profile;

  submissions = signal<Submission[]>([
    { labelName: 'Universal Music Group', demoUrl: 'https://smuve.ai/demo/aurora', status: 'Reviewing', date: '2024-05-15' },
    { labelName: 'Atlantic Records', demoUrl: 'https://smuve.ai/demo/neon-lights', status: 'Pending', date: '2024-05-20' }
  ]);

  venues = signal<Venue[]>([
    { name: 'The Echo', location: 'Los Angeles, CA', capacity: '350', bookingStatus: 'Confirmed' },
    { name: 'Bowery Ballroom', location: 'New York, NY', capacity: '575', bookingStatus: 'In Discussion' }
  ]);

  newLabel = signal('');
  newDemo = signal('');

  submitToLabel() {
    if (!this.newLabel() || !this.newDemo()) return;
    this.submissions.update(s => [
      ...s,
      { labelName: this.newLabel(), demoUrl: this.newDemo(), status: 'Pending', date: new Date().toISOString().split('T')[0] }
    ]);
    this.newLabel.set('');
    this.newDemo.set('');
  }
}
