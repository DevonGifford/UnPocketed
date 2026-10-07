import { newTranscriptId, transcriptIdForJob } from "./storage";

/*
 * Only the id rules are covered here: the rest of this module is file I/O,
 * which the project tests on device rather than against a mocked filesystem.
 *
 * These rules matter because a Transcript's id decides whether finishing the
 * same provider job twice produces one transcript or two — and two would mean
 * the library showing a duplicate of work the user paid for once.
 */

describe("transcriptIdForJob", () => {
  it("is stable for the same job reference", () => {
    // The whole point: two pollers completing one job agree on the id.
    expect(transcriptIdForJob("abc-123")).toBe(transcriptIdForJob("abc-123"));
  });

  it("differs between job references", () => {
    expect(transcriptIdForJob("abc-123")).not.toBe(transcriptIdForJob("abc-124"));
  });

  it("strips characters a provider may send that a filename cannot hold", () => {
    const id = transcriptIdForJob("a/b.c:d e");
    expect(id).toBe("txn-job-abcde");
    expect(id).not.toMatch(/[^\w-]/);
  });

  it("bounds the length, since the reference is opaque", () => {
    expect(transcriptIdForJob("x".repeat(500)).length).toBeLessThanOrEqual(72);
  });
});

describe("newTranscriptId", () => {
  it("is used only where no job reference exists, so it stays unique", () => {
    const at = new Date("2026-10-08T12:00:00.000Z");
    expect(newTranscriptId(at)).not.toBe(newTranscriptId(at));
  });

  it("starts with the timestamp, so ids sort chronologically", () => {
    expect(newTranscriptId(new Date("2026-10-08T12:00:00.000Z"))).toMatch(
      /^txn-20261008120000-/,
    );
  });
});
