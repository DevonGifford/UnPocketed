import { normaliseSidecar, type Sidecar } from "./sidecar";

function legacySidecar(): Sidecar {
  // Exactly what PR3 wrote: no `interrupted`, because it did not exist yet.
  return JSON.parse(
    JSON.stringify({
      id: "20261004190209-iflqo9",
      title: "4 Oct 2026, 21:02",
      source: "recorded",
      fileName: "20261004190209-iflqo9.m4a",
      mimeType: "audio/mp4",
      durationMs: 3176,
      createdAt: "2026-10-04T19:02:09.268Z",
      updatedAt: "2026-10-04T19:02:09.268Z",
    }),
  ) as Sidecar;
}

describe("normaliseSidecar", () => {
  /*
   * The silent failure this guards: `undefined !== false`, so reconcile would
   * treat every legacy recording as changed and rewrite its row on each launch.
   */
  it("reads a sidecar with no interrupted field as complete", () => {
    expect(normaliseSidecar(legacySidecar()).interrupted).toBe(false);
  });

  it("gives a boolean, not undefined, so comparisons settle", () => {
    expect(typeof normaliseSidecar(legacySidecar()).interrupted).toBe("boolean");
  });

  it("keeps an interrupted recording interrupted", () => {
    const interrupted = { ...legacySidecar(), interrupted: true };

    expect(normaliseSidecar(interrupted).interrupted).toBe(true);
  });

  it("leaves every other field alone", () => {
    const legacy = legacySidecar();

    expect(normaliseSidecar(legacy)).toEqual({ ...legacy, interrupted: false });
  });
});
