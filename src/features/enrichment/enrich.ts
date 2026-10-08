import {
  createEnrichmentProvider,
  describeEnrichmentProvider,
  EnrichmentAborted,
  EnrichmentError,
  estimateTokens,
  listEnrichmentProviders,
  type EnrichmentInput,
  type EnrichmentProvider,
} from "@/providers/enrichment";
import { groupedTurns, readingViewFor, speakerLabel } from "@/features/transcription/reading";
import type { Brief, Transcript } from "@/types";

import { readEnrichmentKey } from "./credentials";
import { enrichmentFailure, type EnrichmentFailure } from "./errors";
import {
  effectiveEnrichmentSelection,
  readEnrichmentPreferences,
} from "./preferences";
import { saveBrief } from "./repository";
import { briefIdFor } from "./storage";

/*
 * Producing a Brief (§38's PR 9.5).
 *
 * Far simpler than `features/transcription/transcribe.ts`, and the difference
 * is the point rather than an accident. That file exists to make a transcription
 * survive the app dying: a job reference written before polling starts, a claim
 * so two pollers cannot race, and a rule that only the job's own failure is
 * terminal — all because losing the handle to a running transcription costs
 * another upload and another bill.
 *
 * **None of that is needed here.** Enrichment is one request over text already
 * on the device, so an interrupted one costs a retry. There is no job to
 * re-attach to, nothing to persist before starting, and no way to be charged
 * twice for work that is still running.
 *
 * What this file does owe the user: never touching the Transcript it reads
 * (§10), and never claiming a Brief was kept when the write failed — by then
 * they have already paid for the request.
 */

export type EnrichOutcome =
  | { status: "enriched"; brief: Brief }
  /** The caller abandoned the request. Not a failure, and nothing was stored. */
  | { status: "abandoned" }
  | { status: "failed"; failure: EnrichmentFailure };

/**
 * Renders a Transcript for a model to read.
 *
 * Uses `readingViewFor`, so the model is given exactly what the **user** sees.
 * That is not just tidiness: where turns do not account for the whole
 * transcript, the flat text is used instead, and sending the turns would hand
 * the model a transcript with words missing — then ask it to summarise what it
 * was not shown.
 *
 * Turns are grouped per speaker for the same reason the screen groups them:
 * Deepgram cuts one speaker's sentence into several, and a model reading
 * "Speaker 1:" fourteen times sees a fragmented conversation that never
 * happened.
 */
export function enrichmentInputFor(transcript: Transcript): EnrichmentInput {
  const view = readingViewFor(transcript);

  if (view.kind === "text") {
    return {
      text: view.text,
      speakers: [],
      estimatedTokens: estimateTokens(view.text),
    };
  }

  const blocks = groupedTurns(view.segments);
  const text = blocks
    .map((block) => `${speakerLabel(block.speaker)}${":"} ${block.text}`)
    .join("\n\n");

  const speakers = [
    ...new Set(
      blocks
        .map((block) => block.speaker)
        .filter((speaker): speaker is number => speaker !== null),
    ),
  ].sort((a, b) => a - b);

  return { text, speakers, estimatedTokens: estimateTokens(text) };
}

/** Builds the chosen Provider, reading its key from the keystore. */
async function resolveSelected(): Promise<{
  provider: EnrichmentProvider;
  modelId: string;
} | null> {
  const selection = effectiveEnrichmentSelection(
    readEnrichmentPreferences(),
    listEnrichmentProviders(),
  );
  if (!selection) return null;

  const descriptor = describeEnrichmentProvider(selection.providerId);
  if (!descriptor) return null;

  // Not asked for where the Provider does not want one: a local model has no
  // account to have a key for (§40).
  const apiKey = descriptor.requiresApiKey
    ? await readEnrichmentKey(selection.providerId)
    : null;

  const provider = createEnrichmentProvider(selection.providerId, apiKey);
  return provider ? { provider, modelId: selection.modelId } : null;
}

function toFailure(error: unknown): EnrichmentFailure {
  if (error instanceof EnrichmentError) {
    return enrichmentFailure(error.kind, error.retryable);
  }
  return enrichmentFailure("unknown", true);
}

/**
 * Reads a Transcript and stores a Brief describing it.
 *
 * The Transcript is **never modified**. A model that rewrites wording produces
 * a derived Transcript instead, which is a different operation entirely.
 *
 * Re-running the same model replaces that model's Brief rather than adding
 * another, because the Brief's id comes from the Transcript and the model.
 * Running a different model adds one beside it, which is what makes two
 * comparable (§22).
 *
 * @param signal Abandons the request. Nothing is left running: there is no job.
 * @returns What happened. `abandoned` is not a failure.
 * @throws Never.
 */
export async function enrichTranscript(
  transcript: Transcript,
  signal?: AbortSignal,
): Promise<EnrichOutcome> {
  const selected = await resolveSelected();
  if (!selected) {
    return { status: "failed", failure: enrichmentFailure("not-configured", false) };
  }

  const { provider, modelId } = selected;
  const input = enrichmentInputFor(transcript);

  if (!input.text.trim()) {
    // Nothing to read. Sending it would spend the user's money to be told so.
    return { status: "failed", failure: enrichmentFailure("empty-transcript", false) };
  }

  let result;
  try {
    result = await provider.enrich(input, { modelId, signal });
  } catch (error) {
    if (error instanceof EnrichmentAborted) return { status: "abandoned" };
    return { status: "failed", failure: toFailure(error) };
  }

  const timestamp = new Date().toISOString();
  const brief: Brief = {
    id: briefIdFor(transcript.id, provider.id, result.modelId),
    transcriptId: transcript.id,
    providerId: provider.id,
    // What actually ran (§20), which a provider may have substituted.
    modelId: result.modelId,
    ...result.content,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    return { status: "enriched", brief: saveBrief(brief) };
  } catch {
    /*
     * The request succeeded and has been paid for; only the write failed. Say
     * so precisely rather than reporting a failure that implies nothing
     * happened — the user's next move is to try again, and they should know
     * that doing so costs again.
     */
    return { status: "failed", failure: enrichmentFailure("not-stored", true) };
  }
}
