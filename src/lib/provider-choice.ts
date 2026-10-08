/*
 * Resolving a stored provider and model choice (§19, §20).
 *
 * Shared by transcription and enrichment. The two registries are deliberately
 * separate — a speech recogniser and a summarising model must never appear in
 * one picker — but *"which of these did the user pick, and is it still valid"*
 * is one question with one answer, and duplicating it would duplicate the open
 * problem recorded below into a second place.
 *
 * Pure, and separated from the file IO that stores it, because the validation
 * is the part with the interesting failure modes.
 */

/** The minimum a provider must expose to be chosen between. */
export interface ChoosableProvider {
  id: string;
  models: { id: string; name: string }[];
  defaultModelId: string;
}

/** What is persisted: a chosen provider, and a model remembered per provider. */
export interface StoredChoice {
  /** Null when the user has never chosen, so the shipped default applies. */
  providerId: string | null;
  /**
   * Keyed by provider id, so switching away and back does not discard a model
   * choice — switching back and forth to compare is the point (§22).
   */
  modelByProvider: Record<string, string>;
}

export interface ResolvedChoice {
  providerId: string;
  modelId: string;
}

/**
 * Resolves a stored choice against the providers that actually exist.
 *
 * Both halves fall back rather than failing, and for the same reason: a stored
 * id that no longer exists is not the user's mistake. A provider can be removed
 * between app versions, and a provider's model list can change under it —
 * AssemblyAI's did exactly that during PR7. A stale id sent to an API comes
 * back as an opaque 4xx forever with nothing on screen to explain it, so it is
 * corrected here instead.
 *
 * TODO: Do not fall back silently when a *stored* provider has gone missing —
 * that can bill an account the user did not choose. Decided 2026-10-08 (Devon),
 * not yet built: treat it as unconfigured and make the user choose again. The
 * same answer covers an unreadable preferences file.
 *
 * @returns The provider and model to use, or null when no provider exists.
 */
export function resolveChoice(
  stored: StoredChoice,
  providers: ChoosableProvider[],
  defaultProviderId: string,
): ResolvedChoice | null {
  const provider =
    providers.find((candidate) => candidate.id === stored.providerId) ??
    providers.find((candidate) => candidate.id === defaultProviderId) ??
    providers[0];

  if (!provider) return null;

  const chosen = stored.modelByProvider[provider.id];
  const modelId = provider.models.some((model) => model.id === chosen)
    ? chosen
    : provider.defaultModelId;

  return { providerId: provider.id, modelId };
}
