import { SessionSafetyService } from './session-safety.service';

describe('SessionSafetyService', () => {
  let service: SessionSafetyService;

  beforeEach(() => {
    service = new SessionSafetyService();
  });

  describe('exitRisk', () => {
    it('is null when nothing is at risk', () => {
      expect(service.exitRisk()).toBeNull();
    });

    it('names unsaved work and armed tracks', () => {
      service.hasUnsavedChanges.set(true);
      service.armedTakeCount.set(2);

      expect(service.exitRisk()).toBe(
        'This set has unsaved changes. A track is armed for recording.',
      );
    });

    it('prefers a live take and an in-flight save over dirty state', () => {
      service.isRecording.set(true);
      service.isProjectSaving.set(true);
      service.hasUnsavedChanges.set(true);

      expect(service.exitRisk()).toBe(
        'A take is recording. A save is still finishing.',
      );
    });
  });

  describe('exportBackup', () => {
    it('reports that the Studio must be open when no handler exists', () => {
      const result = service.exportBackup();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('Open the Studio');
    });

    it('returns the export handler outcome', () => {
      service.registerExportHandler(() => ({ ok: true }));
      expect(service.exportBackup()).toEqual({ ok: true });

      service.registerExportHandler(() => ({
        ok: false,
        message: 'Audio is missing.',
      }));
      expect(service.exportBackup()).toEqual({
        ok: false,
        message: 'Audio is missing.',
      });
    });

    it('turns a throwing export into a readable failure', () => {
      service.registerExportHandler(() => {
        throw new Error('Audio is missing.');
      });

      expect(service.exportBackup()).toEqual({
        ok: false,
        message: 'Audio is missing.',
      });
    });
  });

  describe('saveForUpdate', () => {
    it('reports that the Studio must be open when no handler exists', async () => {
      await expect(service.saveForUpdate()).resolves.toEqual(
        expect.objectContaining({ ok: false }),
      );
    });

    it('turns a throwing save into a readable failure', async () => {
      service.registerSaveHandler(async () => {
        throw new Error('Guest sessions are not saved.');
      });

      await expect(service.saveForUpdate()).resolves.toEqual({
        ok: false,
        message: 'Guest sessions are not saved.',
      });
    });
  });
});
