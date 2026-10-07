import { audioPathFor, fileNameOf } from "@/features/recording/storage";
import type { Recording, RecordingSource } from "@/types";

import { getDatabase } from "./database";

/*
 * Queries over the recordings index. Rows are mapped to the domain type in one
 * place, which is the only spot a column rename can reach.
 */

interface RecordingRow {
  id: string;
  title: string;
  source: string;
  audio_file_name: string;
  mime_type: string;
  duration_ms: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, title, source, audio_file_name, mime_type, duration_ms, created_at, updated_at";

function toRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    title: row.title,
    // An unrecognised value means a row written by a newer schema; treat it as
    // recorded rather than dropping a recording out of the library.
    source: (row.source === "imported" ? "imported" : "recorded") as RecordingSource,
    audioPath: audioPathFor(row.audio_file_name),
    mimeType: row.mime_type,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every indexed Recording, newest first (§15 chronological display). */
export function listRecordings(): Recording[] {
  return getDatabase()
    .getAllSync<RecordingRow>(
      `SELECT ${COLUMNS} FROM recordings ORDER BY created_at DESC`,
    )
    .map(toRecording);
}

/** @returns The Recording, or null when nothing is indexed under that id. */
export function getRecording(id: string): Recording | null {
  const row = getDatabase().getFirstSync<RecordingRow>(
    `SELECT ${COLUMNS} FROM recordings WHERE id = ?`,
    id,
  );
  return row ? toRecording(row) : null;
}

/** Inserts or replaces a row to match the recording on disk. */
export function upsertRecording(recording: Recording): void {
  getDatabase().runSync(
    `INSERT INTO recordings (${COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       source = excluded.source,
       audio_file_name = excluded.audio_file_name,
       mime_type = excluded.mime_type,
       duration_ms = excluded.duration_ms,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    recording.id,
    recording.title,
    recording.source,
    fileNameOf(recording.audioPath),
    recording.mimeType,
    recording.durationMs,
    recording.createdAt,
    recording.updatedAt,
  );
}

/** Applies several upserts under one transaction. */
export function upsertRecordings(recordings: Recording[]): void {
  if (recordings.length === 0) return;
  getDatabase().withTransactionSync(() => {
    for (const recording of recordings) upsertRecording(recording);
  });
}

/**
 * Drops rows from the index. **No audio is touched** — this is for rows whose
 * file is already gone. Deleting a recording the user asked to delete goes
 * through the library repository, which removes the files too.
 */
export function forgetRecordings(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  getDatabase().runSync(
    `DELETE FROM recordings WHERE id IN (${placeholders})`,
    ...ids,
  );
}
