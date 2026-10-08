import type { Brief } from "@/types";

import { getDatabase } from "./database";

/*
 * Queries over the Brief index. Rows map to domain types in one place, which is
 * the only spot a column rename can reach.
 *
 * Every text field is nullable, and a null column reads back as an **absent**
 * key rather than an empty string. §3.7 turns on that distinction: a Brief with
 * no conclusion must render nothing, not a heading over an empty paragraph.
 */

interface BriefRow {
  id: string;
  transcript_id: string;
  provider_id: string;
  model_id: string;
  title: string | null;
  headline: string | null;
  summary: string | null;
  overview: string | null;
  conclusion: string | null;
  /** A JSON object of speaker index to name, or null. */
  speaker_names: string | null;
  created_at: string;
  updated_at: string;
}

const BRIEF_COLUMNS =
  "id, transcript_id, provider_id, model_id, title, headline, summary, overview, conclusion, speaker_names, created_at, updated_at";

/** Null and empty both mean "the model produced none" (§3.7). */
function optional(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Unparseable JSON yields undefined rather than losing the whole Brief. */
function speakerNamesFrom(stored: string | null): Record<number, string> | undefined {
  if (!stored) return undefined;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return undefined;

    const names: Record<number, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const index = Number(key);
      if (Number.isInteger(index) && typeof value === "string" && value) {
        names[index] = value;
      }
    }
    return Object.keys(names).length > 0 ? names : undefined;
  } catch {
    return undefined;
  }
}

function toBrief(row: BriefRow): Brief {
  const speakerNames = speakerNamesFrom(row.speaker_names);
  // Spread rather than assign, so an absent field is absent from the object
  // too — a row and a sidecar must deserialise to the same shape.
  return {
    id: row.id,
    transcriptId: row.transcript_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    ...(optional(row.title) ? { title: optional(row.title) } : {}),
    ...(optional(row.headline) ? { headline: optional(row.headline) } : {}),
    ...(optional(row.summary) ? { summary: optional(row.summary) } : {}),
    ...(optional(row.overview) ? { overview: optional(row.overview) } : {}),
    ...(optional(row.conclusion) ? { conclusion: optional(row.conclusion) } : {}),
    ...(speakerNames ? { speakerNames } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every indexed Brief, newest first. */
export function listBriefs(): Brief[] {
  return getDatabase()
    .getAllSync<BriefRow>(
      `SELECT ${BRIEF_COLUMNS} FROM briefs ORDER BY created_at DESC`,
    )
    .map(toBrief);
}

/** One Transcript's Briefs, newest first (§10). */
export function listBriefsFor(transcriptId: string): Brief[] {
  return getDatabase()
    .getAllSync<BriefRow>(
      `SELECT ${BRIEF_COLUMNS} FROM briefs WHERE transcript_id = ? ORDER BY created_at DESC`,
      transcriptId,
    )
    .map(toBrief);
}

/** Inserts or replaces one Brief. */
export function upsertBrief(brief: Brief): void {
  getDatabase().runSync(
    `INSERT INTO briefs (${BRIEF_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       transcript_id = excluded.transcript_id,
       provider_id = excluded.provider_id,
       model_id = excluded.model_id,
       title = excluded.title,
       headline = excluded.headline,
       summary = excluded.summary,
       overview = excluded.overview,
       conclusion = excluded.conclusion,
       speaker_names = excluded.speaker_names,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
    brief.id,
    brief.transcriptId,
    brief.providerId,
    brief.modelId,
    brief.title ?? null,
    brief.headline ?? null,
    brief.summary ?? null,
    brief.overview ?? null,
    brief.conclusion ?? null,
    brief.speakerNames ? JSON.stringify(brief.speakerNames) : null,
    brief.createdAt,
    brief.updatedAt,
  );
}

/** Applies several upserts under one transaction. */
export function upsertBriefs(briefs: Brief[]): void {
  if (briefs.length === 0) return;
  getDatabase().withTransactionSync(() => {
    for (const brief of briefs) upsertBrief(brief);
  });
}

/**
 * Drops Brief rows. **No sidecar is touched** — this is for rows whose file is
 * already gone. Deleting a Brief the user asked to delete goes through the
 * enrichment repository, which removes the file too.
 */
export function forgetBriefs(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  getDatabase().runSync(`DELETE FROM briefs WHERE id IN (${placeholders})`, ...ids);
}
