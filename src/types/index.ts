/**
 * Domain types (§10). The vocabulary here is fixed by CONTEXT.md — a Recording
 * is the original audio source, a Transcript is one interpretation of it, and a
 * Recording owns zero or more Transcripts rather than a single mutable field.
 */

export type RecordingSource = "recorded" | "imported";

export interface Recording {
  id: string;
  title: string;
  source: RecordingSource;
  audioPath: string;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transcript {
  id: string;
  recordingId: string;
  providerId: string;
  modelId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** §21. Describes a Recording's transcription state, not a Transcript's. */
export type TranscriptionState =
  | "not-transcribed"
  | "transcribing"
  | "transcribed"
  | "failed";
