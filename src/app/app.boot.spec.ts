import {
  ApplicationRef,
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { appConfig } from './app.config';
import { AppComponent } from './app.component';
import { AuthService } from './services/auth.service';
import { CLOUD_SERVER } from './services/cloud-server-client';
import { HttpCloudServer } from './services/http-cloud-server';

/**
 * Guard the real application provider graph, not a test-only stub list.
 *
 * Component specs routinely replace every dependency with a mock, so a token
 * that is only bound in `app.config.ts` can be missing for months and still
 * leave the suite green. This spec boots the production providers and then
 * constructs the root component, which resolves every `inject()` in the shell.
 */
describe('application bootstrap DI', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...(appConfig.providers ?? []),
        // Jest runs zoneless; the app config opts into Zone change detection.
        provideZonelessChangeDetection(),
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('resolves the production root provider graph', () => {
    const injector = TestBed.inject(EnvironmentInjector);

    expect(injector.get(CLOUD_SERVER)).toBeInstanceOf(HttpCloudServer);
    expect(injector.get(AuthService)).toBeInstanceOf(AuthService);
    expect(TestBed.inject(ApplicationRef)).toBeTruthy();
  });

  it('constructs the root component with every injected dependency', () => {
    const injector = TestBed.inject(EnvironmentInjector);
    const component = runInInjectionContext(injector, () => new AppComponent());

    expect(component).toBeTruthy();
  });
});
