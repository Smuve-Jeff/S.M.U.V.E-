import { StudioTransportShellComponent } from "./studio-transport-shell.component";

describe("StudioTransportShellComponent", () => {
  it("is the stable Studio transport host", () => {
    const component = new StudioTransportShellComponent();
    expect(component).toBeTruthy();
  });
});
