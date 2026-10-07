import {
  forgetRecordings,
  getRecording,
  listRecordings,
  upsertRecordings,
} from "@/db/recordings";
import { listPersistedRecordings } from "@/features/recording/storage";
import type { Recording } from "@/types";

import { planReconcile } from "./reconcile";

/*
 * The library's read path.
 *
 * Every function here degrades to scanning the recordings directory if the
 * index cannot be read. That is the point of keeping SQLite as an index: a
 * database failure costs query speed, never visibility of a recording (§3.2).
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
