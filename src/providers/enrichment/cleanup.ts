import { EnrichmentError } from "./types";

/*
 * Asking a model to clean up a transcript's wording.
 *
 * The rule that shapes every decision here: **the model rewrites words, never
 * boundaries.** Diarization decided who spoke and when; an LLM reading text can
 * only guess at that, and a confident guess is worse than no answer (§10). So
 * it is given numbered turns and must return the same numbers back — it cannot
 * merge two turns, split one, move a sentence between speakers, or add a turn
 * that was not there.
 *
 * Enforced rather than requested. `applyCleanup` maps answers onto the original
 * turns by index and keeps the original wherever the model did not return a
 * usable one, so even a model that ignores the instruction cannot damage the
 * structure — the worst it can do is leave a turn as the recogniser wrote it.
 */

/** The JSON Schema a cleanup response is constrained to. */
export const CLEANUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["turns"],
  properties: {
    turns: {
      type: "array",
      description:
        "One entry for each numbered turn you were given, in the same order, with the same numbers.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["turn", "text"],
        properties: {
          turn: {
            type: "integer",
            description: "The turn number exactly as it was given to you.",
          },
          text: {
            type: "string",
            description: "That turn's words, corrected. Never empty.",
          },
        },
      },
    },
  },
} as const;

/**
 * The instruction. Narrow on purpose.
 *
 * A model asked to "improve" a transcript will rewrite it into something
 * tidier and less true — dropping the hesitations and restarts that are
 * evidence of how something was actually said. §3.2's instinct about the
 * original audio applies to the recogniser's words too: this is a correction
 * pass, not an editor.
 */
export const CLEANUP_SYSTEM_PROMPT = [
  "You correct mistakes a speech recognition system made in a transcript. You are not an editor.",
  "",
  "Rules:",
  "- Fix misheard words, wrong homophones, mangled names and missing punctuation. Use the surrounding conversation to work out what was actually said.",
  "- Return one entry for every turn you are given, with the same turn numbers, in the same order. Never merge, split, reorder or add turns, and never move words between them — a speech recognition system decided who spoke, and you cannot hear the audio.",
  "- Keep the speaker's own words and register. Do not summarise, shorten, formalise or improve the writing.",
  "- Keep false starts, repetitions and filler where they were spoken. They are part of what was said, not errors to remove.",
  "- If a turn has nothing wrong with it, return it unchanged.",
  "- Never invent content. If a passage is garbled beyond recovery, leave it as it is rather than guessing at it.",
].join("\n");

/** Numbers each turn so the model can return answers against them. */
export function cleanupPrompt(turns: { speaker: number | null; text: string }[]): string {
  const numbered = turns
    .map((turn, index) => {
      const who =
        turn.speaker === null ? "unattributed" : `speaker ${turn.speaker + 1}`;
      return `[${index}] (${who}) ${turn.text}`;
    })
    .join("\n\n");

  return [
    `Correct the following ${turns.length} turns. Return exactly ${turns.length} entries, numbered 0 to ${turns.length - 1}.`,
    "",
    numbered,
  ].join("\n");
}

interface CleanupResponse {
  turns?: { turn?: unknown; text?: unknown }[];
}

/**
 * Applies a model's corrections onto the original turns.
 *
 * **The originals are the shape of the answer**, not the model's reply. Each
 * corrected turn is matched by index; anything missing, out of range,
 * duplicated or empty leaves that turn exactly as the recogniser produced it.
 * A model that returns nonsense therefore degrades to no change, never to a
 * damaged transcript.
 *
 * @returns The corrected text per turn, in the original order, and how many
 * turns actually changed — so a caller can tell a real pass from a no-op.
 * @throws {EnrichmentError} If the response cannot be read at all.
 */
export function applyCleanup(
  original: string[],
  body: string,
): { texts: string[]; changed: number } {
  let parsed: CleanupResponse;
  try {
    parsed = JSON.parse(body) as CleanupResponse;
  } catch (error) {
    throw new EnrichmentError(
      "unreadable",
      "The provider's corrections could not be read.",
      { cause: error },
    );
  }

  if (!Array.isArray(parsed.turns)) {
    throw new EnrichmentError(
      "unreadable",
      "The provider answered without any corrected turns.",
    );
  }

  const texts = [...original];
  const seen = new Set<number>();
  let changed = 0;

  for (const entry of parsed.turns) {
    if (typeof entry !== "object" || entry === null) continue;

    const index =
      typeof entry.turn === "number" ? entry.turn : Number(entry.turn);
    if (!Number.isInteger(index) || index < 0 || index >= original.length) {
      continue;
    }
    // A repeated index is a model losing track; the first answer stands.
    if (seen.has(index)) continue;

    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    // An empty correction would delete a turn's words, which no correction
    // pass is allowed to do.
    if (!text) continue;

    seen.add(index);
    if (text !== original[index]) changed += 1;
    texts[index] = text;
  }

  return { texts, changed };
}
