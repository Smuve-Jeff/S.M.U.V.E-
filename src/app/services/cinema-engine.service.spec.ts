import { TestBed } from '@angular/core/testing';
import { CinemaEngine } from 'cinema-engine';
import { CinemaEngineService } from './cinema-engine.service';

/**
 * The engine bridge is the seam that decides whether a measured take reaches
 * the timeline, so both outcomes are tested: a readable file hands back real
 * metadata, and anything the browser cannot read hands back null so the clip
 * keeps the length it was placed with.
 */
describe('CinemaEngineService', () => {
  const createService = (extractVideoMetadata: jest.Mock) => {
    jest.spyOn(CinemaEngine.prototype, 'extractVideoMetadata').mockImplementation(
      extractVideoMetadata
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [CinemaEngineService] });
    return TestBed.inject(CinemaEngineService);
  };

  afterEach(() => jest.restoreAllMocks());

  const file = { name: 'take.mp4' } as unknown as File;

  it('returns the measured metadata of a readable file', async () => {
    const metadata = {
      duration: 47.2,
      width: 1920,
      height: 1080,
      aspectRatio: 1.7778,
      type: 'video/mp4',
      size: 2048,
      filename: 'take.mp4',
    };
    const service = createService(jest.fn(async () => metadata));

    await expect(service.measureVideo(file)).resolves.toEqual(metadata);
  });

  it('returns null instead of throwing when the codec cannot be read', async () => {
    const service = createService(
      jest.fn(async () => {
        throw new Error('Unsupported media');
      })
    );

    await expect(service.measureVideo(file)).resolves.toBeNull();
  });

  it('captures a poster frame 10% into the take', async () => {
    const captureThumbnail = jest
      .spyOn(CinemaEngine.prototype, 'captureThumbnail')
      .mockResolvedValue({
        blob: new Blob(),
        url: 'blob:poster',
        width: 240,
        height: 135,
        time: 4.7,
        type: 'image/jpeg',
      });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [CinemaEngineService] });
    const service = TestBed.inject(CinemaEngineService);

    await expect(service.capturePoster(file)).resolves.toEqual({
      url: 'blob:poster',
      width: 240,
      height: 135,
    });
    expect(captureThumbnail).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ at: 0.1, timeIsFraction: true })
    );
  });

  it('returns null when a frame cannot be decoded', async () => {
    jest
      .spyOn(CinemaEngine.prototype, 'captureThumbnail')
      .mockRejectedValue(new Error('Unsupported media'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [CinemaEngineService] });
    const service = TestBed.inject(CinemaEngineService);

    await expect(service.capturePoster(file)).resolves.toBeNull();
  });

  it('treats an unknown duration as no measurement at all', async () => {
    const service = createService(
      jest.fn(async () => ({
        duration: 0,
        width: 0,
        height: 0,
        aspectRatio: 0,
        type: '',
        size: 0,
        filename: 'take.mp4',
      }))
    );

    await expect(service.measureVideo(file)).resolves.toBeNull();
  });
});
