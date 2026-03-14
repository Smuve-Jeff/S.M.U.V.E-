import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { AiService } from '../../services/ai.service';
import { UIService } from '../../services/ui.service';
import { ProfileAuditResult } from '../../types/ai.types';

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
  public readonly aiService = inject(AiService);
  private uiService = inject(UIService);

  profile = this.profileService.profile;
  isAuditing = signal(false);
  auditResult = this.aiService.activeAudit;

  submissions = signal<Submission[]>([
    {
      labelName: 'Universal Music Group',
      demoUrl: 'https://smuve.ai/demo/aurora',
      status: 'Reviewing',
      date: '2024-05-15',
    },
    {
      labelName: 'Atlantic Records',
      demoUrl: 'https://smuve.ai/demo/refined-glow-lights',
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
  currentDecree = computed(() => this.aiService.strategicDecrees()[0] || "Awaiting AI Analysis...");

  splitSheets = signal<SplitSheet[]>([]);

  public navigateTo(view: string) {
    this.uiService.navigateToView(view as any);
  }

  async runPitchAudit() {
    this.isAuditing.set(true);
    try {
      await this.aiService.runProfileAudit();
    } finally {
      this.isAuditing.set(false);
    }
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
