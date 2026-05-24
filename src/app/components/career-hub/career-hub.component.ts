import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RadarChartComponent } from '../radar-chart/radar-chart.component';
import { UserProfileService } from '../../services/user-profile.service';
import { AiAuditService } from '../../services/ai-audit.service';
import { BusinessPipelineService } from '../../services/business-pipeline.service';

@Component({
  selector: 'app-career-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, RadarChartComponent],
  templateUrl: './career-hub.component.html',
  styleUrls: ['./career-hub.component.css'],
})
export class CareerHubComponent {
  private userProfileService = inject(UserProfileService);
  private aiAuditService = inject(AiAuditService);
  private businessPipelineService = inject(BusinessPipelineService);

  submissions = signal([
    {
      labelName: 'Neon Records',
      demoUrl: 'https://smuve.io/demo/track-1',
      date: '2024-03-15',
      status: 'Reviewing',
    },
    {
      labelName: 'Obsidian Sound',
      demoUrl: 'https://smuve.io/demo/track-2',
      date: '2024-03-10',
      status: 'Pending',
    },
  ]);

  venues = signal([
    {
      name: 'The Circuit',
      location: 'Los Angeles',
      capacity: 500,
      bookingStatus: 'Confirmed',
    },
    {
      name: 'Neon Lounge',
      location: 'Tokyo',
      capacity: 200,
      bookingStatus: 'Pending',
    },
    {
      name: 'Titanium Arena',
      location: 'London',
      capacity: 1500,
      bookingStatus: 'Available',
    },
  ]);

  newLabel = '';
  newDemo = '';

  profile = this.userProfileService.profile;

  strategicAudit = computed(() => {
    return this.aiAuditService.calculateStrategicHealth(this.profile());
  });

  revenueForecast = computed(() => {
    const dna = { streams: this.profile().financials.totalRevenue * 250 }; // Rough stream estimation from revenue
    const projection = this.businessPipelineService.calculateRevenueProjections(dna);
    return projection.forecast.map((f: any) => ({ month: f.month, amount: f.estimate }));
  });

  submitToLabel() {
    if (!this.newLabel || !this.newDemo) return;

    const newSubmission = {
      labelName: this.newLabel,
      demoUrl: this.newDemo,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
    };

    this.submissions.update((prev) => [newSubmission, ...prev]);
    this.newLabel = '';
    this.newDemo = '';
  }

  recallSubmission(sub: any) {
    this.submissions.update((prev) => prev.filter((s) => s !== sub));
  }

  formatCurrency(value: number): string {
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  }

  generateSplitSheet() {
    const title = prompt('Enter Track Title for Split Sheet:');
    if (!title) return;

    const newSplit: any = {
      id: 'split-' + Date.now(),
      workId: 'work-' + Math.random().toString(36).substring(7),
      title: title,
      status: 'Draft',
      splits: [
        { role: 'Producer', percentage: 50, name: 'You' },
        { role: 'Songwriter', percentage: 50, name: 'Collaborator' },
      ],
      totalPercentage: 100,
      updatedAt: Date.now(),
    };

    this.userProfileService.updateProfile({
      financials: {
        ...this.profile().financials,
        splitSheets: [...this.profile().financials.splitSheets, newSplit],
      },
    });
  }
}
