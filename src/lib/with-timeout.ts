/**
 * A JS-side timeout for promises that may never settle.
 *
 * Needed because `expo-audio`'s `prepareToRecordAsync` can hang forever on
 * SDK 57 — the library never calls its own `startBindingTimeout()`
 * (expo/expo#50706). Without this, a failed prepare leaves the record screen
 * waiting with no way out and no error to show.
 */

/** Thrown when the wrapped promise does not settle in time. `label` names the operation. */
export class TimeoutError extends Error {
  readonly label: string;

  constructor(label: string, ms: number) {
    super(`${label} did not complete within ${ms}ms`);
    this.name = "TimeoutError";
    this.label = label;
  }
}

/**
 * Rejects with {@link TimeoutError} if `promise` has not settled after `ms`.
 *
 * The underlying promise cannot be cancelled, so it may still settle later; the
 * caller must treat a timeout as "outcome unknown" rather than "did not happen".
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });

  // The timer is cleared whichever way the race ends, so a resolved promise
  // never leaves a pending handle behind to keep the JS context awake.
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}
