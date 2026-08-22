import { TestBed } from '@angular/core/testing';
import { SmartProductionFoundationsService } from './smart-production-foundations.service';

describe('SmartProductionFoundationsService', () => {
  let service: SmartProductionFoundationsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SmartProductionFoundationsService],
    });
    service = TestBed.inject(SmartProductionFoundationsService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should list 4 capabilities', () => {
    expect(service.capabilities().length).toBe(4);
  });

  it('should show stem separation as ready', () => {
    const cap = service.capabilities().find((c) => c.feature === 'stemSeparation');
    expect(cap!.status).toBe('ready');
  });

  it('should show key/bpm detection as unsupported by default', () => {
    const cap = service.capabilities().find((c) => c.feature === 'keyBpmDetection');
    expect(cap!.status).toBe('unsupported');
    expect(cap!.reason).toContain('server-side');
  });

  it('should activate key/bpm detection when backend is configured', () => {
    service.setBackendConfigured(true);
    const cap = service.capabilities().find((c) => c.feature === 'keyBpmDetection');
    expect(cap!.status).toBe('ready');
    expect(cap!.reason).toBeUndefined();
  });

  it('should show vocal enhancement as unsupported', () => {
    const cap = service.capabilities().find((c) => c.feature === 'vocalEnhancement');
    expect(cap!.status).toBe('unsupported');
    expect(cap!.reason).toContain('Backend model');
  });

  it('should show take ranking as unsupported', () => {
    const cap = service.capabilities().find((c) => c.feature === 'takeRanking');
    expect(cap!.status).toBe('unsupported');
  });

  it('should track busy features', () => {
    expect(service.isBusy('takeRanking')).toBe(false);
    service.setBusy('takeRanking', true);
    expect(service.isBusy('takeRanking')).toBe(true);
    service.setBusy('takeRanking', false);
    expect(service.isBusy('takeRanking')).toBe(false);
  });

  it('should handle multiple busy features independently', () => {
    service.setBusy('stemSeparation', true);
    service.setBusy('takeRanking', true);
    expect(service.isBusy('stemSeparation')).toBe(true);
    expect(service.isBusy('takeRanking')).toBe(true);
    expect(service.isBusy('vocalEnhancement')).toBe(false);

    service.setBusy('stemSeparation', false);
    expect(service.isBusy('stemSeparation')).toBe(false);
    expect(service.isBusy('takeRanking')).toBe(true);
  });
});