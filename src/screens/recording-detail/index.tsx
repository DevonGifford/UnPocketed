import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import {
  formatApproximateDuration,
  formatDuration,
  formatRecordedAt,
} from "@/lib/format";
import {
  backfillDuration,
  deleteRecording,
  renameRecording,
  useRecording,
} from "@/features/library";
import { usePlayback } from "@/features/playback";
import {
  deleteTranscript,
  deleteTranscriptsFor,
  useRecordingTranscription,
} from "@/features/transcription";
import { PlaybackControls } from "@/components/playback-controls";
import { InterruptedNotice } from "@/components/interrupted-notice";
import { RenameRecordingDialog } from "@/components/rename-recording-dialog";
import { DeleteRecordingDialog } from "@/components/delete-recording-dialog";
import { DeleteTranscriptDialog } from "@/components/delete-transcript-dialog";

/** How far a stored duration may sit from the player's before it is rewritten. */
const DURATION_DRIFT_MS = 1_000;

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
    // An interrupted recording cannot be opened, so the player is never given
    // it — loading it would only fail, and its stored duration is the estimate.
    recording && !recording.interrupted ? recording.audioPath : null,
    recording?.durationMs ?? 0,
  );
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(
    null,
  );
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingTranscript, setDeletingTranscript] = useState(false);

  /*
   * A recovered recording's stored duration is estimated from its file size,
   * because only the player can measure one. It has just done that, so write
   * the real value down rather than re-deriving it on every visit.
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
    if (!recording || recording.interrupted) return;
    if (playerDurationMs <= 0) return;
    // A measured duration agrees with itself, so only an estimate differs by
    // enough to be worth a write.
    if (Math.abs(playerDurationMs - storedDurationMs) < DURATION_DRIFT_MS) return;
    if (backfilledId.current === recording.id) return;

    backfilledId.current = recording.id;
    backfillDuration(recording.id, playerDurationMs);
    refresh();
  }, [recording, storedDurationMs, playerDurationMs, refresh]);

  /*
   * A Recording owns zero or more Transcripts (§10). PR7 made these real: the
   * state is derived from whether a job is outstanding and how many transcripts
   * exist, so nothing here stores a fourth copy of §21's four states.
   */
  const {
    transcripts,
    state: transcriptionState,
    busy: transcribing,
    failure: transcriptionFailure,
    transcribe,
    dismissFailure: dismissTranscriptionFailure,
    refresh: refreshTranscription,
  } = useRecordingTranscription(recording?.id ?? null);

  if (!recording) {
    return (
      <Screen className="items-center justify-center">
        <Text variant="headline">Recording not found</Text>
      </Screen>
    );
  }

  // Falls back to the newest: with real transcripts, showing none until one is
  // tapped would read as an empty transcript rather than as a chooser.
  const selected =
    transcripts.find((t) => t.id === selectedTranscriptId) ?? transcripts[0] ?? null;

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-10">
        {/* Metadata sits under the content, never above it (§28 hierarchy). */}
        <View className="gap-1 px-4 pb-4 pt-2">
          <Text variant="title">{recording.title}</Text>
          <Text variant="subhead">
            {recording.interrupted
              ? formatApproximateDuration(recording.durationMs)
              : formatDuration(playback.durationMs)}{" "}
            ·{" "}
            {formatRecordedAt(recording.createdAt)} ·{" "}
            {recording.source === "imported" ? "Imported" : "Recorded"}
          </Text>
        </View>

        {/*
          Playback (§16) — available whether or not a transcript exists, and
          absent only for an interrupted recording, which §16 now excepts.
        */}
        {recording.interrupted ? (
          <InterruptedNotice />
        ) : (
          <PlaybackControls playback={playback} />
        )}

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
                  : recording.interrupted
                    ? "An interrupted recording has no index, so no transcription service can read it."
                    : "This recording has not been transcribed yet."}
            </Text>
            {/*
              §21: a failed transcription is retryable, but only where retrying
              could work — `retryable` is false for a missing key or an
              interrupted recording, where the button would just fail again.
            */}
            {recording.interrupted ? null : (
              <View className="flex-row">
                <View className="rounded-md border border-border">
                  <Action
                    label={
                      transcriptionState === "transcribing"
                        ? "Transcribing…"
                        : transcriptionState === "failed"
                          ? "Try again"
                          : "Transcribe"
                    }
                    onPress={
                      transcriptionState === "transcribing" ? undefined : transcribe
                    }
                  />
                </View>
              </View>
            )}
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

        {/*
          §32: a technical failure becomes an explanation, and every message
          here says the recording is unaffected — §21 requires that to be true,
          and nothing in this feature writes to stored audio.
        */}
        {transcriptionFailure ? (
          <View className="mx-4 mt-4 gap-2 rounded-md border border-border bg-card p-4">
            <Text variant="headline">{transcriptionFailure.title}</Text>
            <Text variant="body">{transcriptionFailure.detail}</Text>
            <View className="flex-row">
              <Action label="Dismiss" onPress={dismissTranscriptionFailure} />
              {transcriptionFailure.retryable && !transcribing ? (
                <Action label="Try again" onPress={transcribe} />
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="mt-8 border-t border-border">
          <Action label="Rename recording" onPress={() => setRenaming(true)} />
          <Action label="Retranscribe with another model" />
          <Action label="Export transcript" />
          <Action label="Share original audio" />
          {selected ? (
            <Action
              label="Delete transcript"
              tone="destructive"
              onPress={() => setDeletingTranscript(true)}
            />
          ) : null}
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

      <DeleteTranscriptDialog
        open={deletingTranscript}
        onOpenChange={setDeletingTranscript}
        modelId={selected?.modelId ?? ""}
        onConfirm={() => {
          setDeletingTranscript(false);
          if (!selected) return;
          deleteTranscript(selected.id);
          // The selection points at a transcript that no longer exists; clear
          // it so the fallback picks whichever is now newest.
          setSelectedTranscriptId(null);
          refreshTranscription();
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
          /*
           * Transcripts go first and explicitly. The schema has no
           * ON DELETE CASCADE on purpose — a cascade would let an index repair
           * destroy them — so this is the one path that removes transcripts the
           * user did not name individually, and §25 has just warned them.
           */
          deleteTranscriptsFor(recording.id);
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
