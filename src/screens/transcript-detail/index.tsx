import { ScrollView, View } from "react-native";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";
import { TranscriptBody, speakerSummary } from "@/components/transcript-body";
import { useRecording } from "@/features/library";
import { useTranscript } from "@/features/transcription";
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
          {/* §20: a transcript must always say which provider and model made it. */}
          <Text variant="caption">
            {transcript.providerId} ({transcript.modelId})
          </Text>
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
      </ScrollView>
    </Screen>
  );
}
