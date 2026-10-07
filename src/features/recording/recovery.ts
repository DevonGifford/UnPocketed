import { Directory, File, Paths } from "expo-file-system";

import type { Recording } from "@/types";

import { isPlayableMp4 } from "./mp4";
import { listPersistedRecordings, persistRecording } from "./storage";

/*
 * Adopting recordings the app never got to file (§14).
 *
 * `expo-audio` captures into its own directory and `persistRecording` moves the
 * finished file into the library, so anything left behind is a recording the
 * app died holding. Two kinds end up there, and they are not the same:
 *
 * - killed mid-capture: no `moov` box, so unplayable — an Interrupted Recording;
 * - stopped but never filed: the notification's Stop action finalised the file
 *   natively and the process died before JS moved it. Complete and playable.
 *
 * Flagging the second kind as interrupted would tell someone an intact hour was
 * broken, so they are told apart by probing for the index rather than assumed.
 *
 * This cannot mean resume. Android forbids starting a microphone foreground
 * service from the background, so a recording that stopped stays stopped.
 */

/** `expo-audio` captures into this subdirectory of the document directory. */
const CAPTURE_DIRECTORY = "Audio";

/**
 * Used only when the library holds no complete recording to calibrate against —
 * on a first run that crashed. Measured on the project's test device, where the
 * encoder negotiates the requested 128 kbps down to about this.
 */
const FALLBACK_BITS_PER_SECOND = 96_000;

/**
 * Bits per second of stored audio, including container overhead.
 *
 * Calibrated from the newest complete recording on this device rather than
 * taken from the preset: `bitRate` is a request, and how far the encoder
 * negotiates it down varies by device, so a constant would be wrong by a
 * device-specific margin.
 */
export function storedBitrate(
  recordings: Recording[],
  sizeOf: (recording: Recording) => number | null,
): number {
  for (const recording of recordings) {
    if (recording.interrupted || recording.durationMs <= 0) continue;

    const size = sizeOf(recording);
    if (!size || size <= 0) continue;

    return (size * 8) / (recording.durationMs / 1000);
  }

  return FALLBACK_BITS_PER_SECOND;
}

/**
 * Duration implied by a file's size. The only duration available for an
 * interrupted recording, since the measurement lived in the missing index.
 *
 * @returns Milliseconds, or 0 when it cannot be estimated at all.
 */
export function estimateDurationMs(
  sizeBytes: number,
  bitsPerSecond: number,
): number {
  if (sizeBytes <= 0 || bitsPerSecond <= 0) return 0;

  return Math.round(((sizeBytes * 8) / bitsPerSecond) * 1000);
}

/** Bits per second measured from this device's own completed recordings. */
function calibratedBitrate(): number {
  return storedBitrate(
    listPersistedRecordings(),
    (recording) => new File(recording.audioPath).size,
  );
}

/**
 * Moves one orphaned file into the library, deciding whether it is Interrupted
 * by probing for its index rather than assuming.
 *
 * @param file The file to adopt. Must not be one a recorder is still writing.
 * @param bitsPerSecond Override for the estimate, so a batch calibrates once.
 * @returns The adopted Recording, or null when it could not be moved — in which
 * case the file is untouched and the next launch will try again (§3.2).
 */
export async function adoptOrphan(
  file: File,
  bitsPerSecond = calibratedBitrate(),
): Promise<Recording | null> {
  const playable = isPlayableMp4(file);

  try {
    return await persistRecording({
      sourceUri: file.uri,
      // A playable file keeps its real duration, which the player reports and
      // PR4's backfill writes down on first open.
      durationMs: playable ? 0 : estimateDurationMs(file.size, bitsPerSecond),
      // When capture began, not when it was noticed.
      recordedAt: new Date(file.creationTime ?? file.lastModified ?? Date.now()),
      interrupted: !playable,
    });
  } catch {
    return null;
  }
}

/**
 * Moves every recording left in the capture directory into the library.
 *
 * Must run before any recording starts: adopting a file moves it, and moving
 * the file a live recorder is writing to would destroy that recording.
 *
 * @returns The adopted Recordings, for the caller to index. Empty when there
 * was nothing to recover, which is the normal case.
 * @throws Never. A file that cannot be adopted is left exactly where it is —
 * §3.2 does not allow a failed move to cost the audio.
 */
export async function recoverOrphanedRecordings(): Promise<Recording[]> {
  const captureDirectory = new Directory(Paths.document, CAPTURE_DIRECTORY);
  if (!captureDirectory.exists) return [];

  let orphans: File[];
  try {
    orphans = captureDirectory
      .list()
      .filter((entry): entry is File => entry instanceof File);
  } catch {
    return [];
  }

  if (orphans.length === 0) return [];

  // Calibrated once for the batch: it reads and parses a sidecar per indexed
  // recording, which is not worth repeating per orphan.
  const bitrate = calibratedBitrate();
  const recovered: Recording[] = [];

  for (const file of orphans) {
    const adopted = await adoptOrphan(file, bitrate);
    if (adopted) recovered.push(adopted);
  }

  return recovered;
}
