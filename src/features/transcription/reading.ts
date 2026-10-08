import { speakerCount } from "@/providers/transcription/speakers";
import type { Transcript, TranscriptSegment } from "@/types";

/*
 * How a Transcript should be read (§23).
 *
 * The rules live here rather than inside the component because they are
 * judgements about the data, not about layout, and because getting one wrong
 * loses something: show turns that do not cover the transcript and words the
 * user paid for disappear from the screen; show flat text when turns exist and
 * a conversation reads as a wall.
 */

/**
 * The share of a Transcript's words its turns must account for before they can
 * stand in for it.
 *
 * Not 100%: a provider's flat text and its own utterances are tokenised
 * separately, so a word or two of drift is ordinary. It is deliberately close
 * to 100% because the failure being guarded against is a **missing turn**,
 * which costs a whole sentence or more, not a token.
 */
const REQUIRED_COVERAGE = 0.98;

export type ReadingView =
  /** Speaker-attributed turns, which together account for the whole text. */
  | { kind: "turns"; segments: TranscriptSegment[] }
  /** The transcript as one piece of text. Always safe, never lossy. */
  | { kind: "text"; text: string };

/** Lowercased words, ignoring punctuation and spacing the two forms disagree on. */
function words(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/**
 * Whether a Transcript's turns account for its text.
 *
 * Compares as a multiset rather than by length, so a turn replaced by one of
 * the same size is still caught. A provider's utterances are *supposed* to be
 * the same transcription split up, and on every recording measured they match
 * exactly — but "supposed to" is not a guarantee worth risking a user's text on.
 *
 * @returns True when the turns can replace the text without hiding any of it.
 */
export function segmentsCoverText(
  text: string,
  segments: TranscriptSegment[] | undefined,
): boolean {
  if (!segments?.length) return false;

  const whole = words(text);
  if (whole.length === 0) return true;

  const available = new Map<string, number>();
  for (const word of words(segments.map((s) => s.text).join(" "))) {
    available.set(word, (available.get(word) ?? 0) + 1);
  }

  let accounted = 0;
  for (const word of whole) {
    const remaining = available.get(word) ?? 0;
    if (remaining > 0) {
      available.set(word, remaining - 1);
      accounted += 1;
    }
  }

  return accounted / whole.length >= REQUIRED_COVERAGE;
}

/**
 * Decides how to render a Transcript.
 *
 * Turns are used only when all three hold: they exist, they account for the
 * text, and at least two speakers were actually identified. The last is why a
 * voice memo does not read as a transcript of one person talking to themselves
 * with a label above every line.
 *
 * Falling back to text is never wrong, only less useful — which is the right
 * direction for a rule that could be wrong.
 */
export function readingViewFor(transcript: Transcript): ReadingView {
  const { segments, text } = transcript;

  if (!segments?.length) return { kind: "text", text };
  if (speakerCount(segments) < 2) return { kind: "text", text };
  if (!segmentsCoverText(text, segments)) return { kind: "text", text };

  return { kind: "turns", segments };
}
