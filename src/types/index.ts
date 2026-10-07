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
  /**
   * Capture ended with the app's termination rather than with the user stopping
   * it, so the container has no index: the audio is preserved and exportable
   * but cannot be played, and `durationMs` is an estimate (see CONTEXT.md).
   */
  interrupted: boolean;
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

/**
 * One transcription a Recording has asked for, while it is still in flight or
 * after it failed. A job that completes becomes a {@link Transcript} and its
 * job record is dropped — so a job is the *absence* of a result, never a
 * second copy of one.
 *
 * At most one per Recording: §21's states describe the Recording, and a second
 * concurrent transcription of the same audio has no state to occupy.
 */
export interface TranscriptionJob {
  recordingId: string;
  providerId: string;
  modelId: string;
  /**
   * The provider's handle on the work, stored the moment it is issued so a
   * transcription survives the app's death (§18). Null only in the window
   * between asking and being given one.
   */
  jobRef: string | null;
  /** `failed` carries {@link error}; `transcribing` covers queued and running. */
  state: "transcribing" | "failed";
  /** User-facing explanation when `state` is `failed`. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
