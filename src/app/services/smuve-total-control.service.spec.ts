import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { SmuveTotalControlService } from './smuve-total-control.service';
import { UserProfileService } from './user-profile.service';
import { ProjectService } from './project.service';
import { MusicManagerService } from './music-manager.service';
import { NotificationService } from './notification.service';
import { SnackbarService } from './snackbar.service';
import { AiService } from './ai.service';
import { SmuveKnowledgeEngine } from './smuve-knowledge-engine';
import { SongwritingAssistantService } from './songwriting-assistant.service';
import { AiBeatGeneratorService } from './ai-beat-generator.service';
import { CoWriteService } from './cowrite.service';

describe('SmuveTotalControlService', () => {
  let service: SmuveTotalControlService;
  let router: { navigate: jest.Mock };
  let profileSignal: ReturnType<typeof signal<any>>;
  let updateProfile: jest.Mock;

  const initialProfileStub = () => ({
    artistName: 'Test Artist',
    primaryGenre: 'Hip Hop',
    profileSetupCompleted: true,
    settings: {
      ai: {
        aiTotalControlEnabled: false,
        aiProfanityEnabled: true,
        aiPersonaIntensityEnabled: true,
        commanderPersona: 'Ominous Musical GOD',
      },
    },
  });

  beforeEach(() => {
    profileSignal = signal<any>(initialProfileStub());
    router = { navigate: jest.fn() };
    updateProfile = jest.fn(async (patch: any) => {
      profileSignal.update((current) => ({ ...current, ...patch }));
    });

    TestBed.configureTestingModule({
      providers: [
        SmuveTotalControlService,
        { provide: Router, useValue: router },
        {
          provide: UserProfileService,
          useValue: { profile: profileSignal, updateProfile },
        },
        { provide: ProjectService, useValue: {} },
        { provide: MusicManagerService, useValue: { tracks: signal([]) } },
        { provide: NotificationService, useValue: { show: jest.fn() } },
        { provide: SnackbarService, useValue: { show: jest.fn() } },
        { provide: AiService, useValue: { performExecutiveAudit: jest.fn() } },
        { provide: SmuveKnowledgeEngine, useValue: {} },
        { provide: SongwritingAssistantService, useValue: {} },
        { provide: AiBeatGeneratorService, useValue: {} },
        { provide: CoWriteService, useValue: {} },
      ],
    });

    service = TestBed.inject(SmuveTotalControlService);
  });

  it('keeps safe commands working while full control is off', async () => {
    const result = await service.executeCommand('/go studio');

    expect(result.success).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/studio']);
  });

  it('navigates the whole application, including multi-word modules', async () => {
    await service.executeCommand('/go remix arena');
    expect(router.navigate).toHaveBeenLastCalledWith(['/remix-arena']);

    await service.executeCommand('/go knowledge base');
    expect(router.navigate).toHaveBeenLastCalledWith(['/knowledge-base']);

    await service.executeCommand('/go mastering');
    expect(router.navigate).toHaveBeenLastCalledWith(['/mastering']);

    const unknown = await service.executeCommand('/go nowhere');
    expect(unknown.success).toBe(false);
    expect(unknown.message).toContain('Unknown destination');
  });

  it('refuses project commands until the artist grants command authority', async () => {
    const result = await service.executeCommand('/project save');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Full-Control Mode is off');
    expect(result.actionRequired).toBe(
      'Enable AI Total Control in Settings'
    );
  });

  it('still answers read-only questions while full control is off', async () => {
    const formats = await service.executeCommand('/export formats');
    const tracks = await service.executeCommand('/tracks list');
    const project = await service.executeCommand('/project status');

    expect(formats.success).toBe(true);
    expect(formats.message).toContain('EXPORT FORMATS');
    expect(tracks.success).toBe(true);
    expect(project.success).toBe(true);
  });

  it('executes the same project command once full control is granted', async () => {
    await service.executeCommand('/ai totalcontrol');
    expect(
      profileSignal().settings.ai.aiTotalControlEnabled
    ).toBe(true);

    const result = await service.executeCommand('/project save');

    expect(result.success).toBe(true);
    expect(result.message).toContain('Project saved');
  });

  it('toggles full control from chat without needing full control first', async () => {
    const result = await service.executeCommand('/ai totalcontrol');

    expect(result.success).toBe(true);
    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          ai: expect.objectContaining({ aiTotalControlEnabled: true }),
        }),
      })
    );
  });

  it('switches persona modes from chat and reports the active directive', async () => {
    const result = await service.executeCommand('/ai persona supportive');

    expect(result.success).toBe(true);
    expect(result.message).toContain('Supportive');
    expect(profileSignal().settings.ai.commanderPersona).toBe('Supportive');
  });

  it('restores the default ominous Musical GOD persona by name or alias', async () => {
    await service.executeCommand('/ai persona supportive');
    const result = await service.executeCommand('/ai persona god');

    expect(result.success).toBe(true);
    expect(result.message).toContain('PERSONA RESTORED');
    expect(profileSignal().settings.ai.commanderPersona).toBe(
      'Ominous Musical GOD'
    );
  });

  it('rejects an unknown persona instead of silently resetting the character', async () => {
    const result = await service.executeCommand('/ai persona nonsense');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown persona');
    expect(profileSignal().settings.ai.commanderPersona).toBe(
      'Ominous Musical GOD'
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('lists the persona roster with the default flagged', async () => {
    const result = await service.executeCommand('/ai persona');

    expect(result.success).toBe(true);
    expect(result.message).toContain('Ominous Musical GOD (default)');
    expect(result.message).toContain('Supportive');
  });

  it('toggles persona intensity from chat', async () => {
    const result = await service.executeCommand('/ai intensity');

    expect(result.success).toBe(true);
    expect(profileSignal().settings.ai.aiPersonaIntensityEnabled).toBe(false);
  });

  it('keeps unrelated AI preferences intact when one is patched', async () => {
    await service.executeCommand('/ai profanity');

    const ai = profileSignal().settings.ai;
    expect(ai.aiProfanityEnabled).toBe(false);
    expect(ai.aiPersonaIntensityEnabled).toBe(true);
    expect(ai.commanderPersona).toBe('Ominous Musical GOD');
  });

  it('reports an unknown command instead of guessing', async () => {
    const result = await service.executeCommand('make me famous');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Command not recognized');
  });
});
