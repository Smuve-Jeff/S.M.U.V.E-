import { TestBed } from '@angular/core/testing';
import { FileLoaderService } from '../file-loader.service';

describe('FileLoaderService', () => {
  let service: FileLoaderService;
  let mockAudioContext: any;

  beforeEach(() => {
    mockAudioContext = {
      decodeAudioData: jest.fn().mockResolvedValue({
        duration: 1.0,
        sampleRate: 44100,
        numberOfChannels: 2,
      }),
    };

    TestBed.configureTestingModule({
      providers: [FileLoaderService],
    });
    service = TestBed.inject(FileLoaderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should decode array buffer to AudioBuffer', async () => {
    const buffer = new ArrayBuffer(8);
    const result = await service.decodeToAudioBuffer(mockAudioContext, buffer);

    expect(mockAudioContext.decodeAudioData).toHaveBeenCalled();
    expect(result.duration).toBe(1.0);
  });

  it('should handle decoding errors', async () => {
    mockAudioContext.decodeAudioData.mockRejectedValue(
      new Error('Decode error')
    );
    const buffer = new ArrayBuffer(8);

    await expect(
      service.decodeToAudioBuffer(mockAudioContext, buffer)
    ).rejects.toThrow('Failed to decode audio file');
  });
});
