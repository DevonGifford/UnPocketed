import { Directory, File, Paths } from "expo-file-system";

import type { Brief } from "@/types";

/*
 * Briefs on disk (§3.1).
 *
 * Sidecars, like transcripts — but for a **weaker** reason, and the difference
 * is worth stating rather than copying the pattern by habit.
 *
 * A transcript gets a sidecar because losing one to a database rebuild would
 * destroy work the user paid a provider for and that only exists because their
 * audio was sent to a third party; regenerating it costs another upload. A
 * Brief regenerates from text already on the device, for an LLM call and no
 * upload — so losing one is genuinely cheaper.
 *
 * It gets a sidecar anyway for two reasons. The index must stay rebuildable
 * from disk, and a Brief that lived only in SQLite would quietly make
 * `reconcile` destructive for one entity and not the others — a rule with an
 * exception is a rule nobody remembers. And "cheap" is not free: it is still
 * the user's money and their wait.
 *
 * Kept beside transcripts rather than inside their directory, so the transcript
 * scan keeps seeing only transcripts.
 */

const DIRECTORY_NAME = "briefs";
const BRIEF_SUFFIX = ".brief.json";

function briefsDirectory(): Directory {
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function readJson<T>(file: File): T | null {
  try {
    return JSON.parse(file.textSync()) as T;
  } catch {
    // A half-written or hand-edited sidecar is skipped rather than throwing:
    // one unreadable Brief must not hide every other one.
    return null;
  }
}

/**
 * The id a Brief takes, derived from its Transcript and the model that wrote it.
 *
 * Derived rather than random, so **re-running the same model over the same
 * transcript replaces its Brief instead of stacking another one up**. Running a
 * *different* model produces a different id, which is what makes §22's
 * comparison possible one layer down — two Briefs of one transcript, each
 * attributed.
 *
 * That makes "regenerate" and "compare" the same gesture with different inputs,
 * which is the behaviour a user would guess at.
 *
 * @param transcriptId The Transcript being described.
 * @param providerId Which LLM provider wrote it.
 * @param modelId Which of that provider's models.
 */
export function briefIdFor(
  transcriptId: string,
  providerId: string,
  modelId: string,
): string {
  // `\W` rather than a bracketed class: a character class containing a colon
  // is read by Tailwind's content scan as arbitrary-property syntax and breaks
  // the whole bundle. See AGENTS.md.
  const stem = transcriptId.replace(/^txn-/, "").replace(/\W/g, "").slice(0, 40);
  const model = `${providerId}-${modelId}`.replace(/\W/g, "").slice(0, 32);
  return `brf-${model}-${stem}`;
}

/**
 * Writes a Brief to disk.
 *
 * @throws If the file cannot be written, so the caller can say the Brief was
 * produced but not kept — which matters, because the user has already paid for
 * the request by the time this runs.
 */
export function writeBrief(brief: Brief): void {
  new File(briefsDirectory(), `${brief.id}${BRIEF_SUFFIX}`).write(
    JSON.stringify(brief, null, 2),
  );
}

/** Every Brief on disk, newest first. Unreadable sidecars are skipped. */
export function listPersistedBriefs(): Brief[] {
  const found = briefsDirectory()
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .filter((file) => file.name.endsWith(BRIEF_SUFFIX))
    .map((file) => readJson<Brief>(file))
    .filter(
      (brief): brief is Brief =>
        brief !== null &&
        typeof brief.id === "string" &&
        typeof brief.transcriptId === "string",
    );

  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Deletes one Brief's sidecar (§25).
 *
 * Never touches the Transcript it describes — different file, different
 * directory. A missing file is not an error, so calling this twice is safe.
 *
 * @throws If the file exists but cannot be deleted.
 */
export function deleteBriefFile(id: string): void {
  const file = new File(briefsDirectory(), `${id}${BRIEF_SUFFIX}`);
  if (file.exists) file.delete();
}
