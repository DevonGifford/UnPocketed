/**
 * Failure vocabulary for Import (§32).
 *
 * Shaped like `features/recording/errors.ts` but without its `audioIntact`
 * field, and the omission is deliberate: the file Import reads belongs to the
 * user and is never moved or rewritten, so it is still wherever they picked it
 * from whatever happens here. There is nothing to reassure them about, and a
 * "your audio is safe" line on every message would make the one place that
 * phrase carries weight — a failed recording — mean less.
 */

export type ImportFailureReason =
  | "unsupported-format"
  | "picker-failed"
  | "copy-failed";

export interface ImportFailure {
  reason: ImportFailureReason;
  /** Short enough to headline a message; no error codes. */
  title: string;
  /** What happened and what to do about it. */
  detail: string;
}

const FAILURES: Record<ImportFailureReason, Omit<ImportFailure, "reason">> = {
  "unsupported-format": {
    title: "That file is not an audio recording Unpocketed can read",
    detail:
      "Import handles M4A, MP3, WAV, MP4, WebM, AAC, 3GP, OGG, Opus and FLAC. The file you picked has not been copied, and nothing on this device has changed.",
  },
  "picker-failed": {
    title: "The file could not be opened",
    detail:
      "Android did not hand the file to Unpocketed. Nothing has been imported. Try again, or pick the file from a different app in the chooser.",
  },
  "copy-failed": {
    title: "That recording could not be copied into your library",
    detail:
      "Reading the file succeeded but storing it did not — most often because this device is low on space. Your original file is untouched. Free some space and try again.",
  },
};

/** Builds the user-facing failure for a reason. */
export function importFailure(reason: ImportFailureReason): ImportFailure {
  return { reason, ...FAILURES[reason] };
}
