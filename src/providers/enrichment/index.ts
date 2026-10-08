import { createAnthropic } from "./anthropic";
import { createGemini } from "./gemini";
import type { EnrichmentProvider } from "./types";

/*
 * ⚠ HALF OF THIS FOLDER HAS NEVER RUN AGAINST A REAL API.
 *
 * **Gemini is exercised.** It has produced real Briefs from real transcripts on
 * a device, across three models, and the live runs corrected four things this
 * code was wrong about — all of them judgement rather than API reading. See the
 * research file's "Corrected by the first live runs" for the list.
 *
 * **Anthropic has never been called.** No key has been configured, so every
 * request shape in `anthropic.ts` was verified against Anthropic's published
 * documentation and against nothing else. It is a real implementation rather
 * than a stub, but it is unproven, and PR 9.5 shipped knowing that — a second
 * provider was needed to keep the abstraction honest, not to be relied on.
 *
 * What the Gemini runs suggest is likeliest to bite when Anthropic is first
 * used, because these are where the two differ rather than where they agree:
 * `output_config.format` with a `json_schema` (Gemini takes `response_format`
 * and a stripped schema); the content-block list, where the answer is not the
 * first block; and the `refusal` stop reason, which arrives as HTTP 200 and is
 * handled but never seen. The cleanup path in that file is doubly unproven —
 * unexercised provider, unexercised capability.
 *
 * Delete this notice when both halves have run, and record what it cost.
 *
 * The enrichment provider registry (§3.3).
 *
 * Mirrors `providers/transcription/index.ts` without sharing anything with it.
 * The duplication is deliberate: the two registries describe different kinds of
 * provider, and merging them would put a speech recogniser and a summarising
 * model in the same picker. What they share is the shape — keyed by id, built
 * around a key the *feature* reads, described without one.
 */

export interface EnrichmentProviderDescriptor {
  id: string;
  name: string;
  keyUrl: string;
  retentionNotice: string;
  /** A short warning shown in the picker, or null where there is none. */
  pickerWarning: string | null;
  requiresApiKey: boolean;
  models: { id: string; name: string }[];
  defaultModelId: string;
}

type ProviderFactory = (apiKey: string) => EnrichmentProvider;

/** Registration order is display order. Keep each key equal to the provider id:
 * preferences persist it, and changing one orphans a stored choice. */
const FACTORIES: Record<string, ProviderFactory> = {
  anthropic: createAnthropic,
  gemini: createGemini,
};

/** The provider used until the user chooses otherwise. */
export const DEFAULT_ENRICHMENT_PROVIDER_ID = "anthropic";

function describe(provider: EnrichmentProvider): EnrichmentProviderDescriptor {
  return {
    id: provider.id,
    name: provider.name,
    keyUrl: provider.keyUrl,
    retentionNotice: provider.retentionNotice,
    pickerWarning: provider.pickerWarning,
    requiresApiKey: provider.requiresApiKey,
    models: provider.models,
    defaultModelId: provider.defaultModelId,
  };
}

/** What the interface can show without holding a key. */
export function describeEnrichmentProvider(
  providerId = DEFAULT_ENRICHMENT_PROVIDER_ID,
): EnrichmentProviderDescriptor | null {
  const factory = FACTORIES[providerId];
  if (!factory) return null;
  // Built with an empty key purely to read its static description.
  return describe(factory(""));
}

/** Every provider, in display order, for the picker in Settings (§19). */
export function listEnrichmentProviders(): EnrichmentProviderDescriptor[] {
  return Object.keys(FACTORIES).map((id) => describe(FACTORIES[id]("")));
}

/**
 * Builds a provider ready to enrich.
 *
 * @param apiKey The user's key, or null for a provider that needs none — which
 * is how a local model would arrive (§40).
 * @returns The provider, or null when the id is unknown or a key is required
 * and absent.
 */
export function createEnrichmentProvider(
  providerId: string,
  apiKey: string | null,
): EnrichmentProvider | null {
  const factory = FACTORIES[providerId];
  if (!factory) return null;

  const provider = factory(apiKey ?? "");
  if (provider.requiresApiKey && !apiKey) return null;

  return provider;
}

export { createAnthropic } from "./anthropic";
export { createGemini } from "./gemini";
export {
  BRIEF_SCHEMA,
  BRIEF_SYSTEM_PROMPT,
  briefPrompt,
  estimateTokens,
  readBriefContent,
} from "./brief";
export {
  EnrichmentAborted,
  EnrichmentError,
  type BriefContent,
  type EnrichmentCapabilities,
  type EnrichmentErrorKind,
  type EnrichmentInput,
  type EnrichmentOptions,
  type EnrichmentProvider,
  type EnrichmentResult,
} from "./types";
