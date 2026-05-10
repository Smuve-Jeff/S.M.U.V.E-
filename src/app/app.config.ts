import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
  inject,
  APP_INITIALIZER,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';

import { provideAiService } from './services/ai.service';
import { AutoSaveService } from './services/auto-save.service';
import { HistoryService } from './services/history.service';
import { SecurityService } from './services/security.service';
import { LoggingService } from './services/logging.service';
import { AuthService } from './services/auth.service';
import { UserProfileService } from './services/user-profile.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAnimations(),
    provideAiService(),
    // Add new providers here:
    AuthService,
    UserProfileService,
    HistoryService,
    SecurityService,
    AutoSaveService,
    LoggingService,
    {
      provide: APP_INITIALIZER,
      useFactory: (logger: LoggingService, autoSave: AutoSaveService, auth: AuthService, security: SecurityService) => () => {
        logger.system('S.M.U.V.E 2.0 Strategic Music Utility Virtual Enterprise Initialized');
        logger.info('Auth Service Initialized');
        logger.info('Auto-Save Service Initialized');
        logger.info('Security Service Initialized');
        // You can add more initialization logic here if needed
      },
      deps: [LoggingService, AutoSaveService, AuthService, SecurityService],
      multi: true,
    },
  ],
};
