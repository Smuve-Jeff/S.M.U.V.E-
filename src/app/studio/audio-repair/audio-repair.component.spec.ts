import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { AudioRepairComponent } from "./audio-repair.component";
import { ProjectWorkspaceService } from "../project-workspace.service";
import { SnackbarService } from "../../services/snackbar.service";

describe("AudioRepairComponent", () => {
  let fixture: ComponentFixture<AudioRepairComponent>;
  let component: AudioRepairComponent;
  let reports: ReturnType<typeof signal<any>>;
  let workspace: any;
  let snackbar: { success: jest.Mock; error: jest.Mock };

  const issue = {
    trackId: "track-vocal",
    trackName: "Lead Vocal",
    clipId: "clip-vocal",
    clipName: "Take 2",
    audioRefId: "missing-take",
    reason: "missing-asset" as const,
  };

  beforeEach(async () => {
    reports = signal({
      ok: false,
      audioClipCount: 1,
      audioAssetCount: 0,
      missingCount: 1,
      issues: [issue],
      unusedAssetIds: [],
    });
    workspace = {
      audioIntegrity: reports,
      inspectCurrentAudioIntegrity: jest.fn(() => reports()),
      relinkMissingTake: jest.fn().mockImplementation(async () => {
        reports.set({ ...reports(), ok: true, missingCount: 0, issues: [] });
        return true;
      }),
      removeMissingTake: jest.fn().mockImplementation(() => {
        reports.set({ ...reports(), ok: true, missingCount: 0, issues: [] });
        return true;
      }),
    };
    snackbar = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AudioRepairComponent],
      providers: [
        { provide: ProjectWorkspaceService, useValue: workspace },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AudioRepairComponent);
    component = fixture.componentInstance;
  });

  it("lists the missing clip and removes it", () => {
    fixture.componentRef.setInput("open", true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Take 2");
    expect(fixture.nativeElement.textContent).toContain("Lead Vocal");
    expect(workspace.inspectCurrentAudioIntegrity).toHaveBeenCalled();

    component.remove(issue);

    expect(workspace.removeMissingTake).toHaveBeenCalledWith(issue);
    expect(snackbar.success).toHaveBeenCalledWith("Removed 'Take 2'");
  });

  it("relinks a chosen file and closes once the report is clean", async () => {
    fixture.componentRef.setInput("open", true);
    fixture.detectChanges();
    (component as any).activeIssue.set(issue);
    const input = document.createElement("input");
    const file = new File([new Uint8Array([1, 2, 3])], "take.wav");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    const closed = jest.fn();
    component.closed.subscribe(closed);

    await component.onFileChosen({ target: input } as unknown as Event);

    expect(workspace.relinkMissingTake).toHaveBeenCalledWith(issue, file);
    expect(snackbar.success).toHaveBeenCalledWith("Relinked 'Take 2'");
    expect(closed).toHaveBeenCalled();
  });
});
