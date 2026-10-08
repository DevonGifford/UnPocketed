import {
  editableTurnsFor,
  editedTranscript,
  isProviderOutput,
  turnsChanged,
  type EditableTurn,
} from "./editing";
import type { Transcript, TranscriptSegment } from "@/types";

const NOW = new Date("2026-10-09T09:00:00.000Z");

const turn = (
  speaker: number | null,
  text: string,
  startMs = 0,
): TranscriptSegment => ({ speaker, text, startMs, endMs: startMs + 1000 });

const transcript = (overrides: Partial<Transcript> = {}): Transcript => ({
  id: "txn-job-abc123",
  recordingId: "rec-1",
  providerId: "assemblyai",
  modelId: "universal-2",
  text: "Hello there. How are you?",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  ...overrides,
});

const diarized = () =>
  transcript({
    segments: [turn(0, "Hello there.", 0), turn(1, "How are you?", 1000)],
  });

describe("editableTurnsFor", () => {
  it("offers one turn per segment for a conversation", () => {
    expect(editableTurnsFor(diarized())).toEqual([
      { speaker: 0, text: "Hello there.", startMs: 0, endMs: 1000 },
      { speaker: 1, text: "How are you?", startMs: 1000, endMs: 2000 },
    ]);
  });

  it("offers the whole transcript as one turn when there are no segments", () => {
    expect(editableTurnsFor(transcript())).toEqual([
      { speaker: null, text: "Hello there. How are you?", startMs: 0, endMs: 0 },
    ]);
  });

  /*
   * The important one. If turns do not account for the transcript, editing them
   * and regenerating the text from them would delete the uncovered words — so
   * the user edits the flat text instead, exactly as they were reading it.
   */
  it("falls back to one turn when the segments do not cover the text", () => {
    const partial = transcript({
      text: "One. Two. Three. Four. Five. Six.",
      segments: [turn(0, "One."), turn(1, "Six.")],
    });
    expect(editableTurnsFor(partial)).toEqual([
      { speaker: null, text: "One. Two. Three. Four. Five. Six.", startMs: 0, endMs: 0 },
    ]);
  });
});

describe("editedTranscript", () => {
  it("never changes the provider's own transcript", () => {
    const original = diarized();
    const before = JSON.stringify(original);

    editedTranscript(original, editableTurnsFor(original), NOW);

    expect(JSON.stringify(original)).toBe(before);
  });

  it("produces a new record derived from the original", () => {
    const original = diarized();
    const edited = editedTranscript(
      original,
      [
        { speaker: 0, text: "Hello there!", startMs: 0, endMs: 1000 },
        { speaker: 1, text: "How are you?", startMs: 1000, endMs: 2000 },
      ],
      NOW,
    );

    expect(edited.id).not.toBe(original.id);
    expect(edited.derivedFrom).toBe(original.id);
    expect(edited.source).toEqual({ kind: "user" });
    expect(edited.text).toBe("Hello there! How are you?");
  });

  /*
   * §20: the provider and model record **origin**, and stay true after an edit.
   * `source` is what answers who wrote the words that are there now.
   */
  it("carries the origin forward unchanged", () => {
    const edited = editedTranscript(diarized(), editableTurnsFor(diarized()), NOW);
    expect(edited.providerId).toBe("assemblyai");
    expect(edited.modelId).toBe("universal-2");
  });

  it("keeps speaker attribution and timings untouched", () => {
    const edited = editedTranscript(
      diarized(),
      [
        { speaker: 0, text: "Changed.", startMs: 0, endMs: 1000 },
        { speaker: 1, text: "Also changed.", startMs: 1000, endMs: 2000 },
      ],
      NOW,
    );
    expect(edited.segments).toEqual([
      { speaker: 0, text: "Changed.", startMs: 0, endMs: 1000 },
      { speaker: 1, text: "Also changed.", startMs: 1000, endMs: 2000 },
    ]);
  });

  it("does not invent segments when editing a flat transcript", () => {
    // §10 reserves absence for "not asked for or not available"; a fabricated
    // one-speaker segment list would claim diarization happened.
    const edited = editedTranscript(
      transcript(),
      [{ speaker: null, text: "Rewritten entirely.", startMs: 0, endMs: 0 }],
      NOW,
    );
    expect(edited.segments).toBeUndefined();
    expect(edited.text).toBe("Rewritten entirely.");
  });

  it("updates an existing edit in place rather than chaining", () => {
    const original = diarized();
    const first = editedTranscript(original, editableTurnsFor(original), NOW);

    const second = editedTranscript(
      first,
      [
        { speaker: 0, text: "Third thoughts.", startMs: 0, endMs: 1000 },
        { speaker: 1, text: "How are you?", startMs: 1000, endMs: 2000 },
      ],
      new Date("2026-10-09T11:00:00.000Z"),
    );

    expect(second.id).toBe(first.id);
    // Still points at the provider's original, never at the intermediate copy.
    expect(second.derivedFrom).toBe(original.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
  });

  it("drops empty turns from the regenerated text", () => {
    const edited = editedTranscript(
      diarized(),
      [
        { speaker: 0, text: "Kept.", startMs: 0, endMs: 1000 },
        { speaker: 1, text: "   ", startMs: 1000, endMs: 2000 },
      ],
      NOW,
    );
    expect(edited.text).toBe("Kept.");
  });
});

describe("turnsChanged", () => {
  const base: EditableTurn[] = [
    { speaker: 0, text: "One.", startMs: 0, endMs: 1 },
    { speaker: 1, text: "Two.", startMs: 1, endMs: 2 },
  ];

  it("is false when nothing was touched", () => {
    expect(turnsChanged(base, base.map((t) => ({ ...t })))).toBe(false);
  });

  it("is true when a turn's words changed", () => {
    const edited = base.map((t) => ({ ...t }));
    edited[1].text = "Two!";
    expect(turnsChanged(base, edited)).toBe(true);
  });
});

describe("isProviderOutput", () => {
  it("treats a transcript written before provenance existed as untouched", () => {
    // Nothing could edit one at the time, so this is a fact, not a guess.
    expect(isProviderOutput(transcript())).toBe(true);
  });

  it("knows an edited transcript is not the provider's words", () => {
    expect(isProviderOutput(transcript({ source: { kind: "user" } }))).toBe(false);
  });
});
