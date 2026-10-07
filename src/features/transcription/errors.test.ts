import { transcriptionFailure } from "./errors";
import type { TranscriptionFailureReason } from "./errors";

/*
 * §35 names transcription error recovery a highest-priority test area. What is
 * worth testing is not the wording but the two promises the interface makes on
 * the strength of these records: that every failure has something to say, and
 * that "Try again" appears only where trying again could work.
 */

const ALL: TranscriptionFailureReason[] = [
  "unauthorized",
  "offline",
  "provider-failed",
  "too-large",
  "unknown",
  "not-configured",
  "recording-missing",
  "interrupted",
  "not-recorded",
  "interrupted-before-upload",
];

describe("transcriptionFailure", () => {
  it("has a title and a detail for every reason", () => {
    for (const reason of ALL) {
      const failure = transcriptionFailure(reason);
      expect(failure.reason).toBe(reason);
      expect(failure.title.length).toBeGreaterThan(0);
      expect(failure.detail.length).toBeGreaterThan(0);
    }
  });

  it("offers a retry only where repeating the request could work", () => {
    // Nothing about the key or the audio changes by asking again.
    for (const reason of [
      "unauthorized",
      "not-configured",
      "too-large",
      "interrupted",
      "recording-missing",
    ] as TranscriptionFailureReason[]) {
      expect(transcriptionFailure(reason).retryable).toBe(false);
    }

    // A network drop, a provider wobble, or an interrupted start may all clear.
    for (const reason of [
      "offline",
      "provider-failed",
      "unknown",
      "not-recorded",
      "interrupted-before-upload",
    ] as TranscriptionFailureReason[]) {
      expect(transcriptionFailure(reason).retryable).toBe(true);
    }
  });

  it("lets a provider override the default for its own error", () => {
    // TranscriptionError carries its own `retryable`; a provider that knows a
    // normally-retryable failure is permanent can say so.
    expect(transcriptionFailure("provider-failed", false).retryable).toBe(false);
  });

  it("never suggests a transcription failure cost the recording", () => {
    /*
     * §21: failure must not affect the original recording, and §32 wants that
     * reinforced "where that statement is true".
     *
     * `recording-missing` is the one case where it is not true — the recording
     * really has gone, because the user deleted it — so it is excluded rather
     * than reworded. Claiming the audio is safe there would be the lie §32 is
     * guarding against, pointing the other way.
     */
    for (const reason of ALL.filter((r) => r !== "recording-missing")) {
      expect(transcriptionFailure(reason).detail).not.toMatch(/lost|deleted|gone/i);
    }
  });

  it("says the recording is safe wherever a failure happened after one existed", () => {
    for (const reason of [
      "unauthorized",
      "offline",
      "provider-failed",
      "too-large",
      "unknown",
      "not-configured",
      "interrupted-before-upload",
    ] as TranscriptionFailureReason[]) {
      expect(transcriptionFailure(reason).detail).toMatch(/safe on this device/i);
    }
  });
});
