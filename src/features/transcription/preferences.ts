import { File, Paths } from "expo-file-system";

import { DEFAULT_PROVIDER_ID, type ProviderDescriptor } from "@/providers/transcription";

/*
 * Which Provider and Model the user has chosen (§19, §20).
 *
 * Deliberately **not** in SQLite. `db/database.ts` states that the database is
 * "a rebuildable index over the recordings directory, not the source of truth",
 * and `reconcileLibrary` leans on being free to drop and re-derive it. A
 * preference is derivable from nothing on disk, so a rebuild would silently
 * reset the user's Provider to the default — and under bring-your-own-key that
 * means quietly billing a different account than the one they picked. It gets a
 * file of its own for the same reason transcripts get sidecars.
 *
 * Not secure storage either: the key is the secret, and a provider id is not.
 * `credentials.ts` keeps the one thing that belongs behind the keystore.
 *
 * Reads are synchronous and cached, because Settings renders the current choice
 * on first paint and `transcribeRecording` needs it before it can resolve a
 * Provider at all.
 */

const FILE_NAME = "transcription-settings.json";

export interface TranscriptionPreferences {
  /**
   * The chosen Provider, or null when the user has never chosen one.
   *
   * Null rather than the default written out, so that a user who never visited
   * Settings follows the shipped default if it ever changes, while a user who
   * chose deliberately keeps their choice.
   */
  providerId: string | null;
  /**
   * The Model chosen per Provider, keyed by provider id.
   *
   * Per Provider rather than one field, so switching to another Provider and
   * back does not silently discard the Model choice — switching back and forth
   * to compare is the capability PR8 exists to deliver (§22).
   */
  modelByProvider: Record<string, string>;
  /**
   * Whether to ask the Provider to attribute speech to speakers (§10).
   *
   * Not per Provider, because it is a statement about what the user wants from
   * a transcript rather than about any one service — and asking them to set it
   * twice to compare two Providers on the same recording would defeat §22.
   *
   * Null means never chosen, which resolves to on: the Providers v0.1 ships
   * both support it, and a transcript of a conversation that cannot say who
   * spoke is the problem this setting exists to avoid. It is a choice rather
   * than always-on because AssemblyAI bills it as an add-on, and a solo voice
   * memo should not quietly cost more for labels it cannot use.
   */
  diarize: boolean | null;
}

/** The effective Provider and Model, after the stored choice is validated. */
export interface TranscriptionSelection {
  providerId: string;
  modelId: string;
}

const EMPTY: TranscriptionPreferences = {
  providerId: null,
  modelByProvider: {},
  diarize: null,
};

/** What {@link TranscriptionPreferences.diarize} means when never chosen. */
export const DIARIZE_BY_DEFAULT = true;

/** Whether to request speaker attribution, resolving the unset case. */
export function diarizeEnabled(
  preferences: TranscriptionPreferences,
): boolean {
  return preferences.diarize ?? DIARIZE_BY_DEFAULT;
}

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

/**
 * Narrows parsed JSON to the stored shape, field by field.
 *
 * Hand-written rather than trusted, because this file is the one piece of app
 * state a user can plausibly edit or restore from a backup, and a `providerId`
 * that is a number would otherwise reach the registry as a lookup key.
 */
function parse(raw: unknown): TranscriptionPreferences {
  if (typeof raw !== "object" || raw === null) return EMPTY;
  const record = raw as Record<string, unknown>;

  const providerId =
    typeof record.providerId === "string" && record.providerId
      ? record.providerId
      : null;

  const modelByProvider: Record<string, string> = {};
  if (typeof record.modelByProvider === "object" && record.modelByProvider) {
    for (const [key, value] of Object.entries(
      record.modelByProvider as Record<string, unknown>,
    )) {
      if (typeof value === "string" && value) modelByProvider[key] = value;
    }
  }

  const diarize =
    typeof record.diarize === "boolean" ? record.diarize : null;

  return { providerId, modelByProvider, diarize };
}

/*
 * Read once per process, then kept.
 *
 * Every write goes through this module and updates the cache, so the only way
 * it can go stale is an edit from outside the app — which is not a case worth
 * re-reading a file on every render for.
 */
let cached: TranscriptionPreferences | null = null;

/**
 * The stored preferences.
 *
 * @returns The stored choice, or empty defaults when nothing is stored or the
 * file cannot be read. Both are "the user has not chosen", which is a state
 * with a correct answer rather than an error (§19).
 * @throws Never.
 */
export function readPreferences(): TranscriptionPreferences {
  if (cached) return cached;

  let next = EMPTY;
  try {
    const file = settingsFile();
    if (file.exists) next = parse(JSON.parse(file.textSync()));
  } catch {
    // A missing, half-written or hand-edited file means "not chosen", and the
    // next write replaces it wholesale.
  }

  cached = next;
  return next;
}

/**
 * Replaces the stored preferences.
 *
 * @throws If the file cannot be written, so Settings can say the choice was not
 * saved rather than showing a selection that will not survive a restart. The
 * cache is updated only on a successful write, for the same reason.
 */
function writePreferences(preferences: TranscriptionPreferences): void {
  settingsFile().write(JSON.stringify(preferences, null, 2));
  cached = preferences;
}

/**
 * Records the user's Provider choice (§19).
 *
 * Leaves every Model choice in place, including this Provider's: choosing
 * AssemblyAI again should restore the Model it was last used with.
 *
 * @throws If the choice cannot be stored.
 */
export function chooseProvider(providerId: string): void {
  const current = readPreferences();
  writePreferences({ ...current, providerId });
}

/**
 * Records the user's Model choice for one Provider (§20).
 *
 * @throws If the choice cannot be stored.
 */
export function chooseModel(providerId: string, modelId: string): void {
  const current = readPreferences();
  writePreferences({
    ...current,
    modelByProvider: { ...current.modelByProvider, [providerId]: modelId },
  });
}

/**
 * Records whether the user wants speakers identified (§10).
 *
 * @throws If the choice cannot be stored.
 */
export function chooseDiarize(diarize: boolean): void {
  writePreferences({ ...readPreferences(), diarize });
}

/**
 * Resolves stored preferences against the Providers that actually exist.
 *
 * Pure, and separated from the file IO above so it can be tested without a
 * filesystem — the validation is the part with the interesting failure modes.
 *
 * Both halves fall back rather than failing, and for the same reason: a stored
 * id that no longer exists is not the user's mistake. A Provider can be removed
 * between app versions, and a Provider's Model list can change under it —
 * AssemblyAI's did exactly that during PR7, when `universal-3-5-pro` appeared.
 * A stale stored id sent to the API comes back as an opaque 4xx forever, with
 * nothing on screen to explain it, so it is corrected here instead.
 *
 * @param providers Every Provider in the registry.
 * @returns The Provider and Model to use, or null when the registry is empty.
 */
export function effectiveSelection(
  preferences: TranscriptionPreferences,
  providers: ProviderDescriptor[],
): TranscriptionSelection | null {
  const provider =
    providers.find((candidate) => candidate.id === preferences.providerId) ??
    providers.find((candidate) => candidate.id === DEFAULT_PROVIDER_ID) ??
    providers[0];

  if (!provider) return null;

  const stored = preferences.modelByProvider[provider.id];
  const modelId = provider.models.some((model) => model.id === stored)
    ? stored
    : provider.defaultModelId;

  return { providerId: provider.id, modelId };
}

/** Forgets the cached read. For tests, and for a settings reset later. */
export function resetPreferencesCache(): void {
  cached = null;
}
