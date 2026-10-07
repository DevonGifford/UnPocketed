import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { TranscriptionStatus } from "./transcription-status";
import { formatDuration, formatRecordedAt } from "@/lib/format";
import type { Recording, TranscriptionState } from "@/types";

/**
 * One library entry (§15). A grouped row separated by a hairline — not a card,
 * per §28's "no unnecessary cards inside cards inside cards".
 *
 * The transcript props default to "nothing yet" because no Recording carries
 * transcripts until PR7; the row renders §21's states already so that PR7 is a
 * change of caller, not of component.
 */
export function RecordingRow({
  recording,
  transcriptionState = "not-transcribed",
  transcriptCount = 0,
  onPress,
}: {
  recording: Recording;
  transcriptionState?: TranscriptionState;
  transcriptCount?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${recording.title}, ${formatDuration(recording.durationMs)}`}
      className="min-h-[64px] justify-center border-b border-border px-4 py-3 active:bg-card"
    >
      <Text variant="headline" numberOfLines={1}>
        {recording.title}
      </Text>
      <View className="mt-1 flex-row items-center gap-2">
        <Text variant="caption" className="tabular-nums">
          {formatDuration(recording.durationMs)}
        </Text>
        <Text variant="caption">·</Text>
        <Text variant="caption">{formatRecordedAt(recording.createdAt)}</Text>
        <Text variant="caption">·</Text>
        <TranscriptionStatus
          state={transcriptionState}
          transcriptCount={transcriptCount}
        />
      </View>
    </Pressable>
  );
}
