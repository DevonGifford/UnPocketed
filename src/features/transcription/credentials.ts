import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
} from "expo-secure-store";

/*
 * The user's provider API key (§19, §26).
 *
 * §26 lists "provider API keys stored securely" as a core privacy property, and
 * §19 says credentials go in secure device storage — so the key never touches
 * SQLite or a sidecar, both of which are plain files inside the app's sandbox.
 * `expo-secure-store` puts it behind the Android Keystore instead.
 *
 * PR8 owns provider *settings* — choosing a provider, choosing a model,
 * switching between them. Only the key itself is here, because PR7 cannot
 * transcribe anything without one and the alternative is storing it somewhere
 * §26 forbids.
 */

/** Scoped by provider so PR8's second provider needs no migration. */
function keyFor(providerId: string): string {
  return `transcription.apiKey.${providerId}`;
}

/**
 * Reads the stored key for a provider.
 *
 * @returns The key, or null when none is stored or the keystore cannot be read
 * — the caller treats both as "not configured" rather than as an error, since
 * there is nothing the user can do differently about a keystore failure.
 */
export async function readApiKey(providerId: string): Promise<string | null> {
  try {
    const stored = await getItemAsync(keyFor(providerId));
    const trimmed = stored?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Stores a key, or clears it when given an empty string.
 *
 * @throws If the keystore rejects the write, so Settings can say the key was
 * not saved rather than letting the user believe it was.
 */
export async function writeApiKey(
  providerId: string,
  apiKey: string,
): Promise<void> {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    await deleteItemAsync(keyFor(providerId));
    return;
  }

  // No `keychainAccessible`: it is an iOS option, and §6 makes iOS a non-goal.
  await setItemAsync(keyFor(providerId), trimmed);
}

/**
 * A masked form for display (§19 shows `••••`). Never returns the key itself —
 * Settings has no reason to render it, and a key on screen is a key in a
 * screenshot.
 *
 * @returns Dots plus the last four characters, or null when nothing is stored.
 */
export function maskApiKey(apiKey: string | null): string | null {
  if (!apiKey) return null;
  const tail = apiKey.slice(-4);
  return `${"•".repeat(Math.min(apiKey.length - tail.length, 20))}${tail}`;
}
