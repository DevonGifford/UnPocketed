/*
 * The enrichment adapter (§3.3, §38's PR 9.5).
 *
 * Deliberately a **separate** interface from `providers/transcription`, not a
 * generalisation of it. The two answer different questions: one turns audio
 * into words, the other reads words and writes about them. Merging them would
 * put a speech recogniser and a summarising model in the same picker, which is
 * the exact blur the two-stage decision exists to prevent.
 *
 * What they share is the *shape* of the problem — a registry keyed by id, keys
 * in the device keystore, a model choice per provider — so the patterns repeat
 * while the types do not.
 *
 * Simpler than the transcription interface in one way that matters: this is
 * always a single synchronous request. There is no job, no reference, no
 * resume. A Brief is regenerable from text already on the device, so losing one
 * to an interrupted request costs a retry rather than a re-upload.
 */

/**
 * The transcript, prepared for a model.
 *
 * A prepared input rather than the `Transcript` itself, mirroring `AudioSource`
 * in the transcription adapter — and for the same reason it was a path rather
 * than bytes there. Rendering speaker turns into readable text is domain work
 * that lives in `features/`, and handing providers a `Transcript` would make
 * this folder import from the feature that consumes it. PR8 fixed exactly that
 * dependency pointing the wrong way; this avoids reintroducing it.
 */
export interface EnrichmentInput {
  /** The transcript as the model should read it, speaker-attributed if known. */
  text: string;
  /**
   * Which speaker indices appear, so a provider asks for names only when there
   * is more than one voice to put a name to. Empty for a transcript with no
   * diarization.
   */
  speakers: number[];
  /** A rough token count, for the context-window guard below. */
  estimatedTokens: number;
}

/** What a provider can take, so a caller can ask before spending a request. */
export interface EnrichmentCapabilities {
  /**
   * The provider's context window, in tokens.
   *
   * Used to refuse a transcript that cannot fit rather than sending it and
   * paying to be told so. An hour of speech is roughly 13,000 tokens, so this
   * is unlikely to bite — which is why it is a guard, not a feature.
   */
  maxInputTokens: number;
}

/**
 * The structured reading of a Transcript an LLM produces (§10).
 *
 * **Every field is optional, and that is load-bearing.** A model that returns
 * no conclusion leaves `conclusion` absent, and the interface shows nothing
 * rather than a heading over filler — §3.7 forbids the appearance of substance
 * where there is none.
 */
export interface BriefContent {
  title?: string;
  headline?: string;
  summary?: string;
  overview?: string;
  conclusion?: string;
  /**
   * Names the model inferred for each speaker index, where it could.
   *
   * Keyed by the speaker index the **recogniser** assigned. An LLM may put a
   * name to a voice the recogniser separated; it must never decide *who spoke
   * which words*, because inferring that from flat text means inventing
   * boundaries. The turns are the recogniser's and stay that way.
   */
  speakerNames?: Record<number, string>;
}

export interface EnrichmentOptions {
  /** The model to request. */
  modelId: string;
  /** Abandons the request. Nothing is left running: there is no job. */
  signal?: AbortSignal;
}

export interface EnrichmentResult {
  content: BriefContent;
  /** The model that actually ran, which a provider may have substituted (§20). */
  modelId: string;
}

/**
 * Why an enrichment failed, in terms the app can act on.
 *
 * Mirrors `TranscriptionErrorKind` without reusing it. The overlap is real but
 * incomplete — `too-large` here means a transcript past the context window,
 * not an upload past a size cap — and sharing the type would couple two
 * vocabularies that are free to diverge.
 */
export type EnrichmentErrorKind =
  /** No key, or the provider rejected it. Fixed in Settings. */
  | "unauthorized"
  /** Network unreachable or the request timed out. Retryable unchanged (§33). */
  | "offline"
  /** The provider answered with an error status. */
  | "provider-failed"
  /** The user's account with the provider has no credit left. */
  | "insufficient-credit"
  /** Rate limited. Retryable after a wait, which is worth saying. */
  | "rate-limited"
  /**
   * The provider is up but the model is busy — a `503`, not a fault.
   *
   * Distinct from `rate-limited` (the user's own quota) and from
   * `provider-failed` (something was wrong with the request). The advice
   * differs: wait and repeat the identical request, or pick a less contended
   * model. Free tiers hit this on flagship models, which is where everyone is.
   */
  | "unavailable"
  /**
   * The chosen model does not exist for this account.
   *
   * Observed on 2026-10-08: Gemini answers `404` for a model that is still
   * published and still billed, but "no longer available to new users". A
   * model list taken from a pricing page will contain these; only the account
   * can say which it may actually use. The fix is always to choose another.
   */
  | "model-unavailable"
  /** The transcript exceeds the model's context window. Retrying will not help. */
  | "too-large"
  /** The provider answered, but not with a Brief this app can read. */
  | "unreadable"
  /** Anything else. */
  | "unknown";

/** A failure carrying enough for the UI to explain itself and decide on retry. */
export class EnrichmentError extends Error {
  readonly kind: EnrichmentErrorKind;
  readonly retryable: boolean;

  constructor(
    kind: EnrichmentErrorKind,
    message: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "EnrichmentError";
    this.kind = kind;
    this.retryable =
      options?.retryable ??
      // None of these change by asking again with the same input: two need the
      // user to act, one needs a shorter transcript.
      (kind !== "unauthorized" &&
        kind !== "insufficient-credit" &&
        kind !== "too-large" &&
        // Repeating the request picks the same unavailable model.
        kind !== "model-unavailable");
  }
}

/** Raised when the caller's `signal` abandons the request. Not a failure. */
export class EnrichmentAborted extends Error {
  constructor() {
    super("Enrichment was stopped.");
    this.name = "EnrichmentAborted";
  }
}

export interface EnrichmentProvider {
  id: string;
  name: string;
  capabilities: EnrichmentCapabilities;
  requiresApiKey: boolean;
  /** Models this provider offers, most capable first. */
  models: { id: string; name: string }[];
  /**
   * The model used when the user has not chosen one.
   *
   * The **most capable**, not the cheapest. Enriching an hour-long transcript
   * costs between a tenth of a cent and eight cents depending on the model,
   * against 17-26 cents to transcribe that same hour — so the spread is
   * negligible against a bill the user has already accepted, and the picker is
   * there for anyone who wants to economise.
   */
  defaultModelId: string;
  /** Where the user gets an API key (§19). */
  keyUrl: string;
  /** What the provider does with what it is sent, in plain words (§19). */
  retentionNotice: string;
  /**
   * A short warning for the provider picker, or null where there is nothing to
   * warn about. Shown at the moment of choosing, where a Settings notice read
   * once is not enough.
   */
  pickerWarning: string | null;

  /**
   * Reads a prepared transcript and writes a Brief.
   *
   * @throws {EnrichmentError} With a `kind` the UI can explain.
   * @throws {EnrichmentAborted} When the caller's signal fires.
   */
  enrich(
    input: EnrichmentInput,
    options: EnrichmentOptions,
  ): Promise<EnrichmentResult>;
}
