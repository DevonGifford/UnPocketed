import {
  createEnrichmentProvider,
  describeEnrichmentProvider,
  listEnrichmentProviders,
  type EnrichmentProvider,
} from "@/providers/enrichment";

import { readEnrichmentKey } from "./credentials";
import {
  effectiveEnrichmentSelection,
  readEnrichmentPreferences,
} from "./preferences";

/*
 * Turning the stored enrichment choice into a provider that can run.
 *
 * Mirrors `features/transcription/provider.ts`, and exists for the same
 * reason: key *storage* is a feature concern answering to §26, so the feature
 * reads the key and hands it over while the registry stays a registry.
 */

/**
 * Builds the chosen enrichment provider, reading its key from the keystore.
 *
 * @returns The provider and the model to request, or null when nothing is
 * configured — which is a state the UI explains, not an error (§19).
 * @throws Never.
 */
export async function resolveSelectedEnrichment(): Promise<{
  provider: EnrichmentProvider;
  modelId: string;
} | null> {
  const selection = effectiveEnrichmentSelection(
    readEnrichmentPreferences(),
    listEnrichmentProviders(),
  );
  if (!selection) return null;

  const descriptor = describeEnrichmentProvider(selection.providerId);
  if (!descriptor) return null;

  // Not asked for where the provider wants none: a local model has no account
  // to have a key for (§40).
  const apiKey = descriptor.requiresApiKey
    ? await readEnrichmentKey(selection.providerId)
    : null;

  const provider = createEnrichmentProvider(selection.providerId, apiKey);
  return provider ? { provider, modelId: selection.modelId } : null;
}
