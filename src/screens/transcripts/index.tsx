import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";
import { mockRecordings } from "@/mocks/recordings";
import { formatRecordedAt } from "@/lib/format";

/**
 * Every Transcript across all Recordings (§10: a Recording owns many).
 *
 * Distinct from Recordings because the designs treat them as separate
 * destinations — a transcript is browsed and read, a recording is played. The
 * provider summary in the header is scaffolding: provider configuration is §19
 * and is not wired up yet.
 */
export function TranscriptsScreen() {
  const router = useRouter();
  const rows = mockRecordings.flatMap((recording) =>
    recording.transcripts.map((transcript) => ({ recording, transcript })),
  );

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
                {rows.length}
              </Text>
              <Text variant="caption">Transcripts</Text>
            </View>
            <View className="h-8 w-px bg-border" />
            <View className="flex-1">
              <Text variant="headline">Not set</Text>
              <Text variant="caption">No provider configured</Text>
            </View>
          </View>
        </HudFrame>

        {rows.length === 0 ? (
          <View className="items-center gap-2 px-8 py-20">
            <Text variant="headline">No transcripts yet</Text>
            <Text variant="subhead" className="text-center">
              Transcribe a recording and it will appear here.
            </Text>
          </View>
        ) : (
          rows.map(({ recording, transcript }) => (
            <Pressable
              key={transcript.id}
              onPress={() => router.push(`/transcripts/${transcript.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Transcript of ${recording.title}`}
              className="gap-1 rounded-md border border-border p-4 active:opacity-70"
            >
              <Text variant="headline" className="text-primary" numberOfLines={1}>
                {recording.title}
              </Text>
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
