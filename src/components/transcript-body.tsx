import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { speakerCount } from "@/providers/transcription/speakers";
import { formatDuration } from "@/lib/format";
import type { Transcript } from "@/types";

/**
 * A Transcript's words, speaker-attributed where the Provider said who spoke.
 *
 * Three cases, and the middle one is the easy mistake. A Transcript with no
 * segments renders as plain text; one with **several** speakers renders as
 * turns; and one with a single speaker throughout renders as plain text too,
 * because labelling every line "Speaker 1" adds noise and no information.
 *
 * Speaker labels are deliberately `Speaker 1`, `Speaker 2` — not names. §10
 * makes the index a label inside this Transcript only, and a name would claim
 * an identity the Provider never established.
 */
export function TranscriptBody({ transcript }: { transcript: Transcript }) {
  const segments = transcript.segments;

  if (!segments?.length || speakerCount(segments) < 2) {
    return (
      <Text variant="body" selectable>
        {transcript.text}
      </Text>
    );
  }

  return (
    <View className="gap-4">
      {segments.map((segment, index) => {
        // Consecutive turns by one speaker are grouped under a single heading,
        // which is how a conversation reads rather than how a provider chunks
        // it — some emit a new utterance per sentence.
        const continues =
          index > 0 && segments[index - 1].speaker === segment.speaker;

        return (
          <View
            key={`${segment.startMs}-${index}`}
            className={continues ? "-mt-3 gap-1" : "gap-1"}
          >
            {continues ? null : (
              <View className="flex-row items-baseline gap-2">
                <Text variant="caption" className="text-primary">
                  {`Speaker ${segment.speaker + 1}`}
                </Text>
                <Text variant="caption" className="tabular-nums">
                  {formatDuration(segment.startMs)}
                </Text>
              </View>
            )}
            <Text variant="body" selectable>
              {segment.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A one-line summary of who is in a Transcript, for a header.
 *
 * @returns Text such as "2 speakers", or null where there is nothing to say —
 * which includes the single-speaker case, for the reason above.
 */
export function speakerSummary(transcript: Transcript): string | null {
  const count = speakerCount(transcript.segments);
  return count >= 2 ? `${count} speakers` : null;
}
