import {
  Injectable,
  signal,
  ApplicationRef,
  createComponent,
  EnvironmentInjector,
} from "@angular/core";
import {
  SnackbarComponent,
  SnackbarConfig,
} from "../studio/shared/snackbar/snackbar.component";

export type SnackbarType = "info" | "success" | "error" | "warning";

/** One action captured while the Studio is in quiet mode. */
export interface ActionLogEntry {
  id: number;
  message: string;
  type: SnackbarType;
  at: number;
}

/** The panel is a recency view, not an archive. */
const MAX_ACTION_LOG = 60;

@Injectable({
  providedIn: "root",
})
export class SnackbarService {
  private snackbarRef: any = null;
  private queue: SnackbarConfig[] = [];
  private isShowing = signal(false);

  /**
   * Routine Studio actions are recorded here instead of being painted over the
   * workspace. The Activity panel is the only surface that lists them.
   */
  readonly actionLog = signal<ActionLogEntry[]>([]);
  /** True while a Studio shell is mounted. */
  readonly studioQuiet = signal(false);
  private nextActionId = 0;

  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector,
  ) {}

  show(config: SnackbarConfig | string) {
    const snackbarConfig: SnackbarConfig =
      typeof config === "string" ? { message: config } : config;

    this.recordAction(snackbarConfig);
    // Keep the workspace calm: routine confirmations never become live toasts
    // while the Studio is open. Errors, warnings and undoable actions still do.
    if (this.studioQuiet() && this.isRoutine(snackbarConfig)) {
      return;
    }

    if (this.isShowing()) {
      this.queue.push(snackbarConfig);
      return;
    }

    this.displaySnackbar(snackbarConfig);
  }

  success(message: string, action?: string) {
    this.show({ message, action, type: "success" });
  }

  error(message: string, action?: string) {
    this.show({ message, action, type: "error" });
  }

  warning(message: string, action?: string) {
    this.show({ message, action, type: "warning" });
  }

  info(message: string, action?: string) {
    this.show({ message, action, type: "info" });
  }

  /** Enter or leave the Studio's quiet action-feedback mode. */
  setStudioQuiet(value: boolean): void {
    this.studioQuiet.set(value);
  }

  clearActionLog(): void {
    this.actionLog.set([]);
  }

  private recordAction(config: SnackbarConfig): void {
    if (!this.studioQuiet()) return;
    const entry: ActionLogEntry = {
      id: ++this.nextActionId,
      message: config.message,
      type: config.type ?? "info",
      at: Date.now(),
    };
    this.actionLog.update((entries) => [
      ...entries.slice(-(MAX_ACTION_LOG - 1)),
      entry,
    ]);
  }

  private isRoutine(config: SnackbarConfig): boolean {
    const type = config.type ?? "info";
    return (type === "info" || type === "success") && !config.action;
  }

  private displaySnackbar(config: SnackbarConfig) {
    if (!this.snackbarRef) {
      this.snackbarRef = createComponent(SnackbarComponent, {
        environmentInjector: this.injector,
      });

      this.appRef.attachView(this.snackbarRef.hostView);
      const domElem = (this.snackbarRef.hostView as any)
        .rootNodes[0] as HTMLElement;
      document.body.appendChild(domElem);
    }

    this.isShowing.set(true);
    this.snackbarRef.instance.show(config);
    // The toast is usually requested from inside a click handler, i.e. during
    // the change-detection pass that the handler kicked off. `show()` writes its
    // message signal in that same pass, and a dynamically attached view is not
    // revisited by the traversal already in flight — so the first paint of every
    // in-app toast was blank (only the close glyph rendered). Re-render the
    // toast's own view once its state is set.
    this.snackbarRef.changeDetectorRef.detectChanges();
    // Queued toasts reach the screen late; defer time-based actions (such as an
    // undo window) until this one is actually visible.
    config.onShown?.();

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
