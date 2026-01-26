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

interface SplitSheet {
  id: string;
  track: string;
  splits: { name: string; role: string; share: number }[];
  status: 'Draft' | 'Finalized' | 'Submitted';
}

@Component({
  selector: 'app-career-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './career-hub.component.html',
  styleUrls: ['./career-hub.component.css'],
})
export class CareerHubComponent {
  private profileService = inject(UserProfileService);
  profile = this.profileService.profile;

  submissions = signal<Submission[]>([
    {
      labelName: 'Universal Music Group',
      demoUrl: 'https://smuve.ai/demo/aurora',
      status: 'Reviewing',
      date: '2024-05-15',
    },
    {
      labelName: 'Atlantic Records',
      demoUrl: 'https://smuve.ai/demo/neon-lights',
      status: 'Pending',
      date: '2024-05-20',
    },
  ]);

  venues = signal<Venue[]>([
    {
      name: 'The Echo',
      location: 'Los Angeles, CA',
      capacity: '350',
      bookingStatus: 'Confirmed',
    },
    {
      name: 'Bowery Ballroom',
      location: 'New York, NY',
      capacity: '575',
      bookingStatus: 'In Discussion',
    },
  ]);

  newLabel = signal('');
  newDemo = signal('');

  auditScore = signal<number | null>(null);
  auditFeedback = signal<string[]>([]);

  splitSheets = signal<SplitSheet[]>([]);

  runPitchAudit() {
    this.auditScore.set(85);
    this.auditFeedback.set([
      'Metadata: Professional and complete.',
      'EPK Visuals: High quality, but missing a recent press photo.',
      'Demo Quality: Mastered to -14 LUFS, perfect for DSPs.',
      'Social Proof: Engagement rate is above average, but follower count is low for this label.',
    ]);
  }

  generateSplitSheet() {
    const sheet: SplitSheet = {
      id: Math.random().toString(36).slice(2, 11),
      track: 'New Track Prototype',
      splits: [
        { name: this.profile().artistName, role: 'Writer/Producer', share: 50 },
        { name: 'Collaborator A', role: 'Writer', share: 50 },
      ],
      status: 'Draft',
    };
    this.splitSheets.update((s) => [...s, sheet]);
  }

  submitToLabel() {
    if (!this.newLabel() || !this.newDemo()) return;
    this.submissions.update((s) => [
      ...s,
      {
        labelName: this.newLabel(),
        demoUrl: this.newDemo(),
        status: 'Pending',
        date: new Date().toISOString().split('T')[0],
      },
    ]);
    this.newLabel.set('');
    this.newDemo.set('');
  }
}
