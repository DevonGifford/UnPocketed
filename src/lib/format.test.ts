import {
  formatApproximateDuration,
  formatDuration,
  formatRecordedAt,
  formatTranscriptCount,
} from "./format";

describe("formatDuration", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(2_892_000)).toBe("48:12");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(7_200_000)).toBe("2:00:00");
  });

  it("never renders a negative duration", () => {
    expect(formatDuration(-5_000)).toBe("0:00");
  });
});

describe("formatRecordedAt", () => {
  const now = new Date("2026-10-04T18:00:00");

  it("labels the same calendar day as Today", () => {
    expect(formatRecordedAt("2026-10-04T14:32:00", now)).toMatch(/^Today, /);
  });

  it("labels the previous calendar day as Yesterday", () => {
    expect(formatRecordedAt("2026-10-03T09:05:00", now)).toMatch(/^Yesterday, /);
  });

  it("falls back to a dated label beyond that", () => {
    expect(formatRecordedAt("2026-09-28T09:05:00", now)).not.toMatch(
      /Today|Yesterday/,
    );
  });
});

describe("formatTranscriptCount", () => {
  it("distinguishes none, one and many", () => {
    expect(formatTranscriptCount(0)).toBe("Not transcribed");
    expect(formatTranscriptCount(1)).toBe("1 transcript");
    expect(formatTranscriptCount(3)).toBe("3 transcripts");
  });
});

describe("formatApproximateDuration", () => {
  it("marks the duration as estimated", () => {
    expect(formatApproximateDuration(2_892_000)).toBe("~48:12");
  });

  it("still reads as a duration when nothing could be estimated", () => {
    expect(formatApproximateDuration(0)).toBe("~0:00");
  });
});
