import { Injectable, signal, inject } from '@angular/core';
import { AudioEngineService } from '../services/audio-engine.service';

export interface AutomationPoint {
  time: number;
  value: number;
}

export interface AutomationLane {
  id: string;
  trackId: string;
  parameter: string; // e.g., 'volume', 'pan', 'cutoff'
  points: AutomationPoint[];
  enabled: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AutomationService {
  private readonly engine = inject(AudioEngineService);

  lanes = signal<AutomationLane[]>([]);

  addLane(trackId: string, parameter: string) {
    const lane: AutomationLane = {
      id: Math.random().toString(36).substring(7),
      trackId,
      parameter,
      points: [],
      enabled: true,
    };
    this.lanes.update((lanes) => [...lanes, lane]);
    return lane;
  }

  addPoint(laneId: string, time: number, value: number) {
    this.lanes.update((lanes) => {
      const lane = lanes.find((l) => l.id === laneId);
      if (lane) {
        lane.points.push({ time, value });
        lane.points.sort((a, b) => a.time - b.time);
      }
      return [...lanes];
    });
  }

  removePoint(laneId: string, pointIndex: number) {
    this.lanes.update((lanes) => {
      const lane = lanes.find((l) => l.id === laneId);
      if (lane) {
        lane.points.splice(pointIndex, 1);
      }
      return [...lanes];
    });
  }

  getValueAtTime(laneId: string, time: number): number | null {
    const lane = this.lanes().find((l) => l.id === laneId);
    if (!lane || lane.points.length === 0) return null;

    const points = lane.points;
    if (time <= points[0].time) return points[0].value;
    if (time >= points[points.length - 1].time)
      return points[points.length - 1].value;

    for (let i = 0; i < points.length - 1; i++) {
      if (time >= points[i].time && time <= points[i + 1].time) {
        const ratio =
          (time - points[i].time) / (points[i + 1].time - points[i].time);
        return (
          points[i].value + ratio * (points[i + 1].value - points[i].value)
        );
      }
    }
    return null;
  }

  applyAutomation(time: number, duration: number) {
    const lanes = this.lanes();
    lanes.forEach((lane) => {
      if (!lane.enabled) return;
      const value = this.getValueAtTime(lane.id, time);
      if (value !== null) {
        // Implement logic to apply automation to the specific parameter of the engine
        // Example: this.engine.setParameter(lane.trackId, lane.parameter, value);
      }
    });
  }
}
