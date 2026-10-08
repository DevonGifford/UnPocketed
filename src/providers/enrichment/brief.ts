import type { BriefContent, EnrichmentInput } from "./types";
import { EnrichmentError } from "./types";

/*
 * What every provider asks for, and how their answers are read back.
 *
 * The prompt and the schema live here rather than in each adapter because they
 * define what a Brief *is*. A provider decides how to send a request; it does
 * not get to decide that its Briefs have a different shape, or §22's comparison
 * would be measuring the prompt rather than the model.
 */

/**
 * The JSON Schema every provider constrains its output to.
 *
 * **`title` and `summary` are required; nothing else is**, and that balance was
 * corrected after the first live run rather than reasoned out in advance.
 *
 * It began with nothing required at all, on the grounds that §3.7 forbids the
 * appearance of substance where there is none. Gemini's first real Brief came
 * back with a title and **every other field omitted** — a technically honest
 * answer and a useless one. The instruction to omit rather than invent was
 * written for a *conclusion a recording never reaches*, and it had been applied
 * to a summary of a transcript that plainly had one.
 *
 * So the line sits here instead: a transcript with words in it can always be
 * titled and summarised, and a model saying otherwise is declining the task
 * rather than being careful. An overview, a conclusion and a speaker's name are
 * genuinely contingent, and stay optional — which is what §3.7 was protecting.
 *
 * `additionalProperties: false` because the providers that support strict
 * schema validation require it, and because a field this app does not
 * understand is one it would silently drop anyway.
 */
export const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary"],
  properties: {
    title: {
      type: "string",
      description:
        "A short specific title for this recording, under 60 characters. No generic titles like 'Meeting Notes'.",
    },
    headline: {
      type: "string",
      description:
        "One sentence saying what this recording is actually about. Always write one for a transcript that has any content.",
    },
    summary: {
      type: "string",
      description:
        "An executive summary of two to four sentences, covering what was decided or concluded.",
    },
    overview: {
      type: "string",
      description:
        "A longer prose overview of what was discussed, in the order it was discussed. Write one whenever the recording covers more than a single point.",
    },
    conclusion: {
      type: "string",
      description:
        "What was concluded, agreed, or left open. Omit entirely if the recording reaches no conclusion.",
    },
    /*
     * An array of pairs rather than an object keyed by speaker number.
     *
     * A map would need `additionalProperties` to type its values, and Google's
     * schema subset is OpenAPI-derived and does not reliably accept it. An
     * array of objects is supported everywhere, so this is the shape that
     * survives all three providers without a per-provider schema.
     */
    speakerNames: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          speaker: {
            type: "integer",
            description: "The speaker number as shown in the transcript.",
          },
          name: { type: "string" },
        },
        required: ["speaker", "name"],
      },
      description:
        "Names for speakers, only where the transcript states or clearly implies them. Omit any speaker whose name is not evident, and omit this field entirely if no name is.",
    },
  },
} as const;

/**
 * The instruction every provider sends.
 *
 * Three rules in it are not stylistic, and changing them changes what the app
 * promises:
 *
 * - **Omit rather than invent — but omission has a floor.** §3.7's "no AI
 *   theatre" fails first at the moment a model writes a confident summary of a
 *   recording it did not understand, so an empty field beats a padded one. The
 *   first live run showed the opposite failure just as clearly: given blanket
 *   permission to omit, a model returned a title and nothing else. The rule now
 *   names what is always producible from words on a page and what genuinely is
 *   not, instead of leaving the model to decide the whole thing is beyond it.
 * - **No speaker numbers in the prose.** Reading real output showed briefs
 *   written as "Speaker 2 welcomes returning guest Nightwolf Hawk" — half
 *   named, half labelled, and meaningless away from the transcript the number
 *   came from. A brief is read on its own.
 * - **Do not reassign speakers.** The recogniser's diarization decided who
 *   spoke. An LLM reading flat text can only guess at boundaries, and a
 *   confident guess is worse than no answer (§10).
 * - **Do not editorialise.** A Brief describes the recording; it does not
 *   advise the user about it.
 */
export const BRIEF_SYSTEM_PROMPT = [
  "You read a transcript of a recording and produce a structured brief about it.",
  "",
  "Rules:",
  "- Always write a title and a summary. Any transcript with words in it can be titled and summarised; returning neither is declining the task, not being careful.",
  "- Write a headline for any transcript with content, and an overview whenever the recording covers more than one point.",
  "- Omit a conclusion if the recording reaches none, and omit a speaker's name if the transcript does not give it. Those are the fields that are genuinely allowed to be missing.",
  "- Beyond that, write only what the transcript supports. Do not pad a field with something vague or generic to fill it. An honest short answer beats an invented long one.",
  "- Speaker numbers were assigned by a speech recognition system that separated the voices. Never reassign speech to a different speaker, and never introduce a speaker that is not in the transcript.",
  "- Name a speaker only where the transcript states or clearly implies their name. If no name is evident, leave that speaker unnamed.",
  "- In the brief's own prose, refer to people by name where you have one, and otherwise by what they are doing \u2014 the host, the interviewer, the second voice. Do not write \"Speaker 2\" in a sentence: the brief is read on its own, where a speaker number means nothing.",
  "- Describe the recording. Do not give the reader advice, and do not comment on the recording's quality.",
  "- Write in the same language as the transcript.",
  "- Be concrete. Prefer what was actually said over characterising it.",
].join("\n");

/** The user-side content: the transcript, with the little context a model needs. */
export function briefPrompt(input: EnrichmentInput): string {
  const speakers =
    input.speakers.length > 1
      ? `This recording has ${input.speakers.length} speakers, numbered ${input.speakers
          .map((speaker) => speaker + 1)
          .join(", ")}.`
      : "This recording has a single speaker, or speakers were not separated.";

  return [speakers, "", "Transcript:", "", input.text].join("\n");
}

/**
 * A rough token count, for the context-window guard.
 *
 * Four characters per token is the usual English approximation and is wrong in
 * both directions — but it only has to be right enough to catch a transcript
 * that cannot possibly fit, and an hour of speech is about 13,000 tokens
 * against context windows of 200,000 and up. A provider's own error is the
 * backstop if this under-counts.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function trimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Narrows a provider's parsed JSON into a {@link BriefContent}.
 *
 * Hand-written rather than trusted, because this is a model's output: a schema
 * constrains it but does not guarantee it, and a provider that silently ignores
 * the schema would otherwise put arbitrary values into a stored record.
 *
 * An empty string is read as an **absent** field, not an empty one — a model
 * that writes `""` for a conclusion it could not draw means the same thing as
 * one that omits it, and §10 keeps absence meaningful.
 *
 * @throws {EnrichmentError} When nothing usable came back at all, which is a
 * failed request rather than an empty Brief.
 */
export function readBriefContent(raw: unknown): BriefContent {
  if (typeof raw !== "object" || raw === null) {
    throw new EnrichmentError(
      "unreadable",
      "The provider did not return a brief this app can read.",
    );
  }

  const record = raw as Record<string, unknown>;
  const content: BriefContent = {};

  const title = trimmed(record.title);
  if (title) content.title = title;
  const headline = trimmed(record.headline);
  if (headline) content.headline = headline;
  const summary = trimmed(record.summary);
  if (summary) content.summary = summary;
  const overview = trimmed(record.overview);
  if (overview) content.overview = overview;
  const conclusion = trimmed(record.conclusion);
  if (conclusion) content.conclusion = conclusion;

  const names = readSpeakerNames(record.speakerNames);
  if (names) content.speakerNames = names;

  if (Object.keys(content).length === 0) {
    throw new EnrichmentError(
      "unreadable",
      "The provider returned an empty brief.",
    );
  }

  return content;
}

/**
 * Speaker names, re-keyed to the index the recogniser assigned.
 *
 * The model is shown speaker *numbers* starting at 1, because that is what the
 * user sees, while segments are indexed from 0. Converting here keeps the
 * off-by-one in the one place that knows about both.
 */
function readSpeakerNames(raw: unknown): Record<number, string> | undefined {
  if (!Array.isArray(raw)) return undefined;

  const names: Record<number, string> = {};
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const pair = entry as { speaker?: unknown; name?: unknown };

    const name = trimmed(pair.name);
    if (!name) continue;

    const shown = typeof pair.speaker === "number" ? pair.speaker : Number(pair.speaker);
    if (!Number.isInteger(shown) || shown < 1) continue;

    names[shown - 1] = name;
  }

  return Object.keys(names).length > 0 ? names : undefined;
}
