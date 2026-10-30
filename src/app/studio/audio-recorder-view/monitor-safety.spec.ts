import { classifyMonitorOutputRisk } from "./monitor-safety";

describe("monitor output risk", () => {
  it("recognises headphones even in a mixed output list", () => {
    expect(classifyMonitorOutputRisk(["Speakers", "Headphones (USB)"])).toBe(
      "headphones",
    );
    expect(classifyMonitorOutputRisk(["AirPods Pro"])).toBe("headphones");
  });

  it("flags speakers and studio monitors", () => {
    expect(classifyMonitorOutputRisk(["Built-in Speakers"])).toBe("speakers");
    expect(classifyMonitorOutputRisk(["Studio Monitor"])).toBe("speakers");
  });

  it("stays unknown when labels are blank or unnamed", () => {
    expect(classifyMonitorOutputRisk([])).toBe("unknown");
    expect(classifyMonitorOutputRisk(["", "   "])).toBe("unknown");
    expect(classifyMonitorOutputRisk(["Default audio output"])).toBe("unknown");
  });
});
