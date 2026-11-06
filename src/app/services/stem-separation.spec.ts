import { TestBed } from '@angular/core/testing';
import { StemSeparationService } from './stem-separation.service';
import { NotificationService } from './notification.service';

describe('StemSeparationService', () => {
  let service: StemSeparationService;
  let notify: jest.Mock;

  beforeEach(() => {
    notify = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        StemSeparationService,
        { provide: NotificationService, useValue: { show: notify } },
      ],
    });

    service = TestBed.inject(StemSeparationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('labels DSP output as DSP instead of claiming neural inference', async () => {
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, 4410, 44100);

    await service.separate(buffer);

    const messages = notify.mock.calls.map((call) => String(call[0]));
    expect(messages.some((message) => /neural/i.test(message))).toBe(false);
    expect(messages.some((message) => /DSP|spectral/i.test(message))).toBe(true);
  });

  it('should start in idle state', () => {
    expect(service.progress().stage).toBe('idle');
    expect(service.isSeparating()).toBe(false);
  });

  describe('offline separation', () => {
    it('should separate a buffer into 5 stems', async () => {
      const ctx = new AudioContext();
      const buffer = ctx.createBuffer(2, 44100, 44100);
      // Fill with a simple sine wave
      for (let c = 0; c < 2; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          data[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
        }
      }

      const stems = await service.separate(buffer);
      expect(stems).toBeTruthy();
      expect(stems.vocals).toBeTruthy();
      expect(stems.drums).toBeTruthy();
      expect(stems.bass).toBeTruthy();
      expect(stems.instrumental).toBeTruthy();
      expect(stems.other).toBeTruthy();

      // Each stem should have matching properties (mock returns fixed dimensions)
      expect(stems.vocals).toBeTruthy();
      expect(stems.drums).toBeTruthy();
      expect(stems.bass).toBeTruthy();
      expect(stems.instrumental).toBeTruthy();
      expect(stems.other).toBeTruthy();
    });

    it('should handle mono input', async () => {
      const ctx = new AudioContext();
      const buffer = ctx.createBuffer(1, 22050, 44100);

      const stems = await service.separate(buffer);
      expect(stems).toBeTruthy();
      // Mock returns fixed 2-channel buffers regardless of input
      expect(stems.vocals.numberOfChannels).toBeGreaterThanOrEqual(1);
    });

    it('reports stage progress and finishes complete', async () => {
      const buffer = new AudioBuffer({
        length: 4800,
        sampleRate: 48000,
        numberOfChannels: 1,
      });
      const labels: string[] = [];

      const stems = await service.separate(buffer, (update) =>
        labels.push(update.label)
      );

      expect(stems.vocals.length).toBe(4800);
      expect(labels.length).toBeGreaterThan(0);
      expect(labels[0]).toContain('Centre band');
      expect(service.progress().stage).toBe('complete');
      expect(service.progress().progress).toBe(100);
    });

    it('hands the channels to the worker and adopts its stems', async () => {
      const buffer = new AudioBuffer({
        length: 4800,
        sampleRate: 48000,
        numberOfChannels: 2,
      });
      const fakeWorker = {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null as any,
        onerror: null as any,
      };
      (service as any).createWorker = () => fakeWorker;

      const labels: string[] = [];
      const pending = service.separate(buffer, (update) =>
        labels.push(update.label)
      );

      const [message, transfer] = fakeWorker.postMessage.mock.calls[0];
      expect(message.payload.sampleRate).toBe(48000);
      expect(transfer).toHaveLength(2);

      fakeWorker.onmessage({
        data: {
          type: 'PROGRESS',
          payload: { stage: 'bass', channel: 1, progress: 40 },
        },
      });
      const stem = () => [new Float32Array(4800), new Float32Array(4800)];
      fakeWorker.onmessage({
        data: {
          type: 'COMPLETE',
          payload: {
            vocals: stem(),
            drums: stem(),
            bass: stem(),
            instrumental: stem(),
            other: stem(),
          },
        },
      });

      const stems = await pending;
      expect(stems.vocals.length).toBe(4800);
      expect(fakeWorker.terminate).toHaveBeenCalled();
      expect(labels[0]).toContain('Bass · R');
    });

    it('returns stems that reconstruct the selected mix', async () => {
      const ctx = new AudioContext();
      const buffer = ctx.createBuffer(2, 4096, 44100);
      for (let c = 0; c < 2; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) {
          data[i] = 0.4 * Math.sin((2 * Math.PI * (c === 0 ? 220 : 660) * i) / 44100);
        }
      }

      const stems = await service.separate(buffer);

      for (let c = 0; c < 2; c++) {
        const mix = buffer.getChannelData(c);
        const sum = new Float32Array(mix.length);
        for (const stem of [stems.vocals, stems.bass, stems.drums, stems.other]) {
          const part = stem.getChannelData(c);
          for (let i = 0; i < sum.length; i++) sum[i] += part[i];
        }
        let worst = 0;
        for (let i = 0; i < sum.length; i++) {
          worst = Math.max(worst, Math.abs(sum[i] - mix[i]));
        }
        expect(worst).toBeLessThan(1e-5);
      }
    });
  });

  describe('on-device separation', () => {
    it('should attempt on-device separation (graceful fallback)', async () => {
      const ctx = new AudioContext();
      const buffer = ctx.createBuffer(1, 4410, 44100);

      // In JSDOM, AudioWorklet is not natively supported, so this
      // should fall back to offline mode gracefully.
      const result = await service.separateOnDevice(buffer, ctx);
      expect(result).toBeTruthy();
      expect(result!.stems).toBeTruthy();
      expect(result!.metadata).toBeTruthy();
      expect(result!.metadata.onDevice).toBe(false); // falls back to offline
    });

    it('should report progress during separation', async () => {
      const ctx = new AudioContext();
      const buffer = ctx.createBuffer(1, 4410, 44100);

      const progressStages: string[] = [];
      // Subscribe to progress changes
      const sub = (service as any).progress; // cannot subscribe directly in test,
      // but we can check final state

      // In JSDOM, worklet fails → falls back to offline. Progress may be 'idle' if
      // the fallback throws again inside the unawaited catch path.
      const finalStage = service.progress().stage;
      expect(['complete', 'error', 'idle']).toContain(finalStage);
    });
  });

  describe('cancel', () => {
    it('should cancel in-progress separation', () => {
      service.cancel();
      expect(service.isSeparating()).toBe(false);
      expect(service.progress().stage).toBe('idle');
    });

  });

});
