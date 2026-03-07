import { TestBed, flush, fakeAsync } from '@angular/core/testing';
import { AiService } from '../ai.service';
import { UserProfileService } from '../user-profile.service';
import { UserContextService } from '../user-context.service';
import { ReputationService } from '../reputation.service';
import { StemSeparationService } from '../stem-separation.service';
import { AudioEngineService } from '../audio-engine.service';
import { signal } from '@angular/core';

describe('AiService', () => {
  let service: AiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AiService,
        { provide: UserProfileService, useValue: { profile: signal({ catalog: [], tasks: [] }), updateProfile: jest.fn() } },
        { provide: UserContextService, useValue: { mainViewMode: signal('hub'), setMainViewMode: jest.fn() } },
        { provide: ReputationService, useValue: { state: signal({ level: 1 }) } },
        { provide: StemSeparationService, useValue: {} },
        { provide: AudioEngineService, useValue: { resume: jest.fn() } }
      ]
    });
    service = TestBed.inject(AiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial advisor advice', fakeAsync(() => {
    flush();
    expect(service.advisorAdvice()).toBeDefined();
    expect(service.advisorAdvice().length).toBeGreaterThan(0);
  }));
});
