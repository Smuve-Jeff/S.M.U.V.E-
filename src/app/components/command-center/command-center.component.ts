import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, StrategicRecommendation } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import { ReputationService } from '../../services/reputation.service';
import { UpgradeRecommendation } from '../../types/ai.types';

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './command-center.component.html',
  styleUrls: ['./command-center.component.css']
})
export class CommandCenterComponent implements OnInit, OnDestroy {
  public aiService = inject(AiService);
  public profileService = inject(UserProfileService);
  public reputationService = inject(ReputationService);

  recommendations = computed(() => this.aiService.getUpgradeRecommendations());
  strategicRecs = signal<StrategicRecommendation[]>([]);

  // Terminal state
  terminalLines = signal<string[]>([]);
  private intervalId: any;

  ngOnInit() {
    this.startTerminalSimulation();
    this.loadStrategicRecommendations();
  }

  async loadStrategicRecommendations() {
    const recs = await this.aiService.getStrategicRecommendations();
    this.strategicRecs.set(recs);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private startTerminalSimulation() {
    // Wait for decrees to be available
    const checkDecrees = setInterval(() => {
      const decrees = this.aiService.strategicDecrees();
      if (decrees.length > 0) {
        clearInterval(checkDecrees);
        let currentLine = 0;
        this.intervalId = setInterval(() => {
          if (currentLine < decrees.length) {
            this.terminalLines.update(lines => [...lines, decrees[currentLine]]);
            currentLine++;
          } else {
            clearInterval(this.intervalId);
          }
        }, 800);
      }
    }, 500);
  }

    acquireUpgrade(rec: UpgradeRecommendation) {
    if (rec.url) {
      window.open(rec.url, '_blank');
    }
  }

  getImpactColor(impact: string): string {
    switch (impact) {
      case 'Extreme': return 'text-violet-400 animate-pulse font-black';
      case 'High': return 'text-emerald-400';
      case 'Medium': return 'text-yellow-400';
      case 'Low': return 'text-slate-400';
      default: return 'text-white';
    }
  }
}
