import {
  forgetBriefs,
  listBriefs,
  listBriefsFor,
  upsertBrief,
  upsertBriefs,
} from "@/db/briefs";
import type { Brief } from "@/types";

import { deleteBriefFile, listPersistedBriefs, writeBrief } from "./storage";

/*
 * Reads and writes for Briefs.
 *
 * Mirrors `features/transcription/repository.ts`: sidecar first, index second,
 * and reads that fall back to disk when the index cannot answer. A database
 * failure costs query speed, never a Brief the user paid for.
 */

/** Brings the Brief index into line with the briefs directory. */
export function reconcileBriefs(): number {
  try {
    const onDisk = listPersistedBriefs();
    const indexedIds = new Set(listBriefs().map((brief) => brief.id));
    upsertBriefs(onDisk);

    const onDiskIds = new Set(onDisk.map((brief) => brief.id));
    forgetBriefs([...indexedIds].filter((id) => !onDiskIds.has(id)));

    return onDisk.length;
  } catch {
    return 0;
  }
}

/** Every Brief. Falls back to disk if the index fails. */
export function listAllBriefs(): Brief[] {
  try {
    return listBriefs();
  } catch {
    return listPersistedBriefs();
  }
}

/** One Transcript's Briefs, newest first (§10). */
export function briefsFor(transcriptId: string): Brief[] {
  try {
    return listBriefsFor(transcriptId);
  } catch {
    return listPersistedBriefs().filter(
      (brief) => brief.transcriptId === transcriptId,
    );
  }
}

/**
 * Stores a Brief, sidecar first.
 *
 * Safe to repeat: a Brief's id is derived from its Transcript and the model
 * that wrote it, so re-running the same model overwrites one file and upserts
 * one row rather than stacking Briefs up. Running a *different* model lands on
 * a different id, which is what makes two Briefs comparable (§22).
 *
 * @throws If the sidecar cannot be written. The caller must say so rather than
 * let the user believe a request they have already paid for was kept.
 */
export function saveBrief(brief: Brief): Brief {
  writeBrief(brief);
  try {
    upsertBrief(brief);
  } catch {
    // The next reconcile picks it up from its sidecar.
  }
  return brief;
}

/**
 * Deletes one Brief (§25).
 *
 * Never touches the Transcript it describes, and never the Recording beneath
 * that. The caller is responsible for having asked first.
 *
 * @throws If the sidecar cannot be deleted, so the caller can say the Brief is
 * still there rather than removing it from the list regardless.
 */
export function deleteBrief(id: string): void {
  deleteBriefFile(id);
  try {
    forgetBriefs([id]);
  } catch {
    // The row now points at nothing; the next reconcile drops it.
  }
}

/**
 * Deletes every Brief belonging to a Transcript.
 *
 * Called when that Transcript is deleted (§25). A Brief describes a Transcript
 * and means nothing without it, so this is the one cascade in the enrichment
 * layer — and it runs only from an explicit deletion, never from an index
 * repair.
 *
 * @throws If a sidecar cannot be deleted.
 */
export function deleteBriefsFor(transcriptId: string): void {
  // Read once, up front: the loop deletes the files this list describes, so
  // re-reading it would come back empty and leave the rows behind.
  const owned = briefsFor(transcriptId);

  for (const brief of owned) {
    deleteBriefFile(brief.id);
  }
  try {
    forgetBriefs(owned.map((brief) => brief.id));
  } catch {
    // Rows now point at nothing; the next reconcile drops them.
  }
}
