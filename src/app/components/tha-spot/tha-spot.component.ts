import { Component } from '@angular/core';
import { VisualizerComponent } from '../visualizer/visualizer.component';
import { AiService } from '../../services/ai.service';

@Component({
  selector: 'app-tha-spot',
  standalone: true,
  imports: [VisualizerComponent],
  templateUrl: './tha-spot.component.html',
  styleUrls: ['./tha-spot.component.css']
})
export class ThaSpotComponent {
  isAIBassistEnabled = false;
  isAIDrummerEnabled = false;
  isAIKeyboardistEnabled = false;

  constructor(private aiService: AiService) {}

  toggleAIBassist() {
    this.isAIBassistEnabled = !this.isAIBassistEnabled;
    if (this.isAIBassistEnabled) {
      this.aiService.startAIBassist();
    } else {
      this.aiService.stopAIBassist();
    }
  }

  toggleAIDrummer() {
    this.isAIDrummerEnabled = !this.isAIDrummerEnabled;
    if (this.isAIDrummerEnabled) {
      this.aiService.startAIDrummer();
    } else {
      this.aiService.stopAIDrummer();
    }
  }

  toggleAIKeyboardist() {
    this.isAIKeyboardistEnabled = !this.isAIKeyboardistEnabled;
    if (this.isAIKeyboardistEnabled) {
      this.aiService.startAIKeyboardist();
    } else {
      this.aiService.stopAIKeyboardist();
    }
  }
}
