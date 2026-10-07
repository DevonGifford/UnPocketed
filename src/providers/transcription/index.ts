import { readApiKey } from "@/features/transcription/credentials";

import { createAssemblyAI } from "./assemblyai";
import type { TranscriptionProvider } from "./types";

/*
 * The provider registry (§3.3, §18).
 *
 * "The MVP begins with one provider. A second provider is introduced only after
 * the abstraction is proven" — so this is a list of one, shaped as a list.
 * PR8 adds Deepgram and a custom OpenAI-compatible endpoint; nothing outside
 * this folder should need changing when it does.
 */

export interface ProviderDescriptor {
  id: string;
  name: string;
  keyUrl: string;
  retentionNotice: string;
  models: { id: string; name: string }[];
  defaultModelId: string;
}

/** Builds a provider around an API key. */
type ProviderFactory = (apiKey: string) => TranscriptionProvider;

const FACTORIES: Record<string, ProviderFactory> = {
  assemblyai: createAssemblyAI,
};

/** The provider v0.1 ships with. PR8 makes this a user choice. */
export const DEFAULT_PROVIDER_ID = "assemblyai";

/**
 * What the interface can show about a provider without holding a key — its
 * name, where to get a key, and what it does with what it is sent.
 */
export function describeProvider(
  providerId = DEFAULT_PROVIDER_ID,
): ProviderDescriptor | null {
  const factory = FACTORIES[providerId];
  if (!factory) return null;

  // Built with an empty key purely to read its static description. Nothing is
  // sent, so there is nothing to authorise.
  const provider = factory("");
  return {
    id: provider.id,
    name: provider.name,
    keyUrl: provider.keyUrl,
    retentionNotice: provider.retentionNotice,
    models: provider.models,
    defaultModelId: provider.defaultModelId,
  };
}

/**
 * The configured provider, ready to transcribe.
 *
 * @returns The provider, or null when no API key is stored — which is a
 * configuration state the UI explains, not an error (§19).
 */
export async function resolveProvider(
  providerId = DEFAULT_PROVIDER_ID,
): Promise<TranscriptionProvider | null> {
  const factory = FACTORIES[providerId];
  if (!factory) return null;

  const apiKey = await readApiKey(providerId);
  if (!apiKey) return null;

  return factory(apiKey);
}

export { createAssemblyAI } from "./assemblyai";
export {
  TranscriptionError,
  type AudioSource,
  type ProviderCapabilities,
  type TranscriptionErrorKind,
  type TranscriptionOptions,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";
export { TranscriptionAborted } from "./assemblyai";
