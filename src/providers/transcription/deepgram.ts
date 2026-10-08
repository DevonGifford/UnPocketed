import { File, UploadType } from "expo-file-system";

import {
  secondsToMilliseconds,
  toSegments,
  type RawTurn,
} from "./speakers";
import {
  TranscriptionError,
  type AudioSource,
  type TranscriptionErrorKind,
  type TranscriptionOptions,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";

/*
 * Deepgram (§18). The second provider, settled by the decision map's ticket 04.
 *
 * Chosen to stress the abstraction rather than to extend it. Two
 * Whisper-compatible endpoints would have proved nothing; Deepgram is different
 * on every axis the adapter abstracts over:
 *
 * - **Synchronous.** One request uploads the audio, transcribes it and returns
 *   the text. There is no job, no reference and nothing to poll, so this
 *   provider implements no `resume` — which is the §18 claim PR8 exists to test.
 * - **`Authorization: Token <key>`**, where AssemblyAI takes the bare key and
 *   neither takes `Bearer`.
 * - **The model is a query parameter**, not a body field.
 * - **The transcript is nested four levels deep**, at
 *   `results.channels[0].alternatives[0].transcript`, where AssemblyAI returns
 *   a flat `text`.
 *
 * Every one of those verified against Deepgram's live docs on 2026-10-08, not
 * recalled. PR7 was caught out by AssemblyAI's `speech_model` becoming
 * `speech_models`, and each of these fails at runtime as an opaque 4xx.
 *
 * The accepted cost, which is why this is second and not first: **Deepgram
 * stores no transcripts.** Its docs say the API response is the only
 * opportunity to retrieve one, and §3.1 rules out the callback that would
 * decouple retrieval. So an app death mid-request loses the transcript outright
 * and may still be billed for it. Nothing here can fix that — it is the
 * property that cost Deepgram first place.
 */

const ENDPOINT = "https://api.deepgram.com/v1/listen";

/** Documented ceiling for a pre-recorded request. */
const MAX_UPLOAD_BYTES = 2_000_000_000;

/**
 * A backstop, deliberately far above the provider's own ceiling.
 *
 * AssemblyAI's 30-second request timeout **cannot** carry over here. There, a
 * request either submits a job or asks after one, and 30 seconds is generous.
 * Here the single request *is* the transcription: it holds the connection for
 * as long as the upload and the transcription together take, which for an
 * hour-long recording is minutes. A 30-second timeout would fail every real
 * recording while passing every test clip.
 *
 * Deepgram caps processing at **10 minutes per file** and answers `504` past
 * that — a server-side limit no client setting can raise. This is set well
 * above it on purpose, so the provider's own `504` is what the user sees and is
 * explained, rather than a local timeout firing first and blaming the network.
 * It exists only so a hung socket cannot wait forever.
 */
const REQUEST_CEILING_MS = 15 * 60 * 1_000;

/** Deepgram's documented processing ceiling, for the `504` explanation. */
const PROCESSING_LIMIT_MINUTES = 10;

interface ListenResponse {
  metadata?: {
    models?: string[];
    model_info?: Record<string, { name?: string; arch?: string } | undefined>;
  };
  results?: {
    channels?: {
      alternatives?: { transcript?: string | null }[];
    }[];
    /**
     * Present only when `utterances=true` was sent, and carrying `speaker` only
     * when `diarize=true` went with it. Sits beside `channels` rather than
     * inside one, and names the text `transcript` where AssemblyAI says `text`.
     * Offsets are **float seconds**, not milliseconds.
     */
    utterances?: {
      speaker?: number | null;
      transcript?: string | null;
      start?: number | null;
      end?: number | null;
    }[] | null;
  };
}

/*
 * The two functions below are exported for one reason: they are the pure half
 * of this adapter and the half most likely to be wrong. Status mapping and a
 * four-level-deep response path cannot be exercised through `transcribe`
 * without mocking a native upload, and this repo mocks nothing — every test in
 * it is a pure-function test. Nothing outside this folder calls them.
 */

/** Maps an HTTP status onto something the UI can explain and act on. */
export function kindForStatus(status: number): TranscriptionErrorKind {
  // 403 is "no access to the requested model" rather than a bad key, but both
  // are fixed in Settings and neither is retryable as-is.
  if (status === 401 || status === 403) return "unauthorized";
  // Valid key, empty wallet. Deepgram documents this as "project does not have
  // enough credits for an ASR request", which under bring-your-own-key is the
  // user's balance and needs saying plainly (§19).
  if (status === 402) return "insufficient-credit";
  if (status === 413) return "too-large";
  // "Unable to read the entire client request": the upload was cut off, so the
  // audio never fully arrived. That is a connectivity failure, and retryable.
  if (status === 422) return "offline";
  return "provider-failed";
}

export function messageForStatus(status: number): string {
  if (status === 504) {
    /*
     * Not a generic gateway error. Deepgram gives up on a file it has not
     * finished within its processing window, and for Unpocketed's recordings
     * the time is spent uploading rather than transcribing — so the honest
     * explanation is about how long the whole exchange took, and the fix is a
     * faster connection or a provider without the ceiling.
     */
    return `The provider gave up after ${PROCESSING_LIMIT_MINUTES} minutes, which is its limit for one recording.`;
  }
  if (status === 429) {
    return "The provider is rate-limiting this account. Waiting and trying again should clear it.";
  }
  return `The provider rejected the request (${status}).`;
}

/**
 * Reads a successful response body into a result.
 *
 * Two things are going on, and both are places AssemblyAI's adapter has nothing
 * equivalent to:
 *
 * **The transcript is nested four levels deep.** `channels[0]` rather than every
 * channel, because Deepgram folds multichannel audio into one channel unless
 * asked otherwise and this adapter does not ask; `alternatives[0]` because that
 * is the only one returned without `alternatives=n`.
 *
 * **The model that ran is not echoed back directly (§20).** Deepgram returns a
 * uuid in `metadata.models` and describes it in `metadata.model_info`, whose
 * `arch` is the field that looks like the id that was requested; `name` is an
 * internal label, which would attribute a transcript to a model the user never
 * chose and could not select again.
 *
 * **`arch` is the best available guess, not a verified contract.** The
 * documented example carries `name: "2-general-nova"` beside `arch: "nova-3"`,
 * which disagree with each other — `2-general-nova` is the nova-**2** label —
 * so the example is unreliable about exactly this field. Nothing can break:
 * `requestedModelId` is the fallback, and a transcript is still attributed. But
 * the device test is asked to read the attribution off the screen and treat
 * anything other than `nova-3` as a finding, because a value outside this
 * provider's `models` list produces a chip the user can never select again.
 *
 * @param requestedModelId Falls back to what was asked for, because a
 * transcript that cannot say which model made it is worse than one that assumes
 * the provider did not substitute.
 * @throws {TranscriptionError} If the body does not parse, or parses without a
 * transcript in it.
 */
export function readListenResponse(
  body: string,
  requestedModelId: string,
): TranscriptionResult {
  let parsed: ListenResponse;
  try {
    parsed = JSON.parse(body) as ListenResponse;
  } catch (error) {
    throw new TranscriptionError(
      "unknown",
      "The provider's response could not be read.",
      { cause: error },
    );
  }

  const transcript =
    parsed.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  if (typeof transcript !== "string") {
    throw new TranscriptionError(
      "unknown",
      "The provider answered without a transcript.",
    );
  }

  const uuid = parsed.metadata?.models?.[0];
  const arch = uuid ? parsed.metadata?.model_info?.[uuid]?.arch : undefined;

  // `transcript` renamed to `text`, and float seconds converted — the two ways
  // Deepgram's utterances differ from AssemblyAI's beyond the speaker label.
  const turns: RawTurn[] | undefined = parsed.results?.utterances?.map(
    (utterance) => ({
      speaker: utterance.speaker,
      text: utterance.transcript,
      start: utterance.start,
      end: utterance.end,
    }),
  );

  return {
    text: transcript,
    modelId: arch ?? requestedModelId,
    segments: toSegments(turns, secondsToMilliseconds),
  };
}

/** Builds the provider around a key the caller has already read from storage. */
export function createDeepgram(apiKey: string): TranscriptionProvider {
  return {
    id: "deepgram",
    name: "Deepgram",
    capabilities: {
      maxUploadBytes: MAX_UPLOAD_BYTES,
      /*
       * No `maxDurationMs`, deliberately. The 10-minute ceiling is on
       * *processing*, not on the audio's length, and whether an hour-long
       * recording clears it depends on the uplink rather than the duration —
       * roughly 45 MB inside the window. Declaring a duration cap would refuse
       * recordings that succeed on a fast connection, and the capability is
       * there to avoid wasting an upload, not to guess at one.
       */
      supportsDiarization: true,
    },
    requiresApiKey: true,
    // Deepgram's pricing lists no separate charge for diarization.
    diarizationNotice: null,

    // Pre-recorded models only. Deepgram's current flagship, `flux-general-en`,
    // is a conversational model for voice agents and belongs to the streaming
    // API, so it is not offered here.
    models: [
      { id: "nova-3", name: "Nova-3" },
      { id: "nova-2", name: "Nova-2" },
    ],
    defaultModelId: "nova-3",
    keyUrl: "https://console.deepgram.com/signup",
    retentionNotice:
      "Deepgram does not store your audio or the transcript — the reply to Unpocketed's request is the only copy, which is why a transcription interrupted here cannot be picked up again.",

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

      return send(audio, apiKey, options);
    },

    /*
     * No `resume`. There is no job reference to resume *from*: the transcript
     * exists only in the reply to the request above. `transcribe.ts` handles
     * the absence rather than assuming every provider has one, which is the
     * asymmetry §18 designed for.
     */
  };
}

/**
 * Uploads the audio and returns the transcript from the same response.
 *
 * Uses `expo-file-system`'s native streaming upload rather than reading the file
 * in JavaScript, because §34 forbids holding a whole recording in memory and an
 * hour of audio is tens of megabytes.
 */
async function send(
  audio: AudioSource,
  apiKey: string,
  options: TranscriptionOptions,
): Promise<TranscriptionResult> {
  const query = new URLSearchParams({
    model: options.modelId,
    // Punctuation and capitalisation, so a Deepgram transcript is comparable
    // with an AssemblyAI one rather than arriving as an unbroken lower-case run.
    smart_format: "true",
    /*
     * Two parameters, both required. `diarize` alone attributes individual
     * *words* and leaves the grouping to us; `utterances` alone groups speech
     * into turns with no speaker on them. Only together do they produce turns
     * that say who spoke, which is what §10's segments are.
     *
     * Sent only when asked for. Deepgram documents no add-on charge for either,
     * unlike AssemblyAI — but a user who turned speaker identification off
     * should not have it requested on their behalf.
     */
    ...(options.diarize ? { diarize: "true", utterances: "true" } : {}),
  });

  /*
   * The caller's `signal` is deliberately **not** passed to this upload.
   *
   * §18 defines the signal as "stops polling; does not cancel the provider's
   * job". A synchronous provider has no polling phase to stop — the request is
   * the whole transcription — so forwarding the signal would quietly convert
   * "the user left the screen" into "throw the transcription away", for work
   * that may already have been billed and that no `resume` can recover.
   * Ignoring it is what honours the documented contract here, not a shortcut.
   *
   * The timeout is the only abort, and it is a backstop against a dead socket
   * rather than a deadline anyone is waiting on.
   */
  let result;
  try {
    result = await new File(audio.uri).upload(`${ENDPOINT}?${query}`, {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      headers: {
        // `Token`, not `Bearer`, and not the bare key AssemblyAI takes.
        authorization: `Token ${apiKey}`,
        "content-type": audio.mimeType,
      },
      signal: AbortSignal.timeout(REQUEST_CEILING_MS),
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
      messageForStatus(result.status),
    );
  }

  return readListenResponse(result.body, options.modelId);
}
