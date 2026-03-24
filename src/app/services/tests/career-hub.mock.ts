import { signal } from '@angular/core';
export const mockAiService = {
  strategicDecrees: signal([]),
  systemStatus: signal({
    cpuLoad: 10,
    neuralSync: 90,
    memoryUsage: 40,
    latency: 1,
    marketVelocity: 50,
    activeProcesses: 5,
  }),
  executiveAudit: signal({ criticalDeficits: [] }),
  isScanning: signal(false),
  scanningProgress: signal(0),
  currentProcessStep: signal(''),
  advisorAdvice: signal([]),
  intelligenceBriefs: signal([]),
  marketAlerts: signal([]),
  getStrategicRecommendations: jest.fn().mockResolvedValue([]),
  processCommand: jest.fn().mockResolvedValue(''),
  refreshIntelligenceBriefs: jest.fn(),
};
