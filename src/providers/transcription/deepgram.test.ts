import {
  kindForStatus,
  messageForStatus,
  readListenResponse,
} from "./deepgram";
import { TranscriptionError } from "./types";

/*
 * Deepgram's response shape, taken verbatim from its documented example on
 * 2026-10-08. The point of copying it rather than inventing one is that the
 * nesting *is* the thing under test: PR7 was caught out by an API shape it
 * assumed, so this file is the record of what the shape actually is.
 */
const documentedResponse = JSON.stringify({
  metadata: {
    transaction_key: "deprecated",
    request_id: "2479c8c8-8185-40ac-9ac6-f0874419f793",
    created: "2024-02-06T19:56:16.180Z",
    duration: 25.933313,
    channels: 1,
    models: ["30089e05-99d1-4376-b32e-c263170674af"],
    model_info: {
      "30089e05-99d1-4376-b32e-c263170674af": {
        name: "2-general-nova",
        version: "2024-01-09.29447",
        arch: "nova-3",
      },
    },
  },
  results: {
    channels: [
      { alternatives: [{ transcript: "Hello from the other side." }] },
    ],
  },
});

describe("readListenResponse", () => {
  it("finds the transcript four levels down", () => {
    expect(readListenResponse(documentedResponse, "nova-3").text).toBe(
      "Hello from the other side.",
    );
  });

  /*
   * §20: a Transcript must be able to say which model produced it. `arch` is
   * the field that answers in the user's own vocabulary — `name` would record
   * `2-general-nova` for a request that asked for `nova-3`.
   */
  it("attributes the model from arch, not name", () => {
    expect(readListenResponse(documentedResponse, "nova-2").modelId).toBe(
      "nova-3",
    );
  });

  it("falls back to the requested model when attribution is absent", () => {
    const body = JSON.stringify({
      results: { channels: [{ alternatives: [{ transcript: "…" }] }] },
    });
    expect(readListenResponse(body, "nova-3").modelId).toBe("nova-3");
  });

  it("keeps an empty transcript rather than calling it a failure", () => {
    // Silence is a legitimate answer, and §3.2 would rather store an empty
    // transcript than discard a result the user paid for.
    const body = JSON.stringify({
      results: { channels: [{ alternatives: [{ transcript: "" }] }] },
    });
    expect(readListenResponse(body, "nova-3").text).toBe("");
  });

  it("raises an unknown failure when the body is not JSON", () => {
    expect(() => readListenResponse("<html>502</html>", "nova-3")).toThrow(
      TranscriptionError,
    );
  });

  it("raises an unknown failure when the response carries no transcript", () => {
    expect(() => readListenResponse(JSON.stringify({ results: {} }), "nova-3"))
      .toThrow(TranscriptionError);
  });
});

describe("kindForStatus", () => {
  it("treats a bad key and an unavailable model as fixable in Settings", () => {
    expect(kindForStatus(401)).toBe("unauthorized");
    expect(kindForStatus(403)).toBe("unauthorized");
  });

  /*
   * The case that earned a new error kind. Under bring-your-own-key the balance
   * is the user's, so "out of credit" has an owner and an action — and neither
   * `unauthorized` (the key is fine) nor `provider-failed` (the request is
   * fine) can say so.
   */
  it("distinguishes an empty account from a bad key", () => {
    expect(kindForStatus(402)).toBe("insufficient-credit");
  });

  it("treats a cut-off upload as a connectivity failure", () => {
    expect(kindForStatus(422)).toBe("offline");
  });

  it("treats the size refusal as terminal", () => {
    expect(kindForStatus(413)).toBe("too-large");
  });

  it("falls back to a provider failure", () => {
    expect(kindForStatus(500)).toBe("provider-failed");
    expect(kindForStatus(503)).toBe("provider-failed");
    expect(kindForStatus(504)).toBe("provider-failed");
  });
});

describe("messageForStatus", () => {
  /*
   * A 504 here is not a generic gateway error: it is Deepgram giving up on a
   * file it could not finish inside its own window, which for an hour-long
   * recording is spent uploading. §32 wants the message to point at something
   * the user can act on.
   */
  it("explains a 504 as the provider's own time limit", () => {
    expect(messageForStatus(504)).toContain("10 minutes");
  });

  it("explains rate limiting as temporary", () => {
    expect(messageForStatus(429)).toContain("again");
  });

  it("names the status for anything else", () => {
    expect(messageForStatus(500)).toContain("500");
  });
});

describe("retryability", () => {
  it("does not offer a retry for an empty account", () => {
    // Retrying sends the same request against the same empty balance (§21).
    expect(new TranscriptionError("insufficient-credit", "…").retryable).toBe(
      false,
    );
  });

  it("still offers a retry for a transport failure", () => {
    expect(new TranscriptionError("provider-failed", "…").retryable).toBe(true);
  });
});
