import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ProjectWorkspaceService } from "../project-workspace.service";
import {
  type AudioIntegrityIssue,
  type AudioIntegrityIssueReason,
} from "../project-integrity.util";
import { StudioBottomSheetComponent } from "../shared/studio-bottom-sheet/studio-bottom-sheet.component";
import { SnackbarService } from "../../services/snackbar.service";

/**
 * Lists audio clips whose take is not in the project and lets the artist fix
 * each one in place: relink a file from the device or remove the silent clip.
 * It sits on the shared bottom sheet so the behaviour is the same on phones and
 * narrow desktop windows.
 */
@Component({
  selector: "app-audio-repair",
  standalone: true,
  imports: [CommonModule, StudioBottomSheetComponent],
  templateUrl: "./audio-repair.component.html",
  styleUrl: "./audio-repair.component.css",
})
export class AudioRepairComponent implements OnChanges {
  readonly workspace = inject(ProjectWorkspaceService);
  private readonly snackbar = inject(SnackbarService);

  @Input() open = false;
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild("relinkInput")
  private relinkInput?: ElementRef<HTMLInputElement>;

  readonly issues = computed(
    () => this.workspace.audioIntegrity()?.issues ?? [],
  );
  readonly busy = signal(false);
  private readonly activeIssue = signal<AudioIntegrityIssue | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["open"]?.currentValue === true) {
      this.workspace.inspectCurrentAudioIntegrity();
    }
  }

  pickFile(issue: AudioIntegrityIssue): void {
    if (!issue.clipId || this.busy()) return;
    this.activeIssue.set(issue);
    this.relinkInput?.nativeElement.click();
  }

  async onFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const issue = this.activeIssue();
    input.value = "";
    this.activeIssue.set(null);
    if (!issue || !file) return;

    this.busy.set(true);
    try {
      const repaired = await this.workspace.relinkMissingTake(issue, file);
      if (repaired) {
        this.snackbar.success(`Relinked '${issue.clipName}'`);
        this.closeIfComplete();
      } else {
        this.snackbar.error(`Could not relink '${issue.clipName}'`);
      }
    } catch (error) {
      this.snackbar.error(
        error instanceof Error ? error.message : "Audio relink failed.",
      );
    } finally {
      this.busy.set(false);
    }
  }

  remove(issue: AudioIntegrityIssue): void {
    if (!issue.clipId || this.busy()) return;
    if (this.workspace.removeMissingTake(issue)) {
      this.snackbar.success(`Removed '${issue.clipName}'`);
      this.closeIfComplete();
    } else {
      this.snackbar.error(`Could not remove '${issue.clipName}'`);
    }
  }

  reasonLabel(reason: AudioIntegrityIssueReason): string {
    switch (reason) {
      case "missing-reference":
        return "No take reference on this clip";
      case "empty-asset":
        return "The linked take has no audio samples";
      default:
        return "The take file is missing from this project";
    }
  }

  private closeIfComplete(): void {
    if (this.workspace.audioIntegrity()?.ok) this.closed.emit();
  }
}
