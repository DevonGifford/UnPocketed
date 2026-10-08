import { View } from "react-native";

import { Text } from "@/components/ui/text";
import {
  groupedTurns,
  readingViewFor,
  speakerLabel,
} from "@/features/transcription/reading";
import { speakerCount } from "@/providers/transcription/speakers";
import { formatDuration } from "@/lib/format";
import type { Transcript } from "@/types";

/**
 * A Transcript's words, speaker-attributed where the Provider said who spoke.
 *
 * Carries no rules of its own: `readingViewFor` decides whether turns can stand
 * in for the text, and this renders whichever answer it gives. That split is
 * deliberate — the decision has consequences (turns that do not cover the text
 * would hide words the user paid for) and belongs somewhere it can be tested.
 *
 * Speaker labels are `Speaker 1`, `Speaker 2` — never names. §10 makes the
 * index a label inside this Transcript only, and a name would claim an identity
 * the Provider never established.
 */
export function TranscriptBody({ transcript }: { transcript: Transcript }) {
  const view = readingViewFor(transcript);

  if (view.kind === "text") {
    return (
      <Text variant="body" selectable>
        {view.text}
      </Text>
    );
  }

  /*
   * Grouped by `groupedTurns`, the same function the exports use. It used to be
   * done here with a `continues` flag, which meant the screen read as a
   * conversation while an exported file repeated "Speaker 2" three times for
   * one person — the same data following two different rules.
   */
  return (
    <View className="gap-4">
      {groupedTurns(view.segments).map((block, index) => (
        <View key={`${block.startMs}-${index}`} className="gap-1">
          <View className="flex-row items-baseline gap-2">
            <Text
              variant="caption"
              className={block.speaker === null ? "" : "text-primary"}
            >
              {speakerLabel(block.speaker)}
            </Text>
            <Text variant="caption" className="tabular-nums">
              {formatDuration(block.startMs)}
            </Text>
          </View>
          <Text variant="body" selectable>
            {block.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A one-line summary of who is in a Transcript, for a header.
 *
 * @returns Text such as "2 speakers", or null where there is nothing to say —
 * which includes the single-speaker case, since labelling one speaker adds no
 * information, and the case where the turns were not trusted to stand in for
 * the text.
 */
export function speakerSummary(transcript: Transcript): string | null {
  if (readingViewFor(transcript).kind !== "turns") return null;
  const count = speakerCount(transcript.segments);
  return count >= 2 ? `${count} speakers` : null;
}
