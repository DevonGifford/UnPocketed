import { EnrichmentAborted } from "./types";

/*
 * Retrying a request the provider told us to retry.
 *
 * Only for `502`/`503`/`504` — the provider is up and the model is busy. That
 * distinction is what makes this safe rather than a papering-over:
 *
 * - **Nothing was processed**, so nothing was billed and nothing is duplicated.
 *   A timeout mid-response would be a different matter entirely, and is not
 *   retried here.
 * - **The provider asked for it.** Gemini's own 503 body reads "spikes in
 *   demand are usually temporary. Please try again later." Making the user tap
 *   again is asking them to do by hand what the API documented as the remedy.
 *
 * Free tiers meet this constantly, because the newest model is both the default
 * and where everyone else is.
 *
 * Deliberately short and bounded. This is a person waiting on a phone, not a
 * background job: two extra attempts over a few seconds either clears a spike
 * or proves it is not one, and anything longer is a spinner that looks hung.
 */

/** Total attempts, including the first. */
const MAX_ATTEMPTS = 3;

/** Waits before each retry, in order. One entry per retry after the first try. */
const BACKOFF_MS = [1_000, 3_000];

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new EnrichmentAborted());
    }

    // Checked by hand rather than with `throwIfAborted`, which React Native's
    // AbortSignal does not implement — calling it would be a TypeError.
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(new EnrichmentAborted());
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs a request, repeating it while the provider reports itself busy.
 *
 * @param attempt Makes one attempt. Returns the response, whatever its status.
 * @param signal Abandons the wait as well as the request, so leaving the screen
 * during a backoff stops immediately rather than after the timer.
 * @returns The last response. A caller still handles a non-OK status — this
 * only decides whether to ask again.
 * @throws {EnrichmentAborted} If the caller abandons during a wait.
 */
export async function withBusyRetry(
  attempt: () => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  let response = await attempt();

  for (let retry = 0; retry < MAX_ATTEMPTS - 1; retry += 1) {
    if (!isBusy(response.status)) return response;

    /*
     * `Retry-After` wins where the provider sends one, capped so a provider
     * asking for a minute does not strand someone staring at a spinner — at
     * that point telling them to try later is the honest answer.
     */
    const asked = retryAfterMs(response.headers.get("retry-after"));
    const wait = Math.min(asked ?? BACKOFF_MS[retry], 5_000);

    await delay(wait, signal);
    response = await attempt();
  }

  return response;
}

/** Whether a status means "up, but busy" rather than "something is wrong". */
export function isBusy(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/** `Retry-After` in milliseconds, for the seconds form. Null when absent. */
export function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
}
