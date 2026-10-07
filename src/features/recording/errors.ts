/**
 * Failure vocabulary for the recording session (§32).
 *
 * Every failure carries a user-facing explanation rather than a technical one,
 * and states explicitly whether audio was lost. §3.2 makes the original audio
 * sacred, so a message must never imply a recording survived when it did not —
 * nor frighten the user about one that is safely on disk.
 */

export type RecordingFailureReason =
  | "microphone-denied"
  | "notifications-denied"
  | "prepare-timed-out"
  | "prepare-failed"
  | "start-failed"
  | "service-unavailable"
  | "finalise-failed"
  | "save-failed";

export interface RecordingFailure {
  reason: RecordingFailureReason;
  /** Short enough to headline a message; no error codes. */
  title: string;
  /** What happened and what to do about it. */
  detail: string;
  /**
   * `true` only where the audio is known to be on disk, `false` where it is
   * known to be gone. Failures before any audio existed are `false` — nothing
   * was recorded, so there is nothing to reassure the user about.
   */
  audioIntact: boolean;
}

const FAILURES: Record<RecordingFailureReason, Omit<RecordingFailure, "reason">> = {
  "microphone-denied": {
    title: "Unpocketed needs the microphone",
    detail:
      "Recording is not possible without microphone access. Grant it in Android Settings → Apps → Unpocketed → Permissions, then try again.",
    audioIntact: false,
  },
  "notifications-denied": {
    // Android requires a visible notification for a microphone foreground
    // service, so on Android 13+ a refusal genuinely prevents recording
    // (expo/expo#50705) rather than merely hiding a notification.
    title: "Unpocketed needs to show a notification",
    detail:
      "Android requires a visible notification while an app records, so recording cannot start without it. Allow notifications for Unpocketed, then try again.",
    audioIntact: false,
  },
  "prepare-timed-out": {
    title: "The recorder did not start",
    detail:
      "Preparing the microphone took too long, so nothing was recorded. Try again — if it keeps happening, restart Unpocketed.",
    audioIntact: false,
  },
  "prepare-failed": {
    title: "The recorder did not start",
    detail:
      "The microphone could not be prepared, so nothing was recorded. Try again, or restart Unpocketed if it continues.",
    audioIntact: false,
  },
  "start-failed": {
    title: "Recording did not begin",
    detail: "The recorder was ready but did not start. Nothing was recorded. Try again.",
    audioIntact: false,
  },
  "service-unavailable": {
    // AudioRecorder.kt refuses to prepare when background recording is on but
    // the foreground service never bound. Transient, so worth retrying — unlike
    // a generic prepare failure, which usually is not.
    title: "Recording could not start this time",
    detail:
      "Android did not hand Unpocketed the background recording service. Nothing was recorded. Try again — this usually clears on a second attempt.",
    audioIntact: false,
  },
  "finalise-failed": {
    title: "This recording could not be closed properly",
    detail:
      "Stopping the recorder failed, so this recording may be incomplete or missing. Check your library before recording again.",
    audioIntact: false,
  },
  "save-failed": {
    title: "This recording could not be filed",
    detail:
      "The audio was captured but could not be moved into your library. It is still on this device in temporary storage — avoid restarting Unpocketed, and check your library.",
    audioIntact: true,
  },
};

/** Builds the user-facing failure for a reason. */
export function recordingFailure(reason: RecordingFailureReason): RecordingFailure {
  return { reason, ...FAILURES[reason] };
}
