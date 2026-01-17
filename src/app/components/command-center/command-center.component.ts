import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiService, StrategicRecommendation } from '../../services/ai.service';
import { ReputationService } from '../../services/reputation.service';

@Component({
  selector: 'app-command-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './command-center.component.html',
  styleUrls: ['./command-center.component.css']
})
export class CommandCenterComponent implements OnInit {
  private aiService = inject(AiService);
  reputationService = inject(ReputationService);

  decrees = signal<StrategicRecommendation[]>([]);
  terminalLines = signal<string[]>([]);
  isLoading = signal(false);

  ngOnInit() {
    this.addTerminalLine('S.M.U.V.E 2.0 OMNISCIENT CORE ONLINE...');
    this.addTerminalLine('ANALYZING ARTIST POTENTIAL...');
    this.refreshDecrees();
  }

  async refreshDecrees() {
    this.isLoading.set(true);
    this.addTerminalLine('CONTACTING THE RAP GOD...');
    const newDecrees = await this.aiService.getStrategicRecommendations();
    this.decrees.set(newDecrees);
    this.addTerminalLine(`RECEIVED ${newDecrees.length} STRATEGIC DECREES.`);
    this.isLoading.set(false);
  }

  private addTerminalLine(text: string) {
    this.terminalLines.update(lines => [...lines.slice(-10), `> ${text}`]);
  }
}
