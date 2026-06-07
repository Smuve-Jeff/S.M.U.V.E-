import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
  APP_INITIALIZER,
  Injector,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
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
    provideHttpClient(),
    provideAnimations(),
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
        setTimeout(() => {
          try {
            injector.get(AuthService).loadSession();
          } catch (e) {}
        }, 0);
      },
      deps: [LoggingService, Injector],
      multi: true,
    },
  ],
};
