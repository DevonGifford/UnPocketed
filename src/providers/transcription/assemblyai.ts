import { File, UploadType } from "expo-file-system";

import {
  millisecondsAreMilliseconds,
  toSegments,
  type RawTurn,
} from "./speakers";
import {
  TranscriptionAborted,
  TranscriptionError,
  type AudioSource,
  type TranscriptionErrorKind,
  type TranscriptionOptions,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";

/*
 * AssemblyAI (§18). The first provider, settled by the decision map's ticket 04.
 *
 * Chosen over Deepgram on one argument above the rest: AssemblyAI stores the
 * job, Deepgram does not. Deepgram's docs state the API response is the only
 * opportunity to retrieve a transcript, and §3.1 rules out the callback that
 * would decouple retrieval — so an upload whose HTTP response is lost to app
 * death loses the transcript permanently and costs a second bill. AssemblyAI's
 * queued/processing/completed/error maps onto §21's four states, and a
 * persisted job id makes `Transcribing` survive the process.
 *
 * It also satisfies §3.1 rather than merely tolerating it: the upload endpoint
 * returns a URL documented as accessible only by AssemblyAI's own servers, so
 * nothing is published to the open internet and Unpocketed hosts nothing.
 *
 * Three API details, each verified against the docs on 2026-10-08 rather than
 * assumed, because each fails at runtime as an opaque 4xx:
 *
 * - the auth header is the bare key, **not** `Bearer`-prefixed;
 * - the pre-recorded endpoint takes `speech_models` (plural, an array) — the
 *   singular `speech_model` it replaced survives only on the streaming API;
 * - the completed transcript reports `speech_model_used`, which is what §20's
 *   "which model generated this?" has to be answered from, since a request
 *   listing several models may fall back to a different one.
 */

const BASE_URL = "https://api.assemblyai.com/v2";

/** Documented ceiling for a direct upload: comfortably past a two-hour recording. */
const MAX_UPLOAD_BYTES = 2_200_000_000;

/** How often to ask whether the job is done. */
const POLL_INTERVAL_MS = 3_000;

/** A single HTTP call's timeout. Not the transcription's — that is a job. */
const REQUEST_TIMEOUT_MS = 30_000;

interface UploadResponse {
  upload_url?: string;
}

interface TranscriptResponse {
  id?: string;
  status?: string;
  text?: string | null;
  error?: string | null;
  speech_model_used?: string | null;
  /** Present only when `speaker_labels` was requested. Offsets are in ms. */
  utterances?: RawTurn[] | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Maps an HTTP status onto something the UI can explain and act on. */
function kindForStatus(status: number): TranscriptionErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  // Valid key, empty wallet. Under bring-your-own-key the balance is the
  // user's, so this needs saying rather than reading as a provider fault.
  if (status === 402) return "insufficient-credit";
  if (status === 413) return "too-large";
  return "provider-failed";
}

/**
 * A JSON request to the API. Network failures become `offline` rather than
 * surfacing a fetch error, because §33 wants them retryable once connectivity
 * returns and the user told to check their connection, not their key.
 */
async function request<T>(
  path: string,
  apiKey: string,
  init: { method: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        authorization: apiKey,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal,
    });
  } catch (error) {
    /*
     * A caller abort is not a network failure. Rethrowing fetch's own
     * `AbortError` would reach the orchestration as an unrecognised error and
     * mark a job that is still running at the provider as failed — which costs
     * the user a second upload and a second bill on retry. The timeout signal
     * is deliberately not treated this way: nothing asked for it, so a request
     * that ran out of time really is a connectivity problem.
     */
    if (init.signal?.aborted) throw new TranscriptionAborted();
    throw new TranscriptionError(
      "offline",
      "Could not reach the transcription provider.",
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new TranscriptionError(
      kindForStatus(response.status),
      `The provider rejected the request (${response.status}).`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new TranscriptionError(
      "unknown",
      "The provider's response could not be read.",
      { cause: error },
    );
  }
}

/**
 * Uploads the audio and returns the URL AssemblyAI will read it from.
 *
 * Uses `expo-file-system`'s native streaming upload rather than reading the
 * file in JavaScript: §34 forbids loading whole recordings into memory, and an
 * hour of audio is tens of megabytes. `BINARY_CONTENT` sends the bytes as the
 * request body, which is exactly what this endpoint wants.
 */
async function uploadAudio(audio: AudioSource, apiKey: string): Promise<string> {
  const file = new File(audio.uri);

  let result;
  try {
    result = await file.upload(`${BASE_URL}/upload`, {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      headers: {
        authorization: apiKey,
        "content-type": "application/octet-stream",
      },
    });
  } catch (error) {
    throw new TranscriptionError(
      "offline",
      "The recording could not be sent to the transcription provider.",
      { cause: error },
    );
  }

  if (result.status < 200 || result.status >= 300) {
    throw new TranscriptionError(
      kindForStatus(result.status),
      `The provider refused the upload (${result.status}).`,
    );
  }

  let parsed: UploadResponse;
  try {
    parsed = JSON.parse(result.body) as UploadResponse;
  } catch (error) {
    throw new TranscriptionError(
      "unknown",
      "The provider's upload response could not be read.",
      { cause: error },
    );
  }

  if (!parsed.upload_url) {
    throw new TranscriptionError(
      "unknown",
      "The provider accepted the recording but did not say where it went.",
    );
  }

  return parsed.upload_url;
}

/*
 * No overall deadline here on purpose. The job lives on the provider's side and
 * is already paid for, so giving up locally would not stop it — the caller's
 * `signal` is the control, and an abandoned poll leaves the job `transcribing`
 * for startup recovery to re-attach to. A local timeout would instead have to
 * choose between a false failure and a re-upload.
 */

/** Polls until the job finishes, then returns its text. */
async function awaitCompletion(
  jobRef: string,
  apiKey: string,
  modelId: string,
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  for (;;) {
    // `throwIfAborted` is absent from React Native's AbortSignal and is not one
    // of the two statics Expo's winter runtime polyfills, so it is checked by
    // hand — calling it would be a TypeError on device.
    if (signal?.aborted) throw new TranscriptionAborted();

    const job = await request<TranscriptResponse>(
      `/transcript/${jobRef}`,
      apiKey,
      { method: "GET", signal },
    );

    if (job.status === "completed") {
      return {
        text: job.text ?? "",
        // What actually ran, not what was asked for (§20).
        modelId: job.speech_model_used ?? modelId,
        // Already milliseconds here; Deepgram's are float seconds.
        segments: toSegments(job.utterances, millisecondsAreMilliseconds),
      };
    }

    if (job.status === "error") {
      // The job's own terminal state, not a transport problem. This reference
      // is spent, so a retry has to submit new work.
      throw new TranscriptionError(
        "job-failed",
        job.error ?? "The provider could not transcribe this recording.",
      );
    }

    // `queued` and `processing` are both §21's single `Transcribing`.
    await delay(POLL_INTERVAL_MS);
  }
}

async function submit(
  audioUrl: string,
  apiKey: string,
  options: TranscriptionOptions,
): Promise<string> {
  const job = await request<TranscriptResponse>("/transcript", apiKey, {
    method: "POST",
    body: {
      audio_url: audioUrl,
      // `speech_models` plural: the singular form this replaced is streaming-only.
      speech_models: [options.modelId],
      /*
       * Sent only when asked for, and never defaulted on. AssemblyAI bills
       * diarization as an add-on — +$0.02/hr against universal-2's $0.15 — so
       * requesting it unasked would raise the user's bill by about 13% for
       * speaker labels a solo voice memo cannot use.
       *
       * Deliberately no `speakers_expected`: AssemblyAI's docs say to set it
       * only when the count is certain, and Unpocketed never is.
       */
      ...(options.diarize ? { speaker_labels: true } : {}),
    },
    /*
     * The caller's `signal` is deliberately **not** passed here.
     *
     * §18 defines it as "stops polling; does not cancel the provider's job",
     * and submitting is not polling — it is the step that *creates* the job.
     * Aborting it leaves the worst possible state: the audio has already been
     * uploaded (the upload ignores the signal and cannot be stopped), and the
     * request that would have turned those bytes into a transcript never goes
     * out. The job is then stranded with no reference, so nothing can re-attach
     * to it and the upload is wasted.
     *
     * Letting submission finish is what makes the reference exist, and the
     * reference is the whole architecture: polling can be abandoned safely
     * precisely because the job survives it.
     */
  });

  if (!job.id) {
    throw new TranscriptionError(
      "unknown",
      "The provider accepted the recording but issued no job reference.",
    );
  }

  return job.id;
}

/** Builds the provider around a key the caller has already read from storage. */
export function createAssemblyAI(apiKey: string): TranscriptionProvider {
  return {
    id: "assemblyai",
    name: "AssemblyAI",
    capabilities: {
      maxUploadBytes: MAX_UPLOAD_BYTES,
      // No documented duration ceiling below the size one, so size decides.
      supportsDiarization: true,
    },
    requiresApiKey: true,
    diarizationNotice:
      "AssemblyAI charges extra to identify speakers — about $0.02 per hour on top of the model's own rate.",

    models: [
      { id: "universal-2", name: "Universal-2" },
      { id: "universal-3-5-pro", name: "Universal-3.5 Pro" },
    ],
    /*
     * Pinned rather than left to the provider's default. Omitting the field
     * sends `["universal-3-5-pro", "universal-2"]`, which routes by language
     * and bills at whichever model ran — and the provider decision costed
     * v0.1 against universal-2. PR8 hands the choice to the user.
     */
    defaultModelId: "universal-2",
    keyUrl: "https://www.assemblyai.com/dashboard/signup",
    retentionNotice:
      "AssemblyAI keeps the audio you send for up to 48 hours and the transcript for 30 days. Their account settings cannot turn that off for this kind of request.",

    async transcribe(audio, options) {
      if (
        this.capabilities.maxUploadBytes &&
        audio.sizeBytes > this.capabilities.maxUploadBytes
      ) {
        throw new TranscriptionError(
          "too-large",
          "This recording is larger than the provider accepts.",
          { retryable: false },
        );
      }

      const audioUrl = await uploadAudio(audio, apiKey);
      const jobRef = await submit(audioUrl, apiKey, options);
      // Before polling, never after: §18 requires the reference the moment it
      // exists, so an app death leaves something to re-attach to.
      options.onJobRef?.(jobRef);

      return awaitCompletion(jobRef, apiKey, options.modelId, options.signal);
    },

    async resume(jobRef, options) {
      return awaitCompletion(jobRef, apiKey, options.modelId, options.signal);
    },
  };
}
