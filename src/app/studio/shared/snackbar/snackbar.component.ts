import { Component, ElementRef, OnDestroy, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";

export type SnackbarConfig = {
  message: string;
  action?: string;
  duration?: number;
  type?: "info" | "success" | "error" | "warning";
};

@Component({
  selector: "app-snackbar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./snackbar.component.html",
  styleUrls: ["./snackbar.component.css", "../platform-ux.css"],
  /* The slide-in/opacity state is styled as `:host(.visible)`, but the
     template only toggled `visible` on the inner `div.snackbar`, so the host
     stayed at `opacity: 0` and every toast rendered invisible. Bind the state
     class to the host where the CSS reads it. */
  host: { "[class.visible]": "visible()" },
})
export class SnackbarComponent implements OnDestroy {
  visible = signal(false);
  message = signal("");
  action = signal<string | undefined>(undefined);
  type = signal<"info" | "success" | "error" | "warning">("info");
  private timeoutId?: number;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    window.addEventListener("resize", this.onViewportChange);
  }

  ngOnDestroy() {
    window.removeEventListener("resize", this.onViewportChange);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  private readonly onViewportChange = () => {
    if (this.visible()) {
      this.anchorBelowStudioChrome();
    }
  };

  /**
   * Park the toast just below the Studio chrome instead of at a fixed offset.
   * The chrome stack (status strip + topbar + toolbar + AI band) measures
   * 142–223px depending on the tier and header-collapse state, so every fixed
   * `top` landed the toast *on* the topbar/toolbar on phones. The primary
   * canvas starts exactly where the chrome ends, so anchor to its top edge;
   * the fallback keeps the pre-measurement (non-Studio) placement sane.
   */
  private anchorBelowStudioChrome() {
    const canvas = document.querySelector<HTMLElement>(
      ".comp-canvas.studio-primary-canvas"
    );
    const top = canvas
      ? Math.round(canvas.getBoundingClientRect().top) + 8
      : 80;
    this.host.nativeElement.style.top = `${top}px`;
  }

  show(config: SnackbarConfig) {
    this.anchorBelowStudioChrome();
    this.message.set(config.message);
    this.action.set(config.action);
    this.type.set(config.type || "info");
    this.visible.set(true);

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const duration = config.duration || 4000;
    this.timeoutId = window.setTimeout(() => {
      this.hide();
    }, duration);
  }

  hide() {
    this.visible.set(false);
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  onAction() {
    this.hide();
  }
}
