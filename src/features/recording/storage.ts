import { Directory, File, Paths } from "expo-file-system";

import type { Recording } from "@/types";

/**
 * Durable storage for finished recordings (§11: "persist it into durable
 * application storage").
 *
 * `Paths.document` is used rather than `Paths.cache` deliberately — §3.2 makes
 * the original audio sacred, and the cache directory is explicitly a place the
 * system may delete when storage runs low.
 *
 * PR3 has no database; SQLite arrives at PR4. Until then each recording's
 * metadata sits in a JSON sidecar beside its audio, which PR4's migration can
 * read and then discard. This is deliberately not a schema — if it starts
 * growing relations, it belongs in PR4 instead.
 */

const DIRECTORY_NAME = "recordings";

/** `.m4a` from `RecordingPresets.HIGH_QUALITY`; the map covers what Android may emit. */
const MIME_TYPES: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  "3gp": "audio/3gpp",
  aac: "audio/aac",
  wav: "audio/wav",
};

/** Metadata persisted alongside the audio. Mirrors `Recording` minus derived fields. */
interface Sidecar {
  id: string;
  title: string;
  source: Recording["source"];
  fileName: string;
  mimeType: string;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

/** The directory holding every finished recording, created on first use. */
function recordingsDirectory(): Directory {
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function extensionOf(uri: string): string {
  const match = /\.([A-Za-z0-9]+)(?:\?|#|$)/.exec(uri);
  return match ? match[1].toLowerCase() : "m4a";
}

/**
 * Sortable, filename-safe, and unique without pulling in a uuid dependency.
 *
 * `\D` is used rather than a character class listing the separators, and that
 * is not a style preference. Tailwind scans every file under its content glob
 * as plain text, and a square-bracketed expression containing a colon reads as
 * its arbitrary-property syntax. Spelling the ISO separators out that way
 * compiled to a real CSS rule with an empty property name, which is invalid
 * and failed the entire bundle rather than just this module.
 */
function newRecordingId(at: Date): string {
  // "2026-10-04T20:41:33.123Z" -> "20261004204133" (YYYYMMDDHHMMSS).
  const stamp = at.toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}`;
}

/**
 * Moves a just-finished recording out of the recorder's temporary location and
 * into durable storage, writing its sidecar.
 *
 * The audio is moved before the sidecar is written: if the sidecar write fails
 * the audio still exists and is recoverable, whereas the reverse would leave
 * metadata describing a file that is not there.
 *
 * Throws if the move fails. The caller must treat that as "audio may still be
 * in temporary storage" and say so (§32) rather than reporting a clean failure.
 */
export async function persistRecording(args: {
  sourceUri: string;
  durationMs: number;
  recordedAt?: Date;
}): Promise<Recording> {
  const recordedAt = args.recordedAt ?? new Date();
  const timestamp = recordedAt.toISOString();
  const id = newRecordingId(recordedAt);
  const extension = extensionOf(args.sourceUri);
  const fileName = `${id}.${extension}`;
  const mimeType = MIME_TYPES[extension] ?? "application/octet-stream";

  const directory = recordingsDirectory();
  const source = new File(args.sourceUri);
  const destination = new File(directory, fileName);

  await source.move(destination);

  const sidecar: Sidecar = {
    id,
    title: defaultRecordingTitle(recordedAt),
    source: "recorded",
    fileName,
    mimeType,
    durationMs: args.durationMs,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  new File(directory, `${id}.json`).write(JSON.stringify(sidecar, null, 2));

  return { ...sidecar, audioPath: destination.uri };
}

/**
 * Every persisted recording, newest first.
 *
 * Audio without a readable sidecar is still returned, with whatever can be
 * recovered from the filename — §3.2 means a lost sidecar must never hide a
 * recording that exists on disk.
 */
export function listPersistedRecordings(): Recording[] {
  const directory = recordingsDirectory();

  const audioFiles = directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .filter((file) => file.extension.replace(/^\./, "").toLowerCase() !== "json");

  const recordings = audioFiles.map((file): Recording => {
    const id = file.name.replace(/\.[^.]+$/, "");
    const extension = extensionOf(file.name);
    const sidecarFile = new File(directory, `${id}.json`);

    if (sidecarFile.exists) {
      try {
        const sidecar = JSON.parse(sidecarFile.textSync()) as Sidecar;
        return { ...sidecar, audioPath: file.uri };
      } catch {
        // Fall through to the filename-derived form below.
      }
    }

    return {
      id,
      title: "Recovered recording",
      source: "recorded",
      audioPath: file.uri,
      mimeType: MIME_TYPES[extension] ?? "application/octet-stream",
      durationMs: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
  });

  return recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The default title for a new recording (§11: "a useful default title can be
 * derived from date/time", renameable afterwards).
 *
 * Deliberately absolute rather than relative — "Today, 14:32" is a display
 * format (§15) and would be wrong the next day if stored.
 */
export function defaultRecordingTitle(at: Date): string {
  const date = at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = at.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date}, ${time}`;
}
