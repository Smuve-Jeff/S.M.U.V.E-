import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  GamificationService,
  UserProgress,
} from '../../services/gamification.service';

@Component({
  selector: 'app-user-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-progress.component.html',
  styleUrls: ['./user-progress.component.css'],
})
export class UserProgressComponent {
  private readonly gamificationService = inject(GamificationService);
  progress = this.gamificationService.progress;
}
