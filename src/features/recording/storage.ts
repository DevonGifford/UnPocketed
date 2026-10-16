import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import type { Recording, RecordingSource } from "@/types";

import { normaliseSidecar, type Sidecar } from "./sidecar";

/*
 * Keep original audio in Paths.document: Android may evict Paths.cache (§3.2).
 *
 * Metadata is a JSON sidecar beside each audio file, and stays that way now
 * SQLite exists: the sidecar is the source of truth and the database is a
 * rebuildable index over it. Audio whose row is missing is still listed here.
 */

const DIRECTORY_NAME = "recordings";

/*
 * Used to label stored audio whose sidecar did not survive. It covers what the
 * recorder writes *and* what Import accepts (§17), because both kinds of file
 * live in this directory and either can lose its sidecar.
 */
const MIME_TYPES: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  "3gp": "audio/3gpp",
  aac: "audio/aac",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  webm: "audio/webm",
  ogg: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
};

/**
 * Containers the recorder itself can write. An extension outside this set
 * identifies an import, but an extension inside it does not establish source:
 * Import accepts these containers too.
 * TODO(PR6 review): Preserve source independently of the sidecar before using
 * this fallback to label a sidecar-less M4A, MP4, 3GP or AAC as recorded.
 */
const RECORDED_EXTENSIONS = ["m4a", "mp4", "3gp", "aac"];

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
 *
 * `source` is inferred from the container rather than assumed: the recorder
 * only ever writes the formats in {@link RECORDED_EXTENSIONS}, so an MP3 here
 * was certainly imported, and claiming Unpocketed recorded it would be a lie
 * about where the user's audio came from.
 */
function recoveredSidecar(file: File): Sidecar {
  const extension = extensionOf(file.name);
  const recordedAt = new Date(
    file.creationTime ?? file.lastModified ?? Date.now(),
  ).toISOString();

  return {
    id: file.name.replace(/\.[^.]+$/, ""),
    title: "Recovered recording",
    source: RECORDED_EXTENSIONS.includes(extension) ? "recorded" : "imported",
    fileName: file.name,
    mimeType: MIME_TYPES[extension] ?? "application/octet-stream",
    durationMs: 0,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    // TODO(v0.0.4 review): A sidecar write can fail after an interrupted file
    // has moved here. Probe the MP4 index before assuming this file is playable.
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
 * Shared by recording and by Import (§17), which is why the metadata the two
 * disagree on is overridable. Import still *moves*, and that is safe rather
 * than destructive: `expo-document-picker` has already copied the user's file
 * into the cache directory, so what moves here is a copy and the original is
 * never touched.
 *
 * Audio moves first so a failed sidecar write leaves recoverable audio (§3.2).
 * @param args.sourceUri Temporary recorder URI, or the picker's cache copy.
 * @param args.durationMs Final duration from the recorder, or a probed one.
 * @param args.recordedAt Timestamp override, mainly for deterministic callers.
 * @param args.interrupted Whether capture ended with the app's termination.
 * @param args.source Where the audio came from. Defaults to `recorded`.
 * @param args.title Overrides the timestamp title, for an imported file's name.
 * @param args.extension Overrides the extension read from `sourceUri`. Import
 * needs this: the picker's cache copy takes its extension from the original
 * display name, which may carry none at all.
 * @param args.mimeType Overrides the type looked up from the extension, so the
 * picker's own content-resolver answer can be preferred.
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
  source?: RecordingSource;
  title?: string;
  extension?: string;
  mimeType?: string;
}): Promise<Recording> {
  const recordedAt = args.recordedAt ?? new Date();
  const timestamp = recordedAt.toISOString();
  const id = newRecordingId(recordedAt);
  const extension = args.extension ?? extensionOf(args.sourceUri);
  const fileName = `${id}.${extension}`;
  const mimeType =
    args.mimeType ?? MIME_TYPES[extension] ?? "application/octet-stream";

  const directory = recordingsDirectory();
  const source = new File(args.sourceUri);
  const destination = new File(directory, fileName);

  await source.move(destination);

  const sidecar: Sidecar = {
    id,
    title: args.title ?? defaultRecordingTitle(recordedAt),
    source: args.source ?? "recorded",
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
  /*
   * Web has no file system: `expo-file-system`'s web build throws from the
   * `Directory` constructor, which took the whole Home screen down. Browser
   * mode exists only as a development preview of the interface (§6 makes web a
   * non-goal), and an empty library is what it should honestly show.
   *
   * A platform check rather than a try/catch: on Android a directory that
   * cannot be read is a real failure about stored audio, and §3.2 means it has
   * to surface rather than be flattened into "no recordings".
   */
  if (Platform.OS === "web") return [];

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
        const sidecar = normaliseSidecar(
          JSON.parse(sidecarFile.textSync()) as Sidecar,
        );
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
      existing = normaliseSidecar(JSON.parse(sidecarFile.textSync()) as Sidecar);
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
