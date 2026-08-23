import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
  APP_INITIALIZER,
  Injector,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './interceptors/auth.interceptor';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import { LoggingService } from './services/logging.service';
import { AuthService } from './services/auth.service';
import { SecurityService } from './services/security.service';
import { UserProfileService } from './services/user-profile.service';
import { DatabaseService } from './services/database.service';
import { TokenService } from './services/token.service';
import { LoginConfirmationService } from './services/login-confirmation.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    AuthService,
    SecurityService,
    UserProfileService,
    DatabaseService,
    TokenService,
    LoginConfirmationService,
    {
      provide: APP_INITIALIZER,
      useFactory: (logger: LoggingService, injector: Injector) => () => {
        logger.system('S.M.U.V.E 2.0 INITIALIZED');
        return injector.get(AuthService).loadSession().catch(() => undefined);
      },
      deps: [LoggingService, Injector],
      multi: true,
    },
  ],
};
