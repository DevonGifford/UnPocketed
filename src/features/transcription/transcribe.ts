import { File } from "expo-file-system";

import { findRecording } from "@/features/library";
import {
  TranscriptionAborted,
  TranscriptionError,
  type TranscriptionProvider,
} from "@/providers/transcription";
import type {
  Transcript,
  TranscriptionJob,
  TranscriptSegment,
} from "@/types";

import { transcriptionFailure, type TranscriptionFailure } from "./errors";
import { resolveProvider, resolveSelectedProvider } from "./provider";
import { allJobs, completeJob, jobFor, saveJob } from "./repository";
import { newTranscriptId, transcriptIdForJob } from "./storage";

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

/*
 * Which recordings this process is already polling.
 *
 * Three callers can reach the same job: the launch-time resume, a screen
 * re-attaching on focus, and a fresh Transcribe. Without a claim they poll in
 * parallel — the same request several times a second, and several callers
 * racing to complete. Completion is idempotent so the result stays correct, but
 * the duplicated work is real and the provider sees it.
 *
 * Module-level because every path into polling goes through this file, and it
 * is deliberately **not** persisted: it describes this process, and a claim
 * that outlived a crash would lock a job out of ever being resumed.
 */
const polling = new Set<string>();

/** Claims a recording for polling. False when someone else already has it. */
function claimPolling(recordingId: string): boolean {
  if (polling.has(recordingId)) return false;
  polling.add(recordingId);
  return true;
}

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

/**
 * Why a job with no reference cannot be recovered, which depends on the kind of
 * Provider that took it.
 *
 * A Provider with `resume` issues a reference, so its absence means the app
 * died in the narrow window between sending the request and being handed one.
 * A Provider without `resume` never issues one at all, so for that one the
 * absence says nothing about how far the work got — it may have run to
 * completion and been billed, with the reply lost. Two different facts, and
 * telling the user the wrong one is how a promise about charges becomes untrue.
 */
function reasonForMissingJobRef(
  provider: TranscriptionProvider,
): "interrupted-before-upload" | "interrupted-unresumable" {
  return provider.resume ? "interrupted-before-upload" : "interrupted-unresumable";
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
  result: { text: string; modelId: string; segments?: TranscriptSegment[] },
): Transcript {
  const timestamp = nowIso();
  return {
    // Derived from the reference where there is one, so finishing the same job
    // twice updates one Transcript rather than creating two.
    id: job.jobRef ? transcriptIdForJob(job.jobRef) : newTranscriptId(new Date()),
    recordingId: job.recordingId,
    providerId: job.providerId,
    // What actually ran (§20), which a provider may have substituted.
    modelId: result.modelId,
    text: result.text,
    /*
     * Spread so the key is absent rather than explicitly undefined. §10 makes
     * absence mean "not asked for or not available", and a transcript that
     * serialises `"segments": undefined` would lose that distinction on the
     * round trip through JSON.
     */
    ...(result.segments?.length ? { segments: result.segments } : {}),
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
    /*
     * Unreachable for both providers v0.1 ships, and kept deliberately.
     *
     * This function is only called with a job reference in hand, and a
     * provider that issues one implements `resume` — Deepgram issues none, so
     * a stranded Deepgram job is failed by `reasonForMissingJobRef` at the two
     * resume sites instead, which is the path to trace when debugging one.
     * This branch covers a provider that hands back a reference and offers no
     * way to ask after it, which is permitted by the interface and would
     * otherwise wait on a `resume` that does not exist.
     */
    const failure = transcriptionFailure("interrupted-unresumable", true);
    recordFailure(job, failure);
    return { status: "failed", failure };
  }

  try {
    /*
     * No `diarize` here, and that is not an omission. Resuming re-reads a job
     * the provider is already running; what it was asked for was decided when
     * it was submitted, and sending a different answer now could not change it.
     */
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
  const selected = await resolveSelectedProvider();
  if (!selected) {
    return { status: "failed", failure: transcriptionFailure("not-configured", false) };
  }
  const { provider, modelId, diarize } = selected;

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

  if (!claimPolling(recordingId)) return { status: "detached" };

  const audioFile = new File(recording.audioPath);
  const timestamp = nowIso();

  let job: TranscriptionJob;
  try {
    job = saveJob({
      recordingId,
      /*
       * Both recorded on the job, not read back from the current selection.
       * The user may switch Provider while this is in flight — that is the
       * capability PR8 adds — and resuming must ask the Provider that holds
       * the work, not whichever one is selected when the app next starts.
       */
      providerId: provider.id,
      modelId,
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
    return await runTranscription(
      provider,
      job,
      recording,
      audioFile,
      diarize,
      signal,
    );
  } finally {
    polling.delete(recordingId);
  }
}

/** The submit-and-poll half, split out so the claim above has one release. */
async function runTranscription(
  provider: TranscriptionProvider,
  started: TranscriptionJob,
  recording: { audioPath: string; mimeType: string },
  audioFile: File,
  diarize: boolean,
  signal?: AbortSignal,
): Promise<TranscribeOutcome> {
  let job = started;

  try {
    const result = await provider.transcribe(
      {
        uri: recording.audioPath,
        mimeType: recording.mimeType,
        sizeBytes: audioFile.size ?? 0,
      },
      {
        modelId: job.modelId,
        diarize,
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
  /*
   * The job is read **before** the Provider, and the Provider comes from
   * `job.providerId`. Resolving the current selection first and polling with it
   * would hand an AssemblyAI job reference to Deepgram's client and key the
   * moment the user switched — which PR8 is precisely the PR that makes
   * possible. A job belongs to the Provider that took it, for its whole life.
   */
  const job = jobFor(recordingId);
  if (!job || job.state !== "transcribing") return { status: "detached" };

  let provider: TranscriptionProvider | null;
  try {
    provider = await resolveProvider(job.providerId);
  } catch {
    return { status: "detached" };
  }
  /*
   * No key for *that* Provider, or it is no longer registered. Left
   * `transcribing` rather than failed: the job may still be running and paid
   * for, and restoring the key in Settings makes it resumable again. Failing it
   * here would invite a retry that bills for the same audio twice.
   */
  if (!provider) return { status: "detached" };

  // Someone is already watching this one — the launch-time resume, or a screen
  // that claimed it first. Two pollers would duplicate every request.
  if (!claimPolling(recordingId)) return { status: "detached" };

  if (!job.jobRef) {
    const failure = transcriptionFailure(reasonForMissingJobRef(provider), true);
    recordFailure(job, failure);
    polling.delete(recordingId);
    return { status: "failed", failure };
  }

  try {
    return await finish(provider, job, job.jobRef, signal);
  } finally {
    polling.delete(recordingId);
  }
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
  const outstanding = allOutstanding();
  const recovered: Transcript[] = [];

  /*
   * One Provider per id, built once and reused across the sweep.
   *
   * Resolved **per job** rather than once up front, which is the bug a second
   * Provider turns from theory into certainty: a single Provider resolved
   * before the loop would poll every outstanding job with it, so after a switch
   * an AssemblyAI reference would be sent to Deepgram's endpoint with
   * Deepgram's key. The cache is only to avoid re-reading the same key from the
   * keystore once per job.
   */
  const resolved = new Map<string, TranscriptionProvider | null>();
  const providerFor = async (providerId: string) => {
    if (resolved.has(providerId)) return resolved.get(providerId) ?? null;
    let provider: TranscriptionProvider | null = null;
    try {
      provider = await resolveProvider(providerId);
    } catch {
      provider = null;
    }
    resolved.set(providerId, provider);
    return provider;
  };

  for (const job of outstanding) {
    const provider = await providerFor(job.providerId);
    /*
     * Its Provider is unresolvable — no key stored, or no longer registered.
     * Left `transcribing` rather than failed, so restoring the key in Settings
     * recovers a job that may still be running and already paid for.
     */
    if (!provider) continue;

    if (!job.jobRef) {
      recordFailure(job, transcriptionFailure(reasonForMissingJobRef(provider), true));
      continue;
    }

    // Skip one a screen is already polling rather than racing it.
    if (!claimPolling(job.recordingId)) continue;

    let outcome: TranscribeOutcome;
    try {
      outcome = await finish(provider, job, job.jobRef, signal);
    } finally {
      polling.delete(job.recordingId);
    }

    if (outcome.status === "transcribed") recovered.push(outcome.transcript);
    // A detached job stopped because the app is going away, so stop the sweep.
    if (outcome.status === "detached" && !outcome.reason) break;
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
