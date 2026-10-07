import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import { formatDuration, formatRecordedAt } from "@/lib/format";
import {
  backfillDuration,
  deleteRecording,
  renameRecording,
  useRecording,
} from "@/features/library";
import { usePlayback } from "@/features/playback";
import { PlaybackControls } from "@/components/playback-controls";
import { RenameRecordingDialog } from "@/components/rename-recording-dialog";
import { DeleteRecordingDialog } from "@/components/delete-recording-dialog";
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
  const router = useRouter();
  const { recording, refresh } = useRecording(id);
  // Called before the early return below, and so unconditionally: the player
  // takes a null source until the recording is read.
  const playback = usePlayback(
    recording?.audioPath ?? null,
    recording?.durationMs ?? 0,
  );
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(
    null,
  );
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /*
   * A recording whose sidecar was lost has no stored duration, and decoding the
   * file is the only way to learn one. The player has just done that, so write
   * it down rather than re-deriving it on every visit.
   *
   * Attempted once per recording, tracked by ref rather than by the guard
   * below: `backfillDuration` swallows an index-write failure by design, so the
   * sidecar can be updated while the row still reads 0. `refresh` returns a new
   * object every call, which re-runs this effect, and the guard would pass
   * again — writing the sidecar on every render, forever.
   */
  const backfilledId = useRef<string | null>(null);
  const storedDurationMs = recording?.durationMs ?? 0;
  const playerDurationMs = playback.durationMs;
  useEffect(() => {
    if (!recording || storedDurationMs > 0 || playerDurationMs <= 0) return;
    if (backfilledId.current === recording.id) return;

    backfilledId.current = recording.id;
    backfillDuration(recording.id, playerDurationMs);
    refresh();
  }, [recording, storedDurationMs, playerDurationMs, refresh]);

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
            {formatDuration(playback.durationMs)} ·{" "}
            {formatRecordedAt(recording.createdAt)} ·{" "}
            {recording.source === "imported" ? "Imported" : "Recorded"}
          </Text>
        </View>

        {/* Playback (§16) — available whether or not a transcript exists. */}
        <PlaybackControls playback={playback} />

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
          <Action label="Rename recording" onPress={() => setRenaming(true)} />
          <Action label="Retranscribe with another model" />
          <Action label="Export transcript" />
          <Action label="Share original audio" />
          <Action label="Delete transcript" tone="destructive" />
          <Action
            label="Delete recording and all associated data"
            tone="destructive"
            onPress={() => setDeleting(true)}
          />
        </View>
      </ScrollView>

      <RenameRecordingDialog
        open={renaming}
        onOpenChange={setRenaming}
        currentTitle={recording.title}
        onRename={(title) => {
          setRenaming(false);
          renameRecording(recording.id, title);
          refresh();
        }}
      />

      <DeleteRecordingDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={recording.title}
        transcriptCount={transcripts.length}
        onConfirm={() => {
          setDeleting(false);
          // The player is holding the file open; let it go before the delete
          // rather than relying on unmount happening first.
          if (playback.isPlaying) playback.toggle();
          deleteRecording(recording.id);
          /*
           * The screen is showing a recording that no longer exists. Back is a
           * no-op when this screen was the entry point — a deep link, or a
           * restored route on a cold start — so fall back to the library.
           */
          if (router.canGoBack()) router.back();
          else router.replace("/recordings");
        }}
      />
    </Screen>
  );
}
