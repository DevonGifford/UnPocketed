import { Directory, File, Paths } from "expo-file-system";

import type { Recording } from "@/types";

/*
 * Keep original audio in Paths.document: Android may evict Paths.cache (§3.2).
 * Until SQLite lands, metadata is a JSON sidecar beside each audio file.
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
}

function recordingsDirectory(): Directory {
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
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
 * @returns The Recording with its durable audio path.
 * @throws If the move or sidecar write fails. A move failure may leave audio
 * in temporary storage; a sidecar failure leaves it at the destination.
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
