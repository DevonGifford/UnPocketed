import { applyCleanup, cleanupPrompt, CLEANUP_SYSTEM_PROMPT } from "./cleanup";
import { EnrichmentError } from "./types";

const ORIGINAL = ["Hello their.", "How are you?", "Fine thanks."];
const reply = (turns: unknown) => JSON.stringify({ turns });

describe("applyCleanup", () => {
  it("applies corrections by turn number", () => {
    const { texts, changed } = applyCleanup(
      ORIGINAL,
      reply([
        { turn: 0, text: "Hello there." },
        { turn: 1, text: "How are you?" },
        { turn: 2, text: "Fine, thanks." },
      ]),
    );
    expect(texts).toEqual(["Hello there.", "How are you?", "Fine, thanks."]);
    expect(changed).toBe(2);
  });

  /*
   * The originals are the shape of the answer, not the model's reply. Every
   * case below is a model misbehaving in a way that could damage a transcript,
   * and every one degrades to "no change" instead.
   */
  it("keeps the original for a turn the model did not return", () => {
    const { texts, changed } = applyCleanup(
      ORIGINAL,
      reply([{ turn: 1, text: "How are you doing?" }]),
    );
    expect(texts[0]).toBe("Hello their.");
    expect(texts[2]).toBe("Fine thanks.");
    expect(changed).toBe(1);
  });

  it("ignores a turn number that does not exist", () => {
    // A model inventing a fourth turn cannot add one.
    const { texts } = applyCleanup(ORIGINAL, reply([{ turn: 9, text: "Invented." }]));
    expect(texts).toEqual(ORIGINAL);
  });

  it("never lets a correction empty a turn", () => {
    // Deleting a speaker's words is not a correction.
    const { texts } = applyCleanup(
      ORIGINAL,
      reply([{ turn: 0, text: "   " }, { turn: 1, text: "" }]),
    );
    expect(texts).toEqual(ORIGINAL);
  });

  it("takes the first answer when a turn is returned twice", () => {
    const { texts } = applyCleanup(
      ORIGINAL,
      reply([
        { turn: 0, text: "Hello there." },
        { turn: 0, text: "Something else entirely." },
      ]),
    );
    expect(texts[0]).toBe("Hello there.");
  });

  it("cannot change the number of turns", () => {
    // Merging or splitting would move words between speakers, which §10 forbids.
    const { texts } = applyCleanup(
      ORIGINAL,
      reply([{ turn: 0, text: "Hello there. How are you?" }]),
    );
    expect(texts).toHaveLength(3);
    expect(texts[1]).toBe("How are you?");
  });

  it("reports nothing changed when the model returns the same words", () => {
    const { changed } = applyCleanup(
      ORIGINAL,
      reply(ORIGINAL.map((text, turn) => ({ turn, text }))),
    );
    expect(changed).toBe(0);
  });

  it("raises when the response is not readable at all", () => {
    expect(() => applyCleanup(ORIGINAL, "<html>502</html>")).toThrow(EnrichmentError);
    expect(() => applyCleanup(ORIGINAL, JSON.stringify({}))).toThrow(EnrichmentError);
  });
});

describe("cleanupPrompt", () => {
  it("numbers the turns and says how many to return", () => {
    const prompt = cleanupPrompt([
      { speaker: 0, text: "Hello their." },
      { speaker: 1, text: "How are you?" },
    ]);
    expect(prompt).toContain("Return exactly 2 entries, numbered 0 to 1");
    expect(prompt).toContain("[0] (speaker 1) Hello their.");
    expect(prompt).toContain("[1] (speaker 2) How are you?");
  });

  it("marks an unattributed turn as such rather than numbering it", () => {
    expect(cleanupPrompt([{ speaker: null, text: "Who said this?" }])).toContain(
      "(unattributed)",
    );
  });
});

describe("CLEANUP_SYSTEM_PROMPT", () => {
  /*
   * A model asked to "improve" a transcript rewrites it into something tidier
   * and less true. §3.2's instinct about original audio applies to the
   * recogniser's words: this is a correction pass, not an editor.
   */
  it("forbids summarising or improving the writing", () => {
    expect(CLEANUP_SYSTEM_PROMPT).toContain("You are not an editor");
    expect(CLEANUP_SYSTEM_PROMPT).toContain("Do not summarise");
  });

  it("tells the model to keep false starts and filler", () => {
    expect(CLEANUP_SYSTEM_PROMPT).toContain("Keep false starts");
  });

  it("forbids moving words between speakers", () => {
    expect(CLEANUP_SYSTEM_PROMPT).toContain("never move words between them");
  });
});
