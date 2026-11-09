import {
  FREE_TIER_WATERMARK_LABEL,
  watermarkPolicyForRole,
} from "./commercial-policy.service";

describe("watermarkPolicyForRole", () => {
  it("applies the free-tier brand watermark to ordinary accounts", () => {
    expect(watermarkPolicyForRole("Artist")).toEqual({
      tier: "free",
      watermarkRequired: true,
      label: FREE_TIER_WATERMARK_LABEL,
      attributionRequired: false,
    });
    expect(watermarkPolicyForRole("user")).toMatchObject({
      tier: "free",
      watermarkRequired: true,
    });
  });

  it("defaults uncertain or missing roles to free", () => {
    expect(watermarkPolicyForRole(undefined)).toMatchObject({
      tier: "free",
      watermarkRequired: true,
    });
    expect(watermarkPolicyForRole(null)).toMatchObject({
      tier: "free",
      watermarkRequired: true,
    });
    expect(watermarkPolicyForRole("future-role")).toMatchObject({
      tier: "free",
      watermarkRequired: true,
    });
  });

  it("recognizes explicit paid roles for the future paid services", () => {
    for (const role of [
      "paid",
      "premium",
      "pro",
      "professional",
      "enterprise",
      "studio",
    ]) {
      expect(watermarkPolicyForRole(role)).toMatchObject({
        tier: "paid",
        watermarkRequired: false,
      });
    }
  });

  it("keeps administrative accounts exempt without calling them paid", () => {
    expect(watermarkPolicyForRole(" ADMIN ")).toMatchObject({
      tier: "admin",
      watermarkRequired: false,
    });
  });
});
