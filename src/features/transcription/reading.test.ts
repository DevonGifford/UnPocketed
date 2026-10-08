import {
  groupedTurns,
  readingViewFor,
  segmentsCoverText,
  speakerLabel,
} from "./reading";
import type { Transcript, TranscriptSegment } from "@/types";

const turn = (
  speaker: number | null,
  text: string,
  startMs = 0,
): TranscriptSegment => ({ speaker, text, startMs, endMs: startMs + 1000 });

const transcript = (
  text: string,
  segments?: TranscriptSegment[],
): Transcript => ({
  id: "txn-1",
  recordingId: "rec-1",
  providerId: "deepgram",
  modelId: "nova-3",
  text,
  ...(segments ? { segments } : {}),
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
});

describe("segmentsCoverText", () => {
  it("accepts turns that account for the whole transcript", () => {
    expect(
      segmentsCoverText("Hello there. How are you?", [
        turn(0, "Hello there."),
        turn(1, "How are you?"),
      ]),
    ).toBe(true);
  });

  it("ignores punctuation and casing the two forms disagree on", () => {
    expect(
      segmentsCoverText("Yes, today it is very good", [
        turn(0, "yes"),
        turn(1, "Today it is — very good!"),
      ]),
    ).toBe(true);
  });

  /*
   * The case the rule exists for: a provider's utterances missing a whole turn
   * would silently delete that speech from the reading view, and the user paid
   * for every word of it.
   */
  it("rejects turns that drop a whole sentence", () => {
    expect(
      segmentsCoverText(
        "Welcome to the show. Today we have a returning guest. Thanks for coming.",
        [turn(0, "Welcome to the show."), turn(1, "Thanks for coming.")],
      ),
    ).toBe(false);
  });

  it("counts repeated words rather than just distinct ones", () => {
    // Deepgram heard the greeting twice; turns carrying it once do not cover it.
    expect(
      segmentsCoverText("Hello. Good morning. Hello. Good morning.", [
        turn(0, "Hello. Good morning."),
      ]),
    ).toBe(false);
  });

  it("is false with no turns at all", () => {
    expect(segmentsCoverText("Some words.", undefined)).toBe(false);
    expect(segmentsCoverText("Some words.", [])).toBe(false);
  });

  it("treats an empty transcript as covered", () => {
    expect(segmentsCoverText("", [turn(0, "")])).toBe(true);
  });
});

describe("groupedTurns", () => {
  /*
   * The case found in a real export. Deepgram cut one speaker's sentence into
   * three turns, and the Markdown repeated "**Speaker 2**" three times for one
   * person talking — while the screen, which grouped them, read correctly.
   */
  it("merges consecutive turns by the same speaker", () => {
    expect(
      groupedTurns([
        turn(1, "Alright. Welcome to the show.", 8000),
        turn(1, "Today with me, we have a", 12000),
        turn(1, "returning guest.", 13000),
        turn(0, "Thanks for having me.", 21000),
      ]),
    ).toEqual([
      {
        speaker: 1,
        startMs: 8000,
        text: "Alright. Welcome to the show. Today with me, we have a returning guest.",
      },
      { speaker: 0, startMs: 21000, text: "Thanks for having me." },
    ]);
  });

  it("keeps the first turn's start time for the block", () => {
    const [block] = groupedTurns([turn(0, "One.", 5000), turn(0, "Two.", 9000)]);
    expect(block.startMs).toBe(5000);
  });

  it("never merges an unattributed turn into a neighbour", () => {
    // Folding it in would attribute those words to someone the provider never
    // said spoke them.
    expect(
      groupedTurns([
        turn(0, "Mine.", 0),
        turn(null, "Unknown.", 1000),
        turn(0, "Mine again.", 2000),
      ]).map((block) => block.speaker),
    ).toEqual([0, null, 0]);
  });

  it("does not merge two unattributed turns with each other", () => {
    expect(
      groupedTurns([turn(null, "One.", 0), turn(null, "Two.", 1000)]),
    ).toHaveLength(2);
  });
});

describe("speakerLabel", () => {
  it("numbers speakers from one for a reader", () => {
    expect(speakerLabel(0)).toBe("Speaker 1");
  });

  it("says a turn was not attributed rather than numbering it", () => {
    expect(speakerLabel(null)).toBe("Speaker not identified");
  });
});

describe("readingViewFor", () => {
  it("reads as turns when two speakers cover the text", () => {
    const t = transcript("Hello there. How are you?", [
      turn(0, "Hello there."),
      turn(1, "How are you?"),
    ]);
    expect(readingViewFor(t)).toEqual({ kind: "turns", segments: t.segments });
  });

  it("reads as text when there are no turns", () => {
    expect(readingViewFor(transcript("Just words."))).toEqual({
      kind: "text",
      text: "Just words.",
    });
  });

  it("reads as text for a single speaker throughout", () => {
    // A voice memo should not be labelled "Speaker 1" on every line.
    const t = transcript("All me. Still me.", [
      turn(0, "All me."),
      turn(0, "Still me."),
    ]);
    expect(readingViewFor(t)).toEqual({ kind: "text", text: "All me." + " Still me." });
  });

  it("falls back to text rather than hiding words the turns miss", () => {
    const t = transcript("One. Two. Three. Four. Five. Six.", [
      turn(0, "One."),
      turn(1, "Six."),
    ]);
    expect(readingViewFor(t).kind).toBe("text");
  });

  /*
   * An unattributed turn is not a speaker, so a transcript with one real
   * speaker and one unattributed turn is still not a conversation.
   */
  it("does not treat an unattributed turn as a second speaker", () => {
    const t = transcript("Mine. Unknown.", [
      turn(0, "Mine."),
      turn(null, "Unknown."),
    ]);
    expect(readingViewFor(t).kind).toBe("text");
  });

  it("keeps turns when a real conversation also has an unattributed one", () => {
    const t = transcript("A. B. C.", [
      turn(0, "A."),
      turn(1, "B."),
      turn(null, "C."),
    ]);
    expect(readingViewFor(t).kind).toBe("turns");
  });
});
