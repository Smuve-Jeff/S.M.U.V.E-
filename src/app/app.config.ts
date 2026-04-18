import {
  ApplicationConfig,
  provideZonelessChangeDetection,
  isDevMode,
  inject,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideAiService } from './services/ai.service';
import { APP_INITIALIZER } from '@angular/core';
import { AutoSaveService } from './services/auto-save.service';
import { LoggingService } from './services/logging.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAnimations(),
    provideAiService(),
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const logger = inject(LoggingService);
        const _autoSave = inject(AutoSaveService);
        return () => {
          logger.system(
            'S.M.U.V.E 2.0 Strategic Music Utility Virtual Enterprise Initialized'
          );
          logger.info('Auto-Save Service Initialized');
        };
      },
      multi: true,
    },
  ],
};
