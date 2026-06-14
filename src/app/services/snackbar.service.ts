import { Injectable, signal, ApplicationRef, createComponent, EnvironmentInjector } from '@angular/core';
import { SnackbarComponent, SnackbarConfig } from '../studio/shared/snackbar/snackbar.component';

@Injectable({
  providedIn: 'root',
})
export class SnackbarService {
  private snackbarRef: any = null;
  private queue: SnackbarConfig[] = [];
  private isShowing = signal(false);

  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector
  ) {}

  show(config: SnackbarConfig | string) {
    const snackbarConfig: SnackbarConfig = typeof config === 'string' 
      ? { message: config }
      : config;

    if (this.isShowing()) {
      this.queue.push(snackbarConfig);
      return;
    }

    this.displaySnackbar(snackbarConfig);
  }

  success(message: string, action?: string) {
    this.show({ message, action, type: 'success' });
  }

  error(message: string, action?: string) {
    this.show({ message, action, type: 'error' });
  }

  warning(message: string, action?: string) {
    this.show({ message, action, type: 'warning' });
  }

  info(message: string, action?: string) {
    this.show({ message, action, type: 'info' });
  }

  private displaySnackbar(config: SnackbarConfig) {
    if (!this.snackbarRef) {
      this.snackbarRef = createComponent(SnackbarComponent, {
        environmentInjector: this.injector
      });
      
      this.appRef.attachView(this.snackbarRef.hostView);
      const domElem = (this.snackbarRef.hostView as any).rootNodes[0] as HTMLElement;
      document.body.appendChild(domElem);
    }

    this.isShowing.set(true);
    this.snackbarRef.instance.show(config);

    setTimeout(() => {
      this.isShowing.set(false);
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) {
          setTimeout(() => this.displaySnackbar(next), 300);
        }
      }
    }, config.duration || 4000);
  }
}
