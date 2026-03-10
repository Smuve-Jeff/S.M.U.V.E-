import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
  ErrorHandler,
  APP_INITIALIZER,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideAiService, API_KEY_TOKEN } from './services/ai.service';
import { GlobalErrorHandler } from './services/error-handler.service';
import { AutoSaveService } from './services/auto-save.service';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAiService(),
    { provide: API_KEY_TOKEN, useValue: window.localStorage.getItem('SMUVE_API_KEY') || '' },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    {
      provide: APP_INITIALIZER,
      useFactory: (autoSave: AutoSaveService) => () => {
        console.log('Auto-Save Service Initialized');
      },
      deps: [AutoSaveService],
      multi: true,
    },
  ],
};
