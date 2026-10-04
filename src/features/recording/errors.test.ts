import { recordingFailure, type RecordingFailureReason } from "./errors";

const REASONS: RecordingFailureReason[] = [
  "microphone-denied",
  "notifications-denied",
  "prepare-timed-out",
  "prepare-failed",
  "start-failed",
  "finalise-failed",
  "save-failed",
];

describe("recordingFailure", () => {
  it("gives every reason a user-facing title and detail (§32)", () => {
    for (const reason of REASONS) {
      const failure = recordingFailure(reason);
      expect(failure.reason).toBe(reason);
      expect(failure.title.length).toBeGreaterThan(0);
      expect(failure.detail.length).toBeGreaterThan(0);
    }
  });

  it("never leaks an error code or status into the message (§32)", () => {
    for (const reason of REASONS) {
      const { title, detail } = recordingFailure(reason);
      expect(`${title} ${detail}`).not.toMatch(/HTTP \d|\b[45]\d\d\b|Error:/);
    }
  });

  /*
   * §3.2 and §32 together: "your recording is safe" may only appear where it is
   * true. Claiming an intact recording after one was lost is the worst failure
   * this vocabulary can produce, so the set is pinned rather than spot-checked.
   */
  it("claims the audio survived only where it actually does", () => {
    const intact = REASONS.filter((reason) => recordingFailure(reason).audioIntact);
    expect(intact).toEqual(["save-failed"]);
  });

  it("does not reassure the user when nothing was ever recorded", () => {
    for (const reason of ["microphone-denied", "prepare-timed-out", "start-failed"] as const) {
      expect(recordingFailure(reason).audioIntact).toBe(false);
    }
  });
});
