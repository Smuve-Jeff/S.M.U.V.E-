import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
  APP_INITIALIZER,
  ErrorHandler,
  Injector,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
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
import { GlobalErrorHandler } from './services/error-handler.service';
import { ArtistLifecycleAlertService } from './services/artist-lifecycle-alert.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    /*
     * `enabled`: every workspace is a surface of its own, so opening one has to
     * land at its top. This was silently ineffective while <body> was the scroll
     * container (see the root-scroller rules in styles.css) — the router
     * scrolls the root, and <html> never moved. `scrollPositionRestoration`
     * needs the viewport to be the scroller, and styles.css now guarantees that.
     */
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      })
    ),
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
    /*
     * Angular falls back to its built-in handler unless one is provided, and
     * the built-in one only logs to the console. Without this registration the
     * app shipped no user-facing error reporting at all, even though
     * `GlobalErrorHandler` implements exactly that.
     */
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    {
      provide: APP_INITIALIZER,
      useFactory: (logger: LoggingService, injector: Injector) => () => {
        logger.system('S.M.U.V.E 2.0 INITIALIZED');
        // Start the lifecycle watcher at boot so transitions are observed on
        // every surface, not only after the hub is opened. It stays silent
        // until the profile is hydrated and something actually changes.
        injector.get(ArtistLifecycleAlertService);
        return injector.get(AuthService).loadSession().catch(() => undefined);
      },
      deps: [LoggingService, Injector],
      multi: true,
    },
  ],
};
