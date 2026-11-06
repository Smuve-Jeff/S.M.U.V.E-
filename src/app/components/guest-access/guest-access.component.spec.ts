import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
} from '@angular/router';
import { of } from 'rxjs';

import { GuestAccessComponent } from './guest-access.component';
import { AuthService } from '../../services/auth.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { NotificationService } from '../../services/notification.service';
import { SessionSafetyService } from '../../services/session-safety.service';
import { UIService } from '../../services/ui.service';

describe('GuestAccessComponent exit guard', () => {
  let component: GuestAccessComponent;
  let auth: { currentUser: unknown; isGuest: unknown; logout: jest.Mock };
  let dialog: { confirm: jest.Mock; confirmWithAlternate: jest.Mock };
  let notifications: { show: jest.Mock };
  let router: { navigate: jest.Mock; navigateByUrl: jest.Mock };

  beforeEach(async () => {
    auth = {
      currentUser: signal(null),
      isGuest: signal(true),
      logout: jest.fn(),
    };
    dialog = {
      confirm: jest.fn().mockResolvedValue(false),
      confirmWithAlternate: jest.fn().mockResolvedValue('cancel'),
    };
    notifications = { show: jest.fn() };
    router = { navigate: jest.fn(), navigateByUrl: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [GuestAccessComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: UIService,
          useValue: {
            getViewConfigs: jest.fn().mockReturnValue([]),
            getViewConfig: jest.fn(),
            navigateToView: jest.fn(),
          },
        },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({})) },
        },
        { provide: InteractionDialogService, useValue: dialog },
        { provide: NotificationService, useValue: notifications },
      ],
    })
      .overrideComponent(GuestAccessComponent, {
        set: { imports: [], template: '<div></div>' },
      })
      .compileComponents();

    component = TestBed.createComponent(GuestAccessComponent).componentInstance;
  });

  it('exits immediately when nothing is at risk', async () => {
    await component.exitGuestSession();

    expect(dialog.confirm).not.toHaveBeenCalled();
    expect(dialog.confirmWithAlternate).not.toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('offers export-and-exit for unsaved scratch work', async () => {
    const safety = TestBed.inject(SessionSafetyService);
    safety.hasUnsavedChanges.set(true);
    const exportBackup = jest.fn(() => ({ ok: true }));
    safety.registerExportHandler(exportBackup);
    dialog.confirmWithAlternate.mockResolvedValueOnce('confirm');

    await component.exitGuestSession();

    expect(dialog.confirmWithAlternate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Exit guest session?',
        confirmLabel: 'Export backup & exit',
        alternateLabel: 'Exit without export',
        cancelLabel: 'Keep working',
        tone: 'danger',
      }),
    );
    expect(exportBackup).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('stays in the guest session when the export fails', async () => {
    const safety = TestBed.inject(SessionSafetyService);
    safety.hasUnsavedChanges.set(true);
    safety.registerExportHandler(() => ({
      ok: false,
      message: 'Audio is missing.',
    }));
    dialog.confirmWithAlternate.mockResolvedValueOnce('confirm');

    await component.exitGuestSession();

    expect(auth.logout).not.toHaveBeenCalled();
    expect(notifications.show).toHaveBeenCalledWith('Audio is missing.', 'error');
  });

  it('can still discard the scratch set without exporting', async () => {
    const safety = TestBed.inject(SessionSafetyService);
    safety.hasUnsavedChanges.set(true);
    const exportBackup = jest.fn(() => ({ ok: true }));
    safety.registerExportHandler(exportBackup);
    dialog.confirmWithAlternate.mockResolvedValueOnce('alternate');

    await component.exitGuestSession();

    expect(exportBackup).not.toHaveBeenCalled();
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('does not offer a backup during a live take', async () => {
    const safety = TestBed.inject(SessionSafetyService);
    safety.hasUnsavedChanges.set(true);
    safety.isRecording.set(true);
    const exportBackup = jest.fn(() => ({ ok: true }));
    safety.registerExportHandler(exportBackup);
    dialog.confirm.mockResolvedValueOnce(false);

    await component.exitGuestSession();

    expect(dialog.confirmWithAlternate).not.toHaveBeenCalled();
    expect(dialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('take is recording'),
      }),
    );
    expect(exportBackup).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
