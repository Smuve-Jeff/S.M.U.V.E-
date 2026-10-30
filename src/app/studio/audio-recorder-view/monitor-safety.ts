export type MonitorOutputRisk = "headphones" | "speakers" | "unknown";

/**
 * Classify the output labels the browser exposes.
 *
 * Labels are often blank until microphone permission is granted, so `unknown`
 * is a normal answer, not a failure. Headphones win a mixed list because that
 * is the safe route; anything that names speakers or studio monitors is called
 * out, since live monitoring through them can feed back.
 */
export function classifyMonitorOutputRisk(
  labels: readonly string[],
): MonitorOutputRisk {
  const usable = labels.map((label) => label.trim()).filter(Boolean);
  if (usable.length === 0) return "unknown";
  if (usable.some((label) => /headphone|headset|earbud|earphone|airpod/i.test(label))) {
    return "headphones";
  }
  if (usable.some((label) => /speaker|built[- ]?in|monitor/i.test(label))) {
    return "speakers";
  }
  return "unknown";
}
