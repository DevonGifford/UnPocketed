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

/**
 * One continuous stretch of speech attributed to one speaker (§10).
 *
 * Produced by the Provider's own diarization, never inferred afterwards. That
 * distinction is load-bearing: a later layer may reformat or clean these turns,
 * but deciding *who spoke* from flat text means guessing at boundaries, and a
 * confident guess is worse than no answer.
 */
export interface TranscriptSegment {
  /**
   * Which speaker, as a 0-based index assigned in order of first appearance,
   * or **null where the Provider did not say who spoke this turn**.
   *
   * A label inside this Transcript only — **not an identity**. Speaker 0 in one
   * Transcript is not the same person as speaker 0 in another, not even for the
   * same Recording transcribed twice. Providers disagree on how to spell it
   * (AssemblyAI gives `"A"`, Deepgram gives `0`), so adapters normalise to this
   * index rather than passing their own labels through.
   *
   * Null is not another speaker. An unattributed turn used to be given its own
   * index, which rendered as one more person in the room who was never there —
   * a claim the Provider had not made. Keeping the words while admitting the
   * attribution is missing is the only option that invents nothing.
   */
  speaker: number | null;
  text: string;
  /** Offsets into the Recording, in milliseconds. Providers differ on units. */
  startMs: number;
  endMs: number;
}

/**
 * Who produced a Transcript's current text.
 *
 * Not a boolean, and that is the point. An LLM correcting a mishearing and a
 * user fixing a typo are the **same operation performed by different authors**,
 * so one field answers for both rather than two mechanisms doing one job.
 *
 * `provider` means the recogniser's own output, untouched since.
 */
export type TranscriptSource =
  /** Straight from the transcription Provider, unedited. */
  | { kind: "provider" }
  /** Edited by the user. */
  | { kind: "user" }
  /** Rewritten by an LLM, which is named so §20 stays answerable. */
  | { kind: "llm"; providerId: string; modelId: string };

export interface Transcript {
  id: string;
  recordingId: string;
  /**
   * Where this text came from **originally**.
   *
   * Stays accurate forever, including after an edit: it records origin, not
   * authorship of the current words. {@link Transcript.source} answers that,
   * and §20 needs both halves to stay answerable once text can change.
   */
  providerId: string;
  modelId: string;
  /**
   * Who wrote the text that is here now.
   *
   * Absent on Transcripts written before this existed, which is read as
   * `provider` — nothing could edit one at the time, so that is not a guess.
   */
  source?: TranscriptSource;
  /**
   * The Transcript this one was made by editing, when it was.
   *
   * Editing a derived Transcript updates it in place rather than making a
   * third, so this is at most one link deep: once something other than the
   * recogniser owns the text, there is no further provenance to protect.
   */
  derivedFrom?: string;
  /**
   * The whole transcript as plain text.
   *
   * Kept as the primary form even where {@link segments} exists, rather than
   * being derived from it on demand. §3.4 promises plain-text export, this is
   * what the index stores and what a Provider without diarization returns — so
   * every Transcript has one, and nothing has to special-case its absence.
   */
  text: string;
  /**
   * Speaker-attributed turns, when the Provider was asked for them and
   * produced them.
   *
   * Optional on purpose, and in three different ways: diarization is a setting
   * the user can turn off, it costs extra at some Providers, and a Transcript
   * written before this existed has none. Absent means "not asked for or not
   * available", never "one speaker".
   */
  segments?: TranscriptSegment[];
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
