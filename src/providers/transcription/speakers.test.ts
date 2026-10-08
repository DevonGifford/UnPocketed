import {
  millisecondsAreMilliseconds,
  secondsToMilliseconds,
  speakerCount,
  toSegments,
  type RawTurn,
} from "./speakers";

describe("toSegments", () => {
  it("indexes speakers by order of first appearance", () => {
    // AssemblyAI's own labelling: letters, milliseconds.
    const turns: RawTurn[] = [
      { speaker: "A", text: "Hello.", start: 250, end: 900 },
      { speaker: "B", text: "Good morning.", start: 950, end: 1800 },
      { speaker: "A", text: "Shall we start?", start: 1850, end: 2600 },
    ];

    expect(toSegments(turns, millisecondsAreMilliseconds)).toEqual([
      { speaker: 0, text: "Hello.", startMs: 250, endMs: 900 },
      { speaker: 1, text: "Good morning.", startMs: 950, endMs: 1800 },
      { speaker: 0, text: "Shall we start?", startMs: 1850, endMs: 2600 },
    ]);
  });

  /*
   * Deepgram numbers speakers and reports float seconds. The same conversation
   * must come out identically, which is the whole point of normalising: the
   * domain never learns which provider produced it.
   */
  it("gives the same answer for Deepgram's numbering and seconds", () => {
    const turns: RawTurn[] = [
      { speaker: 0, text: "Hello.", start: 0.25, end: 0.9 },
      { speaker: 1, text: "Good morning.", start: 0.95, end: 1.8 },
      { speaker: 0, text: "Shall we start?", start: 1.85, end: 2.6 },
    ];

    expect(toSegments(turns, secondsToMilliseconds)).toEqual([
      { speaker: 0, text: "Hello.", startMs: 250, endMs: 900 },
      { speaker: 1, text: "Good morning.", startMs: 950, endMs: 1800 },
      { speaker: 0, text: "Shall we start?", startMs: 1850, endMs: 2600 },
    ]);
  });

  it("does not assume a provider numbers from zero", () => {
    // A provider labelling speakers 1 and 2 must still yield dense 0-based
    // indices, which arithmetic on the label would get wrong.
    const turns: RawTurn[] = [
      { speaker: 1, text: "One.", start: 0, end: 1 },
      { speaker: 2, text: "Two.", start: 1, end: 2 },
    ];
    expect(toSegments(turns, secondsToMilliseconds)?.map((s) => s.speaker)).toEqual([
      0, 1,
    ]);
  });

  it("drops turns with no words rather than rendering an empty bubble", () => {
    const turns: RawTurn[] = [
      { speaker: "A", text: "   ", start: 0, end: 1 },
      { speaker: "B", text: "Real words.", start: 1, end: 2 },
    ];
    expect(toSegments(turns, millisecondsAreMilliseconds)).toEqual([
      { speaker: 0, text: "Real words.", startMs: 1, endMs: 2 },
    ]);
  });

  it("keeps an unlabelled turn rather than guessing who said it", () => {
    // Losing the words would be worse than an extra speaker bucket, and
    // folding it into the previous speaker is the invention §10 forbids.
    const turns: RawTurn[] = [
      { speaker: "A", text: "Known.", start: 0, end: 1 },
      { speaker: null, text: "Unattributed.", start: 1, end: 2 },
    ];
    expect(toSegments(turns, millisecondsAreMilliseconds)).toEqual([
      { speaker: 0, text: "Known.", startMs: 0, endMs: 1 },
      { speaker: 1, text: "Unattributed.", startMs: 1, endMs: 2 },
    ]);
  });

  it("survives missing and nonsense offsets", () => {
    const turns: RawTurn[] = [
      { speaker: "A", text: "No timings.", start: undefined, end: null },
      { speaker: "A", text: "Negative.", start: -5, end: NaN },
    ];
    expect(toSegments(turns, millisecondsAreMilliseconds)).toEqual([
      { speaker: 0, text: "No timings.", startMs: 0, endMs: 0 },
      { speaker: 0, text: "Negative.", startMs: 0, endMs: 0 },
    ]);
  });

  /*
   * §10: absent means "not asked for or not available", never "one speaker".
   * An empty array would read as a diarized transcript with nothing in it.
   */
  it("is undefined rather than empty when there is nothing usable", () => {
    expect(toSegments(undefined, millisecondsAreMilliseconds)).toBeUndefined();
    expect(toSegments([], millisecondsAreMilliseconds)).toBeUndefined();
    expect(
      toSegments([{ speaker: "A", text: "", start: 0, end: 0 }], millisecondsAreMilliseconds),
    ).toBeUndefined();
  });
});

describe("speakerCount", () => {
  it("counts distinct speakers, not turns", () => {
    const turns: RawTurn[] = [
      { speaker: "A", text: "One.", start: 0, end: 1 },
      { speaker: "B", text: "Two.", start: 1, end: 2 },
      { speaker: "A", text: "Three.", start: 2, end: 3 },
    ];
    expect(speakerCount(toSegments(turns, millisecondsAreMilliseconds))).toBe(2);
  });

  it("is 1 for a single speaker, so the interface can stay quiet", () => {
    const turns: RawTurn[] = [
      { speaker: "A", text: "Just me.", start: 0, end: 1 },
      { speaker: "A", text: "Still me.", start: 1, end: 2 },
    ];
    expect(speakerCount(toSegments(turns, millisecondsAreMilliseconds))).toBe(1);
  });

  it("is 0 when there are no segments", () => {
    expect(speakerCount(undefined)).toBe(0);
  });
});
