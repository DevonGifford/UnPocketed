import { planReconcile } from "./reconcile";
import type { Recording } from "@/types";

function recording(overrides: Partial<Recording> & { id: string }): Recording {
  return {
    title: "20260407, 14:32",
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

describe("planReconcile", () => {
  it("indexes recordings found on disk but missing from the index", () => {
    const found = recording({ id: "a" });

    expect(planReconcile([found], [])).toEqual({ index: [found], forget: [] });
  });

  it("leaves an index that already matches disk alone", () => {
    const found = recording({ id: "a" });

    expect(planReconcile([found], [found])).toEqual({ index: [], forget: [] });
  });

  it("re-indexes a recording whose sidecar metadata has changed", () => {
    const onDisk = recording({ id: "a", title: "Meeting with Sam" });
    const indexed = recording({ id: "a", title: "20260407, 14:32" });

    expect(planReconcile([onDisk], [indexed])).toEqual({
      index: [onDisk],
      forget: [],
    });
  });

  it("ignores audioPath, which is rebuilt per install", () => {
    const onDisk = recording({ id: "a", audioPath: "file:///new/install/a.m4a" });
    const indexed = recording({ id: "a", audioPath: "file:///old/install/a.m4a" });

    expect(planReconcile([onDisk], [indexed]).index).toEqual([]);
  });

  it("forgets rows whose audio is gone", () => {
    const stale = recording({ id: "gone" });

    expect(planReconcile([], [stale])).toEqual({ index: [], forget: ["gone"] });
  });

  // §3.2: the index must never be the reason a recording stops being visible.
  it("indexes audio that has no row rather than treating the index as complete", () => {
    const orphan = recording({ id: "orphan", title: "Recovered recording" });
    const known = recording({ id: "known" });

    const plan = planReconcile([orphan, known], [known]);

    expect(plan.index).toEqual([orphan]);
    expect(plan.forget).toEqual([]);
  });
});
