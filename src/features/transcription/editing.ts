import type { Transcript, TranscriptSegment, TranscriptSource } from "@/types";

import { readingViewFor } from "./reading";
import { derivedTranscriptId } from "./storage";

/*
 * Editing a Transcript (§23, ticket 03).
 *
 * The rule the whole file turns on: **an edit never changes the Provider's
 * output**. It produces a Transcript of its own, carrying the origin of the one
 * it came from and naming whoever wrote the words that are there now. Without
 * that, a record still claiming `modelId: universal-2` would hold text that
 * model never produced, and §22's comparison would quietly stop meaning
 * anything — you could no longer tell whether you were comparing two models or
 * one model and one careful proofread.
 *
 * Editing an already-derived Transcript updates it in place rather than making
 * a third. Once something other than the recogniser owns the text there is no
 * further provenance to protect, so one derived Transcript per author is enough.
 */

/** One turn as it is being edited. Mirrors a segment, minus the commitment. */
export interface EditableTurn {
  /** Null where the Provider did not attribute this turn; never invented here. */
  speaker: number | null;
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * The turns to put in front of the user.
 *
 * Follows {@link readingViewFor} rather than the raw segments, so the user
 * edits **what they were reading**. That matters for more than consistency: if
 * turns do not account for the whole transcript, editing them and regenerating
 * the text from them would delete the uncovered words. Falling back to a single
 * turn holding the whole text cannot lose anything.
 *
 * @returns One turn per segment, or a single turn holding the whole transcript.
 */
export function editableTurnsFor(transcript: Transcript): EditableTurn[] {
  const view = readingViewFor(transcript);

  if (view.kind === "turns") {
    return view.segments.map((segment) => ({ ...segment }));
  }

  return [{ speaker: null, text: view.text, startMs: 0, endMs: 0 }];
}

/** Whether anything was actually changed, so an untouched save does nothing. */
export function turnsChanged(
  original: EditableTurn[],
  edited: EditableTurn[],
): boolean {
  if (original.length !== edited.length) return true;
  return original.some((turn, index) => turn.text !== edited[index].text);
}

/** Joins turns back into the flat text §3.4 promises every Transcript has. */
function textFrom(turns: EditableTurn[]): string {
  return turns
    .map((turn) => turn.text.trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

/**
 * Turns edited turns into the Transcript to store.
 *
 * Pure: it decides what the record should be and leaves writing it to the
 * caller, which is what lets the decision be tested without a filesystem.
 *
 * @param editing The Transcript the user has open. If it is already theirs,
 * the result updates it; otherwise the result is a new Transcript derived from
 * it, and `editing` is left exactly as the Provider produced it.
 * @param turns The edited turns, in order.
 * @param now Supplied rather than read, so the result is testable.
 * @returns The Transcript to save.
 */
export function editedTranscript(
  editing: Transcript,
  turns: EditableTurn[],
  now: Date,
): Transcript {
  const source: TranscriptSource = { kind: "user" };
  const timestamp = now.toISOString();

  /*
   * Segments are kept only where the user was editing turns. A single-turn
   * edit of a flat transcript must not invent a one-speaker segment list: §10
   * reserves absence for "not asked for or not available", and a fabricated
   * segment would claim diarization happened.
   */
  const editedSegments: TranscriptSegment[] | undefined =
    turns.length > 1 || turns[0]?.speaker !== null
      ? turns.map((turn) => ({
          speaker: turn.speaker,
          text: turn.text.trim(),
          startMs: turn.startMs,
          endMs: turn.endMs,
        }))
      : undefined;

  const alreadyMine = editing.source?.kind === "user";

  return {
    // Editing their own edit again lands on the same record.
    id: alreadyMine ? editing.id : derivedTranscriptId(editing.id, source),
    recordingId: editing.recordingId,
    // Origin, carried forward unchanged: this text began as that model's work
    // however much of it survives (§20).
    providerId: editing.providerId,
    modelId: editing.modelId,
    text: textFrom(turns),
    ...(editedSegments ? { segments: editedSegments } : {}),
    source,
    // One link deep. An edit of an edit keeps pointing at the Provider's
    // original, never at the intermediate copy.
    derivedFrom: alreadyMine ? editing.derivedFrom : editing.id,
    createdAt: alreadyMine ? editing.createdAt : timestamp,
    updatedAt: timestamp,
  };
}

/** Whether this Transcript is the Provider's own words, untouched. */
export function isProviderOutput(transcript: Transcript): boolean {
  return (transcript.source?.kind ?? "provider") === "provider";
}
