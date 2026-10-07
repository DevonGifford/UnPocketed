import type { Recording } from "@/types";

/**
 * The JSON written beside each audio file, and the source of truth for a
 * Recording's metadata — the database is only an index over it.
 *
 * It stores `fileName` rather than a path because the document directory's
 * location is not stable across installs.
 */
export interface Sidecar {
  id: string;
  title: string;
  source: Recording["source"];
  fileName: string;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
  interrupted: boolean;
}

/**
 * Fills in fields a sidecar written by an older version does not carry.
 *
 * `JSON.parse` cannot enforce the type it is cast to, so a field added later
 * reads as `undefined` behind a non-optional type. For `interrupted` that is
 * not merely untidy: `undefined !== false`, so reconcile would see every
 * legacy recording as changed on every launch and never settle.
 *
 * A sidecar written before the field existed describes a recording that
 * finished, because nothing else could be written then.
 */
export function normaliseSidecar(parsed: Sidecar): Sidecar {
  return { ...parsed, interrupted: parsed.interrupted === true };
}
