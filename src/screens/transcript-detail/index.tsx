import { Pressable, ScrollView, View } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { setStringAsync } from "expo-clipboard";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";
import { TranscriptBody, speakerSummary } from "@/components/transcript-body";
import { useRecording } from "@/features/library";
import {
  isProviderOutput,
  shareTranscript,
  transcriptAsText,
  useTranscript,
  type ExportFormat,
  type ShareOutcome,
} from "@/features/transcription";
import { ExportPicker } from "@/components/export-picker";
import { BriefView } from "@/components/brief-view";
import { BusyIndicator } from "@/components/busy-indicator";
import { useTranscriptEnrichment } from "@/features/enrichment";
import { formatDuration, formatRecordedAt } from "@/lib/format";

/**
 * One Transcript, read in full (§23).
 *
 * Speaker-attributed turns are real now, and come from the Provider's own
 * diarization rather than being inferred (§10). The designs also show an
 * executive summary and an AI summary; those remain §6 non-goals for v0.1 and
 * are still not scaffolded, because unlike a navigation destination, inventing
 * summary content would put words on screen that no model produced.
 *
 * §23's reading and selecting are here; editing, copying and exporting are
 * PR9. The text is `selectable` so the platform's own copy already works.
 */
export function TranscriptDetailScreen({ transcriptId }: { transcriptId: string }) {
  const router = useRouter();
  const { transcript } = useTranscript(transcriptId);
  /*
   * Called before the early return below, and so unconditionally: the hook
   * takes a null transcript until one is read.
   */
  const {
    briefs,
    busy: writingBrief,
    failure: briefFailure,
    enrich,
    dismissFailure: dismissBriefFailure,
  } = useTranscriptEnrichment(transcript);

  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<ShareOutcome | null>(null);
  // Called unconditionally: the hook takes an id that may match nothing.
  const { recording } = useRecording(transcript?.recordingId ?? "");

  if (!transcript) {
    return (
      <Screen>
        <AppHeader />
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text variant="headline">Transcript not found</Text>
          <Text variant="subhead" className="text-center">
            It may have been deleted. The recording it came from is unaffected.
          </Text>
        </View>
      </Screen>
    );
  }

  const speakers = speakerSummary(transcript);

  return (
    <Screen>
      <AppHeader />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10">
        <HudFrame className="gap-1 px-4 py-5">
          <Text variant="headline" className="text-primary">
            {/*
              A transcript outlives nothing — §25 keeps the recording when a
              transcript is deleted, not the reverse — but the library index can
              lag a scan, so the title falls back rather than rendering blank.
            */}
            {recording?.title ?? "Deleted recording"}
          </Text>
          {/*
            §20, both halves. The provider and model record where this text
            came from **originally** and stay true after an edit; the line below
            says who wrote what is actually here now. Without the second, an
            edited transcript would still claim a model produced words it never
            produced.
          */}
          <Text variant="caption">
            {transcript.providerId} ({transcript.modelId})
          </Text>
          {isProviderOutput(transcript) ? null : (
            <Text variant="caption" className="text-primary">
              {transcript.source?.kind === "llm"
                ? `Rewritten by ${transcript.source.providerId}`
                : "Edited by you"}
            </Text>
          )}
          <Text variant="caption" className="tabular-nums">
            {formatRecordedAt(transcript.createdAt)}
            {recording ? ` · ${formatDuration(recording.durationMs)}` : ""}
            {speakers ? ` · ${speakers}` : ""}
          </Text>
        </HudFrame>

        {/*
          Briefs sit **above** the transcript and never in place of it (§23).
          The reader must always be able to reach what the recogniser actually
          returned, however good the summary above it looks.
        */}
        {writingBrief ? <BusyIndicator label="Writing a brief…" /> : null}

        {briefFailure ? (
          <View className="gap-2 rounded-md border border-border bg-card p-4">
            <Text variant="headline">{briefFailure.title}</Text>
            <Text variant="body">{briefFailure.detail}</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={dismissBriefFailure}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                className="min-h-[44px] justify-center rounded-md border border-border px-4 active:opacity-60"
              >
                <Text variant="body">Dismiss</Text>
              </Pressable>
              {briefFailure.retryable && !writingBrief ? (
                <Pressable
                  onPress={enrich}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  className="min-h-[44px] justify-center rounded-md border border-border px-4 active:opacity-60"
                >
                  <Text variant="body">Try again</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/*
          Several Briefs means several models over one transcript — §22's
          comparison, a layer down. Each says which model wrote it, so they can
          be told apart rather than blurring into one opinion.
        */}
        {briefs.map((brief) => (
          <BriefView key={brief.id} brief={brief} />
        ))}

        <View className="gap-2 rounded-md border border-border p-4">
          <Text variant="body" className="text-primary">
            Transcript
          </Text>
          <TranscriptBody transcript={transcript} />
        </View>

        {failure?.status === "failed" ? (
          <View className="gap-1 rounded-md border border-border bg-card p-4">
            <Text variant="headline">{failure.title}</Text>
            <Text variant="body">{failure.detail}</Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          <Pressable
            onPress={() => router.push(`/transcripts/${transcript.id}/edit`)}
            accessibilityRole="button"
            accessibilityLabel="Edit transcript"
            className="min-h-[44px] justify-center rounded-md border border-border px-4 active:opacity-60"
          >
            <Text variant="body">
              {isProviderOutput(transcript) ? "Edit a copy" : "Edit"}
            </Text>
          </Pressable>

          {/*
            §5 item 13 pairs copying with editing, and the text being
            `selectable` only covers someone who knows to long-press. Copies the
            words alone — pasting a transcript into a message should not paste a
            provider name with it.
          */}
          <Pressable
            onPress={() => {
              setFailure(null);
              void setStringAsync(transcriptAsText(transcript))
                .then(() => setCopied(true))
                .catch(() =>
                  setFailure({
                    status: "failed",
                    title: "That could not be copied",
                    detail:
                      "Android would not accept the text. You can still select it above and copy by hand.",
                  }),
                );
            }}
            accessibilityRole="button"
            accessibilityLabel="Copy transcript"
            className="min-h-[44px] justify-center rounded-md border border-border px-4 active:opacity-60"
          >
            <Text variant="body">{copied ? "Copied" : "Copy"}</Text>
          </Pressable>

          <Pressable
            onPress={() => setExporting(true)}
            accessibilityRole="button"
            accessibilityLabel="Export transcript"
            className="min-h-[44px] justify-center rounded-md border border-border px-4 active:opacity-60"
          >
            <Text variant="body">Export</Text>
          </Pressable>

          {/*
            On demand, never automatic. It spends the user's own money, and a
            Brief is regenerable from text already here — so there is nothing
            to gain by running it unasked and a bill to pay for doing so.
            Re-running the same model replaces its Brief; a different model adds
            one beside it, which is what makes two comparable.
          */}
          <Pressable
            onPress={writingBrief ? undefined : enrich}
            accessibilityRole="button"
            accessibilityLabel={
              briefs.length > 0 ? "Write another brief" : "Write a brief"
            }
            className="min-h-[44px] justify-center rounded-md border border-border px-4 active:opacity-60"
          >
            <Text variant="body">
              {writingBrief
                ? "Writing…"
                : briefs.length > 0
                  ? "Another brief"
                  : "Write a brief"}
            </Text>
          </Pressable>
        </View>

        {/*
          Said once, where the decision is made. "Edit a copy" is not a safety
          rail bolted on — it is what editing *is* here, and the label should
          not let anyone believe they are about to overwrite the model's words.
        */}
        {isProviderOutput(transcript) ? (
          <Text variant="caption">
            Editing stores your version separately. This transcript stays
            exactly as {transcript.providerId} produced it.
          </Text>
        ) : null}
      </ScrollView>

      <ExportPicker
        open={exporting}
        onOpenChange={setExporting}
        onSelect={(format: ExportFormat) => {
          setExporting(false);
          setFailure(null);
          void shareTranscript(transcript, recording ?? null, format).then(
            (outcome) => setFailure(outcome.status === "failed" ? outcome : null),
          );
        }}
      />
    </Screen>
  );
}
