import { enrichmentInputFor } from "./enrich";
import { enrichmentFailure } from "./errors";
import type { Transcript, TranscriptSegment } from "@/types";

const turn = (
  speaker: number | null,
  text: string,
  startMs: number,
): TranscriptSegment => ({ speaker, text, startMs, endMs: startMs + 1000 });

const transcript = (overrides: Partial<Transcript> = {}): Transcript => ({
  id: "txn-1",
  recordingId: "rec-1",
  providerId: "deepgram",
  modelId: "nova-3",
  text: "Hello there. How are you?",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  ...overrides,
});

describe("enrichmentInputFor", () => {
  it("sends flat text when there are no speaker turns", () => {
    const input = enrichmentInputFor(transcript());
    expect(input.text).toBe("Hello there. How are you?");
    expect(input.speakers).toEqual([]);
  });

  it("labels speakers so the model can refer to them", () => {
    const input = enrichmentInputFor(
      transcript({
        segments: [turn(0, "Hello there.", 0), turn(1, "How are you?", 1000)],
      }),
    );
    expect(input.text).toBe("Speaker 1: Hello there.\n\nSpeaker 2: How are you?");
    expect(input.speakers).toEqual([0, 1]);
  });

  /*
   * Deepgram cuts one speaker's sentence into several turns. Sending them
   * ungrouped would show the model a conversation with fourteen exchanges that
   * never happened, and it would summarise that instead of the real one.
   */
  it("groups a speaker's consecutive turns before sending them", () => {
    const input = enrichmentInputFor(
      transcript({
        text: "Welcome to the show today with me. Thanks for having me.",
        segments: [
          turn(0, "Welcome to the show", 0),
          turn(0, "today with me.", 2000),
          turn(1, "Thanks for having me.", 5000),
        ],
      }),
    );
    expect(input.text).toBe(
      "Speaker 1: Welcome to the show today with me.\n\nSpeaker 2: Thanks for having me.",
    );
  });

  /*
   * The important one. Where turns do not account for the whole transcript,
   * sending them would hand the model a transcript with words missing and then
   * ask it to summarise what it was never shown.
   */
  it("falls back to flat text rather than sending an incomplete transcript", () => {
    const input = enrichmentInputFor(
      transcript({
        text: "One. Two. Three. Four. Five. Six.",
        segments: [turn(0, "One.", 0), turn(1, "Six.", 5000)],
      }),
    );
    expect(input.text).toBe("One. Two. Three. Four. Five. Six.");
    expect(input.speakers).toEqual([]);
  });

  it("does not count an unattributed turn as a speaker", () => {
    const input = enrichmentInputFor(
      transcript({
        text: "A. B. C.",
        segments: [turn(0, "A.", 0), turn(1, "B.", 1000), turn(null, "C.", 2000)],
      }),
    );
    expect(input.speakers).toEqual([0, 1]);
    expect(input.text).toContain("Speaker not identified: C.");
  });

  it("estimates a token count for the context guard", () => {
    expect(enrichmentInputFor(transcript()).estimatedTokens).toBeGreaterThan(0);
  });
});

describe("enrichmentFailure", () => {
  it("does not offer a retry for anything the same request cannot fix", () => {
    for (const reason of [
      "unauthorized",
      "not-configured",
      "insufficient-credit",
      "too-large",
      "empty-transcript",
    ] as const) {
      expect(enrichmentFailure(reason).retryable).toBe(false);
    }
  });

  it("offers a retry for a rate limit and a transport failure", () => {
    expect(enrichmentFailure("rate-limited").retryable).toBe(true);
    expect(enrichmentFailure("offline").retryable).toBe(true);
  });

  /*
   * The one failure that costs money: the provider wrote a brief and billed for
   * it, and only the write failed. The message must not imply nothing happened,
   * or the user retries without knowing they are paying twice.
   */
  it("admits that a brief it could not save was still paid for", () => {
    const failure = enrichmentFailure("not-stored");
    expect(failure.detail).toContain("charged");
    expect(failure.detail).toContain("paying for another");
    expect(failure.retryable).toBe(true);
  });

  it("never suggests enrichment changed the recording or transcript", () => {
    const reasons = [
      "not-configured", "unauthorized", "offline", "provider-failed",
      "insufficient-credit", "rate-limited", "too-large", "unreadable",
      "unknown", "empty-transcript", "not-stored",
    ] as const;
    for (const reason of reasons) {
      const { detail } = enrichmentFailure(reason);
      expect(detail).not.toMatch(/deleted|lost|overwritten|replaced/i);
    }
  });
});
