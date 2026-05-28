import { Injectable, signal, inject } from '@angular/core';
import { LoggingService } from './logging.service';

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface AppPermission {
  name: string;
  label: string;
  icon: string;
  description: string;
  status: PermissionStatus;
}

@Injectable({
  providedIn: 'root',
})
export class PermissionService {
  private logger = inject(LoggingService);

  permissions = signal<AppPermission[]>([
    {
      name: 'microphone',
      label: 'Microphone',
      icon: '🎙️',
      description: 'Required for vocal recording and live instrument sampling.',
      status: 'prompt',
    },
    {
      name: 'notifications',
      label: 'Notifications',
      icon: '🔔',
      description: 'Enables system alerts for export completion and cloud sync status.',
      status: 'prompt',
    },
    {
      name: 'clipboard-read',
      label: 'Clipboard access',
      icon: '📋',
      description: 'Allows pasting of samples, presets, and neural data directly into the shell.',
      status: 'prompt',
    },
    {
      name: 'midi',
      label: 'MIDI Hardware',
      icon: '🎹',
      description: 'Access to physical MIDI controllers and synthesizers.',
      status: 'prompt',
    },
    {
      name: 'geolocation',
      label: 'Geospatial Context',
      icon: '📍',
      description: 'Used for localized market intel and touring proximity analysis.',
      status: 'prompt',
    },
  ]);

  constructor() {
    this.refreshAllStatuses();
  }

  async refreshAllStatuses() {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      this.permissions.update(ps => ps.map(p => ({ ...p, status: 'unsupported' })));
      return;
    }

    const updatedPermissions = await Promise.all(
      this.permissions().map(async (p) => {
        try {
          // Some permissions might not be supported by all browsers or need specific options
          const name = p.name as any;
          const status = await navigator.permissions.query({ name });
          return { ...p, status: status.state as PermissionStatus };
        } catch (e) {
          return { ...p, status: 'unsupported' as PermissionStatus };
        }
      })
    );

    this.permissions.set(updatedPermissions);
  }

  async requestPermission(name: string): Promise<boolean> {
    try {
      if (name === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } else if (name === 'notifications') {
        const status = await Notification.requestPermission();
        this.refreshAllStatuses();
        return status === 'granted';
      } else if (name === 'geolocation') {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => { resolve(true); this.refreshAllStatuses(); },
            () => { resolve(false); this.refreshAllStatuses(); }
          );
        });
      }

      // For others, we refresh status as many are auto-granted or triggered by other actions
      await this.refreshAllStatuses();
      return this.permissions().find(p => p.name === name)?.status === 'granted';
    } catch (e) {
      this.logger.error(`Failed to request permission: ${name}`, e);
      return false;
    }
  }
}
