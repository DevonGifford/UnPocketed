import { createAssemblyAI } from "./assemblyai";
import { createDeepgram } from "./deepgram";
import type { TranscriptionProvider } from "./types";

/*
 * The provider registry (§3.3, §18).
 *
 * The one place that knows which Providers exist. Nothing above this folder
 * contains provider-specific API logic: callers name a Provider by id, hand
 * over a key if it wants one, and get something that transcribes.
 *
 * Deliberately knows nothing about where a key is *stored*. It used to read
 * `features/transcription/credentials`, which pointed the dependency backwards —
 * a registry describing Providers reached up into the feature that uses it, so
 * neither could be understood or tested without the other. The feature now
 * reads the key and passes it in (see `features/transcription/provider.ts`).
 */

export interface ProviderDescriptor {
  id: string;
  name: string;
  keyUrl: string;
  retentionNotice: string;
  /**
   * Whether this Provider needs an API key before it can be used.
   *
   * True for every Provider v0.1 ships, and the field exists anyway: §40 wants
   * an on-device Provider eventually, and that one has no account, no key and
   * no network. Resolution used to treat a missing key as "not configured" for
   * *every* Provider, which would have made a keyless one permanently
   * unreachable — so the gate asks this rather than assuming.
   */
  requiresApiKey: boolean;
  /**
   * What identifying speakers costs with this Provider, in plain words, or
   * null where it costs nothing extra. Shown beside the toggle, because §19
   * makes Settings disclose what a Provider charges for and a switch that
   * quietly raises the bill is the same omission.
   */
  diarizationNotice: string | null;
  models: { id: string; name: string }[];
  defaultModelId: string;
}

/**
 * Builds a Provider around an API key.
 *
 * Takes the key as a plain string, including the empty one. A factory must
 * therefore be free of side effects and must not validate the key: it is called
 * with `""` purely to read a Provider's static description.
 */
type ProviderFactory = (apiKey: string) => TranscriptionProvider;

/** Registration order is display order, and the first entry is the default. */
const FACTORIES: Record<string, ProviderFactory> = {
  assemblyai: createAssemblyAI,
  deepgram: createDeepgram,
};

/** The Provider used until the user chooses otherwise (§19). */
export const DEFAULT_PROVIDER_ID = "assemblyai";

function describe(provider: TranscriptionProvider): ProviderDescriptor {
  return {
    id: provider.id,
    name: provider.name,
    keyUrl: provider.keyUrl,
    retentionNotice: provider.retentionNotice,
    requiresApiKey: provider.requiresApiKey,
    diarizationNotice: provider.diarizationNotice,
    models: provider.models,
    defaultModelId: provider.defaultModelId,
  };
}

/**
 * What the interface can show about a Provider without holding a key — its
 * name, its Models, where to get a key, and what it does with what it is sent.
 */
export function describeProvider(
  providerId = DEFAULT_PROVIDER_ID,
): ProviderDescriptor | null {
  const factory = FACTORIES[providerId];
  if (!factory) return null;

  // Built with an empty key purely to read its static description. Nothing is
  // sent, so there is nothing to authorise.
  return describe(factory(""));
}

/**
 * Every Provider, in display order, for the picker in Settings (§19).
 *
 * @returns One descriptor per registered Provider. Never empty in practice, but
 * callers treat an empty list as "no Provider available" rather than asserting.
 */
export function listProviders(): ProviderDescriptor[] {
  return Object.keys(FACTORIES).map((id) => describe(FACTORIES[id]("")));
}

/**
 * Builds a Provider ready to transcribe.
 *
 * @param apiKey The user's key, or null for a Provider that needs none.
 * @returns The Provider, or null when the id is unknown or a key is required
 * and absent — a configuration state the UI explains, not an error (§19).
 */
export function createProvider(
  providerId: string,
  apiKey: string | null,
): TranscriptionProvider | null {
  const factory = FACTORIES[providerId];
  if (!factory) return null;

  const provider = factory(apiKey ?? "");
  if (provider.requiresApiKey && !apiKey) return null;

  return provider;
}

export { createAssemblyAI } from "./assemblyai";
export { createDeepgram } from "./deepgram";
export {
  TranscriptionAborted,
  TranscriptionError,
  type AudioSource,
  type ProviderCapabilities,
  type TranscriptionErrorKind,
  type TranscriptionOptions,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";
