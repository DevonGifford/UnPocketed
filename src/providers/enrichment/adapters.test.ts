import { kindForStatus as anthropicKind, readMessagesResponse } from "./anthropic";
import { kindForStatus as geminiKind, readInteractionResponse } from "./gemini";
import { EnrichmentError } from "./types";

const BRIEF = {
  title: "Energy belt interview",
  summary: "A host interviews a returning guest.",
  speakerNames: [{ speaker: 1, name: "Sam" }],
};

/*
 * The two providers agree on nothing but the question, which is why Gemini was
 * chosen second. These tests assert that both shapes converge on one result —
 * if they ever diverge, §3.3's abstraction has sprung a leak.
 */
describe("readMessagesResponse (Anthropic)", () => {
  const body = (extra: object = {}) =>
    JSON.stringify({
      model: "claude-opus-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(BRIEF) }],
      ...extra,
    });

  it("reads the brief out of the content blocks", () => {
    const result = readMessagesResponse(body(), "claude-opus-5");
    expect(result.content.title).toBe("Energy belt interview");
    expect(result.content.speakerNames).toEqual({ 0: "Sam" });
    expect(result.modelId).toBe("claude-opus-5");
  });

  // Thinking blocks precede the answer, so position is not a safe way to find it.
  it("finds the text block even when it is not first", () => {
    const withThinking = JSON.stringify({
      model: "claude-opus-5",
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: JSON.stringify(BRIEF) },
      ],
    });
    expect(readMessagesResponse(withThinking, "claude-opus-5").content.title).toBe(
      "Energy belt interview",
    );
  });

  /*
   * A refusal arrives as HTTP 200, so it has to be checked before the content
   * is read or it looks like an empty answer. Recordings are whatever the user
   * recorded, so this is an ordinary outcome rather than an edge case.
   */
  it("treats a refusal as a non-retryable failure, not an empty brief", () => {
    let thrown: EnrichmentError | null = null;
    try {
      readMessagesResponse(body({ stop_reason: "refusal", content: [] }), "claude-opus-5");
    } catch (error) {
      thrown = error as EnrichmentError;
    }
    expect(thrown?.kind).toBe("provider-failed");
    expect(thrown?.retryable).toBe(false);
  });

  it("reports a truncated answer rather than storing half a brief", () => {
    expect(() =>
      readMessagesResponse(body({ stop_reason: "max_tokens" }), "claude-opus-5"),
    ).toThrow(EnrichmentError);
  });

  it("records the model that actually ran", () => {
    expect(
      readMessagesResponse(body({ model: "claude-haiku-4-5" }), "claude-opus-5").modelId,
    ).toBe("claude-haiku-4-5");
  });

  it("raises on a response that is not JSON", () => {
    expect(() => readMessagesResponse("<html>502</html>", "claude-opus-5")).toThrow(
      EnrichmentError,
    );
  });
});

describe("readInteractionResponse (Gemini)", () => {
  const body = (extra: object = {}) =>
    JSON.stringify({
      model: "gemini-3.8-flash",
      status: "completed",
      steps: [
        { type: "model_output", content: [{ type: "text", text: JSON.stringify(BRIEF) }] },
      ],
      ...extra,
    });

  it("reads the brief out of the nested steps", () => {
    const result = readInteractionResponse(body(), "gemini-3.8-flash");
    expect(result.content.title).toBe("Energy belt interview");
    expect(result.content.speakerNames).toEqual({ 0: "Sam" });
  });

  it("skips steps and blocks that are not the model's text", () => {
    const noisy = JSON.stringify({
      model: "gemini-3.8-flash",
      status: "completed",
      steps: [
        { type: "tool_call", content: [{ type: "text", text: "not the answer" }] },
        { type: "model_output", content: [{ type: "image" }, { type: "text", text: JSON.stringify(BRIEF) }] },
      ],
    });
    expect(readInteractionResponse(noisy, "gemini-3.8-flash").content.title).toBe(
      "Energy belt interview",
    );
  });

  it("reports a truncated interaction", () => {
    expect(() =>
      readInteractionResponse(body({ status: "incomplete" }), "gemini-3.8-flash"),
    ).toThrow(EnrichmentError);
  });

  it("reports a failed interaction", () => {
    expect(() =>
      readInteractionResponse(body({ status: "failed" }), "gemini-3.8-flash"),
    ).toThrow(EnrichmentError);
  });

  /*
   * The point of the abstraction: two completely different wire shapes, one
   * domain object. If this ever fails, something leaked.
   */
  it("produces the same brief Anthropic's shape does", () => {
    const fromAnthropic = readMessagesResponse(
      JSON.stringify({
        model: "claude-opus-5",
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(BRIEF) }],
      }),
      "claude-opus-5",
    );
    const fromGemini = readInteractionResponse(body(), "gemini-3.8-flash");
    expect(fromGemini.content).toEqual(fromAnthropic.content);
  });
});

describe("status mapping", () => {
  it("agrees on what the user can act on", () => {
    for (const kind of [anthropicKind, geminiKind]) {
      expect(kind(401)).toBe("unauthorized");
      expect(kind(403)).toBe("unauthorized");
      expect(kind(429)).toBe("rate-limited");
      expect(kind(500)).toBe("provider-failed");
    }
  });

  it("makes a rate limit retryable and a bad key not", () => {
    expect(new EnrichmentError("rate-limited", "…").retryable).toBe(true);
    expect(new EnrichmentError("unauthorized", "…").retryable).toBe(false);
    expect(new EnrichmentError("too-large", "…").retryable).toBe(false);
  });
});
