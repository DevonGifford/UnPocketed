import { ScrollView, View } from "react-native";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";
import { mockRecordings } from "@/mocks/recordings";
import { formatDuration, formatRecordedAt } from "@/lib/format";

/**
 * One Transcript, read in full (§23).
 *
 * The designs also show an executive summary, an AI summary and speaker-
 * attributed turns. Those are §6 non-goals for v0.1 and are not scaffolded
 * here: unlike a navigation destination, inventing summary content would put
 * words on screen that no model produced. The transcript body is real.
 */
export function TranscriptDetailScreen({ transcriptId }: { transcriptId: string }) {
  const match = mockRecordings
    .flatMap((recording) =>
      recording.transcripts.map((transcript) => ({ recording, transcript })),
    )
    .find(({ transcript }) => transcript.id === transcriptId);

  if (!match) {
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

  const { recording, transcript } = match;

  return (
    <Screen>
      <AppHeader />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10">
        <HudFrame className="gap-1 px-4 py-5">
          <Text variant="headline" className="text-primary">
            {recording.title}
          </Text>
          <Text variant="caption">
            {transcript.providerId} ({transcript.modelId})
          </Text>
          <Text variant="caption" className="tabular-nums">
            {formatRecordedAt(recording.createdAt)} ·{" "}
            {formatDuration(recording.durationMs)}
          </Text>
        </HudFrame>

        <View className="gap-2 rounded-md border border-border p-4">
          <Text variant="body" className="text-primary">
            Transcript
          </Text>
          <Text variant="body">{transcript.text}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
