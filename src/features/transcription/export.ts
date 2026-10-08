import type { Recording, Transcript } from "@/types";

import { groupedTurns, readingViewFor, speakerLabel } from "./reading";

/*
 * Exporting a Transcript (§3.4, §24).
 *
 * "Ownership requires a reliable exit path." Everything here is pure text
 * generation: no file writing, no share sheet, no platform. That is what lets
 * the formats be tested exactly, and the formats are the part with the
 * promises in them.
 *
 * Each format carries a different amount on purpose, and all three are driven
 * by **what the transcript actually has** rather than a fixed template — so a
 * transcript with no speaker turns exports without empty headings, and the
 * Brief sections PR 9.5 adds slot in rather than forcing a rewrite.
 */

export type ExportFormat = "txt" | "md" | "json";

export interface ExportedFile {
  /** Suggested filename, extension included. */
  name: string;
  content: string;
  mimeType: string;
}

/**
 * An absolute local timestamp, for a document that outlives the device.
 *
 * `formatRecordedAt` is deliberately not reused: it says "Yesterday, 23:10",
 * which is useful in a list and useless in a file someone opens next year.
 *
 * Built by hand rather than with `toLocaleString`, whose output varies by
 * locale and would make an export's shape depend on the phone's language.
 */
export function exportTimestamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "unknown";

  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${date} ${pad(at.getHours())}${":"}${pad(at.getMinutes())}`;
}

/** `mm:ss`, matching what the app shows, for a duration in a header. */
function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}${":"}${String(total % 60).padStart(2, "0")}`;
}

/** A filename-safe stem. Uses `\W` — a bracketed class with a colon in it
 * breaks Tailwind's content scan and with it the whole bundle. */
function slug(value: string): string {
  const cleaned = value.trim().replace(/\W+/g, "-").replace(/^-|-$/g, "");
  return cleaned.toLowerCase().slice(0, 48) || "transcript";
}

/** How a Transcript's current text came to be, in words a reader understands. */
function authorship(transcript: Transcript): string | null {
  const source = transcript.source;
  if (!source || source.kind === "provider") return null;
  if (source.kind === "user") return "by you";
  return `by ${source.providerId} ${source.modelId}`;
}

/**
 * The words, with speaker prefixes where turns exist, and nothing else.
 *
 * §3.4 calls plain text "suitable for copy/paste and simple archival", so it
 * carries no metadata at all — pasting a transcript into a message should not
 * paste a provider name with it.
 */
export function transcriptAsText(transcript: Transcript): string {
  const view = readingViewFor(transcript);
  if (view.kind === "text") return view.text;

  // Grouped, so one person talking reads as one block rather than as however
  // many pieces the provider happened to cut their speech into.
  return groupedTurns(view.segments)
    .map((block) => `${speakerLabel(block.speaker)}${":"} ${block.text}`)
    .join("\n\n");
}

/**
 * The full human-readable picture: metadata, provenance, then the transcript.
 *
 * `Provider` and `Model` state where the text came from **originally** and stay
 * accurate after an edit. `Edited` is what stops them being read as a claim
 * about the current text, and `Derived from` makes the relationship recoverable
 * from the exported file alone (§20, §24).
 */
export function transcriptAsMarkdown(
  transcript: Transcript,
  recording: Recording | null,
): string {
  const lines: string[] = [`# ${recording?.title ?? "Transcript"}`, ""];

  if (recording) {
    lines.push(`Recorded${":"} ${exportTimestamp(recording.createdAt)}`);
    lines.push(`Duration${":"} ${duration(recording.durationMs)}`);
  }
  lines.push(`Provider${":"} ${transcript.providerId}`);
  lines.push(`Model${":"} ${transcript.modelId}`);

  const edited = authorship(transcript);
  if (edited) {
    lines.push(`Edited${":"} ${exportTimestamp(transcript.updatedAt)} (${edited})`);
  }
  if (transcript.derivedFrom) {
    lines.push(`Derived from${":"} ${transcript.derivedFrom}`);
  }

  lines.push("", "## Transcript", "");

  const view = readingViewFor(transcript);
  if (view.kind === "text") {
    lines.push(view.text);
  } else {
    for (const block of groupedTurns(view.segments)) {
      lines.push(
        `**${speakerLabel(block.speaker)}** (${duration(block.startMs)})`,
        "",
        block.text,
        "",
      );
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Everything, losslessly.
 *
 * §3.4 calls JSON "complete machine-readable data", which this takes literally:
 * the Transcript is written out whole, so an export **round-trips** rather than
 * being a lossy view of one. `audioPath` is the one thing left out — it names a
 * location on a device that is not stable across installs, so carrying it would
 * export a fact that is false everywhere else.
 */
export function transcriptAsJson(
  transcript: Transcript,
  recording: Recording | null,
  exportedAt: Date,
): string {
  return JSON.stringify(
    {
      exportedAt: exportedAt.toISOString(),
      exportedBy: "Unpocketed",
      recording: recording
        ? {
            id: recording.id,
            title: recording.title,
            source: recording.source,
            mimeType: recording.mimeType,
            durationMs: recording.durationMs,
            createdAt: recording.createdAt,
            interrupted: recording.interrupted,
          }
        : null,
      transcript,
    },
    null,
    2,
  );
}

/**
 * Renders a Transcript in one format, with a filename to offer alongside it.
 *
 * @param exportedAt Supplied rather than read, so a given transcript always
 * produces the same bytes in a test.
 */
export function exportTranscript(
  transcript: Transcript,
  recording: Recording | null,
  format: ExportFormat,
  exportedAt: Date,
): ExportedFile {
  // The model is in the name because a Recording can have several transcripts
  // and they would otherwise land in a downloads folder as near-identical files.
  const stem = `${slug(recording?.title ?? "transcript")}-${slug(transcript.modelId)}`;

  if (format === "txt") {
    return {
      name: `${stem}.txt`,
      content: transcriptAsText(transcript),
      mimeType: "text/plain",
    };
  }

  if (format === "md") {
    return {
      name: `${stem}.md`,
      content: transcriptAsMarkdown(transcript, recording),
      mimeType: "text/markdown",
    };
  }

  return {
    name: `${stem}.json`,
    content: transcriptAsJson(transcript, recording, exportedAt),
    mimeType: "application/json",
  };
}
