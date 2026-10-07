import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";
import { useLibrary } from "@/features/library";
import { useTranscripts } from "@/features/transcription";
import { describeProvider } from "@/providers/transcription";
import { formatRecordedAt } from "@/lib/format";

/**
 * Every Transcript across all Recordings (§10: a Recording owns many).
 *
 * Distinct from Recordings because the designs treat them as separate
 * destinations — a transcript is browsed and read, a recording is played.
 * PR7 moved this off fixtures; the titles come from the library, so a
 * transcript whose recording has been deleted still lists under a plain label
 * rather than disappearing without explanation.
 */
export function TranscriptsScreen() {
  const router = useRouter();
  const { transcripts } = useTranscripts();
  const { recordings } = useLibrary();

  const titleFor = (recordingId: string) =>
    recordings.find((recording) => recording.id === recordingId)?.title ??
    "Deleted recording";

  // The provider is fixed in v0.1; PR8 makes it a choice. Shown by name so the
  // header answers "who is transcribing for me" without opening Settings.
  const provider = describeProvider();

  return (
    <Screen>
      <AppHeader />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10">
        <HudFrame tone="accent" className="gap-1 px-4 py-5">
          <Text variant="title" className="text-primary">
            Transcripts
          </Text>
          <Text variant="caption">Search, browse, and manage your transcripts.</Text>
          <View className="mt-3 flex-row items-center gap-4 rounded-md border border-border p-3">
            <View className="flex-1">
              <Text variant="headline" className="text-primary">
                {transcripts.length}
              </Text>
              <Text variant="caption">
                {transcripts.length === 1 ? "Transcript" : "Transcripts"}
              </Text>
            </View>
            <View className="h-8 w-px bg-border" />
            <Pressable
              onPress={() => router.push("/settings")}
              accessibilityRole="button"
              accessibilityLabel="Transcription settings"
              className="flex-1 active:opacity-70"
            >
              <Text variant="headline">{provider?.name ?? "Not set"}</Text>
              <Text variant="caption">Provider</Text>
            </Pressable>
          </View>
        </HudFrame>

        {transcripts.length === 0 ? (
          <View className="items-center gap-2 px-8 py-20">
            <Text variant="headline">No transcripts yet</Text>
            <Text variant="subhead" className="text-center">
              Transcribe a recording and it will appear here.
            </Text>
          </View>
        ) : (
          transcripts.map((transcript) => (
            <Pressable
              key={transcript.id}
              onPress={() => router.push(`/transcripts/${transcript.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Transcript of ${titleFor(transcript.recordingId)}`}
              className="gap-1 rounded-md border border-border p-4 active:opacity-70"
            >
              <Text variant="headline" className="text-primary" numberOfLines={1}>
                {titleFor(transcript.recordingId)}
              </Text>
              {/* §20: which provider and model produced this, always. */}
              <Text variant="caption">
                {transcript.providerId} ({transcript.modelId}) ·{" "}
                {formatRecordedAt(transcript.createdAt)}
              </Text>
              <Text variant="caption" numberOfLines={2} className="mt-1">
                {transcript.text}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
