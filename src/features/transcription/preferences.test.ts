import {
  diarizeEnabled,
  effectiveSelection,
  type TranscriptionPreferences,
} from "./preferences";
import type { ProviderDescriptor } from "@/providers/transcription";

const descriptor = (
  id: string,
  models: string[],
  defaultModelId: string,
): ProviderDescriptor => ({
  id,
  name: id,
  keyUrl: `https://example.test/${id}`,
  retentionNotice: "…",
  requiresApiKey: true,
  diarizationNotice: null,
  models: models.map((model) => ({ id: model, name: model })),
  defaultModelId,
});

const assemblyai = descriptor(
  "assemblyai",
  ["universal-2", "universal-3-5-pro"],
  "universal-2",
);
const deepgram = descriptor("deepgram", ["nova-3", "nova-2"], "nova-3");
const providers = [assemblyai, deepgram];

const preferences = (
  overrides: Partial<TranscriptionPreferences> = {},
): TranscriptionPreferences => ({
  providerId: null,
  modelByProvider: {},
  diarize: null,
  ...overrides,
});

describe("diarizeEnabled", () => {
  it("is on when the user has never chosen", () => {
    // Both providers v0.1 ships support it, and a conversation transcript that
    // cannot say who spoke is the problem the setting exists to avoid.
    expect(diarizeEnabled(preferences())).toBe(true);
  });

  it("honours an explicit choice either way", () => {
    expect(diarizeEnabled(preferences({ diarize: false }))).toBe(false);
    expect(diarizeEnabled(preferences({ diarize: true }))).toBe(true);
  });
});

describe("effectiveSelection", () => {
  it("falls back to the shipped default when nothing is chosen", () => {
    expect(effectiveSelection(preferences(), providers)).toEqual({
      providerId: "assemblyai",
      modelId: "universal-2",
    });
  });

  it("honours a chosen provider and its default model", () => {
    expect(
      effectiveSelection(preferences({ providerId: "deepgram" }), providers),
    ).toEqual({ providerId: "deepgram", modelId: "nova-3" });
  });

  it("honours a chosen model", () => {
    const chosen = preferences({
      providerId: "assemblyai",
      modelByProvider: { assemblyai: "universal-3-5-pro" },
    });
    expect(effectiveSelection(chosen, providers)).toEqual({
      providerId: "assemblyai",
      modelId: "universal-3-5-pro",
    });
  });

  it("keeps each provider's model choice independent", () => {
    const chosen = preferences({
      providerId: "deepgram",
      modelByProvider: { assemblyai: "universal-3-5-pro", deepgram: "nova-2" },
    });
    expect(effectiveSelection(chosen, providers)).toEqual({
      providerId: "deepgram",
      modelId: "nova-2",
    });

    // Switching back restores the other provider's choice rather than resetting
    // it — comparing two providers means going back and forth (§22).
    expect(
      effectiveSelection({ ...chosen, providerId: "assemblyai" }, providers),
    ).toEqual({ providerId: "assemblyai", modelId: "universal-3-5-pro" });
  });

  it("falls back to the default provider when the stored one is gone", () => {
    const chosen = preferences({ providerId: "a-provider-we-removed" });
    expect(effectiveSelection(chosen, providers)).toEqual({
      providerId: "assemblyai",
      modelId: "universal-2",
    });
  });

  /*
   * The case that motivated validating at all: AssemblyAI's model list changed
   * under us during PR7. A stored id the provider no longer offers would
   * otherwise be sent on every request and rejected as an opaque 4xx forever.
   */
  it("falls back to the default model when the stored one is gone", () => {
    const chosen = preferences({
      providerId: "assemblyai",
      modelByProvider: { assemblyai: "a-model-they-retired" },
    });
    expect(effectiveSelection(chosen, providers)).toEqual({
      providerId: "assemblyai",
      modelId: "universal-2",
    });
  });

  it("uses the first provider when the default is not registered", () => {
    expect(effectiveSelection(preferences(), [deepgram])).toEqual({
      providerId: "deepgram",
      modelId: "nova-3",
    });
  });

  it("is null with no providers at all", () => {
    expect(effectiveSelection(preferences(), [])).toBeNull();
  });
});
