import { File, Paths } from "expo-file-system";

import {
  resolveChoice,
  type ResolvedChoice,
  type StoredChoice,
} from "@/lib/provider-choice";
import {
  DEFAULT_ENRICHMENT_PROVIDER_ID,
  type EnrichmentProviderDescriptor,
} from "@/providers/enrichment";

/*
 * Which enrichment Provider and Model the user has chosen (§19, §20).
 *
 * Its own file, not a section inside the transcription settings. The two are
 * independent choices — someone may transcribe with Deepgram and enrich with
 * Anthropic — and one file holding both would make a corrupt write lose a
 * choice the user never touched.
 *
 * Not in SQLite, for the reason `db/database.ts` states outright: the database
 * is a rebuildable index, and a preference is derivable from nothing on disk.
 * A rebuild would silently reset the Provider and start billing a different
 * account.
 */

const FILE_NAME = "enrichment-settings.json";

export type EnrichmentPreferences = StoredChoice;
export type EnrichmentSelection = ResolvedChoice;

const EMPTY: EnrichmentPreferences = { providerId: null, modelByProvider: {} };

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

/** Narrows parsed JSON to the stored shape, field by field. */
function parse(raw: unknown): EnrichmentPreferences {
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

  return { providerId, modelByProvider };
}

/*
 * Read once per process, then kept. Every write goes through this module and
 * updates the cache, so the only way it goes stale is an edit from outside the
 * app — not a case worth re-reading a file on every render for.
 */
let cached: EnrichmentPreferences | null = null;

/** The stored preferences, or empty defaults. @throws Never. */
export function readEnrichmentPreferences(): EnrichmentPreferences {
  if (cached) return cached;

  let next = EMPTY;
  try {
    const file = settingsFile();
    if (file.exists) next = parse(JSON.parse(file.textSync()));
  } catch {
    // Missing, half-written or hand-edited all mean "not chosen", and the next
    // write replaces the file wholesale.
  }

  cached = next;
  return next;
}

/**
 * Replaces the stored preferences.
 *
 * @throws If the file cannot be written, so Settings can say the choice was not
 * saved. The cache is updated only on success, for the same reason.
 */
function write(preferences: EnrichmentPreferences): void {
  settingsFile().write(JSON.stringify(preferences, null, 2));
  cached = preferences;
}

/**
 * Records the user's enrichment Provider choice.
 *
 * Leaves every Model choice in place, including this Provider's, so coming back
 * to it restores the Model it was last used with.
 *
 * @throws If the choice cannot be stored.
 */
export function chooseEnrichmentProvider(providerId: string): void {
  write({ ...readEnrichmentPreferences(), providerId });
}

/**
 * Records the user's Model choice for one enrichment Provider (§20).
 *
 * @throws If the choice cannot be stored.
 */
export function chooseEnrichmentModel(providerId: string, modelId: string): void {
  const current = readEnrichmentPreferences();
  write({
    ...current,
    modelByProvider: { ...current.modelByProvider, [providerId]: modelId },
  });
}

/** The effective Provider and Model, validated against the registry. */
export function effectiveEnrichmentSelection(
  preferences: EnrichmentPreferences,
  providers: EnrichmentProviderDescriptor[],
): EnrichmentSelection | null {
  return resolveChoice(preferences, providers, DEFAULT_ENRICHMENT_PROVIDER_ID);
}

/** Forgets the cached read. For tests, and for a settings reset later. */
export function resetEnrichmentPreferencesCache(): void {
  cached = null;
}
