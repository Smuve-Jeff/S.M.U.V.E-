import { TestBed } from '@angular/core/testing';
import { ReverbService } from './reverb.service';

describe('ReverbService', () => {
  let service: ReverbService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ReverbService],
    });
    service = TestBed.inject(ReverbService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('creates a reverb instance', () => {
    const reverb = service.createReverb();
    expect(reverb).toBeTruthy();
  });

  it('exposes connect / disconnect / set API without throwing', () => {
    const reverb = service.createReverb();
    const node = {} as AudioNode;

    expect(() => reverb.connect(node)).not.toThrow();
    expect(() => reverb.disconnect()).not.toThrow();
    expect(() => reverb.set({ wet: 0.5 })).not.toThrow();
  });
});