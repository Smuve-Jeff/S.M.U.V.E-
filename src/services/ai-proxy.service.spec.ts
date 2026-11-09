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


describe("normalizeImageSource", () => {
  it("passes hosted URLs and data URLs through untouched", () => {
    const { normalizeImageSource } = require("./ai-proxy.service");
    expect(normalizeImageSource("https://cdn.example/frame.png")).toBe(
      "https://cdn.example/frame.png"
    );
    expect(normalizeImageSource("data:image/png;base64,AAA")).toBe(
      "data:image/png;base64,AAA"
    );
  });

  it("wraps bare base64 with the caller's MIME type", () => {
    const { normalizeImageSource } = require("./ai-proxy.service");
    expect(normalizeImageSource("AAA", "image/webp")).toBe(
      "data:image/webp;base64,AAA"
    );
    expect(normalizeImageSource("AAA")).toBe("data:image/jpeg;base64,AAA");
  });
});

describe("analyzeFrame without a provider key", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it("refuses instead of guessing about an unviewed frame", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    jest.resetModules();

    const proxy = await import("./ai-proxy.service");
    await expect(
      proxy.analyzeFrame({
        image: "data:image/jpeg;base64,AAA",
        mimeType: "image/jpeg",
        question: "what is in this frame?",
      })
    ).rejects.toBeInstanceOf(proxy.AiProviderUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("analyzeFrame validation", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  it("rejects an unsupported frame format before any provider call", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    jest.resetModules();
    const fetchSpy = jest.spyOn(globalThis, "fetch");

    const proxy = await import("./ai-proxy.service");
    await expect(
      proxy.analyzeFrame({
        image: "data:video/mp4;base64,AAA",
        mimeType: "video/mp4",
        question: "what is in this frame?",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fal media endpoints (Photo Studio + shot video)", () => {
  const originalKey = process.env.FAL_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalKey;
    jest.restoreAllMocks();
  });

  const loadProxy = async (response: unknown) => {
    process.env.FAL_KEY = "test-fal-key";
    jest.resetModules();
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      response as never
    );
    const proxy = await import("./ai-proxy.service");
    return { proxy, fetchSpy };
  };

  it("enhances a photo through Topaz and returns the hosted image", async () => {
    const { proxy, fetchSpy } = await loadProxy({
      ok: true,
      status: 200,
      json: async () => ({
        image: { url: "https://fal.example/enhanced.png" },
      }),
    });

    const result = await proxy.enhancePhoto({
      image: "data:image/png;base64,AAA",
      upscaleFactor: 2,
    });

    expect(result).toEqual({
      type: "image",
      url: "https://fal.example/enhanced.png",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://fal.run/fal-ai/topaz/upscale/image",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Key test-fal-key",
        }),
        body: JSON.stringify({
          image_url: "data:image/png;base64,AAA",
          upscale_factor: 2,
          output_format: "png",
        }),
      })
    );
  });

  it("clamps the upscale factor into the model's 1-4 range", async () => {
    const { proxy, fetchSpy } = await loadProxy({
      ok: true,
      status: 200,
      json: async () => ({ image: { url: "https://fal.example/x.png" } }),
    });

    await proxy.enhancePhoto({ image: "https://cdn.example/a.png", upscaleFactor: 99 });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.upscale_factor).toBe(4);
  });

  it("cuts a background out with BiRefNet v2, format png", async () => {
    const { proxy, fetchSpy } = await loadProxy({
      ok: true,
      status: 200,
      json: async () => ({
        image: { url: "https://fal.example/cutout.png" },
      }),
    });

    const result = await proxy.cutoutPhoto({
      image: "https://cdn.example/take.png",
    });

    expect(result).toEqual({
      type: "image",
      url: "https://fal.example/cutout.png",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://fal.run/fal-ai/birefnet/v2",
      expect.objectContaining({
        body: JSON.stringify({
          image_url: "https://cdn.example/take.png",
          output_format: "png",
        }),
      })
    );
  });

  it("animates one still with Pika through the fal queue", async () => {
    process.env.FAL_KEY = "test-fal-key";
    jest.resetModules();
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-1",
          status_url: "https://queue.fal.run/status/req-1",
          response_url: "https://queue.fal.run/response/req-1",
        }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "COMPLETED" }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          video: { url: "https://fal.example/shot.mp4" },
        }),
      } as never);
    const proxy = await import("./ai-proxy.service");

    const result = await proxy.generateShotVideo({
      image: "https://fal.example/still.png",
      prompt: "slow push in",
      durationSeconds: 20,
    });

    expect(result).toEqual({
      type: "video",
      url: "https://fal.example/shot.mp4",
      duration: 10,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/pika/v2.2/image-to-video",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Key test-fal-key",
        }),
        body: JSON.stringify({
          image_url: "https://fal.example/still.png",
          prompt: "slow push in",
          duration: 10,
        }),
      })
    );
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      "https://queue.fal.run/fal-ai/pika/v2.2/image-to-video",
      "https://queue.fal.run/status/req-1",
      "https://queue.fal.run/response/req-1",
    ]);
  });

  it("maps a provider rate limit to a retryable 429, not a dead link", async () => {
    const { proxy } = await loadProxy({ ok: false, status: 429 });

    await expect(
      proxy.cutoutPhoto({ image: "https://cdn.example/take.png" })
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it("throws a 502 when the provider answers with no media", async () => {
    const { proxy } = await loadProxy({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(
      proxy.cutoutPhoto({ image: "https://cdn.example/take.png" })
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("is unavailable without FAL_KEY and never calls the provider", async () => {
    delete process.env.FAL_KEY;
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    jest.resetModules();

    const proxy = await import("./ai-proxy.service");
    await expect(
      proxy.enhancePhoto({ image: "https://cdn.example/a.png" })
    ).rejects.toBeInstanceOf(proxy.AiProviderUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("normalizeAudioSource", () => {
  it("passes hosted URLs and data URLs through untouched", () => {
    const { normalizeAudioSource } = require("./ai-proxy.service");
    expect(normalizeAudioSource("https://cdn.example/voice.wav")).toBe(
      "https://cdn.example/voice.wav"
    );
    expect(normalizeAudioSource("data:audio/wav;base64,AAA")).toBe(
      "data:audio/wav;base64,AAA"
    );
  });

  it("wraps bare base64 as audio/wav", () => {
    const { normalizeAudioSource } = require("./ai-proxy.service");
    expect(normalizeAudioSource("AAA")).toBe("data:audio/wav;base64,AAA");
  });
});

describe("fal queue polling + lip-sync", () => {
  const originalKey = process.env.FAL_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = originalKey;
    jest.restoreAllMocks();
  });

  const queueWithStatus = (status: string) => {
    process.env.FAL_KEY = "test-fal-key";
    jest.resetModules();
    return jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status_url: "https://queue.fal.run/status/req-9",
          response_url: "https://queue.fal.run/response/req-9",
        }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          video: { url: "https://fal.example/head.mp4" },
        }),
      } as never);
  };

  it("animates a still to audio through sync-3 and echoes the duration", async () => {
    const fetchSpy = queueWithStatus("COMPLETED");
    const proxy = await import("./ai-proxy.service");

    const result = await proxy.generateLipSync({
      image: "https://fal.example/still.png",
      audio: "data:audio/wav;base64,AAA",
      durationSeconds: 12,
    });

    expect(result).toEqual({
      type: "video",
      url: "https://fal.example/head.mp4",
      duration: 12,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://queue.fal.run/fal-ai/sync-lipsync/v3/image-to-video",
      expect.objectContaining({
        body: JSON.stringify({
          image_url: "https://fal.example/still.png",
          audio_url: "data:audio/wav;base64,AAA",
        }),
      })
    );
  });

  it("maps a failed queue job to a 502", async () => {
    queueWithStatus("FAILED");
    const proxy = await import("./ai-proxy.service");

    await expect(
      proxy.generateLipSync({
        image: "https://fal.example/still.png",
        audio: "https://cdn.example/voice.wav",
        durationSeconds: 5,
      })
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("gives up with a 504 when the job never finishes", async () => {
    process.env.FAL_KEY = "test-fal-key";
    jest.resetModules();
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status_url: "https://queue.fal.run/status/slow",
          response_url: "https://queue.fal.run/response/slow",
        }),
      } as never)
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "IN_PROGRESS" }),
      } as never);
    const proxy = await import("./ai-proxy.service");

    await expect(
      proxy.falRunQueue("fal-ai/pika/v2.2/image-to-video", {}, {
        maxWaitMs: 0,
        sleep: async () => {},
      })
    ).rejects.toMatchObject({ statusCode: 504 });
  });

  it("rejects lip-sync with no audio before any provider call", async () => {
    process.env.FAL_KEY = "test-fal-key";
    jest.resetModules();
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const proxy = await import("./ai-proxy.service");

    await expect(
      proxy.generateLipSync({
        image: "https://fal.example/still.png",
        audio: "",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
