import {
  forgetJobs,
  forgetTranscripts,
  getJob,
  listJobs,
  listTranscripts,
  listTranscriptsFor,
  upsertJob,
  upsertJobs,
  upsertTranscript,
  upsertTranscripts,
} from "@/db/transcripts";
import type { Transcript, TranscriptionJob } from "@/types";

import {
  deleteJobFile,
  deleteTranscriptFile,
  listPersistedJobs,
  listPersistedTranscripts,
  writeJob,
  writeTranscript,
} from "./storage";

/*
 * Reads and writes for transcripts and jobs.
 *
 * Mirrors `features/library/repository.ts` deliberately: sidecar first, index
 * second, and reads that fall back to disk when the index cannot answer. A
 * database failure costs query speed, never a transcript the user paid for.
 */

/** Brings both indexes into line with the transcripts directory. */
export function reconcileTranscripts(): {
  transcripts: number;
  jobs: number;
} {
  try {
    const onDisk = listPersistedTranscripts();
    const indexedIds = new Set(listTranscripts().map((t) => t.id));
    upsertTranscripts(onDisk);

    const onDiskIds = new Set(onDisk.map((t) => t.id));
    forgetTranscripts([...indexedIds].filter((id) => !onDiskIds.has(id)));

    const jobsOnDisk = listPersistedJobs();
    const indexedJobIds = new Set(listJobs().map((j) => j.recordingId));
    upsertJobs(jobsOnDisk);

    const jobIdsOnDisk = new Set(jobsOnDisk.map((j) => j.recordingId));
    forgetJobs([...indexedJobIds].filter((id) => !jobIdsOnDisk.has(id)));

    return { transcripts: onDisk.length, jobs: jobsOnDisk.length };
  } catch {
    return { transcripts: 0, jobs: 0 };
  }
}

/** Every Transcript, newest first. Falls back to disk if the index fails. */
export function listAllTranscripts(): Transcript[] {
  try {
    return listTranscripts();
  } catch {
    return listPersistedTranscripts();
  }
}

/** One Recording's Transcripts, newest first (§10). */
export function transcriptsFor(recordingId: string): Transcript[] {
  try {
    return listTranscriptsFor(recordingId);
  } catch {
    return listPersistedTranscripts().filter(
      (t) => t.recordingId === recordingId,
    );
  }
}

/**
 * One Transcript by id.
 *
 * Falls back to scanning when the index has no row, not only when it throws: a
 * transcript can exist on disk without a row, before the first reconcile.
 */
export function findTranscript(id: string): Transcript | null {
  try {
    const indexed = listTranscripts().find((t) => t.id === id);
    if (indexed) return indexed;
  } catch {
    // Fall through to the directory scan.
  }
  return listPersistedTranscripts().find((t) => t.id === id) ?? null;
}

/** The Recording's outstanding job, or null. Falls back to disk. */
export function jobFor(recordingId: string): TranscriptionJob | null {
  try {
    const indexed = getJob(recordingId);
    if (indexed) return indexed;
  } catch {
    // Fall through to the directory scan.
  }
  return (
    listPersistedJobs().find((j) => j.recordingId === recordingId) ?? null
  );
}

/** Every outstanding job. Used at startup to re-attach (§18). */
export function allJobs(): TranscriptionJob[] {
  try {
    return listJobs();
  } catch {
    return listPersistedJobs();
  }
}

/**
 * Records a job, sidecar first.
 *
 * Called before the provider is contacted and again the moment a reference
 * arrives. The sidecar write is allowed to throw: starting work whose reference
 * cannot be recorded would strand a paid transcription on the next app death,
 * so the caller must not proceed.
 *
 * @throws If the sidecar cannot be written.
 */
export function saveJob(job: TranscriptionJob): TranscriptionJob {
  writeJob(job);
  try {
    upsertJob(job);
  } catch {
    // The next reconcile picks it up from its sidecar.
  }
  return job;
}

/**
 * Stores a finished Transcript and clears the job that produced it.
 *
 * The transcript is written before the job is cleared, so a failure in between
 * leaves a job that will be re-attached rather than a transcript that was never
 * saved. Re-attaching costs a poll; losing the text costs a re-upload (§3.2).
 *
 * @throws If the transcript sidecar cannot be written.
 */
export function completeJob(transcript: Transcript): Transcript {
  writeTranscript(transcript);
  try {
    upsertTranscript(transcript);
  } catch {
    // The next reconcile picks it up from its sidecar.
  }

  clearJob(transcript.recordingId);
  return transcript;
}

/**
 * Removes a Recording's job — on success, or when the user dismisses a failure.
 *
 * @throws Never. A job left behind is re-attached or re-shown, which is
 * recoverable; throwing here would fail an otherwise successful transcription.
 */
export function clearJob(recordingId: string): void {
  try {
    deleteJobFile(recordingId);
  } catch {
    // The sidecar outlives its purpose; reconcile will not remove it, but the
    // next successful transcription overwrites it.
  }
  try {
    forgetJobs([recordingId]);
  } catch {
    // The row now describes nothing; the next reconcile drops it.
  }
}

/**
 * Deletes one Transcript (§25).
 *
 * Never touches the Recording it interprets — different file, different
 * directory. The caller is responsible for having asked first.
 *
 * @throws If the sidecar cannot be deleted, so the caller can say the
 * transcript is still there rather than removing it from the list regardless.
 */
export function deleteTranscript(id: string): void {
  deleteTranscriptFile(id);
  try {
    forgetTranscripts([id]);
  } catch {
    // The row now points at nothing; the next reconcile drops it.
  }
}

/**
 * Deletes every Transcript and job belonging to a Recording.
 *
 * §25's "delete recording and all associated data", and the only path that
 * removes transcripts the user did not name individually — which is why the
 * schema has no `ON DELETE CASCADE`: an index repair must never reach here.
 *
 * @throws If a sidecar cannot be deleted.
 */
export function deleteTranscriptsFor(recordingId: string): void {
  // Read once, up front: the second half deletes the files this list describes,
  // so re-reading it would come back empty and leave the rows behind.
  const owned = transcriptsFor(recordingId);

  for (const transcript of owned) {
    deleteTranscriptFile(transcript.id);
  }
  try {
    forgetTranscripts(owned.map((t) => t.id));
  } catch {
    // Rows now point at nothing; the next reconcile drops them.
  }
  clearJob(recordingId);
}
