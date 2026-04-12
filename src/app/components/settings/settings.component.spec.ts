import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SettingsComponent } from './settings.component';
import { UserProfileService } from '../../services/user-profile.service';
import { UIService } from '../../services/ui.service';
import { NotificationService } from '../../services/notification.service';
import { SecurityService } from '../../services/security.service';
import { MicrophoneService } from '../../services/microphone.service';
import { AudioEngineService } from '../../services/audio-engine.service';
import { AuthService } from '../../services/auth.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';

describe('SettingsComponent', () => {
  const createComponent = async () => {
    const profileServiceMock = {
      profile: signal({
        settings: {
          ui: {
            theme: 'Dark',
            performanceMode: false,
            showScanlines: false,
            animationsEnabled: true,
          },
          audio: {
            masterVolume: 0.8,
            autoSaveEnabled: true,
            sampleRate: 48000,
            bufferSize: 256,
            defaultExportFormat: 'wav',
          },
          ai: {
            kbWriteAccess: true,
            commanderPersona: 'Elite',
            autoAuditEnabled: false,
          },
          studio: {
            defaultQuantize: '1/16',
            autoMixEnabled: false,
          },
          security: {
            twoFactorEnabled: false,
            endToEndEncryption: false,
            biometricLock: false,
            auditLogEnabled: false,
            sessionTimeout: 3600,
          },
        },
      }),
      updateProfile: jest.fn().mockResolvedValue(undefined),
    };

    const microphoneServiceMock = {
      availableDevices: signal([
        {
          deviceId: 'focusrite',
          label: 'Focusrite Scarlett',
          type: 'interface',
          isDefault: true,
          capabilities: ['default', 'stereo'],
        },
      ]),
      selectedDeviceId: signal<string | null>('focusrite'),
      updateAvailableDevices: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
    };

    const audioEngineMock = {
      outputMode: signal<'speakers' | 'headphones'>('speakers'),
      setOutputMode: jest.fn(),
    };

    const securityServiceMock = {
      fetchLogs: jest.fn(),
      fetchSessions: jest.fn(),
      logEvent: jest.fn().mockResolvedValue(undefined),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      sessions: signal([]),
      logs: signal([]),
    };

    const authServiceMock = {
      logout: jest.fn(),
    };

    const dialogMock = {
      confirm: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: UserProfileService, useValue: profileServiceMock },
        {
          provide: UIService,
          useValue: {
            setTheme: jest.fn(),
            performanceMode: signal(false),
            togglePerformanceMode: jest.fn(),
            navigateToView: jest.fn(),
            getAvailableThemes: jest.fn().mockReturnValue([
              {
                name: 'Light',
                primary: '#10b981',
                accent: '#f59e0b',
                neutral: '#f8fafc',
                purple: '#6366f1',
                red: '#ef4444',
                blue: '#3b82f6',
              },
              {
                name: 'Dark',
                primary: '#10b981',
                accent: '#38bdf8',
                neutral: '#020617',
                purple: '#6366f1',
                red: '#f43f5e',
                blue: '#3b82f6',
              },
            ]),
          },
        },
        { provide: NotificationService, useValue: { show: jest.fn() } },
        { provide: SecurityService, useValue: securityServiceMock },
        { provide: MicrophoneService, useValue: microphoneServiceMock },
        { provide: AudioEngineService, useValue: audioEngineMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: InteractionDialogService, useValue: dialogMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SettingsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return {
      component,
      microphoneServiceMock,
      audioEngineMock,
      securityServiceMock,
      authServiceMock,
      dialogMock,
    };
  };

  it('refreshes audio input devices from settings audio tab actions', async () => {
    const { component, microphoneServiceMock } = await createComponent();

    await component.refreshAudioInputs();

    expect(microphoneServiceMock.updateAvailableDevices).toHaveBeenCalled();
  });

  it('routes audio input selection through microphone initialization', async () => {
    const { component, microphoneServiceMock } = await createComponent();

    await component.selectAudioInput('focusrite');

    expect(microphoneServiceMock.initialize).toHaveBeenCalledWith('focusrite');
  });

  it('sets output monitor mode through audio engine', async () => {
    const { component, audioEngineMock } = await createComponent();

    component.setOutputMode('headphones');

    expect(audioEngineMock.setOutputMode).toHaveBeenCalledWith('headphones');
  });

  it('loads security data on initialization', async () => {
    const { securityServiceMock } = await createComponent();

    expect(securityServiceMock.fetchLogs).toHaveBeenCalled();
    expect(securityServiceMock.fetchSessions).toHaveBeenCalled();
  });

  it('syncs theme changes through the shared UI service', async () => {
    const { component } = await createComponent();
    const uiService = TestBed.inject(UIService) as {
      setTheme: jest.Mock;
    };

    await component.updateSetting('ui' as any, 'theme', 'Light');

    expect(uiService.setTheme).toHaveBeenCalledWith('Light');
  });

  it('purgeProfile logs the event and calls logout when confirmed', async () => {
    const { component, securityServiceMock, authServiceMock, dialogMock } =
      await createComponent();

    dialogMock.confirm.mockResolvedValue(true);

    await component.purgeProfile();

    expect(securityServiceMock.logEvent).toHaveBeenCalledWith(
      'PROFILE_PURGE',
      'User initiated irreversible profile purge.'
    );
    expect(authServiceMock.logout).toHaveBeenCalled();
  });

  it('purgeProfile does nothing when user cancels the confirmation', async () => {
    const { component, securityServiceMock, authServiceMock, dialogMock } =
      await createComponent();

    dialogMock.confirm.mockResolvedValue(false);

    await component.purgeProfile();

    expect(securityServiceMock.logEvent).not.toHaveBeenCalledWith(
      'PROFILE_PURGE',
      expect.any(String)
    );
    expect(authServiceMock.logout).not.toHaveBeenCalled();
  });
});
