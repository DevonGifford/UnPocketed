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
  chooseModel,
  chooseProvider,
  currentSelection,
  deleteTranscript,
  transcriptLabel,
  shareRecordingAudio,
  shareTranscript,
  type ExportFormat,
  type ShareOutcome,
  deleteTranscriptsFor,
  listTranscriptionTargets,
  useRecordingTranscription,
  type TranscriptionTarget,
} from "@/features/transcription";
import { OptionPicker } from "@/components/option-picker";
import { ExportPicker } from "@/components/export-picker";
import { briefsFor } from "@/features/enrichment";
import { TranscriptBody, speakerSummary } from "@/components/transcript-body";
import { BusyIndicator } from "@/components/busy-indicator";
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
  const [retranscribing, setRetranscribing] = useState(false);
  const [targets, setTargets] = useState<TranscriptionTarget[]>([]);
  // Which target a plain Transcribe would use, read when the picker opens
  // rather than during render — see the note in Settings about hoisting.
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareFailure, setShareFailure] = useState<ShareOutcome | null>(null);

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

  /*
   * Opens the picker, then fills it in.
   *
   * The list is loaded on open rather than held in state, because readiness
   * depends on the keystore and a key can be added in Settings between visits.
   * The dialog opens first so the tap feels immediate; an empty list for a
   * frame is better than a tap that does nothing while a read completes.
   */
  const openRetranscribe = () => {
    setRetranscribing(true);

    const selection = currentSelection();
    setSelectedTarget(
      selection ? `${selection.providerId}/${selection.modelId}` : null,
    );

    void listTranscriptionTargets().then(setTargets);
  };

  /**
   * Starts a transcription with a chosen Provider and Model.
   *
   * The choice is **persisted** rather than passed through as a one-off
   * override, so Settings and this screen can never disagree about what the
   * next transcription will use. It is the same two writes Settings performs,
   * which is why no override parameter had to be threaded into
   * `transcribeRecording`.
   */
  const retranscribeWith = (target: TranscriptionTarget) => {
    setRetranscribing(false);
    try {
      chooseProvider(target.providerId);
      chooseModel(target.providerId, target.modelId);
    } catch {
      // The choice could not be stored, so transcribing now would silently use
      // the previous one and attribute the result to it. Settings reports the
      // same failure; stopping here is better than a transcript the user did
      // not ask for and will be billed for.
      return;
    }
    transcribe();
  };

  /*
   * Only a failure is surfaced. A share sheet that closes tells us nothing
   * about whether anything was sent — Android does not say — so a success
   * message would be a claim we cannot support (§3.7).
   */
  const report = (outcome: ShareOutcome) => {
    setShareFailure(outcome.status === "failed" ? outcome : null);
  };

  const exportTranscriptAs = (format: ExportFormat) => {
    setExporting(false);
    if (!selected) return;
    // Read at the moment of export rather than held: this screen lists
    // transcripts, and whichever is selected may have briefs it has never
    // shown.
    void shareTranscript(selected, recording, format, briefsFor(selected.id)).then(
      report,
    );
  };

  const shareAudio = () => {
    if (!recording) return;
    void shareRecordingAudio(recording).then(report);
  };

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
            {transcriptionState === "transcribing" ? (
              <BusyIndicator label="Transcribing…" />
            ) : null}
            <Text variant="subhead">
              {transcriptionState === "transcribing"
                ? "This can take a few minutes for a long recording. You can leave this screen — it keeps going."
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
                  {/* TODO(PR7 review): A saved failed job has no retryable flag.
                      Do not offer Try again for a bad key or an oversized file. */}
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
            {/*
              A retranscription with transcripts already on screen changed
              nothing but a button's label, so it read as a tap that did
              nothing. The existing transcripts stay visible and readable while
              the new one is produced — §22 makes it additive, so there is no
              reason to hide them.
            */}
            {transcriptionState === "transcribing" ? (
              <View className="px-4 pt-3">
                <BusyIndicator label="Transcribing…" />
              </View>
            ) : null}

            <View className="flex-row gap-2 px-4 py-3">
              {transcripts.map((t) => {
                const isSelected = t.id === selectedTranscriptId;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setSelectedTranscriptId(t.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${transcriptLabel(t)} transcript`}
                    className={`min-h-[36px] justify-center rounded-full border px-3 ${
                      isSelected ? "border-foreground bg-card" : "border-border"
                    }`}
                  >
                    <Text variant="caption" className={isSelected ? "text-foreground" : ""}>
                      {/*
                        Not `modelId` alone: that records origin, so a corrected
                        or edited copy carries the same one as the transcript it
                        came from and the two chips would be identical.
                      */}
                      {transcriptLabel(t)}
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
                  {speakerSummary(selected) ? ` · ${speakerSummary(selected)}` : ""}
                </Text>
                <TranscriptBody transcript={selected} />
              </View>
            ) : null}
          </>
        )}

        {/*
          §32: a technical failure becomes an explanation, and every message
          here says the recording is unaffected — §21 requires that to be true,
          and nothing in this feature writes to stored audio.
        */}
        {shareFailure?.status === "failed" ? (
          <View className="mx-4 mt-4 gap-2 rounded-md border border-border bg-card p-4">
            <Text variant="headline">{shareFailure.title}</Text>
            <Text variant="body">{shareFailure.detail}</Text>
            <View className="flex-row">
              <Action label="Dismiss" onPress={() => setShareFailure(null)} />
            </View>
          </View>
        ) : null}

        {transcriptionFailure ? (
          <View className="mx-4 mt-4 gap-2 rounded-md border border-border bg-card p-4">
            <Text variant="headline">{transcriptionFailure.title}</Text>
            <Text variant="body">{transcriptionFailure.detail}</Text>
            <View className="flex-row">
              <Action label="Dismiss" onPress={dismissTranscriptionFailure} />
              {transcriptionFailure.retryable &&
              transcriptionState !== "transcribing" ? (
                <Action label="Try again" onPress={transcribe} />
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="mt-8 border-t border-border">
          <Action label="Rename recording" onPress={() => setRenaming(true)} />
          {/*
            §22: retranscription is a first-class capability, so this is the
            control that makes provider choice verifiable rather than
            ideological — the user compares two transcripts of their own audio
            instead of taking our word for which recogniser is better. Hidden
            for an Interrupted Recording, whose audio no decoder can read.
          */}
          {recording.interrupted || transcripts.length === 0 ? null : (
            /*
             * Hidden until there is something to retranscribe *from*. The
             * action list renders in both branches of the empty-state ternary
             * above, so without this gate a never-transcribed recording offers
             * both "Transcribe" and "Retranscribe with another model" — and the
             * second label is simply untrue there. §22 is about producing an
             * additional transcript, which needs a first one to exist.
             */
            <Action
              label={
                transcriptionState === "transcribing"
                  ? "Transcribing…"
                  : "Retranscribe with another model"
              }
              onPress={
                transcriptionState === "transcribing" ? undefined : openRetranscribe
              }
            />
          )}
          {/* Needs a transcript to export; hidden rather than disabled. */}
          {selected ? (
            <Action
              label="Export transcript"
              onPress={() => setExporting(true)}
            />
          ) : null}
          {/*
            Offered for an Interrupted Recording too, and deliberately: its
            audio cannot be played here, so handing the raw file to a computer
            is the only remaining route to it and §3.4 makes that the user's
            right. The original is copied, never moved.
          */}
          <Action label="Share original audio" onPress={shareAudio} />
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

      <ExportPicker
        open={exporting}
        onOpenChange={setExporting}
        onSelect={exportTranscriptAs}
      />

      <OptionPicker
        open={retranscribing}
        onOpenChange={setRetranscribing}
        title="Transcribe with"
        description="This adds a transcript rather than replacing the ones you have, so you can compare them. Your recording is never changed."
        options={targets.map((target) => ({
          id: `${target.providerId}/${target.modelId}`,
          label: `${target.providerName} · ${target.modelName}`,
          detail: target.ready
            ? undefined
            : `Needs a ${target.providerName} API key in Settings`,
        }))}
        selectedId={selectedTarget}
        onSelect={(id) => {
          const target = targets.find(
            (candidate) => `${candidate.providerId}/${candidate.modelId}` === id,
          );
          if (target) retranscribeWith(target);
        }}
      />

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
           * TODO(PR7 review): Handle a failed audio delete after transcripts
           * are gone, and tell the user what was actually removed.
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
