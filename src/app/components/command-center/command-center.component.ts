import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, StrategicRecommendation } from '../../services/ai.service';
import { ReputationService } from '../../services/reputation.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './command-center.component.html',
  styleUrls: ['./command-center.component.css']
})
export class CommandCenterComponent implements OnInit {
  public aiService = inject(AiService);
  public reputationService = inject(ReputationService);
  private profileService = inject(UserProfileService);
  private uiService = inject(UIService);

  recommendations = signal<any[]>([]);
  strategicRecs = signal<StrategicRecommendation[]>([]);
  terminalLines = signal<string[]>(['Initializing S.M.U.V.E. 4.0 Interface...', 'Neural Link Established.', 'Analyzing Market Data...']);

  ngOnInit() {
    this.recommendations.set(this.aiService.getUpgradeRecommendations().slice(0, 5));
    this.strategicRecs.set(this.aiService.getStrategicRecommendations());

    // Periodically add terminal lines
    const decrees = this.aiService.strategicDecrees();
    let currentLine = 0;
    const interval = setInterval(() => {
       if (currentLine < decrees.length) {
          this.terminalLines.update(lines => [...lines, decrees[currentLine].content]);
          currentLine++;
       } else {
          clearInterval(interval);
       }
    }, 2000);
  }

  acquireUpgrade(rec: any) {
    this.profileService.acquireUpgrade({ title: rec.title, type: rec.type });
    this.recommendations.update(recs => recs.filter(r => r.title !== rec.title));
  }

  initializeOperation(op: any) {
    if (op && op.toolId) {
      this.uiService.navigateToView(op.toolId as any);
    }
  }

  getImpactColor(impact: string) {
    switch (impact) {
      case 'Extreme': return 'text-red-500';
      case 'High': return 'text-orange-500';
      case 'Medium': return 'text-primary';
      default: return 'text-slate-400';
    }
  }
}
