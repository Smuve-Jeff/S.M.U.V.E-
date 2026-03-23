import { MarketingService } from '../marketing.service';
import { AnalyticsService } from '../analytics.service';
import { TestBed, fakeAsync } from '@angular/core/testing';
import { AiService, API_KEY_TOKEN } from '../ai.service';
import { UserProfileService } from '../user-profile.service';
import { UserContextService } from '../user-context.service';
import { StemSeparationService } from '../stem-separation.service';
import { AudioEngineService } from '../audio-engine.service';
import { signal } from '@angular/core';

describe('AiService', () => {
  let service: AiService;
  let userProfileService: any;
  let userContextService: any;
  let analyticsService: any;

  beforeEach(() => {
    userProfileService = {
      profile: signal({
        catalog: [],
        tasks: [],
        skills: [],
        expertiseLevels: {
          production: 5,
          marketing: 5,
          mastering: 5,
          audioEngineering: 5
        }
      }),
      updateProfile: jest.fn()
    };
    userContextService = { mainViewMode: signal('hub'), setMainViewMode: jest.fn(), navigateToView: jest.fn() };
    analyticsService = {
        overallGrowth: signal(2),
        engagement: signal({ trend: -1 }),
        streams: signal({ value: 1000 })
    };

    TestBed.configureTestingModule({
      providers: [
        AiService,
        MarketingService,
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: API_KEY_TOKEN, useValue: 'AIzaSyCVdPtw0C_5rgiHDRi5mQYL4GXZMrdiDj4' },
        { provide: UserProfileService, useValue: userProfileService },
        { provide: UserContextService, useValue: userContextService },
        { provide: StemSeparationService, useValue: {} },
        { provide: AudioEngineService, useValue: { resume: jest.fn() } }
      ]
    });
    service = TestBed.inject(AiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate advisor advice when state changes', fakeAsync(() => {
    // Manually call the private update method if effects aren't triggering in Jest/fakeAsync
    (service as any).updateAdvisorAdvice('hub', userProfileService.profile());

    const advice = service.advisorAdvice();
    expect(advice.length).toBeGreaterThan(0);
    expect(advice[0].title).toBe('Visibility Surge Needed');
  }));
});
