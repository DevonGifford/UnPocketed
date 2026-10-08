import {
  BRIEF_SCHEMA,
  BRIEF_SYSTEM_PROMPT,
  briefPrompt,
  estimateTokens,
  readBriefContent,
} from "./brief";
import { EnrichmentError } from "./types";

const input = (text: string, speakers: number[] = []) => ({
  text,
  speakers,
  estimatedTokens: estimateTokens(text),
});

describe("readBriefContent", () => {
  it("reads the fields a model returned", () => {
    expect(
      readBriefContent({
        title: "Energy belt interview",
        summary: "A host interviews a returning guest.",
      }),
    ).toEqual({
      title: "Energy belt interview",
      summary: "A host interviews a returning guest.",
    });
  });

  /*
   * §3.7: an omitted field must stay omitted. A model that writes "" for a
   * conclusion it could not draw means the same as one that leaves it out, and
   * storing an empty string would put a heading over nothing in the UI.
   */
  it("treats an empty or blank field as absent", () => {
    const content = readBriefContent({
      title: "Kept",
      conclusion: "",
      overview: "   ",
    });
    expect(content).toEqual({ title: "Kept" });
    expect("conclusion" in content).toBe(false);
  });

  it("ignores fields it does not understand", () => {
    expect(readBriefContent({ title: "Kept", sentiment: "positive" })).toEqual({
      title: "Kept",
    });
  });

  it("converts speaker numbers back to segment indices", () => {
    // The model is shown "Speaker 1"; segments are indexed from zero.
    expect(
      readBriefContent({
        speakerNames: [
          { speaker: 1, name: "Sam" },
          { speaker: 2, name: "Alex" },
        ],
      }).speakerNames,
    ).toEqual({ 0: "Sam", 1: "Alex" });
  });

  it("drops speaker names that are not usable", () => {
    expect(
      readBriefContent({
        title: "Kept",
        speakerNames: [
          { speaker: 1, name: "Sam" },
          { speaker: 0, name: "Impossible" },
          { speaker: "x", name: "No" },
          { speaker: 2, name: "   " },
          "not an object",
        ],
      }).speakerNames,
    ).toEqual({ 0: "Sam" });
  });

  it("omits speakerNames entirely when none survived", () => {
    const content = readBriefContent({ title: "Kept", speakerNames: [] });
    expect("speakerNames" in content).toBe(false);
  });

  it("ignores a speakerNames object, which no provider should send", () => {
    const content = readBriefContent({ title: "Kept", speakerNames: { "1": "Sam" } });
    expect("speakerNames" in content).toBe(false);
  });

  it("raises when nothing came back at all", () => {
    // An empty brief is a failed request, not a brief with no content.
    expect(() => readBriefContent({})).toThrow(EnrichmentError);
    expect(() => readBriefContent(null)).toThrow(EnrichmentError);
    expect(() => readBriefContent("a string")).toThrow(EnrichmentError);
  });

  it("raises rather than storing a brief of only blank fields", () => {
    expect(() => readBriefContent({ title: "", summary: "   " })).toThrow(
      EnrichmentError,
    );
  });
});

describe("BRIEF_SCHEMA", () => {
  /*
   * The balance corrected after the first live run. Blanket permission to omit
   * produced a Brief with a title and nothing else — honest, and useless.
   */
  it("requires the two fields any transcript with words can supply", () => {
    expect(BRIEF_SCHEMA.required).toEqual(["title", "summary"]);
  });

  it("leaves genuinely contingent fields optional", () => {
    // A recording may reach no conclusion, and a transcript may name nobody.
    for (const field of ["conclusion", "speakerNames"]) {
      expect(BRIEF_SCHEMA.required).not.toContain(field);
    }
  });
});

describe("BRIEF_SYSTEM_PROMPT", () => {
  it("tells the model which fields may be left out, rather than all of them", () => {
    expect(BRIEF_SYSTEM_PROMPT).toContain("Always write a title and a summary");
    expect(BRIEF_SYSTEM_PROMPT).toContain("Omit a conclusion");
  });

  /*
   * From reading real output: briefs came back written as "Speaker 2 welcomes
   * returning guest Nightwolf Hawk" — half named, half labelled, and
   * meaningless away from the transcript the number came from.
   */
  it("forbids speaker numbers in the brief's own prose", () => {
    expect(BRIEF_SYSTEM_PROMPT).toContain('Do not write "Speaker 2" in a sentence');
  });

  it("still forbids padding", () => {
    expect(BRIEF_SYSTEM_PROMPT).toContain("Do not pad");
  });

  // §10: the recogniser decided who spoke. An LLM reading flat text can only
  // guess at boundaries, and a confident guess is worse than no answer.
  it("forbids reassigning speakers", () => {
    expect(BRIEF_SYSTEM_PROMPT).toContain("Never reassign speech");
  });
});

describe("briefPrompt", () => {
  it("tells the model how many speakers the recogniser separated", () => {
    expect(briefPrompt(input("Hello.", [0, 1]))).toContain(
      "2 speakers, numbered 1, 2",
    );
  });

  it("says so when there was no diarization", () => {
    expect(briefPrompt(input("Hello."))).toContain("single speaker");
  });

  it("carries the transcript itself", () => {
    expect(briefPrompt(input("The actual words."))).toContain("The actual words.");
  });
});

describe("estimateTokens", () => {
  it("is in the right order of magnitude for an hour of speech", () => {
    // ~10,000 words is roughly 13,000 tokens; this only has to be close enough
    // to catch a transcript that could not possibly fit a context window.
    const hour = "word ".repeat(10_000);
    const estimate = estimateTokens(hour);
    expect(estimate).toBeGreaterThan(8_000);
    expect(estimate).toBeLessThan(20_000);
  });
});
