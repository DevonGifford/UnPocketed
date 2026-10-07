import type { Transcript, TranscriptionJob, TranscriptionState } from "@/types";

/*
 * §21's four states, derived rather than stored.
 *
 * A fifth copy of the truth is a fifth thing to get out of step. The state is a
 * function of two facts the app already keeps — whether a job is outstanding,
 * and whether any transcript exists — so it is computed where it is needed.
 *
 * Kept free of native imports so the rules can be tested as plain data.
 */

/**
 * The transcription state of one Recording.
 *
 * A job outranks existing transcripts: a recording being retranscribed (§22)
 * reads as `transcribing` while keeping the transcripts it already has, because
 * the question the state answers is "is something happening", not "is there
 * anything to read".
 *
 * @param job The Recording's outstanding job, or null when it has none.
 * @param transcriptCount How many Transcripts it already owns.
 */
export function transcriptionStateOf(
  job: TranscriptionJob | null,
  transcriptCount: number,
): TranscriptionState {
  if (job?.state === "transcribing") return "transcribing";
  if (job?.state === "failed") return "failed";
  return transcriptCount > 0 ? "transcribed" : "not-transcribed";
}

/** Groups transcripts by the Recording they interpret, newest first within each. */
export function groupTranscriptsByRecording(
  transcripts: Transcript[],
): Map<string, Transcript[]> {
  const grouped = new Map<string, Transcript[]>();

  for (const transcript of transcripts) {
    const existing = grouped.get(transcript.recordingId);
    if (existing) existing.push(transcript);
    else grouped.set(transcript.recordingId, [transcript]);
  }

  return grouped;
}
