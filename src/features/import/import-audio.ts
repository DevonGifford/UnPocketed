import { getDocumentAsync } from "expo-document-picker";
import { File } from "expo-file-system";

import { indexRecording } from "@/features/library";
import { persistRecording } from "@/features/recording";
import type { Recording } from "@/types";

import { probeDurationMs } from "./duration";
import { importFailure, type ImportFailure } from "./errors";
import { classifyImport, importTitleFrom, PICKER_MIME_TYPES } from "./formats";

/*
 * Import (§17): bringing an externally-created audio file under Unpocketed's
 * management by copying it into managed storage.
 *
 * The copy §17 asks for is the picker's, not ours. `getDocumentAsync` with
 * `copyToCacheDirectory` copies the picked document into the app's cache
 * directory and returns a `file://` URI for that copy, so the content URI never
 * has to be relied on past the call. `persistRecording` then moves the copy to
 * the recordings directory — cache and documents are both internal storage, so
 * that is a rename rather than a second pass over an hour of audio (§34).
 *
 * The user's own file is never opened for writing, moved or deleted, whatever
 * happens in here.
 *
 * An imported recording is never Interrupted. That word means Unpocketed's
 * capture ended with the app's termination (CONTEXT.md), and the MP4 index
 * probe that detects it would report every MP3 and WAV as broken, since neither
 * has a `moov` box to find. Import does not go near it.
 */

/** Single-file import: §17's use case is one Pocket export at a time. */
const PICK_MULTIPLE = false;

export type ImportOutcome =
  /** The chooser was dismissed. Not a failure, and nothing to report. */
  | { status: "cancelled" }
  | { status: "imported"; recording: Recording }
  | { status: "failed"; failure: ImportFailure };

/** Best-effort removal of the picker's cache copy for a file we are refusing. */
function discardCacheCopy(uri: string): void {
  try {
    const copy = new File(uri);
    if (copy.exists) copy.delete();
  } catch {
    // Android evicts its own cache directory; leaving it costs nothing.
  }
}

/**
 * Opens Android's document chooser and brings the picked recording into the
 * library, where it behaves like any other Recording (§17).
 *
 * @returns What happened, including a cancelled chooser — the caller shows a
 * message only for `failed`.
 * @throws Never. Every failure comes back as an {@link ImportFailure}.
 */
export async function importAudioFile(): Promise<ImportOutcome> {
  let picked;

  try {
    picked = await getDocumentAsync({
      type: PICKER_MIME_TYPES,
      // §17: do not depend on an external URI past this call.
      copyToCacheDirectory: true,
      multiple: PICK_MULTIPLE,
    });
  } catch {
    return { status: "failed", failure: importFailure("picker-failed") };
  }

  if (picked.canceled) return { status: "cancelled" };

  const asset = picked.assets?.[0];
  if (!asset?.uri) {
    return { status: "failed", failure: importFailure("picker-failed") };
  }

  const format = classifyImport(asset);
  if (!format) {
    // Refused before anything enters managed storage. The cache copy already
    // exists — the picker makes it before we are told what was picked — so it
    // is dropped rather than left to sit until Android evicts it.
    discardCacheCopy(asset.uri);
    return { status: "failed", failure: importFailure("unsupported-format") };
  }

  /*
   * Probed before the move, so the duration lands in the sidecar on its first
   * write rather than needing a second one. A file that cannot be decoded comes
   * back as 0 and is imported anyway: the user asked for this audio to be kept,
   * and §3.2 does not make a duration a condition of keeping it.
   */
  const durationMs = await probeDurationMs(asset.uri);

  let recording: Recording;
  try {
    recording = await persistRecording({
      sourceUri: asset.uri,
      durationMs,
      source: "imported",
      title: importTitleFrom(asset.name) ?? undefined,
      extension: format.extension,
      mimeType: format.mimeType,
      /*
       * When the file was made, not when it was imported, so an archive of old
       * recordings does not all land under today's date (§15 is chronological).
       * `lastModified` is always populated — expo-document-picker falls back to
       * the current time itself when the provider reports none.
       */
      recordedAt: asset.lastModified ? new Date(asset.lastModified) : undefined,
    });
  } catch {
    return { status: "failed", failure: importFailure("copy-failed") };
  }

  // The sidecar is already written, so a failure here costs the row until the
  // next reconcile, never the recording.
  indexRecording(recording);

  return { status: "imported", recording };
}
