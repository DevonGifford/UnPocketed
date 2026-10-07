import { Directory, File, Paths } from "expo-file-system";

import type { Recording } from "@/types";

/*
 * Keep original audio in Paths.document: Android may evict Paths.cache (§3.2).
 *
 * Metadata is a JSON sidecar beside each audio file, and stays that way now
 * SQLite exists: the sidecar is the source of truth and the database is a
 * rebuildable index over it. Audio whose row is missing is still listed here.
 */

const DIRECTORY_NAME = "recordings";

const MIME_TYPES: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  "3gp": "audio/3gpp",
  aac: "audio/aac",
  wav: "audio/wav",
};

interface Sidecar {
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

function recordingsDirectory(): Directory {
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/**
 * Rebuilds a playable URI from a stored file name. The index stores names
 * rather than URIs because the document directory's path is not stable across
 * installs, so a stored absolute path goes stale while the file survives.
 */
export function audioPathFor(fileName: string): string {
  return new File(recordingsDirectory(), fileName).uri;
}

/** The inverse of {@link audioPathFor}: the name the index should store. */
export function fileNameOf(audioPath: string): string {
  return audioPath.split("/").pop() ?? audioPath;
}

/**
 * Metadata derived from the audio file alone, for a recording whose sidecar is
 * lost. Prefers the file's own timestamps over the epoch: a recovered recording
 * claiming 1970 sorts to the bottom of the library permanently. Duration cannot
 * be recovered without decoding, so it stays 0 until playback reports one.
 */
function recoveredSidecar(file: File): Sidecar {
  const extension = extensionOf(file.name);
  const recordedAt = new Date(
    file.creationTime ?? file.lastModified ?? Date.now(),
  ).toISOString();

  return {
    id: file.name.replace(/\.[^.]+$/, ""),
    title: "Recovered recording",
    source: "recorded",
    fileName: file.name,
    mimeType: MIME_TYPES[extension] ?? "application/octet-stream",
    durationMs: 0,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    // Nothing about a sidecar-less file says capture was interrupted; a lost
    // sidecar and a lost container index are different failures.
    interrupted: false,
  };
}

/** The stored audio for an id, whatever its extension. Null if none is stored. */
function findAudioFile(directory: Directory, id: string): File | null {
  const match = directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .find(
      (file) =>
        file.name.replace(/\.[^.]+$/, "") === id &&
        file.extension.replace(/^\./, "").toLowerCase() !== "json",
    );
  return match ?? null;
}

function extensionOf(uri: string): string {
  const match = /\.([A-Za-z0-9]+)(?:\?|#|$)/.exec(uri);
  return match ? match[1].toLowerCase() : "m4a";
}

/** Use `\D`: a character class containing a colon breaks Uniwind's scan. */
function newRecordingId(at: Date): string {
  const stamp = at.toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}`;
}

/**
 * Moves finished audio to durable storage, then writes its JSON sidecar.
 *
 * Audio moves first so a failed sidecar write leaves recoverable audio (§3.2).
 * @param args.sourceUri Temporary recorder URI.
 * @param args.durationMs Final duration from the recorder.
 * @param args.recordedAt Timestamp override, mainly for deterministic callers.
 * @param args.interrupted Whether capture ended with the app's termination.
 * @returns The Recording with its durable audio path.
 * @throws If the move or sidecar write fails. A move failure may leave audio
 * in temporary storage; a sidecar failure leaves it at the destination.
 */
export async function persistRecording(args: {
  sourceUri: string;
  durationMs: number;
  recordedAt?: Date;
  /** True when capture ended with the app's termination; see CONTEXT.md. */
  interrupted?: boolean;
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
    interrupted: args.interrupted ?? false,
  };
  new File(directory, `${id}.json`).write(JSON.stringify(sidecar, null, 2));

  return { ...sidecar, audioPath: destination.uri };
}

/**
 * Lists stored audio newest first. Audio without a readable sidecar remains
 * visible as a recovered Recording (§3.2).
 * @returns Recordings with durable audio paths; recovered items use fallback metadata.
 */
export function listPersistedRecordings(): Recording[] {
  const directory = recordingsDirectory();

  const audioFiles = directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .filter((file) => file.extension.replace(/^\./, "").toLowerCase() !== "json");

  const recordings = audioFiles.map((file): Recording => {
    const id = file.name.replace(/\.[^.]+$/, "");
    const sidecarFile = new File(directory, `${id}.json`);

    if (sidecarFile.exists) {
      try {
        const sidecar = JSON.parse(sidecarFile.textSync()) as Sidecar;
        return { ...sidecar, audioPath: file.uri };
      } catch {
        // Fall through to the filename-derived form below.
      }
    }

    return { ...recoveredSidecar(file), audioPath: file.uri };
  });

  return recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Rewrites a recording's sidecar with new metadata.
 *
 * The sidecar is the source of truth, so it is written before any index row is
 * touched: a failure part-way leaves the durable artifact correct and the index
 * stale, which the next reconcile repairs. The reverse would lose the user's
 * title — the one piece of metadata that cannot be re-derived from the file.
 *
 * @param id The recording to update.
 * @param patch Fields to change. `updatedAt` is set here, not by the caller.
 * @returns The updated Recording.
 * @throws If no audio is stored under `id`, or the sidecar cannot be written.
 */
export function updateRecordingMetadata(
  id: string,
  patch: { title?: string; durationMs?: number },
): Recording {
  const directory = recordingsDirectory();
  const audioFile = findAudioFile(directory, id);
  if (!audioFile) throw new Error(`No audio is stored for recording ${id}`);

  const sidecarFile = new File(directory, `${id}.json`);
  let existing: Sidecar | null = null;
  if (sidecarFile.exists) {
    try {
      existing = JSON.parse(sidecarFile.textSync()) as Sidecar;
    } catch {
      // An unreadable sidecar is replaced from the file's own metadata.
    }
  }

  const sidecar: Sidecar = {
    ...(existing ?? recoveredSidecar(audioFile)),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  sidecarFile.write(JSON.stringify(sidecar, null, 2));

  return { ...sidecar, audioPath: audioFile.uri };
}

/**
 * Deletes a recording's audio and its sidecar.
 *
 * The only place stored audio is removed on purpose: §3.2 permits it when, and
 * only when, the user explicitly asked. Audio goes first — if the sidecar write
 * then fails, the orphan is invisible and reconcile drops its row, whereas
 * deleting the sidecar first and failing on the audio would resurrect the
 * recording as "Recovered recording" after the user asked for it gone.
 *
 * @throws If a file exists but cannot be deleted. Missing files are not an
 * error, so calling this twice is safe.
 */
export function deleteRecordingFiles(id: string): void {
  const directory = recordingsDirectory();
  findAudioFile(directory, id)?.delete();

  const sidecarFile = new File(directory, `${id}.json`);
  if (sidecarFile.exists) sidecarFile.delete();
}

/** Stores an absolute title; relative labels such as "Today" belong in the UI. */
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
