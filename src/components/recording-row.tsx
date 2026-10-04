import { Pressable, View } from "react-native";
import { Text } from "./text";
import { TranscriptionStatus } from "./transcription-status";
import { formatDuration, formatRecordedAt } from "@/lib/format";
import type { MockRecording } from "@/mocks/recordings";

/**
 * One library entry (§15). A grouped row separated by a hairline — not a card,
 * per §28's "no unnecessary cards inside cards inside cards".
 */
export function RecordingRow({
  recording,
  onPress,
}: {
  recording: MockRecording;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${recording.title}, ${formatDuration(recording.durationMs)}`}
      className="min-h-[64px] justify-center border-b border-line px-4 py-3 active:bg-surface"
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
          state={recording.transcriptionState}
          transcriptCount={recording.transcripts.length}
        />
      </View>
    </Pressable>
  );
}
