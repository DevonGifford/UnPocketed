import {
  createProvider,
  describeProvider,
  listProviders,
  type ProviderDescriptor,
  type TranscriptionProvider,
} from "@/providers/transcription";

import { readApiKey } from "./credentials";
import {
  diarizeEnabled,
  effectiveSelection,
  readPreferences,
  type TranscriptionSelection,
} from "./preferences";

/*
 * Turning a stored choice into a Provider that can transcribe (§19, §3.3).
 *
 * This file exists to put the dependency the right way round. The registry used
 * to read `credentials.ts` itself, so a module whose job is to describe
 * Providers reached up into the feature that consumes it. Key *storage* is a
 * feature concern — it answers to §26, not to §18 — so the feature reads the
 * key and hands it over, and the registry stays a registry.
 */

/** The Provider and Model a new transcription will use, after validation. */
export function currentSelection(): TranscriptionSelection | null {
  return effectiveSelection(readPreferences(), listProviders());
}

/**
 * The Provider the user has chosen, described without needing a key.
 *
 * @returns Its descriptor, or null when the registry is empty.
 */
export function currentProviderDescriptor(): ProviderDescriptor | null {
  const selection = currentSelection();
  return selection ? describeProvider(selection.providerId) : null;
}

/**
 * Builds one Provider, reading its key from secure storage if it wants one.
 *
 * @param providerId Which Provider. Callers resuming a job pass the id recorded
 * **on the job**, never the current selection — see `transcribe.ts`.
 * @returns The Provider, or null when it is unknown, or needs a key and none is
 * stored. A missing key is a configuration state the UI explains (§19), and a
 * keyless Provider is not gated on one at all (§40).
 * @throws Never.
 */
export async function resolveProvider(
  providerId: string,
): Promise<TranscriptionProvider | null> {
  const descriptor = describeProvider(providerId);
  if (!descriptor) return null;

  // Not asked for where the Provider does not want one: an on-device Provider
  // has no account to have a key for, and prompting the keystore for a secret
  // that cannot exist would make it permanently unresolvable.
  const apiKey = descriptor.requiresApiKey
    ? await readApiKey(providerId)
    : null;

  return createProvider(providerId, apiKey);
}

/**
 * Builds the Provider for a new transcription, from the user's current choice.
 *
 * @returns The Provider and the Model to request, or null when nothing is
 * configured yet.
 * @throws Never.
 */
export async function resolveSelectedProvider(): Promise<{
  provider: TranscriptionProvider;
  modelId: string;
  diarize: boolean;
} | null> {
  const selection = currentSelection();
  if (!selection) return null;

  const provider = await resolveProvider(selection.providerId);
  if (!provider) return null;

  return {
    provider,
    modelId: selection.modelId,
    diarize: diarizeEnabled(readPreferences()),
  };
}

/**
 * One thing the user can transcribe with: a Provider and one of its Models.
 *
 * Flattened on purpose. §22 asks the user to "select the same recording and
 * submit it to another model", and that is one decision, not two — making them
 * pick a Provider and then a Model to retranscribe turns a comparison into a
 * chore and hides the fact that a Model belongs to a Provider.
 */
export interface TranscriptionTarget {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  /**
   * Whether this could run right now.
   *
   * False only when the Provider needs an API key and none is stored. Offered
   * anyway rather than hidden: a user who has not set up Deepgram should still
   * be able to see that Deepgram exists, and §19 tells them where the key goes.
   */
  ready: boolean;
}

/**
 * Every Provider and Model combination, for the retranscribe picker (§22).
 *
 * Reads each Provider's key once rather than once per Model, since a Provider
 * with four Models would otherwise hit the keystore four times for one answer.
 *
 * @returns One entry per Model per Provider, in registration order.
 * @throws Never.
 */
export async function listTranscriptionTargets(): Promise<TranscriptionTarget[]> {
  const targets: TranscriptionTarget[] = [];

  for (const provider of listProviders()) {
    const ready = provider.requiresApiKey
      ? (await readApiKey(provider.id)) !== null
      : true;

    for (const model of provider.models) {
      targets.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        modelName: model.name,
        ready,
      });
    }
  }

  return targets;
}
