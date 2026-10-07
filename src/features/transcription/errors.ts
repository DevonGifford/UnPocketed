import type { TranscriptionErrorKind } from "@/providers/transcription";

/**
 * Failure vocabulary for transcription (§32).
 *
 * Every message says, or implies plainly, that the recording is unaffected —
 * §21 requires failure not to touch the original, and §32 requires errors to
 * reinforce that "where that statement is true". Here it is always true: no
 * path in this feature writes to stored audio.
 *
 * `retryable` drives whether the interface offers "Try again" (§21) rather than
 * inviting the user to repeat something that cannot work.
 */

export type TranscriptionFailureReason =
  | TranscriptionErrorKind
  /** No provider API key stored yet (§19). */
  | "not-configured"
  /** The Recording vanished between asking and starting. */
  | "recording-missing"
  /** The audio has no index, so no decoder can read it (CONTEXT.md). */
  | "interrupted"
  /** The job could not be written down, so it was not started. */
  | "not-recorded"
  /** The app died between recording the job and the provider answering. */
  | "interrupted-before-upload";

export interface TranscriptionFailure {
  reason: TranscriptionFailureReason;
  /** Short enough to headline a message; no error codes. */
  title: string;
  /** What happened and what to do about it. */
  detail: string;
  /** Whether repeating the same request could succeed (§21). */
  retryable: boolean;
}

const FAILURES: Record<
  TranscriptionFailureReason,
  Omit<TranscriptionFailure, "reason" | "retryable">
> = {
  "not-configured": {
    title: "No transcription provider is set up",
    detail:
      "Transcription uses a provider you choose and pay for directly. Add an API key in Settings, then try again. Your recording is safe on this device.",
  },
  unauthorized: {
    title: "The provider did not accept your API key",
    detail:
      "Check the key in Settings — it may have been revoked, or belong to a different account. Nothing was transcribed and your recording is safe on this device.",
  },
  offline: {
    // §32's own example wording for the offline case.
    title: "No internet connection",
    detail:
      "Your recording is safe on this device. Connect to the internet before trying transcription again.",
  },
  "provider-failed": {
    title: "The provider could not transcribe this recording",
    detail:
      "The recording was sent but the provider did not return a transcript. Your recording is safe on this device and can be tried again.",
  },
  "too-large": {
    title: "This recording is too long for the provider",
    detail:
      "The provider refused the file for its size. Your recording is safe on this device — you can export it and transcribe it elsewhere.",
  },
  unknown: {
    title: "Transcription did not finish",
    detail:
      "Something went wrong between here and the provider. Your recording is safe on this device and can be tried again.",
  },
  "recording-missing": {
    title: "That recording is no longer here",
    detail: "It may have been deleted. Nothing was sent to the provider.",
  },
  interrupted: {
    // An Interrupted Recording's audio is preserved but unplayable, so no
    // decoder — the provider's included — can read it. Uploading it would
    // spend the user's money to be told the same thing.
    title: "An interrupted recording cannot be transcribed",
    detail:
      "This recording's audio was kept but its index was never written, so no transcription service can read it. Share the original audio to a computer if you need to recover it.",
  },
  "not-recorded": {
    title: "Transcription could not be started",
    detail:
      "Unpocketed could not note down the job before starting it, and would not have been able to recover it if the app closed. Nothing was sent or charged. Try again.",
  },
  "interrupted-before-upload": {
    title: "Transcription was interrupted before it began",
    detail:
      "Unpocketed closed before the provider took the job, so nothing was transcribed or charged. Your recording is safe on this device and can be tried again.",
  },
};

/** Builds the user-facing failure for a reason. */
export function transcriptionFailure(
  reason: TranscriptionFailureReason,
  retryable = true,
): TranscriptionFailure {
  return { reason, ...FAILURES[reason], retryable };
}
