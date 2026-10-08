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
 * Google Gemini (§38's PR 9.5). The second enrichment provider.
 *
 * Chosen second for two reasons, one of them about this project rather than the
 * product: it has a **free tier**, which makes developing and testing
 * enrichment free rather than a per-run charge against a paid account. And it
 * stresses §3.3's abstraction hardest — it agrees with Anthropic on nothing but
 * the question:
 *
 * - a different endpoint shape (`/interactions`, not `/messages`);
 * - `x-goog-api-key`, where Anthropic takes `x-api-key` and neither takes
 *   `Authorization: Bearer`;
 * - `system_instruction` as a plain string, not a `system` field;
 * - `input` as one string, not a `messages` array of roles;
 * - `response_format` carrying the schema, not `output_config.format`;
 * - the answer nested inside `steps[].content[]`, not a top-level block list;
 * - completion reported in a `status` field, not a `stop_reason`.
 *
 * **The free tier trains Google's models, and this adapter cannot tell whether
 * the user is on it.** Google states that free-tier content is "used to improve
 * our products" while the paid tier is not — but the tier follows the Google
 * Cloud *project's* billing status rather than the API key, and nothing in the
 * API reports which applies. So `retentionNotice` below states a condition and
 * says plainly that Unpocketed cannot resolve it, where every other provider's
 * notice states a fact. Transcripts are what §26 calls the most sensitive thing
 * this app holds, so that distinction is not a technicality.
 *
 * Verified against Google's documentation on 2026-10-08.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** Generous; nothing waits on it but the user. */
const REQUEST_TIMEOUT_MS = 120_000;

interface InteractionResponse {
  model?: string;
  status?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
}

/** Maps an HTTP status onto something the UI can explain and act on. */
export function kindForStatus(status: number): EnrichmentErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "insufficient-credit";
  if (status === 413) return "too-large";
  // The free tier's limits are low enough that this is an ordinary outcome
  // rather than an edge case, which is why it has a kind of its own.
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
 * The schema Gemini will accept.
 *
 * Google's schema support is an OpenAPI-derived subset rather than full JSON
 * Schema, and `additionalProperties` is not part of it. Anthropic wants that
 * key for strict validation; sending it here risks a rejection of the whole
 * request. Stripping it costs nothing — it only ever said "no extra fields",
 * and `readBriefContent` drops unknown fields regardless.
 */
function geminiSchema(): unknown {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (typeof value !== "object" || value === null) return value;

    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === "additionalProperties") continue;
      out[key] = strip(nested);
    }
    return out;
  };

  return strip(BRIEF_SCHEMA);
}

/**
 * Pulls the Brief out of a successful response.
 *
 * Exported for the same reason as AssemblyAI's and Deepgram's readers: it is
 * the pure half and the half most likely to be wrong, and it cannot be reached
 * through `enrich` without mocking a network this repo never mocks.
 *
 * @throws {EnrichmentError} If the interaction did not complete, or did not
 * carry readable JSON.
 */
export function readInteractionResponse(
  body: string,
  requestedModelId: string,
): EnrichmentResult {
  let parsed: InteractionResponse;
  try {
    parsed = JSON.parse(body) as InteractionResponse;
  } catch (error) {
    throw new EnrichmentError(
      "unreadable",
      "The provider's response could not be read.",
      { cause: error },
    );
  }

  if (parsed.status === "incomplete") {
    throw new EnrichmentError(
      "unreadable",
      "The model ran out of room before finishing the brief.",
    );
  }

  if (parsed.status === "failed" || parsed.status === "cancelled") {
    throw new EnrichmentError(
      "provider-failed",
      "The provider could not write a brief for this transcript.",
    );
  }

  /*
   * Found by type rather than by position, twice over: a response may carry
   * steps other than the model's output, and a step may carry content other
   * than text. `steps[0].content[0]` works until the day it does not.
   */
  const text = parsed.steps
    ?.filter((step) => step.type === "model_output" || step.type === undefined)
    .flatMap((step) => step.content ?? [])
    .find((block) => block.type === "text")?.text;

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
    modelId: parsed.model ?? requestedModelId,
  };
}

/** Builds the provider around a key the caller has already read from storage. */
export function createGemini(apiKey: string): EnrichmentProvider {
  return {
    id: "gemini",
    name: "Google Gemini",
    capabilities: {
      // Comfortably past an hour of speech, which is ~13,000 tokens.
      maxInputTokens: 1_000_000,
    },
    requiresApiKey: true,
    /*
     * Only models a **new** free key can reach.
     *
     * The first list here was built from Google's pricing page and was wrong:
     * it included `gemini-2.5-flash`, which is still published and still billed
     * but answers `404` with "no longer available to new users". A pricing page
     * lists what a vendor charges for, not what an account may use.
     *
     * The Lite models matter more than their position suggests. Google
     * describes them as tuned for extraction and categorisation with more
     * generous request limits — which is both what writing a Brief actually is,
     * and the answer to the flagship model's constant `503` under free-tier
     * load.
     */
    models: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite" },
    ],
    /*
     * A Lite model by default, which inverts the rule used for Anthropic — and
     * on evidence rather than preference.
     *
     * There the argument was that the price spread is negligible against the
     * transcription already paid for, so the default should be the best answer.
     * Here the binding constraint is not price but **availability**: on a free
     * key, `gemini-3.8-flash` and `gemini-3.7-flash` both returned `503` under
     * load repeatedly, while both Lite models answered first time. A model the
     * user cannot reach has no quality at all.
     *
     * It is also the better fit on the merits. Google tunes Lite for
     * extraction and categorisation, which is what writing a brief is, and the
     * briefs it produced were as good as the flagship's on the same material.
     * Anyone who wants the flagship can pick it; it is listed first.
     */
    defaultModelId: "gemini-3.5-flash-lite",
    keyUrl: "https://aistudio.google.com/apikey",
    /*
     * The only notice in this app that states a condition rather than a fact,
     * and it says why. Every other provider's retention is knowable from the
     * key; Gemini's depends on billing being enabled on the Google Cloud
     * project behind it, which no API reports.
     */
    /*
     * Strengthened on 2026-10-08 after Google's own free-tier guidance turned
     * out to say more than its pricing page did. "Used to improve our products"
     * was what the pricing page stated; the developer guidance adds that unpaid
     * requests may be read by **human reviewers**, and tells developers not to
     * send private or proprietary data on that tier.
     *
     * A transcript is exactly what §26 calls the most sensitive thing this app
     * holds, so the notice has to carry the stronger claim rather than the
     * softer one. It still cannot state which tier applies — that follows the
     * Google Cloud project's billing status, not the key, and no API reports it.
     */
    retentionNotice:
      "On Google's free tier, what you send may be used to improve Google's models and may be read by human reviewers; Google's own guidance is not to send private data on it. The paid tier does neither. Which applies depends on whether billing is enabled on your Google Cloud project, and Unpocketed has no way to tell — so treat a free key as meaning people at Google may read this transcript.",
    pickerWarning:
      "Free tier: Google may train on this, and people there may read it",

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
            "x-goog-api-key": apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: options.modelId,
            system_instruction: BRIEF_SYSTEM_PROMPT,
            // One string, where Anthropic takes a list of role-tagged messages.
            input: briefPrompt(input),
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: geminiSchema(),
            },
          }),
          signal,
        }),
      options.signal,
    );
  } catch (error) {
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
        ? "The provider is rate-limiting this key. The free tier's limits are low — waiting, or enabling billing, should clear it."
        : `The provider rejected the request (${response.status}).`,
    );
  }

  return readInteractionResponse(await response.text(), options.modelId);
}
