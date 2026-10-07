import type { Recording } from "@/types";

/*
 * Reconciling the index against the recordings directory.
 *
 * Disk wins, always. The audio file and its sidecar are the source of truth
 * (§3.2); the index exists to be queried, not to be believed. That asymmetry is
 * what lets the database be deleted and rebuilt without consulting the user.
 *
 * Kept free of native imports so the rules can be tested as plain data.
 */

export interface ReconcilePlan {
  /** On disk but absent from the index, or indexed with stale metadata. */
  index: Recording[];
  /** Indexed with no audio behind it. Dropping these removes no audio. */
  forget: string[];
}

/** Fields the sidecar owns. `audioPath` is rebuilt per install, so it is not compared. */
function differs(onDisk: Recording, indexed: Recording): boolean {
  return (
    onDisk.title !== indexed.title ||
    onDisk.source !== indexed.source ||
    onDisk.mimeType !== indexed.mimeType ||
    onDisk.durationMs !== indexed.durationMs ||
    onDisk.createdAt !== indexed.createdAt ||
    onDisk.updatedAt !== indexed.updatedAt
  );
}

/**
 * Works out what the index needs to match the recordings directory.
 *
 * @param onDisk Recordings found by scanning the directory.
 * @param indexed Recordings currently in the database.
 * @returns The rows to write and the rows to drop. Empty arrays mean the index
 * is already correct, which is the common case.
 */
export function planReconcile(
  onDisk: Recording[],
  indexed: Recording[],
): ReconcilePlan {
  const indexedById = new Map(indexed.map((r) => [r.id, r]));

  const index = onDisk.filter((recording) => {
    const existing = indexedById.get(recording.id);
    return !existing || differs(recording, existing);
  });

  const onDiskIds = new Set(onDisk.map((r) => r.id));
  const forget = indexed
    .filter((recording) => !onDiskIds.has(recording.id))
    .map((recording) => recording.id);

  return { index, forget };
}
