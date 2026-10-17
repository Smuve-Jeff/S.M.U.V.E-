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
