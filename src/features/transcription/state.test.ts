import { groupTranscriptsByRecording, transcriptionStateOf } from "./state";
import type { Transcript, TranscriptionJob } from "@/types";

const job = (overrides: Partial<TranscriptionJob> = {}): TranscriptionJob => ({
  recordingId: "rec_01",
  providerId: "assemblyai",
  modelId: "universal-2",
  jobRef: "job_01",
  state: "transcribing",
  error: null,
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  ...overrides,
});

const transcript = (id: string, recordingId: string): Transcript => ({
  id,
  recordingId,
  providerId: "assemblyai",
  modelId: "universal-2",
  text: "…",
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
});

describe("transcriptionStateOf", () => {
  it("is not-transcribed with no job and no transcripts", () => {
    expect(transcriptionStateOf(null, 0)).toBe("not-transcribed");
  });

  it("is transcribed once a transcript exists", () => {
    expect(transcriptionStateOf(null, 1)).toBe("transcribed");
  });

  it("is transcribing while a job is outstanding", () => {
    expect(transcriptionStateOf(job(), 0)).toBe("transcribing");
  });

  it("is failed when the job failed", () => {
    expect(transcriptionStateOf(job({ state: "failed" }), 0)).toBe("failed");
  });

  it("reports a retranscription as transcribing, not transcribed", () => {
    // §22: existing transcripts stay available while another is produced. The
    // state answers "is something happening", so the job wins.
    expect(transcriptionStateOf(job(), 2)).toBe("transcribing");
  });

  it("reports a failed retranscription as failed, so the failure is not hidden", () => {
    expect(transcriptionStateOf(job({ state: "failed" }), 2)).toBe("failed");
  });
});

describe("groupTranscriptsByRecording", () => {
  it("groups by recording and preserves input order within a group", () => {
    const grouped = groupTranscriptsByRecording([
      transcript("t3", "rec_02"),
      transcript("t2", "rec_01"),
      transcript("t1", "rec_01"),
    ]);

    expect(grouped.get("rec_01")?.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(grouped.get("rec_02")?.map((t) => t.id)).toEqual(["t3"]);
  });

  it("has no entry for a recording with no transcripts", () => {
    expect(groupTranscriptsByRecording([]).get("rec_01")).toBeUndefined();
  });
});
