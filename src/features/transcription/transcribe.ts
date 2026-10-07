import { File } from "expo-file-system";

import { findRecording } from "@/features/library";
import {
  resolveProvider,
  TranscriptionAborted,
  TranscriptionError,
  type TranscriptionProvider,
} from "@/providers/transcription";
import type { Transcript, TranscriptionJob } from "@/types";

import { transcriptionFailure, type TranscriptionFailure } from "./errors";
import { allJobs, completeJob, jobFor, saveJob } from "./repository";
import { newTranscriptId } from "./storage";

/*
 * Running a transcription (§21).
 *
 * The shape that matters: the job reference is written to disk **before**
 * polling starts, not when the transcription completes. A promise alone would
 * mean an app killed mid-transcription loses the only handle on work that is
 * still running on the provider's servers and has already been paid for. §18
 * requires it, and the provider decision was taken on it — Deepgram lost
 * precisely because it keeps no job to re-attach to.
 *
 * Polling can be stopped; the native upload cannot. No path here changes the
 * original recording (§21).
 */

export type TranscribeOutcome =
  | { status: "transcribed"; transcript: Transcript }
  /**
   * Polling stopped; the job is still live on the provider and still
   * re-attachable. Not a failure. `reason` is set when something went wrong
   * enough to tell the user about, and absent when the caller simply left.
   */
  | { status: "detached"; reason?: TranscriptionFailure }
  | { status: "failed"; failure: TranscriptionFailure };

function nowIso(): string {
  return new Date().toISOString();
}

function toFailure(error: unknown): TranscriptionFailure {
  if (error instanceof TranscriptionError) {
    return transcriptionFailure(error.kind, error.retryable);
  }
  return transcriptionFailure("unknown", true);
}

/**
 * What to do with an error once the provider has issued a job reference.
 *
 * The rule this file turns on: after a reference exists, **only the job's own
 * failure is terminal**. Everything else — a dropped connection, a 500 on the
 * polling request, a key revoked mid-job — means "we could not ask", and the
 * transcription is very likely still running and already paid for. Recording
 * those as failed is what makes the next "Try again" upload the same audio and
 * bill for it a second time, which is the specific outcome this provider was
 * chosen to avoid.
 *
 * Leaving the job `transcribing` costs nothing: focus and launch both
 * re-attach, and a key fixed in Settings makes an unauthorized poll succeed.
 */
function outcomeAfterSubmit(
  job: TranscriptionJob,
  error: unknown,
): TranscribeOutcome {
  if (error instanceof TranscriptionAborted) return { status: "detached" };

  if (error instanceof TranscriptionError && error.kind === "job-failed") {
    const failure = toFailure(error);
    recordFailure(job, failure);
    return { status: "failed", failure };
  }

  return { status: "detached", reason: transcriptionFailure("poll-interrupted") };
}

/** Records a failure on the job so the recording reads `failed` (§21). */
function recordFailure(
  job: TranscriptionJob,
  failure: TranscriptionFailure,
): void {
  try {
    saveJob({
      ...job,
      state: "failed",
      error: failure.detail,
      updatedAt: nowIso(),
    });
  } catch {
    // The failure cannot be recorded, so the job stays `transcribing` and the
    // next launch re-attaches. That is the safe direction: it may recover.
  }
}

/** Turns a provider result into the Transcript that gets stored. */
function transcriptFrom(
  job: TranscriptionJob,
  result: { text: string; modelId: string },
): Transcript {
  const timestamp = nowIso();
  return {
    id: newTranscriptId(new Date()),
    recordingId: job.recordingId,
    providerId: job.providerId,
    // What actually ran (§20), which a provider may have substituted.
    modelId: result.modelId,
    text: result.text,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Polls an already-submitted job to completion and files the result. */
async function finish(
  provider: TranscriptionProvider,
  job: TranscriptionJob,
  jobRef: string,
  signal?: AbortSignal,
): Promise<TranscribeOutcome> {
  if (!provider.resume) {
    // A synchronous provider has nothing to re-attach to, so an interrupted
    // transcription is simply gone. Say so rather than waiting on nothing.
    const failure = transcriptionFailure("unknown", true);
    recordFailure(job, failure);
    return { status: "failed", failure };
  }

  try {
    const result = await provider.resume(jobRef, {
      modelId: job.modelId,
      signal,
    });
    return { status: "transcribed", transcript: completeJob(transcriptFrom(job, result)) };
  } catch (error) {
    return outcomeAfterSubmit(job, error);
  }
}

/**
 * Transcribes a Recording, from upload to stored Transcript (§21).
 *
 * Replaces any existing job for the recording, so a retry after a failure
 * starts cleanly. Existing Transcripts are untouched — §22 makes
 * retranscription additive.
 *
 * @param signal Stops polling. The provider's job keeps running and stays
 * re-attachable, so this is not a cancellation.
 * @returns What happened. `detached` is not a failure.
 * @throws Never.
 */
export async function transcribeRecording(
  recordingId: string,
  signal?: AbortSignal,
): Promise<TranscribeOutcome> {
  const provider = await resolveProvider();
  if (!provider) {
    return { status: "failed", failure: transcriptionFailure("not-configured", false) };
  }

  const recording = findRecording(recordingId);
  if (!recording) {
    return { status: "failed", failure: transcriptionFailure("recording-missing", false) };
  }

  if (recording.interrupted) {
    /*
     * An Interrupted Recording's container has no index. The bytes are real
     * audio and are preserved, but no decoder will open the file, so uploading
     * it would spend the user's money to have a provider reject it.
     */
    return { status: "failed", failure: transcriptionFailure("interrupted", false) };
  }

  /*
   * Refuse a second transcription of the same recording. The UI already
   * disables the control while one is running, but this catches state drift:
   * saving a new job overwrites the old one's reference, orphaning work the
   * user has already paid for and that nothing could then re-attach to.
   */
  if (hasOutstandingJob(recordingId)) {
    return { status: "detached" };
  }

  const audioFile = new File(recording.audioPath);
  const timestamp = nowIso();

  let job: TranscriptionJob;
  try {
    job = saveJob({
      recordingId,
      providerId: provider.id,
      modelId: provider.defaultModelId,
      jobRef: null,
      state: "transcribing",
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  } catch {
    // Nothing has been uploaded yet, so refusing to start costs nothing and
    // avoids a transcription whose reference could never be recorded.
    return { status: "failed", failure: transcriptionFailure("not-recorded", true) };
  }

  try {
    const result = await provider.transcribe(
      {
        uri: recording.audioPath,
        mimeType: recording.mimeType,
        sizeBytes: audioFile.size ?? 0,
      },
      {
        modelId: job.modelId,
        signal,
        onJobRef: (jobRef) => {
          /*
           * Synchronously, the moment the provider issues it. This is the
           * whole reason the interface has this callback rather than returning
           * the reference at the end.
           */
          try {
            job = saveJob({ ...job, jobRef, updatedAt: nowIso() });
          } catch {
            // Already-running work whose reference we cannot store. Polling
            // continues, so this run can still succeed; only a process death
            // during it would strand the job.
          }
        },
      },
    );

    return { status: "transcribed", transcript: completeJob(transcriptFrom(job, result)) };
  } catch (error) {
    // Which half failed decides everything. Before a reference exists nothing
    // is running and nothing was charged, so recording a failure is right and
    // retrying is free. After one exists, see `outcomeAfterSubmit`.
    if (job.jobRef) return outcomeAfterSubmit(job, error);

    if (error instanceof TranscriptionAborted) return { status: "detached" };

    const failure = toFailure(error);
    recordFailure(job, failure);
    return { status: "failed", failure };
  }
}

/**
 * Re-attaches to one Recording's in-flight job and polls it to completion.
 *
 * Needed because leaving the screen aborts polling by design: without this, a
 * recording would sit on `Transcribing…` with a disabled control for the rest
 * of the session, since startup recovery runs once per launch. For an hour-long
 * recording, leaving the screen mid-transcription is the ordinary case rather
 * than an edge one.
 *
 * @returns What happened. `detached` means there was nothing to re-attach to,
 * or polling was stopped again.
 * @throws Never.
 */
export async function resumeJobFor(
  recordingId: string,
  signal?: AbortSignal,
): Promise<TranscribeOutcome> {
  // TODO(PR8): Read the job first and use job.providerId to choose the provider.
  // Otherwise a job started with another provider cannot be resumed after a
  // provider switch.
  let provider: TranscriptionProvider | null;
  try {
    provider = await resolveProvider();
  } catch {
    return { status: "detached" };
  }
  if (!provider) return { status: "detached" };

  const job = jobFor(recordingId);
  if (!job || job.state !== "transcribing") return { status: "detached" };

  if (!job.jobRef) {
    // Nothing was ever submitted, so nothing is running and nothing was
    // charged. Fail it so the user can retry knowingly.
    const failure = transcriptionFailure("interrupted-before-upload", true);
    recordFailure(job, failure);
    return { status: "failed", failure };
  }

  return finish(provider, job, job.jobRef, signal);
}

/**
 * Re-attaches to every job left in flight by a previous run (§18).
 *
 * Run once at startup. A job with a reference is polled to completion; one
 * without never reached the provider, so there is nothing running and nothing
 * paid for, and it is cleared rather than left spinning forever.
 *
 * @returns The Transcripts recovered, for the caller to surface.
 * @throws Never.
 */
export async function resumeOutstandingJobs(
  signal?: AbortSignal,
): Promise<Transcript[]> {
  let provider: TranscriptionProvider | null;
  try {
    provider = await resolveProvider();
  } catch {
    return [];
  }
  if (!provider) return [];

  const outstanding = allOutstanding();
  const recovered: Transcript[] = [];

  for (const job of outstanding) {
    if (!job.jobRef) {
      // TODO(PR7 review): We may have sent the request and lost its reply.
      // Without a reference we cannot resume it, but we cannot promise that
      // the provider received nothing or charged nothing either.
      recordFailure(job, transcriptionFailure("interrupted-before-upload", true));
      continue;
    }

    const outcome = await finish(provider, job, job.jobRef, signal);
    if (outcome.status === "transcribed") recovered.push(outcome.transcript);
    if (outcome.status === "detached") break;
  }

  return recovered;
}

/** Jobs still marked in flight. A failed job waits for the user, not for us. */
function allOutstanding(): TranscriptionJob[] {
  try {
    return allJobs().filter((job) => job.state === "transcribing");
  } catch {
    return [];
  }
}

/** Whether a Recording currently has work outstanding, for guarding a re-tap. */
export function hasOutstandingJob(recordingId: string): boolean {
  return jobFor(recordingId)?.state === "transcribing";
}
