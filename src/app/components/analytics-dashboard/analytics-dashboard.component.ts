import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AnalyticsService } from '../../services/analytics.service';

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './analytics-dashboard.component.html',
  styleUrls: ['./analytics-dashboard.component.css']
})
export class AnalyticsDashboardComponent {
  analytics = inject(AnalyticsService);

  superfans = signal<any[]>([
    { name: 'Alex M.', streams: 450, location: 'London', status: 'Active' },
    { name: 'Sarah J.', streams: 380, location: 'New York', status: 'Rising' },
    { name: 'Dmitri K.', streams: 295, location: 'Berlin', status: 'Active' }
  ]);

  engagementTactics = [
    "Run a 'Behind the Scenes' stream for your top 50 listeners.",
    "Send a personalized thank you video to this month's top streamer.",
    "Discord Exclusive: Early listen for the next single."
  ];

  getMathMax(arr: number[]): number {
    return Math.max(...arr);
  }
}
