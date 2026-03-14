import { ApplicationConfig, provideZoneChangeDetection, isDevMode, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideAiService } from './services/ai.service';
import { APP_INITIALIZER } from '@angular/core';
import { AutoSaveService } from './services/auto-save.service';
import { LoggingService } from './services/logging.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideAnimations(),
    provideAiService(),
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const logger = inject(LoggingService);
        const autoSave = inject(AutoSaveService);
        return () => {
          logger.system('S.M.U.V.E 4.0 Executive Suite Initialized');
          logger.info('Auto-Save Service Initialized');
        };
      },
      multi: true
    }
  ]
};
