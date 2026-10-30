import {
  AI_PROVIDER_MAX_ATTEMPTS,
  backoffDelayMs,
  isRetryableProviderError,
  providerErrorStatus,
  providerFailure,
  providerRetryAfterMs,
  withProviderRetry,
} from "./ai-proxy.service";

describe("AI provider error taxonomy", () => {
  it("reads the status a provider SDK actually attaches", () => {
    expect(providerErrorStatus({ status: 429 })).toBe(429);
    expect(providerErrorStatus({ statusCode: 503 })).toBe(503);
    expect(providerErrorStatus({ response: { status: 500 } })).toBe(500);
    expect(providerErrorStatus({ error: { status: 504 } })).toBe(504);
    // A transport failure carries no status at all.
    expect(providerErrorStatus(new Error("socket hang up"))).toBeUndefined();
    expect(providerErrorStatus({ code: "ETIMEDOUT" })).toBeUndefined();
  });

  it("retries only the statuses that can heal", () => {
    expect(isRetryableProviderError({ status: 429 })).toBe(true);
    expect(isRetryableProviderError({ status: 503 })).toBe(true);
    expect(isRetryableProviderError({ status: 500 })).toBe(true);
    expect(isRetryableProviderError({ status: 400 })).toBe(false);
    expect(isRetryableProviderError({ status: 401 })).toBe(false);
    expect(isRetryableProviderError({ status: 403 })).toBe(false);
    // No status means the socket or the SDK timer, not a rejected request.
    expect(isRetryableProviderError(new Error("socket hang up"))).toBe(true);
  });

  it("honors a provider Retry-After hint in seconds or as a date", () => {
    expect(
      providerRetryAfterMs({ response: { headers: new Headers({ "retry-after": "2" }) } }),
    ).toBe(2000);
    const soon = new Date(Date.now() + 3000).toUTCString();
    const hinted = providerRetryAfterMs({
      response: { headers: new Headers({ "retry-after": soon }) },
    });
    expect(hinted).toBeGreaterThan(0);
    expect(hinted).toBeLessThanOrEqual(3000);
    expect(providerRetryAfterMs({ status: 429 })).toBeUndefined();
  });

  it("backs off exponentially with jitter, bounded by the cap", () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const delay = backoffDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(250);
      expect(delay).toBeLessThanOrEqual(5000);
    }
    // A provider hint wins over the local schedule.
    expect(backoffDelayMs(0, 1234)).toBe(1234);
  });

  it("turns a rate limit into a retryable client status, not a dead link", () => {
    const failure = providerFailure({
      status: 429,
      response: { headers: new Headers({ "retry-after": "30" }) },
    });
    expect(failure).toMatchObject({
      statusCode: 429,
      details: { retryAfterMs: 30000 },
    });

    expect(providerFailure({ status: 504 }).statusCode).toBe(504);
    expect(providerFailure({ status: 503 }).statusCode).toBe(502);
    // An unclassified failure stays a 502: the link is what is broken.
    expect(providerFailure(new Error("boom")).statusCode).toBe(502);
  });
});

describe("withProviderRetry", () => {
  it("retries a transient failure and reports how many attempts it took", async () => {
    const delays: number[] = [];
    const run = jest
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue("staged plan");

    const result = await withProviderRetry(run, async (ms) => {
      delays.push(ms);
    });

    expect(result).toEqual({ value: "staged plan", attempts: 3 });
    expect(run).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
  });

  it("fails light on a request the provider rejected outright", async () => {
    const run = jest.fn().mockRejectedValue({ status: 400, message: "bad request" });
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(withProviderRetry(run, sleep)).rejects.toMatchObject({ status: 400 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after the attempt budget and rethrows the last error", async () => {
    const run = jest.fn().mockRejectedValue({ status: 429 });
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(withProviderRetry(run, sleep)).rejects.toMatchObject({ status: 429 });
    expect(run).toHaveBeenCalledTimes(AI_PROVIDER_MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(AI_PROVIDER_MAX_ATTEMPTS - 1);
  });

  it("waits the provider's Retry-After rather than its own backoff", async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const run = jest
      .fn()
      .mockRejectedValueOnce({
        status: 429,
        response: { headers: new Headers({ "retry-after": "2" }) },
      })
      .mockResolvedValue("ok");

    const result = await withProviderRetry(run, sleep);
    expect(result).toEqual({ value: "ok", attempts: 2 });
    expect(sleep).toHaveBeenCalledWith(2000);
  });
});

describe("analyzePrompt without a provider key", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it("answers with the offline sentinel and never calls a provider", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    jest.resetModules();

    const proxy = await import("./ai-proxy.service");
    const result = await proxy.analyzePrompt("stage a three-shot hook");

    expect(result.text).toMatch(/strategic link severed/i);
    expect(result.meta).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
