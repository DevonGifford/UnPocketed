import { maskKey, readKey, writeKey } from "@/lib/api-keys";

/*
 * The user's enrichment provider API key (§19, §26).
 *
 * A separate namespace from transcription's, over the same keystore. Both
 * registries can hold a provider called `openai` one day — a transcription
 * adapter for Whisper and an enrichment adapter for GPT are different services
 * reached with different keys — and namespacing is what keeps one from being
 * read as the other.
 */

/** Reads the stored key for an enrichment provider. @throws Never. */
export function readEnrichmentKey(providerId: string): Promise<string | null> {
  return readKey("enrichment", providerId);
}

/**
 * Stores a key, or clears it when given an empty string.
 *
 * @throws If the keystore rejects the write.
 */
export function writeEnrichmentKey(
  providerId: string,
  apiKey: string,
): Promise<void> {
  return writeKey("enrichment", providerId, apiKey);
}

/** A masked form for display. Never returns the key itself (§19). */
export const maskEnrichmentKey = maskKey;
