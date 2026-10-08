import type { EnrichmentErrorKind } from "@/providers/enrichment";

/*
 * Failure vocabulary for enrichment (§32).
 *
 * Mirrors `features/transcription/errors.ts`, and every message holds the same
 * line: the recording and the transcript are unaffected. Here that is trivially
 * true — nothing in this feature writes to either — which makes it worth saying
 * plainly, because a failure in something called "AI" invites the fear that it
 * changed something.
 *
 * One thing these messages must not do is apologise for the model. §3.7 rules
 * out AI theatre in both directions: a brief is not presented as insight, and a
 * model declining to write one is not dressed up as a glitch.
 */

export type EnrichmentFailureReason =
  | EnrichmentErrorKind
  /** No enrichment provider API key stored yet (§19). */
  | "not-configured"
  /** The transcript has no words in it, so there is nothing to read. */
  | "empty-transcript"
  /** The brief came back but could not be written to disk. */
  | "not-stored";

export interface EnrichmentFailure {
  reason: EnrichmentFailureReason;
  title: string;
  detail: string;
  /** Whether repeating the same request could succeed (§21's rule, reused). */
  retryable: boolean;
}

const FAILURES: Record<
  EnrichmentFailureReason,
  Omit<EnrichmentFailure, "reason" | "retryable">
> = {
  "not-configured": {
    title: "That provider has no API key yet",
    detail:
      "Writing a brief uses an AI provider you choose and pay for directly. Add its API key in Settings, then try again. Your transcript is unchanged.",
  },
  unauthorized: {
    title: "The provider did not accept your API key",
    detail:
      "Check the key in Settings — it may have been revoked, or belong to a different account. Nothing was written and your transcript is unchanged.",
  },
  offline: {
    title: "No internet connection",
    detail:
      "Your recording and transcript are safe on this device. Connect to the internet and try again.",
  },
  "provider-failed": {
    title: "The provider could not write a brief",
    detail:
      "The transcript was sent but no brief came back. Your transcript is unchanged, and a different model may answer differently.",
  },
  "insufficient-credit": {
    title: "Your provider account is out of credit",
    detail:
      "Briefs are billed by the AI provider you chose, directly to you — Unpocketed does not pay for them. Add credit to that account, or pick a different provider in Settings.",
  },
  "rate-limited": {
    title: "The provider is rate-limiting this key",
    detail:
      "Too many requests in a short time. Free tiers hit this quickly. Waiting a minute and trying again usually clears it.",
  },
  unavailable: {
    title: "That model is busy right now",
    detail:
      "The provider is working, but this model is in heavy demand — free tiers feel this most on the newest models. Wait a moment and try again, or pick a different model in Settings. Nothing was sent twice and nothing was charged.",
  },
  "model-unavailable": {
    title: "That model is not available on your account",
    detail:
      "The provider does not offer this model to your account — some older models stay listed and billed but are closed to new keys. Pick a different model in Settings. Nothing was sent and nothing was charged.",
  },
  "too-large": {
    title: "This transcript is too long for that model",
    detail:
      "The model cannot read the whole transcript at once. Pick a model with a larger context in Settings — your transcript is unchanged.",
  },
  unreadable: {
    title: "The provider's answer could not be read",
    detail:
      "A reply came back, but not in the shape Unpocketed expects. Your transcript is unchanged. Trying again, or a different model, may work.",
  },
  unknown: {
    title: "The brief did not finish",
    detail:
      "Something went wrong between here and the provider. Your recording and transcript are unchanged, and you can try again.",
  },
  "empty-transcript": {
    title: "There is nothing to write about",
    detail:
      "This transcript has no words in it. Nothing was sent, and nothing was charged.",
  },
  "not-stored": {
    /*
     * The one failure here that costs money. The request succeeded and was
     * billed; only the write failed. Saying "it did not finish" would be
     * cheaper to read and would mislead the user into retrying without knowing
     * they are paying twice (§32's honesty rule, and the same reasoning that
     * rewrote `interrupted-before-upload` during PR8).
     */
    title: "The brief could not be saved",
    detail:
      "The provider wrote a brief and will have charged for it, but it could not be stored on this device — there may not be enough free space. Trying again means paying for another one.",
  },
};

/** Reasons that cannot be fixed by repeating the same request. */
const NOT_RETRYABLE: EnrichmentFailureReason[] = [
  // The key is wrong or missing: retrying sends the same bad credential.
  "unauthorized",
  "not-configured",
  // The balance is empty; retrying fails identically until it is topped up.
  "insufficient-credit",
  // Repeating the request would pick the same unavailable model.
  "model-unavailable",
  // The input is the problem, and it will not change by asking again.
  "too-large",
  "empty-transcript",
];

/**
 * Builds the user-facing failure for a reason.
 *
 * @param retryable Overrides the default, for a provider error that classified
 * itself — a refusal is `provider-failed` but not worth repeating.
 */
export function enrichmentFailure(
  reason: EnrichmentFailureReason,
  retryable = !NOT_RETRYABLE.includes(reason),
): EnrichmentFailure {
  return { reason, ...FAILURES[reason], retryable };
}
