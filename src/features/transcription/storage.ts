import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import type { Transcript, TranscriptionJob } from "@/types";

/*
 * Transcripts and in-flight jobs on disk (§3.1).
 *
 * They get sidecars for the same reason recordings do. `db/database.ts` states
 * outright that SQLite "is a rebuildable index over the recordings directory,
 * not the source of truth", and `repository.ts` leans on that to make dropping
 * and re-deriving the database an acceptable recovery. Storing transcripts only
 * in SQLite would quietly make that false: a rebuild would destroy work the
 * user paid a provider for and that only exists because their audio was sent to
 * a third party. §3.2 says a transcription *can* be regenerated, which is why
 * this is a judgement rather than a rule — but regenerating costs money and
 * another upload, so the cheap option is to not lose them.
 *
 * Jobs are stored the same way for the same reason: the job reference is what
 * makes §21's `Transcribing` survive the app's death, and a reference lost to a
 * database rebuild is a transcription already paid for and no longer reachable.
 *
 * Both live beside the recordings directory rather than inside it, so the audio
 * scan in `features/recording/storage.ts` keeps seeing only audio.
 */

const DIRECTORY_NAME = "transcripts";

/** Distinguishes the two kinds of record sharing the directory. */
const TRANSCRIPT_SUFFIX = ".transcript.json";
const JOB_SUFFIX = ".job.json";

function transcriptsDirectory(): Directory {
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function filesIn(directory: Directory, suffix: string): File[] {
  return directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .filter((file) => file.name.endsWith(suffix));
}

function readJson<T>(file: File): T | null {
  try {
    return JSON.parse(file.textSync()) as T;
  } catch {
    // A half-written or hand-edited sidecar is skipped rather than throwing:
    // one unreadable transcript must not hide every other one.
    return null;
  }
}

/** Use `\D` and `\W`: a character class containing a colon breaks Uniwind's scan. */
export function newTranscriptId(at: Date): string {
  const stamp = at.toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `txn-${stamp}-${suffix}`;
}

/**
 * The id a completed job's Transcript takes, derived from the job reference.
 *
 * This is what makes completion safe to repeat. Two pollers can finish the same
 * job — a screen that re-attached on focus and the launch-time resume, or a
 * crash between writing the transcript and clearing the job — and a random id
 * would turn each into a separate Transcript of the same audio. Deriving it
 * means the second write lands on the same file and upserts the same row.
 *
 * @param jobRef The provider's reference. Non-word characters are stripped
 * because this becomes a filename, and a provider is free to put anything in it.
 */
export function transcriptIdForJob(jobRef: string): string {
  return `txn-job-${jobRef.replace(/\W/g, "").slice(0, 64)}`;
}

/**
 * The id a Transcript derived by editing another one takes.
 *
 * Derived from the parent and the author, which is what makes §22's "editing
 * an edit updates it in place" true without any bookkeeping: saving the same
 * user's edit twice lands on the same file and the same row. An LLM author
 * gets its own id per model, so a machine cleanup never silently overwrites
 * something the user wrote.
 *
 * @param parentId The Transcript being edited.
 * @param author `user`, or an LLM's provider and model.
 */
export function derivedTranscriptId(
  parentId: string,
  author: { kind: "user" } | { kind: "llm"; providerId: string; modelId: string },
): string {
  // The parent's own `txn-` prefix is dropped so ids do not nest it twice.
  const stem = parentId.replace(/^txn-/, "").replace(/\W/g, "").slice(0, 48);

  if (author.kind === "user") return `txn-user-${stem}`;

  const model = `${author.providerId}-${author.modelId}`
    .replace(/\W/g, "")
    .slice(0, 32);
  return `txn-llm-${model}-${stem}`;
}

/**
 * Writes a Transcript to disk. The durable record of a completed transcription,
 * written before any index row so a failure in between leaves the text safe and
 * merely unindexed.
 *
 * @throws If the file cannot be written, so the caller can report that the
 * transcription succeeded but was not kept.
 */
export function writeTranscript(transcript: Transcript): void {
  new File(
    transcriptsDirectory(),
    `${transcript.id}${TRANSCRIPT_SUFFIX}`,
  ).write(JSON.stringify(transcript, null, 2));
}

/** Every Transcript on disk, newest first. Unreadable sidecars are skipped. */
export function listPersistedTranscripts(): Transcript[] {
  /*
   * Web has no file system (see the note in features/recording/storage.ts).
   * Browser mode is a development preview of the interface only, so an empty
   * list is the honest answer; a platform check rather than a try/catch keeps
   * a real read failure on Android loud.
   */
  if (Platform.OS === "web") return [];

  const found = filesIn(transcriptsDirectory(), TRANSCRIPT_SUFFIX)
    .map((file) => readJson<Transcript>(file))
    .filter((t): t is Transcript => t !== null && typeof t.id === "string");

  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Deletes one Transcript's sidecar (§25). Deleting a transcript never touches
 * its Recording — different files, different directories.
 *
 * @throws If the file exists but cannot be deleted. A missing file is not an
 * error, so calling this twice is safe.
 */
export function deleteTranscriptFile(id: string): void {
  const file = new File(transcriptsDirectory(), `${id}${TRANSCRIPT_SUFFIX}`);
  if (file.exists) file.delete();
}

/**
 * Writes a job's sidecar. Called before the provider is contacted and again the
 * moment a job reference arrives, because §18 requires the reference persisted
 * synchronously rather than on completion.
 *
 * @throws If the file cannot be written. The caller must not start work it
 * cannot record, or an app death would strand a paid transcription.
 */
export function writeJob(job: TranscriptionJob): void {
  new File(
    transcriptsDirectory(),
    `${job.recordingId}${JOB_SUFFIX}`,
  ).write(JSON.stringify(job, null, 2));
}

/** Every job on disk: in flight or failed. A completed one has been cleared. */
export function listPersistedJobs(): TranscriptionJob[] {
  return filesIn(transcriptsDirectory(), JOB_SUFFIX)
    .map((file) => readJson<TranscriptionJob>(file))
    .filter(
      (job): job is TranscriptionJob =>
        job !== null && typeof job.recordingId === "string",
    );
}

/**
 * Removes a job's sidecar — on success, because the Transcript now records what
 * happened, or when the user dismisses a failure.
 *
 * @throws If the file exists but cannot be deleted.
 */
export function deleteJobFile(recordingId: string): void {
  const file = new File(transcriptsDirectory(), `${recordingId}${JOB_SUFFIX}`);
  if (file.exists) file.delete();
}
