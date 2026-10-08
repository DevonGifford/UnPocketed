import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";

import type { Recording, Transcript } from "@/types";

import { exportTranscript, type ExportFormat } from "./export";

/*
 * Handing a Transcript or a Recording to the rest of the device (§3.4, §24).
 *
 * "Ownership requires a reliable exit path." Everything here hands the user a
 * real file through Android's own share sheet rather than a string in a
 * message, because §3.4 names formats — TXT, Markdown, JSON, and the original
 * audio — and a format is a file.
 *
 * Nothing in this file writes to or removes stored audio. Sharing a Recording
 * copies it; the original is never moved, which §3.2 makes non-negotiable.
 */

export type ShareOutcome =
  | { status: "shared" }
  /** The sheet was dismissed. Not a failure, and nothing to report. */
  | { status: "dismissed" }
  | { status: "failed"; title: string; detail: string };

const UNAVAILABLE: ShareOutcome = {
  status: "failed",
  title: "This device cannot share files",
  detail:
    "Android's sharing service did not respond. Your recording and transcript are safe on this device.",
};

/**
 * Staging directory for files built to be handed away.
 *
 * The **cache**, deliberately, and it is the one place in this app where that
 * is right: these are copies made for one share, and Android reclaiming them
 * loses nothing. Stored audio and transcripts live in the document directory
 * for exactly the opposite reason.
 */
function stagingFile(name: string): File {
  return new File(Paths.cache, name);
}

async function share(file: File, mimeType: string, title: string): Promise<ShareOutcome> {
  try {
    if (!(await isAvailableAsync())) return UNAVAILABLE;
    await shareAsync(file.uri, { mimeType, dialogTitle: title });
    /*
     * Android resolves this when the sheet closes, whether the user picked
     * something or swiped it away, and does not say which. Reporting "shared"
     * would be a claim we cannot support, so callers treat this as "the user
     * has been dealt with" rather than as confirmation anything was sent.
     */
    return { status: "shared" };
  } catch {
    return {
      status: "failed",
      title: "That could not be shared",
      detail:
        "Android would not open the share sheet. Your recording and transcript are safe on this device.",
    };
  }
}

/**
 * Exports a Transcript in one format and offers it to the share sheet (§24).
 *
 * @returns What happened. `dismissed` is not a failure.
 * @throws Never.
 */
export async function shareTranscript(
  transcript: Transcript,
  recording: Recording | null,
  format: ExportFormat,
): Promise<ShareOutcome> {
  const exported = exportTranscript(transcript, recording, format, new Date());

  let file: File;
  try {
    file = stagingFile(exported.name);
    // Overwrites a previous export of the same transcript rather than
    // accumulating copies of it in the cache.
    if (file.exists) file.delete();
    file.create();
    file.write(exported.content);
  } catch {
    return {
      status: "failed",
      title: "The export could not be written",
      detail:
        "There may not be enough free space on this device. Your transcript is unaffected.",
    };
  }

  return share(file, exported.mimeType, "Export transcript");
}

/**
 * Offers a Recording's original audio to the share sheet (§3.4).
 *
 * Copied into the cache under a readable name rather than shared in place: the
 * stored filename is a timestamp and a random suffix, which is meaningless once
 * the file is in somebody's inbox.
 *
 * Works for an **interrupted** Recording too, and that is the point rather than
 * an oversight — its audio cannot be played here, so handing the raw file to a
 * computer is the only remaining route to it, and §3.4 makes that the user's
 * right.
 *
 * @returns What happened. The original audio is never moved or altered.
 * @throws Never.
 */
export async function shareRecordingAudio(
  recording: Recording,
): Promise<ShareOutcome> {
  const source = new File(recording.audioPath);
  const extension = recording.audioPath.split(".").pop() ?? "m4a";
  const name = `${recording.title.trim().replace(/\W+/g, "-").toLowerCase() || "recording"}.${extension}`;

  let staged: File;
  try {
    if (!source.exists) {
      return {
        status: "failed",
        title: "That recording is no longer here",
        detail: "Its audio file could not be found on this device.",
      };
    }

    staged = stagingFile(name);
    if (staged.exists) staged.delete();
    // A copy, never a move. §3.2: the original is the one thing that cannot be
    // regenerated, and nothing here is allowed to relocate it.
    source.copy(staged);
  } catch {
    return {
      status: "failed",
      title: "The recording could not be prepared for sharing",
      detail:
        "There may not be enough free space on this device. Your recording is unaffected.",
    };
  }

  return share(staged, recording.mimeType, "Share original audio");
}
