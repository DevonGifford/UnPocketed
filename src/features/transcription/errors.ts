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
  | "interrupted-before-upload"
  /**
   * The app died while a Provider that keeps no job was transcribing.
   *
   * Distinct from {@link interrupted-before-upload} because there is nothing to
   * pick up *and* the work may already have been done and billed — a
   * synchronous Provider returns the transcript in its reply and keeps no copy,
   * so a lost reply is a lost transcript.
   */
  | "interrupted-unresumable"
  /** Contact was lost while polling a job that is still running. Not a failure. */
  | "poll-interrupted";

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
  "job-failed": {
    title: "The provider could not transcribe this recording",
    detail:
      "The provider accepted the recording and then failed to transcribe it. Your recording is safe on this device. Trying again submits it as new work.",
  },
  "poll-interrupted": {
    // Not a failure: the job is still running and still paid for. Saying
    // "failed" here would invite a retry that uploads and bills a second time.
    title: "Still transcribing",
    detail:
      "Unpocketed lost contact with the provider while waiting. The transcription is still running — reopen this recording, or restart Unpocketed, and it will be picked up where it left off. You will not be charged twice.",
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
    /*
     * This used to promise "nothing was transcribed or charged", which
     * Unpocketed cannot know. The window this covers is the one between sending
     * the request and being handed a reference for it, and a request can arrive
     * and be accepted inside it — so the honest claim is that there is nothing
     * to recover, not that there is nothing to pay. §32 is worth more than
     * reassurance here: a promise the user later finds untrue on their own
     * invoice costs more trust than an admission of uncertainty.
     */
    title: "Transcription was interrupted before it began",
    detail:
      "Unpocketed closed before the provider confirmed it had taken the job, so there is nothing left to pick up. It almost certainly never started — if you want to be sure you were not charged, your provider's dashboard will say. Your recording is safe on this device and can be tried again.",
  },
  "interrupted-unresumable": {
    title: "That transcription could not be picked up again",
    detail:
      "The provider you chose sends the transcript back in its reply and keeps no copy of it, so Unpocketed closing while it was running lost the result — and you may still have been charged for it. Your recording is safe on this device and can be transcribed again.",
  },
  "insufficient-credit": {
    title: "Your provider account is out of credit",
    detail:
      "Transcription is billed by the provider you chose, directly to you — Unpocketed does not pay for it. Add credit to that account, or pick a different provider in Settings. Nothing was transcribed and your recording is safe on this device.",
  },
};

/**
 * Reasons that cannot be fixed by repeating the same request.
 *
 * The default lives here rather than being inferred at each call site: the
 * provider's `TranscriptionError` makes the same judgement for its own kinds,
 * and the same fact defaulting two different ways in two files is how they
 * drift apart.
 */
const NOT_RETRYABLE: TranscriptionFailureReason[] = [
  // The key is wrong or missing: retrying sends the same bad credential.
  "unauthorized",
  "not-configured",
  // The key is fine and the balance is empty: retrying spends nothing and
  // fails identically until the user tops up or switches Provider.
  "insufficient-credit",
  // The audio itself is the problem, and it will not change.
  "too-large",
  "interrupted",
  "recording-missing",
  // The job is still running; retrying would pay for the same audio twice.
  "poll-interrupted",
];

/**
 * Builds the user-facing failure for a reason.
 *
 * @param retryable Overrides the default, for a provider error that classified
 * itself. Omit it to use {@link NOT_RETRYABLE}.
 */
export function transcriptionFailure(
  reason: TranscriptionFailureReason,
  retryable = !NOT_RETRYABLE.includes(reason),
): TranscriptionFailure {
  return { reason, ...FAILURES[reason], retryable };
}
