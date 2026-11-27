import { StudioBottomSheetComponent } from "./studio-bottom-sheet.component";

describe("StudioBottomSheetComponent", () => {
  let component: StudioBottomSheetComponent;

  beforeEach(() => {
    component = new StudioBottomSheetComponent();
  });

  it("closes on Escape only while open", () => {
    const closed = jest.fn();
    component.closed.subscribe(closed);

    component.onEscape();
    expect(closed).not.toHaveBeenCalled();

    component.open = true;
    component.onEscape();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("closes from the button and backdrop paths", () => {
    const closed = jest.fn();
    component.closed.subscribe(closed);

    component.close();
    component.onBackdropClick();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});
