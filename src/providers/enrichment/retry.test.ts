import { isBusy, retryAfterMs, withBusyRetry } from "./retry";
import { EnrichmentAborted } from "./types";

const response = (status: number, headers: Record<string, string> = {}) =>
  new Response("{}", { status, headers });

describe("isBusy", () => {
  /*
   * Only "up but busy". A 500 means something went wrong and repeating it
   * repeats whatever that was; a 429 is the user's own quota and needs a
   * different message, not a silent retry.
   */
  it("covers the statuses that mean the provider is loaded", () => {
    expect(isBusy(502)).toBe(true);
    expect(isBusy(503)).toBe(true);
    expect(isBusy(504)).toBe(true);
  });

  it("does not cover a fault, a rate limit, or a bad request", () => {
    for (const status of [400, 401, 404, 429, 500]) {
      expect(isBusy(status)).toBe(false);
    }
  });
});

describe("retryAfterMs", () => {
  it("reads the seconds form", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs(" 0 ")).toBe(0);
  });

  it("ignores what it cannot read, rather than guessing", () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(retryAfterMs("-5")).toBeNull();
  });
});

describe("withBusyRetry", () => {
  it("does not retry a request that succeeded", async () => {
    let calls = 0;
    await withBusyRetry(async () => {
      calls += 1;
      return response(200);
    });
    expect(calls).toBe(1);
  });

  it("retries a busy provider and returns the answer when it clears", async () => {
    let calls = 0;
    const result = await withBusyRetry(async () => {
      calls += 1;
      return calls === 1 ? response(503) : response(200);
    });
    expect(calls).toBe(2);
    expect(result.status).toBe(200);
  });

  /*
   * One retry, not two. A 503 is either a momentary spike — which one repeat
   * catches — or a saturated model, which answers 503 however many times it is
   * asked. Extra attempts only delay the failure while burning a free tier's
   * requests-per-minute allowance toward a 429.
   */
  it("retries exactly once before giving up", async () => {
    let calls = 0;
    const result = await withBusyRetry(async () => {
      calls += 1;
      return response(503);
    });
    expect(calls).toBe(2);
    expect(result.status).toBe(503);
  });

  it("never retries a rate limit, which is how an app gets flagged", async () => {
    let calls = 0;
    await withBusyRetry(async () => {
      calls += 1;
      return response(429);
    });
    expect(calls).toBe(1);
  });

  it("does not retry a fault", async () => {
    let calls = 0;
    await withBusyRetry(async () => {
      calls += 1;
      return response(400);
    });
    expect(calls).toBe(1);
  });

  /*
   * Leaving the screen during a backoff must stop immediately. Waiting out the
   * timer first would leave a spinner running on a screen nobody is looking at.
   */
  it("abandons during a wait rather than after it", async () => {
    const controller = new AbortController();
    let calls = 0;

    const pending = withBusyRetry(async () => {
      calls += 1;
      controller.abort();
      return response(503);
    }, controller.signal);

    await expect(pending).rejects.toBeInstanceOf(EnrichmentAborted);
    expect(calls).toBe(1);
  });
});
