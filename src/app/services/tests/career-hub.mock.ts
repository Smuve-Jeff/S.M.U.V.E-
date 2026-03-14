import { signal } from '@angular/core';

export const mockAiService = {
  strategicDecrees: signal([]),
  systemStatus: signal({ cpuLoad: 10, neuralSync: 90, memoryUsage: 40, latency: 1, marketVelocity: 50, activeProcesses: 5 }),
  activeAudit: signal(null),
  advisorAdvice: signal([]),
  getStrategicRecommendations: jest.fn().mockResolvedValue([]),
  processCommand: jest.fn().mockResolvedValue('')
};
