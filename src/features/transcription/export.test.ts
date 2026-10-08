import {
  exportTimestamp,
  exportTranscript,
  transcriptAsJson,
  transcriptAsMarkdown,
  transcriptAsText,
} from "./export";
import type { Recording, Transcript, TranscriptSegment } from "@/types";

const EXPORTED_AT = new Date("2026-10-09T12:00:00.000Z");

const turn = (
  speaker: number | null,
  text: string,
  startMs: number,
): TranscriptSegment => ({ speaker, text, startMs, endMs: startMs + 1000 });

const recording = (overrides: Partial<Recording> = {}): Recording => ({
  id: "rec-1",
  title: "Meeting with Sam",
  source: "recorded",
  audioPath: "file:///data/user/0/com.unpocketed.app/files/recordings/rec-1.m4a",
  mimeType: "audio/mp4",
  durationMs: 2_892_000,
  createdAt: "2026-10-04T14:32:00.000Z",
  updatedAt: "2026-10-04T14:32:00.000Z",
  interrupted: false,
  ...overrides,
});

const transcript = (overrides: Partial<Transcript> = {}): Transcript => ({
  id: "txn-job-abc",
  recordingId: "rec-1",
  providerId: "assemblyai",
  modelId: "universal-2",
  text: "Hello there. How are you?",
  createdAt: "2026-10-04T14:40:00.000Z",
  updatedAt: "2026-10-04T14:40:00.000Z",
  ...overrides,
});

const diarized = () =>
  transcript({
    segments: [turn(0, "Hello there.", 0), turn(1, "How are you?", 27_000)],
  });

describe("exportTimestamp", () => {
  it("gives an absolute local timestamp, not a relative one", () => {
    // Built from local components so the expectation holds in any timezone.
    const at = new Date(2026, 9, 4, 14, 32);
    expect(exportTimestamp(at.toISOString())).toBe("2026-10-04 14:32");
  });

  it("does not throw on an unparseable date", () => {
    expect(exportTimestamp("not a date")).toBe("unknown");
  });
});

describe("transcriptAsText", () => {
  /*
   * §3.4 calls plain text "suitable for copy/paste". Pasting a transcript into
   * a message should not paste a provider name along with it.
   */
  it("carries no metadata at all", () => {
    const out = transcriptAsText(transcript());
    expect(out).toBe("Hello there. How are you?");
    expect(out).not.toContain("assemblyai");
  });

  it("prefixes speakers where turns exist", () => {
    expect(transcriptAsText(diarized())).toBe(
      "Speaker 1: Hello there.\n\nSpeaker 2: How are you?",
    );
  });

  it("says when a turn was not attributed rather than inventing a speaker", () => {
    const t = transcript({
      text: "Known. Unknown.",
      segments: [turn(0, "Known.", 0), turn(null, "Unknown.", 1000), turn(1, "Known.", 2000)],
    });
    expect(transcriptAsText(t)).toContain("Speaker not identified: Unknown.");
  });

  /*
   * Export must never hide words. If turns do not account for the transcript,
   * the flat text is what gets written out.
   */
  it("falls back to flat text when turns do not cover it", () => {
    const t = transcript({
      text: "One. Two. Three. Four. Five. Six.",
      segments: [turn(0, "One.", 0), turn(1, "Six.", 5000)],
    });
    expect(transcriptAsText(t)).toBe("One. Two. Three. Four. Five. Six.");
  });
});

describe("transcriptAsMarkdown", () => {
  it("writes §24's metadata block", () => {
    const md = transcriptAsMarkdown(transcript(), recording());
    expect(md).toContain("# Meeting with Sam");
    expect(md).toContain("Duration: 48:12");
    expect(md).toContain("Provider: assemblyai");
    expect(md).toContain("Model: universal-2");
    expect(md).toContain("## Transcript");
  });

  it("says nothing about editing for an untouched transcript", () => {
    expect(transcriptAsMarkdown(transcript(), recording())).not.toContain("Edited");
  });

  /*
   * §20's second half, exported. Provider and model stay as a statement of
   * origin; the edit line is what stops them being read as a claim about the
   * words actually in the file.
   */
  it("records who edited it, and keeps the origin intact", () => {
    const md = transcriptAsMarkdown(
      transcript({
        source: { kind: "user" },
        derivedFrom: "txn-job-abc",
        updatedAt: "2026-10-05T09:18:00.000Z",
      }),
      recording(),
    );
    expect(md).toContain("Provider: assemblyai");
    expect(md).toContain("(by you)");
    expect(md).toContain("Derived from: txn-job-abc");
  });

  it("names the model that rewrote it", () => {
    const md = transcriptAsMarkdown(
      transcript({ source: { kind: "llm", providerId: "anthropic", modelId: "claude" } }),
      recording(),
    );
    expect(md).toContain("(by anthropic claude)");
  });

  it("writes speaker turns with timings", () => {
    const md = transcriptAsMarkdown(diarized(), recording());
    expect(md).toContain("**Speaker 1** (0:00)");
    expect(md).toContain("**Speaker 2** (0:27)");
  });

  it("survives a transcript whose recording is gone", () => {
    const md = transcriptAsMarkdown(transcript(), null);
    expect(md).toContain("# Transcript");
    expect(md).not.toContain("Recorded:");
  });
});

describe("transcriptAsJson", () => {
  it("round-trips the transcript whole", () => {
    const original = diarized();
    const parsed = JSON.parse(transcriptAsJson(original, recording(), EXPORTED_AT));
    expect(parsed.transcript).toEqual(original);
  });

  /*
   * A path on one device is false everywhere else, so exporting it would state
   * something untrue in a file meant for backups and migration.
   */
  it("leaves the audio path out of the recording metadata", () => {
    const json = transcriptAsJson(transcript(), recording(), EXPORTED_AT);
    expect(json).not.toContain("audioPath");
    expect(json).not.toContain("/data/user/0/");
    expect(JSON.parse(json).recording.title).toBe("Meeting with Sam");
  });

  it("handles a missing recording", () => {
    const parsed = JSON.parse(transcriptAsJson(transcript(), null, EXPORTED_AT));
    expect(parsed.recording).toBeNull();
  });
});

describe("exportTranscript", () => {
  it("names the file after the recording and the model", () => {
    expect(exportTranscript(transcript(), recording(), "md", EXPORTED_AT).name).toBe(
      "meeting-with-sam-universal-2.md",
    );
  });

  it("distinguishes two transcripts of one recording", () => {
    const a = exportTranscript(transcript(), recording(), "txt", EXPORTED_AT);
    const b = exportTranscript(
      transcript({ modelId: "nova-3" }),
      recording(),
      "txt",
      EXPORTED_AT,
    );
    expect(a.name).not.toBe(b.name);
  });

  it("falls back to a usable name for an untitled recording", () => {
    expect(
      exportTranscript(transcript(), recording({ title: "   " }), "txt", EXPORTED_AT).name,
    ).toBe("transcript-universal-2.txt");
  });

  it("offers the right media type for each format", () => {
    const at = EXPORTED_AT;
    expect(exportTranscript(transcript(), null, "txt", at).mimeType).toBe("text/plain");
    expect(exportTranscript(transcript(), null, "md", at).mimeType).toBe("text/markdown");
    expect(exportTranscript(transcript(), null, "json", at).mimeType).toBe(
      "application/json",
    );
  });
});
