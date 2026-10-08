import { EnrichmentAborted, EnrichmentError } from "@/providers/enrichment";
import { editableTurnsFor, editedTranscript } from "@/features/transcription/editing";
import { saveTranscript } from "@/features/transcription/repository";
import type { Transcript } from "@/types";

import { enrichmentFailure, type EnrichmentFailure } from "./errors";
import { resolveSelectedEnrichment } from "./provider";

/*
 * Letting a model correct a transcript's wording (§38's PR 9.5).
 *
 * This is **not** a second kind of edit. It reuses PR9's editing model
 * wholesale: the result is a derived Transcript whose `source` names the model
 * instead of the user, and the recogniser's original is left exactly as it
 * came back. That was the point of recording an *author* rather than an edited
 * flag — an LLM fixing a mishearing and a person fixing a typo are the same
 * operation by different hands, and one mechanism answers for both.
 *
 * Two things it must never do, both enforced below rather than requested:
 *
 * - **Change who spoke.** The model is given turns and returns words for those
 *   same turns; speakers and timings are carried over untouched. A model that
 *   ignores the instruction cannot do damage, because `applyCleanup` keeps the
 *   original wherever a usable correction did not come back.
 * - **Replace the original.** A cleanup is stored beside the recogniser's
 *   transcript, never over it, so the user can always read what was actually
 *   heard (§3.2's instinct, applied to text).
 */

export type CleanupOutcome =
  | { status: "cleaned"; transcript: Transcript; changed: number }
  /** The model returned nothing worth storing. Not a failure, and not a record. */
  | { status: "unchanged" }
  | { status: "abandoned" }
  | { status: "failed"; failure: EnrichmentFailure };

/** Whether the chosen provider offers a correction pass at all. */
export async function cleanupAvailable(): Promise<boolean> {
  const selected = await resolveSelectedEnrichment();
  return Boolean(selected?.provider.cleanup);
}

/**
 * Asks the chosen model to correct a Transcript, and stores the result as a
 * derived Transcript attributed to that model.
 *
 * Re-running the same model updates its own correction rather than stacking
 * another, because the derived id comes from the parent and the author. A
 * *different* model produces a separate one, and a user editing either gets
 * their own — nobody overwrites anybody.
 *
 * @param signal Abandons the request. Nothing is left running.
 * @returns What happened. `unchanged` means the model found nothing to fix,
 * which is a real answer and deliberately does not create a record.
 * @throws Never.
 */
export async function cleanupTranscript(
  transcript: Transcript,
  signal?: AbortSignal,
): Promise<CleanupOutcome> {
  const selected = await resolveSelectedEnrichment();
  if (!selected) {
    return { status: "failed", failure: enrichmentFailure("not-configured", false) };
  }

  const { provider, modelId } = selected;
  if (!provider.cleanup) {
    return { status: "failed", failure: enrichmentFailure("cleanup-unsupported", false) };
  }

  /*
   * The same turns the user reads and edits. Where turns do not account for
   * the whole transcript, this is a single turn holding the flat text — which
   * is correct rather than a fallback: correcting partial turns and rebuilding
   * from them would drop the words they miss.
   */
  const turns = editableTurnsFor(transcript);
  if (!turns.some((turn) => turn.text.trim())) {
    return { status: "failed", failure: enrichmentFailure("empty-transcript", false) };
  }

  let result;
  try {
    result = await provider.cleanup(
      { turns: turns.map(({ speaker, text }) => ({ speaker, text })) },
      { modelId, signal },
    );
  } catch (error) {
    if (error instanceof EnrichmentAborted) return { status: "abandoned" };
    if (error instanceof EnrichmentError) {
      return { status: "failed", failure: enrichmentFailure(error.kind, error.retryable) };
    }
    return { status: "failed", failure: enrichmentFailure("unknown", true) };
  }

  /*
   * Nothing changed is a real answer, and storing it would be worse than
   * useless: a derived Transcript identical to its parent costs the user a
   * second copy to read past and attributes the recogniser's own words to a
   * model that merely agreed with them.
   */
  if (result.changed === 0) return { status: "unchanged" };

  const corrected = turns.map((turn, index) => ({
    ...turn,
    text: result.texts[index] ?? turn.text,
  }));

  try {
    const stored = saveTranscript(
      editedTranscript(transcript, corrected, new Date(), {
        kind: "llm",
        providerId: provider.id,
        // What actually ran (§20), which a provider may have substituted.
        modelId: result.modelId,
      }),
    );
    return { status: "cleaned", transcript: stored, changed: result.changed };
  } catch {
    // The request succeeded and was billed; only the write failed.
    return { status: "failed", failure: enrichmentFailure("not-stored", true) };
  }
}
