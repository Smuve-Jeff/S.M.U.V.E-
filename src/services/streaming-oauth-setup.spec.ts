import {
  inspectStreamingOAuthSetup,
  type StreamingOAuthSetupInput,
} from "./streaming-oauth-setup-rules";

const base: StreamingOAuthSetupInput = {
  apiPublicUrl: "https://smuve.example.com",
  nodeEnv: "production",
  oauthTokenKey: "",
  mediaRelayUrl: "https://relay.example.com",
  mediaRelayToken: "relay-token",
  twitchRtmpUrl: "rtmp://live.twitch.tv/app",
  relayProbe: "ok" as const,
  credentials: [
    { platform: "twitch", clientId: "twitch-id", clientSecret: "twitch-secret" },
    { platform: "youtube", clientId: "google-id", clientSecret: "google-secret" },
  ],
  table: "ready",
};

const withInput = (overrides: Partial<StreamingOAuthSetupInput> = {}) =>
  inspectStreamingOAuthSetup({ ...base, ...overrides });

describe("streaming OAuth deploy check", () => {
  it("passes a fully configured deployment", () => {
    const report = withInput();

    expect(report.problems).toEqual([]);
    expect(report.configured).toEqual(["twitch", "youtube"]);
  });

  it("treats an unconfigured feature as off, not broken", () => {
    const report = withInput({
      credentials: [
        { platform: "twitch", clientId: "", clientSecret: "" },
        { platform: "youtube", clientId: "", clientSecret: "" },
      ],
      table: "missing",
    });

    expect(report.configured).toEqual([]);
    expect(report.problems).toEqual([]);
    expect(report.warnings.join(" ")).toContain("Connect answers 503");
    expect(report.warnings.join(" ")).toContain("mg:run");
  });

  it("accepts Kick and Facebook once their app credentials exist", () => {
    const report = withInput({
      credentials: [
        ...base.credentials,
        { platform: "kick", clientId: "kick-id", clientSecret: "kick-secret" },
        {
          platform: "facebook",
          clientId: "meta-id",
          clientSecret: "meta-secret",
        },
      ],
    });

    expect(report.problems).toEqual([]);
    expect(report.configured).toEqual([
      "twitch",
      "youtube",
      "kick",
      "facebook",
    ]);
  });

  it("fails a half-configured Kick app and names its secret", () => {
    const report = withInput({
      credentials: [
        ...base.credentials,
        { platform: "kick", clientId: "kick-id", clientSecret: "" },
      ],
    });

    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("KICK_CLIENT_SECRET");
  });

  it("fails a half-configured provider and names the missing variable", () => {
    const report = withInput({
      credentials: [
        { platform: "twitch", clientId: "twitch-id", clientSecret: "" },
      ],
    });

    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("TWITCH_CLIENT_SECRET");
  });

  it("fails when the callback origin is not reachable by the provider", () => {
    const report = withInput({ apiPublicUrl: "http://localhost:4000" });

    expect(report.problems.join(" ")).toContain("cannot redirect to");
  });

  it("fails when the callback origin is not an absolute URL", () => {
    const report = withInput({ apiPublicUrl: "/api" });

    expect(report.problems.join(" ")).toContain("API_PUBLIC_URL");
  });

  it("fails when the grants table is missing while OAuth is enabled", () => {
    const report = withInput({ table: "missing" });

    expect(report.problems.join(" ")).toContain("mg:run");
  });

  it("fails when the table could not be verified at all", () => {
    const report = withInput({
      table: "unavailable",
      tableDetail: "permission denied",
    });

    expect(report.problems.join(" ")).toContain("permission denied");
  });

  it("warns about a token key that is not 32 bytes", () => {
    const report = withInput({ oauthTokenKey: "too-short" });

    expect(report.problems).toEqual([]);
    expect(report.warnings.join(" ")).toContain("not 32 bytes");
  });

  it("accepts a 32-byte key without complaint", () => {
    const report = withInput({ oauthTokenKey: "a".repeat(64) });

    expect(report.warnings.join(" ")).not.toContain("OAUTH_TOKEN_KEY is set but");
  });

  it("fails a relay URL that is not an http(s) address", () => {
    const report = withInput({ mediaRelayUrl: "relay.example.com" });

    expect(report.problems.join(" ")).toContain("MEDIA_RELAY_URL");
  });

  it("warns that a missing relay disables pushing", () => {
    const report = withInput({ mediaRelayUrl: "" });

    expect(report.problems).toEqual([]);
    expect(report.warnings.join(" ")).toContain("answers 503");
  });

  it("fails a Twitch ingest URL that is not RTMP", () => {
    const report = withInput({ twitchRtmpUrl: "https://live.twitch.tv/app" });

    expect(report.problems.join(" ")).toContain("TWITCH_RTMP_URL");
  });

  it("fails when the relay cannot reach its media server", () => {
    const report = withInput({ relayProbe: "degraded" });

    expect(report.problems.join(" ")).toContain("MEDIAMTX_API_URL");
  });

  it("fails when the configured relay does not answer", () => {
    const report = withInput({ relayProbe: "unreachable" });

    expect(report.problems.join(" ")).toContain("did not answer its health probe");
  });

  it("does not probe a relay that is not configured", () => {
    const report = withInput({ mediaRelayUrl: "", relayProbe: "unreachable" });

    expect(report.problems).toEqual([]);
    expect(report.warnings.join(" ")).toContain("MEDIA_RELAY_URL is not set");
  });
});
