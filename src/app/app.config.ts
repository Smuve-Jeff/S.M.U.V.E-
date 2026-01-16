import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideAiService, API_KEY_TOKEN } from './services/ai.service';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideAiService(),
    {
      provide: API_KEY_TOKEN,
      useFactory: () =>
        (globalThis as any).__env?.aiApiKey ??
        (globalThis as any).process?.env?.NG_APP_AI_API_KEY ??
        ''
    }
  ]
};
