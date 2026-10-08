import { maskKey, readKey, writeKey } from "@/lib/api-keys";

/*
 * The user's transcription provider API key (§19, §26).
 *
 * A thin namespace over `lib/api-keys`, which holds the keystore reasoning and
 * is shared with enrichment. Kept as its own module so callers say what kind of
 * key they mean rather than passing a namespace string around — and so a
 * transcription key can never be read as an enrichment one by a typo.
 */

/** Reads the stored key for a transcription provider. @throws Never. */
export function readApiKey(providerId: string): Promise<string | null> {
  return readKey("transcription", providerId);
}

/**
 * Stores a key, or clears it when given an empty string.
 *
 * @throws If the keystore rejects the write.
 */
export function writeApiKey(providerId: string, apiKey: string): Promise<void> {
  return writeKey("transcription", providerId, apiKey);
}

/** A masked form for display. Never returns the key itself (§19). */
export const maskApiKey = maskKey;
