import type { TranscriptSegment } from "@/types";

/*
 * Normalising diarized turns across providers (§3.3).
 *
 * Both providers answer the same question and disagree on every detail of how.
 * AssemblyAI labels speakers `"A"`, `"B"` and reports offsets in milliseconds;
 * Deepgram labels them `0`, `1` and reports float seconds. Neither spelling
 * belongs in the domain, so both are converted here rather than twice.
 */

/** One turn as a provider reports it, before normalising. */
export interface RawTurn {
  /** Whatever the provider calls this speaker: a letter, a number, anything. */
  speaker: string | number | null | undefined;
  text: string | null | undefined;
  /** Start offset, in the provider's own units. */
  start: number | null | undefined;
  end: number | null | undefined;
}

/**
 * Turns a provider's utterances into {@link TranscriptSegment}s.
 *
 * Speaker labels become a **0-based index in order of first appearance** rather
 * than a translation of the provider's own scheme. Mapping `"A"` to 0 by
 * arithmetic would break on a provider that numbers from 1, labels speakers
 * `"AA"` past `"Z"`, or omits one entirely; order of appearance works for any
 * scheme and guarantees dense indices, which is all the UI needs.
 *
 * @param turns The provider's utterances, in time order.
 * @param toMs Converts the provider's offsets to milliseconds.
 * @returns Segments, or undefined when there is nothing usable — which keeps
 * "not diarized" distinguishable from "one speaker throughout" (§10).
 */
export function toSegments(
  turns: RawTurn[] | null | undefined,
  toMs: (value: number) => number,
): TranscriptSegment[] | undefined {
  if (!Array.isArray(turns) || turns.length === 0) return undefined;

  /*
   * Whether any turn was actually attributed to someone.
   *
   * A provider can return turns with no `speaker` on them at all — Deepgram
   * does exactly that when `utterances` is requested without `diarize`. Those
   * are speech segments, not speaker turns, and treating them as diarization
   * would file every one of them under speaker 0: output identical to a
   * genuine single-speaker result, and a claim about who spoke that nothing
   * supports. §10 reserves absence for "not asked for or not available", and
   * this is that case.
   */
  const anyAttributed = turns.some((turn) => turn.speaker != null);
  if (!anyAttributed) return undefined;

  const indexByLabel = new Map<string, number>();
  const segments: TranscriptSegment[] = [];

  for (const turn of turns) {
    const text = typeof turn.text === "string" ? turn.text.trim() : "";
    // A turn with no words is not a turn. Providers emit these around silence,
    // and keeping them would render an empty speech bubble.
    if (!text) continue;

    /*
     * An unlabelled turn is still a turn. It gets its own bucket rather than
     * being dropped or folded into the previous speaker: losing the words
     * would be worse, and guessing the speaker is the exact thing §10 forbids.
     */
    const label = turn.speaker == null ? "" : String(turn.speaker);

    let speaker = indexByLabel.get(label);
    if (speaker === undefined) {
      speaker = indexByLabel.size;
      indexByLabel.set(label, speaker);
    }

    segments.push({
      speaker,
      text,
      startMs: msFrom(turn.start, toMs),
      endMs: msFrom(turn.end, toMs),
    });
  }

  return segments.length > 0 ? segments : undefined;
}

/** A missing or non-finite offset becomes 0 rather than NaN reaching the UI. */
function msFrom(
  value: number | null | undefined,
  toMs: (value: number) => number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(toMs(value)));
}

/** Offsets already in milliseconds (AssemblyAI). */
export const millisecondsAreMilliseconds = (value: number) => value;

/** Float seconds to milliseconds (Deepgram). */
export const secondsToMilliseconds = (value: number) => value * 1_000;

/**
 * How many distinct speakers a set of segments names.
 *
 * The interface uses this to decide whether to label speakers at all: one
 * speaker throughout is a voice memo, and tagging every line "Speaker 1" adds
 * noise without adding information.
 */
export function speakerCount(segments: TranscriptSegment[] | undefined): number {
  if (!segments || segments.length === 0) return 0;
  return new Set(segments.map((segment) => segment.speaker)).size;
}
