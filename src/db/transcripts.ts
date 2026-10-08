import type {
  Transcript,
  TranscriptionJob,
  TranscriptSegment,
  TranscriptSource,
} from "@/types";

import { getDatabase } from "./database";

/*
 * Queries over the transcript and job indexes. Rows map to domain types in one
 * place, which is the only spot a column rename can reach.
 */

interface TranscriptRow {
  id: string;
  recording_id: string;
  provider_id: string;
  model_id: string;
  text: string;
  /** A JSON array of segments, or null where the transcript has none. */
  segments: string | null;
  /** A JSON {@link TranscriptSource}, or null for untouched provider output. */
  source: string | null;
  derived_from: string | null;
  created_at: string;
  updated_at: string;
}

interface JobRow {
  recording_id: string;
  provider_id: string;
  model_id: string;
  job_ref: string | null;
  state: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const TRANSCRIPT_COLUMNS =
  "id, recording_id, provider_id, model_id, text, segments, source, derived_from, created_at, updated_at";

const JOB_COLUMNS =
  "recording_id, provider_id, model_id, job_ref, state, error, created_at, updated_at";

/**
 * Reads the segments column.
 *
 * Unparseable JSON yields undefined rather than throwing: the transcript's
 * text is the part the user paid for, and losing the whole row over malformed
 * speaker turns would be the wrong trade. The sidecar is the durable copy, so
 * the next reconcile repairs it.
 */
function segmentsFrom(stored: string | null): TranscriptSegment[] | undefined {
  if (!stored) return undefined;
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length > 0
      ? (parsed as TranscriptSegment[])
      : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the source column. Unreadable JSON is treated as provider output. */
function sourceFrom(stored: string | null): TranscriptSource | undefined {
  if (!stored) return undefined;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const kind = (parsed as { kind?: unknown }).kind;
    if (kind === "provider" || kind === "user" || kind === "llm") {
      return parsed as TranscriptSource;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function toTranscript(row: TranscriptRow): Transcript {
  const segments = segmentsFrom(row.segments);
  const source = sourceFrom(row.source);
  return {
    id: row.id,
    recordingId: row.recording_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    text: row.text,
    // Spread so the key is absent rather than explicitly undefined, keeping
    // `segments` in a row and in a sidecar the same shape.
    ...(segments ? { segments } : {}),
    ...(source ? { source } : {}),
    ...(row.derived_from ? { derivedFrom: row.derived_from } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toJob(row: JobRow): TranscriptionJob {
  return {
    recordingId: row.recording_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    jobRef: row.job_ref,
    // An unrecognised value means a row written by a newer schema. Reading it
    // as failed is the safe default: it shows the user something actionable
    // rather than a spinner for work nothing is waiting on.
    state: row.state === "transcribing" ? "transcribing" : "failed",
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every indexed Transcript, newest first. */
export function listTranscripts(): Transcript[] {
  return getDatabase()
    .getAllSync<TranscriptRow>(
      `SELECT ${TRANSCRIPT_COLUMNS} FROM transcripts ORDER BY created_at DESC`,
    )
    .map(toTranscript);
}

/** One Recording's Transcripts, newest first (§10: a Recording owns many). */
export function listTranscriptsFor(recordingId: string): Transcript[] {
  return getDatabase()
    .getAllSync<TranscriptRow>(
      `SELECT ${TRANSCRIPT_COLUMNS} FROM transcripts
       WHERE recording_id = ? ORDER BY created_at DESC`,
      recordingId,
    )
    .map(toTranscript);
}

/** @returns The Transcript, or null when nothing is indexed under that id. */
export function getTranscript(id: string): Transcript | null {
  const row = getDatabase().getFirstSync<TranscriptRow>(
    `SELECT ${TRANSCRIPT_COLUMNS} FROM transcripts WHERE id = ?`,
    id,
  );
  return row ? toTranscript(row) : null;
}

/** Inserts or replaces a row to match the transcript on disk. */
export function upsertTranscript(transcript: Transcript): void {
  getDatabase().runSync(
    `INSERT INTO transcripts (${TRANSCRIPT_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       recording_id = excluded.recording_id,
       provider_id = excluded.provider_id,
       model_id = excluded.model_id,
       text = excluded.text,
       segments = excluded.segments,
       source = excluded.source,
       derived_from = excluded.derived_from,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    transcript.id,
    transcript.recordingId,
    transcript.providerId,
    transcript.modelId,
    transcript.text,
    transcript.segments?.length
      ? JSON.stringify(transcript.segments)
      : null,
    transcript.source ? JSON.stringify(transcript.source) : null,
    transcript.derivedFrom ?? null,
    transcript.createdAt,
    transcript.updatedAt,
  );
}

/** Applies several upserts under one transaction. */
export function upsertTranscripts(transcripts: Transcript[]): void {
  if (transcripts.length === 0) return;
  getDatabase().withTransactionSync(() => {
    for (const transcript of transcripts) upsertTranscript(transcript);
  });
}

/**
 * Drops transcript rows. **No sidecar is touched** — this is for rows whose
 * file is already gone. Deleting a transcript the user asked to delete goes
 * through the transcription repository, which removes the file too.
 */
export function forgetTranscripts(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  getDatabase().runSync(
    `DELETE FROM transcripts WHERE id IN (${placeholders})`,
    ...ids,
  );
}

/** Every indexed job: in flight or failed. */
export function listJobs(): TranscriptionJob[] {
  return getDatabase()
    .getAllSync<JobRow>(`SELECT ${JOB_COLUMNS} FROM transcription_jobs`)
    .map(toJob);
}

/** @returns The Recording's job, or null when it has none. */
export function getJob(recordingId: string): TranscriptionJob | null {
  const row = getDatabase().getFirstSync<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM transcription_jobs WHERE recording_id = ?`,
    recordingId,
  );
  return row ? toJob(row) : null;
}

/** Inserts or replaces a job row to match its sidecar. */
export function upsertJob(job: TranscriptionJob): void {
  getDatabase().runSync(
    `INSERT INTO transcription_jobs (${JOB_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(recording_id) DO UPDATE SET
       provider_id = excluded.provider_id,
       model_id = excluded.model_id,
       job_ref = excluded.job_ref,
       state = excluded.state,
       error = excluded.error,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    job.recordingId,
    job.providerId,
    job.modelId,
    job.jobRef,
    job.state,
    job.error,
    job.createdAt,
    job.updatedAt,
  );
}

/** Applies several job upserts under one transaction. */
export function upsertJobs(jobs: TranscriptionJob[]): void {
  if (jobs.length === 0) return;
  getDatabase().withTransactionSync(() => {
    for (const job of jobs) upsertJob(job);
  });
}

/** Drops job rows. **No sidecar is touched**; see {@link forgetTranscripts}. */
export function forgetJobs(recordingIds: string[]): void {
  if (recordingIds.length === 0) return;
  const placeholders = recordingIds.map(() => "?").join(", ");
  getDatabase().runSync(
    `DELETE FROM transcription_jobs WHERE recording_id IN (${placeholders})`,
    ...recordingIds,
  );
}
