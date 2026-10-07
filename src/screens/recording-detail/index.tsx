import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import { formatDuration, formatRecordedAt } from "@/lib/format";
import { useRecording } from "@/features/library";
import type { TranscriptionState, Transcript } from "@/types";

/** A tappable text action. Destructive actions are never the easiest tap (§25). */
function Action({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress?: () => void;
  tone?: "default" | "destructive";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[44px] justify-center px-4 active:opacity-60"
    >
      <Text
        variant="body"
        className={tone === "destructive" ? "text-destructive" : ""}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function RecordingDetailScreen({ id }: { id: string }) {
  const { recording } = useRecording(id);
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(
    null,
  );

  /*
   * A Recording owns zero or more Transcripts (§10), but nothing produces one
   * until PR7 — there is no provider and no API key yet. The interface below is
   * built against the real shape and reads empty, rather than showing text no
   * model generated (§3.7).
   */
  const transcripts: Transcript[] = [];
  // Widened deliberately: §21's other states are rendered below and PR7 will
  // supply them, so narrowing to the literal would delete working interface.
  const transcriptionState = "not-transcribed" as TranscriptionState;

  if (!recording) {
    return (
      <Screen className="items-center justify-center">
        <Text variant="headline">Recording not found</Text>
      </Screen>
    );
  }

  const selected =
    transcripts.find((t) => t.id === selectedTranscriptId) ?? null;

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-10">
        {/* Metadata sits under the content, never above it (§28 hierarchy). */}
        <View className="gap-1 px-4 pb-4 pt-2">
          <Text variant="title">{recording.title}</Text>
          <Text variant="subhead">
            {formatDuration(recording.durationMs)} ·{" "}
            {formatRecordedAt(recording.createdAt)} ·{" "}
            {recording.source === "imported" ? "Imported" : "Recorded"}
          </Text>
        </View>

        {/* Playback (§16) — available whether or not a transcript exists. */}
        <View className="border-y border-border px-4 py-5">
          <View className="flex-row items-center justify-center gap-8">
            <Action label="−15s" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play recording"
              className="h-16 w-16 items-center justify-center rounded-full border border-border active:opacity-60"
            >
              <Text variant="headline">▶</Text>
            </Pressable>
            <Action label="+15s" />
          </View>
          <View className="mt-4 h-1 rounded-full bg-border">
            <View className="h-1 w-1/3 rounded-full bg-muted-foreground" />
          </View>
          <View className="mt-2 flex-row justify-between">
            <Text variant="caption" className="tabular-nums">
              {formatDuration(recording.durationMs / 3)}
            </Text>
            <Text variant="caption" className="tabular-nums">
              {formatDuration(recording.durationMs)}
            </Text>
          </View>
        </View>

        {/* Transcripts (§22, §23). Multiple coexist; retranscription is additive. */}
        <View className="px-4 pt-6">
          <Text variant="headline">Transcripts</Text>
        </View>

        {transcripts.length === 0 ? (
          <View className="gap-3 px-4 py-6">
            <Text variant="subhead">
              {transcriptionState === "transcribing"
                ? "Transcribing…"
                : transcriptionState === "failed"
                  ? "The last attempt failed. Your recording is safe on this device."
                  : "This recording has not been transcribed yet."}
            </Text>
            <View className="flex-row">
              <View className="rounded-md border border-border">
                <Action
                  label={
                    transcriptionState === "failed"
                      ? "Try again"
                      : "Transcribe"
                  }
                />
              </View>
            </View>
          </View>
        ) : (
          <>
            <View className="flex-row gap-2 px-4 py-3">
              {transcripts.map((t) => {
                const isSelected = t.id === selectedTranscriptId;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setSelectedTranscriptId(t.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${t.modelId} transcript`}
                    className={`min-h-[36px] justify-center rounded-full border px-3 ${
                      isSelected ? "border-foreground bg-card" : "border-border"
                    }`}
                  >
                    <Text variant="caption" className={isSelected ? "text-foreground" : ""}>
                      {t.modelId}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {selected ? (
              <View className="gap-4 px-4">
                {/* §20: a transcript must always say which provider and model made it. */}
                <Text variant="caption">
                  {selected.providerId} · {selected.modelId}
                </Text>
                <Text variant="body" selectable>
                  {selected.text}
                </Text>
              </View>
            ) : null}
          </>
        )}

        <View className="mt-8 border-t border-border">
          <Action label="Retranscribe with another model" />
          <Action label="Export transcript" />
          <Action label="Share original audio" />
          <Action label="Delete transcript" tone="destructive" />
          <Action label="Delete recording and all associated data" tone="destructive" />
        </View>
      </ScrollView>
    </Screen>
  );
}
