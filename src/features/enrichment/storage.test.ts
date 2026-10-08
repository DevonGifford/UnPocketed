import { briefIdFor } from "./storage";

/*
 * The id is the whole deduplication strategy, so it gets the tests. Everything
 * else in this module is filesystem IO, which this repo does not mock.
 */
describe("briefIdFor", () => {
  it("is stable for the same transcript and model", () => {
    // Re-running one model over one transcript replaces its Brief rather than
    // stacking another up — "regenerate" is a repeat, not an addition.
    expect(briefIdFor("txn-job-abc", "anthropic", "claude-opus-5")).toBe(
      briefIdFor("txn-job-abc", "anthropic", "claude-opus-5"),
    );
  });

  it("differs per model, so two models can be compared", () => {
    // §22 one layer down: two Briefs of one transcript, each attributed.
    expect(briefIdFor("txn-job-abc", "anthropic", "claude-opus-5")).not.toBe(
      briefIdFor("txn-job-abc", "anthropic", "claude-haiku-4-5"),
    );
  });

  it("differs per provider", () => {
    expect(briefIdFor("txn-job-abc", "anthropic", "shared-name")).not.toBe(
      briefIdFor("txn-job-abc", "gemini", "shared-name"),
    );
  });

  it("differs per transcript", () => {
    expect(briefIdFor("txn-job-abc", "anthropic", "claude-opus-5")).not.toBe(
      briefIdFor("txn-job-xyz", "anthropic", "claude-opus-5"),
    );
  });

  it("is safe to use as a filename", () => {
    const id = briefIdFor("txn-user-a/b c", "custom", "model:v1.0/beta");
    expect(id).toMatch(/^[\w-]+$/);
  });

  it("does not nest the transcript's own prefix", () => {
    expect(briefIdFor("txn-job-abc", "anthropic", "m")).not.toContain("txn");
  });
});
