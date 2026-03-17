import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AiService } from '../ai.service';
import { LoggingService } from '../logging.service';
import { UserContextService } from '../user-context.service';
import { AnalyticsService } from '../analytics.service';
import { MarketingService } from '../marketing.service';
import { UserProfileService } from '../user-profile.service';
import { ReputationService } from '../reputation.service';
import { UIService } from '../ui.service';
import { signal } from '@angular/core';

describe('AiService Granular Audit', () => {
  let service: AiService;

  beforeEach(() => {
    const loggingMock = { info: jest.fn(), system: jest.fn() };
    const userContextMock = { mainViewMode: signal('hub') };
    const analyticsMock = { overallGrowth: signal(10) };
    const marketingMock = {};
    const profileMock = { profile: signal({ primaryGenre: 'Techno', expertiseLevels: { production: 5 } }) };
    const repMock = { state: signal({ level: 5 }) };
    const uiMock = { performanceMode: signal(false) };

    TestBed.configureTestingModule({
      providers: [
        AiService,
        { provide: LoggingService, useValue: loggingMock },
        { provide: UserContextService, useValue: userContextMock },
        { provide: AnalyticsService, useValue: analyticsMock },
        { provide: MarketingService, useValue: marketingMock },
        { provide: UserProfileService, useValue: profileMock },
        { provide: ReputationService, useValue: repMock },
        { provide: UIService, useValue: uiMock }
      ]
    });
    service = TestBed.inject(AiService);
  });

  it('should progress through audit steps', fakeAsync(() => {
    service.performExecutiveAudit();
    expect(service.isScanning()).toBe(true);

    tick(600); // Step 1: initializing
    expect(service.scanningProgress()).toBe(10);
    expect(service.currentProcessStep()).toBe('INITIALIZING NEURAL LINK...');

    tick(600); // Step 2: scanning
    expect(service.scanningProgress()).toBe(25);

    tick(600); // Step 3: analyzing
    expect(service.scanningProgress()).toBe(45);

    tick(600); // Step 4: auditing
    expect(service.scanningProgress()).toBe(65);

    tick(600); // Step 5: calculating
    expect(service.scanningProgress()).toBe(85);

    tick(600); // Step 6: complete
    expect(service.scanningProgress()).toBe(100);

    // The interval runs one more time to close everything
    tick(600);
    expect(service.isScanning()).toBe(false);
    expect(service.executiveAudit()).not.toBeNull();
  }));
});
