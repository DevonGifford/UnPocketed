import { BRIEF_SCHEMA, BRIEF_SYSTEM_PROMPT, briefPrompt, readBriefContent } from "./brief";
import { withBusyRetry } from "./retry";
import {
  EnrichmentAborted,
  EnrichmentError,
  type EnrichmentErrorKind,
  type EnrichmentInput,
  type EnrichmentOptions,
  type EnrichmentProvider,
  type EnrichmentResult,
} from "./types";

/*
 * Anthropic (§38's PR 9.5). The first enrichment provider.
 *
 * Chosen on the axis the research found decisive, which was not cost: its
 * defaults need no caveat. Anthropic states it does not train on API inputs or
 * outputs from commercial products by default, and deletes them within 30 days.
 * Gemini's free tier, by contrast, says content is used to improve Google's
 * products — and transcripts are the most sensitive thing this app holds (§26).
 *
 * Cost did not decide it because it could not: a Brief over an hour-long
 * transcript costs about $0.08 here on the dearest model, against $0.17–$0.26
 * to transcribe that same hour. The dearest enrichment is under half the
 * cheapest transcription.
 *
 * API details verified against Anthropic's own documentation on 2026-10-08,
 * not recalled — each fails at runtime as an opaque 4xx:
 *
 * - auth is `x-api-key`, **not** an `Authorization: Bearer` header;
 * - `anthropic-version` is required on every request;
 * - structured output is `output_config.format` with `{type: "json_schema"}`;
 *   the older top-level `output_format` is deprecated;
 * - the response is a list of content blocks and the JSON arrives in a `text`
 *   block that is **not necessarily the first** — thinking blocks precede it.
 */

const ENDPOINT = "https://api.anthropic.com/v1/messages";

/** Required on every request; pins the wire format, not the model. */
const API_VERSION = "2023-06-01";

/**
 * Generous, and nothing waits on it but the user.
 *
 * Unlike Deepgram's 10-minute ceiling there is no server-side limit to stay
 * under — this exists so a dead socket cannot hang the screen forever.
 */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Room for a Brief and the thinking that precedes it.
 *
 * A Brief is about 500 tokens, but thinking counts against this ceiling too, so
 * a tight limit would truncate the answer rather than the reasoning.
 */
const MAX_TOKENS = 8_000;

interface MessagesResponse {
  model?: string;
  stop_reason?: string;
  stop_details?: { category?: string | null } | null;
  content?: { type?: string; text?: string }[];
}

/** Maps an HTTP status onto something the UI can explain and act on. */
export function kindForStatus(status: number): EnrichmentErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  // Anthropic answers 400 with a credit-balance message rather than 402, so
  // this is the closest honest mapping available from the status alone.
  if (status === 402) return "insufficient-credit";
  if (status === 413) return "too-large";
  // Not "the endpoint is wrong": these APIs put the model in the request body,
  // so a 404 means the *model* is unknown to this account, not the URL.
  if (status === 404) return "model-unavailable";
  if (status === 429) return "rate-limited";
  /*
   * Up, but busy. Observed on Gemini's free tier on 2026-10-08:
   * "gemini-3.8-flash is currently experiencing high demand". Reported as a
   * fault it would send the user tuning models, when the fix is to wait or
   * pick a less contended one.
   */
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "provider-failed";
}

/**
 * Pulls the Brief out of a successful response.
 *
 * Exported because it is the pure half of this adapter and the half most likely
 * to be wrong — the block list and the refusal path cannot be exercised through
 * `enrich` without mocking the network, and this repo mocks nothing.
 *
 * @throws {EnrichmentError} If the model refused, ran out of room, or did not
 * return readable JSON.
 */
export function readMessagesResponse(
  body: string,
  requestedModelId: string,
): EnrichmentResult {
  let parsed: MessagesResponse;
  try {
    parsed = JSON.parse(body) as MessagesResponse;
  } catch (error) {
    throw new EnrichmentError(
      "unreadable",
      "The provider's response could not be read.",
      { cause: error },
    );
  }

  /*
   * A refusal is an ordinary outcome here, not an edge case. Recordings are
   * whatever the user recorded, and a safety classifier may decline to write
   * about some of them. It arrives as HTTP 200, so it has to be checked before
   * the content is read or it looks like an empty answer.
   */
  if (parsed.stop_reason === "refusal") {
    throw new EnrichmentError(
      "provider-failed",
      "The model declined to write about this recording. Your transcript and recording are unchanged, and another provider may answer differently.",
      { retryable: false },
    );
  }

  if (parsed.stop_reason === "max_tokens") {
    throw new EnrichmentError(
      "unreadable",
      "The model ran out of room before finishing the brief.",
    );
  }

  // Not `content[0]`: thinking blocks precede the answer, so the JSON has to be
  // found by type rather than by position.
  const text = parsed.content?.find((block) => block.type === "text")?.text;
  if (typeof text !== "string") {
    throw new EnrichmentError(
      "unreadable",
      "The provider answered without a brief.",
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new EnrichmentError(
      "unreadable",
      "The provider's brief was not valid JSON.",
      { cause: error },
    );
  }

  return {
    content: readBriefContent(raw),
    // What actually ran (§20), which a provider may have substituted.
    modelId: parsed.model ?? requestedModelId,
  };
}

/** Builds the provider around a key the caller has already read from storage. */
export function createAnthropic(apiKey: string): EnrichmentProvider {
  return {
    id: "anthropic",
    name: "Anthropic",
    capabilities: {
      // The smallest window across the models offered below, so the guard holds
      // whichever one the user picks.
      maxInputTokens: 200_000,
    },
    requiresApiKey: true,
    models: [
      { id: "claude-opus-5", name: "Claude Opus 5" },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    ],
    /*
     * The most capable, not the cheapest. The spread from Haiku to Opus is
     * about five cents on an hour-long transcript, against the 17–26 cents
     * already spent transcribing it — small enough that the default should be
     * the best answer and the picker should let anyone economise.
     */
    defaultModelId: "claude-opus-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    retentionNotice:
      "Anthropic does not train models on what you send through its API, and deletes it within 30 days.",
    pickerWarning: null,

    async enrich(input, options) {
      if (input.estimatedTokens > this.capabilities.maxInputTokens) {
        throw new EnrichmentError(
          "too-large",
          "This transcript is longer than the model can read at once.",
          { retryable: false },
        );
      }
      return send(input, apiKey, options);
    },
  };
}

async function send(
  input: EnrichmentInput,
  apiKey: string,
  options: EnrichmentOptions,
): Promise<EnrichmentResult> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  let response: Response;
  try {
    /*
     * Wrapped so a busy model is retried rather than handed to the user as a
     * failure. Safe because a 5xx here means nothing was processed: no charge,
     * no duplicate. See `retry.ts`.
     */
    response = await withBusyRetry(
      () =>
        fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: options.modelId,
            max_tokens: MAX_TOKENS,
            system: BRIEF_SYSTEM_PROMPT,
            messages: [{ role: "user", content: briefPrompt(input) }],
            output_config: {
              /*
               * `medium` rather than the default `high`. Writing a brief from a
               * transcript is extraction, not reasoning, and this is a route where
               * someone is watching a spinner on a phone — Anthropic's own guidance
               * is that latency-sensitive routes rarely repay higher effort. The
               * model picker is where a user trades quality for cost; this is not.
               */
              effort: "medium",
              format: { type: "json_schema", schema: BRIEF_SCHEMA },
            },
          }),
          signal,
        }),
      options.signal,
    );
  } catch (error) {
    // A caller abort is not a network failure; the timeout deliberately is.
    if (options.signal?.aborted) throw new EnrichmentAborted();
    throw new EnrichmentError(
      "offline",
      "Could not reach the enrichment provider.",
      { cause: error },
    );
  }

  if (!response.ok) {
    /*
     * Logged, not just thrown. The failure the user sees is deliberately plain
     * language (§32) and carries no status code, which is right for them and
     * useless for diagnosing a provider that changed its API. The body of an
     * error response is the provider's own explanation — never the transcript —
     * so logging it leaks nothing.
     */
    const detail = await response.text().catch(() => "");
    console.warn(
      `[enrichment] ${ENDPOINT} → ${response.status} ${detail.slice(0, 600)}`,
    );

    throw new EnrichmentError(
      kindForStatus(response.status),
      response.status === 429
        ? "The provider is rate-limiting this account. Waiting and trying again should clear it."
        : `The provider rejected the request (${response.status}).`,
    );
  }

  return readMessagesResponse(await response.text(), options.modelId);
}
