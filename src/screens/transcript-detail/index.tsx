import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";
import { TranscriptBody, speakerSummary } from "@/components/transcript-body";
import { useRecording } from "@/features/library";
import { isProviderOutput, useTranscript } from "@/features/transcription";
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

        <View className="gap-2 rounded-md border border-border p-4">
          <Text variant="body" className="text-primary">
            Transcript
          </Text>
          <TranscriptBody transcript={transcript} />
        </View>

        <View className="flex-row">
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
    </Screen>
  );
}
