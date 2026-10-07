import {
  forgetRecordings,
  getRecording,
  listRecordings,
  upsertRecording,
  upsertRecordings,
} from "@/db/recordings";
import {
  deleteRecordingFiles,
  listPersistedRecordings,
  updateRecordingMetadata,
} from "@/features/recording/storage";
import type { Recording } from "@/types";

import { planReconcile } from "./reconcile";

/*
 * The library's reads and writes.
 *
 * Reads degrade to scanning the recordings directory if the index cannot be
 * read. That is the point of keeping SQLite as an index: a database failure
 * costs query speed, never visibility of a recording (§3.2).
 *
 * Writes go to the sidecar first and the index second, so the durable artifact
 * is never behind the thing derived from it.
 */

/**
 * Brings the index into line with the recordings directory.
 *
 * Call at app start and on explicit refresh, not on every screen focus —
 * scanning reads and parses one sidecar per recording.
 *
 * @returns How many rows were written and dropped, for logging and tests.
 * @throws Never. A failure leaves the index as it was; reads fall back to disk.
 */
export function reconcileLibrary(): { indexed: number; forgotten: number } {
  try {
    const plan = planReconcile(listPersistedRecordings(), listRecordings());
    upsertRecordings(plan.index);
    forgetRecordings(plan.forget);
    return { indexed: plan.index.length, forgotten: plan.forget.length };
  } catch {
    return { indexed: 0, forgotten: 0 };
  }
}

/**
 * Indexes a recording the app has just written, so it appears without waiting
 * for a rescan. The sidecar is already on disk by this point, so a failure here
 * costs the row until the next reconcile, never the recording.
 *
 * @throws Never.
 */
export function indexRecording(recording: Recording): void {
  try {
    upsertRecording(recording);
  } catch {
    // The next reconcile picks it up from its sidecar.
  }
}

/** Every Recording, newest first (§15). Falls back to disk if the index fails. */
export function listLibrary(): Recording[] {
  try {
    return listRecordings();
  } catch {
    return listPersistedRecordings();
  }
}

/**
 * One Recording by id.
 *
 * Falls back to scanning when the index has no row, not only when it throws:
 * audio can exist without a row — after a sidecar-only restore, or before the
 * first reconcile — and §3.2 does not let the index be the reason it is hidden.
 */
export function findRecording(id: string): Recording | null {
  try {
    const indexed = getRecording(id);
    if (indexed) return indexed;
  } catch {
    // Fall through to the directory scan.
  }
  return listPersistedRecordings().find((r) => r.id === id) ?? null;
}

/**
 * Renames a recording (§15).
 *
 * Writes the sidecar first and the index second, so a failure in between leaves
 * the title safe on disk and merely stale in the index.
 *
 * @returns The renamed Recording.
 * @throws If the sidecar cannot be written. The index is left untouched then.
 */
export function renameRecording(id: string, title: string): Recording {
  const renamed = updateRecordingMetadata(id, { title: title.trim() });
  indexRecording(renamed);
  return renamed;
}

/**
 * Records a duration discovered at playback for a recording the index holds at
 * 0 — a recording whose sidecar was lost keeps no duration, and decoding the
 * file is the only way to learn one.
 *
 * @throws Never. A failure means the duration is read from the player again
 * next time, which is what already happens.
 */
export function backfillDuration(id: string, durationMs: number): void {
  if (durationMs <= 0) return;
  try {
    indexRecording(updateRecordingMetadata(id, { durationMs }));
  } catch {
    // Playback still reports the real duration; only the stored copy is missed.
  }
}

/**
 * Deletes a recording and its audio (§25).
 *
 * The caller is responsible for having asked first: this is the one operation
 * that removes original audio, and §3.2 allows it only on an explicit request.
 * Files go before the row, so a half-done delete cannot leave audio the library
 * still lists.
 *
 * @throws If the audio cannot be deleted, so the caller can say the recording
 * is still there rather than removing it from the list regardless.
 */
export function deleteRecording(id: string): void {
  deleteRecordingFiles(id);
  try {
    forgetRecordings([id]);
  } catch {
    // The row now points at nothing; the next reconcile drops it.
  }
}
