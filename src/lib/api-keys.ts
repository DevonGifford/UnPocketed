import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
} from "expo-secure-store";

/*
 * API keys in the device keystore (§19, §26).
 *
 * §26 lists "provider API keys stored securely" as a core privacy property, and
 * §19 puts credentials in secure device storage — so a key never touches SQLite
 * or a sidecar, both of which are plain files inside the app's sandbox.
 * `expo-secure-store` puts it behind the Android Keystore instead.
 *
 * Shared by both provider kinds, which was decided rather than assumed: a
 * transcription provider and an enrichment provider are different things with
 * different registries, but "a secret belonging to a provider id" is one
 * problem with one answer. The **namespace** is what keeps them apart, so a
 * transcription key can never be read as an enrichment key even if both
 * providers were somehow given the same id.
 */

/** Which kind of provider a key belongs to. Part of the storage key. */
export type KeyNamespace = "transcription" | "enrichment";

function storageKey(namespace: KeyNamespace, providerId: string): string {
  return `${namespace}.apiKey.${providerId}`;
}

/**
 * Reads a stored key.
 *
 * @returns The key, or null when none is stored or the keystore cannot be read
 * — the caller treats both as "not configured" rather than as an error, since
 * there is nothing the user can do differently about a keystore failure.
 */
export async function readKey(
  namespace: KeyNamespace,
  providerId: string,
): Promise<string | null> {
  try {
    const stored = await getItemAsync(storageKey(namespace, providerId));
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
export async function writeKey(
  namespace: KeyNamespace,
  providerId: string,
  apiKey: string,
): Promise<void> {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    await deleteItemAsync(storageKey(namespace, providerId));
    return;
  }

  // No `keychainAccessible`: it is an iOS option, and §6 makes iOS a non-goal.
  await setItemAsync(storageKey(namespace, providerId), trimmed);
}

/**
 * A masked form for display (§19 shows `••••`).
 *
 * Never returns the key itself — Settings has no reason to render one, and a
 * key on screen is a key in a screenshot.
 *
 * @returns Dots plus the last four characters, or null when nothing is stored.
 */
export function maskKey(apiKey: string | null): string | null {
  if (!apiKey) return null;
  // TODO(PR7 review): Keys of four characters or fewer currently show in full.
  // Mask those too; Settings should never reveal the entire saved key.
  const tail = apiKey.slice(-4);
  return `${"•".repeat(Math.min(apiKey.length - tail.length, 20))}${tail}`;
}
