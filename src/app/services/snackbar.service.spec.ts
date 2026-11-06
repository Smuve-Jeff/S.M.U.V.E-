import { TestBed } from "@angular/core/testing";
import { SnackbarService } from "./snackbar.service";

describe("SnackbarService", () => {
  let service: SnackbarService;
  let displaySpy: jest.SpyInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SnackbarService);
    displaySpy = jest
      .spyOn(
        service as unknown as { displaySnackbar: () => void },
        "displaySnackbar",
      )
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    service.setStudioQuiet(false);
    jest.restoreAllMocks();
  });

  it("buffers routine Studio actions instead of displaying them", () => {
    service.setStudioQuiet(true);

    service.success("Saved locally");
    service.info("View changed");

    expect(displaySpy).not.toHaveBeenCalled();
    expect(service.actionLog().map((entry) => entry.message)).toEqual([
      "Saved locally",
      "View changed",
    ]);
  });

  it("still displays errors, warnings and actionable toasts in the Studio", () => {
    service.setStudioQuiet(true);

    service.error("Save failed");
    service.warning("Microphone blocked");
    service.success("Take deleted", "Undo");

    expect(displaySpy).toHaveBeenCalledTimes(3);
  });

  it("keeps normal toast behavior outside the Studio", () => {
    service.info("Hub action");

    expect(displaySpy).toHaveBeenCalledTimes(1);
    expect(service.actionLog()).toHaveLength(0);
  });

  it("caps the quiet log at the newest 60 actions", () => {
    service.setStudioQuiet(true);

    for (let index = 0; index < 65; index++) {
      service.info(`Action ${index}`);
    }

    expect(service.actionLog()).toHaveLength(60);
    expect(service.actionLog()[0].message).toBe("Action 5");
    expect(service.actionLog().at(-1)?.message).toBe("Action 64");
  });

  it("clears the log without leaving quiet mode", () => {
    service.setStudioQuiet(true);
    service.info("One action");

    service.clearActionLog();

    expect(service.actionLog()).toHaveLength(0);
    expect(service.studioQuiet()).toBe(true);
  });
});
