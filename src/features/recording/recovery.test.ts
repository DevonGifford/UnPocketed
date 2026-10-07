import { estimateDurationMs, storedBitrate } from "./recovery";
import type { Recording } from "@/types";

function recording(overrides: Partial<Recording> & { id: string }): Recording {
  return {
    title: "Meeting with Sam",
    source: "recorded",
    audioPath: `file:///documents/recordings/${overrides.id}.m4a`,
    mimeType: "audio/mp4",
    durationMs: 60_000,
    createdAt: "2026-04-07T14:32:00.000Z",
    updatedAt: "2026-04-07T14:32:00.000Z",
    interrupted: false,
    ...overrides,
  };
}

describe("storedBitrate", () => {
  // 720_000 bytes over 60s = 96 kbps, which is what the test device negotiates.
  const sixtySecondsAt96k = recording({ id: "a", durationMs: 60_000 });

  it("calibrates from a complete recording on this device", () => {
    expect(storedBitrate([sixtySecondsAt96k], () => 720_000)).toBe(96_000);
  });

  it("ignores interrupted recordings, whose duration is itself an estimate", () => {
    const interrupted = recording({ id: "bad", interrupted: true });

    expect(storedBitrate([interrupted, sixtySecondsAt96k], () => 720_000)).toBe(96_000);
  });

  it("ignores recordings with no known duration", () => {
    const unknown = recording({ id: "unknown", durationMs: 0 });

    expect(storedBitrate([unknown, sixtySecondsAt96k], () => 720_000)).toBe(96_000);
  });

  it("skips a recording whose file cannot be sized", () => {
    const missing = recording({ id: "missing" });
    const sizeOf = (r: Recording) => (r.id === "missing" ? null : 720_000);

    expect(storedBitrate([missing, sixtySecondsAt96k], sizeOf)).toBe(96_000);
  });

  it("falls back when nothing can calibrate it, rather than dividing by zero", () => {
    expect(storedBitrate([], () => null)).toBe(96_000);
  });
});

describe("estimateDurationMs", () => {
  it("converts a size into milliseconds at the given rate", () => {
    expect(estimateDurationMs(720_000, 96_000)).toBe(60_000);
  });

  it("returns 0 for an empty file rather than a duration", () => {
    expect(estimateDurationMs(0, 96_000)).toBe(0);
  });

  it("returns 0 rather than infinity when the rate is unusable", () => {
    expect(estimateDurationMs(720_000, 0)).toBe(0);
  });
});
