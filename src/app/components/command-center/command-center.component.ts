import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIService } from '../../services/ui.service';
import { AiService, StrategicRecommendation } from '../../services/ai.service';
import { UserProfileService } from '../../services/user-profile.service';
import { UpgradeRecommendation } from '../../types/ai.types';

interface TerminalLog {
  timestamp: number;
  type: 'command' | 'system' | 'response';
  message: string;
}

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
  public uiService = inject(UIService);

  recommendations = computed(() => this.aiService.getUpgradeRecommendations());
  strategicRecs = signal<StrategicRecommendation[]>([]);
  isPoweringUp = signal(false);

  // Terminal state
  terminalLogs = signal<TerminalLog[]>([]);
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

        this.terminalLogs.set([]);

        let currentLine = 0;
        this.intervalId = setInterval(() => {
          if (currentLine < decrees.length) {
            this.terminalLogs.update(logs => [...logs, {
              timestamp: Date.now(),
              type: 'system',
              message: decrees[currentLine]
            }]);
            currentLine++;
          } else {
            clearInterval(this.intervalId);
          }
        }, 800);
      }
    }, 500);
  }

  async handleCommand(command: string) {
    if (!command.trim()) return;

    this.terminalLogs.update(logs => [...logs, {
      timestamp: Date.now(),
      type: 'command',
      message: command.toUpperCase()
    }]);

    const response = await this.aiService.processCommand(command);

    setTimeout(() => {
      this.terminalLogs.update(logs => [...logs, {
        timestamp: Date.now(),
        type: 'response',
        message: response
      }]);
    }, 400);
  }

  async acquireUpgrade(rec: UpgradeRecommendation) {
    this.isPoweringUp.set(true);

    await this.profileService.acquireUpgrade({ title: rec.title, type: rec.type });

    this.terminalLogs.update(logs => [...logs, {
      timestamp: Date.now(),
      type: 'system',
      message: `ALERT: INTEGRATING ${rec.title.toUpperCase()}. SYNCING NEURAL PATHWAYS.`
    }]);

    setTimeout(() => {
      this.isPoweringUp.set(false);
      if (rec.url) {
        window.open(rec.url, '_blank');
      }
    }, 1200);
  }

  initializeOperation(srec: StrategicRecommendation) {
    this.terminalLogs.update(logs => [...logs, {
      timestamp: Date.now(),
      type: 'system',
      message: `INITIALIZING OPERATION: ${srec.action.toUpperCase()}...`
    }]);

    setTimeout(() => {
      if (srec.toolId) {
        this.uiService.navigateToView(srec.toolId as any);
      }
    }, 800);
  }

  getImpactColor(impact: string): string {
    switch (impact) {
      case 'Extreme': return 'text-violet-400 animate-pulse-subtle font-black';
      case 'High': return 'text-brand-primary';
      case 'Medium': return 'text-yellow-400';
      case 'Low': return 'text-slate-400';
      default: return 'text-white';
    }
  }
}
