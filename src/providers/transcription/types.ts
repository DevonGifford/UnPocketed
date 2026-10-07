/*
 * The transcription adapter (§18, §3.3).
 *
 * Nothing above this folder may contain provider-specific API logic. The rest
 * of the app asks for a transcript and is handed one; which service produced it
 * is metadata, not control flow.
 *
 * The interface is shaped for an **asynchronous** provider — submit, get a job
 * reference, poll — because that absorbs a synchronous one for free while the
 * reverse would need a breaking change at PR8, after transcripts already exist
 * in SQLite. §18 says so outright, and the provider decision turned on it.
 *
 * Deliberately absent: progress reporting and partial results. Both were
 * premised on chunking, which is out of v0.1 entirely — no chosen provider
 * needs an upload split across requests.
 */

/** What a provider can take, so callers can ask before spending an upload. */
export interface ProviderCapabilities {
  maxUploadBytes?: number;
  maxDurationMs?: number;
  supportsDiarization: boolean;
}

/** The audio to transcribe. A path, never bytes — see `AudioSource` below. */
export interface AudioSource {
  /**
   * A `file://` URI for stored audio.
   *
   * A path rather than a buffer, and that is load-bearing: §34 forbids loading
   * whole audio files into JavaScript memory, and an hour at the recorder's
   * negotiated bitrate is tens of megabytes. Providers upload by handing this
   * path to a native streaming upload.
   */
  uri: string;
  mimeType: string;
  /** Used to check {@link ProviderCapabilities.maxUploadBytes} before uploading. */
  sizeBytes: number;
}

export interface TranscriptionOptions {
  /** The model to request. Providers that expose only one may ignore it. */
  modelId: string;
  /**
   * Called once, as soon as the provider issues a job reference, and before
   * any polling. The caller is expected to persist it **synchronously** —
   * `features/transcription/transcribe.ts` explains what that buys.
   */
  onJobRef?: (jobRef: string) => void;
  /** Stops polling. Does **not** cancel the provider's job, which runs on. */
  signal?: AbortSignal;
}

export interface TranscriptionResult {
  text: string;
  /**
   * The model that actually ran, which is not always the one requested — a
   * provider may fall back. §20 requires a transcript to answer "which provider
   * and model generated this?", so the answer has to come from the provider
   * rather than from what we asked for.
   */
  modelId: string;
}

/**
 * Why a transcription failed, in terms the app can act on rather than HTTP
 * status codes. The provider maps its own errors onto these.
 */
export type TranscriptionErrorKind =
  /** No key, or the provider rejected it. The user must fix it in Settings. */
  | "unauthorized"
  /** Network unreachable or the request timed out. Retryable unchanged (§33). */
  | "offline"
  /** The provider accepted the job and then failed it. Retryable. */
  | "provider-failed"
  /** The audio exceeds what this provider takes. Retrying will not help. */
  | "too-large"
  /** Anything else, including a response that did not parse. */
  | "unknown";

/** A failure carrying enough for the UI to explain itself and decide on retry. */
export class TranscriptionError extends Error {
  readonly kind: TranscriptionErrorKind;
  /** False where retrying the same audio with the same key cannot succeed. */
  readonly retryable: boolean;

  constructor(
    kind: TranscriptionErrorKind,
    message: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "TranscriptionError";
    this.kind = kind;
    this.retryable = options?.retryable ?? kind !== "unauthorized";
  }
}

/**
 * Raised when the caller's `signal` stops polling.
 *
 * Distinct from {@link TranscriptionError} because it is not a failure: the
 * provider's job keeps running and stays re-attachable. Callers must tell the
 * two apart before recording anything, since marking a live job failed is what
 * makes a retry upload and pay for the same audio twice.
 */
export class TranscriptionAborted extends Error {
  constructor() {
    super("Transcription polling was stopped.");
    this.name = "TranscriptionAborted";
  }
}

export interface TranscriptionProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  /** Models this provider offers, most capable first. PR8 lets the user choose. */
  models: { id: string; name: string }[];
  /** The model used when the user has not chosen one. */
  defaultModelId: string;
  /**
   * Where the user gets an API key, shown in Settings so a bring-your-own-key
   * user is not left searching (§19).
   */
  keyUrl: string;
  /**
   * What the provider does with what it is sent, in plain words. §19 requires
   * the disclosure to say that audio may be **retained** and for how long,
   * because "sent" and "kept" are different promises.
   */
  retentionNotice: string;

  /**
   * Transcribes audio, start to finish.
   *
   * @throws {TranscriptionError} With a `kind` the UI can explain.
   */
  transcribe(
    audio: AudioSource,
    options: TranscriptionOptions,
  ): Promise<TranscriptionResult>;

  /**
   * Re-attaches to a job already in flight, after the app was killed holding
   * one. Undefined for a synchronous provider, which has nothing to re-attach
   * to.
   *
   * @throws {TranscriptionError} As {@link transcribe}.
   */
  resume?(
    jobRef: string,
    options: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}
