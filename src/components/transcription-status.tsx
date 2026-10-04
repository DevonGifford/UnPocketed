import { Text } from "@/components/ui/text";
import type { TranscriptionState } from "@/types";
import { formatTranscriptCount } from "@/lib/format";

/**
 * §21's four states. Each is distinguished by its words, never by colour alone
 * (§31) — the only coloured case is failure, and it still reads as "Failed".
 */
export function TranscriptionStatus({
  state,
  transcriptCount,
}: {
  state: TranscriptionState;
  transcriptCount: number;
}) {
  if (state === "failed") {
    return (
      <Text variant="caption" className="text-destructive">
        Transcription failed
      </Text>
    );
  }

  const label =
    state === "transcribing"
      ? "Transcribing…"
      : formatTranscriptCount(transcriptCount);

  return <Text variant="caption">{label}</Text>;
}
